// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * This middleware ONLY guards:
 *  - /admin (the page UI)
 *  - /api/admin/* (admin APIs)
 *
 * It intentionally does NOT match /api/cron/*, so cron jobs are never blocked here.
 */
export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};

function getPresentedAdminToken(req: NextRequest): string {
  const url = req.nextUrl;
  const header = req.headers.get('x-admin-token') ?? '';
  const query  = url.searchParams.get('token') ?? '';
  const cookie = req.cookies.get('admin_token')?.value ?? '';
  const auth   = req.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '';
  return header || query || cookie || bearer || '';
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow diag to pass through without auth if you have /api/admin/diag
  if (pathname.startsWith('/api/admin/diag')) {
    return NextResponse.next();
  }

  const ADMIN_TOKEN = (process.env.ADMIN_TOKEN ?? '').trim();
  if (!ADMIN_TOKEN) {
    // If no admin token is configured, block admin surfaces by default
    if (pathname.startsWith('/api/admin/')) {
      return NextResponse.json({ ok: false, error: 'admin disabled (no ADMIN_TOKEN)' }, { status: 401 });
    }
    const login = new URL('/admin', req.url);
    login.searchParams.set('unauth', '1');
    return NextResponse.redirect(login);
  }

  const presented = getPresentedAdminToken(req);

  // If hitting API under /api/admin/*
  if (pathname.startsWith('/api/admin/')) {
    if (presented === ADMIN_TOKEN) {
      return NextResponse.next();
    }
    return NextResponse.json({ ok: false, error: 'unauthorized (admin/middleware)' }, { status: 401 });
  }

  // If hitting the /admin UI page(s)
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (presented === ADMIN_TOKEN) {
      return NextResponse.next();
    }
    // Redirect to /admin with a hint; the UI can read ?unauth=1 and show the token box
    const to = new URL('/admin', req.url);
    to.searchParams.set('unauth', '1');
    return NextResponse.redirect(to);
  }

  // Fallback (should not be reached due to matcher)
  return NextResponse.next();
}
