"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, getCurrentUserId } from "@/lib/auth"
import { RepairRequestStatus, RepairPriority, CheckResult } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProblemTypeRow = {
  id: string
  tenantId: string
  code: string
  name: string
  category: string | null
  description: string | null
  isActive: boolean
  createdAt: Date
  _count: { repairRequests: number }
}

export type RepairRequestRow = {
  id: string
  tenantId: string
  siteId: string
  equipmentId: string
  problemTypeId: string | null
  requestNo: string
  title: string
  description: string | null
  priority: RepairPriority
  status: RepairRequestStatus
  requestedBy: string
  assignedTo: string | null
  startedAt: Date | null
  completedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
  equipment: { id: string; code: string; name: string }
  problemType: { id: string; name: string } | null
  requester: { id: string; name: string }
  assignee: { id: string; name: string } | null
  site: { id: string; name: string }
}

export type DailyCheckRow = {
  id: string
  tenantId: string
  siteId: string
  equipmentId: string
  checkDate: Date
  checkedBy: string
  result: CheckResult
  note: string | null
  items: any
  createdAt: Date
  equipment: { id: string; code: string; name: string }
  checker: { id: string; name: string }
  site: { id: string; name: string }
}

// ─── Problem Types ─────────────────────────────────────────────────────────────

export async function getProblemTypes(): Promise<ProblemTypeRow[]> {
  const tenantId = await getTenantId()
  return prisma.equipmentProblemType.findMany({
    where: { tenantId },
    include: { _count: { select: { repairRequests: true } } },
    orderBy: { code: "asc" },
  }) as any
}

export async function createProblemType(data: {
  code: string
  name: string
  category?: string
  description?: string
}) {
  const tenantId = await getTenantId()
  await prisma.equipmentProblemType.create({
    data: { tenantId, ...data },
  })
  revalidatePath("/app/mes/equipment-problems")
}

export async function updateProblemType(
  id: string,
  data: { name?: string; category?: string; description?: string; isActive?: boolean }
) {
  const tenantId = await getTenantId()
  await prisma.equipmentProblemType.update({
    where: { id, tenantId },
    data,
  })
  revalidatePath("/app/mes/equipment-problems")
}

export async function deleteProblemType(id: string) {
  const tenantId = await getTenantId()
  await prisma.equipmentProblemType.delete({ where: { id, tenantId } })
  revalidatePath("/app/mes/equipment-problems")
}

// ─── Repair Requests ───────────────────────────────────────────────────────────

export async function getRepairRequests(filters?: {
  equipmentId?: string
  status?: RepairRequestStatus
  priority?: RepairPriority
}): Promise<RepairRequestRow[]> {
  const tenantId = await getTenantId()
  return prisma.equipmentRepairRequest.findMany({
    where: { tenantId, ...filters },
    include: {
      equipment: { select: { id: true, code: true, name: true } },
      problemType: { select: { id: true, name: true } },
      requester: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  }) as any
}

export async function createRepairRequest(data: {
  equipmentId: string
  problemTypeId?: string
  title: string
  description?: string
  priority?: RepairPriority
}) {
  const tenantId = await getTenantId()
  const userId = await getCurrentUserId()

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, profileId: userId },
    include: { site: true },
  })
  const siteId = tenantUser?.siteId ?? (await prisma.site.findFirst({ where: { tenantId } }))?.id
  if (!siteId) throw new Error("사이트를 찾을 수 없습니다.")

  const count = await prisma.equipmentRepairRequest.count({ where: { tenantId } })
  const requestNo = `REP-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`

  await prisma.equipmentRepairRequest.create({
    data: {
      tenantId,
      siteId,
      equipmentId: data.equipmentId,
      problemTypeId: data.problemTypeId ?? null,
      requestNo,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority ?? "MEDIUM",
      requestedBy: userId,
    },
  })
  revalidatePath("/app/mes/equipment-repair")
}

export async function updateRepairStatus(
  id: string,
  status: RepairRequestStatus,
  extra?: { assignedTo?: string; note?: string }
) {
  const tenantId = await getTenantId()
  const now = new Date()
  await prisma.equipmentRepairRequest.update({
    where: { id, tenantId },
    data: {
      status,
      ...(status === "IN_PROGRESS" && { startedAt: now }),
      ...(status === "COMPLETED" && { completedAt: now }),
      ...extra,
    },
  })
  revalidatePath("/app/mes/equipment-repair")
}

export async function updateRepairRequest(
  id: string,
  data: {
    title?: string
    description?: string
    priority?: RepairPriority
    problemTypeId?: string
    assignedTo?: string
    note?: string
  }
) {
  const tenantId = await getTenantId()
  await prisma.equipmentRepairRequest.update({
    where: { id, tenantId },
    data,
  })
  revalidatePath("/app/mes/equipment-repair")
}

export async function deleteRepairRequest(id: string) {
  const tenantId = await getTenantId()
  await prisma.equipmentRepairRequest.delete({ where: { id, tenantId } })
  revalidatePath("/app/mes/equipment-repair")
}

// ─── Daily Checks ──────────────────────────────────────────────────────────────

export async function getDailyChecks(filters?: {
  equipmentId?: string
  from?: Date
  to?: Date
}): Promise<DailyCheckRow[]> {
  const tenantId = await getTenantId()
  return prisma.equipmentDailyCheck.findMany({
    where: {
      tenantId,
      ...(filters?.equipmentId && { equipmentId: filters.equipmentId }),
      ...(filters?.from && { checkDate: { gte: filters.from } }),
      ...(filters?.to && { checkDate: { lte: filters.to } }),
    },
    include: {
      equipment: { select: { id: true, code: true, name: true } },
      checker: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
    },
    orderBy: { checkDate: "desc" },
  }) as any
}

export async function createDailyCheck(data: {
  equipmentId: string
  checkDate: Date
  result: CheckResult
  note?: string
  items?: Record<string, string>
}) {
  const tenantId = await getTenantId()
  const userId = await getCurrentUserId()

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, profileId: userId },
  })
  const siteId = tenantUser?.siteId ?? (await prisma.site.findFirst({ where: { tenantId } }))?.id
  if (!siteId) throw new Error("사이트를 찾을 수 없습니다.")

  await prisma.equipmentDailyCheck.upsert({
    where: {
      equipmentId_checkDate: {
        equipmentId: data.equipmentId,
        checkDate: data.checkDate,
      },
    },
    update: {
      result: data.result,
      note: data.note ?? null,
      items: data.items ?? undefined,
      checkedBy: userId,
    },
    create: {
      tenantId,
      siteId,
      equipmentId: data.equipmentId,
      checkDate: data.checkDate,
      checkedBy: userId,
      result: data.result,
      note: data.note ?? null,
      items: data.items ?? undefined,
    },
  })
  revalidatePath("/app/mes/equipment-check")
}

// ─── Equipment list helper ────────────────────────────────────────────────────

export async function getEquipmentsForLMS() {
  const tenantId = await getTenantId()
  return prisma.equipment.findMany({
    where: { tenantId },
    include: { workCenter: { select: { name: true } } },
    orderBy: { code: "asc" },
  })
}

export async function getProfilesForLMS() {
  const tenantId = await getTenantId()
  const users = await prisma.tenantUser.findMany({
    where: { tenantId, isActive: true },
    include: { profile: true },
  })
  return users.map((u) => ({ id: u.profileId, name: u.profile.name }))
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getRepairStats() {
  const tenantId = await getTenantId()
  const [open, inProgress, completed, critical] = await Promise.all([
    prisma.equipmentRepairRequest.count({ where: { tenantId, status: "OPEN" } }),
    prisma.equipmentRepairRequest.count({ where: { tenantId, status: "IN_PROGRESS" } }),
    prisma.equipmentRepairRequest.count({ where: { tenantId, status: "COMPLETED" } }),
    prisma.equipmentRepairRequest.count({ where: { tenantId, priority: "CRITICAL", status: { not: "COMPLETED" } } }),
  ])
  return { open, inProgress, completed, critical }
}
