import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'nmes-session';

export async function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  const isAuthPage = req.nextUrl.pathname.startsWith('/login');
  const isAppPage = req.nextUrl.pathname.startsWith('/app');

  if (!hasSession && isAppPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL('/app', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};
