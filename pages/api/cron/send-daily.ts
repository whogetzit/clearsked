// pages/api/cron/send-daily.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/db";
import { fetchWeather } from "@/lib/weatherkit";
import { buildTimelineFromWeatherKit, findBestWindow } from "@/lib/weather";
import type { Prefs } from "@/lib/scoring";
// Twilio
import Twilio from "twilio";

const twilioSid = process.env.TWILIO_ACCOUNT_SID!;
const twilioToken = process.env.TWILIO_AUTH_TOKEN!;
const twilioFrom = process.env.TWILIO_FROM!;
const client = Twilio(twilioSid, twilioToken);

// Helper to format a time in subscriber tz
function fmtTime(d: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  } catch {
    return d.toUTCString().slice(17, 22); // HH:MM as fallback
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Optionally accept a single phone for test runs:
  const testPhone = (req.body?.phone as string | undefined) ?? undefined;

  // Fetch subscribers
  const where: any = { active: true };
  if (testPhone) where.phoneE164 = testPhone;

  const subs = await prisma.subscriber.findMany({
    where,
    take: testPhone ? 1 : undefined,
  });

  let sent = 0;
  for (const s of subs) {
    try {
      const tz = (s.prefs as any)?.timeZone || "America/Chicago";
      const prefs: Prefs = s.prefs || {};
      const durationMin = s.durationMin || 60;

      const wk = await fetchWeather(s.latitude, s.longitude, tz);
      const timeline = buildTimelineFromWeatherKit(wk, { stepMin: 5 });

      const { bestStart, bestEnd, bestScore, bestMidSummary } = findBestWindow(
        timeline,
        durationMin,
        prefs
      );

      if (!bestStart || !bestEnd) continue;

      const line1 = `Best ${durationMin}min: ${fmtTime(bestStart, tz)}–${fmtTime(bestEnd, tz)} (Score ${bestScore})`;

      // condition snapshot near midpoint
      const mid = bestMidSummary || {};
      const parts: string[] = [];
      if (typeof mid.tempF === "number") parts.push(`${Math.round(mid.tempF)}°F`);
      if (typeof mid.windMph === "number") parts.push(`${Math.round(mid.windMph)} mph wind`);
      if (typeof mid.uvIndex === "number") parts.push(`UV ${Math.round(mid.uvIndex)}`);
      if (typeof mid.aqi === "number") parts.push(`AQI ${Math.round(mid.aqi)}`);
      if (typeof mid.humidityPct === "number") parts.push(`${Math.round(mid.humidityPct)}% RH`);
      if (typeof mid.precipChancePct === "number") parts.push(`${Math.round(mid.precipChancePct)}% precip`);

      const line2 = parts.join(" · ");

      const msg =
        `${line1}\n${line2}\n` +
        `— ClearSked (reply STOP to cancel)`;

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
      // Swallow per-subscriber errors to continue others
      console.error("send-daily error", s.phoneE164, err);
    }
  }

  return res.status(200).json({ ok: true, sent });
}
