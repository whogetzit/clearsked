// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { env } from '@/lib/env';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';

// ---- helpers ---------------------------------------------------------------

type Prefs = {
  tempMin?: number; tempMax?: number;
  windMax?: number; uvMax?: number; aqiMax?: number;
  humidityMax?: number; precipMax?: number; cloudMax?: number;
};

function fmtLocal(t: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(t);
}

function toLocalDate(t: Date | string, tz: string) {
  const d = typeof t === 'string' ? new Date(t) : t;
  // represent local time components in tz, but keep Date instance
  return new Date(d.toLocaleString('en-US', { timeZone: tz }));
}

function scorePoint(x: {
  tempF?: number; windMph?: number; uv?: number; aqi?: number;
  humidity?: number; precip?: number; cloud?: number;
}, p: Prefs): number {
  // Simple 0..100 scoring. Each dimension gives partial credit if within pref.
  let s = 100;

  if (typeof p.tempMin === 'number' && typeof x.tempF === 'number' && x.tempF < p.tempMin) {
    s -= Math.min(40, (p.tempMin - x.tempF) * 2);
  }
  if (typeof p.tempMax === 'number' && typeof x.tempF === 'number' && x.tempF > p.tempMax) {
    s -= Math.min(40, (x.tempF - p.tempMax) * 2);
  }

  if (typeof p.windMax === 'number' && typeof x.windMph === 'number' && x.windMph > p.windMax) {
    s -= Math.min(25, (x.windMph - p.windMax) * 2);
  }

  if (typeof p.uvMax === 'number' && typeof x.uv === 'number' && x.uv > p.uvMax) {
    s -= Math.min(15, (x.uv - p.uvMax) * 3);
  }

  if (typeof p.aqiMax === 'number' && typeof x.aqi === 'number' && x.aqi > p.aqiMax) {
    s -= Math.min(20, (x.aqi - p.aqiMax) * 0.2);
  }

  if (typeof p.humidityMax === 'number' && typeof x.humidity === 'number' && x.humidity > p.humidityMax) {
    s -= Math.min(10, (x.humidity - p.humidityMax) * 0.4);
  }

  if (typeof p.precipMax === 'number' && typeof x.precip === 'number' && x.precip > p.precipMax) {
    s -= Math.min(30, (x.precip - p.precipMax) * 0.8);
  }

  if (typeof p.cloudMax === 'number' && typeof x.cloud === 'number' && x.cloud > p.cloudMax) {
    s -= Math.min(10, (x.cloud - p.cloudMax) * 0.3);
  }

  return Math.max(0, Math.min(100, Math.round(s)));
}

function findBestWindow(scores: number[], stepMin: number, wantMin: number, dawnIdx: number, duskIdx: number) {
  // Constrain to [dawnIdx, duskIdx]
  const start = Math.max(0, dawnIdx);
  const end = Math.min(scores.length - 1, duskIdx);
  const windowLen = Math.max(1, Math.round(wantMin / stepMin));
  let bestStart = start;
  let bestAvg = -1;

  for (let i = start; i + windowLen - 1 <= end; i++) {
    let sum = 0;
    for (let k = 0; k < windowLen; k++) sum += scores[i + k];
    const avg = sum / windowLen;
    if (avg > bestAvg) { bestAvg = avg; bestStart = i; }
  }

  return { bestStart, bestEnd: Math.min(end, bestStart + windowLen - 1), bestAvg: Math.round(bestAvg) };
}

// Robust extractor for WeatherKit Hourly items
function getHourlySamples(weather: any, tz: string) {
  const hours: any[] =
    weather?.forecastHourly?.hours ??
    weather?.forecastHourly?.data ??
    weather?.forecastHourly ??
    [];

  // Use every 60 min point to keep chart compact
  const stepMin = 60;

  const t: Date[] = [];
  const labels: string[] = [];
  const tempF: number[] = [];
  const windMph: number[] = [];
  const uv: number[] = [];
  const aqi: number[] = [];
  const humidityPct: number[] = [];
  const precipPct: number[] = [];
  const cloudPct: number[] = [];

  for (const h of hours) {
    const iso = h?.forecastStart ?? h?.startTime ?? h?.time ?? h?.validTime;
    if (!iso) continue;
    const when = new Date(iso);
    const ll = fmtLocal(when, tz);

    const _tempF =
      (typeof h.temperature === 'number' ? h.temperature : undefined) ??
      (typeof h.temperatureApparent === 'number' ? h.temperatureApparent : undefined) ??
      (typeof h.temperature?.value === 'number' ? h.temperature.value : undefined);

    const _windMph =
      (typeof h.windSpeed === 'number' ? h.windSpeed : undefined) ??
      (typeof h.windSpeed?.value === 'number' ? h.windSpeed.value : undefined);

    const _uv =
      (typeof h.uvIndex === 'number' ? h.uvIndex : undefined) ??
      (typeof h.uvIndex?.value === 'number' ? h.uvIndex.value : undefined);

    const _aqi =
      (typeof h.airQualityIndex === 'number' ? h.airQualityIndex : undefined) ??
      (typeof h.airQuality?.index === 'number' ? h.airQuality.index : undefined);

    const _humidity =
      (typeof h.humidity === 'number' ? h.humidity : undefined) ??
      (typeof h.humidity?.value === 'number' ? h.humidity.value : undefined);

    const _precip =
      (typeof h.precipitationChance === 'number' ? h.precipitationChance : undefined) ??
      (typeof h.precipitationChance?.value === 'number' ? h.precipitationChance.value : undefined);

    const _cloud =
      (typeof h.cloudCover === 'number' ? h.cloudCover : undefined) ??
      (typeof h.cloudCover?.value === 'number' ? h.cloudCover.value : undefined);

    t.push(when);
    labels.push(ll);
    tempF.push(typeof _tempF === 'number' ? Math.round(_tempF) : NaN);
    windMph.push(typeof _windMph === 'number' ? Math.round(_windMph) : NaN);
    uv.push(typeof _uv === 'number' ? _uv : NaN);
    aqi.push(typeof _aqi === 'number' ? _aqi : NaN);
    humidityPct.push(typeof _humidity === 'number' ? _humidity : NaN);
    precipPct.push(typeof _precip === 'number' ? _precip : NaN);
    cloudPct.push(typeof _cloud === 'number' ? _cloud : NaN);
  }

  return { stepMin, t, labels, tempF, windMph, uv, aqi, humidityPct, precipPct, cloudPct };
}

function pickDawnDusk(weather: any, tz: string) {
  // Prefer civil dawn/dusk if present in daily dataset; fallback to sunrise/sunset
  const day = weather?.forecastDaily?.days?.[0] ?? weather?.forecastDaily?.[0];
  const dawnIso =
    day?.civilSunrise ?? day?.civilDawn ??
    day?.sunrise; // fallback
  const duskIso =
    day?.civilSunset ?? day?.civilDusk ??
    day?.sunset; // fallback
  const dawn = dawnIso ? toLocalDate(dawnIso, tz) : null;
  const dusk = duskIso ? toLocalDate(duskIso, tz) : null;
  return { dawn, dusk };
}

function buildChartConfig(args: {
  labels: string[];
  tempF: number[];
  windMph: number[];
  scores: number[];
  dawnIdx: number;
  duskIdx: number;
  bestStart: number;
  bestEnd: number;
  title: string;
  subtitle?: string;
}) {
  const { labels, tempF, windMph, scores, dawnIdx, duskIdx, bestStart, bestEnd, title, subtitle } = args;

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temp (°F)',
          data: tempF,
          yAxisID: 'yTemp',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: 'Wind (mph)',
          data: windMph,
          yAxisID: 'yWind',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: 'Score',
          data: scores,
          yAxisID: 'yScore',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: title, padding: { top: 6, bottom: 2 } },
        subtitle: subtitle ? { display: true, text: subtitle } : undefined,
        annotation: {
          annotations: {
            dawnLine: {
              type: 'line',
              xMin: dawnIdx,
              xMax: dawnIdx,
              borderDash: [6, 6],
              borderWidth: 2,
              label: { display: true, content: 'Dawn', rotation: 90, position: 'start' },
            },
            duskLine: {
              type: 'line',
              xMin: duskIdx,
              xMax: duskIdx,
              borderDash: [6, 6],
              borderWidth: 2,
              label: { display: true, content: 'Dusk', rotation: 90, position: 'end' },
            },
            bestBox: {
              type: 'box',
              xMin: bestStart,
              xMax: bestEnd,
              backgroundColor: 'rgba(46, 204, 113, 0.12)',
              borderWidth: 0,
            },
          },
        },
      },
      scales: {
        yTemp: { position: 'left', title: { display: true, text: '°F' }, grid: { drawOnChartArea: true } },
        yWind: { position: 'right', title: { display: true, text: 'mph' }, grid: { drawOnChartArea: false } },
        yScore: { position: 'right', min: 0, max: 100, display: false, grid: { drawOnChartArea: false } },
      },
    },
    plugins: ['annotation'],
  };
}

async function createChartUrl(config: any) {
  // Use QuickChart hosted image
  const res = await fetch('https://quickchart.io/chart/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      width: 900,
      height: 450,
      backgroundColor: 'white',
      format: 'png',
      chart: config,
      // Optionally: version: '4', // Chart.js v4
    }),
  });
  if (!res.ok) throw new Error(`quickchart HTTP ${res.status}`);
  const j = await res.json();
  return j?.url as string;
}

// ---- route ---------------------------------------------------------------

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Control flags
  const dry = url.searchParams.get('dry') === '1' || !url.searchParams.get('send');
  const onlyPhone = url.searchParams.get('phone') || undefined;

  try {
    // Pull candidates
    const where: any = { active: true };
    if (onlyPhone) where.phoneE164 = onlyPhone;

    const subs = await prisma.subscriber.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        phoneE164: true,
        zip: true,
        latitude: true,
        longitude: true,
        durationMin: true,
        timeZone: true,
        deliveryHourLocal: true,
        // prefs fallback (legacy)
        prefs: true,
        // explicit preference columns
        prefTempMin: true,
        prefTempMax: true,
        prefWindMax: true,
        prefUvMax: true,
        prefAqiMax: true,
        prefHumidityMax: true,
        prefPrecipMax: true,
        prefCloudMax: true,
      },
    });

    const details: any[] = [];
    let sent = 0;

    for (const s of subs) {
      const tz = s.timeZone || 'America/Chicago';
      const localNow = toLocalDate(new Date(), tz);
      const localHourNow = localNow.getHours();
      const deliveryHour = s.deliveryHourLocal ?? 5;

      // Skip if not matching hour unless forced one-off
      if (!onlyPhone && localHourNow !== deliveryHour) {
        details.push({
          phone: s.phoneE164, tz,
          deliveryHourLocal: deliveryHour,
          localHourNow,
          skipped: 'local hour does not match deliveryHourLocal',
        });
        continue;
      }

      // Preferences
      const pLegacy: any = s.prefs ?? {};
      const prefs: Prefs = {
        tempMin: s.prefTempMin ?? pLegacy.tempMin ?? 40,
        tempMax: s.prefTempMax ?? pLegacy.tempMax ?? 80,
        windMax: s.prefWindMax ?? pLegacy.windMax ?? 15,
        uvMax: s.prefUvMax ?? pLegacy.uvMax ?? 7,
        aqiMax: s.prefAqiMax ?? pLegacy.aqiMax ?? 75,
        humidityMax: s.prefHumidityMax ?? pLegacy.humidityMax ?? 95,
        precipMax: s.prefPrecipMax ?? pLegacy.precipMax ?? 20,
        cloudMax: s.prefCloudMax ?? pLegacy.cloudMax ?? 90,
      };
      const wantMin = Math.max(30, Math.min(240, s.durationMin ?? 60));

      // Weather
      const w = await fetchWeather(s.latitude, s.longitude, tz);
      const { dawn, dusk } = pickDawnDusk(w, tz);
      if (!dawn || !dusk || dusk <= dawn) {
        details.push({
          phone: s.phoneE164, tz, deliveryHourLocal: deliveryHour, localHourNow,
          skipped: 'no daylight window',
        });
        continue;
      }

      const { stepMin, t, labels, tempF, windMph, uv, aqi, humidityPct, precipPct, cloudPct } =
        getHourlySamples(w, tz);

      // Build scores and restrict to daylight domain
      const scores: number[] = [];
      for (let i = 0; i < t.length; i++) {
        scores.push(
          scorePoint(
            {
              tempF: tempF[i],
              windMph: windMph[i],
              uv: uv[i],
              aqi: aqi[i],
              humidity: humidityPct[i],
              precip: precipPct[i],
              cloud: cloudPct[i],
            },
            prefs,
          ),
        );
      }

      // Indices for dawn/dusk in our label array
      const idxByTime = (when: Date) => {
        let best = 0;
        let bestDt = Infinity;
        for (let i = 0; i < t.length; i++) {
          const dt = Math.abs(t[i].getTime() - when.getTime());
          if (dt < bestDt) { bestDt = dt; best = i; }
        }
        return best;
      };
      const dawnIdx = idxByTime(dawn);
      const duskIdx = idxByTime(dusk);

      const { bestStart, bestEnd, bestAvg } = findBestWindow(scores, stepMin, wantMin, dawnIdx, duskIdx);
      const startLocal = fmtLocal(t[bestStart], tz);
      const endLocal = fmtLocal(t[bestEnd], tz);

      // SMS body
      const body =
        `Civil dawn ${fmtLocal(dawn, tz)} · Civil dusk ${fmtLocal(dusk, tz)}\n` +
        `Best ${wantMin}min (daylight): ${startLocal}–${endLocal} (Score ${bestAvg})\n` +
        `${tempF[bestStart]}°F · ${windMph[bestStart]} mph wind · UV ${Math.round(uv[bestStart] || 0)} · ${Math.round(humidityPct[bestStart] || 0)}% RH · ${Math.round(precipPct[bestStart] || 0)}% precip\n` +
        `— ClearSked (reply STOP to cancel)`;

      // Chart config => URL (best-effort; fallback to SMS-only)
      let chartUrl: string | undefined;
      try {
        const config = buildChartConfig({
          labels,
          tempF,
          windMph,
          scores,
          dawnIdx,
          duskIdx,
          bestStart,
          bestEnd,
          title: `Today · ${s.zip} (${tz.replace('_', ' ')})`,
          subtitle: `Best ${wantMin} min: ${startLocal}–${endLocal} · Score ${bestAvg}`,
        });
        chartUrl = await createChartUrl(config);
      } catch (e) {
        // swallow chart errors; still send SMS
      }

      if (!dry) {
        await sendSms(s.phoneE164, body, chartUrl ? [chartUrl] : undefined);
        sent++;
        details.push({
          phone: s.phoneE164, tz, deliveryHourLocal: deliveryHour, localHourNow,
          dawnLocal: fmtLocal(dawn, tz), duskLocal: fmtLocal(dusk, tz),
          requestedDuration: wantMin, usedDuration: wantMin,
          startLocal, endLocal, bestScore: bestAvg,
          mediaUrl: chartUrl || null,
          ok: true,
        });
      } else {
        details.push({
          phone: s.phoneE164, tz, deliveryHourLocal: deliveryHour, localHourNow,
          dawnLocal: fmtLocal(dawn, tz), duskLocal: fmtLocal(dusk, tz),
          requestedDuration: wantMin, usedDuration: wantMin,
          startLocal, endLocal, bestScore: bestAvg,
          smsPreview: body,
          chartUrl: chartUrl || null,
          skipped: 'dry-run',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      method: 'GET',
      sent,
      matches: subs.length,
      details,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
