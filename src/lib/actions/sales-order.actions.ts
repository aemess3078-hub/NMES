"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { SalesOrderStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export async function getSalesOrders(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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

export async function getCustomers(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["CUSTOMER", "BOTH"] } },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForSales(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId, status: "ACTIVE", itemType: "FINISHED" },
    orderBy: { name: "asc" },
  })
}

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
  _tenantId: string,
  _siteId: string,
  data: CreateSalesOrderInput
) {
  const { tenantId, siteId } = await requireTenantContext()

  if (!siteId) {
    throw new Error("Tenant site context not found")
  }

  const [customer, items] = await Promise.all([
    prisma.businessPartner.findFirst({
      where: { id: data.customerId, tenantId },
      select: { id: true },
    }),
    prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    }),
  ])

  if (!customer) {
    throw new Error("Customer not found in tenant scope")
  }

  if (items.length !== data.items.length) {
    throw new Error("One or more items are outside tenant scope")
  }

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
  const { tenantId } = await requireTenantContext()
  const current = await prisma.salesOrder.findFirstOrThrow({
    where: { id, tenantId },
  })
  const canEditItems = current.status === "DRAFT"

  if (data.customerId) {
    const customer = await prisma.businessPartner.findFirst({
      where: { id: data.customerId, tenantId },
      select: { id: true },
    })
    if (!customer) throw new Error("Customer not found in tenant scope")
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
      await tx.salesOrderItem.deleteMany({
        where: { salesOrderId: id, salesOrder: { tenantId } },
      })
    }
    await tx.salesOrder.update({
      where: { id: current.id },
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
  const { tenantId } = await requireTenantContext()
  const order = await prisma.salesOrder.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (order.status !== "DRAFT") {
    throw new Error("Only draft sales orders can be deleted")
  }
  await prisma.salesOrderItem.deleteMany({
    where: { salesOrderId: id, salesOrder: { tenantId } },
  })
  await prisma.salesOrder.delete({ where: { id: order.id } })
  revalidatePath("/app/mes/sales-orders")
}

export type ItemStockStatus = {
  salesOrderItemId: string
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  orderedQty: number
  shippedQty: number
  remainingQty: number
  availableStock: number
  shippableQty: number
  shortageQty: number
}

export async function checkInventoryForSalesOrder(
  salesOrderId: string,
  _tenantId?: string
): Promise<ItemStockStatus[]> {
  const { tenantId } = await requireTenantContext()
  const order = await prisma.salesOrder.findFirstOrThrow({
    where: { id: salesOrderId, tenantId },
    include: {
      items: { include: { item: { select: { id: true, code: true, name: true, uom: true } } } },
    },
  })

  const itemIds = order.items.map((i) => i.itemId)
  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId, itemId: { in: itemIds } },
    select: { itemId: true, qtyAvailable: true },
  })

  const stockMap = new Map<string, number>()
  for (const b of balances) {
    stockMap.set(b.itemId, (stockMap.get(b.itemId) ?? 0) + Number(b.qtyAvailable))
  }

  return order.items.map((soi) => {
    const orderedQty = Number(soi.qty)
    const shippedQty = Number(soi.shippedQty ?? 0)
    const remainingQty = Math.max(0, orderedQty - shippedQty)
    const availableStock = stockMap.get(soi.itemId) ?? 0
    const shippableQty = Math.min(remainingQty, availableStock)
    const shortageQty = Math.max(0, remainingQty - availableStock)

    return {
      salesOrderItemId: soi.id,
      itemId: soi.itemId,
      itemCode: soi.item.code,
      itemName: soi.item.name,
      uom: soi.item.uom,
      orderedQty,
      shippedQty,
      remainingQty,
      availableStock,
      shippableQty,
      shortageQty,
    }
  })
}

export type MaterialShortage = {
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  neededQty: number
  availableQty: number
  shortageQty: number
}

export type FulfillmentRow = {
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  confirmedQty: number
  inProductionQty: number
  partialShippedQty: number
  draftQty: number
  totalOrderedQty: number
  finishedGoodsStock: number
  fromSemiFinished: number
  fromRawMaterial: number
  totalFulfillable: number
  shortageQty: number
  materialShortages: MaterialShortage[]
}

export async function getSalesOrderFulfillmentStatus(
  _tenantId: string,
  includeNonConfirmed: boolean
): Promise<FulfillmentRow[]> {
  const { tenantId } = await requireTenantContext()
  const statusFilter: SalesOrderStatus[] = [
    "CONFIRMED",
    "IN_PRODUCTION",
    "PARTIAL_SHIPPED",
  ]
  if (includeNonConfirmed) statusFilter.push("DRAFT")

  const orders = await prisma.salesOrder.findMany({
    where: { tenantId, status: { in: statusFilter } },
    include: {
      items: {
        include: {
          item: {
            select: { id: true, code: true, name: true, uom: true, itemType: true },
          },
        },
      },
    },
  })

  type ItemAccumulator = {
    itemCode: string
    itemName: string
    uom: string
    confirmedQty: number
    inProductionQty: number
    partialShippedQty: number
    draftQty: number
  }

  const itemMap = new Map<string, ItemAccumulator>()

  for (const order of orders) {
    for (const soi of order.items) {
      const orderedQty = Number(soi.qty)
      const shippedQty = Number(soi.shippedQty ?? 0)
      const remainingQty = Math.max(0, orderedQty - shippedQty)

      if (!itemMap.has(soi.itemId)) {
        itemMap.set(soi.itemId, {
          itemCode: soi.item.code,
          itemName: soi.item.name,
          uom: soi.item.uom,
          confirmedQty: 0,
          inProductionQty: 0,
          partialShippedQty: 0,
          draftQty: 0,
        })
      }
      const acc = itemMap.get(soi.itemId)!

      if (order.status === "CONFIRMED") acc.confirmedQty += remainingQty
      else if (order.status === "IN_PRODUCTION") acc.inProductionQty += remainingQty
      else if (order.status === "PARTIAL_SHIPPED") acc.partialShippedQty += remainingQty
      else if (order.status === "DRAFT") acc.draftQty += remainingQty
    }
  }

  if (itemMap.size === 0) return []

  const itemIds = Array.from(itemMap.keys())
  const boms = await prisma.bOM.findMany({
    where: { tenantId, itemId: { in: itemIds }, isDefault: true },
    include: { bomItems: { include: { componentItem: true } } },
  })
  const bomMap = new Map(boms.map((b) => [b.itemId, b]))

  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId },
    select: { itemId: true, qtyAvailable: true },
  })
  const inventoryMap = new Map<string, number>()
  for (const b of balances) {
    inventoryMap.set(b.itemId, (inventoryMap.get(b.itemId) ?? 0) + Number(b.qtyAvailable))
  }

  const results: FulfillmentRow[] = []

  for (const [itemId, acc] of Array.from(itemMap.entries())) {
    const totalOrderedQty =
      acc.confirmedQty + acc.inProductionQty + acc.partialShippedQty + acc.draftQty

    const fgStock = inventoryMap.get(itemId) ?? 0
    let remaining = Math.max(0, totalOrderedQty - fgStock)

    const bom = bomMap.get(itemId)
    let fromSF = 0
    let fromRM = 0
    const materialShortages: MaterialShortage[] = []

    if (bom) {
      const sfComponents = bom.bomItems.filter(
        (c) => c.componentItem.itemType === "SEMI_FINISHED"
      )
      for (const comp of sfComponents) {
        if (remaining <= 0) break
        const sfStock = inventoryMap.get(comp.componentItemId) ?? 0
        const qtyPer = Number(comp.qtyPer)
        const canMake = qtyPer > 0 ? Math.floor(sfStock / qtyPer) : 0
        const use = Math.min(remaining, canMake)
        fromSF += use
        remaining -= use
      }

      const rmComponents = bom.bomItems.filter(
        (c) => c.componentItem.itemType === "RAW_MATERIAL"
      )
      if (remaining > 0 && rmComponents.length > 0) {
        let canFromRM = remaining
        for (const rm of rmComponents) {
          const rmStock = inventoryMap.get(rm.componentItemId) ?? 0
          const qtyPer = Number(rm.qtyPer)
          const possible = qtyPer > 0 ? Math.floor(rmStock / qtyPer) : 0
          canFromRM = Math.min(canFromRM, possible)
        }
        fromRM = canFromRM
        remaining -= fromRM
      }

      const totalNeedFromRM = fromRM + remaining
      if (totalNeedFromRM > 0) {
        const rmComponents2 = bom.bomItems.filter(
          (c) => c.componentItem.itemType === "RAW_MATERIAL"
        )
        for (const rm of rmComponents2) {
          const qtyPer = Number(rm.qtyPer)
          const neededQty = Math.ceil(totalNeedFromRM * qtyPer)
          const availableQty = inventoryMap.get(rm.componentItemId) ?? 0
          const shortage = Math.max(0, neededQty - availableQty)
          if (shortage > 0) {
            materialShortages.push({
              itemId: rm.componentItemId,
              itemCode: rm.componentItem.code,
              itemName: rm.componentItem.name,
              uom: rm.componentItem.uom,
              neededQty,
              availableQty,
              shortageQty: shortage,
            })
          }
        }
      }
    }

    const shortageQty = remaining
    const totalFulfillable = Math.min(totalOrderedQty, fgStock + fromSF + fromRM)

    results.push({
      itemId,
      itemCode: acc.itemCode,
      itemName: acc.itemName,
      uom: acc.uom,
      confirmedQty: acc.confirmedQty,
      inProductionQty: acc.inProductionQty,
      partialShippedQty: acc.partialShippedQty,
      draftQty: acc.draftQty,
      totalOrderedQty,
      finishedGoodsStock: fgStock,
      fromSemiFinished: fromSF,
      fromRawMaterial: fromRM,
      totalFulfillable,
      shortageQty,
      materialShortages,
    })
  }

  return results.sort((a, b) => {
    if (a.shortageQty > 0 && b.shortageQty <= 0) return -1
    if (a.shortageQty <= 0 && b.shortageQty > 0) return 1
    return a.itemCode.localeCompare(b.itemCode)
  })
}

export async function requestProductionFromSalesOrder(
  salesOrderId: string,
  items: { salesOrderItemId: string; itemId: string; qty: number }[],
  _tenantId: string,
  _siteId: string
): Promise<{ ok: boolean; planNo?: string; error?: string }> {
  const { tenantId, siteId } = await requireTenantContext()

  if (!siteId) return { ok: false, error: "Tenant site context not found" }
  if (items.length === 0) return { ok: false, error: "No production request items provided" }

  try {
    const salesOrder = await prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: { id: true },
    })
    if (!salesOrder) return { ok: false, error: "Sales order not found in tenant scope" }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const prefix = `PP-REQ-${today}`
    const count = await prisma.productionPlan.count({
      where: { tenantId, planNo: { startsWith: prefix } },
    })
    const planNo = `${prefix}-${String(count + 1).padStart(3, "0")}`

    await prisma.$transaction(async (tx) => {
      await tx.productionPlan.create({
        data: {
          tenantId,
          siteId,
          planNo,
          planType: "DAILY",
          startDate: new Date(),
          endDate: new Date(),
          status: "DRAFT",
          note: `Sales-order production request (${salesOrderId})`,
          items: {
            create: items.map((item) => ({
              itemId: item.itemId,
              plannedQty: item.qty,
              salesOrderItemId: item.salesOrderItemId,
            })),
          },
        },
      })

      await tx.salesOrder.update({
        where: { id: salesOrderId },
        data: { status: "IN_PRODUCTION" },
      })
    })

    revalidatePath("/app/mes/sales-orders")
    revalidatePath("/app/mes/production-plan")
    return { ok: true, planNo }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" }
  }
}
