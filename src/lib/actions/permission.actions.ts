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

// ─── 기본 권한 카탈로그 ───────────────────────────────────────────────────────
// seed.ts와 동일한 정의를 코드 기준으로 관리.
// 운영 DB에 권한 데이터가 없을 때 자동으로 삽입하는 데 사용한다.

const ALL_ACTIONS: PermissionAction[] = ["READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT"]

const ALL_RESOURCES = [
  "PRODUCTION_PLAN", "WORK_ORDER", "ITEM", "BOM", "ROUTING",
  "INVENTORY", "QUALITY_INSPECTION", "EQUIPMENT", "COMMON_CODE",
  "USER_MANAGEMENT", "AUDIT_LOG", "APPROVAL", "REPORT",
]

const MANAGER_PERMS: Record<string, PermissionAction[]> = {
  PRODUCTION_PLAN:    ["READ", "CREATE", "UPDATE"],
  WORK_ORDER:         ["READ", "CREATE", "UPDATE"],
  ITEM:               ["READ", "CREATE", "UPDATE"],
  BOM:                ["READ", "CREATE", "UPDATE"],
  ROUTING:            ["READ", "CREATE", "UPDATE"],
  INVENTORY:          ["READ", "CREATE", "UPDATE"],
  QUALITY_INSPECTION: ["READ", "CREATE", "UPDATE"],
  EQUIPMENT:          ["READ", "CREATE", "UPDATE"],
  COMMON_CODE:        ["READ"],
  USER_MANAGEMENT:    ["READ"],
  AUDIT_LOG:          ["READ"],
  APPROVAL:           ["READ", "CREATE", "APPROVE"],
  REPORT:             ["READ", "EXPORT"],
}

const OPERATOR_PERMS: Record<string, PermissionAction[]> = {
  PRODUCTION_PLAN:    ["READ"],
  WORK_ORDER:         ["READ", "UPDATE"],
  ITEM:               ["READ"],
  BOM:                ["READ"],
  ROUTING:            ["READ"],
  INVENTORY:          ["READ", "CREATE", "UPDATE"],
  QUALITY_INSPECTION: ["READ", "CREATE"],
  EQUIPMENT:          ["READ"],
  COMMON_CODE:        ["READ"],
  APPROVAL:           ["READ", "CREATE"],
  REPORT:             ["READ"],
}

const VIEWER_RESOURCES = [
  "PRODUCTION_PLAN", "WORK_ORDER", "ITEM", "BOM", "ROUTING",
  "INVENTORY", "QUALITY_INSPECTION", "EQUIPMENT", "COMMON_CODE",
  "APPROVAL", "REPORT",
]

function buildDefaultPermissionRows(tenantId: string) {
  type PermRow = { tenantId: string; role: UserRole; resource: string; action: PermissionAction; isAllowed: boolean }
  const rows: PermRow[] = []

  for (const role of ["OWNER", "ADMIN"] as UserRole[]) {
    for (const resource of ALL_RESOURCES) {
      for (const action of ALL_ACTIONS) {
        rows.push({ tenantId, role, resource, action, isAllowed: true })
      }
    }
  }

  for (const [resource, actions] of Object.entries(MANAGER_PERMS)) {
    for (const action of actions) {
      rows.push({ tenantId, role: "MANAGER", resource, action, isAllowed: true })
    }
  }

  for (const [resource, actions] of Object.entries(OPERATOR_PERMS)) {
    for (const action of actions) {
      rows.push({ tenantId, role: "OPERATOR", resource, action, isAllowed: true })
    }
  }

  for (const resource of VIEWER_RESOURCES) {
    rows.push({ tenantId, role: "VIEWER", resource, action: "READ", isAllowed: true })
  }

  return rows
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

// 2-a. 권한 매트릭스 조회 + 없으면 기본값 자동 삽입 (운영 환경용)
// 업무 더미 데이터 없이 권한 정의만 초기화한다.
export async function ensurePermissionMatrix(tenantId: string): Promise<PermissionMatrix> {
  try {
    // skipDuplicates=true로 항상 실행 → 누락 role 행만 추가, 기존 행 유지.
    // count 게이트 없이 실행해야 OWNER/ADMIN만 있고 MANAGER/OPERATOR/VIEWER가
    // 없는 부분 삽입 상태를 자동으로 보정할 수 있다.
    const rows = buildDefaultPermissionRows(tenantId)
    await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true })
  } catch (e) {
    // 자동 초기화 실패는 치명적이지 않다. 기존 데이터만이라도 표시한다.
    console.error("[ensurePermissionMatrix] 자동 초기화 실패:", e)
  }

  return getPermissionMatrix(tenantId)
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
