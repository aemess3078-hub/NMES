"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { revalidatePath } from "next/cache"

// 타입 정의
export type CodeGroupWithCodes = {
  id: string
  tenantId: string
  groupCode: string
  groupName: string
  description: string | null
  isSystem: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  codes: {
    id: string
    groupId: string
    code: string
    name: string
    description: string | null
    displayOrder: number
    isActive: boolean
    extra: unknown
    createdAt: Date
    updatedAt: Date
  }[]
}

// 1. 전체 CodeGroup + codes 조회
export async function getCodeGroups(): Promise<CodeGroupWithCodes[]> {
  return prisma.codeGroup.findMany({
    include: { codes: { orderBy: { displayOrder: "asc" } } },
    orderBy: { groupCode: "asc" },
  })
}

// 2. 단건 조회
export async function getCodeGroupById(id: string): Promise<CodeGroupWithCodes | null> {
  return prisma.codeGroup.findUnique({
    where: { id },
    include: { codes: { orderBy: { displayOrder: "asc" } } },
  })
}

// CodeGroup 입력 타입
export type CreateCodeGroupInput = {
  groupCode: string
  groupName: string
  description?: string | null
  isActive?: boolean
}

// 3. 그룹 생성
export async function createCodeGroup(data: CreateCodeGroupInput, tenantId: string) {
  const actor = await requireRole("OPERATOR")
  const created = await prisma.codeGroup.create({
    data: { ...data, tenantId },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "CodeGroup",
      entityId: created.id,
      action: "CREATE",
      afterData: { groupCode: created.groupCode, groupName: created.groupName },
      menuName: "공통코드 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/common-codes")
}

// 4. 그룹 수정
export async function updateCodeGroup(id: string, data: Partial<CreateCodeGroupInput>) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.codeGroup.findUnique({ where: { id } })
  await prisma.codeGroup.update({ where: { id }, data })
  if (owned) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "CodeGroup",
        entityId: id,
        action: "UPDATE",
        beforeData: { groupCode: owned.groupCode, groupName: owned.groupName, isActive: owned.isActive },
        afterData: { groupCode: data.groupCode ?? owned.groupCode, groupName: data.groupName ?? owned.groupName, isActive: data.isActive ?? owned.isActive },
        menuName: "공통코드 관리",
      },
    }).catch(() => {})
  }
  revalidatePath("/app/mes/common-codes")
}

// 5. 그룹 삭제 (isSystem=true면 불가)
export async function deleteCodeGroup(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const group = await prisma.codeGroup.findUnique({ where: { id } })
  if (group?.isSystem) throw new Error("시스템 코드 그룹은 삭제할 수 없습니다")
  await prisma.commonCode.deleteMany({ where: { groupId: id } })
  await prisma.codeGroup.delete({ where: { id } })
  if (group) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "CodeGroup",
        entityId: id,
        action: "DELETE",
        beforeData: { groupCode: group.groupCode, groupName: group.groupName },
        menuName: "공통코드 관리",
      },
    }).catch(() => {})
  }
  revalidatePath("/app/mes/common-codes")
}

// CommonCode 입력 타입
export type CreateCommonCodeInput = {
  groupId: string
  code: string
  name: string
  description?: string | null
  displayOrder?: number
  isActive?: boolean
  extra?: import("@prisma/client").Prisma.NullableJsonNullValueInput | import("@prisma/client").Prisma.InputJsonValue
}

// 6. 코드 생성
export async function createCommonCode(data: CreateCommonCodeInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const created = await prisma.commonCode.create({ data })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "CommonCode",
      entityId: created.id,
      action: "CREATE",
      afterData: { code: created.code, name: created.name, groupId: created.groupId },
      menuName: "공통코드 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/common-codes")
}

// 7. 코드 수정
export async function updateCommonCode(
  id: string,
  data: Partial<Omit<CreateCommonCodeInput, "groupId">>
) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.commonCode.findUnique({ where: { id } })
  await prisma.commonCode.update({ where: { id }, data })
  if (owned) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "CommonCode",
        entityId: id,
        action: "UPDATE",
        beforeData: { code: owned.code, name: owned.name, isActive: owned.isActive },
        afterData: { code: data.code ?? owned.code, name: data.name ?? owned.name, isActive: data.isActive ?? owned.isActive },
        menuName: "공통코드 관리",
      },
    }).catch(() => {})
  }
  revalidatePath("/app/mes/common-codes")
}

// 8. 코드 삭제
export async function deleteCommonCode(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.commonCode.findUnique({ where: { id } })
  await prisma.commonCode.delete({ where: { id } })
  if (owned) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "CommonCode",
        entityId: id,
        action: "DELETE",
        beforeData: { code: owned.code, name: owned.name, groupId: owned.groupId },
        menuName: "공통코드 관리",
      },
    }).catch(() => {})
  }
  revalidatePath("/app/mes/common-codes")
}

// 9. 코드 활성/비활성 토글
export async function toggleCodeActive(id: string, isActive: boolean) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.commonCode.findUnique({ where: { id } })
  await prisma.commonCode.update({ where: { id }, data: { isActive } })
  if (owned) {
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
        menuName: "공통코드 관리",
      },
    }).catch(() => {})
  }
  revalidatePath("/app/mes/common-codes")
}
