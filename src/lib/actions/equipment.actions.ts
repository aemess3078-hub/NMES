"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { EquipmentType, EquipmentStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EquipmentWithDetails = {
  id: string
  tenantId: string
  siteId: string
  workCenterId: string
  code: string
  name: string
  equipmentType: EquipmentType
  status: EquipmentStatus
  createdAt: Date
  updatedAt: Date
  site: { id: string; code: string; name: string }
  workCenter: { id: string; code: string; name: string }
  _count: { connections: number }
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getEquipmentsWithDetails(): Promise<EquipmentWithDetails[]> {
  const tenantId = await getTenantId()
  return prisma.equipment.findMany({
    where: { tenantId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      workCenter: { select: { id: true, code: true, name: true } },
      _count: { select: { connections: true } },
    },
    orderBy: [{ site: { name: "asc" } }, { code: "asc" }],
  }) as any
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export async function getSitesForEquipment() {
  const tenantId = await getTenantId()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getWorkCentersForEquipment(siteId?: string) {
  const tenantId = await getTenantId()
  return prisma.workCenter.findMany({
    where: { site: { tenantId }, ...(siteId ? { siteId } : {}) },
    select: { id: true, code: true, name: true, siteId: true },
    orderBy: { code: "asc" },
  })
}

// ─── 등록 ─────────────────────────────────────────────────────────────────────

export type CreateEquipmentInput = {
  siteId: string
  workCenterId: string
  code: string
  name: string
  equipmentType: EquipmentType
  status?: EquipmentStatus
}

export async function createEquipment(data: CreateEquipmentInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const existing = await prisma.equipment.findUnique({
    where: { siteId_code: { siteId: data.siteId, code: data.code } },
  })
  if (existing) throw new Error(`설비코드 '${data.code}'가 이미 존재합니다.`)

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
      menuName: "설비 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/master/equipment")
}

// ─── 수정 ─────────────────────────────────────────────────────────────────────

export type UpdateEquipmentInput = {
  workCenterId?: string
  name?: string
  equipmentType?: EquipmentType
  status?: EquipmentStatus
}

export async function updateEquipment(id: string, data: UpdateEquipmentInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.equipment.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("설비를 찾을 수 없습니다.")

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
      menuName: "설비 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/master/equipment")
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

export async function deleteEquipment(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.equipment.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("설비를 찾을 수 없습니다.")

  const connCount = await prisma.equipmentConnection.count({ where: { equipmentId: id } })
  if (connCount > 0)
    throw new Error(`연결된 태그가 ${connCount}개 있습니다. 먼저 설비연결 설정에서 제거해주세요.`)

  const repairCount = await prisma.equipmentRepairRequest.count({ where: { equipmentId: id } })
  if (repairCount > 0)
    throw new Error(`수리요청 이력이 ${repairCount}건 있습니다. 이력이 있는 설비는 삭제 대신 '미사용' 상태로 변경해주세요.`)

  const checkCount = await prisma.equipmentDailyCheck.count({ where: { equipmentId: id } })
  if (checkCount > 0)
    throw new Error(`일상점검 이력이 ${checkCount}건 있습니다. 이력이 있는 설비는 삭제 대신 '미사용' 상태로 변경해주세요.`)

  const woCount = await prisma.workOrderOperationAssignment.count({ where: { equipmentId: id } })
  if (woCount > 0)
    throw new Error(`작업지시 배정 이력이 ${woCount}건 있습니다. 이력이 있는 설비는 삭제 대신 '미사용' 상태로 변경해주세요.`)

  // 자동 생성되는 모니터링 데이터는 함께 삭제 (EquipmentEvent, EquipmentOperationMap)
  await prisma.$transaction([
    prisma.equipmentEvent.deleteMany({ where: { equipmentId: id } }),
    prisma.equipmentOperationMap.deleteMany({ where: { equipmentId: id } }),
    prisma.equipment.delete({ where: { id } }),
  ])
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Equipment",
      entityId: id,
      action: "DELETE",
      beforeData: { code: owned.code, name: owned.name, equipmentType: owned.equipmentType, status: owned.status },
      menuName: "설비 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/master/equipment")
}
