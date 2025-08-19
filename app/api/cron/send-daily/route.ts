// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// -------------------- helpers --------------------
function trimSafe(s: string | null | undefined): string {
  return (s ?? '').trim();
}
function bearerToken(h: string | null): string {
  const v = (h ?? '').trim();
  if (!v) return '';
  if (/^Bearer\s+/i.test(v)) return v.replace(/^Bearer\s+/i, '').trim();
  return '';
}

type AuthDiag = {
  envPresent: { ADMIN_TOKEN: boolean; CRON_SECRET: boolean };
  presented: {
    header_admin: boolean;
    query_admin: boolean;
    cookie_admin: boolean;
    bearer: boolean;
    header_cron: boolean;
    query_cron: boolean;
  };
  matched: { adminMatched: boolean; cronMatched: boolean };
};

// returns mode or null + a safe diagnostics object
function checkAuth(req: Request): { mode: 'admin' | 'cron' | null; diag: AuthDiag } {
  const url = new URL(req.url);
  const hdr = headers();
  const cks = cookies();

  // env vars
  const ADMIN_TOKEN = trimSafe(process.env.ADMIN_TOKEN);
  const CRON_SECRET = trimSafe(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET);

  // presented
  const headerAdmin = trimSafe(hdr.get('x-admin-token'));
  const queryAdmin = trimSafe(url.searchParams.get('token'));
  const cookieAdmin = trimSafe(cks.get('admin_token')?.value);
  const authHeader = trimSafe(hdr.get('authorization'));
  const bearer = bearerToken(authHeader);

  const headerCron = trimSafe(hdr.get('x-cron-secret'));
  const queryCron = trimSafe(url.searchParams.get('secret') || url.searchParams.get('cron_secret'));

  // matching
  const adminPresentedValues = [headerAdmin, queryAdmin, cookieAdmin, bearer].filter(Boolean);
  const cronPresentedValues = [headerCron, queryCron, bearer].filter(Boolean);

  const adminMatched =
    !!ADMIN_TOKEN && adminPresentedValues.some(v => v === ADMIN_TOKEN);
  const cronMatched =
    !!CRON_SECRET && cronPresentedValues.some(v => v === CRON_SECRET);

  const diag: AuthDiag = {
    envPresent: { ADMIN_TOKEN: !!ADMIN_TOKEN, CRON_SECRET: !!CRON_SECRET },
    presented: {
      header_admin: !!headerAdmin,
      query_admin: !!queryAdmin,
      cookie_admin: !!cookieAdmin,
      bearer: !!bearer,
      header_cron: !!headerCron,
      query_cron: !!queryCron,
    },
    matched: { adminMatched, cronMatched },
  };

  let mode: 'admin' | 'cron' | null = null;
  if (adminMatched) mode = 'admin';
  else if (cronMatched) mode = 'cron';

  return { mode, diag };
}

// -------------------- handler --------------------
export async function GET(req: Request) {
  // Always support trace BEFORE enforcing auth
  const wantsTrace = new URL(req.url).searchParams.get('trace') === '1';
  const { mode, diag } = checkAuth(req);

  if (wantsTrace) {
    // Safe diagnostics — no secrets returned
    return NextResponse.json({
      ok: !!mode,
      mode,
      ...diag,
      note: 'Add ?token=ADMIN_TOKEN or ?secret=CRON_SECRET (or headers/cookie).',
    });
  }

  if (!mode) {
    return NextResponse.json({ ok: false, error: 'unauthorized (cron)' }, { status: 401 });
  }

  // Minimal success body so you can confirm auth is working
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  return NextResponse.json({
    ok: true,
    mode,
    dry,
    now: new Date().toISOString(),
    message: 'Auth OK. Once verified, we can re-enable the full job logic.',
  });
}
