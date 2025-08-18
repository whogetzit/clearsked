// app/api/admin/subscribers/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Read the admin token from env at runtime
function getAdminToken(): string | undefined {
  return (process.env.ADMIN_TOKEN || '').trim() || undefined;
}

// Accept token from header, query, or cookie
function getProvidedToken(req: Request): string | undefined {
  const url = new URL(req.url);
  const hdrs = headers();
  const fromHeader = hdrs.get('x-admin-token') || '';
  const fromQuery = url.searchParams.get('token') || '';
  const fromCookie = cookies().get('admin_token')?.value || '';
  const auth = hdrs.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  return (fromHeader || fromQuery || fromCookie || bearer || '').trim() || undefined;
}

function maskPhone(phone: string) {
  if (!phone) return '';
  if (phone.startsWith('+1') && phone.length >= 4) {
    return '+1' + '*'.repeat(Math.max(0, phone.length - 4)) + phone.slice(-2);
  }
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
}

export async function GET(req: Request) {
  try {
    // --- auth ---
    const adminToken = getAdminToken();
    const provided = getProvidedToken(req);
    if (!adminToken || provided !== adminToken) {
      return NextResponse.json({ ok: false, error: 'unauthorized (admin)' }, { status: 401 });
    }

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const mask = (url.searchParams.get('mask') || '1') === '1';

    // Select without specifying fields so this works regardless of your current schema
    const subs = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Shape for table
    const rows = subs.map((s: any) => {
      // read from columns if present, else fall back to prefs JSON
      const p = s.prefs ?? {};
      const phone = mask ? maskPhone(s.phoneE164) : s.phoneE164;

      return {
        phone,
        active: !!s.active,
        zip: s.zip || undefined,
        latitude: s.latitude ?? undefined,
        longitude: s.longitude ?? undefined,
        durationMin: s.durationMin ?? undefined,
        timeZone: s.timeZone ?? p.timeZone ?? undefined,
        deliveryHourLocal: s.deliveryHourLocal ?? p.deliveryHourLocal ?? undefined,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : undefined,
        lastSentAt: s.lastSentAt ? new Date(s.lastSentAt).toISOString() : null,
      } as const;
    });

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
