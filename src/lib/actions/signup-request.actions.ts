"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { UserRole, SignupRequestStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { hashPassword } from "@/lib/password"
import { maskSensitiveFields } from "@/lib/sanitize"

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateSignupRequestInput = {
  tenantId: string
  loginId: string
  email: string
  name: string
  department: string
  employeeNo?: string
  phone: string
  jobTitle: string
  password: string
}

export type SignupRequestRow = {
  id: string
  tenantId: string
  loginId: string | null
  email: string
  name: string
  department: string | null
  employeeNo: string | null
  phone: string | null
  jobTitle: string | null
  status: SignupRequestStatus
  createdAt: Date
  approvedAt: Date | null
  rejectedAt: Date | null
  rejectReason: string | null
  approvedBy: { id: string; name: string; email: string } | null
  rejectedBy: { id: string; name: string; email: string } | null
}

// ─── 비밀번호 강도 검증 ───────────────────────────────────────────────────────

const PASSWORD_STRENGTH_RE =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다."
  if (!PASSWORD_STRENGTH_RE.test(password))
    return "비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다."
  return null
}

// ─── 임시 비밀번호 생성 (관리자 비밀번호 초기화 등에서 재사용 가능) ─────────────

export function generateTempPassword(): string {
  const lower = Math.random().toString(36).slice(2, 6)
  const upper = Math.random().toString(36).slice(2, 6).toUpperCase()
  const digits = Math.floor(Math.random() * 90 + 10).toString()
  const special = "!@#$%"[Math.floor(Math.random() * 5)]
  const raw = lower + upper + digits + special
  return raw.split("").sort(() => Math.random() - 0.5).join("")
}

// ─── 공개: 가입 신청 제출 (인증 불필요) ───────────────────────────────────────

export async function createSignupRequest(
  input: CreateSignupRequestInput
): Promise<{ success: boolean; message: string }> {
  const { tenantId, loginId, email, name, department, employeeNo, phone, jobTitle, password } = input

  // 필수값 검증
  if (!loginId || loginId.trim().length < 3) {
    return { success: false, message: "로그인 아이디는 3자 이상이어야 합니다." }
  }
  if (!name?.trim()) return { success: false, message: "이름을 입력해 주세요." }
  if (!department?.trim()) return { success: false, message: "부서를 입력해 주세요." }
  if (!phone?.trim()) return { success: false, message: "연락처를 입력해 주세요." }
  if (!jobTitle?.trim()) return { success: false, message: "직급을 입력해 주세요." }
  if (!email?.trim()) return { success: false, message: "이메일을 입력해 주세요." }
  const pwError = validatePassword(password)
  if (pwError) return { success: false, message: pwError }

  const cleanLoginId = loginId.trim()

  // 1. UserCredential에 이미 같은 loginId가 있으면 신청 불가
  const existingCredential = await prisma.userCredential.findUnique({
    where: { tenantId_loginId: { tenantId, loginId: cleanLoginId } },
  })
  if (existingCredential) {
    return { success: false, message: "이미 사용 중인 아이디입니다." }
  }

  // 2. PENDING 또는 HOLD 상태의 동일 loginId 신청이 있으면 불가
  const duplicatePending = await prisma.signupRequest.findFirst({
    where: {
      tenantId,
      loginId: cleanLoginId,
      status: { in: ["PENDING"] },
    },
  })
  if (duplicatePending) {
    return { success: false, message: "동일한 아이디로 이미 대기 중인 신청이 있습니다." }
  }

  // 3. 이메일 기준 PENDING 중복 체크
  const duplicateEmail = await prisma.signupRequest.findFirst({
    where: { tenantId, email, status: "PENDING" },
  })
  if (duplicateEmail) {
    return { success: false, message: "이미 동일한 이메일로 대기 중인 신청이 있습니다." }
  }

  // 4. 이미 활성 사용자인지 이메일로 체크
  const activeProfile = await prisma.profile.findFirst({ where: { email } })
  if (activeProfile) {
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId, profileId: activeProfile.id, isActive: true },
    })
    if (tenantUser) {
      return { success: false, message: "이미 등록된 사용자입니다." }
    }
  }

  // 5. 비밀번호 해시 처리 후 저장
  const passwordHash = await hashPassword(password)

  await prisma.signupRequest.create({
    data: {
      tenantId,
      loginId: cleanLoginId,
      email,
      name,
      department: department ?? null,
      employeeNo: employeeNo ?? null,
      phone: phone ?? null,
      jobTitle: jobTitle ?? null,
      passwordHash,
      status: "PENDING",
      // requestedRole은 가입자가 선택하지 않음 — DB default(OPERATOR) 사용
    },
  })

  return {
    success: true,
    message: "가입 신청이 완료되었습니다. 관리자 승인 후 신청한 아이디와 비밀번호로 로그인하세요.",
  }
}

// ─── 관리자: 신청 목록 조회 ────────────────────────────────────────────────────

export async function getSignupRequests(
  status?: SignupRequestStatus
): Promise<SignupRequestRow[]> {
  const tenantId = await getTenantId()
  await requireRole("ADMIN")

  const rows = await prisma.signupRequest.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
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
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId()
    const actor = await requireRole("ADMIN")

    const request = await prisma.signupRequest.findFirst({
      where: { id: requestId, tenantId, status: "PENDING" },
    })
    if (!request) return { success: false, error: "신청을 찾을 수 없거나 이미 처리되었습니다." }

    // loginId/passwordHash가 없는 구형 신청 건 방어
    if (!request.loginId || !request.passwordHash) {
      return { success: false, error: "이 신청 건에 로그인 아이디 또는 비밀번호 정보가 없습니다. 재신청을 요청하세요." }
    }

    // loginId 중복 검사 (UserCredential)
    const duplicateCredential = await prisma.userCredential.findUnique({
      where: { tenantId_loginId: { tenantId, loginId: request.loginId } },
    })
    if (duplicateCredential) {
      return { success: false, error: `이미 사용 중인 로그인 아이디입니다: ${request.loginId}` }
    }

    // 1. Profile 생성 또는 연결
    let profileId: string

    const existingProfileByEmail = await prisma.profile.findUnique({ where: { email: request.email } })
    if (existingProfileByEmail) {
      await prisma.profile.update({
        where: { id: existingProfileByEmail.id },
        data: {
          name: request.name,
          department: request.department ?? existingProfileByEmail.department,
          phone: request.phone ?? existingProfileByEmail.phone,
          employeeNo: request.employeeNo ?? existingProfileByEmail.employeeNo,
          jobTitle: request.jobTitle ?? existingProfileByEmail.jobTitle,
        },
      })
      profileId = existingProfileByEmail.id
    } else {
      const newProfile = await prisma.profile.create({
        data: {
          email: request.email,
          name: request.name,
          department: request.department ?? null,
          phone: request.phone ?? null,
          employeeNo: request.employeeNo ?? null,
          jobTitle: request.jobTitle ?? null,
        },
      })
      profileId = newProfile.id
    }

    // 2. TenantUser 생성 또는 활성화
    const existingTU = await prisma.tenantUser.findFirst({ where: { tenantId, profileId } })
    if (existingTU) {
      await prisma.tenantUser.update({
        where: { id: existingTU.id },
        data: { role: grantedRole, isActive: true },
      })
    } else {
      await prisma.tenantUser.create({
        data: { tenantId, profileId, role: grantedRole, isActive: true },
      })
    }

    // 3. UserCredential 생성 (profileId unique 제약이 중복 방지)
    const existingCredential = await prisma.userCredential.findUnique({ where: { profileId } })
    if (existingCredential) {
      return { success: false, error: "이미 로그인 계정이 존재하는 사용자입니다." }
    }

    await prisma.userCredential.create({
      data: {
        tenantId,
        loginId: request.loginId,
        profileId,
        passwordHash: request.passwordHash,
        mustChangePw: false,  // 사용자가 직접 설정한 비밀번호이므로 변경 강제 없음
        isLocked: false,
        failCount: 0,
      },
    })

    // 4. SignupRequest 상태 업데이트
    const actorProfileId = actor.id === "dev-bypass-user" ? null : actor.id
    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: actorProfileId },
    })

    // 5. AuditLog (비밀번호 정보 마스킹)
    if (actorProfileId) {
      const afterData = maskSensitiveFields({
        email: request.email,
        name: request.name,
        loginId: request.loginId,
        grantedRole,
        profileId,
        mustChangePw: false,
      })
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorId: actorProfileId,
          actorType: "USER",
          actorLabel: actor.name,
          entityType: "SignupRequest",
          entityId: requestId,
          action: "APPROVE",
          afterData: afterData as object,
          menuName: "가입신청관리",
        },
      })
    }

    revalidatePath("/app/mes/users")
    return { success: true }
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
          actorType: "USER",
          actorLabel: actor.name,
          entityType: "SignupRequest",
          entityId: requestId,
          action: "REJECT",
          afterData: maskSensitiveFields({ email: request.email, rejectReason }) as object,
          menuName: "가입신청관리",
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
