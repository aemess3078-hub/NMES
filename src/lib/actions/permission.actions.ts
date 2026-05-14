"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { UserRole, PermissionAction } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type PermissionRecord = {
  id: string
  tenantId: string
  role: UserRole
  resource: string
  action: PermissionAction
  isAllowed: boolean
}

// 1. 전체 권한 조회
export async function getPermissions(_tenantId?: string): Promise<PermissionRecord[]> {
  const { tenantId } = await requireTenantContext()
  return prisma.rolePermission.findMany({
    where: { tenantId },
    orderBy: [{ resource: "asc" }, { role: "asc" }, { action: "asc" }],
  })
}

// 2. 권한 매트릭스 변환
// 반환: { [resource]: { [role]: { [action]: { id: string, isAllowed: boolean } } } }
export type PermissionMatrix = Record<
  string,
  Partial<Record<UserRole, Partial<Record<PermissionAction, { id: string; isAllowed: boolean }>>>>
>

export async function getPermissionMatrix(_tenantId?: string): Promise<PermissionMatrix> {
  const permissions = await getPermissions()
  const matrix: PermissionMatrix = {}

  for (const perm of permissions) {
    if (!matrix[perm.resource]) matrix[perm.resource] = {}
    if (!matrix[perm.resource][perm.role]) matrix[perm.resource][perm.role] = {}
    const rolePermissions = matrix[perm.resource][perm.role]
    if (!rolePermissions) continue

    rolePermissions[perm.action] = {
      id: perm.id,
      isAllowed: perm.isAllowed,
    }
  }

  return matrix
}

// 3. 단건 토글
export async function updatePermission(id: string, isAllowed: boolean) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.rolePermission.updateMany({
    where: { id, tenantId },
    data: { isAllowed },
  })
  if (result.count === 0) throw new Error("Permission not found in tenant scope")
  revalidatePath("/app/mes/users")
}

// 4. 일괄 업데이트
export async function bulkUpdatePermissions(
  updates: { id: string; isAllowed: boolean }[]
) {
  const { tenantId } = await requireTenantContext()
  await prisma.$transaction(
    updates.map(({ id, isAllowed }) =>
      prisma.rolePermission.updateMany({
        where: { id, tenantId },
        data: { isAllowed },
      })
    )
  )
  revalidatePath("/app/mes/users")
}
