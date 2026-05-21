'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { UserRole } from '@prisma/client';
import { verifyAuthToken, NMES_SESSION_COOKIE } from '@/lib/jwt';
import type { AuthTokenPayload } from '@/types/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CurrentUser = {
  id: string        // = profileId (하위호환)
  profileId: string
  loginId: string
  email: string
  name: string
  tenantId: string
  role: UserRole
  isActive: boolean
  mustChangePw: boolean
}

// ─── Internal: JWT 페이로드 → CurrentUser (DB 조회 없음) ─────────────────────
//
// nmes-session JWT는 로그인 시점에 사용자 정보 전부
// (loginId/email/name/role/mustChangePw)를 포함하므로,
// 화면 렌더링용 CurrentUser는 페이로드만으로 구성한다.
// 이렇게 하면 메뉴 전환마다 발생하던 UserCredential/TenantUser/Profile
// 3개 Prisma 쿼리가 사라진다.
//
// ⚠️ 권한 변경, 계정 잠금/비활성화, 비밀번호 변경 등이 "즉시 반영"되어야 하는
//   민감 작업에서는 이 함수가 아닌 getCurrentUserFromDb() / requireRoleFresh()
//   를 사용한다.

function payloadToCurrentUser(payload: AuthTokenPayload): CurrentUser {
  return {
    id: payload.profileId,
    profileId: payload.profileId,
    loginId: payload.loginId,
    email: payload.email ?? '',
    name: payload.name,
    tenantId: payload.tenantId,
    role: payload.role as UserRole,
    isActive: true,
    mustChangePw: payload.mustChangePw ?? false,
  };
}

async function readPayload(): Promise<AuthTokenPayload | null> {
  const store = await cookies();
  const token = store.get(NMES_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

// ─── getTenantId ──────────────────────────────────────────────────────────────

export async function getTenantId(): Promise<string> {
  const payload = await readPayload();
  if (payload?.tenantId) return payload.tenantId;
  return process.env.DEFAULT_TENANT_ID ?? 'tenant-demo-001';
}

// ─── 빠른 경로 (JWT 기반, DB 조회 없음) ─────────────────────────────────────
//
// 화면 렌더링 / 메뉴 표시 / 단순 목록 조회 등 "현재 세션 유효성"만 필요한
// 경로에서 사용한다.

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const payload = await readPayload();
  return payload ? payloadToCurrentUser(payload) : null;
}

export async function getCurrentUserId(): Promise<string> {
  const payload = await readPayload();
  if (!payload) throw new Error('인증이 필요합니다.');
  return payload.profileId;
}

// ─── requireRole (JWT 기반) ──────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER:    5,
  ADMIN:    4,
  MANAGER:  3,
  OPERATOR: 2,
  VIEWER:   1,
};

export async function requireRole(
  minRole: UserRole,
  user?: CurrentUser | null
): Promise<CurrentUser> {
  const currentUser = user ?? (await getCurrentUser());
  if (!currentUser) throw new Error('UNAUTHORIZED');

  if (ROLE_HIERARCHY[currentUser.role] < ROLE_HIERARCHY[minRole]) {
    throw new Error('FORBIDDEN');
  }

  return currentUser;
}

// ─── 느린 경로 (DB 재확인) ──────────────────────────────────────────────────
//
// 권한 변경, 계정 잠금/비활성화, 사용자/권한 관리 등 "즉시 반영"이 필요한
// 민감 작업에서 사용한다. JWT로는 알 수 없는 isLocked / 최신 role / isActive
// 를 DB에서 다시 읽어 확인한다.

export async function getCurrentUserFromDb(): Promise<CurrentUser | null> {
  const payload = await readPayload();
  if (!payload) return null;

  const { profileId, tenantId } = payload;
  const [credential, tenantUser, profile] = await Promise.all([
    prisma.userCredential.findUnique({
      where: { profileId },
      select: { isLocked: true, mustChangePw: true, loginId: true },
    }),
    prisma.tenantUser.findFirst({
      where: { profileId, tenantId, isActive: true },
      select: { role: true, isActive: true },
    }),
    prisma.profile.findUnique({
      where: { id: profileId },
      select: { email: true, name: true },
    }),
  ]);

  if (!credential || credential.isLocked || !tenantUser || !profile) return null;

  return {
    id: profileId,
    profileId,
    loginId: credential.loginId,
    email: profile.email,
    name: profile.name,
    tenantId,
    role: tenantUser.role,
    isActive: tenantUser.isActive,
    mustChangePw: credential.mustChangePw,
  };
}

export async function requireFreshUser(): Promise<CurrentUser> {
  const user = await getCurrentUserFromDb();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function requireRoleFresh(minRole: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUserFromDb();
  if (!user) throw new Error('UNAUTHORIZED');

  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
    throw new Error('FORBIDDEN');
  }

  return user;
}
