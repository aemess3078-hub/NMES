"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantUserRow = {
  id: string           // TenantUser.id (없으면 authUserId)
  profileId: string    // Supabase auth UUID
  email: string
  name: string
  department: string | null
  phone: string | null
  role: UserRole | null  // null = MES 미등록
  isActive: boolean
  createdAt: Date
  enrolled: boolean    // MES TenantUser 등록 여부
}

// ─── 사용자 목록 조회 (Supabase Auth + MES DB 병합) ──────────────────────────

export async function getTenantUsers(): Promise<TenantUserRow[]> {
  const tenantId = await getTenantId()

  // 1. Supabase Auth 전체 유저 목록 (admin API)
  type AuthUser = { id: string; email?: string; created_at: string; user_metadata?: Record<string, string> }
  let authUsers: AuthUser[] = []
  let authApiSucceeded = false
  try {
    const supabase = createAdminClient()
    const { data: authData, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (!error && authData?.users) {
      authUsers = authData.users as AuthUser[]
      authApiSucceeded = true
    }
  } catch {
    // Supabase admin API 실패 시 DB 유저만 표시
  }

  // 2. MES DB의 TenantUser 레코드
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: {
      profile: { select: { id: true, email: true, name: true, department: true, phone: true } },
    },
  })

  // profileId → TenantUser 매핑
  const tuByProfileId = new Map(tenantUsers.map((tu) => [tu.profileId, tu]))

  // 3. 병합: Supabase Auth 유저 기준으로 MES 정보 결합
  const authUserIds = new Set(authUsers.map((u) => u.id))
  const result: TenantUserRow[] = authUsers.map((authUser) => {
    const tu = tuByProfileId.get(authUser.id)
    return {
      id: tu?.id ?? authUser.id,
      profileId: authUser.id,
      email: authUser.email ?? "",
      name: tu?.profile.name ?? authUser.user_metadata?.name ?? authUser.email?.split("@")[0] ?? "",
      department: tu?.profile.department ?? null,
      phone: tu?.profile.phone ?? null,
      role: tu?.role ?? null,
      isActive: tu?.isActive ?? true,
      createdAt: new Date(authUser.created_at),
      enrolled: !!tu,
    }
  })

  // Supabase Auth API 실패 시에만 DB의 TenantUser 레코드를 fallback으로 표시
  // (auth API 성공 시에는 seed/demo 계정이 포함되지 않도록 스킵)
  if (!authApiSucceeded) {
  for (const tu of tenantUsers) {
    if (!authUserIds.has(tu.profileId)) {
      result.push({
        id: tu.id,
        profileId: tu.profileId,
        email: tu.profile.email,
        name: tu.profile.name,
        department: tu.profile.department ?? null,
        phone: tu.profile.phone ?? null,
        role: tu.role,
        isActive: tu.isActive,
        createdAt: tu.createdAt,
        enrolled: true,
      })
    }
  }
  } // end: !authApiSucceeded

  // 등록된 유저 먼저, 그 다음 미등록 유저
  result.sort((a, b) => {
    if (a.enrolled !== b.enrolled) return a.enrolled ? -1 : 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })

  return result
}

// ─── Supabase Auth 유저를 MES 테넌트에 등록 ───────────────────────────────────

export async function enrollSupabaseUser(
  authUserId: string,
  role: UserRole
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    // Supabase에서 유저 정보 가져오기
    const supabase = createAdminClient()
    const { data: { user }, error } = await supabase.auth.admin.getUserById(authUserId)
    if (error || !user) return { success: false, error: "Supabase 유저를 찾을 수 없습니다." }

    // Profile upsert
    await prisma.profile.upsert({
      where: { id: authUserId },
      create: {
        id: authUserId,
        email: user.email ?? "",
        name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "",
      },
      update: {},
    })

    // TenantUser upsert
    const existing = await prisma.tenantUser.findFirst({
      where: { tenantId, profileId: authUserId },
    })

    if (!existing) {
      await prisma.tenantUser.create({
        data: { tenantId, profileId: authUserId, role, isActive: true },
      })
    } else {
      await prisma.tenantUser.update({
        where: { id: existing.id },
        data: { role, isActive: true },
      })
    }

    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
    if (actorProfileId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorProfileId,
          entityType: "TenantUser",
          entityId: authUserId,
          action: "CREATE",
          afterData: { email: user.email, role },
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
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

    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
    if (actorProfileId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorProfileId,
          entityType: "TenantUser",
          entityId: tenantUserId,
          action: "UPDATE",
          beforeData: { role: beforeRole },
          afterData: { role: newRole, email: tenantUser.profile.email },
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
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

    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
    if (actorProfileId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorProfileId,
          entityType: "TenantUser",
          entityId: tenantUserId,
          action: "UPDATE",
          beforeData: { isActive: true },
          afterData: { isActive: false, email: tenantUser.profile.email },
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
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

    await prisma.tenantUser.update({ where: { id: tenantUserId }, data: { isActive: true } })

    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
    if (actorProfileId) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorProfileId,
          entityType: "TenantUser",
          entityId: tenantUserId,
          action: "UPDATE",
          beforeData: { isActive: false },
          afterData: { isActive: true, email: tenantUser.profile.email },
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
