// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/* ---------------------- utils ---------------------- */
function trim(v: string | null | undefined) { return (v ?? '').trim(); }
function bearerToken(h: string | null) {
  const v = trim(h);
  if (!v) return '';
  return /^Bearer\s+/i.test(v) ? v.replace(/^Bearer\s+/i, '').trim() : '';
}
function maskId(s: string) {
  if (!s) return '';
  if (s.length <= 8) return '*'.repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 3) + '…' + s.slice(-3);
}

/* ---------------------- auth (mirrors diag-auth) ---------------------- */
function authorize(req: Request) {
  const url = new URL(req.url);
  const hdr = headers();
  const cks = cookies();

  // Env secrets (Production scope!)
  const ADMIN_TOKEN = trim(process.env.ADMIN_TOKEN);
  const CRON_SECRET = trim(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);

  // Presented tokens
  const headerAdmin = trim(hdr.get('x-admin-token'));
  const queryAdmin  = trim(url.searchParams.get('token'));
  const cookieAdmin = trim(cks.get('admin_token')?.value);
  const authHeader  = trim(hdr.get('authorization'));
  const bearer      = bearerToken(authHeader);

  const headerCron  = trim(hdr.get('x-cron-secret'));
  const queryCron   = trim(url.searchParams.get('secret') || url.searchParams.get('cron_secret'));

  const adminPresentedValues = [headerAdmin, queryAdmin, cookieAdmin, bearer].filter(Boolean);
  const cronPresentedValues  = [headerCron, queryCron, bearer].filter(Boolean);

  const adminMatched = !!ADMIN_TOKEN && adminPresentedValues.some(v => v === ADMIN_TOKEN);
  const cronMatched  = !!CRON_SECRET && cronPresentedValues.some(v => v === CRON_SECRET);

  const presented = {
    header_admin: !!headerAdmin,
    query_admin:  !!queryAdmin,
    cookie_admin: !!cookieAdmin,
    bearer:       !!bearer,
    header_cron:  !!headerCron,
    query_cron:   !!queryCron,
  };

  return {
    ok: adminMatched || cronMatched,
    mode: adminMatched ? 'admin' as const : (cronMatched ? 'cron' as const : null),
    presented,
    diag: {
      envPresent: { ADMIN_TOKEN: !!ADMIN_TOKEN, CRON_SECRET: !!CRON_SECRET },
      equals: {
        // safe booleans to help you debug
        query_admin_equals_env: !!ADMIN_TOKEN && !!queryAdmin && queryAdmin === ADMIN_TOKEN,
        cookie_admin_equals_env: !!ADMIN_TOKEN && !!cookieAdmin && cookieAdmin === ADMIN_TOKEN,
        header_admin_equals_env: !!ADMIN_TOKEN && !!headerAdmin && headerAdmin === ADMIN_TOKEN,
        bearer_equals_admin_env: !!ADMIN_TOKEN && !!bearer && bearer === ADMIN_TOKEN,
        query_cron_equals_env: !!CRON_SECRET && !!queryCron && queryCron === CRON_SECRET,
        header_cron_equals_env: !!CRON_SECRET && !!headerCron && headerCron === CRON_SECRET,
        bearer_equals_cron_env: !!CRON_SECRET && !!bearer && bearer === CRON_SECRET,
      },
      lengths: {
        ADMIN_TOKEN_len: ADMIN_TOKEN.length || 0,
        CRON_SECRET_len: CRON_SECRET.length || 0,
        query_admin_len: queryAdmin.length || 0,
        cookie_admin_len: cookieAdmin.length || 0,
        header_admin_len: headerAdmin.length || 0,
        bearer_len: bearer.length || 0,
        query_cron_len: queryCron.length || 0,
        header_cron_len: headerCron.length || 0,
      },
      // masked heads/tails help catch whitespace issues
      samples: {
        ADMIN_TOKEN: maskId(ADMIN_TOKEN),
        CRON_SECRET: maskId(CRON_SECRET),
        query_admin: maskId(queryAdmin),
        cookie_admin: maskId(cookieAdmin),
        header_admin: maskId(headerAdmin),
        bearer: maskId(bearer),
        query_cron: maskId(queryCron),
        header_cron: maskId(headerCron),
      },
    },
  };
}

/* ---------------------- handler ---------------------- */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.has('debug'); // ?debug=1 to see diagnostics

  const auth = authorize(req);

  // Always return diagnostics when debug=1 (even if unauthorized)
  if (debug) {
    return NextResponse.json(
      {
        ok: true,
        note: 'Debugging auth view for send-daily',
        authorized: auth.ok,
        mode: auth.mode,
        presented: auth.presented,
        diag: auth.diag,
        now: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized (cron/admin)' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Minimal DB ping so you can see it works end to end
  try {
    const count = await prisma.subscriber.count({ where: { active: true } });
    const sample = await prisma.subscriber.findMany({
      where: { active: true },
      select: { phoneE164: true, zip: true, durationMin: true, createdAt: true, lastSentAt: true },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return NextResponse.json(
      {
        ok: true,
        mode: auth.mode,
        matchedActive: count,
        sample,
        hints: {
          cron_query: '/api/cron/send-daily?dry=1&secret=YOUR_CRON_SECRET',
          cron_header: 'x-cron-secret: YOUR_CRON_SECRET',
          admin_query: '/api/cron/send-daily?dry=1&token=YOUR_ADMIN_TOKEN',
          debug_view: '/api/cron/send-daily?debug=1&secret=YOUR_CRON_SECRET',
        },
        now: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
