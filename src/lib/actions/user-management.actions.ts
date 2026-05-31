"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { UserRole, type AuditAction, type LoginEventType, type LoginFailReason, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getErrorMessage } from "@/lib/utils"

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
  await requireRole("ADMIN")

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
        beforeData: { role: beforeRole },
        afterData: { role: newRole, email: tenantUser.profile.email },
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
        beforeData: { isActive: true },
        afterData: { isActive: false, email: tenantUser.profile.email },
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
  await requireRole("ADMIN")

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

export async function getAuditLogs(
  filter: AuditLogFilter = {}
): Promise<AuditLogRow[]> {
  const tenantId = await getTenantId()
  await requireRole("ADMIN")

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
    ]
  }

  const rows = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true } } },
    orderBy: { actedAt: "desc" },
    take: 500,
  })

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actor?.name ?? null,
    actorLabel: r.actorLabel,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    menuName: r.menuName,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    actedAt: r.actedAt.toISOString(),
  }))
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
        beforeData: { isActive: false },
        afterData: { isActive: true, email: tenantUser.profile.email },
      },
    })

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}
