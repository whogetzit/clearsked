// pages/api/preview.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { fetchWeather } from "@/lib/weatherkit";
import { buildTimelineFromWeatherKit } from "@/lib/weather";
import { civilTwilightUTC, formatLocalTime } from "@/lib/solar";
import { scoreMinute } from "@/lib/scoring";
import type { Prefs } from "@/lib/scoring";

type PreviewReq = {
  lat: number;
  lon: number;
  timeZone: string;
  durationMin: number;
  prefs: Prefs;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { lat, lon, timeZone, durationMin, prefs } = req.body as PreviewReq;
    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !timeZone ||
      typeof durationMin !== "number"
    ) {
      return res.status(400).json({ message: "Missing lat/lon/timeZone/durationMin" });
    }

    // 1) Pull weather
    const wk = await fetchWeather(lat, lon, timeZone);

    // 2) Build a 1-minute timeline for today (UTC)
    const timeline = buildTimelineFromWeatherKit(wk, { stepMin: 1 });
    if (!timeline.length) return res.status(200).json({ empty: true });

    // 3) Compute civil twilight for today's *local* date at that lat/lon
    const { dawnUTC, duskUTC } = civilTwilightUTC(lat, lon, timeZone, new Date());

    // 4) Restrict to daylight minutes
    const startIdx = timeline.findIndex(m => m.time >= dawnUTC);
    const endIdx = timeline.findIndex(m => m.time >= duskUTC);
    const daylight = timeline.slice(
      startIdx >= 0 ? startIdx : 0,
      endIdx >= 0 ? endIdx : timeline.length
    );

    const source = daylight.length >= durationMin ? daylight : timeline;

    // 5) Minute-precision sliding window (best average score)
    // (mirror of findBestWindow but returns exact minute bounds)
    let bestStart = 0;
    let bestAvg = -1;
    const scores = source.map(m => scoreMinute(m, prefs));
    // prefix sum to speed up averages
    const ps: number[] = new Array(scores.length + 1).fill(0);
    for (let i = 0; i < scores.length; i++) ps[i + 1] = ps[i] + scores[i];

    for (let i = 0; i + durationMin <= scores.length; i++) {
      const avg = (ps[i + durationMin] - ps[i]) / durationMin;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestStart = i;
      }
    }
    const bestEnd = bestStart + durationMin;
    const bestScore = Math.round(bestAvg);

    const bestStartUTC = source[bestStart]?.time;
    const bestEndUTC = source[Math.min(bestEnd - 1, source.length - 1)]?.time;

    // 6) Downsample series to 5-minute buckets for the chart (reduce payload)
    const series: Array<{ tUTC: number; score: number }> = [];
    for (let i = 0; i < timeline.length; i += 5) {
      const s = Math.round(
        (ps[Math.min(i + 5, scores.length)] - ps[Math.min(i, scores.length)]) /
          Math.max(1, Math.min(5, scores.length - i))
      );
      series.push({ tUTC: timeline[i].time.getTime(), score: isNaN(s) ? 0 : s });
    }

    // 7) Local strings
    const dawnLocal = formatLocalTime(dawnUTC, timeZone);
    const duskLocal = formatLocalTime(duskUTC, timeZone);
    const startLocal = bestStartUTC ? formatLocalTime(bestStartUTC, timeZone) : "";
    const endLocal = bestEndUTC ? formatLocalTime(bestEndUTC, timeZone) : "";

    return res.status(200).json({
      dawnUTC: dawnUTC.toISOString(),
      duskUTC: duskUTC.toISOString(),
      bestStartUTC: bestStartUTC?.toISOString(),
      bestEndUTC: bestEndUTC?.toISOString(),
      bestScore,
      dawnLocal,
      duskLocal,
      startLocal,
      endLocal,
      series, // ~288 points (24h * 12)
      daylightLimited: daylight.length >= durationMin,
    });
  } catch (err: any) {
    console.error("preview error", err);
    return res.status(500).json({ message: err?.message ?? "Preview failed" });
  }
}
