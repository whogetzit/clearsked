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
        {
          message: `WeatherKit request failed: ${e?.message || "unknown error"}. Check WEATHERKIT_* env vars.`,
        },
        { status: 502 }
      );
    }

    const timeline: MinutePoint[] = buildTimelineFromWeatherKit(wk, { stepMin: 1 });
    const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, new Date());

    if (!timeline.length) {
      return NextResponse.json({
        empty: true,
        message: "No weather timeline data returned.",
        dawnUTC: dawnUTC.toISOString(),
        duskUTC: duskUTC.toISOString(),
        dawnLocal: formatLocalTime(dawnUTC, timeZone),
        duskLocal: formatLocalTime(duskUTC, timeZone),
      });
    }

    const daylight = timeline.filter((m) => m.time >= dawnUTC && m.time < duskUTC);
    if (!daylight.length) {
      return NextResponse.json({
        empty: true,
        message: "No daylight minutes available for today at that location.",
        dawnUTC: dawnUTC.toISOString(),
        duskUTC: duskUTC.toISOString(),
        dawnLocal: formatLocalTime(dawnUTC, timeZone),
        duskLocal: formatLocalTime(duskUTC, timeZone),
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
      dawnUTC: dawnUTC.toISOString(),
      duskUTC: duskUTC.toISOString(),
      bestStartUTC: bestStartUTC.toISOString(),
      bestEndUTC: bestEndUTC.toISOString(),
      bestScore,
      dawnLocal: formatLocalTime(dawnUTC, timeZone),
      duskLocal: formatLocalTime(duskUTC, timeZone),
      startLocal: formatLocalTime(bestStartUTC, timeZone),
      endLocal: formatLocalTime(bestEndUTC, timeZone),
      series,
      usedDurationMin: winLen,
    });
  } catch (err: any) {
    console.error("preview(fatal):", err);
    return NextResponse.json({ message: err?.message ?? "Preview failed" }, { status: 500 });
  }
}
