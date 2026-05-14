"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

export async function getShipments(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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

export async function getShippableSalesOrders(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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

export async function getWarehouses(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.warehouse.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  })
}

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
  _tenantId: string,
  _siteId: string,
  data: CreateShipmentInput
) {
  const { tenantId, siteId } = await requireTenantContext()

  if (!siteId) {
    throw new Error("Tenant site context not found")
  }

  const salesOrder = await prisma.salesOrder.findFirst({
    where: { id: data.salesOrderId, tenantId },
    select: { id: true },
  })
  if (!salesOrder) {
    throw new Error("Sales order not found in tenant scope")
  }

  if (data.warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: data.warehouseId, tenantId },
      select: { id: true },
    })
    if (!warehouse) throw new Error("Warehouse not found in tenant scope")
  }

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

    for (const item of data.items) {
      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { increment: item.qty } },
      })
    }

    const updatedItems = await tx.salesOrderItem.findMany({
      where: { salesOrderId: data.salesOrderId, salesOrder: { tenantId } },
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
  const { tenantId } = await requireTenantContext()
  const shipment = await prisma.shipmentOrder.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })
  if (!shipment) throw new Error("Shipment not found in tenant scope")

  await prisma.shipmentOrder.update({
    where: { id: shipment.id },
    data: { status: "SHIPPED", shippedDate: new Date() },
  })
  revalidatePath("/app/mes/shipments")
}

export async function deleteShipment(id: string) {
  const { tenantId } = await requireTenantContext()
  const shipment = await prisma.shipmentOrder.findFirstOrThrow({
    where: { id, tenantId },
    include: { items: true },
  })
  if (shipment.status !== "PLANNED") {
    throw new Error("Only planned shipments can be deleted")
  }

  await prisma.$transaction(async (tx) => {
    for (const item of shipment.items) {
      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { decrement: Number(item.qty) } },
      })
    }
    await tx.shipmentItem.deleteMany({ where: { shipmentOrderId: id, shipmentOrder: { tenantId } } })
    await tx.shipmentOrder.delete({ where: { id: shipment.id } })

    const updatedItems = await tx.salesOrderItem.findMany({
      where: { salesOrderId: shipment.salesOrderId, salesOrder: { tenantId } },
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
