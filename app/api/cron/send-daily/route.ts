// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';
import {
  getCivilTimes,
  fmtLocalHM,
  fmtLocalDateLine,
  hourToken,
  localParts,
} from '@/lib/sun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Subscriber = {
  phoneE164: string;
  tz?: string;
  deliveryHourLocal?: number | string;
  lat: number;
  lon: number;
  zip?: string;
  onlyPhone?: boolean;
};

// TODO: Replace with your real data source (DB, etc.)
const subscribers: Subscriber[] = [
  // Example:
  // { phoneE164: '+15551234567', tz: 'America/Chicago', deliveryHourLocal: 8, lat: 41.8781, lon: -87.6298 },
];

async function handle(): Promise<NextResponse> {
  const nowUTC = new Date();
  const results: Array<Record<string, unknown>> = [];

  for (const s of subscribers) {
    const tz = s.tz ?? 'America/Chicago';
    const onlyPhone = Boolean(s.onlyPhone);
    const deliveryHourLocal = s.deliveryHourLocal;

    // Current local time (parts)
    const nowParts = localParts(nowUTC, tz);

    // Coerce to a number for comparison (string "08" -> 8)
    const deliveryHourNum =
      typeof deliveryHourLocal === 'string'
        ? Number(deliveryHourLocal)
        : deliveryHourLocal;

    // Gate: send only when local hour matches (unless onlyPhone)
    if (
      !onlyPhone &&
      Number.isFinite(deliveryHourNum) &&
      (deliveryHourNum as number) !== nowParts.h
    ) {
      results.push({
        phone: s.phoneE164,
        tz,
        deliveryHourLocal,
        localHourNow: nowParts.h,        // numeric 0–23
        localHourNowPadded: nowParts.hh, // "08"
        skipped: 'local hour does not match deliveryHourLocal',
      });
      continue;
    }

    // Civil times (placeholder implementation in lib/sun)
    const civil = getCivilTimes(s.lat, s.lon, nowUTC, tz);

    // Weather — FIX: pass the 3rd expected argument
    // If your fetchWeather signature is (lat, lon, when: Date) instead of tz,
    // change the 3rd param to `nowUTC`.
    const weather = await fetchWeather(s.lat, s.lon, tz).catch((err: unknown) => {
      results.push({
        phone: s.phoneE164,
        tz,
        error: 'weather fetch failed',
        details: String(err),
      });
      return null;
    });
    if (!weather) continue;

    // Compose message (customize as needed)
    const nowLine = `${fmtLocalDateLine(nowUTC, tz)} • ${fmtLocalHM(nowUTC, tz)}`;
    const sunLine = `Sunrise ${fmtLocalHM(civil.sunrise, tz)}, Sunset ${fmtLocalHM(civil.sunset, tz)}`;
    const token = hourToken(nowUTC, tz);

    const msg =
      `Good ${nowParts.h < 12 ? 'morning' : 'afternoon'}!\n` +
      `${nowLine}\n` +
      `${sunLine}\n` +
      `Token: ${token}`;

    try {
      await sendSms(s.phoneE164, msg);
      results.push({ phone: s.phoneE164, tz, sent: true });
    } catch (err) {
      results.push({
        phone: s.phoneE164,
        tz,
        sent: false,
        error: 'sms send failed',
        details: String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    nowUTC: nowUTC.toISOString(),
    count: subscribers.length,
    results,
  });
}

export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}
