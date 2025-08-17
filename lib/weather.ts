// lib/weather.ts
import { averageScore, MinuteConditions, Prefs } from "./scoring";

// Build a minute (or 5-minute) timeline for today from WeatherKit response
export function buildTimelineFromWeatherKit(
  wk: any,
  opts?: { stepMin?: number }
): MinuteConditions[] {
  const step = Math.max(1, opts?.stepMin ?? 5); // 5-minute bins
  const hours: any[] =
    wk?.forecastHourly?.hours ??
    wk?.forecastHourly?.forecast ??
    wk?.forecastHourly ??
    [];

  // Air quality may be in separate dataset
  const aqh: any[] =
    wk?.airQualityForecast?.hours ??
    wk?.airQualityForecast?.forecast ??
    wk?.airQualityForecast ??
    [];

  const aqiByEpoch = new Map<number, number>();
  for (const h of aqh) {
    const t =
      h?.forecastStart?.toString() ??
      h?.startTime?.toString() ??
      h?.validTime?.toString() ??
      h?.time?.toString();
    if (!t) continue;
    const ts = Date.parse(t);
    const aqi =
      h?.airQualityIndex ??
      h?.airQualityIndexValue ??
      h?.airQuality?.index ??
      h?.aqi ??
      undefined;
    if (typeof aqi === "number") aqiByEpoch.set(ts, aqi);
  }

  const today = new Date();
  const y = today.getUTCFullYear(), m = today.getUTCMonth(), d = today.getUTCDate();
  const startUTC = Date.UTC(y, m, d, 0, 0, 0);
  const endUTC = Date.UTC(y, m, d, 23, 59, 59);

  // Build from hourly buckets with simple hold-forward within the hour
  const timeline: MinuteConditions[] = [];
  for (const h of hours) {
    const tStr =
      h?.forecastStart?.toString() ??
      h?.startTime?.toString() ??
      h?.validTime?.toString() ??
      h?.time?.toString();
    if (!tStr) continue;

    const t0 = Date.parse(tStr); // ms UTC
    if (isNaN(t0) || t0 < startUTC || t0 > endUTC) continue;

    const tempF =
      typeof h?.temperature?.value === "number"
        ? cToF(h.temperature.value) // WeatherKit often delivers °C
        : (typeof h?.temperature === "number" ? cToF(h.temperature) : undefined);

    const windMph =
      typeof h?.windSpeed?.value === "number"
        ? msToMph(h.windSpeed.value) // m/s → mph
        : (typeof h?.windSpeed === "number" ? msToMph(h.windSpeed) : undefined);

    const uvIndex =
      typeof h?.uvIndex?.value === "number" ? h.uvIndex.value :
      (typeof h?.uvIndex === "number" ? h.uvIndex : undefined);

    const humidityPct =
      typeof h?.humidity?.value === "number" ? h.humidity.value * 100 :
      (typeof h?.humidity === "number" ? h.humidity * 100 : undefined);

    const cloudPct =
      typeof h?.cloudCover?.value === "number" ? h.cloudCover.value * 100 :
      (typeof h?.cloudCover === "number" ? h.cloudCover * 100 : undefined);

    const precipChancePct =
      typeof h?.precipitationChance?.value === "number" ? h.precipitationChance.value * 100 :
      (typeof h?.precipitationChance === "number" ? h.precipitationChance * 100 : undefined);

    const aqi = aqiByEpoch.get(t0);

    // push at step granularity inside the hour
    for (let min = 0; min < 60; min += step) {
      const t = new Date(t0 + min * 60_000);
      timeline.push({
        time: t,
        tempF,
        windMph,
        uvIndex,
        aqi,
        humidityPct,
        cloudPct,
        precipChancePct,
      });
    }
  }

  // sort (just in case)
  timeline.sort((a, b) => a.time.getTime() - b.time.getTime());
  return timeline;
}

export function findBestWindow(
  timeline: MinuteConditions[],
  durationMin: number,
  prefs: Prefs
): {
  bestStart?: Date;
  bestEnd?: Date;
  bestScore: number;
  bestMidpoint?: Date;
  bestMidSummary?: MinuteConditions;
} {
  if (!timeline.length || durationMin <= 0) return { bestScore: 0 };

  const stepMin = Math.round(
    (timeline[1]?.time.getTime() - timeline[0]?.time.getTime()) / 60_000
  ) || 5;

  const need = Math.max(1, Math.round(durationMin / stepMin));
  let bestScore = -1;
  let bestIdx = -1;

  for (let i = 0; i + need <= timeline.length; i++) {
    const windowSlice = timeline.slice(i, i + need);
    const avg = averageScore(windowSlice, prefs);
    if (avg > bestScore) {
      bestScore = avg;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return { bestScore: 0 };

  const start = timeline[bestIdx].time;
  const end = new Date(start.getTime() + durationMin * 60_000);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  // pick the minute closest to midpoint for summary conditions
  const midIdx = bestIdx + Math.floor(need / 2);
  const midSummary = timeline[Math.min(midIdx, timeline.length - 1)];

  return { bestStart: start, bestEnd: end, bestScore, bestMidpoint: mid, bestMidSummary: midSummary };
}

/* ----------------------------- small unit helpers ----------------------------- */
const cToF = (c: number) => c * 9/5 + 32;
const msToMph = (ms: number) => ms * 2.236936;
