/**
 * Supabase 미들웨어 클라이언트 (middleware.ts용)
 */

import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { NextRequest, NextResponse } from 'next/server';

export function createMiddlewareSupabaseClient(
  req: NextRequest,
  res: NextResponse
) {
  return createMiddlewareClient({ req, res });
}
