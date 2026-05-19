import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'nmes-session';

export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  const isAuthPage = req.nextUrl.pathname.startsWith('/login');
  const isAppPage = req.nextUrl.pathname.startsWith('/app');

  // 세션 없이 앱 진입 시도 → 로그인으로
  if (!hasSession && isAppPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 이미 세션이 있는데 로그인 페이지 접근 → 앱으로
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/app', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};
