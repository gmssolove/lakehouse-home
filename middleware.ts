import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  /* 브라우저 기본 /favicon.ico → Admin 파비콘 API (OC/Pair 하드로드 포함) */
  if (request.nextUrl.pathname === '/favicon.ico') {
    const url = request.nextUrl.clone();
    url.pathname = '/api/site-favicon';
    return NextResponse.rewrite(url);
  }

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/favicon.ico',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css)$).*)',
  ],
};
