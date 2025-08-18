// app/api/admin/subscribers.csv/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAdminToken(): string | undefined {
  return (process.env.ADMIN_TOKEN || '').trim() || undefined;
}

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

function csvEscape(v: any) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
    const limit = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '1000', 10) || 1000));
    const mask = (url.searchParams.get('mask') || '1') === '1';

    const subs = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const header = [
      'phone',
      'active',
      'zip',
      'latitude',
      'longitude',
      'durationMin',
      'timeZone',
      'deliveryHourLocal',
      'createdAt',
      'lastSentAt',
    ];

    const rows = subs.map((s: any) => {
      const p = s.prefs ?? {};
      const phone = mask
        ? (s.phoneE164 ? s.phoneE164.replace(/^\+1(\d+)(\d{2})$/, (_m: any, mid: string, last: string) => '+1' + '*'.repeat(mid.length + 0) + last) : '')
        : s.phoneE164;

      const createdAt = s.createdAt ? new Date(s.createdAt).toISOString() : '';
      const lastSentAt = s.lastSentAt ? new Date(s.lastSentAt).toISOString() : '';

      return [
        phone,
        s.active ? 'true' : 'false',
        s.zip ?? '',
        s.latitude ?? '',
        s.longitude ?? '',
        s.durationMin ?? '',
        s.timeZone ?? p.timeZone ?? '',
        s.deliveryHourLocal ?? p.deliveryHourLocal ?? '',
        createdAt,
        lastSentAt,
      ];
    });

    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="subscribers.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
