"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, getCurrentUser, requireRole } from "@/lib/auth"
import { canAccessFullUserManagement } from "@/lib/developer"
import { hashPassword } from "@/lib/password"
import { UserRole, type AuditAction, type LoginEventType, type LoginFailReason, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getErrorMessage } from "@/lib/utils"

const RESET_PASSWORD = 'Cns@123'

async function requireFullUserManagementAccess() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  if (!canAccessFullUserManagement(user)) throw new Error('FORBIDDEN')
  return user
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantUserRow = {
  id: string           // TenantUser.id
  profileId: string    // Profile.id (= Supabase auth UUID)
  email: string
  name: string
  department: string | null
  jobTitle: string | null
  phone: string | null
  loginId: string | null
  role: UserRole
  isActive: boolean
  createdAt: Date
}

function isDemoSeedEmail(email: string) {
  return email.toLowerCase().endsWith("@demo-mes.internal")
}

// ─── 사용자 목록 조회 (DB 기준: profiles + TenantUser) ───────────────────────

export async function getTenantUsers(): Promise<TenantUserRow[]> {
  const tenantId = await getTenantId()
  await requireRole("VIEWER")

  // DB의 TenantUser + Profile 기준으로 조회 (Auth API 의존 제거)
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: {
      profile: {
        select: {
          id: true, email: true, name: true,
          department: true, phone: true, jobTitle: true,
          createdAt: true,
          userCredential: { select: { loginId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  // seed/demo 계정 필터링
  const result: TenantUserRow[] = tenantUsers
    .filter((tu) => !isDemoSeedEmail(tu.profile.email))
    .map((tu) => ({
      id: tu.id,
      profileId: tu.profileId,
      email: tu.profile.email,
      name: tu.profile.name || tu.profile.email.split("@")[0] || "",
      department: tu.profile.department ?? null,
      jobTitle: tu.profile.jobTitle ?? null,
      phone: tu.profile.phone ?? null,
      loginId: tu.profile.userCredential?.loginId ?? null,
      role: tu.role,
      isActive: tu.isActive,
      createdAt: tu.createdAt,
    }))

  return result
}

// ─── 역할 변경 ────────────────────────────────────────────────────────────────

export async function updateUserRole(
  tenantUserId: string,
  newRole: UserRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { profile: true },
    })
    if (!tenantUser) return { success: false, error: "사용자를 찾을 수 없습니다." }
    if (isDemoSeedEmail(tenantUser.profile.email)) {
      return { success: false, error: "Seed/demo 계정은 운영 UI에서 관리할 수 없습니다." }
    }

    if (tenantUser.profileId === actor.id && actor.role !== "OWNER") {
      return { success: false, error: "본인의 역할은 변경할 수 없습니다." }
    }
    if (newRole === "OWNER" && actor.role !== "OWNER") {
      return { success: false, error: "OWNER 역할 부여는 OWNER만 가능합니다." }
    }
    if (tenantUser.role === "OWNER") {
      const ownerCount = await prisma.tenantUser.count({
        where: { tenantId, role: "OWNER", isActive: true },
      })
      if (ownerCount <= 1 && newRole !== "OWNER") {
        return { success: false, error: "마지막 OWNER의 역할은 변경할 수 없습니다." }
      }
    }

    const beforeRole = tenantUser.role
    await prisma.tenantUser.update({ where: { id: tenantUserId }, data: { role: newRole } })

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityType: "TenantUser",
        entityId: tenantUserId,
        action: "UPDATE",
        beforeData: { role: beforeRole, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
        afterData: { role: newRole, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
      },
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}

// ─── 비활성화 ─────────────────────────────────────────────────────────────────

export async function deactivateUser(tenantUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { profile: true },
    })
    if (!tenantUser) return { success: false, error: "사용자를 찾을 수 없습니다." }
    if (isDemoSeedEmail(tenantUser.profile.email)) {
      return { success: false, error: "Seed/demo 계정은 운영 UI에서 관리할 수 없습니다." }
    }

    if (tenantUser.profileId === actor.id) {
      return { success: false, error: "본인 계정은 비활성화할 수 없습니다." }
    }
    if (tenantUser.role === "OWNER") {
      const ownerCount = await prisma.tenantUser.count({
        where: { tenantId, role: "OWNER", isActive: true },
      })
      if (ownerCount <= 1) {
        return { success: false, error: "마지막 OWNER 계정은 비활성화할 수 없습니다." }
      }
    }

    await prisma.tenantUser.update({ where: { id: tenantUserId }, data: { isActive: false } })

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityType: "TenantUser",
        entityId: tenantUserId,
        action: "UPDATE",
        beforeData: { isActive: true, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
        afterData: { isActive: false, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
      },
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}

// ─── 사용 이력 점검 (영구삭제 가능 여부) ──────────────────────────────────────
//  Profile에 연결된 업무/접속 이력을 모두 검사한다.
//  하나라도 있으면 hard delete 금지(이력 추적성 보존).
const HISTORY_RELATIONS = [
  "qualityInspections",
  "auditLogs",
  "approvalRequests",
  "approvals",
  "receivingInspections",
  "ecnRequested",
  "ecnApproved",
  "signupsApproved",
  "signupsRejected",
  "repairRequested",
  "repairAssigned",
  "dailyChecks",
  "loginHistories",
] as const

async function getProfileHistoryCounts(profileId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      _count: {
        select: {
          qualityInspections: true,
          auditLogs: true,
          approvalRequests: true,
          approvals: true,
          receivingInspections: true,
          ecnRequested: true,
          ecnApproved: true,
          signupsApproved: true,
          signupsRejected: true,
          repairRequested: true,
          repairAssigned: true,
          dailyChecks: true,
          loginHistories: true,
          tenantUsers: true,
        },
      },
    },
  })
  return profile?._count ?? null
}

// ─── 영구삭제 (이력 없는 계정만) ──────────────────────────────────────────────

export async function deleteUserPermanently(
  tenantUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { profile: true },
    })
    if (!tenantUser) return { success: false, error: "사용자를 찾을 수 없습니다." }
    if (isDemoSeedEmail(tenantUser.profile.email)) {
      return { success: false, error: "Seed/demo 계정은 운영 UI에서 관리할 수 없습니다." }
    }
    if (tenantUser.profileId === actor.id) {
      return { success: false, error: "본인 계정은 삭제할 수 없습니다." }
    }
    if (tenantUser.role === "OWNER") {
      return { success: false, error: "OWNER 계정은 영구삭제할 수 없습니다." }
    }

    const counts = await getProfileHistoryCounts(tenantUser.profileId)
    if (!counts) return { success: false, error: "사용자 프로필을 찾을 수 없습니다." }

    // 다른 사업장에도 소속된 공용 프로필이면 영구삭제 금지
    if (counts.tenantUsers > 1) {
      return {
        success: false,
        error: "다른 사업장에도 소속된 계정이라 영구삭제할 수 없습니다. 퇴사처리로 목록에서 숨길 수 있습니다.",
      }
    }

    const historyTotal = HISTORY_RELATIONS.reduce(
      (sum, key) => sum + (counts[key as keyof typeof counts] ?? 0),
      0,
    )
    if (historyTotal > 0) {
      return {
        success: false,
        error:
          "이 사용자는 생산/품질/재고/출하 또는 접속 이력이 있어 영구삭제할 수 없습니다. 퇴사처리로 목록에서 숨길 수 있습니다.",
      }
    }

    const { profileId, profile } = tenantUser
    // 삭제 후에는 Profile 정보를 읽을 수 없으므로 트랜잭션 전에 보존
    const targetEmail = profile.email
    const targetName = profile.name

    // 이력이 전혀 없는 계정만 도달 → 인증/멤버십/프로필 삭제 + 감사 로그를
    // 하나의 트랜잭션으로 묶는다. AuditLog 기록 실패 시 삭제 전체가 rollback되어
    // "계정은 사라졌는데 삭제 기록은 남지 않는" 감사 추적 누락을 방지한다.
    // actorId는 현재 관리자(actor.id)이므로 삭제 대상 Profile을 지워도 FK 충돌이 없다.
    await prisma.$transaction(async (tx) => {
      await tx.userCredential.deleteMany({ where: { profileId } })
      await tx.tenantUser.delete({ where: { id: tenantUserId } })
      await tx.profile.delete({ where: { id: profileId } })

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "Profile",
          entityId: profileId,
          action: "DELETE",
          beforeData: { email: targetEmail, name: targetName, tenantUserId },
        },
      })
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}

// ─── 접속 기록 조회 (LoginHistory) ────────────────────────────────────────────

export type LoginHistoryRow = {
  id: string
  loginId: string
  name: string | null
  email: string | null
  eventType: LoginEventType
  failReason: LoginFailReason | null
  ipAddress: string | null
  userAgent: string | null
  isActiveUser: boolean | null   // null = 프로필 없음(미가입 시도)
  createdAt: string
}

export type LoginHistoryFilter = {
  search?: string
  event?: "ALL" | "SUCCESS" | "FAIL"
  days?: number          // 최근 N일, 0/미지정 = 전체
}

export async function getLoginHistory(
  filter: LoginHistoryFilter = {}
): Promise<LoginHistoryRow[]> {
  const tenantId = await getTenantId()
  await requireFullUserManagementAccess()

  const where: Prisma.LoginHistoryWhereInput = { tenantId }

  if (filter.event === "SUCCESS") where.eventType = "LOGIN_SUCCESS"
  else if (filter.event === "FAIL") where.eventType = "LOGIN_FAIL"

  if (filter.days && filter.days > 0) {
    const from = new Date()
    from.setDate(from.getDate() - filter.days)
    where.createdAt = { gte: from }
  }

  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    where.OR = [
      { loginId: { contains: q, mode: "insensitive" } },
      { profile: { name: { contains: q, mode: "insensitive" } } },
      { profile: { email: { contains: q, mode: "insensitive" } } },
    ]
  }

  const rows = await prisma.loginHistory.findMany({
    where,
    include: {
      profile: {
        select: {
          name: true,
          email: true,
          tenantUsers: { where: { tenantId }, select: { isActive: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  return rows.map((r) => ({
    id: r.id,
    loginId: r.loginId,
    name: r.profile?.name ?? null,
    email: r.profile?.email ?? null,
    eventType: r.eventType,
    failReason: r.failReason,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    isActiveUser: r.profile ? (r.profile.tenantUsers[0]?.isActive ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

// ─── 이용 로그 조회 (AuditLog) ────────────────────────────────────────────────

export type AuditLogRow = {
  id: string
  actorName: string | null
  actorLabel: string | null
  entityType: string
  entityId: string
  targetLabel: string        // 사람이 읽을 수 있는 작업 대상 설명
  action: AuditAction
  menuName: string | null
  ipAddress: string | null
  userAgent: string | null
  actedAt: string
}

export type AuditLogFilter = {
  search?: string
  action?: AuditAction | "ALL"
  entityType?: string
  days?: number
}

/**
 * AuditLog 한 행의 entityType / metadata를 바탕으로
 * 사람이 읽을 수 있는 작업 대상 레이블을 생성한다.
 *
 * 우선순위:
 *   1) beforeData / afterData 에 있는 이름·이메일 (삭제된 사용자도 표시 가능)
 *   2) 현재 DB에서 조회한 TenantUser / Profile 정보 (batch로 미리 조회)
 *   3) entityId 앞 8자리 + "확인 불가" fallback
 */
function buildTargetLabel(
  entityType: string,
  entityId: string,
  action: string,
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null,
  tuMap: Map<string, { name: string; email: string }>,
  profileMap: Map<string, { name: string; email: string }>,
): string {
  const after = afterData ?? {}
  const before = beforeData ?? {}

  if (entityType === "TenantUser" || entityType === "Profile") {
    // 메타데이터에서 이름/이메일 우선 추출
    const emailFromMeta =
      (after.targetUserEmail as string | undefined) ??
      (after.email as string | undefined) ??
      (before.targetUserEmail as string | undefined) ??
      (before.email as string | undefined) ??
      null
    const nameFromMeta =
      (after.targetUserName as string | undefined) ??
      (after.name as string | undefined) ??
      (before.targetUserName as string | undefined) ??
      (before.name as string | undefined) ??
      null

    // DB 조회 fallback (메타데이터 없거나 구 로그인 경우)
    const dbInfo =
      entityType === "TenantUser" ? tuMap.get(entityId) : profileMap.get(entityId)

    const email = emailFromMeta ?? dbInfo?.email
    const name = nameFromMeta ?? dbInfo?.name

    if (!email && !name) {
      if (!entityId) return "대상 정보 없음"
      return `삭제된 사용자 (ID: ${entityId.slice(0, 8)}…)`
    }

    const displayName = name || email?.split("@")[0] || ""
    let label = displayName
    if (email && email !== displayName) label += ` / ${email}`

    // 역할 변경 주석
    if (action === "UPDATE") {
      const beforeRole = before.role as string | undefined
      const afterRole = after.role as string | undefined
      if (beforeRole && afterRole && beforeRole !== afterRole) {
        label += ` (${beforeRole} → ${afterRole})`
      }
      // 활성화/비활성화 주석
      const afterActive = after.isActive
      if (typeof afterActive === "boolean") {
        label += afterActive ? " [재활성화]" : " [비활성화]"
      }
    }
    if (action === "DELETE") {
      label += " [삭제됨]"
    }

    return label
  }

  // EngineeringChange (변경관리 ECN)
  if (entityType === "EngineeringChange") {
    const ecnNo =
      (after.ecnNo as string | undefined) ?? (before.ecnNo as string | undefined)
    if (ecnNo) return `ECN: ${ecnNo}`
    if (!entityId) return "—"
    return `변경요청 (ID: ${entityId.slice(0, 8)}…)`
  }

  // 기타 엔티티 — entityType + id 앞 8자리
  if (!entityId) return "—"
  return `${entityType} (ID: ${entityId.slice(0, 8)}…)`
}

export async function getAuditLogs(
  filter: AuditLogFilter = {}
): Promise<AuditLogRow[]> {
  const tenantId = await getTenantId()
  await requireFullUserManagementAccess()

  const where: Prisma.AuditLogWhereInput = { tenantId }

  if (filter.action && filter.action !== "ALL") where.action = filter.action
  if (filter.entityType && filter.entityType.trim()) where.entityType = filter.entityType.trim()

  if (filter.days && filter.days > 0) {
    const from = new Date()
    from.setDate(from.getDate() - filter.days)
    where.actedAt = { gte: from }
  }

  if (filter.search && filter.search.trim()) {
    const q = filter.search.trim()
    where.OR = [
      { entityId: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { actorLabel: { contains: q, mode: "insensitive" } },
      { menuName: { contains: q, mode: "insensitive" } },
      { actor: { name: { contains: q, mode: "insensitive" } } },
      // afterData / beforeData JSON 내 이메일·이름 검색 (Postgres JSON path)
      { afterData: { path: ["targetUserEmail"], string_contains: q } },
      { afterData: { path: ["email"], string_contains: q } },
      { afterData: { path: ["targetUserName"], string_contains: q } },
      { beforeData: { path: ["targetUserEmail"], string_contains: q } },
      { beforeData: { path: ["targetUserName"], string_contains: q } },
    ]
  }

  const rows = await prisma.auditLog.findMany({
    where,
    select: {
      id: true,
      actorLabel: true,
      entityType: true,
      entityId: true,
      action: true,
      menuName: true,
      ipAddress: true,
      userAgent: true,
      actedAt: true,
      beforeData: true,
      afterData: true,
      actor: { select: { name: true } },
    },
    orderBy: { actedAt: "desc" },
    take: 500,
  })

  // ─── Batch lookup: TenantUser → Profile (N+1 방지) ─────────────────────────
  const tuIds = Array.from(new Set(
    rows.filter((r) => r.entityType === "TenantUser").map((r) => r.entityId)
  ))
  const profileIds = Array.from(new Set(
    rows.filter((r) => r.entityType === "Profile").map((r) => r.entityId)
  ))

  const [tuRows, profileRows] = await Promise.all([
    tuIds.length > 0
      ? prisma.tenantUser.findMany({
          where: { id: { in: tuIds } },
          select: { id: true, profile: { select: { name: true, email: true } } },
        })
      : Promise.resolve([] as { id: string; profile: { name: string; email: string } }[]),
    profileIds.length > 0
      ? prisma.profile.findMany({
          where: { id: { in: profileIds } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([] as { id: string; name: string; email: string }[]),
  ])

  const tuMap = new Map<string, { name: string; email: string }>(
    tuRows.map((tu) => [tu.id, { name: tu.profile.name || "", email: tu.profile.email }])
  )
  const profileMap = new Map<string, { name: string; email: string }>(
    profileRows.map((p) => [p.id, { name: p.name || "", email: p.email }])
  )
  // ──────────────────────────────────────────────────────────────────────────

  return rows.map((r) => {
    const before = r.beforeData as Record<string, unknown> | null
    const after = r.afterData as Record<string, unknown> | null
    return {
      id: r.id,
      actorName: r.actor?.name ?? null,
      actorLabel: r.actorLabel,
      entityType: r.entityType,
      entityId: r.entityId,
      targetLabel: buildTargetLabel(r.entityType, r.entityId, r.action, before, after, tuMap, profileMap),
      action: r.action,
      menuName: r.menuName,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      actedAt: r.actedAt.toISOString(),
    }
  })
}

// ─── 재활성화 ─────────────────────────────────────────────────────────────────

export async function reactivateUser(tenantUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { profile: true },
    })
    if (!tenantUser) return { success: false, error: "사용자를 찾을 수 없습니다." }
    if (isDemoSeedEmail(tenantUser.profile.email)) {
      return { success: false, error: "Seed/demo 계정은 운영 UI에서 관리할 수 없습니다." }
    }

    await prisma.tenantUser.update({ where: { id: tenantUserId }, data: { isActive: true } })

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        entityType: "TenantUser",
        entityId: tenantUserId,
        action: "UPDATE",
        beforeData: { isActive: false, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
        afterData: { isActive: true, targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
      },
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}

// ─── 비밀번호 초기화 (test/OWNER 전용) ────────────────────────────────────────

export async function resetUserPassword(
  tenantUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireFullUserManagementAccess()

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { profile: { include: { userCredential: { select: { id: true } } } } },
    })
    if (!tenantUser) return { success: false, error: "사용자를 찾을 수 없습니다." }
    if (isDemoSeedEmail(tenantUser.profile.email)) {
      return { success: false, error: "Seed/demo 계정은 운영 UI에서 관리할 수 없습니다." }
    }
    if (tenantUser.profileId === actor.id) {
      return { success: false, error: "본인 계정의 비밀번호는 초기화할 수 없습니다." }
    }

    const credential = tenantUser.profile.userCredential
    if (!credential) return { success: false, error: "계정 인증 정보가 없습니다." }

    const newHash = await hashPassword(RESET_PASSWORD)

    await prisma.userCredential.update({
      where: { id: credential.id },
      data: {
        passwordHash: newHash,
        mustChangePw: true,
        isLocked: false,
        failCount: 0,
        lockedAt: null,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "UserCredential",
        entityId: credential.id,
        action: "UPDATE",
        beforeData: { targetUserName: tenantUser.profile.name, targetUserEmail: tenantUser.profile.email },
        afterData: {
          targetUserName: tenantUser.profile.name,
          targetUserEmail: tenantUser.profile.email,
          passwordReset: true,
          mustChangePw: true,
        },
      },
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}
