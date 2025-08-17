// app/api/preview/route.ts
import { NextResponse } from "next/server";
import { fetchWeather } from "../../../lib/weatherkit";
import { buildTimelineFromWeatherKit } from "../../../lib/weather";
import { civilTwilightUTC, formatLocalTime } from "../../../lib/solar";
import { scoreMinute } from "../../../lib/scoring";
import type { Prefs } from "../../../lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MinutePoint = {
  time: Date;
  tempF?: number;
  windMph?: number;
  uvIndex?: number;
  aqi?: number;
  humidityPct?: number;
  precipChancePct?: number;
  cloudCoverPct?: number;
};

type PreviewReq = {
  lat: number;
  lon: number;
  timeZone: string;
  durationMin: number;
  prefs: Prefs;
};

const roundInt = (x: number) => Math.round(x);

// same helpers as cron route
function minutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function daylightByLocalMinutes(
  timeline: { time: Date }[],
  timeZone: string,
  dawnUTC: Date,
  duskUTC: Date
) {
  const dawnM = minutesOfDay(dawnUTC, timeZone);
  const duskM = minutesOfDay(duskUTC, timeZone);
  const isWrapped = duskM <= dawnM;
  const slice = timeline.filter((pt) => {
    const mm = minutesOfDay(pt.time, timeZone);
    return isWrapped ? mm >= dawnM || mm < duskM : mm >= dawnM && mm < duskM;
  });
  return { slice, dawnM, duskM, isWrapped };
}

function pickDaylightSlice(
  timeline: MinutePoint[],
  lat: number,
  lon: number,
  timeZone: string
) {
  const t0 = timeline[0]?.time ?? new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const candidates = [new Date(), t0, new Date(t0.getTime() - DAY), new Date(t0.getTime() + DAY)];

  for (const d of candidates) {
    const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, d);
    const { slice } = daylightByLocalMinutes(timeline, timeZone, dawnUTC, duskUTC);
    if (slice.length > 0) return { daylight: slice, dawnUTC, duskUTC };
  }
  const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, new Date());
  return { daylight: [] as MinutePoint[], dawnUTC, duskUTC };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PreviewReq;
    const { lat, lon, timeZone, durationMin, prefs } = body || {};

    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      typeof durationMin !== "number" ||
      !timeZone
    ) {
      return NextResponse.json(
        { message: "Missing lat/lon/timeZone/durationMin" },
        { status: 400 }
      );
    }

    let wk: any;
    try {
      wk = await fetchWeather(lat, lon, timeZone);
    } catch (e: any) {
      console.error("preview(fetchWeather):", e?.message || e);
      return NextResponse.json(
        { message: `WeatherKit request failed: ${e?.message || "unknown error"}.` },
        { status: 502 }
      );
    }

    const timeline: MinutePoint[] = buildTimelineFromWeatherKit(wk, { stepMin: 1 });
    if (!timeline.length) {
      const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, new Date());
      return NextResponse.json({
        empty: true,
        message: "No weather timeline data returned.",
        dawnUTC: dawnUTC.toISOString(),
        duskUTC: duskUTC.toISOString(),
        dawnLocal: formatLocalTime(dawnUTC, timeZone),
        duskLocal: formatLocalTime(duskUTC, timeZone),
      });
    }

    const picked = pickDaylightSlice(timeline, lat, lon, timeZone);
    const daylight = picked.daylight;

    if (!daylight.length) {
      return NextResponse.json({
        empty: true,
        message: "No daylight minutes available (local-minute filter).",
        timelineStartUTC: timeline[0].time.toISOString(),
        timelineEndUTC: timeline[timeline.length - 1].time.toISOString(),
        dawnUTC: picked.dawnUTC.toISOString(),
        duskUTC: picked.duskUTC.toISOString(),
        dawnLocal: formatLocalTime(picked.dawnUTC, timeZone),
        duskLocal: formatLocalTime(picked.duskUTC, timeZone),
      });
    }

    const winLen = Math.min(durationMin, daylight.length);
    const scores = daylight.map((m) => scoreMinute(m, prefs));
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

    const bestStartUTC = daylight[bestStartIdx].time;
    const bestEndUTC = new Date(bestStartUTC.getTime() + winLen * 60_000);
    const bestScore = roundInt(bestAvg);

    // 5-min series for chart (full day)
    const fullScores = timeline.map((m) => scoreMinute(m, prefs));
    const series: Array<{ tUTC: number; score: number }> = [];
    for (let i = 0; i < timeline.length; i += 5) {
      const idx = Math.min(i, timeline.length - 1);
      series.push({ tUTC: timeline[idx].time.getTime(), score: roundInt(fullScores[idx]) });
    }

    return NextResponse.json({
      dawnUTC: picked.dawnUTC.toISOString(),
      duskUTC: picked.duskUTC.toISOString(),
      bestStartUTC: bestStartUTC.toISOString(),
      bestEndUTC: bestEndUTC.toISOString(),
      bestScore,
      dawnLocal: formatLocalTime(picked.dawnUTC, timeZone),
      duskLocal: formatLocalTime(picked.duskUTC, timeZone),
      startLocal: formatLocalTime(bestStartUTC, timeZone),
      endLocal: formatLocalTime(bestEndUTC, timeZone),
      timelineStartUTC: timeline[0].time.toISOString(),
      timelineEndUTC: timeline[timeline.length - 1].time.toISOString(),
      series,
      usedDurationMin: winLen,
    });
  } catch (err: any) {
    console.error("preview(fatal):", err);
    return NextResponse.json({ message: err?.message ?? "Preview failed" }, { status: 500 });
  }
}
