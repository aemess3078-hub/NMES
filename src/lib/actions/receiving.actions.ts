"use server"

import { getTenantId } from "@/lib/auth"
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
  const tenantId = await getTenantId()

  // ── 1. 창고 존재 및 테넌트 소속 확인 ──────────────────────────────────────
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: data.warehouseId, tenantId },
  })
  if (!warehouse) {
    throw new Error("선택한 창고를 찾을 수 없습니다.")
  }

  // ── 2. PO 조회 및 사이트-창고 정합성 검증 ─────────────────────────────────
  const purchaseOrderItem = await prisma.purchaseOrderItem.findUniqueOrThrow({
    where: { id: data.purchaseOrderItemId },
    include: { purchaseOrder: { select: { siteId: true } } },
  })

  const poSiteId = purchaseOrderItem.purchaseOrder.siteId
  if (warehouse.siteId !== poSiteId) {
    throw new Error(
      `입고 창고의 사이트가 발주 사이트와 다릅니다. ` +
      `창고는 반드시 발주의 사이트에 속해야 합니다.`
    )
  }

  // ── 3. 트랜잭션 처리 ───────────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 3-1. ReceivingInspection 생성
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

    // 3-2. PurchaseOrderItem.receivedQty 갱신
    await tx.purchaseOrderItem.update({
      where: { id: data.purchaseOrderItemId },
      data: { receivedQty: { increment: data.acceptedQty } },
    })

    // 3-3. InventoryBalance 갱신 (합격 수량만)
    if (data.acceptedQty > 0) {
      // LOT 비관리 입고 경로: lotId=null 기준으로 findFirst 후 update/create
      // LOT 관리 품목 입고는 별도 LOT 지정 경로에서 처리
      const existingBalance = await tx.inventoryBalance.findFirst({
        where: {
          tenantId,
          itemId: purchaseOrderItem.itemId,
          warehouseId: warehouse.id,
          lotId: null,
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
            lotId: null,
            qtyOnHand: data.acceptedQty,
            qtyAvailable: data.acceptedQty,
            qtyHold: 0,
          },
        })
      }

      // 3-4. InventoryTransaction 생성
      const txNo = await generateTxNo(tenantId)
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: purchaseOrderItem.itemId,
          toLocationId: warehouse.id,
          txNo,
          txType: "RECEIPT",
          qty: data.acceptedQty,
          refType: "PURCHASE_ORDER",
          refId: data.purchaseOrderId,
        },
      })
    }

    // 3-5. PurchaseOrder 상태 갱신
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
}
