import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 서비스 롤 클라이언트 (서버 전용)
 * RLS를 우회하여 모든 테이블에 접근 가능
 * 절대 클라이언트에 노출하면 안 됨
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
