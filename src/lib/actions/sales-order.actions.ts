"use server"

import { prisma } from "@/lib/db/prisma"
import { SalesOrderStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getSalesOrders(tenantId: string) {
  return prisma.salesOrder.findMany({
    where: { tenantId },
    include: {
      customer: true,
      items: { include: { item: true } },
      shipments: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getCustomers(tenantId: string) {
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["CUSTOMER", "BOTH"] } },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForSales(tenantId: string) {
  return prisma.item.findMany({
    where: { tenantId, status: "ACTIVE", itemType: "FINISHED" },
    orderBy: { name: "asc" },
  })
}

// ─── Business Logic ───────────────────────────────────────────────────────────

export async function generateSalesOrderNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `SO-${year}-`
  const last = await prisma.salesOrder.findFirst({
    where: { tenantId, orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  })
  const seq = last ? (parseInt(last.orderNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export type CreateSalesOrderItemInput = {
  itemId: string
  qty: number
  unitPrice?: number
  deliveryDate?: Date
  note?: string
}

export type CreateSalesOrderInput = {
  customerId: string
  orderDate: Date
  deliveryDate: Date
  status: SalesOrderStatus
  totalAmount?: number
  currency?: string
  note?: string
  items: CreateSalesOrderItemInput[]
}

export async function createSalesOrder(
  tenantId: string,
  siteId: string,
  data: CreateSalesOrderInput
) {
  const orderNo = await generateSalesOrderNo(tenantId)
  const order = await prisma.salesOrder.create({
    data: {
      tenantId,
      siteId,
      customerId: data.customerId,
      orderNo,
      orderDate: data.orderDate,
      deliveryDate: data.deliveryDate,
      status: data.status,
      totalAmount: data.totalAmount,
      currency: data.currency ?? "KRW",
      note: data.note,
      items: {
        create: data.items.map((item) => ({
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          deliveryDate: item.deliveryDate,
          note: item.note,
        })),
      },
    },
  })
  revalidatePath("/app/mes/sales-orders")
  return order
}

export type UpdateSalesOrderInput = {
  customerId?: string
  orderDate?: Date
  deliveryDate?: Date
  status?: SalesOrderStatus
  totalAmount?: number
  currency?: string
  note?: string
  items?: CreateSalesOrderItemInput[]
}

export async function updateSalesOrder(id: string, data: UpdateSalesOrderInput) {
  const current = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  const canEditItems = current.status === "DRAFT"

  await prisma.$transaction(async (tx) => {
    if (canEditItems && data.items) {
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } })
    }
    await tx.salesOrder.update({
      where: { id },
      data: {
        ...(data.customerId !== undefined && { customerId: data.customerId }),
        ...(data.orderDate !== undefined && { orderDate: data.orderDate }),
        ...(data.deliveryDate !== undefined && { deliveryDate: data.deliveryDate }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.note !== undefined && { note: data.note }),
        ...(canEditItems && data.items && {
          items: {
            create: data.items.map((item) => ({
              itemId: item.itemId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              deliveryDate: item.deliveryDate,
              note: item.note,
            })),
          },
        }),
      },
    })
  })
  revalidatePath("/app/mes/sales-orders")
}

export async function deleteSalesOrder(id: string) {
  const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  if (order.status !== "DRAFT") {
    throw new Error("DRAFT 상태인 수주만 삭제할 수 있습니다.")
  }
  await prisma.salesOrderItem.deleteMany({ where: { salesOrderId: id } })
  await prisma.salesOrder.delete({ where: { id } })
  revalidatePath("/app/mes/sales-orders")
}
