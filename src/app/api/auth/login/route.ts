import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/password'
import { signAuthToken, NMES_SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/jwt'
import { createLoginHistoryLog, extractClientIp } from '@/lib/login-history'

const FAIL_LOCK_THRESHOLD = 5
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'tenant-demo-001'

const GENERIC_FAIL_MESSAGE = '아이디 또는 비밀번호가 올바르지 않습니다.'

export async function POST(req: NextRequest) {
  const ip = extractClientIp(req)
  const ua = req.headers.get('user-agent') ?? null

  let body: { loginId?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { loginId, password } = body
  if (!loginId || !password) {
    return NextResponse.json(
      { success: false, message: 'loginId와 password는 필수 입력값입니다.' },
      { status: 400 },
    )
  }

  const tenantId = DEFAULT_TENANT_ID

  // UserCredential 조회 (Profile, TenantUser 포함)
  const credential = await prisma.userCredential.findUnique({
    where: { tenantId_loginId: { tenantId, loginId } },
    include: {
      profile: true,
    },
  })

  if (!credential) {
    await createLoginHistoryLog({ tenantId, loginId, eventType: 'LOGIN_FAIL', failReason: 'USER_NOT_FOUND', ipAddress: ip, userAgent: ua })
    return NextResponse.json({ success: false, message: GENERIC_FAIL_MESSAGE }, { status: 401 })
  }

  // 잠금 여부 확인
  if (credential.isLocked) {
    await createLoginHistoryLog({ tenantId, loginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'LOCKED', ipAddress: ip, userAgent: ua })
    return NextResponse.json({ success: false, message: '계정이 잠겨 있습니다. 관리자에게 문의해 주세요.' }, { status: 403 })
  }

  // TenantUser 조회 및 활성 확인
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { profileId: credential.profileId, tenantId, isActive: true },
  })

  if (!tenantUser) {
    await createLoginHistoryLog({ tenantId, loginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'INACTIVE', ipAddress: ip, userAgent: ua })
    return NextResponse.json({ success: false, message: '비활성화된 계정입니다. 관리자에게 문의해 주세요.' }, { status: 403 })
  }

  // 비밀번호 검증
  const isPasswordValid = await verifyPassword(password, credential.passwordHash)

  if (!isPasswordValid) {
    const newFailCount = credential.failCount + 1
    const shouldLock = newFailCount >= FAIL_LOCK_THRESHOLD

    await prisma.userCredential.update({
      where: { id: credential.id },
      data: {
        failCount: newFailCount,
        isLocked: shouldLock,
        lockedAt: shouldLock ? new Date() : undefined,
      },
    })

    await createLoginHistoryLog({ tenantId, loginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'INVALID_PASSWORD', ipAddress: ip, userAgent: ua })

    if (shouldLock) {
      return NextResponse.json({ success: false, message: `비밀번호를 ${FAIL_LOCK_THRESHOLD}회 잘못 입력하여 계정이 잠겼습니다. 관리자에게 문의해 주세요.` }, { status: 403 })
    }

    return NextResponse.json({ success: false, message: GENERIC_FAIL_MESSAGE }, { status: 401 })
  }

  // 로그인 성공 — failCount 초기화
  await prisma.userCredential.update({
    where: { id: credential.id },
    data: { failCount: 0, isLocked: false, lockedAt: null },
  })

  const payload = {
    profileId: credential.profileId,
    tenantId,
    loginId,
    email: credential.profile.email ?? null,
    name: credential.profile.name,
    role: tenantUser.role,
    mustChangePw: credential.mustChangePw,
  }

  const token = signAuthToken(payload)

  await createLoginHistoryLog({ tenantId, loginId, profileId: credential.profileId, eventType: 'LOGIN_SUCCESS', ipAddress: ip, userAgent: ua })

  const res = NextResponse.json({
    success: true,
    user: {
      profileId: payload.profileId,
      tenantId: payload.tenantId,
      loginId: payload.loginId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      mustChangePw: payload.mustChangePw,
    },
  })

  res.cookies.set(NMES_SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)

  return res
}
