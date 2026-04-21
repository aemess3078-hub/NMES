import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient(req, res);

  const isDevelopment = process.env.NODE_ENV === 'development';
  const isDevBypassEnabled = process.env.NMES_ENABLE_DEV_BYPASS === 'true';
  const isDevBypass =
    isDevelopment &&
    isDevBypassEnabled &&
    req.cookies.get('nmes-dev-bypass')?.value === 'true';

  const { data: { session } } = await supabase.auth.getSession();

  const isAuthPage = req.nextUrl.pathname.startsWith('/login');
  const isAppPage = req.nextUrl.pathname.startsWith('/app');

  if (!session && !isDevBypass && isAppPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if ((session || isDevBypass) && isAuthPage) {
    return NextResponse.redirect(new URL('/app', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};
