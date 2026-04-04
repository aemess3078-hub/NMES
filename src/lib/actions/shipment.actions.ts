"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getShipments(tenantId: string) {
  return prisma.shipmentOrder.findMany({
    where: { tenantId },
    include: {
      salesOrder: { include: { customer: true } },
      items: {
        include: {
          salesOrderItem: { include: { item: true } },
          item: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getShippableSalesOrders(tenantId: string) {
  return prisma.salesOrder.findMany({
    where: {
      tenantId,
      status: { in: ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"] },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      deliveryDate: true,
      customer: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemId: true,
          qty: true,
          shippedQty: true,
          item: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { deliveryDate: "asc" },
  })
}

export async function getWarehouses(tenantId: string) {
  return prisma.warehouse.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  })
}

// ─── Business Logic ───────────────────────────────────────────────────────────

export async function generateShipmentNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `SH-${year}-`
  const last = await prisma.shipmentOrder.findFirst({
    where: { tenantId, shipmentNo: { startsWith: prefix } },
    orderBy: { shipmentNo: "desc" },
    select: { shipmentNo: true },
  })
  const seq = last ? (parseInt(last.shipmentNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export type CreateShipmentItemInput = {
  salesOrderItemId: string
  itemId: string
  qty: number
  lotId?: string
}

export type CreateShipmentInput = {
  salesOrderId: string
  plannedDate: Date
  warehouseId?: string
  note?: string
  items: CreateShipmentItemInput[]
}

export async function createShipment(
  tenantId: string,
  siteId: string,
  data: CreateShipmentInput
) {
  const shipmentNo = await generateShipmentNo(tenantId)

  await prisma.$transaction(async (tx) => {
    await tx.shipmentOrder.create({
      data: {
        tenantId,
        siteId,
        salesOrderId: data.salesOrderId,
        shipmentNo,
        plannedDate: data.plannedDate,
        warehouseId: data.warehouseId,
        note: data.note,
        items: {
          create: data.items.map((item) => ({
            salesOrderItemId: item.salesOrderItemId,
            itemId: item.itemId,
            qty: item.qty,
            lotId: item.lotId,
          })),
        },
      },
    })

    // shippedQty 갱신
    for (const item of data.items) {
      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { increment: item.qty } },
      })
    }

    // 수주 상태 자동 전환 체크
    const updatedItems = await tx.salesOrderItem.findMany({
      where: { salesOrderId: data.salesOrderId },
    })
    const fullyShipped = updatedItems.every(
      (i) => Number(i.shippedQty) >= Number(i.qty)
    )
    await tx.salesOrder.update({
      where: { id: data.salesOrderId },
      data: { status: fullyShipped ? "SHIPPED" : "PARTIAL_SHIPPED" },
    })
  })

  revalidatePath("/app/mes/shipments")
  revalidatePath("/app/mes/sales-orders")
}

export async function confirmShipment(id: string) {
  await prisma.shipmentOrder.update({
    where: { id },
    data: { status: "SHIPPED", shippedDate: new Date() },
  })
  revalidatePath("/app/mes/shipments")
}

export async function deleteShipment(id: string) {
  const shipment = await prisma.shipmentOrder.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  })
  if (shipment.status !== "PLANNED") {
    throw new Error("PLANNED 상태인 출하만 삭제 가능합니다.")
  }

  await prisma.$transaction(async (tx) => {
    // shippedQty 롤백
    for (const item of shipment.items) {
      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { decrement: Number(item.qty) } },
      })
    }
    await tx.shipmentItem.deleteMany({ where: { shipmentOrderId: id } })
    await tx.shipmentOrder.delete({ where: { id } })

    // 수주 상태 재계산
    const updatedItems = await tx.salesOrderItem.findMany({
      where: { salesOrderId: shipment.salesOrderId },
    })
    const anyShipped = updatedItems.some((i) => Number(i.shippedQty) > 0)
    await tx.salesOrder.update({
      where: { id: shipment.salesOrderId },
      data: { status: anyShipped ? "PARTIAL_SHIPPED" : "CONFIRMED" },
    })
  })

  revalidatePath("/app/mes/shipments")
  revalidatePath("/app/mes/sales-orders")
}
