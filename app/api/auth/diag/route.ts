// app/api/auth/diag/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hdrs = headers();
  const cks = cookies();

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  const cronSecret =
    ((process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET) || '').trim();

  const hAdmin = (hdrs.get('x-admin-token') || '').trim();
  const qAdmin = (url.searchParams.get('token') || '').trim();
  const cAdmin = (cks.get('admin_token')?.value || '').trim();

  const auth = (hdrs.get('authorization') || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';

  const hCron = (hdrs.get('x-cron-secret') || '').trim();
  const qCron = (url.searchParams.get('secret') || '').trim();

  const adminPresented = [hAdmin, qAdmin, cAdmin, bearer].filter(Boolean);
  const cronPresented  = [hCron, qCron, bearer].filter(Boolean);

  const adminMatched = adminToken && adminPresented.includes(adminToken);
  const cronMatched  = cronSecret && cronPresented.includes(cronSecret);

  return NextResponse.json({
    envPresent: {
      ADMIN_TOKEN: !!adminToken,
      CRON_SECRET: !!cronSecret,
    },
    presented: {
      header_admin: !!hAdmin,
      query_admin: !!qAdmin,
      cookie_admin: !!cAdmin,
      bearer: !!bearer,
      header_cron: !!hCron,
      query_cron: !!qCron,
    },
    matched: {
      adminMatched: !!adminMatched,
      cronMatched: !!cronMatched,
    },
    notes: "No secrets returned; only booleans. Use this to confirm which method matches.",
  });
}
