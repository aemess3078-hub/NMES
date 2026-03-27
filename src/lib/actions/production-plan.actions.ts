"use server"

import { prisma } from "@/lib/db/prisma"
import { PlanStatus, PlanType } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

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
    plannedQty: any // Decimal
    note: string | null
    item: { id: string; code: string; name: string; itemType: string }
    bom: { id: string; version: string } | null
    routing: { id: string; version: string } | null
    workOrders: { id: string; orderNo: string; status: string }[]
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

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getProductionPlans(): Promise<PlanWithDetails[]> {
  return prisma.productionPlan.findMany({
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
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as any
}

export async function getPlanById(id: string): Promise<PlanWithDetails | null> {
  return prisma.productionPlan.findUnique({
    where: { id },
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
        },
      },
    },
  }) as any
}

export async function getSites() {
  return prisma.site.findMany({
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForPlan() {
  return prisma.item.findMany({
    where: { itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getBomsForPlanItem(itemId: string) {
  return prisma.bOM.findMany({
    where: { itemId, status: "ACTIVE" },
    select: { id: true, version: true, isDefault: true },
    orderBy: { version: "asc" },
  })
}

export async function getRoutingsForPlanItem(itemId: string) {
  return prisma.routing.findMany({
    where: { itemId, status: "ACTIVE" },
    select: { id: true, version: true, isDefault: true },
    orderBy: { version: "asc" },
  })
}

// ─── Business Logic ───────────────────────────────────────────────────────────

export async function generatePlanNo(tenantId: string, planType: PlanType): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()

  let baseNo: string

  if (planType === "DAILY") {
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    baseNo = `PP-${year}-${month}${day}`
  } else if (planType === "WEEKLY") {
    // ISO 주차 계산
    const startOfYear = new Date(year, 0, 1)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    const weekNo = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
    baseNo = `PP-${year}-W${String(weekNo).padStart(2, "0")}`
  } else {
    // MONTHLY
    const month = String(now.getMonth() + 1).padStart(2, "0")
    baseNo = `PP-${year}-M${month}`
  }

  // 중복 체크 후 suffix 추가
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

  // 이미 baseNo가 존재하면 suffix 붙이기
  const existingNos = new Set(existing.map((p) => p.planNo))
  let suffix = 2
  while (existingNos.has(`${baseNo}-${suffix}`)) {
    suffix++
  }
  return `${baseNo}-${suffix}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createPlan(data: CreatePlanInput, tenantId: string) {
  const { items, startDate, endDate, note, ...headerFields } = data

  await prisma.productionPlan.create({
    data: {
      ...headerFields,
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      note: note ?? null,
      items: {
        create: items.map((item) => ({
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
  const existing = await prisma.productionPlan.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    throw new Error("생산계획을 찾을 수 없습니다.")
  }

  const blockedStatuses: PlanStatus[] = ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
  if (blockedStatuses.includes(existing.status)) {
    throw new Error(
      `'${existing.status}' 상태의 생산계획은 수정할 수 없습니다.`
    )
  }

  const { items, startDate, endDate, note, ...headerFields } = data

  await prisma.$transaction([
    prisma.productionPlanItem.deleteMany({ where: { planId: id } }),
    prisma.productionPlan.update({
      where: { id },
      data: {
        ...headerFields,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        note: note ?? null,
        items: {
          create: items.map((item) => ({
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
  const existing = await prisma.productionPlan.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    throw new Error("생산계획을 찾을 수 없습니다.")
  }

  if (existing.status !== "DRAFT") {
    throw new Error(
      `'${existing.status}' 상태의 생산계획은 삭제할 수 없습니다. DRAFT 상태만 삭제 가능합니다.`
    )
  }

  await prisma.$transaction([
    prisma.productionPlanItem.deleteMany({ where: { planId: id } }),
    prisma.productionPlan.delete({ where: { id } }),
  ])

  revalidatePath("/app/mes/production-plan")
}
