"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { EquipmentStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

const REVALIDATE_PATH = "/app/mes/master/molds"

// 금형/치공구 대상 타입만 (MACHINE/VEHICLE 제외)
const MOLD_TYPES = ["TOOL", "JIG", "FIXTURE"] as const
export type MoldEquipmentType = "TOOL" | "JIG" | "FIXTURE"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoldRow = {
  id: string
  code: string
  name: string
  equipmentType: MoldEquipmentType
  siteName: string
  workCenterName: string
  status: EquipmentStatus
  updatedAt: string
}

export type MoldSummary = {
  total: number
  active: number
  inactive: number
  maintenance: number
}

export type MoldsData = {
  summary: MoldSummary
  rows: MoldRow[]
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getMoldsData(): Promise<MoldsData> {
  const tenantId = await getTenantId()

  const equipments = await prisma.equipment.findMany({
    where: { tenantId, equipmentType: { in: [...MOLD_TYPES] } },
    include: {
      site: { select: { name: true } },
      workCenter: { select: { name: true } },
    },
    orderBy: [{ site: { name: "asc" } }, { code: "asc" }],
  })

  const rows: MoldRow[] = equipments.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    equipmentType: e.equipmentType as MoldEquipmentType,
    siteName: e.site.name,
    workCenterName: e.workCenter.name,
    status: e.status,
    updatedAt: e.updatedAt.toISOString(),
  }))

  return {
    summary: {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      inactive: rows.filter((r) => r.status === "INACTIVE").length,
      maintenance: rows.filter((r) => r.status === "MAINTENANCE").length,
    },
    rows,
  }
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export async function getSitesForMold() {
  const tenantId = await getTenantId()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getWorkCentersForMold(siteId?: string) {
  const tenantId = await getTenantId()
  return prisma.workCenter.findMany({
    where: { site: { tenantId }, ...(siteId ? { siteId } : {}) },
    select: { id: true, code: true, name: true, siteId: true },
    orderBy: { code: "asc" },
  })
}

// ─── 등록 ─────────────────────────────────────────────────────────────────────

export async function createMold(data: {
  siteId: string
  workCenterId: string
  code: string
  name: string
  equipmentType: MoldEquipmentType
  status?: EquipmentStatus
}) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const existing = await prisma.equipment.findUnique({
    where: { siteId_code: { siteId: data.siteId, code: data.code } },
  })
  if (existing) throw new Error(`코드 '${data.code}'가 이미 존재합니다.`)

  const created = await prisma.equipment.create({
    data: {
      tenantId,
      siteId: data.siteId,
      workCenterId: data.workCenterId,
      code: data.code,
      name: data.name,
      equipmentType: data.equipmentType,
      status: data.status ?? "ACTIVE",
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Equipment",
      entityId: created.id,
      action: "CREATE",
      afterData: { code: created.code, name: created.name, equipmentType: created.equipmentType, status: created.status },
      menuName: "금형/치공구 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE_PATH)
}

// ─── 수정 ─────────────────────────────────────────────────────────────────────

export async function updateMold(
  id: string,
  data: {
    workCenterId?: string
    name?: string
    equipmentType?: MoldEquipmentType
    status?: EquipmentStatus
  }
) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.equipment.findFirst({
    where: { id, tenantId, equipmentType: { in: [...MOLD_TYPES] } },
  })
  if (!owned) throw new Error("금형/치공구를 찾을 수 없습니다.")

  await prisma.equipment.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Equipment",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, equipmentType: owned.equipmentType, status: owned.status },
      afterData: { code: owned.code, name: data.name ?? owned.name, equipmentType: data.equipmentType ?? owned.equipmentType, status: data.status ?? owned.status },
      menuName: "금형/치공구 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE_PATH)
}

// ─── 삭제/비활성화 ─────────────────────────────────────────────────────────────
// 이력이 있으면 hard delete 차단 → 삭제 대신 INACTIVE 상태 변경 권유

export async function deleteMold(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.equipment.findFirst({
    where: { id, tenantId, equipmentType: { in: [...MOLD_TYPES] } },
  })
  if (!owned) throw new Error("금형/치공구를 찾을 수 없습니다.")

  const [repairCount, checkCount, opCount] = await Promise.all([
    prisma.equipmentRepairRequest.count({ where: { equipmentId: id } }),
    prisma.equipmentDailyCheck.count({ where: { equipmentId: id } }),
    prisma.workOrderOperation.count({ where: { equipmentId: id } }),
  ])

  const totalRefs = repairCount + checkCount + opCount
  if (totalRefs > 0) {
    throw new Error(
      `연결된 이력이 ${totalRefs}건 있습니다. 삭제 대신 상태를 '보관중'으로 변경해 주세요.`
    )
  }

  await prisma.equipment.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Equipment",
      entityId: id,
      action: "DELETE",
      beforeData: { code: owned.code, name: owned.name, equipmentType: owned.equipmentType, status: owned.status },
      menuName: "금형/치공구 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE_PATH)
}
