import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/auth/allowlist';

const SIGN_IN_PATH = '/api/auth/signin';
const ADMIN_API_PREFIX = '/api/admin';

export const proxy = auth((request) => {
  if (isAdminEmail(request.auth?.user?.email ?? '')) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith(ADMIN_API_PREFIX)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const signInUrl = new URL(SIGN_IN_PATH, request.nextUrl.origin);
  signInUrl.searchParams.set('callbackUrl', request.nextUrl.href);

  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
