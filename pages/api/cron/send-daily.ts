// pages/api/cron/send-daily.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/db";
import { fetchWeather } from "@/lib/weatherkit";
import { buildTimelineFromWeatherKit, findBestWindow } from "@/lib/weather";
import type { Prefs } from "@/lib/scoring";
import { civilTwilightUTC, formatLocalTime } from "@/lib/solar";
import Twilio from "twilio";

const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
const twilioToken = process.env.TWILIO_AUTH_TOKEN!;
const twilioFrom = process.env.TWILIO_FROM!;
const client = Twilio(twilioSid, twilioToken);

// clamp helper
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const testPhone = (req.body?.phone as string | undefined) ?? undefined;

  const where: any = { active: true };
  if (testPhone) where.phoneE164 = testPhone;

  const subs = await prisma.subscriber.findMany({
    where,
    take: testPhone ? 1 : undefined,
  });

  let sent = 0;
  for (const s of subs) {
    try {
      const tz: string =
        (s.prefs as any)?.timeZone || (s as any).timeZone || "America/Chicago";
      const prefs: Prefs = (s.prefs as any) || {};
      const durationMin = clamp(s.durationMin || 60, 10, 240); // safety bounds

      // Weather
      const wk = await fetchWeather(s.latitude, s.longitude, tz);

      // 1-minute timeline for today (UTC), built from hourly buckets
      const timeline = buildTimelineFromWeatherKit(wk, { stepMin: 1 });

      if (!timeline.length) continue;

      // Civil dawn/dusk (UTC) for the subscriber's *local* calendar day
      const { dawnUTC, duskUTC } = civilTwilightUTC(s.latitude, s.longitude, tz, new Date());

      // Restrict to daylight only
      const daylight = timeline.filter(
        (m) => m.time >= dawnUTC && m.time < duskUTC
      );

      // Fallback: if timeline coverage is partial or there's not enough daylight minutes,
      // fall back to the full-day timeline to ensure they still receive a window.
      const source = daylight.length >= durationMin ? daylight : timeline;

      // Best window (minute-precision because stepMin=1)
      const { bestStart, bestEnd, bestScore, bestMidSummary } = findBestWindow(
        source,
        durationMin,
        prefs
      );

      if (!bestStart || !bestEnd) continue;

      // Format times in the subscriber's timezone
      const dawnLocal = formatLocalTime(dawnUTC, tz);
      const duskLocal = formatLocalTime(duskUTC, tz);
      const startLocal = formatLocalTime(bestStart, tz);
      const endLocal = formatLocalTime(bestEnd, tz);

      const mid = bestMidSummary || {};
      const parts: string[] = [];
      if (typeof mid.tempF === "number") parts.push(`${Math.round(mid.tempF)}°F`);
      if (typeof mid.windMph === "number") parts.push(`${Math.round(mid.windMph)} mph wind`);
      if (typeof mid.uvIndex === "number") parts.push(`UV ${Math.round(mid.uvIndex)}`);
      if (typeof mid.aqi === "number") parts.push(`AQI ${Math.round(mid.aqi)}`);
      if (typeof mid.humidityPct === "number") parts.push(`${Math.round(mid.humidityPct)}% RH`);
      if (typeof mid.precipChancePct === "number") parts.push(`${Math.round(mid.precipChancePct)}% precip`);

      const header = daylight.length >= durationMin
        ? `Civil dawn ${dawnLocal} · Civil dusk ${duskLocal}`
        : `Limited daylight data — using full-day`;

      const line1 = `Best ${durationMin}min: ${startLocal}–${endLocal} (Score ${bestScore})`;
      const line2 = parts.join(" · ");

      const msg = `${header}\n${line1}\n${line2}\n— ClearSked (reply STOP to cancel)`;

      await client.messages.create({
        from: twilioFrom,
        to: s.phoneE164,
        body: msg,
      });

      await prisma.subscriber.update({
        where: { phoneE164: s.phoneE164 },
        data: { lastSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error("send-daily error", s.phoneE164, err);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
