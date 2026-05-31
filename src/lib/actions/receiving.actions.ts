"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { generateCnsMaterialReceiptLotNo } from "@/lib/lot-numbering/lot-number-generator"
import type { CnsItemRuleContext } from "@/lib/lot-numbering/lot-rule-resolver"
import { Prisma, ReceivingInspectionResult } from "@prisma/client"
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

/** 원자재 LOT 번호 자동생성 헬퍼.
 * CNS quick rule: YY + month letter(A-L) + DD + "-" + daily sequence.
 * 수동 LOT 입력은 createReceivingInspection에서 우선 처리한다.
 */
export async function generateReceivingLotNo(
  tenantId: string,
  itemContext: CnsItemRuleContext = {},
  sequenceOffset = 0,
): Promise<string> {
  return generateCnsMaterialReceiptLotNo(prisma, tenantId, itemContext, new Date(), sequenceOffset)
}

const AUTO_LOT_COLLISION = "AUTO_LOT_COLLISION"

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
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
      item: {
        select: {
          code: true,
          itemType: true,
          isLotTracked: true,
          uom: true,
          itemGroup: { select: { code: true } },
          category: { select: { code: true } },
        },
      },
    },
  })

  const poSiteId = purchaseOrderItem.purchaseOrder.siteId
  if (warehouse.siteId !== poSiteId) {
    throw new Error(
      `입고 창고의 사이트가 발주 사이트와 다릅니다. ` +
      `창고는 반드시 발주의 사이트에 속해야 합니다.`
    )
  }

  // ── 2-A. 수량 검증 (DB 기준 재계산) ──────────────────────────────────────
  const orderedQty = Number(purchaseOrderItem.qty)
  const alreadyReceivedQty = Number(purchaseOrderItem.receivedQty)
  const remainingQty = orderedQty - alreadyReceivedQty
  const uom = purchaseOrderItem.item.uom

  if (data.receivedQty <= 0) {
    throw new Error("입고수량은 0보다 커야 합니다.")
  }
  if (data.receivedQty > remainingQty) {
    throw new Error(
      `입고수량은 잔여수량을 초과할 수 없습니다. 잔여수량: ${remainingQty.toLocaleString("ko-KR")} ${uom}`
    )
  }
  if (data.acceptedQty < 0 || data.rejectedQty < 0) {
    throw new Error("합격수량과 불합격수량은 0 이상이어야 합니다.")
  }
  if (Math.abs(data.acceptedQty + data.rejectedQty - data.receivedQty) > 0.001) {
    throw new Error("합격수량과 불합격수량의 합은 금회 입고수량과 같아야 합니다.")
  }

  const isLotTracked = purchaseOrderItem.item.isLotTracked ?? false

  // ── 3. LOT 번호 결정 ───────────────────────────────────────────────────────
  // isLotTracked=false → 입력값 무시, 항상 null (비LOT 출고 흐름 보존)
  // isLotTracked=true  → 사용자 입력 우선, 미입력 시 자동생성
  const manualLotNo = isLotTracked ? data.lotNo?.trim() || null : null
  const shouldAutoGenerateLotNo = isLotTracked && !manualLotNo
  const itemRuleContext: CnsItemRuleContext = {
    itemCode: purchaseOrderItem.item.code,
    itemGroupCode: purchaseOrderItem.item.itemGroup?.code,
    itemCategoryCode: purchaseOrderItem.item.category?.code,
    itemType: purchaseOrderItem.item.itemType,
  }
  // txNo 사전 생성 (트랜잭션 외부 - 기존 패턴 유지)
  const txNo = data.acceptedQty > 0 ? await generateTxNo(tenantId) : null

  // ── 4. 트랜잭션 처리 ───────────────────────────────────────────────────────
  const maxAttempts = shouldAutoGenerateLotNo ? 5 : 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resolvedLotNo = manualLotNo ?? (
      shouldAutoGenerateLotNo
        ? await generateReceivingLotNo(tenantId, itemRuleContext, attempt)
        : null
    )

    try {
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
        if (shouldAutoGenerateLotNo) {
          throw new Error(AUTO_LOT_COLLISION)
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
      break
    } catch (error) {
      const canRetry = shouldAutoGenerateLotNo &&
        (isUniqueConstraintError(error) ||
          (error instanceof Error && error.message === AUTO_LOT_COLLISION))

      if (canRetry && attempt < maxAttempts - 1) {
        continue
      }

      if (canRetry) {
        throw new Error("LOT 자동발행 중 번호 충돌이 반복되었습니다. 다시 시도해 주세요.")
      }

      throw error
    }
  }

  revalidatePath("/app/mes/purchase-orders")
  revalidatePath("/app/mes/material-receipt")
  revalidatePath("/app/mes/material/stock")
  revalidatePath("/app/mes/inventory-transactions")
}
