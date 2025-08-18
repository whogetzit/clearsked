// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
// ... keep the rest of your imports (prisma, weather, twilio, etc.)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** ---------- AUTH HELPERS ---------- */
function getAdminToken(): string | undefined {
  return (process.env.ADMIN_TOKEN || '').trim() || undefined;
}
function getCronSecret(): string | undefined {
  return (
    (process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim() || undefined
  );
}
function getProvided(req: Request) {
  const url = new URL(req.url);
  const hdrs = headers();

  const fromHeader = hdrs.get('x-admin-token') || '';
  const fromQuery = url.searchParams.get('token') || '';
  const fromCookie = cookies().get('admin_token')?.value || '';
  const auth = hdrs.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  const cronHeader = hdrs.get('x-cron-secret') || '';
  const cronQuery = url.searchParams.get('secret') || '';

  return {
    adminProvided: (fromHeader || fromQuery || fromCookie || bearer || '').trim() || undefined,
    cronProvided: (cronHeader || cronQuery || bearer || '').trim() || undefined,
  };
}
function checkAuth(req: Request): { ok: true; mode: 'admin' | 'cron' } | { ok: false } {
  const adminToken = getAdminToken();
  const cronSecret = getCronSecret();
  const { adminProvided, cronProvided } = getProvided(req);

  if (adminToken && adminProvided === adminToken) return { ok: true, mode: 'admin' };
  if (cronSecret && cronProvided === cronSecret) return { ok: true, mode: 'cron' };
  return { ok: false };
}

/** ---------- HANDLER ---------- */
export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized (cron)' }, { status: 401 });
  }

  // ↓↓↓ KEEP your existing send logic here (weather/scoring/Twilio) ↓↓↓
  // Make sure you continue to honor query params:
  //   ?dry=1 (or omit `send`) → dry-run
  //   ?send=1 → real send
  //   ?phone=+1... → one-off
  //   ?bypassHour=1 → ignore deliveryHourLocal gate
  //
  // Return: NextResponse.json({ ok: true, sent, matches, details })

  // If you just want to sanity check auth first, uncomment this quick return:
  // return NextResponse.json({ ok: true, mode: auth.mode, note: 'auth works—now run your send logic' });

  // ...your existing logic...
}
