// app/api/diag-auth/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function trim(s: string | null | undefined) { return (s ?? '').trim(); }
function bearerToken(h: string | null) {
  const v = trim(h);
  if (!v) return '';
  return /^Bearer\s+/i.test(v) ? v.replace(/^Bearer\s+/i, '').trim() : '';
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hdr = headers();
  const cks = cookies();

  const ADMIN_TOKEN = trim(process.env.ADMIN_TOKEN);
  const CRON_SECRET = trim(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);

  const headerAdmin = trim(hdr.get('x-admin-token'));
  const queryAdmin  = trim(url.searchParams.get('token'));
  const cookieAdmin = trim(cks.get('admin_token')?.value);
  const authHeader  = trim(hdr.get('authorization'));
  const bearer      = bearerToken(authHeader);

  const headerCron = trim(hdr.get('x-cron-secret'));
  const queryCron  = trim(url.searchParams.get('secret') || url.searchParams.get('cron_secret'));

  const adminPresentedValues = [headerAdmin, queryAdmin, cookieAdmin, bearer].filter(Boolean);
  const cronPresentedValues  = [headerCron, queryCron, bearer].filter(Boolean);

  const adminMatched = !!ADMIN_TOKEN && adminPresentedValues.some(v => v === ADMIN_TOKEN);
  const cronMatched  = !!CRON_SECRET && cronPresentedValues.some(v => v === CRON_SECRET);

  return NextResponse.json({
    ok: true,
    note: 'This route never requires auth; it only diagnoses what is presented vs env presence.',
    envPresent: { ADMIN_TOKEN: !!ADMIN_TOKEN, CRON_SECRET: !!CRON_SECRET },
    presented: {
      header_admin: !!headerAdmin,
      query_admin:  !!queryAdmin,
      cookie_admin: !!cookieAdmin,
      bearer:       !!bearer,
      header_cron:  !!headerCron,
      query_cron:   !!queryCron,
    },
    matched: { adminMatched, cronMatched },
    now: new Date().toISOString(),
  });
}
