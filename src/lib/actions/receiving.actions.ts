"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { ReceivingInspectionResult } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type CreateReceivingInspectionInput = {
  purchaseOrderItemId: string
  purchaseOrderId: string
  warehouseId: string          // 사용자가 명시적으로 선택한 창고
  siteId: string               // PO의 사이트 (서버 검증용)
  inspectorId?: string
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  result: ReceivingInspectionResult
  note?: string
  lotNo?: string               // 입력 시 해당 LOT 사용, 미입력 + isLotTracked 시 자동생성
  // 하위 호환용 (무시됨)
  tenantId?: string
}

/** 특정 사이트에 속한 창고 목록 조회 (다이얼로그 창고 선택용) */
export async function getWarehousesForSite(siteId: string) {
  const tenantId = await getTenantId()
  return prisma.warehouse.findMany({
    where: { siteId, tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  })
}

/** 원자재 LOT 번호 자동생성 헬퍼 (LOT-YYYYMMDD-NNN 형식)
 * 나중에 고객사별 규칙으로 교체 가능하도록 독립 함수로 분리.
 * 주의: 동시 입고 시 동일 번호 가능성 있음 → 후속 lock 보완 필요.
 */
export async function generateReceivingLotNo(tenantId: string): Promise<string> {
  const today = new Date()
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "")
  const prefix = `LOT-${yyyymmdd}-`
  const count = await prisma.lot.count({
    where: { tenantId, lotNo: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(3, "0")}`
}

async function generateTxNo(tenantId: string): Promise<string> {
  const now = new Date()
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "")
  const prefix = `RCV-${ymd}-`
  const last = await prisma.inventoryTransaction.findFirst({
    where: { tenantId, txNo: { startsWith: prefix } },
    orderBy: { txNo: "desc" },
    select: { txNo: true },
  })
  const seq = last ? (parseInt(last.txNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(4, "0")}`
}

export async function createReceivingInspection(data: CreateReceivingInspectionInput) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  // ── 1. 창고 존재 및 테넌트 소속 확인 ──────────────────────────────────────
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: data.warehouseId, tenantId },
  })
  if (!warehouse) {
    throw new Error("선택한 창고를 찾을 수 없습니다.")
  }

  // ── 2. PO 품목 조회 (isLotTracked 포함) 및 사이트-창고 정합성 검증 ────────
  const purchaseOrderItem = await prisma.purchaseOrderItem.findUniqueOrThrow({
    where: { id: data.purchaseOrderItemId },
    include: {
      purchaseOrder: { select: { siteId: true } },
      item: { select: { isLotTracked: true } },
    },
  })

  const poSiteId = purchaseOrderItem.purchaseOrder.siteId
  if (warehouse.siteId !== poSiteId) {
    throw new Error(
      `입고 창고의 사이트가 발주 사이트와 다릅니다. ` +
      `창고는 반드시 발주의 사이트에 속해야 합니다.`
    )
  }

  const isLotTracked = purchaseOrderItem.item.isLotTracked ?? false

  // ── 3. LOT 번호 결정 ───────────────────────────────────────────────────────
  // isLotTracked=false → 입력값 무시, 항상 null (비LOT 출고 흐름 보존)
  // isLotTracked=true  → 사용자 입력 우선, 미입력 시 자동생성
  let resolvedLotNo: string | null = null
  if (isLotTracked) {
    resolvedLotNo = data.lotNo?.trim() || await generateReceivingLotNo(tenantId)
  }

  // txNo 사전 생성 (트랜잭션 외부 - 기존 패턴 유지)
  const txNo = data.acceptedQty > 0 ? await generateTxNo(tenantId) : null

  // ── 4. 트랜잭션 처리 ───────────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 4-1. LOT 조회 또는 생성
    let lotId: string | null = null
    if (resolvedLotNo) {
      const existingLot = await tx.lot.findFirst({
        where: { tenantId, lotNo: resolvedLotNo },
      })
      if (existingLot) {
        if (existingLot.itemId !== purchaseOrderItem.itemId) {
          throw new Error(
            `LOT 번호 '${resolvedLotNo}'는 다른 품목에 이미 사용 중입니다. 다른 번호를 입력해주세요.`
          )
        }
        lotId = existingLot.id
      } else {
        const newLot = await tx.lot.create({
          data: {
            tenantId,
            itemId: purchaseOrderItem.itemId,
            lotNo: resolvedLotNo,
            status: "ACTIVE",
            manufactureDate: new Date(),
          },
        })
        lotId = newLot.id
      }
    }

    // 4-2. ReceivingInspection 생성
    await tx.receivingInspection.create({
      data: {
        purchaseOrderItemId: data.purchaseOrderItemId,
        inspectorId: data.inspectorId ?? null,
        receivedQty: data.receivedQty,
        acceptedQty: data.acceptedQty,
        rejectedQty: data.rejectedQty,
        result: data.result,
        note: data.note,
      },
    })

    // 4-3. PurchaseOrderItem.receivedQty 갱신
    await tx.purchaseOrderItem.update({
      where: { id: data.purchaseOrderItemId },
      data: { receivedQty: { increment: data.acceptedQty } },
    })

    // 4-4. InventoryBalance 갱신 (합격 수량만)
    if (data.acceptedQty > 0) {
      const existingBalance = await tx.inventoryBalance.findFirst({
        where: {
          tenantId,
          itemId: purchaseOrderItem.itemId,
          warehouseId: warehouse.id,
          lotId,
        },
      })
      if (existingBalance) {
        await tx.inventoryBalance.update({
          where: { id: existingBalance.id },
          data: {
            qtyOnHand: { increment: data.acceptedQty },
            qtyAvailable: { increment: data.acceptedQty },
          },
        })
      } else {
        await tx.inventoryBalance.create({
          data: {
            tenantId,
            siteId: warehouse.siteId,
            itemId: purchaseOrderItem.itemId,
            warehouseId: warehouse.id,
            lotId,
            qtyOnHand: data.acceptedQty,
            qtyAvailable: data.acceptedQty,
            qtyHold: 0,
          },
        })
      }

      // 4-5. InventoryTransaction 생성
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: purchaseOrderItem.itemId,
          lotId,
          toLocationId: warehouse.id,
          txNo: txNo!,
          txType: "RECEIPT",
          qty: data.acceptedQty,
          refType: "PURCHASE_ORDER",
          refId: data.purchaseOrderId,
          note: resolvedLotNo ? `LOT 입고: ${resolvedLotNo}` : (data.note ?? null),
        },
      })
    }

    // 4-6. PurchaseOrder 상태 갱신
    const allItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: data.purchaseOrderId },
    })
    const fullyReceived = allItems.every((i) => Number(i.receivedQty) >= Number(i.qty))
    if (fullyReceived) {
      await tx.purchaseOrder.update({
        where: { id: data.purchaseOrderId },
        data: { status: "RECEIVED" },
      })
    } else if (allItems.some((i) => Number(i.receivedQty) > 0)) {
      await tx.purchaseOrder.update({
        where: { id: data.purchaseOrderId },
        data: { status: "PARTIAL_RECEIVED" },
      })
    }
  })

  revalidatePath("/app/mes/purchase-orders")
  revalidatePath("/app/mes/material-receipt")
  revalidatePath("/app/mes/material/stock")
  revalidatePath("/app/mes/inventory-transactions")
}
