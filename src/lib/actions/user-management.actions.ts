"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantUserRow = {
  id: string           // TenantUser.id
  profileId: string
  email: string
  name: string
  department: string | null
  phone: string | null
  role: UserRole
  isActive: boolean
  createdAt: Date
}

// ─── 사용자 목록 조회 ─────────────────────────────────────────────────────────

export async function getTenantUsers(): Promise<TenantUserRow[]> {
  const tenantId = await getTenantId()
  await requireRole("ADMIN")

  const rows = await prisma.tenantUser.findMany({
    where: { tenantId },
    include: {
      profile: { select: { id: true, email: true, name: true, department: true, phone: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  })

  return rows.map((r) => ({
    id: r.id,
    profileId: r.profileId,
    email: r.profile.email,
    name: r.profile.name,
    department: r.profile.department,
    phone: r.profile.phone,
    role: r.role,
    isActive: r.isActive,
    createdAt: r.createdAt,
  }))
}

// ─── 역할 변경 ────────────────────────────────────────────────────────────────

export async function updateUserRole(
  tenantUserId: string,
  newRole: UserRole
): Promise<void> {
  const tenantId = await getTenantId()
  const actor = await requireRole("ADMIN")

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { id: tenantUserId, tenantId },
    include: { profile: true },
  })
  if (!tenantUser) throw new Error("사용자를 찾을 수 없습니다.")

  // 자신의 역할을 변경하려면 OWNER이어야 함
  if (tenantUser.profileId === actor.id && actor.role !== "OWNER") {
    throw new Error("본인의 역할은 변경할 수 없습니다.")
  }

  // OWNER 역할 부여는 기존 OWNER만 가능
  if (newRole === "OWNER" && actor.role !== "OWNER") {
    throw new Error("OWNER 역할 부여는 OWNER만 가능합니다.")
  }

  // 마지막 OWNER의 역할을 변경하려는 경우 차단
  if (tenantUser.role === "OWNER") {
    const ownerCount = await prisma.tenantUser.count({
      where: { tenantId, role: "OWNER", isActive: true },
    })
    if (ownerCount <= 1 && newRole !== "OWNER") {
      throw new Error("마지막 OWNER의 역할은 변경할 수 없습니다.")
    }
  }

  const beforeRole = tenantUser.role
  await prisma.tenantUser.update({
    where: { id: tenantUserId },
    data: { role: newRole },
  })

  // AuditLog
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
}

// ─── 비활성화 ─────────────────────────────────────────────────────────────────

export async function deactivateUser(tenantUserId: string): Promise<void> {
  const tenantId = await getTenantId()
  const actor = await requireRole("ADMIN")

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { id: tenantUserId, tenantId },
    include: { profile: true },
  })
  if (!tenantUser) throw new Error("사용자를 찾을 수 없습니다.")

  // 본인 비활성화 불가
  if (tenantUser.profileId === actor.id) {
    throw new Error("본인 계정은 비활성화할 수 없습니다.")
  }

  // 마지막 OWNER 보호
  if (tenantUser.role === "OWNER") {
    const ownerCount = await prisma.tenantUser.count({
      where: { tenantId, role: "OWNER", isActive: true },
    })
    if (ownerCount <= 1) {
      throw new Error("마지막 OWNER 계정은 비활성화할 수 없습니다.")
    }
  }

  await prisma.tenantUser.update({
    where: { id: tenantUserId },
    data: { isActive: false },
  })

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
}

// ─── 재활성화 ─────────────────────────────────────────────────────────────────

export async function reactivateUser(tenantUserId: string): Promise<void> {
  const tenantId = await getTenantId()
  const actor = await requireRole("ADMIN")

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { id: tenantUserId, tenantId },
    include: { profile: true },
  })
  if (!tenantUser) throw new Error("사용자를 찾을 수 없습니다.")

  await prisma.tenantUser.update({
    where: { id: tenantUserId },
    data: { isActive: true },
  })

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
}
