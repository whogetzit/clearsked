// app/api/admin/subscribers/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { env } from '@/lib/env';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskPhone(phone: string) {
  if (!phone) return '';
  // +1********21 style for US, generic keep last 2 otherwise
  if (phone.startsWith('+1') && phone.length >= 4) {
    return '+1' + '*'.repeat(Math.max(0, phone.length - 4)) + phone.slice(-2);
  }
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
}

function coalescePref<T>(column: T | null | undefined, fromPrefs: T | null | undefined): T | undefined {
  return (column ?? fromPrefs) ?? undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit') ?? '50';
    const mask = url.searchParams.get('mask') ?? '1';

    // --- AUTH: accept header OR query OR cookie ---
    const hdr = headers();
    const tokenHeader = hdr.get('x-admin-token') ?? undefined;
    const tokenQuery = url.searchParams.get('token') ?? undefined;
    const tokenCookie = cookies().get('admin_token')?.value ?? undefined;
    const provided = tokenHeader ?? tokenQuery ?? tokenCookie;
    if (!env.ADMIN_TOKEN || provided !== env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'unauthorized (admin)' }, { status: 401 });
    }

    const limit = Math.max(1, Math.min(500, parseInt(limitRaw, 10) || 50));

    // --- Query DB: select all relevant columns (requires your updated Prisma schema) ---
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

        // explicit preference columns
        prefTempMin: true,
        prefTempMax: true,
        prefWindMax: true,
        prefUvMax: true,
        prefAqiMax: true,
        prefHumidityMax: true,
        prefPrecipMax: true,
        prefCloudMax: true,

        // legacy JSON for back-compat / fallback
        prefs: true,
      },
    });

    const rows = subs.map((s) => {
      const p: any = s.prefs ?? {};
      return {
        phone: mask === '1' ? maskPhone(s.phoneE164) : s.phoneE164,
        active: s.active,
        zip: s.zip,
        latitude: s.latitude ?? undefined,
        longitude: s.longitude ?? undefined,
        durationMin: s.durationMin ?? undefined,

        timeZone: s.timeZone ?? p.timeZone ?? undefined,
        deliveryHourLocal: (s.deliveryHourLocal ?? p.deliveryHourLocal) ?? undefined,

        createdAt: (s as any).createdAt?.toISOString?.() ?? (s as any).createdAt,
        lastSentAt: s.lastSentAt ? ((s.lastSentAt as any).toISOString?.() ?? s.lastSentAt) : null,

        // normalize to the keys your Admin UI expects
        tempMin: coalescePref(s.prefTempMin, p.tempMin),
        tempMax: coalescePref(s.prefTempMax, p.tempMax),
        windMax: coalescePref(s.prefWindMax, p.windMax),
        uvMax: coalescePref(s.prefUvMax, p.uvMax),
        aqiMax: coalescePref(s.prefAqiMax, p.aqiMax),
        humidityMax: coalescePref(s.prefHumidityMax, p.humidityMax),
        precipMax: coalescePref(s.prefPrecipMax, p.precipMax),
        cloudMax: coalescePref(s.prefCloudMax, p.cloudMax),
      };
    });

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
