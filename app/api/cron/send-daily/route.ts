// app/api/cron/send-daily/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { fetchWeather } from "../../../../lib/weatherkit";
import { buildTimelineFromWeatherKit } from "../../../../lib/weather";
import { civilTwilightUTC, formatLocalTime } from "../../../../lib/solar";
import { scoreMinute } from "../../../../lib/scoring";
import type { Prefs } from "../../../../lib/scoring";
import { getTwilioClient, getTwilioSender } from "../../../../lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const localHourNow = (tz: string) =>
  Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
const sameLocalDate = (a: Date, b: Date, tz: string) => {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return fmt(a) === fmt(b);
};
function minutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
function daylightByLocalMinutes(timeline: { time: Date }[], timeZone: string, dawnUTC: Date, duskUTC: Date) {
  const dawnM = minutesOfDay(dawnUTC, timeZone);
  const duskM = minutesOfDay(duskUTC, timeZone);
  const isWrapped = duskM <= dawnM;
  const slice = timeline.filter((pt) => {
    const mm = minutesOfDay(pt.time, timeZone);
    return isWrapped ? mm >= dawnM || mm < duskM : mm >= dawnM && mm < duskM;
  });
  return { slice, dawnM, duskM };
}
function pickDaylightSlice(timeline: { time: Date }[], lat: number, lon: number, timeZone: string) {
  const t0 = timeline[0]?.time ?? new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const candidates = [new Date(), t0, new Date(t0.getTime() - DAY), new Date(t0.getTime() + DAY)];
  for (const d of candidates) {
    const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, d);
    const { slice } = daylightByLocalMinutes(timeline, timeZone, dawnUTC, duskUTC);
    if (slice.length > 0) return { daylight: slice, dawnUTC, duskUTC };
  }
  const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, new Date());
  return { daylight: [] as { time: Date }[], dawnUTC, duskUTC };
}

type RunOpts = { testPhone?: string; dry?: boolean; debug?: boolean; force?: boolean };

async function coreRun({ testPhone, dry, debug, force }: RunOpts) {
  const where: any = { active: true };
  if (testPhone) where.phoneE164 = testPhone;

  const subs = await prisma.subscriber.findMany({ where, take: testPhone ? 1 : undefined });
  const out: any = { sent: 0, matches: subs.length };
  const details: any[] = [];

  for (const s of subs) {
    const d: any = { phone: s.phoneE164 };
    try {
      const tz: string = (s.prefs as any)?.timeZone || (s as any).timeZone || "America/Chicago";
      const prefs: Prefs = (s.prefs as any) || {};
      const desiredDuration = clamp(s.durationMin || 60, 10, 240);
      const deliveryHourLocal: number = Number((s.prefs as any)?.deliveryHourLocal ?? 5);

      d.tz = tz;
      d.deliveryHourLocal = deliveryHourLocal;
      d.localHourNow = localHourNow(tz);

      if (!testPhone && !force && localHourNow(tz) !== deliveryHourLocal) {
        d.skipped = "local hour does not match deliveryHourLocal";
        details.push(d);
        continue;
      }
      if (!testPhone && !force && s.lastSentAt && sameLocalDate(new Date(s.lastSentAt), new Date(), tz)) {
        d.skipped = "already sent today";
        details.push(d);
        continue;
      }

      const wk = await fetchWeather(s.latitude, s.longitude, tz);
      const timeline = buildTimelineFromWeatherKit(wk, { stepMin: 1 });
      if (!timeline.length) {
        d.skipped = "no timeline data";
        details.push(d);
        continue;
      }

      const picked = pickDaylightSlice(timeline, s.latitude, s.longitude, tz);
      d.timelineStartUTC = timeline[0].time.toISOString();
      d.timelineEndUTC = timeline[timeline.length - 1].time.toISOString();
      d.dawnLocal = formatLocalTime(picked.dawnUTC, tz);
      d.duskLocal = formatLocalTime(picked.duskUTC, tz);

      const daylight = picked.daylight;
      if (!daylight.length) {
        d.skipped = "no daylight minutes (local-minute filter)";
        details.push(d);
        continue;
      }

      const winLen = Math.min(desiredDuration, daylight.length);
      d.requestedDuration = desiredDuration;
      d.usedDuration = winLen;

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

      const startLocal = formatLocalTime(bestStart, tz);
      const endLocal = formatLocalTime(bestEnd, tz);

      const parts: string[] = [];
      if (typeof mid.tempF === "number") parts.push(`${Math.round(mid.tempF)}°F`);
      if (typeof mid.windMph === "number") parts.push(`${Math.round(mid.windMph)} mph wind`);
      if (typeof mid.uvIndex === "number") parts.push(`UV ${Math.round(mid.uvIndex)}`);
      if (typeof mid.aqi === "number") parts.push(`AQI ${Math.round(mid.aqi)}`);
      if (typeof mid.humidityPct === "number") parts.push(`${Math.round(mid.humidityPct)}% RH`);
      if (typeof mid.precipChancePct === "number") parts.push(`${Math.round(mid.precipChancePct)}% precip`);

      const durNote = winLen < desiredDuration ? ` (shortened to ${winLen} min due to limited daylight)` : "";
      const body =
        `Civil dawn ${d.dawnLocal} · Civil dusk ${d.duskLocal}\n` +
        `Best ${winLen}min (daylight): ${startLocal}–${endLocal} (Score ${bestScore})${durNote}\n` +
        `${parts.join(" · ")}\n— ClearSked (reply STOP to cancel)`;

      d.startLocal = startLocal;
      d.endLocal = endLocal;
      d.bestScore = bestScore;
      d.smsPreview = body;

      if (dry) {
        d.skipped = "dry-run";
        details.push(d);
        continue;
      }

      // Send SMS via Twilio (Messaging Service preferred)
      try {
        await getTwilioClient().messages.create({
          ...getTwilioSender(),
          to: s.phoneE164,
          body,
        });
      } catch (e: any) {
        d.error = `twilio: ${e?.message || "send failed"}`;
        details.push(d);
        continue;
      }

      await prisma.subscriber.update({
        where: { phoneE164: s.phoneE164 },
        data: { lastSentAt: new Date() },
      });

      d.sent = true;
      details.push(d);
      out.sent++;
    } catch (err: any) {
      d.error = err?.message || "unknown";
      details.push(d);
    }
  }

  if (debug) out.details = details;
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone") || undefined;

  // Optional: allow manual phone test only if explicitly enabled
  const allowManual = process.env.ALLOW_MANUAL_PHONE === "1";
  if (phone && !allowManual) {
    return NextResponse.json({ ok: false, error: "manual phone override disabled" }, { status: 400 });
  }

  const dry = ["1", "true"].includes(url.searchParams.get("dry") || "");
  const debug = ["1", "true"].includes(url.searchParams.get("debug") || "");
  const force = ["1", "true"].includes(url.searchParams.get("force") || "");
  const result = await coreRun({ testPhone: phone, dry, debug, force });
  return NextResponse.json({ ok: true, method: "GET", ...result });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string; dry?: boolean; debug?: boolean; force?: boolean;
  };

  const allowManual = process.env.ALLOW_MANUAL_PHONE === "1";
  if (body?.phone && !allowManual) {
    return NextResponse.json({ ok: false, error: "manual phone override disabled" }, { status: 400 });
  }

  const result = await coreRun({
    testPhone: body?.phone,
    dry: !!body?.dry,
    debug: !!body?.debug,
    force: !!body?.force,
  });
  return NextResponse.json({ ok: true, method: "POST", ...result });
}
