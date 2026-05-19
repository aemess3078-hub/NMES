import { prisma } from '@/lib/db/prisma'
import type { LoginEventType, LoginFailReason } from '@prisma/client'
import type { NextRequest } from 'next/server'

interface CreateLoginHistoryParams {
  tenantId: string
  loginId: string
  profileId?: string | null
  eventType: LoginEventType
  failReason?: LoginFailReason | null
  ipAddress?: string | null
  userAgent?: string | null
}

export function extractClientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  )
}

export async function createLoginHistoryLog(
  params: CreateLoginHistoryParams,
): Promise<void> {
  await prisma.loginHistory.create({
    data: {
      tenantId: params.tenantId,
      loginId: params.loginId,
      profileId: params.profileId ?? null,
      eventType: params.eventType,
      failReason: params.failReason ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  })
}
