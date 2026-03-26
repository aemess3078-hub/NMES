/**
 * Supabase 클라이언트 (서버 컴포넌트 / Route Handler용)
 */

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export function createServerClient() {
  return createServerComponentClient({ cookies });
}
