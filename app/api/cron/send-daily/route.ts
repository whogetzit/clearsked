// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { env } from '@/lib/env';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';

// … (keep all your helpers & logic exactly as you have now) …

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): { ok: true; mode: 'admin' | 'cron' } | { ok: false } {
  const url = new URL(req.url);
  const hdrs = headers();

  const adminToken = env.ADMIN_TOKEN || '';
  const cronSecret = (process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim();

  // Read candidates
  const hAdmin = hdrs.get('x-admin-token') || '';
  const qAdmin = url.searchParams.get('token') || '';
  const cAdmin = cookies().get('admin_token')?.value || '';
  const auth = hdrs.get('authorization') || ''; // Bearer <token>

  const hCron = hdrs.get('x-cron-secret') || '';
  const qCron = url.searchParams.get('secret') || '';

  const bearer = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : '';

  // Admin checks
  if (adminToken) {
    if (hAdmin === adminToken || qAdmin === adminToken || cAdmin === adminToken || bearer === adminToken) {
      return { ok: true, mode: 'admin' };
    }
  }

  // Cron checks
  if (cronSecret) {
    if (hCron === cronSecret || qCron === cronSecret || bearer === cronSecret) {
      return { ok: true, mode: 'cron' };
    }
  }

  return { ok: false };
}

export async function GET(req: Request) {
  // ---------- AUTH ----------
  const auth = isAuthorized(req);
  if (!auth.ok) {
    // keep error text stable for debugging
    return NextResponse.json({ ok: false, error: 'unauthorized (cron/admin)' }, { status: 401 });
  }

  // ---------- existing logic from your route below ----------
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1' || !url.searchParams.get('send');
  const onlyPhone = url.searchParams.get('phone') || undefined;

  try {
    // … your current code (fetch subscribers, weather, build chart, send SMS) …
    // make sure you kept all the helper functions from the previous version:
    //   - fmtLocal, toLocalDate, scorePoint, findBestWindow, getHourlySamples, pickDawnDusk, buildChartConfig, createChartUrl
    // and the Twilio sendSms import

    // (PLACE THE REST OF YOUR CURRENT IMPLEMENTATION HERE UNCHANGED)

    // If you want, keep returning details for debugging
    // ✅ return your real result object
return NextResponse.json({
  ok: true,
  method: 'GET',
  sent,
  matches,
  details,
});
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
