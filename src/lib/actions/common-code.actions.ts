"use server"

import { prisma } from "@/lib/db/prisma"
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
  await prisma.codeGroup.create({
    data: { ...data, tenantId },
  })
  revalidatePath("/app/mes/common-codes")
}

// 4. 그룹 수정
export async function updateCodeGroup(id: string, data: Partial<CreateCodeGroupInput>) {
  await prisma.codeGroup.update({ where: { id }, data })
  revalidatePath("/app/mes/common-codes")
}

// 5. 그룹 삭제 (isSystem=true면 불가)
export async function deleteCodeGroup(id: string) {
  const group = await prisma.codeGroup.findUnique({ where: { id } })
  if (group?.isSystem) throw new Error("시스템 코드 그룹은 삭제할 수 없습니다")
  await prisma.commonCode.deleteMany({ where: { groupId: id } })
  await prisma.codeGroup.delete({ where: { id } })
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
}

// 6. 코드 생성
export async function createCommonCode(data: CreateCommonCodeInput) {
  await prisma.commonCode.create({ data })
  revalidatePath("/app/mes/common-codes")
}

// 7. 코드 수정
export async function updateCommonCode(
  id: string,
  data: Partial<Omit<CreateCommonCodeInput, "groupId">>
) {
  await prisma.commonCode.update({ where: { id }, data })
  revalidatePath("/app/mes/common-codes")
}

// 8. 코드 삭제
export async function deleteCommonCode(id: string) {
  await prisma.commonCode.delete({ where: { id } })
  revalidatePath("/app/mes/common-codes")
}

// 9. 코드 활성/비활성 토글
export async function toggleCodeActive(id: string, isActive: boolean) {
  await prisma.commonCode.update({ where: { id }, data: { isActive } })
  revalidatePath("/app/mes/common-codes")
}
