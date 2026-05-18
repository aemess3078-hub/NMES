'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { UserRole } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CurrentUser = {
  id: string          // Profile.id = Supabase auth UUID
  email: string
  name: string
  tenantId: string
  role: UserRole
  isActive: boolean
}

// ─── tenantId ─────────────────────────────────────────────────────────────────

/**
 * 쿠키에서 tenantId를 읽어 반환합니다.
 */
export async function getTenantId(): Promise<string> {
  const store = await cookies();
  return store.get('tenantId')?.value ?? 'tenant-demo-001';
}

// ─── Profile upsert ──────────────────────────────────────────────────────────

/**
 * 현재 로그인 유저의 ID를 반환하고, profiles 테이블에 row가 없으면 자동 생성합니다.
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('인증이 필요합니다.');

  const { id, email, user_metadata } = session.user;

  await prisma.profile.upsert({
    where: { id },
    create: {
      id,
      email: email ?? '',
      name: user_metadata?.name ?? email?.split('@')[0] ?? '',
    },
    update: {},
  });

  return id;
}

// ─── getCurrentUser ───────────────────────────────────────────────────────────

/**
 * 현재 로그인 사용자의 역할 정보를 반환합니다.
 * dev bypass 모드에서는 OWNER 권한의 가상 사용자를 반환합니다.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const tenantId = store.get('tenantId')?.value ?? 'tenant-demo-001';

  // dev bypass 모드 처리
  const isDevBypass =
    process.env.NODE_ENV === 'development' &&
    process.env.NMES_ENABLE_DEV_BYPASS === 'true' &&
    store.get('nmes-dev-bypass')?.value === 'true';

  if (isDevBypass) {
    return {
      id: 'dev-bypass-user',
      email: 'test@test.com',
      name: '개발자(bypass)',
      tenantId,
      role: 'OWNER',
      isActive: true,
    };
  }

  // 실제 Supabase 세션
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const profileId = session.user.id;

  let tenantUser = await prisma.tenantUser.findFirst({
    where: { profileId, tenantId, isActive: true },
    include: { profile: true },
  });

  if (!tenantUser && session.user.email) {
    const tenantUserByEmail = await prisma.tenantUser.findFirst({
      where: {
        tenantId,
        isActive: true,
        profile: { email: session.user.email },
      },
      include: { profile: true },
    });

    if (tenantUserByEmail && tenantUserByEmail.profileId !== profileId) {
      const existingProfileForAuthId = await prisma.profile.findUnique({
        where: { id: profileId },
      });

      if (!existingProfileForAuthId) {
        await prisma.profile.update({
          where: { id: tenantUserByEmail.profileId },
          data: {
            id: profileId,
            email: session.user.email,
            name:
              session.user.user_metadata?.name ??
              tenantUserByEmail.profile.name ??
              session.user.email.split('@')[0],
          },
        });

        tenantUser = await prisma.tenantUser.findFirst({
          where: { profileId, tenantId, isActive: true },
          include: { profile: true },
        });
      }
    } else {
      tenantUser = tenantUserByEmail;
    }
  }

  if (!tenantUser) return null;

  return {
    id: profileId,
    email: tenantUser.profile.email,
    name: tenantUser.profile.name,
    tenantId,
    role: tenantUser.role,
    isActive: tenantUser.isActive,
  };
}

// ─── requireRole ─────────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER:    5,
  ADMIN:    4,
  MANAGER:  3,
  OPERATOR: 2,
  VIEWER:   1,
};

/**
 * 요구 역할 중 하나라도 만족하지 않으면 에러를 throw합니다.
 * allowedRoles에 최소 역할을 넣으면 그 이상 역할이 모두 허용됩니다.
 */
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
