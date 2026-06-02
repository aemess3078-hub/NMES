import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'nmes-session';

function clearAppSession(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set('nmes-mode', '', { path: '/', maxAge: 0 });
  return res;
}

async function hasValidAppSession(req: NextRequest): Promise<boolean> {
  const meUrl = new URL('/api/auth/me', req.url);
  try {
    const res = await fetch(meUrl, {
      headers: {
        cookie: req.headers.get('cookie') ?? '',
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  const isAuthPage = req.nextUrl.pathname.startsWith('/login');
  const isAppPage = req.nextUrl.pathname.startsWith('/app');

  // 세션 없이 앱 진입 시도 → 로그인으로
  if (!hasSession && isAppPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (hasSession) {
    const isValidSession = await hasValidAppSession(req);

    if (!isValidSession) {
      if (isAppPage) {
        const loginUrl = new URL('/login', req.url);
        loginUrl.searchParams.set('reason', 'session-expired');
        return clearAppSession(NextResponse.redirect(loginUrl));
      }

      return clearAppSession(NextResponse.next());
    }

    // 이미 유효한 세션이 있는데 로그인 페이지 접근 → 앱으로
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/app', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};
