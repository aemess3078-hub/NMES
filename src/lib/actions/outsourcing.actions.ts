"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"
import { PurchaseOrderStatus, ReceivingInspectionResult } from "@prisma/client"

// ─── Filter & Types ───────────────────────────────────────────────────────────

export type OutsourcingFilter = {
  from?: string  // YYYY-MM-DD
  to?: string
  supplierId?: string
  status?: PurchaseOrderStatus
}

export type OutsourcingOrderRow = {
  id: string
  orderNo: string
  orderDate: string
  expectedDate: string
  supplierName: string
  supplierId: string
  status: PurchaseOrderStatus
  totalAmount: number | null
  itemCount: number
  totalQty: number
  totalReceivedQty: number
  isOverdue: boolean
  note: string | null
}

export type OutsourcingReceivingRow = {
  id: string
  inspectedAt: string
  orderNo: string
  supplierName: string
  itemCode: string
  itemName: string
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  result: ReceivingInspectionResult
}

export type OutsourcingSummary = {
  totalOrders: number
  pendingOrders: number
  partialReceived: number
  completed: number
  overdue: number
}

export type OutsourcingData = {
  filter: OutsourcingFilter
  summary: OutsourcingSummary
  orders: OutsourcingOrderRow[]
  receivings: OutsourcingReceivingRow[]
  partners: { id: string; name: string }[]
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getOutsourcingData(
  filter: OutsourcingFilter = {}
): Promise<OutsourcingData> {
  const tenantId = await getTenantId()
  const now = new Date()

  const from = filter.from ? new Date(`${filter.from}T00:00:00.000`) : undefined
  const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : undefined

  // ── 발주 목록 ────────────────────────────────────────────────────────────────
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(from || to
        ? { orderDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      items: { select: { qty: true, receivedQty: true } },
    },
    orderBy: { orderDate: "desc" },
  })

  const orderRows: OutsourcingOrderRow[] = orders.map((o) => {
    const totalQty = o.items.reduce((s, i) => s + Number(i.qty), 0)
    const totalReceivedQty = o.items.reduce((s, i) => s + Number(i.receivedQty), 0)
    const isOverdue =
      (o.status === "ORDERED" || o.status === "PARTIAL_RECEIVED") &&
      o.expectedDate < now
    return {
      id: o.id,
      orderNo: o.orderNo,
      orderDate: o.orderDate.toISOString(),
      expectedDate: o.expectedDate.toISOString(),
      supplierName: o.supplier.name,
      supplierId: o.supplier.id,
      status: o.status,
      totalAmount: o.totalAmount !== null ? Number(o.totalAmount) : null,
      itemCount: o.items.length,
      totalQty: Math.round(totalQty * 100) / 100,
      totalReceivedQty: Math.round(totalReceivedQty * 100) / 100,
      isOverdue,
      note: o.note,
    }
  })

  // ── 입고 이력 ────────────────────────────────────────────────────────────────
  const receivings = await prisma.receivingInspection.findMany({
    where: {
      purchaseOrderItem: {
        purchaseOrder: {
          tenantId,
          ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
        },
      },
      ...(from || to
        ? {
            inspectedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      purchaseOrderItem: {
        include: {
          item: { select: { code: true, name: true } },
          purchaseOrder: {
            select: { orderNo: true, supplier: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { inspectedAt: "desc" },
    take: 200,
  })

  const receivingRows: OutsourcingReceivingRow[] = receivings.map((r) => ({
    id: r.id,
    inspectedAt: r.inspectedAt.toISOString(),
    orderNo: r.purchaseOrderItem.purchaseOrder.orderNo,
    supplierName: r.purchaseOrderItem.purchaseOrder.supplier.name,
    itemCode: r.purchaseOrderItem.item.code,
    itemName: r.purchaseOrderItem.item.name,
    receivedQty: Number(r.receivedQty),
    acceptedQty: Number(r.acceptedQty),
    rejectedQty: Number(r.rejectedQty),
    result: r.result,
  }))

  // ── 공급처 목록 ───────────────────────────────────────────────────────────────
  const partners = await prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] }, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  // ── 요약 ─────────────────────────────────────────────────────────────────────
  const pendingOrders = orderRows.filter(
    (o) => o.status === "DRAFT" || o.status === "ORDERED"
  ).length
  const partialReceived = orderRows.filter((o) => o.status === "PARTIAL_RECEIVED").length
  const completed = orderRows.filter(
    (o) => o.status === "RECEIVED" || o.status === "CLOSED"
  ).length
  const overdue = orderRows.filter((o) => o.isOverdue).length

  return {
    filter,
    summary: {
      totalOrders: orderRows.length,
      pendingOrders,
      partialReceived,
      completed,
      overdue,
    },
    orders: orderRows,
    receivings: receivingRows,
    partners: partners.map((p) => ({ id: p.id, name: p.name })),
  }
}
