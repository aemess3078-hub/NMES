"use server"

import { prisma } from "@/lib/db/prisma"
import { UserRole, PermissionAction } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getTenantId, getCurrentUser, requireRole } from "@/lib/auth"
import { canAccessFullUserManagement } from "@/lib/developer"

async function requireFullUserManagementAccess() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  if (!canAccessFullUserManagement(user)) throw new Error('FORBIDDEN')
  return user
}

export type PermissionRecord = {
  id: string
  tenantId: string
  role: UserRole
  resource: string
  action: PermissionAction
  isAllowed: boolean
}

// 1. 전체 권한 조회
export async function getPermissions(tenantId: string): Promise<PermissionRecord[]> {
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

export async function getPermissionMatrix(tenantId: string): Promise<PermissionMatrix> {
  const permissions = await getPermissions(tenantId)
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
  await requireFullUserManagementAccess()

  // 오너 권한은 수정 불가
  const perm = await prisma.rolePermission.findUnique({ where: { id } })
  if (!perm) throw new Error("권한 레코드를 찾을 수 없습니다.")
  if (perm.role === "OWNER") throw new Error("OWNER 권한은 수정할 수 없습니다.")

  await prisma.rolePermission.update({ where: { id }, data: { isAllowed } })
  revalidatePath("/app/mes/users")
}

// 4. 일괄 업데이트
export async function bulkUpdatePermissions(
  updates: { id: string; isAllowed: boolean }[]
) {
  await requireFullUserManagementAccess()

  await prisma.$transaction(
    updates.map(({ id, isAllowed }) =>
      prisma.rolePermission.update({ where: { id }, data: { isAllowed } })
    )
  )
  revalidatePath("/app/mes/users")
}

// 5. 사용자의 특정 리소스+액션 권한 확인
export async function checkPermission(
  tenantId: string,
  role: UserRole,
  resource: string,
  action: PermissionAction
): Promise<boolean> {
  if (role === "OWNER") return true

  const perm = await prisma.rolePermission.findFirst({
    where: { tenantId, role, resource, action },
  })
  return perm?.isAllowed ?? false
}
