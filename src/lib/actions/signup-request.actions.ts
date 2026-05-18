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

  return { success: true, message: "가입 신청이 완료되었습니다. 관리자 승인 후 안내받은 임시 비밀번호로 로그인하세요." }
}

// ─── 관리자: 신청 목록 조회 ────────────────────────────────────────────────────
// 읽기 전용 조회는 tenantId 격리만 적용 (뮤테이션에서 role 검증)

export async function getSignupRequests(
  status?: SignupRequestStatus
): Promise<SignupRequestRow[]> {
  const tenantId = await getTenantId()
  await requireRole("ADMIN")

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
): Promise<{ success: boolean; error?: string; tempPassword?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const request = await prisma.signupRequest.findFirst({
      where: { id: requestId, tenantId, status: "PENDING" },
    })
    if (!request) return { success: false, error: "신청을 찾을 수 없거나 이미 처리되었습니다." }

    // 1. Supabase Auth에 계정 생성 (이메일 인증 없이, 메일 발송 없음)
    const supabase = createAdminClient()

    // 임시 패스워드 생성 (영문 대소문자 + 숫자 + 특수문자)
    const tempPassword =
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 8).toUpperCase() +
      Math.floor(Math.random() * 90 + 10).toString() +
      "!"

    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: request.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: request.name, tenantId, role: grantedRole },
    })

    let authUserId: string
    if (createError) {
      // 이미 Auth에 존재하는 이메일이면 기존 유저 ID를 조회
      const alreadyExists =
        createError.message.includes("already been registered") ||
        createError.message.includes("already exists") ||
        createError.status === 422
      if (alreadyExists) {
        const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
        const existing = listData?.users.find((u) => u.email === request.email)
        if (listError || !existing) {
          console.error("[approveSignupRequest] 기존 유저 조회 실패:", listError?.message)
          return { success: false, error: "이미 등록된 이메일이지만 계정을 찾을 수 없습니다." }
        }
        authUserId = existing.id
      } else {
        console.error("[approveSignupRequest] createUser 오류:", createError.message, createError.status)
        return { success: false, error: `Supabase 사용자 생성 실패: ${createError.message}` }
      }
    } else {
      authUserId = createData.user.id
    }

    // 2. Profile 생성/동기화
    // seed/demo 프로필이 같은 이메일로 먼저 만들어져 있으면 email unique 제약에 걸리므로
    // 기존 프로필의 id를 Supabase Auth UUID로 승격시킨다. FK는 ON UPDATE CASCADE.
    const existingProfileById = await prisma.profile.findUnique({ where: { id: authUserId } })
    const existingProfileByEmail = await prisma.profile.findUnique({ where: { email: request.email } })

    if (existingProfileById) {
      await prisma.profile.update({
        where: { id: authUserId },
        data: {
          email: request.email,
          name: request.name,
          department: request.department,
          phone: request.phone,
        },
      })
    } else if (existingProfileByEmail) {
      await prisma.profile.update({
        where: { id: existingProfileByEmail.id },
        data: {
          id: authUserId,
          email: request.email,
          name: request.name,
          department: request.department,
          phone: request.phone,
        },
      })
    } else {
      await prisma.profile.create({
        data: {
          id: authUserId,
          email: request.email,
          name: request.name,
          department: request.department,
          phone: request.phone,
        },
      })
    }

    // 3. TenantUser 생성 (없을 경우)
    const existingTU = await prisma.tenantUser.findFirst({
      where: { tenantId, profileId: authUserId },
    })
    if (!existingTU) {
      await prisma.tenantUser.create({
        data: { tenantId, profileId: authUserId, role: grantedRole, isActive: true },
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
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorProfileId },
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
          afterData: { email: request.email, name: request.name, grantedRole },
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true, tempPassword }
  } catch (e) {
    console.error("[approveSignupRequest] catch:", e)
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

// ─── 관리자: 거절 ─────────────────────────────────────────────────────────────

export async function rejectSignupRequest(
  requestId: string,
  rejectReason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const request = await prisma.signupRequest.findFirst({
      where: { id: requestId, tenantId, status: "PENDING" },
    })
    if (!request) return { success: false, error: "신청을 찾을 수 없거나 이미 처리되었습니다." }

    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id

    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectedById: actorProfileId, rejectReason },
    })

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
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

// ─── 관리자: PENDING 건수 조회 ────────────────────────────────────────────────

export async function getPendingSignupCount(): Promise<number> {
  const tenantId = await getTenantId()
  await requireRole("ADMIN")
  return prisma.signupRequest.count({ where: { tenantId, status: "PENDING" } })
}
