// app/api/admin/subscribers/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { env } from '@/lib/env';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function maskPhone(phone: string) {
  if (!phone) return '';
  if (phone.startsWith('+1') && phone.length >= 4) {
    return '+1' + '*'.repeat(Math.max(0, phone.length - 4)) + phone.slice(-2);
  }
  return '*'.repeat(Math.max(0, phone.length - 2)) + phone.slice(-2);
}

function coalesce<T>(a: T | null | undefined, b: T | null | undefined): T | undefined {
  return (a ?? b) ?? undefined;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit') ?? '50';
    const mask = url.searchParams.get('mask') ?? '1';

    // --- AUTH (header OR query OR cookie) ---
    const hdr = headers();
    const tokenHeader = hdr.get('x-admin-token') ?? undefined;
    const tokenQuery = url.searchParams.get('token') ?? undefined;
    const tokenCookie = cookies().get('admin_token')?.value ?? undefined;
    const provided = tokenHeader ?? tokenQuery ?? tokenCookie;
    if (!env.ADMIN_TOKEN || provided !== env.ADMIN_TOKEN) {
      return NextResponse.json({ ok: false, error: 'unauthorized (admin)' }, { status: 401 });
    }

    const limit = Math.max(1, Math.min(500, parseInt(limitRaw, 10) || 50));

    // IMPORTANT: Select only columns that EXIST in the current DB
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
        createdAt: true,
        lastSentAt: true,
        prefs: true, // legacy JSON (may contain timeZone, deliveryHourLocal, and thresholds)
        // DO NOT select timeZone/deliveryHourLocal here until the DB has those columns
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

        // Read from prefs for now (since DB columns don't exist yet)
        timeZone: p.timeZone ?? undefined,
        deliveryHourLocal: p.deliveryHourLocal ?? undefined,

        createdAt: (s as any).createdAt?.toISOString?.() ?? (s as any).createdAt,
        lastSentAt: s.lastSentAt ? ((s.lastSentAt as any).toISOString?.() ?? s.lastSentAt) : null,

        // Normalize thresholds—prefer explicit columns later; for now, fall back to prefs
        tempMin: coalesce(undefined, p.tempMin),
        tempMax: coalesce(undefined, p.tempMax),
        windMax: coalesce(undefined, p.windMax),
        uvMax: coalesce(undefined, p.uvMax),
        aqiMax: coalesce(undefined, p.aqiMax),
        humidityMax: coalesce(undefined, p.humidityMax),
        precipMax: coalesce(undefined, p.precipMax),
        cloudMax: coalesce(undefined, p.cloudMax),
      };
    });

    return NextResponse.json({ ok: true, count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
