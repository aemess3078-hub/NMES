"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

const GROUP_CODE = "DOWNTIME_REASON"
const REVALIDATE  = "/app/mes/master/downtime-reasons"

export type DowntimeReason = {
  id:           string
  code:         string
  name:         string
  description:  string | null
  displayOrder: number
  isActive:     boolean
  createdAt:    Date
  updatedAt:    Date
}

// CodeGroup이 없으면 upsert로 생성 후 groupId 반환
async function ensureGroup(tenantId: string): Promise<string> {
  const group = await prisma.codeGroup.upsert({
    where:  { tenantId_groupCode: { tenantId, groupCode: GROUP_CODE } },
    create: {
      tenantId,
      groupCode:   GROUP_CODE,
      groupName:   "비가동사유",
      description: "설비 비가동 발생 시 사용할 사유 기준정보",
      isSystem:    true,
      isActive:    true,
    },
    update: {},
  })
  return group.id
}

export async function getDowntimeReasons(): Promise<DowntimeReason[]> {
  const tenantId = await getTenantId()
  const group = await prisma.codeGroup.findUnique({
    where:   { tenantId_groupCode: { tenantId, groupCode: GROUP_CODE } },
    include: { codes: { orderBy: { displayOrder: "asc" } } },
  })
  return (group?.codes ?? []).map((c) => ({
    id:           c.id,
    code:         c.code,
    name:         c.name,
    description:  c.description,
    displayOrder: c.displayOrder,
    isActive:     c.isActive,
    createdAt:    c.createdAt,
    updatedAt:    c.updatedAt,
  }))
}

export type DowntimeReasonInput = {
  code:          string
  name:          string
  description?:  string | null
  displayOrder?: number
  isActive?:     boolean
}

export async function createDowntimeReason(data: DowntimeReasonInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const groupId  = await ensureGroup(tenantId)

  const dup = await prisma.commonCode.findFirst({ where: { groupId, code: data.code } })
  if (dup) throw new Error("DUPLICATE_CODE")

  const created = await prisma.commonCode.create({
    data: {
      groupId,
      code:         data.code,
      name:         data.name,
      description:  data.description ?? null,
      displayOrder: data.displayOrder ?? 0,
      isActive:     data.isActive ?? true,
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "CommonCode",
      entityId: created.id,
      action: "CREATE",
      afterData: { code: created.code, name: created.name, group: GROUP_CODE },
      menuName: "비가동 사유 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE)
}

export async function updateDowntimeReason(
  id:   string,
  data: Partial<Omit<DowntimeReasonInput, "code">>,
) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const groupId  = await ensureGroup(tenantId)

  const owned = await prisma.commonCode.findFirst({ where: { id, groupId } })
  if (!owned) throw new Error("NOT_FOUND")

  await prisma.commonCode.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "CommonCode",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, isActive: owned.isActive },
      afterData: { code: owned.code, name: data.name ?? owned.name, isActive: data.isActive ?? owned.isActive },
      menuName: "비가동 사유 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE)
}

export async function toggleDowntimeReasonActive(id: string, isActive: boolean) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const groupId  = await ensureGroup(tenantId)

  const owned = await prisma.commonCode.findFirst({ where: { id, groupId } })
  if (!owned) throw new Error("NOT_FOUND")

  await prisma.commonCode.update({ where: { id }, data: { isActive } })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "CommonCode",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, isActive: owned.isActive },
      afterData: { code: owned.code, name: owned.name, isActive },
      menuName: "비가동 사유 관리",
    },
  }).catch(() => {})
  revalidatePath(REVALIDATE)
}
