// app/page.tsx
import HomeChart from './components/HomeChart';
import { fetchWeather } from '@/lib/weatherkit';
import { getCivilTimes, fmtLocalHM, fmtLocalDateLine, hourToken, localParts } from '@/lib/sun';
import * as zipcodes from 'zipcodes';
import ComfortChart from '@/components/ComfortChart';

export const dynamic = 'force-dynamic';

type SearchParams = { zip?: string; tz?: string };

type HourSample = {
  time: Date; temperature?: number; windSpeed?: number; uvIndex?: number;
};

function asNumber(x: any): number | undefined {
  const n = Number(x); return Number.isFinite(n) ? n : undefined;
}

function extractHourly(w: any): HourSample[] {
  const hours: any[] =
    w?.forecastHourly?.hours ??
    w?.forecastHourly?.forecast ??
    w?.forecastHourly ??
    [];
  return hours
    .map((h: any) => {
      const tIso = h?.forecastStart ?? h?.startTime ?? h?.time;
      const time = tIso ? new Date(String(tIso)) : new Date(NaN);
      const temperature =
        asNumber(h?.temperature) ??
        asNumber(h?.temperatureApparent) ??
        asNumber(h?.temperatureMin) ??
        undefined;
      const windSpeed = asNumber(h?.windSpeed) ?? asNumber(h?.wind?.speed);
      const uvIndex = asNumber(h?.uvIndex) ?? asNumber(h?.uvIndexForecast);
      return { time, temperature, windSpeed, uvIndex };
    })
    .filter(h => !Number.isNaN(h.time.getTime()));
}

function indexClosest(arr: Date[], target: Date) {
  let best = 0, bestDiff = Number.POSITIVE_INFINITY, t = +target;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(+arr[i] - t);
    if (d < bestDiff) { best = i; bestDiff = d; }
  }
  return best;
}

export default async function Page({ searchParams }: { searchParams?: SearchParams }) {
  const zip = (searchParams?.zip || '61550').trim();
  const tz = (searchParams?.tz || 'America/Chicago').trim();

  const z = zipcodes.lookup(zip as any) as any;
  const lat = Number(z?.latitude ?? 40.6148);
  const lon = Number(z?.longitude ?? -89.4604);

  const weather = await fetchWeather(lat, lon, tz);
  const nowUTC = new Date();
  const dayKey = localParts(nowUTC, tz).key;

  const hourlyAll = extractHourly(weather);
  const hourlyToday = hourlyAll.filter(h => localParts(h.time, tz).key === dayKey);
  const { civilDawn, civilDusk } = getCivilTimes(lat, lon, tz, nowUTC);

  const daylight = hourlyToday.filter(h => +h.time >= +civilDawn! && +h.time <= +civilDusk!);
  const labels = daylight.map(h => hourToken(h.time, tz));
  const temps = daylight.map(h => (h.temperature !== undefined ? Math.round(h.temperature) : null));

  const dawnIdx = indexClosest(daylight.map(d => d.time), civilDawn!);
  const duskIdx = indexClosest(daylight.map(d => d.time), civilDusk!);

  // Choose a simple “best” 60m window by max temp (display only)
  let bestStartIdx = dawnIdx, bestEndIdx = Math.min(dawnIdx + 1, daylight.length - 1);
  if (daylight.length >= 2) {
    let best = -1, idx = 0;
    for (let i = 0; i + 1 < daylight.length; i++) {
      const avg = (temps[i] ?? 0) + (temps[i + 1] ?? 0);
      if (avg > best) { best = avg; idx = i; }
    }
    bestStartIdx = idx; bestEndIdx = idx + 1;
  }

  const dawnLocal = fmtLocalHM(civilDawn!, tz);
  const duskLocal = fmtLocalHM(civilDusk!, tz);
  const dateText = fmtLocalDateLine(nowUTC, tz);
  const title = `ClearSked — ${zip}`;
  const subtitle = `${dateText} • Civil ${dawnLocal}–${duskLocal}`;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 8px 0' }}>ClearSked</h1>
      <p style={{ marginTop: 0, color: '#475569' }}>
        Zip: <strong>{zip}</strong> · TZ: <strong>{tz}</strong>
      </p>

      <ComfortChart
  labels={labels}
  temps={temps}
  dawnIdx={dawnIdx}
  duskIdx={duskIdx}
  bestStartIdx={bestStartIdx}
  bestEndIdx={bestEndIdx}
/>

      <form action="/" method="get" style={{ marginTop: 20 }}>
        <label>
          Zip&nbsp;
          <input name="zip" defaultValue={zip} style={{ border: '1px solid #cbd5e1', padding: 6, borderRadius: 6 }} />
        </label>
        <label style={{ marginLeft: 12 }}>
          TZ&nbsp;
          <input name="tz" defaultValue={tz} style={{ border: '1px solid #cbd5e1', padding: 6, borderRadius: 6 }} />
        </label>
        <button type="submit" style={{ marginLeft: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #0ea5e9', background: '#0ea5e9', color: 'white' }}>
          Update
        </button>
      </form>
    </main>
  );
}
