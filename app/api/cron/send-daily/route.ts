// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** ---------- Auth helpers (mirrors /api/diag-auth) ---------- */
function trim(v: string | null | undefined) { return (v ?? '').trim(); }
function bearerToken(h: string | null) {
  const v = trim(h);
  if (!v) return '';
  return /^Bearer\s+/i.test(v) ? v.replace(/^Bearer\s+/i, '').trim() : '';
}

function isAuthorized(req: Request): {
  ok: true; mode: 'admin' | 'cron';
  presented: Record<string, boolean>;
} | { ok: false } {
  const url = new URL(req.url);
  const hdr = headers();
  const cks = cookies();

  const ADMIN_TOKEN = trim(process.env.ADMIN_TOKEN);
  // Accept either CRON_SECRET or VERCEL_CRON_SECRET
  const CRON_SECRET = trim(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);

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

  if (adminMatched) {
    return { ok: true, mode: 'admin', presented: {
      header_admin: !!headerAdmin, query_admin: !!queryAdmin, cookie_admin: !!cookieAdmin,
      bearer: !!bearer, header_cron: !!headerCron, query_cron: !!queryCron,
    }};
  }
  if (cronMatched) {
    return { ok: true, mode: 'cron', presented: {
      header_admin: !!headerAdmin, query_admin: !!queryAdmin, cookie_admin: !!cookieAdmin,
      bearer: !!bearer, header_cron: !!headerCron, query_cron: !!queryCron,
    }};
  }
  return { ok: false };
}

/** ---------- Minimal handler to confirm auth path ---------- */
export async function GET(req: Request) {
  const auth = isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized (cron/admin)' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get('dry') === '1' || !url.searchParams.has('send');
    const onlyPhone = url.searchParams.get('phone') || undefined;

    // Keep the DB selection super-safe: select columns we know exist everywhere
    const where: any = { active: true };
    if (onlyPhone) where.phoneE164 = onlyPhone;

    const subs = await prisma.subscriber.findMany({
      where,
      select: { phoneE164: true, active: true, zip: true, durationMin: true, createdAt: true, lastSentAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // We’re not sending anything in this “auth fix” pass — just confirming access
    const details = subs.map(s => ({
      phone: s.phoneE164,
      zip: s.zip,
      durationMin: s.durationMin,
      createdAt: s.createdAt,
      lastSentAt: s.lastSentAt,
    }));

    return NextResponse.json({
      ok: true,
      mode: auth.mode,
      dry,
      matches: subs.length,
      sent: 0,
      details,
      hints: {
        use_query_secret: '/api/cron/send-daily?dry=1&secret=YOUR_CRON_SECRET',
        use_header_secret: 'x-cron-secret: YOUR_CRON_SECRET',
        use_admin_token: '/api/cron/send-daily?dry=1&token=YOUR_ADMIN_TOKEN',
      },
      presented: auth.presented,
      now: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
