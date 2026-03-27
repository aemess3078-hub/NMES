"use server"

import { prisma } from "@/lib/db/prisma"
import { ReceivingInspectionResult } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type CreateReceivingInspectionInput = {
  purchaseOrderItemId: string
  purchaseOrderId: string
  tenantId: string
  siteId: string
  inspectorId?: string
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  result: ReceivingInspectionResult
  note?: string
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
  // 기본 입고 위치 조회 (테넌트의 첫 번째 창고 첫 번째 location)
  const defaultLocation = await prisma.location.findFirst({
    where: { warehouse: { tenantId: data.tenantId } },
    include: { warehouse: true },
  })

  const purchaseOrderItem = await prisma.purchaseOrderItem.findUniqueOrThrow({
    where: { id: data.purchaseOrderItemId },
    include: { purchaseOrder: true },
  })

  await prisma.$transaction(async (tx) => {
    // 1. ReceivingInspection 생성
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

    // 2. PurchaseOrderItem.receivedQty 갱신
    await tx.purchaseOrderItem.update({
      where: { id: data.purchaseOrderItemId },
      data: { receivedQty: { increment: data.acceptedQty } },
    })

    // 3. InventoryBalance 갱신 (합격 수량만)
    if (data.acceptedQty > 0 && defaultLocation) {
      const existing = await tx.inventoryBalance.findFirst({
        where: {
          itemId: purchaseOrderItem.itemId,
          locationId: defaultLocation.id,
          tenantId: data.tenantId,
        },
      })

      if (existing) {
        await tx.inventoryBalance.update({
          where: { id: existing.id },
          data: {
            qtyOnHand: { increment: data.acceptedQty },
            qtyAvailable: { increment: data.acceptedQty },
          },
        })
      } else {
        await tx.inventoryBalance.create({
          data: {
            tenantId: data.tenantId,
            siteId: data.siteId,
            itemId: purchaseOrderItem.itemId,
            locationId: defaultLocation.id,
            qtyOnHand: data.acceptedQty,
            qtyAvailable: data.acceptedQty,
            qtyHold: 0,
          },
        })
      }

      // 4. InventoryTransaction 생성
      const txNo = await generateTxNo(data.tenantId)
      await tx.inventoryTransaction.create({
        data: {
          tenantId: data.tenantId,
          itemId: purchaseOrderItem.itemId,
          toLocationId: defaultLocation.id,
          txNo,
          txType: "RECEIPT",
          qty: data.acceptedQty,
          refType: "PURCHASE_ORDER",
          refId: data.purchaseOrderId,
        },
      })
    }

    // 5. 전체 입고 완료 여부 체크 후 PurchaseOrder 상태 갱신
    const allItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: data.purchaseOrderId },
    })

    const fullyReceived = allItems.every(
      (i) => Number(i.receivedQty) >= Number(i.qty)
    )

    if (fullyReceived) {
      await tx.purchaseOrder.update({
        where: { id: data.purchaseOrderId },
        data: { status: "RECEIVED" },
      })
    } else {
      const anyReceived = allItems.some((i) => Number(i.receivedQty) > 0)
      if (anyReceived) {
        await tx.purchaseOrder.update({
          where: { id: data.purchaseOrderId },
          data: { status: "PARTIAL_RECEIVED" },
        })
      }
    }
  })

  revalidatePath("/app/mes/purchase-orders")
}
