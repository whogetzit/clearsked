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

// If you already read subscribers from DB or another module,
// remove this stub and plug your source in.
type Subscriber = {
  phoneE164: string;
  tz?: string;                              // e.g. 'America/Chicago'
  deliveryHourLocal?: number | string;      // hour 0–23; may be "08" -> 8
  lat: number;
  lon: number;
  onlyPhone?: boolean;                      // if true, skip the hour-gate
};

// TODO: replace with your real data source
const subscribers: Subscriber[] = [
  // Example:
  // { phoneE164: '+15551234567', tz: 'America/Chicago', deliveryHourLocal: 8, lat: 41.8781, lon: -87.6298 }
];

async function handle(): Promise<NextResponse> {
  const nowUTC = new Date();
  const results: Array<Record<string, unknown>> = [];

  for (const s of subscribers) {
    const tz = s.tz ?? 'America/Chicago';
    const onlyPhone = Boolean(s.onlyPhone);
    const deliveryHourLocal = s.deliveryHourLocal;

    // Current local time parts
    const nowParts = localParts(nowUTC, tz);

    // --- FIX: compare number ↔ number ---
    const deliveryHourNum =
      typeof deliveryHourLocal === 'string'
        ? Number(deliveryHourLocal) // "08" -> 8
        : deliveryHourLocal;        // already a number or undefined

    // Gate the send to the configured local hour (unless onlyPhone is true)
    if (
      !onlyPhone &&
      Number.isFinite(deliveryHourNum) &&
      (deliveryHourNum as number) !== nowParts.h
    ) {
      results.push({
        phone: s.phoneE164,
        tz,
        deliveryHourLocal,
        localHourNow: nowParts.h,   // numeric hour 0–23
        localHourNowPadded: nowParts.hh, // "08"
        skipped: 'local hour does not match deliveryHourLocal',
      });
      continue;
    }

    // Fetch sunrise/sunset-ish civil times and weather (customize as needed)
    const civil = getCivilTimes(s.lat, s.lon, nowUTC, tz);
    const weather = await fetchWeather(s.lat, s.lon).catch((err: unknown) => {
      results.push({
        phone: s.phoneE164,
        tz,
        error: 'weather fetch failed',
        details: String(err),
      });
      return null;
    });
    if (!weather) continue;

    // Compose a simple message (customize to your needs)
    const nowLine = `${fmtLocalDateLine(nowUTC, tz)} • ${fmtLocalHM(nowUTC, tz)}`;
    const sunLine = `Sunrise ${fmtLocalHM(civil.sunrise, tz)}, Sunset ${fmtLocalHM(civil.sunset, tz)}`;
    const token = hourToken(nowUTC, tz);

    const msg =
      `Good ${nowParts.h < 12 ? 'morning' : 'afternoon'}!\n` +
      `${nowLine}\n` +
      `${sunLine}\n` +
      `Token: ${token}`;

    // Send SMS (handle/record failures)
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
