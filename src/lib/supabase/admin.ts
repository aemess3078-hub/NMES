import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 서비스 롤 클라이언트 (서버 전용)
 * RLS를 우회하여 모든 테이블에 접근 가능
 * 절대 클라이언트에 노출하면 안 됨
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
