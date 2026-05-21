"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"

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
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
