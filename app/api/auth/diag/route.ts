// app/api/auth/diag/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mask(s?: string | null) {
  if (!s) return '';
  const t = s.trim();
  if (t.length <= 8) return '*'.repeat(Math.max(0, t.length - 2)) + t.slice(-2);
  return t.slice(0, 2) + '***' + t.slice(-3);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';

  const hdrs = headers();
  const cks = cookies();

  const envAdmin = (process.env.ADMIN_TOKEN || '').trim();
  const envCron  = (process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim();

  const hAdmin  = (hdrs.get('x-admin-token') || '').trim();
  const qAdmin  = (url.searchParams.get('token') || '').trim();
  const cAdmin  = (cks.get('admin_token')?.value || '').trim();

  const auth    = (hdrs.get('authorization') || '').trim();
  const bearer  = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  const hCron   = (hdrs.get('x-cron-secret') || '').trim();
  const qCron   = (url.searchParams.get('secret') || '').trim();

  const presented = {
    header_admin: !!hAdmin,
    query_admin: !!qAdmin,
    cookie_admin: !!cAdmin,
    bearer: !!bearer,
    header_cron: !!hCron,
    query_cron: !!qCron,
  };

  const matches = {
    admin_match: !!envAdmin && [hAdmin, qAdmin, cAdmin, bearer].some(v => v && v === envAdmin),
    cron_match:  !!envCron  && [hCron, qCron, bearer].some(v => v && v === envCron),
  };

  // Hide secrets by default; show masked if debug=1 to check whitespace/typos safely
  const masked = debug ? {
    env: {
      ADMIN_TOKEN: mask(envAdmin),
      CRON_SECRET: mask(envCron),
    },
    provided: {
      x_admin_token: mask(hAdmin),
      query_token: mask(qAdmin),
      cookie_admin_token: mask(cAdmin),
      bearer: mask(bearer),
      x_cron_secret: mask(hCron),
      query_secret: mask(qCron),
    },
  } : undefined;

  return NextResponse.json({
    ok: true,
    env_present: {
      ADMIN_TOKEN: !!envAdmin,
      CRON_SECRET: !!envCron,
    },
    presented,
    matches,
    masked, // only populated when debug=1
  });
}
