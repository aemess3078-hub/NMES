'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
