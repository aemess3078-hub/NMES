"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { PurchaseOrderStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export async function getPurchaseOrders(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.purchaseOrder.findMany({
    where: { tenantId },
    include: {
      supplier: true,
      items: {
        include: {
          item: true,
          receivingInspections: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getSuppliers(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] } },
    orderBy: { name: "asc" },
  })
}

export async function getRawMaterials(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      itemType: { in: ["RAW_MATERIAL", "SEMI_FINISHED", "CONSUMABLE"] },
    },
    orderBy: { name: "asc" },
  })
}

export async function getItemCurrentStock(
  itemId: string,
  _tenantId?: string
): Promise<{ qtyOnHand: number; qtyAvailable: number }> {
  const { tenantId } = await requireTenantContext()
  const balances = await prisma.inventoryBalance.findMany({
    where: { itemId, tenantId },
  })
  const qtyOnHand = balances.reduce((s, b) => s + Number(b.qtyOnHand), 0)
  const qtyAvailable = balances.reduce((s, b) => s + Number(b.qtyAvailable), 0)
  return { qtyOnHand, qtyAvailable }
}

export async function getItemPrice(
  _tenantId: string,
  itemId: string,
  partnerId: string
) {
  const { tenantId } = await requireTenantContext()
  return prisma.itemPrice.findFirst({
    where: {
      tenantId,
      itemId,
      partnerId,
      priceType: "PURCHASE",
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    orderBy: { effectiveFrom: "desc" },
  })
}

async function generatePurchaseOrderNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PO-${year}-`
  const last = await prisma.purchaseOrder.findFirst({
    where: { tenantId, orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  })
  const seq = last ? (parseInt(last.orderNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

export type CreatePurchaseOrderItemInput = {
  itemId: string
  qty: number
  unitPrice: number
  note?: string
}

export type CreatePurchaseOrderInput = {
  supplierId: string
  orderDate: Date
  expectedDate: Date
  status: PurchaseOrderStatus
  totalAmount?: number
  currency?: string
  note?: string
  items: CreatePurchaseOrderItemInput[]
}

export async function createPurchaseOrder(
  _tenantId: string,
  _siteId: string,
  data: CreatePurchaseOrderInput
) {
  const { tenantId, siteId } = await requireTenantContext()

  if (!siteId) {
    throw new Error("Tenant site context not found")
  }

  const [supplier, items] = await Promise.all([
    prisma.businessPartner.findFirst({
      where: { id: data.supplierId, tenantId },
      select: { id: true },
    }),
    prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    }),
  ])

  if (!supplier) {
    throw new Error("Supplier not found in tenant scope")
  }

  if (items.length !== data.items.length) {
    throw new Error("One or more items are outside tenant scope")
  }

  const orderNo = await generatePurchaseOrderNo(tenantId)

  const itemsWithStock = await Promise.all(
    data.items.map(async (item) => {
      const stock = await getItemCurrentStock(item.itemId)
      return { ...item, stockAtOrder: stock.qtyOnHand }
    })
  )

  await prisma.purchaseOrder.create({
    data: {
      tenantId,
      siteId,
      supplierId: data.supplierId,
      orderNo,
      orderDate: data.orderDate,
      expectedDate: data.expectedDate,
      status: data.status,
      totalAmount: data.totalAmount,
      currency: data.currency ?? "KRW",
      note: data.note,
      items: {
        create: itemsWithStock.map((item) => ({
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          stockAtOrder: item.stockAtOrder,
          note: item.note,
        })),
      },
    },
  })

  revalidatePath("/app/mes/purchase-orders")
}

export type UpdatePurchaseOrderInput = {
  supplierId?: string
  orderDate?: Date
  expectedDate?: Date
  status?: PurchaseOrderStatus
  totalAmount?: number
  currency?: string
  note?: string
  items?: CreatePurchaseOrderItemInput[]
}

export async function updatePurchaseOrder(id: string, data: UpdatePurchaseOrderInput) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.purchaseOrder.findFirstOrThrow({
    where: { id, tenantId },
  })
  const canEditItems = current.status === "DRAFT"

  if (data.supplierId) {
    const supplier = await prisma.businessPartner.findFirst({
      where: { id: data.supplierId, tenantId },
      select: { id: true },
    })
    if (!supplier) throw new Error("Supplier not found in tenant scope")
  }

  if (data.items?.length) {
    const items = await prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    })
    if (items.length !== data.items.length) {
      throw new Error("One or more items are outside tenant scope")
    }
  }

  await prisma.$transaction(async (tx) => {
    if (canEditItems && data.items) {
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id, purchaseOrder: { tenantId } },
      })
    }
    await tx.purchaseOrder.update({
      where: { id: current.id },
      data: {
        ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
        ...(data.orderDate !== undefined && { orderDate: data.orderDate }),
        ...(data.expectedDate !== undefined && { expectedDate: data.expectedDate }),
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
              note: item.note,
            })),
          },
        }),
      },
    })
  })

  revalidatePath("/app/mes/purchase-orders")
}

export async function deletePurchaseOrder(id: string) {
  const { tenantId } = await requireTenantContext()
  const order = await prisma.purchaseOrder.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (order.status !== "DRAFT") {
    throw new Error("Only draft purchase orders can be deleted")
  }
  await prisma.purchaseOrderItem.deleteMany({
    where: { purchaseOrderId: id, purchaseOrder: { tenantId } },
  })
  await prisma.purchaseOrder.delete({
    where: { id: order.id },
  })
  revalidatePath("/app/mes/purchase-orders")
}
