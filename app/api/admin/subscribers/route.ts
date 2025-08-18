// app/api/admin/subscribers/route.ts
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { env } from '@/lib/env';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskPhone(phone: string) {
  // +1********21 style
  if (!phone) return '';
  if (phone.startsWith('+1') && phone.length >= 4) {
    return '+1' + '*'.repeat(Math.max(0, phone.length - 4)) + phone.slice(-2);
  }
  // generic mask: keep last 2
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit') ?? '50';
    const mask = url.searchParams.get('mask') ?? '1';

    // --- AUTH: accept header, query, or cookie ---
    const hdr = headers();
    const tokenHeader = hdr.get('x-admin-token') ?? undefined;
    const tokenQuery = url.searchParams.get('token') ?? undefined;
    const tokenCookie = cookies().get('admin_token')?.value ?? undefined;
    const provided = tokenHeader ?? tokenQuery ?? tokenCookie;

    if (!env.ADMIN_TOKEN || provided !== env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'unauthorized (admin)' }, { status: 401 });
    }

    const limit = Math.max(1, Math.min(500, parseInt(limitRaw, 10) || 50));

    const subs = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        phoneE164: true,
        active: true,
        zip: true,
        latitude: true,
        longitude: true,
        durationMin: true,
        timeZone: true,
        deliveryHourLocal: true,
        createdAt: true,
        lastSentAt: true,
        prefs: true,
      },
    });

    const rows = subs.map(s => {
      const prefs = (s as any).prefs || {};
      return {
        phone: mask === '1' ? maskPhone(s.phoneE164) : s.phoneE164,
        active: s.active,
        zip: s.zip,
        latitude: s.latitude ?? undefined,
        longitude: s.longitude ?? undefined,
        durationMin: s.durationMin ?? undefined,
        timeZone: s.timeZone ?? undefined,
        deliveryHourLocal: s.deliveryHourLocal ?? undefined,
        createdAt: s.createdAt?.toISOString?.() ?? s.createdAt,
        lastSentAt: s.lastSentAt ? (s.lastSentAt as Date).toISOString?.() ?? s.lastSentAt : null,
        tempMin: prefs.tempMin ?? undefined,
        tempMax: prefs.tempMax ?? undefined,
        windMax: prefs.windMax ?? undefined,
        uvMax: prefs.uvMax ?? undefined,
        aqiMax: prefs.aqiMax ?? undefined,
        humidityMax: prefs.humidityMax ?? undefined,
        precipMax: prefs.precipMax ?? undefined,
        cloudMax: prefs.cloudMax ?? undefined,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
