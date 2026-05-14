"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { QuotationStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import type { QuotationFormValues } from "@/app/app/mes/quotations/quotation-form-schema"

export type QuotationWithDetails = {
  id: string
  tenantId: string
  siteId: string
  customerId: string
  quotationNo: string
  quotationDate: Date
  validUntil: Date
  status: QuotationStatus
  totalAmount: number | null
  currency: string
  note: string | null
  convertedSalesOrderId: string | null
  createdAt: Date
  updatedAt: Date
  customer: { id: string; code: string; name: string }
  site: { id: string; code: string; name: string; type: string }
  items: Array<{
    id: string
    quotationId: string
    itemId: string
    qty: number
    unitPrice: number
    note: string | null
    item: { id: string; code: string; name: string; itemType: string; uom: string }
  }>
}

function serializeQuotation(q: any): QuotationWithDetails {
  return {
    ...q,
    totalAmount: q.totalAmount ? Number(q.totalAmount) : null,
    items: q.items.map((item: any) => ({
      ...item,
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
    })),
  }
}

const QUOTATION_INCLUDE = {
  customer: { select: { id: true, code: true, name: true } },
  site: { select: { id: true, code: true, name: true, type: true } },
  items: {
    include: {
      item: { select: { id: true, code: true, name: true, itemType: true, uom: true } },
    },
  },
} as const

export async function getQuotations(): Promise<QuotationWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  const results = await prisma.quotation.findMany({
    where: { tenantId },
    include: QUOTATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  })
  return results.map(serializeQuotation)
}

export async function getQuotationById(id: string): Promise<QuotationWithDetails | null> {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.quotation.findFirst({
    where: { id, tenantId },
    include: QUOTATION_INCLUDE,
  })
  return result ? serializeQuotation(result) : null
}

export async function getCustomersForQuotation() {
  const { tenantId } = await requireTenantContext()
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getFinishedItems() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: {
      tenantId,
      itemType: { in: ["FINISHED", "SEMI_FINISHED"] },
      status: "ACTIVE",
    },
    select: { id: true, code: true, name: true, itemType: true, uom: true },
    orderBy: { name: "asc" },
  })
}

export async function getItemPriceForCustomer(
  itemId: string,
  customerId: string
): Promise<number | null> {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.itemPrice.findFirst({
    where: {
      tenantId,
      itemId,
      partnerId: customerId,
      priceType: "SALES",
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    orderBy: { effectiveFrom: "desc" },
  })
  return result ? Number(result.unitPrice) : null
}

async function generateQuotationNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `QT-${year}-`
  const last = await prisma.quotation.findFirst({
    where: { tenantId, quotationNo: { startsWith: prefix } },
    orderBy: { quotationNo: "desc" },
    select: { quotationNo: true },
  })
  const seq = last ? (parseInt(last.quotationNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

export async function createQuotation(data: QuotationFormValues, _tenantId?: string) {
  const { tenantId, siteId: sessionSiteId } = await requireTenantContext()
  const quotationNo = await generateQuotationNo(tenantId)
  const totalAmount = data.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)

  const siteId = data.siteId || sessionSiteId
  if (!siteId) {
    throw new Error("Tenant site context not found")
  }

  const [site, customer, items] = await Promise.all([
    prisma.site.findFirst({ where: { id: siteId, tenantId }, select: { id: true } }),
    prisma.businessPartner.findFirst({
      where: { id: data.customerId, tenantId },
      select: { id: true },
    }),
    prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    }),
  ])

  if (!site) throw new Error("Site not found in tenant scope")
  if (!customer) throw new Error("Customer not found in tenant scope")
  if (items.length !== data.items.length) throw new Error("One or more items are outside tenant scope")

  await prisma.quotation.create({
    data: {
      tenantId,
      siteId,
      customerId: data.customerId,
      quotationNo,
      quotationDate: new Date(data.quotationDate),
      validUntil: new Date(data.validUntil),
      status: (data.status as QuotationStatus) ?? "DRAFT",
      totalAmount,
      currency: data.currency ?? "KRW",
      note: data.note,
      items: {
        create: data.items.map((item) => ({
          itemId: item.itemId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          note: item.note,
        })),
      },
    },
  })
  revalidatePath("/app/mes/quotations")
}

export async function updateQuotation(id: string, data: QuotationFormValues) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.quotation.findFirstOrThrow({
    where: { id, tenantId },
  })
  const lockedStatuses: QuotationStatus[] = ["WON", "LOST", "EXPIRED", "CANCELLED"]
  if (lockedStatuses.includes(current.status)) {
    throw new Error("Locked quotations cannot be edited")
  }

  const [site, customer, items] = await Promise.all([
    prisma.site.findFirst({ where: { id: data.siteId, tenantId }, select: { id: true } }),
    prisma.businessPartner.findFirst({
      where: { id: data.customerId, tenantId },
      select: { id: true },
    }),
    prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    }),
  ])

  if (!site) throw new Error("Site not found in tenant scope")
  if (!customer) throw new Error("Customer not found in tenant scope")
  if (items.length !== data.items.length) throw new Error("One or more items are outside tenant scope")

  const totalAmount = data.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)

  await prisma.$transaction([
    prisma.quotationItem.deleteMany({ where: { quotationId: id, quotation: { tenantId } } }),
    prisma.quotation.update({
      where: { id: current.id },
      data: {
        customerId: data.customerId,
        siteId: data.siteId,
        quotationDate: new Date(data.quotationDate),
        validUntil: new Date(data.validUntil),
        status: data.status as QuotationStatus,
        totalAmount,
        currency: data.currency ?? "KRW",
        note: data.note,
        items: {
          create: data.items.map((item) => ({
            itemId: item.itemId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            note: item.note,
          })),
        },
      },
    }),
  ])
  revalidatePath("/app/mes/quotations")
}

export async function deleteQuotation(id: string) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.quotation.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (current.status !== "DRAFT") {
    throw new Error("Only draft quotations can be deleted")
  }
  await prisma.$transaction([
    prisma.quotationItem.deleteMany({ where: { quotationId: id, quotation: { tenantId } } }),
    prisma.quotation.delete({ where: { id: current.id } }),
  ])
  revalidatePath("/app/mes/quotations")
}

export async function convertToSalesOrder(
  quotationId: string,
  _tenantId?: string
): Promise<string> {
  const { tenantId } = await requireTenantContext()
  const quotation = await prisma.quotation.findFirstOrThrow({
    where: { id: quotationId, tenantId },
    include: { items: true },
  })

  if (quotation.status !== "WON") {
    throw new Error("Only won quotations can be converted")
  }
  if (quotation.convertedSalesOrderId) {
    throw new Error("Quotation already converted to sales order")
  }

  const year = new Date().getFullYear()
  const prefix = `SO-${year}-`
  const last = await prisma.salesOrder.findFirst({
    where: { tenantId, orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  })
  const seq = last ? (parseInt(last.orderNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  const orderNo = `${prefix}${String(seq).padStart(3, "0")}`

  const result = await prisma.$transaction(async (tx) => {
    const salesOrder = await tx.salesOrder.create({
      data: {
        tenantId,
        siteId: quotation.siteId,
        customerId: quotation.customerId,
        orderNo,
        orderDate: new Date(),
        deliveryDate: quotation.validUntil,
        status: "DRAFT",
        totalAmount: quotation.totalAmount,
        currency: quotation.currency,
        note: `Converted from quotation ${quotation.quotationNo}`,
        items: {
          create: quotation.items.map((item) => ({
            itemId: item.itemId,
            qty: item.qty,
            unitPrice: item.unitPrice,
          })),
        },
      },
    })

    await tx.quotation.update({
      where: { id: quotation.id },
      data: { convertedSalesOrderId: salesOrder.id },
    })

    return salesOrder
  })

  revalidatePath("/app/mes/quotations")
  revalidatePath("/app/mes/sales-orders")
  return result.id
}
