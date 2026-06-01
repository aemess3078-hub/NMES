'use server'

import { prisma } from '@/lib/db/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getErrorMessage } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import type { UserRole } from '@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export type MyProfileData = {
  profileId: string
  loginId: string
  email: string
  name: string
  phone: string | null
  jobTitle: string | null
  department: string | null
  role: UserRole
}

export type UpdateMyProfileInput = {
  name: string
  phone: string
  jobTitle: string
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<MyProfileData | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const profile = await prisma.profile.findUnique({
    where: { id: user.profileId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      jobTitle: true,
      department: true,
    },
  })
  if (!profile) return null

  return {
    profileId: profile.id,
    loginId: user.loginId,
    email: profile.email,
    name: profile.name,
    phone: profile.phone,
    jobTitle: profile.jobTitle,
    department: profile.department,
    role: user.role,
  }
}

// ─── 수정 (허용 필드: name, phone, jobTitle 만) ────────────────────────────────

export async function updateMyProfile(
  input: UpdateMyProfileInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: '인증이 필요합니다.' }

    const name = input.name.trim()
    if (!name) return { success: false, error: '이름은 필수 입력값입니다.' }

    const phone = input.phone.trim() || null
    const jobTitle = input.jobTitle.trim() || null

    const before = await prisma.profile.findUnique({
      where: { id: user.profileId },
      select: { name: true, phone: true, jobTitle: true },
    })

    // 서버에서 세션 profileId 기준으로만 update — 클라이언트 전달값 신뢰 안 함
    await prisma.profile.update({
      where: { id: user.profileId },
      data: { name, phone, jobTitle },
    })

    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.profileId,
        actorLabel: user.name,
        entityType: 'Profile',
        entityId: user.profileId,
        action: 'UPDATE',
        beforeData: {
          name: before?.name ?? null,
          phone: before?.phone ?? null,
          jobTitle: before?.jobTitle ?? null,
        },
        afterData: { name, phone, jobTitle },
      },
    }).catch(() => {})

    revalidatePath('/app/mes/profile')
    return { success: true }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}
