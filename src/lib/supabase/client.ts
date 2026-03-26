/**
 * Supabase 클라이언트 (브라우저/클라이언트 컴포넌트용)
 */

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function createClient() {
  return createClientComponentClient();
}
