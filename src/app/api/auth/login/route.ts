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
  const normalizedLoginId = loginId?.trim().toLowerCase()
  if (!normalizedLoginId || !password) {
    return NextResponse.json(
      { success: false, message: 'loginId와 password는 필수 입력값입니다.' },
      { status: 400 },
    )
  }

  const tenantId = DEFAULT_TENANT_ID

  try {
    // UserCredential + Profile + 활성 TenantUser를 한 번에 조회 (RTT 1회로 통합)
    const credential = await prisma.userCredential.findUnique({
      where: { tenantId_loginId: { tenantId, loginId: normalizedLoginId } },
      select: {
        id: true,
        profileId: true,
        passwordHash: true,
        isLocked: true,
        failCount: true,
        mustChangePw: true,
        profile: {
          select: {
            email: true,
            name: true,
            tenantUsers: {
              where: { tenantId, isActive: true },
              select: { role: true, isActive: true },
              take: 1,
            },
          },
        },
      },
    })

    if (!credential) {
      await createLoginHistoryLog({ tenantId, loginId: normalizedLoginId, eventType: 'LOGIN_FAIL', failReason: 'USER_NOT_FOUND', ipAddress: ip, userAgent: ua })
      return NextResponse.json({ success: false, message: GENERIC_FAIL_MESSAGE }, { status: 401 })
    }

    // 잠금 여부 확인
    if (credential.isLocked) {
      await createLoginHistoryLog({ tenantId, loginId: normalizedLoginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'LOCKED', ipAddress: ip, userAgent: ua })
      return NextResponse.json({ success: false, message: '계정이 잠겨 있습니다. 관리자에게 문의해 주세요.' }, { status: 403 })
    }

    // 활성 TenantUser 확인
    const tenantUser = credential.profile.tenantUsers[0]
    if (!tenantUser) {
      await createLoginHistoryLog({ tenantId, loginId: normalizedLoginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'INACTIVE', ipAddress: ip, userAgent: ua })
      return NextResponse.json({ success: false, message: '비활성화된 계정입니다. 관리자에게 문의해 주세요.' }, { status: 403 })
    }

    // 비밀번호 검증
    const isPasswordValid = await verifyPassword(password, credential.passwordHash)

    if (!isPasswordValid) {
      // ⚠️ 실패 경로는 보안 로직(failCount 증가, 잠금 처리)이므로 await 유지
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

      await createLoginHistoryLog({ tenantId, loginId: normalizedLoginId, profileId: credential.profileId, eventType: 'LOGIN_FAIL', failReason: 'INVALID_PASSWORD', ipAddress: ip, userAgent: ua })

      if (shouldLock) {
        return NextResponse.json({ success: false, message: `비밀번호를 ${FAIL_LOCK_THRESHOLD}회 잘못 입력하여 계정이 잠겼습니다. 관리자에게 문의해 주세요.` }, { status: 403 })
      }

      return NextResponse.json({ success: false, message: GENERIC_FAIL_MESSAGE }, { status: 401 })
    }

    // ─── 로그인 성공 ─────────────────────────────────────────────────────────
    // failCount 리셋과 LOGIN_SUCCESS 기록은 응답 지연을 만들 필요가 없어
    // fire-and-forget으로 보낸다. 에러는 서버 로그로만 흘린다.

    if (credential.failCount !== 0 || credential.isLocked) {
      void prisma.userCredential
        .update({
          where: { id: credential.id },
          data: { failCount: 0, isLocked: false, lockedAt: null },
        })
        .catch((err) => console.error('[/api/auth/login] failCount 리셋 실패:', err))
    }

    void createLoginHistoryLog({
      tenantId,
      loginId: normalizedLoginId,
      profileId: credential.profileId,
      eventType: 'LOGIN_SUCCESS',
      ipAddress: ip,
      userAgent: ua,
    }).catch((err) => console.error('[/api/auth/login] LOGIN_SUCCESS 기록 실패:', err))

    const payload = {
      profileId: credential.profileId,
      tenantId,
      loginId: normalizedLoginId,
      email: credential.profile.email ?? null,
      name: credential.profile.name,
      role: tenantUser.role,
      mustChangePw: credential.mustChangePw,
    }

    let token: string
    try {
      token = signAuthToken(payload)
    } catch (jwtErr) {
      console.error('[/api/auth/login] JWT 서명 실패 — JWT_SECRET이 설정되지 않았을 수 있습니다:', jwtErr)
      return NextResponse.json(
        { success: false, message: '서버 설정 오류가 발생했습니다. 관리자에게 문의해 주세요.' },
        { status: 500 },
      )
    }

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
  } catch (err) {
    console.error('[/api/auth/login] 처리 중 예상치 못한 오류:', err)
    return NextResponse.json(
      { success: false, message: '로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    )
  }
}
