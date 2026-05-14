"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { PlanStatus, PlanType } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type PlanWithDetails = {
  id: string
  tenantId: string
  siteId: string
  planNo: string
  planType: PlanType
  startDate: Date
  endDate: Date
  status: PlanStatus
  note: string | null
  createdAt: Date
  updatedAt: Date
  site: { id: string; code: string; name: string; type: string }
  items: {
    id: string
    planId: string
    itemId: string
    bomId: string | null
    routingId: string | null
    salesOrderItemId: string | null
    plannedQty: any
    note: string | null
    item: { id: string; code: string; name: string; itemType: string }
    bom: { id: string; version: string } | null
    routing: { id: string; version: string } | null
    workOrders: { id: string; orderNo: string; status: string }[]
    salesOrderItem: {
      id: string
      qty: any
      unitPrice: any | null
      deliveryDate: Date | null
      note: string | null
      salesOrder: {
        id: string
        orderNo: string
        orderDate: Date
        deliveryDate: Date
        status: string
        customer: { id: string; code: string; name: string }
      }
    } | null
  }[]
}

export type PlanItemInput = {
  itemId: string
  bomId?: string | null
  routingId?: string | null
  plannedQty: number
  note?: string | null
}

export type CreatePlanInput = {
  siteId: string
  planNo: string
  planType: PlanType
  startDate: string
  endDate: string
  status: PlanStatus
  note?: string | null
  items: PlanItemInput[]
}

export async function getProductionPlans(): Promise<PlanWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  return prisma.productionPlan.findMany({
    where: { tenantId },
    include: {
      site: {
        select: { id: true, code: true, name: true, type: true },
      },
      items: {
        include: {
          item: {
            select: { id: true, code: true, name: true, itemType: true },
          },
          bom: {
            select: { id: true, version: true },
          },
          routing: {
            select: { id: true, version: true },
          },
          workOrders: {
            select: { id: true, orderNo: true, status: true },
          },
          salesOrderItem: {
            include: {
              salesOrder: {
                select: {
                  id: true,
                  orderNo: true,
                  orderDate: true,
                  deliveryDate: true,
                  status: true,
                  customer: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as any
}

export async function getPlanById(id: string): Promise<PlanWithDetails | null> {
  const { tenantId } = await requireTenantContext()
  return prisma.productionPlan.findFirst({
    where: { id, tenantId },
    include: {
      site: {
        select: { id: true, code: true, name: true, type: true },
      },
      items: {
        include: {
          item: {
            select: { id: true, code: true, name: true, itemType: true },
          },
          bom: {
            select: { id: true, version: true },
          },
          routing: {
            select: { id: true, version: true },
          },
          workOrders: {
            select: { id: true, orderNo: true, status: true },
          },
          salesOrderItem: {
            include: {
              salesOrder: {
                select: {
                  id: true,
                  orderNo: true,
                  orderDate: true,
                  deliveryDate: true,
                  status: true,
                  customer: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  }) as any
}

export async function getSites() {
  const { tenantId } = await requireTenantContext()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForPlan() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId, itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getBomsForPlanItem(itemId: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.bOM.findMany({
    where: { tenantId, itemId, status: "ACTIVE" },
    select: { id: true, version: true, isDefault: true },
    orderBy: { version: "asc" },
  })
}

export async function getRoutingsForPlanItem(itemId: string) {
  const { tenantId } = await requireTenantContext()
  const itemRoutings = await prisma.itemRouting.findMany({
    where: {
      tenantId,
      itemId,
      routing: { status: "ACTIVE", tenantId },
    },
    include: {
      routing: {
        select: { id: true, version: true },
      },
    },
    orderBy: { routing: { version: "asc" } },
  })

  return itemRoutings.map((ir) => ({
    id: ir.routing.id,
    version: ir.routing.version,
    isDefault: ir.isDefault,
  }))
}

export async function generatePlanNo(tenantId: string, planType: PlanType): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()

  let baseNo: string

  if (planType === "DAILY") {
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    baseNo = `PP-${year}-${month}${day}`
  } else if (planType === "WEEKLY") {
    const startOfYear = new Date(year, 0, 1)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    const weekNo = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
    baseNo = `PP-${year}-W${String(weekNo).padStart(2, "0")}`
  } else {
    const month = String(now.getMonth() + 1).padStart(2, "0")
    baseNo = `PP-${year}-M${month}`
  }

  const existing = await prisma.productionPlan.findMany({
    where: {
      tenantId,
      planNo: { startsWith: baseNo },
    },
    select: { planNo: true },
  })

  if (existing.length === 0) {
    return baseNo
  }

  const existingNos = new Set(existing.map((p) => p.planNo))
  let suffix = 2
  while (existingNos.has(`${baseNo}-${suffix}`)) {
    suffix++
  }
  return `${baseNo}-${suffix}`
}

export async function createPlan(data: CreatePlanInput, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  const [site, items, boms, routings] = await Promise.all([
    prisma.site.findFirst({ where: { id: data.siteId, tenantId }, select: { id: true } }),
    prisma.item.findMany({
      where: { id: { in: data.items.map((item) => item.itemId) }, tenantId },
      select: { id: true },
    }),
    prisma.bOM.findMany({
      where: { id: { in: data.items.map((item) => item.bomId).filter(Boolean) as string[] }, tenantId },
      select: { id: true },
    }),
    prisma.routing.findMany({
      where: { id: { in: data.items.map((item) => item.routingId).filter(Boolean) as string[] }, tenantId },
      select: { id: true },
    }),
  ])

  if (!site) throw new Error("Site not found in tenant scope")
  if (items.length !== data.items.length) throw new Error("One or more items are outside tenant scope")
  if (boms.length !== data.items.filter((item) => item.bomId).length) throw new Error("One or more BOMs are outside tenant scope")
  if (routings.length !== data.items.filter((item) => item.routingId).length) throw new Error("One or more routings are outside tenant scope")

  const { items: planItems, startDate, endDate, note, ...headerFields } = data

  await prisma.productionPlan.create({
    data: {
      ...headerFields,
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      note: note ?? null,
      items: {
        create: planItems.map((item) => ({
          itemId: item.itemId,
          bomId: item.bomId ?? null,
          routingId: item.routingId ?? null,
          plannedQty: item.plannedQty,
          note: item.note ?? null,
        })),
      },
    },
  })

  revalidatePath("/app/mes/production-plan")
}

export async function updatePlan(id: string, data: CreatePlanInput) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.productionPlan.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  })

  if (!existing) {
    throw new Error("Production plan not found in tenant scope")
  }

  const blockedStatuses: PlanStatus[] = ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
  if (blockedStatuses.includes(existing.status)) {
    throw new Error("This production plan status cannot be edited")
  }

  const { items: planItems, startDate, endDate, note, ...headerFields } = data

  await prisma.$transaction([
    prisma.productionPlanItem.deleteMany({ where: { planId: id, plan: { tenantId } } }),
    prisma.productionPlan.update({
      where: { id: existing.id },
      data: {
        ...headerFields,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        note: note ?? null,
        items: {
          create: planItems.map((item) => ({
            itemId: item.itemId,
            bomId: item.bomId ?? null,
            routingId: item.routingId ?? null,
            plannedQty: item.plannedQty,
            note: item.note ?? null,
          })),
        },
      },
    }),
  ])

  revalidatePath("/app/mes/production-plan")
}

export async function deletePlan(id: string) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.productionPlan.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  })

  if (!existing) {
    throw new Error("Production plan not found in tenant scope")
  }

  if (existing.status !== "DRAFT") {
    throw new Error("Only draft production plans can be deleted")
  }

  await prisma.$transaction([
    prisma.productionPlanItem.deleteMany({ where: { planId: id, plan: { tenantId } } }),
    prisma.productionPlan.delete({ where: { id: existing.id } }),
  ])

  revalidatePath("/app/mes/production-plan")
}
