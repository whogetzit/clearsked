// app/api/cron/send-daily/route.ts
import { NextResponse } from "next/server";
import Twilio from "twilio";
import { fetchWeather } from "../../../../lib/weatherkit";
import { buildTimelineFromWeatherKit } from "../../../../lib/weather";
import { civilTwilightUTC, formatLocalTime } from "../../../../lib/solar";
import { scoreMinute } from "../../../../lib/scoring";
import type { Prefs } from "../../../../lib/scoring";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --- Prisma (safe at module scope; no network until used) ---
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// --- Twilio: LAZY init so it doesn't run during build ---
let twilioClient: ReturnType<typeof Twilio> | null = null;
function getTwilio() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error(
        "Twilio credentials missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
      );
    }
    twilioClient = Twilio(sid, token);
  }
  return twilioClient;
}
function getTwilioFrom() {
  const from = process.env.TWILIO_FROM;
  if (!from) throw new Error("TWILIO_FROM is missing.");
  return from;
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

function localHourNow(tz: string): number {
  const hStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: tz,
  }).format(new Date());
  return Number(hStr);
}
function sameLocalDate(a: Date, b: Date, tz: string) {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return fmt(a) === fmt(b);
}

async function coreRun(testPhone?: string) {
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
      const desiredDuration = clamp(s.durationMin || 60, 10, 240);

      // per-user delivery hour stored in prefs
      const deliveryHourLocal: number = Number(
        (s.prefs as any)?.deliveryHourLocal ?? 5
      );

      // Only send at the user’s chosen local hour (unless testing a single number)
      if (localHourNow(tz) !== deliveryHourLocal && !testPhone) {
        continue;
      }

      // Don’t double-send if already sent “today” in their timezone
      if (
        s.lastSentAt &&
        sameLocalDate(new Date(s.lastSentAt), new Date(), tz) &&
        !testPhone
      ) {
        continue;
      }

      // Weather → timeline
      const wk = await fetchWeather(s.latitude, s.longitude, tz);
      const timeline = buildTimelineFromWeatherKit(wk, { stepMin: 1 });
      if (!timeline.length) continue;

      // Daylight window
      const { dawnUTC, duskUTC } = civilTwilightUTC(
        s.latitude,
        s.longitude,
        tz,
        new Date()
      );
      const daylight = timeline.filter(
        (m: any) => m.time >= dawnUTC && m.time < duskUTC
      );
      if (!daylight.length) {
        console.log(`[${s.phoneE164}] No daylight minutes today.`);
        continue;
      }

      // Shorten if daylight < desired duration
      const winLen = Math.min(desiredDuration, daylight.length);

      // Score & pick best window inside daylight
      const scores = daylight.map((m: any) => scoreMinute(m, prefs));
      const ps = new Array(scores.length + 1).fill(0);
      for (let i = 0; i < scores.length; i++) ps[i + 1] = ps[i] + scores[i];

      let bestStartIdx = 0;
      let bestAvg = -1;
      for (let i = 0; i + winLen <= scores.length; i++) {
        const avg = (ps[i + winLen] - ps[i]) / winLen;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestStartIdx = i;
        }
      }

      const bestStart = daylight[bestStartIdx].time as Date;
      const bestEnd = new Date(bestStart.getTime() + winLen * 60_000);
      const bestScore = Math.round(bestAvg);

      const midIdx = bestStartIdx + Math.floor(winLen / 2);
      const mid = daylight[Math.min(midIdx, daylight.length - 1)] as any;

      const dawnLocal = formatLocalTime(dawnUTC, tz);
      const duskLocal = formatLocalTime(duskUTC, tz);
      const startLocal = formatLocalTime(bestStart, tz);
      const endLocal = formatLocalTime(bestEnd, tz);

      const parts: string[] = [];
      if (typeof mid.tempF === "number") parts.push(`${Math.round(mid.tempF)}°F`);
      if (typeof mid.windMph === "number")
        parts.push(`${Math.round(mid.windMph)} mph wind`);
      if (typeof mid.uvIndex === "number") parts.push(`UV ${Math.round(mid.uvIndex)}`);
      if (typeof mid.aqi === "number") parts.push(`AQI ${Math.round(mid.aqi)}`);
      if (typeof mid.humidityPct === "number")
        parts.push(`${Math.round(mid.humidityPct)}% RH`);
      if (typeof mid.precipChancePct === "number")
        parts.push(`${Math.round(mid.precipChancePct)}% precip`);

      const durNote =
        winLen < desiredDuration
          ? ` (shortened to ${winLen} min due to limited daylight)`
          : "";

      const body =
        `Civil dawn ${dawnLocal} · Civil dusk ${duskLocal}\n` +
        `Best ${winLen}min (daylight): ${startLocal}–${endLocal} (Score ${bestScore})${durNote}\n` +
        `${parts.join(" · ")}\n— ClearSked (reply STOP to cancel)`;

      // --- Twilio send (client created lazily now) ---
      await getTwilio().messages.create({
        from: getTwilioFrom(),
        to: s.phoneE164,
        body,
      });

      await prisma.subscriber.update({
        where: { phoneE164: s.phoneE164 },
        data: { lastSentAt: new Date() },
      });

      sent++;
    } catch (err) {
      console.error("send-daily(sub):", s.phoneE164, err);
    }
  }

  return { sent };
}

export async function GET(req: Request) {
  // /api/cron/send-daily?phone=+15551234567 to test a single number
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone") || undefined;
  const result = await coreRun(phone);
  return NextResponse.json({ ok: true, ...result, method: "GET" });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const result = await coreRun(body?.phone);
  return NextResponse.json({ ok: true, ...result, method: "POST" });
}
