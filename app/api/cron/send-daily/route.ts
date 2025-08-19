// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Bump this any time you redeploy, so you can verify which code is live:
const VERSION = 'send-daily.v3.0.0-2025-08-19T01:10Z';

function trim(s: string | null | undefined) { return (s ?? '').trim(); }
function bearerToken(v: string | null) {
  const s = trim(v);
  if (!s) return '';
  return /^Bearer\s+/i.test(s) ? s.replace(/^Bearer\s+/i, '').trim() : '';
}
function mask(s: string) {
  if (!s) return '';
  if (s.length <= 8) return '*'.repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 3) + '…' + s.slice(-3);
}

/** Auth identical to the diag route (admin or cron can pass) */
function authorize(req: Request) {
  const url = new URL(req.url);
  const hdr = headers();
  const cks = cookies();

  // Env secrets from Production scope
  const ADMIN_TOKEN = trim(process.env.ADMIN_TOKEN);
  const CRON_SECRET = trim(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);

  // Presented credentials
  const headerAdmin = trim(hdr.get('x-admin-token'));
  const queryAdmin  = trim(url.searchParams.get('token'));
  const cookieAdmin = trim(cks.get('admin_token')?.value);
  const authHeader  = trim(hdr.get('authorization'));
  const bearer      = bearerToken(authHeader);

  const headerCron  = trim(hdr.get('x-cron-secret'));
  const queryCron   = trim(url.searchParams.get('secret') || url.searchParams.get('cron_secret'));

  const adminPresented = [headerAdmin, queryAdmin, cookieAdmin, bearer].filter(Boolean);
  const cronPresented  = [headerCron, queryCron, bearer].filter(Boolean);

  const adminMatched = !!ADMIN_TOKEN && adminPresented.some(v => v === ADMIN_TOKEN);
  const cronMatched  = !!CRON_SECRET && cronPresented.some(v => v === CRON_SECRET);

  return {
    ok: adminMatched || cronMatched,
    mode: adminMatched ? 'admin' as const : (cronMatched ? 'cron' as const : null),
    presented: {
      header_admin: !!headerAdmin,
      query_admin:  !!queryAdmin,
      cookie_admin: !!cookieAdmin,
      bearer:       !!bearer,
      header_cron:  !!headerCron,
      query_cron:   !!queryCron,
    },
    diag: {
      envPresent: { ADMIN_TOKEN: !!ADMIN_TOKEN, CRON_SECRET: !!CRON_SECRET },
      equals: {
        query_admin_equals_env:  !!ADMIN_TOKEN && !!queryAdmin  && queryAdmin  === ADMIN_TOKEN,
        cookie_admin_equals_env: !!ADMIN_TOKEN && !!cookieAdmin && cookieAdmin === ADMIN_TOKEN,
        header_admin_equals_env: !!ADMIN_TOKEN && !!headerAdmin && headerAdmin === ADMIN_TOKEN,
        bearer_equals_admin_env: !!ADMIN_TOKEN && !!bearer     && bearer     === ADMIN_TOKEN,

        query_cron_equals_env:   !!CRON_SECRET && !!queryCron  && queryCron  === CRON_SECRET,
        header_cron_equals_env:  !!CRON_SECRET && !!headerCron && headerCron === CRON_SECRET,
        bearer_equals_cron_env:  !!CRON_SECRET && !!bearer     && bearer     === CRON_SECRET,
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
      samples: {
        ADMIN_TOKEN: mask(ADMIN_TOKEN),
        CRON_SECRET: mask(CRON_SECRET),
        query_admin: mask(queryAdmin),
        cookie_admin: mask(cookieAdmin),
        header_admin: mask(headerAdmin),
        bearer: mask(bearer),
        query_cron: mask(queryCron),
        header_cron: mask(headerCron),
      },
    },
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.has('debug'); // always allowed
  const auth = authorize(req);

  // 1) Debug surface (no auth required) — lets you prove which tokens are being seen and matched.
  if (debug) {
    return NextResponse.json({
      ok: true,
      version: VERSION,
      authorized: auth.ok,
      mode: auth.mode,
      presented: auth.presented,
      diag: auth.diag,
      now: new Date().toISOString(),
      try_examples: {
        cron_query: '/api/cron/send-daily?dry=1&secret=YOUR_CRON_SECRET',
        cron_header: 'x-cron-secret: YOUR_CRON_SECRET',
        admin_query: '/api/cron/send-daily?dry=1&token=YOUR_ADMIN_TOKEN'
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // 2) Enforce auth for all non-debug requests
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized (cron/admin)', version: VERSION },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // 3) Minimal success payload for now (we’ll re-enable SMS after auth is green)
  try {
    const count = await prisma.subscriber.count({ where: { active: true } });
    return NextResponse.json({
      ok: true,
      version: VERSION,
      mode: auth.mode,
      matchedActive: count,
      hint: 'Auth succeeded. Add &dry=1 to keep it non-sending; remove it when ready.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, version: VERSION, error: e?.message || 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
