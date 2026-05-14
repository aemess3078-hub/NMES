"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, getCurrentUser, requireRole } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { UserRole, SignupRequestStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateSignupRequestInput = {
  tenantId: string
  email: string
  name: string
  department?: string
  phone?: string
  requestedRole?: UserRole
}

export type SignupRequestRow = {
  id: string
  tenantId: string
  email: string
  name: string
  department: string | null
  phone: string | null
  requestedRole: UserRole
  status: SignupRequestStatus
  createdAt: Date
  approvedAt: Date | null
  rejectedAt: Date | null
  rejectReason: string | null
  approvedBy: { id: string; name: string; email: string } | null
  rejectedBy: { id: string; name: string; email: string } | null
}

// ─── 공개: 가입 신청 제출 (인증 불필요) ───────────────────────────────────────

export async function createSignupRequest(
  input: CreateSignupRequestInput
): Promise<{ success: boolean; message: string }> {
  // 중복 이메일 + PENDING 체크
  const existing = await prisma.signupRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      email: input.email,
      status: "PENDING",
    },
  })
  if (existing) {
    return { success: false, message: "이미 동일한 이메일로 대기 중인 신청이 있습니다." }
  }

  // 이미 활성 사용자인지 체크
  const activeProfile = await prisma.profile.findFirst({
    where: { email: input.email },
  })
  if (activeProfile) {
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, profileId: activeProfile.id, isActive: true },
    })
    if (tenantUser) {
      return { success: false, message: "이미 등록된 사용자입니다." }
    }
  }

  await prisma.signupRequest.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      department: input.department ?? null,
      phone: input.phone ?? null,
      requestedRole: input.requestedRole ?? "OPERATOR",
      status: "PENDING",
    },
  })

  return { success: true, message: "가입 신청이 완료되었습니다. 관리자 승인 후 이메일을 확인해주세요." }
}

// ─── 관리자: 신청 목록 조회 ────────────────────────────────────────────────────
// 읽기 전용 조회는 tenantId 격리만 적용 (뮤테이션에서 role 검증)

export async function getSignupRequests(
  status?: SignupRequestStatus
): Promise<SignupRequestRow[]> {
  const tenantId = await getTenantId()

  const rows = await prisma.signupRequest.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
    },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return rows
}

// ─── 관리자: 승인 ─────────────────────────────────────────────────────────────

export async function approveSignupRequest(
  requestId: string,
  grantedRole: UserRole
): Promise<void> {
  const tenantId = await getTenantId()
  const actor = await requireRole("ADMIN")

  const request = await prisma.signupRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING" },
  })
  if (!request) throw new Error("신청을 찾을 수 없거나 이미 처리되었습니다.")

  // 1. Supabase Auth에 초대 이메일 발송 + 사용자 생성
  const supabase = createAdminClient()
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    request.email,
    {
      data: {
        name: request.name,
        tenantId,
      },
    }
  )
  if (inviteError) {
    throw new Error(`Supabase 사용자 생성 실패: ${inviteError.message}`)
  }

  const authUserId = inviteData.user.id

  // 2. Profile 생성 (없을 경우)
  await prisma.profile.upsert({
    where: { id: authUserId },
    create: {
      id: authUserId,
      email: request.email,
      name: request.name,
      department: request.department,
      phone: request.phone,
    },
    update: {
      name: request.name,
      department: request.department,
      phone: request.phone,
    },
  })

  // 3. TenantUser 생성 (없을 경우)
  const existingTU = await prisma.tenantUser.findFirst({
    where: { tenantId, profileId: authUserId },
  })
  if (!existingTU) {
    await prisma.tenantUser.create({
      data: {
        tenantId,
        profileId: authUserId,
        role: grantedRole,
        isActive: true,
      },
    })
  } else {
    await prisma.tenantUser.update({
      where: { id: existingTU.id },
      data: { role: grantedRole, isActive: true },
    })
  }

  // 4. SignupRequest 상태 업데이트
  const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
  await prisma.signupRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: actorProfileId,
    },
  })

  // 5. AuditLog 기록
  if (actorProfileId) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorProfileId,
        entityType: "SignupRequest",
        entityId: requestId,
        action: "APPROVE",
        afterData: {
          email: request.email,
          name: request.name,
          grantedRole,
        },
      },
    })
  }

  revalidatePath("/app/mes/users")
}

// ─── 관리자: 거절 ─────────────────────────────────────────────────────────────

export async function rejectSignupRequest(
  requestId: string,
  rejectReason: string
): Promise<void> {
  const tenantId = await getTenantId()
  const actor = await requireRole("ADMIN")

  const request = await prisma.signupRequest.findFirst({
    where: { id: requestId, tenantId, status: "PENDING" },
  })
  if (!request) throw new Error("신청을 찾을 수 없거나 이미 처리되었습니다.")

  const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id

  await prisma.signupRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      rejectedById: actorProfileId,
      rejectReason,
    },
  })

  // AuditLog 기록
  if (actorProfileId) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actorProfileId,
        entityType: "SignupRequest",
        entityId: requestId,
        action: "REJECT",
        afterData: { email: request.email, rejectReason },
      },
    })
  }

  revalidatePath("/app/mes/users")
}

// ─── 관리자: PENDING 건수 조회 ────────────────────────────────────────────────

export async function getPendingSignupCount(): Promise<number> {
  const tenantId = await getTenantId()
  return prisma.signupRequest.count({ where: { tenantId, status: "PENDING" } })
}
