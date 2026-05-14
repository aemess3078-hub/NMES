"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

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

export async function getCodeGroups(): Promise<CodeGroupWithCodes[]> {
  const { tenantId } = await requireTenantContext()

  return prisma.codeGroup.findMany({
    where: { tenantId },
    include: { codes: { orderBy: { displayOrder: "asc" } } },
    orderBy: { groupCode: "asc" },
  })
}

export async function getCodeGroupById(id: string): Promise<CodeGroupWithCodes | null> {
  const { tenantId } = await requireTenantContext()

  return prisma.codeGroup.findFirst({
    where: { id, tenantId },
    include: { codes: { orderBy: { displayOrder: "asc" } } },
  })
}

export type CreateCodeGroupInput = {
  groupCode: string
  groupName: string
  description?: string | null
  isActive?: boolean
}

export async function createCodeGroup(data: CreateCodeGroupInput, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()

  await prisma.codeGroup.create({
    data: { ...data, tenantId },
  })
  revalidatePath("/app/mes/common-codes")
}

export async function updateCodeGroup(id: string, data: Partial<CreateCodeGroupInput>) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.codeGroup.updateMany({
    where: { id, tenantId },
    data,
  })

  if (result.count === 0) {
    throw new Error("Code group not found in tenant scope")
  }

  revalidatePath("/app/mes/common-codes")
}

export async function deleteCodeGroup(id: string) {
  const { tenantId } = await requireTenantContext()
  const group = await prisma.codeGroup.findFirst({
    where: { id, tenantId },
    select: { id: true, isSystem: true },
  })

  if (!group) {
    throw new Error("Code group not found in tenant scope")
  }

  if (group.isSystem) {
    throw new Error("System code groups cannot be deleted")
  }

  await prisma.commonCode.deleteMany({
    where: { groupId: id, group: { tenantId } },
  })
  await prisma.codeGroup.deleteMany({
    where: { id, tenantId },
  })
  revalidatePath("/app/mes/common-codes")
}

export type CreateCommonCodeInput = {
  groupId: string
  code: string
  name: string
  description?: string | null
  displayOrder?: number
  isActive?: boolean
  extra?: import("@prisma/client").Prisma.NullableJsonNullValueInput | import("@prisma/client").Prisma.InputJsonValue
}

export async function createCommonCode(data: CreateCommonCodeInput) {
  const { tenantId } = await requireTenantContext()
  const group = await prisma.codeGroup.findFirst({
    where: { id: data.groupId, tenantId },
    select: { id: true },
  })

  if (!group) {
    throw new Error("Code group not found in tenant scope")
  }

  await prisma.commonCode.create({ data })
  revalidatePath("/app/mes/common-codes")
}

export async function updateCommonCode(
  id: string,
  data: Partial<Omit<CreateCommonCodeInput, "groupId">>
) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.commonCode.updateMany({
    where: { id, group: { tenantId } },
    data,
  })

  if (result.count === 0) {
    throw new Error("Code not found in tenant scope")
  }

  revalidatePath("/app/mes/common-codes")
}

export async function deleteCommonCode(id: string) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.commonCode.deleteMany({
    where: { id, group: { tenantId } },
  })

  if (result.count === 0) {
    throw new Error("Code not found in tenant scope")
  }

  revalidatePath("/app/mes/common-codes")
}

export async function toggleCodeActive(id: string, isActive: boolean) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.commonCode.updateMany({
    where: { id, group: { tenantId } },
    data: { isActive },
  })

  if (result.count === 0) {
    throw new Error("Code not found in tenant scope")
  }

  revalidatePath("/app/mes/common-codes")
}
