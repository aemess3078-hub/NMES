'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { UserRole } from '@prisma/client';
import { verifyAuthToken, NMES_SESSION_COOKIE } from '@/lib/jwt';

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

// ─── Internal: JWT payload → CurrentUser ────────────────────────────────────

async function buildCurrentUser(profileId: string, tenantId: string): Promise<CurrentUser | null> {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _t0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
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
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] auth.buildCurrentUser.dbQueries ${Date.now() - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

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

// ─── getTenantId ──────────────────────────────────────────────────────────────

export async function getTenantId(): Promise<string> {
  const store = await cookies();
  const token = store.get(NMES_SESSION_COOKIE)?.value;
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload?.tenantId) return payload.tenantId;
  }
  return process.env.DEFAULT_TENANT_ID ?? 'tenant-demo-001';
}

// ─── getCurrentUser ───────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _t0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const store = await cookies();
  const token = store.get(NMES_SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyAuthToken(token);
  if (!payload) return null;

  const result = await buildCurrentUser(payload.profileId, payload.tenantId);
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] auth.getCurrentUser.total ${Date.now() - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────
  return result;
}

// ─── getCurrentUserId ────────────────────────────────────────────────────────

export async function getCurrentUserId(): Promise<string> {
  const store = await cookies();
  const token = store.get(NMES_SESSION_COOKIE)?.value;
  if (!token) throw new Error('인증이 필요합니다.');

  const payload = verifyAuthToken(token);
  if (!payload) throw new Error('인증이 필요합니다.');

  return payload.profileId;
}

// ─── Developer identity ───────────────────────────────────────────────────────
// 동기 순수 함수 isDeveloperUser 는 'use server' 제약을 피하기 위해
// src/lib/developer.ts 에 분리되어 있다. 여기서는 async 가드만 제공한다.

import { isDeveloperUser } from '@/lib/developer'

/**
 * 서버 액션에서 사용하는 개발자 전용 가드.
 * 개발자가 아니면 FORBIDDEN 에러를 던진다.
 * 페이지(Server Component)에서는 notFound()를 직접 호출하는 방식을 권장.
 */
export async function requireDeveloper(
  user?: CurrentUser | null,
): Promise<CurrentUser> {
  const currentUser = user ?? (await getCurrentUser())
  if (!currentUser) throw new Error('UNAUTHORIZED')
  if (!isDeveloperUser(currentUser)) throw new Error('FORBIDDEN')
  return currentUser
}

// ─── requireRole ─────────────────────────────────────────────────────────────

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
