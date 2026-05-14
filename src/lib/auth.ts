'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 쿠키에서 tenantId를 읽어 반환합니다.
 * 모든 server action에서 tenant 데이터 격리에 사용합니다.
 */
export async function getTenantId(): Promise<string> {
  const store = await cookies();
  return store.get('tenantId')?.value ?? 'tenant-demo-001';
}

/**
 * 현재 로그인 유저의 ID를 반환하고, profiles 테이블에 row가 없으면 자동 생성합니다.
 */
export async function getCurrentUserId(): Promise<string> {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error('인증이 필요합니다.');

  const { id, email, user_metadata } = session.user;
  const db = createAdminClient();

  await db.from('profiles').upsert(
    {
      id,
      email: email ?? '',
      name: user_metadata?.name ?? email?.split('@')[0] ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  return id;
}
