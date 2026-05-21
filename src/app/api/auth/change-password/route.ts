import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword, hashPassword } from '@/lib/password'
import {
  verifyAuthToken,
  signAuthToken,
  NMES_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/jwt'

const PASSWORD_MIN_LENGTH = 8
// 영문 + 숫자 + 특수문자 조합
const PASSWORD_STRENGTH_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

export async function POST(req: NextRequest) {
  const token = req.cookies.get(NMES_SESSION_COOKIE)?.value ?? null

  if (!token) {
    return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 })
  }

  const payload = verifyAuthToken(token)
  if (!payload) {
    return NextResponse.json({ success: false, message: '세션이 만료되었습니다.' }, { status: 401 })
  }

  let body: { currentPassword?: string; newPassword?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, message: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { currentPassword, newPassword } = body
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, message: 'currentPassword와 newPassword는 필수 입력값입니다.' },
      { status: 400 },
    )
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json(
      { success: false, message: `새 비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.` },
      { status: 400 },
    )
  }

  if (!PASSWORD_STRENGTH_RE.test(newPassword)) {
    return NextResponse.json(
      { success: false, message: '새 비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.' },
      { status: 400 },
    )
  }

  const credential = await prisma.userCredential.findUnique({
    where: { profileId: payload.profileId },
    select: { id: true, passwordHash: true, isLocked: true },
  })

  if (!credential) {
    return NextResponse.json({ success: false, message: '계정 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (credential.isLocked) {
    return NextResponse.json({ success: false, message: '잠긴 계정입니다. 관리자에게 문의해 주세요.' }, { status: 403 })
  }

  const isCurrentPasswordValid = await verifyPassword(currentPassword, credential.passwordHash)
  if (!isCurrentPasswordValid) {
    return NextResponse.json({ success: false, message: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  const newHash = await hashPassword(newPassword)

  await prisma.userCredential.update({
    where: { id: credential.id },
    data: {
      passwordHash: newHash,
      mustChangePw: false,
      failCount: 0,
      isLocked: false,
      lockedAt: null,
    },
  })

  // JWT 페이로드의 mustChangePw 플래그를 갱신한 새 토큰으로 쿠키를 교체한다.
  // 이렇게 해야 변경 후 /app 진입 시 layout의 JWT 기반 검사가
  // /auth/change-password 로 되돌리지 않는다.
  //
  // 주의: verifyAuthToken 이 돌려주는 객체에는 jsonwebtoken 표준 클레임
  // (iat, exp) 이 함께 들어 있다. signAuthToken 은 options.expiresIn 을
  // 사용하므로 payload 에 exp 가 있으면 서명이 실패한다. 그래서 페이로드를
  // 그대로 spread 하지 않고 AuthTokenPayload 의 도메인 필드만 명시적으로
  // 재구성한다.
  const refreshedPayload = {
    profileId: payload.profileId,
    tenantId: payload.tenantId,
    loginId: payload.loginId,
    email: payload.email ?? null,
    name: payload.name,
    role: payload.role,
    mustChangePw: false,
  }
  let refreshedToken: string
  try {
    refreshedToken = signAuthToken(refreshedPayload)
  } catch (err) {
    console.error('[/api/auth/change-password] JWT 재서명 실패:', err)
    return NextResponse.json(
      { success: true, message: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' },
      { status: 200 },
    )
  }

  const res = NextResponse.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  res.cookies.set(NMES_SESSION_COOKIE, refreshedToken, SESSION_COOKIE_OPTIONS)
  return res
}
