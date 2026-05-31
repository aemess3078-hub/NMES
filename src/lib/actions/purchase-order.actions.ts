"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole } from "@/lib/auth"
import { PurchaseOrderStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getPurchaseOrders(tenantId: string) {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      NOT: [
        { orderNo: { startsWith: "OS-" } },
        { note: { contains: "[OUTSOURCING]" } },
      ],
    },
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
  return rows.map((o) => ({
    ...o,
    totalAmount: o.totalAmount !== null ? Number(o.totalAmount) : null,
    items: o.items.map((item) => ({
      ...item,
      qty:          Number(item.qty),
      unitPrice:    Number(item.unitPrice),
      receivedQty:  Number(item.receivedQty),
      stockAtOrder: Number(item.stockAtOrder),
      receivingInspections: item.receivingInspections.map((ri) => ({
        ...ri,
        receivedQty:  Number(ri.receivedQty),
        acceptedQty:  Number(ri.acceptedQty),
        rejectedQty:  Number(ri.rejectedQty),
      })),
    })),
  }))
}

// 자재입고 대기 목록 전용 조회
//  - 현재 site의 발주만 (다른 site 발주는 입고 site 창고와 불일치하여 서버 검증에서 거부됨)
//  - 입고 대기 상태(ORDERED / PARTIAL_RECEIVED)만
//  - 외주발주(OS- / [OUTSOURCING]) 제외 — getPurchaseOrders와 동일 정책
export async function getPendingPurchaseOrdersForReceipt(tenantId: string, siteId: string) {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      siteId,
      status: { in: ["ORDERED", "PARTIAL_RECEIVED"] },
      NOT: [
        { orderNo: { startsWith: "OS-" } },
        { note: { contains: "[OUTSOURCING]" } },
      ],
    },
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
  return rows.map((o) => ({
    ...o,
    totalAmount: o.totalAmount !== null ? Number(o.totalAmount) : null,
    items: o.items.map((item) => ({
      ...item,
      qty:          Number(item.qty),
      unitPrice:    Number(item.unitPrice),
      receivedQty:  Number(item.receivedQty),
      stockAtOrder: Number(item.stockAtOrder),
      receivingInspections: item.receivingInspections.map((ri) => ({
        ...ri,
        receivedQty:  Number(ri.receivedQty),
        acceptedQty:  Number(ri.acceptedQty),
        rejectedQty:  Number(ri.rejectedQty),
      })),
    })),
  }))
}

export async function getSuppliers(tenantId: string) {
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] } },
    orderBy: { name: "asc" },
  })
}

export async function getRawMaterials(tenantId: string) {
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
  tenantId: string
): Promise<{ qtyOnHand: number; qtyAvailable: number }> {
  const balances = await prisma.inventoryBalance.findMany({
    where: { itemId, tenantId },
  })
  const qtyOnHand = balances.reduce((s, b) => s + Number(b.qtyOnHand), 0)
  const qtyAvailable = balances.reduce((s, b) => s + Number(b.qtyAvailable), 0)
  return { qtyOnHand, qtyAvailable }
}

export async function getItemPrice(
  tenantId: string,
  itemId: string,
  partnerId: string
) {
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

// ─── Business Logic ───────────────────────────────────────────────────────────

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

// ─── CRUD ─────────────────────────────────────────────────────────────────────

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
  tenantId: string,
  siteId: string,
  data: CreatePurchaseOrderInput
) {
  await requireRole("OPERATOR")
  const orderNo = await generatePurchaseOrderNo(tenantId)

  const itemsWithStock = await Promise.all(
    data.items.map(async (item) => {
      const stock = await getItemCurrentStock(item.itemId, tenantId)
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
  await requireRole("OPERATOR")
  const current = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })
  const canEditItems = current.status === "DRAFT"

  await prisma.$transaction(async (tx) => {
    if (canEditItems && data.items) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
    }
    await tx.purchaseOrder.update({
      where: { id },
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
  await requireRole("OPERATOR")
  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })
  if (order.status !== "DRAFT") {
    throw new Error("DRAFT 상태인 발주만 삭제할 수 있습니다.")
  }
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
  await prisma.purchaseOrder.delete({ where: { id } })
  revalidatePath("/app/mes/purchase-orders")
}
