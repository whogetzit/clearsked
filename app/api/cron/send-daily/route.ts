// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';
import { getCivilTimes, fmtLocalHM, fmtLocalDateLine, hourToken, localParts } from '@/lib/sun.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HourSample = {
  time: Date;
  temperature?: number;
  windSpeed?: number;
  uvIndex?: number;
  humidity?: number;       // 0–1 or 0–100
  precipChance?: number;   // 0–1 or 0–100
  cloudCover?: number;     // 0–1 or 0–100
  aqi?: number;
};

type Prefs = {
  tempMin?: number; tempMax?: number;
  windMax?: number; uvMax?: number; aqiMax?: number;
  humidityMax?: number; precipMax?: number; cloudMax?: number;
};

function asNumber(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function normalize01(x: number | undefined) {
  if (x === undefined) return undefined;
  if (x > 1) return Math.min(1, Math.max(0, x / 100));
  return Math.min(1, Math.max(0, x));
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
      const humidity =
        normalize01(asNumber(h?.humidity)) ??
        normalize01(asNumber(h?.relativeHumidity)) ??
        undefined;
      const precipChance =
        normalize01(asNumber(h?.precipitationChance)) ??
        normalize01(asNumber(h?.precipitationProbability)) ??
        undefined;
      const cloudCover =
        normalize01(asNumber(h?.cloudCover)) ??
        normalize01(asNumber(h?.cloudAmount)) ??
        undefined;
      const aqi = asNumber(h?.airQualityIndex) ?? undefined;
      return { time, temperature, windSpeed, uvIndex, humidity, precipChance, cloudCover, aqi };
    })
    .filter(h => !Number.isNaN(h.time.getTime()));
}

function scorePoint(h: HourSample, prefs: Prefs): number {
  let score = 100;
  if (prefs.tempMin !== undefined && h.temperature !== undefined && h.temperature < prefs.tempMin) {
    score -= Math.min(40, (prefs.tempMin - h.temperature) * 2);
  }
  if (prefs.tempMax !== undefined && h.temperature !== undefined && h.temperature > prefs.tempMax) {
    score -= Math.min(40, (h.temperature - prefs.tempMax) * 2);
  }
  if (prefs.windMax !== undefined && h.windSpeed !== undefined && h.windSpeed > prefs.windMax) {
    score -= Math.min(40, (h.windSpeed - prefs.windMax) * 2.5);
  }
  if (prefs.uvMax !== undefined && h.uvIndex !== undefined && h.uvIndex > prefs.uvMax) {
    score -= Math.min(20, (h.uvIndex - prefs.uvMax) * 3);
  }
  if (prefs.aqiMax !== undefined && h.aqi !== undefined && h.aqi > prefs.aqiMax) {
    score -= Math.min(30, (h.aqi - prefs.aqiMax) * 0.5);
  }
  const hum = h.humidity !== undefined ? (h.humidity <= 1 ? h.humidity * 100 : h.humidity) : undefined;
  if (prefs.humidityMax !== undefined && hum !== undefined && hum > prefs.humidityMax) {
    score -= Math.min(25, (hum - prefs.humidityMax) * 0.3);
  }
  const pr = h.precipChance !== undefined ? (h.precipChance <= 1 ? h.precipChance * 100 : h.precipChance) : undefined;
  if (prefs.precipMax !== undefined && pr !== undefined && pr > prefs.precipMax) {
    score -= Math.min(50, (pr - prefs.precipMax) * 0.7);
  }
  const cc = h.cloudCover !== undefined ? (h.cloudCover <= 1 ? h.cloudCover * 100 : h.cloudCover) : undefined;
  if (prefs.cloudMax !== undefined && cc !== undefined && cc > prefs.cloudMax) {
    score -= Math.min(25, (cc - prefs.cloudMax) * 0.3);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function findBestWindow(samples: (HourSample & { score: number })[], durationMin: number) {
  const k = Math.max(1, Math.round(durationMin / 60));
  if (!samples.length) return null;

  let bestSum = -1, bestIdx = -1;
  for (let i = 0; i + k - 1 < samples.length; i++) {
    // ensure 1h spacing
    let contiguous = true;
    for (let j = 1; j < k; j++) {
      const diff = samples[i + j].time.getTime() - samples[i + j - 1].time.getTime();
      if (Math.abs(diff - 3600_000) > 5 * 60 * 1000) { contiguous = false; break; }
    }
    if (!contiguous) continue;
    const sum = samples.slice(i, i + k).reduce((acc, s) => acc + (s.score ?? 0), 0);
    if (sum > bestSum) { bestSum = sum; bestIdx = i; }
  }
  if (bestIdx < 0) return null;

  const start = samples[bestIdx].time;
  return { startIdx: bestIdx, endIdx: Math.min(samples.length - 1, bestIdx + k - 1), avgScore: Math.round(bestSum / k), start };
}

function indexClosest(arr: Date[], target: Date) {
  let best = 0, bestDiff = Number.POSITIVE_INFINITY, t = +target;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(+arr[i] - t);
    if (d < bestDiff) { best = i; bestDiff = d; }
  }
  return best;
}

/** QuickChart URL with matching style to homepage, incl. date + location */
function buildChartUrl(args: {
  tz: string;
  zipOrPlace: string;
  daylight: (HourSample & { score: number })[];
  dawnIdx: number;
  duskIdx: number;
  bestStartIdx: number;
  bestEndIdx: number;
  dateText: string;
}) {
  const { tz, zipOrPlace, daylight, dawnIdx, duskIdx, bestStartIdx, bestEndIdx, dateText } = args;
  const labels = daylight.map(h => hourToken(h.time, tz));
  const temps = daylight.map(h => (h.temperature !== undefined ? Math.round(h.temperature) : null));

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temp °F',
          data: temps,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: [`ClearSked — ${zipOrPlace}`, dateText],
          color: '#0f172a',
          font: { size: 16, weight: '600' },
          padding: { top: 8, bottom: 4 },
        },
        subtitle: {
          display: true,
          text: 'Best window shown • Civil dawn/dusk dashed',
          color: '#334155',
          font: { size: 12 },
          padding: { bottom: 8 },
        },
        annotation: {
          annotations: {
            dawnLine: {
              type: 'line',
              xMin: dawnIdx, xMax: dawnIdx,
              borderColor: 'rgba(2,6,23,0.5)',
              borderWidth: 2,
              borderDash: [6, 6],
            },
            duskLine: {
              type: 'line',
              xMin: duskIdx, xMax: duskIdx,
              borderColor: 'rgba(2,6,23,0.5)',
              borderWidth: 2,
              borderDash: [6, 6],
            },
            bestBox: {
              type: 'box',
              xMin: bestStartIdx, xMax: bestEndIdx,
              backgroundColor: 'rgba(16, 185, 129, 0.18)', // emerald 500 @ 18%
              borderWidth: 0,
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#334155' } },
        y: { grid: { color: 'rgba(148, 163, 184, 0.18)' }, ticks: { color: '#334155' } },
      },
    },
  };

  const base = 'https://quickchart.io/chart';
  const params = new URLSearchParams({
    c: JSON.stringify(cfg),
    w: '900',
    h: '450',
    backgroundColor: 'white',
    devicePixelRatio: '2',
    plugins: 'chartjs-plugin-annotation',
  });
  return `${base}?${params.toString()}`;
}

/** ---------- AUTH ---------- */
function isAuthorized(req: Request): { ok: true; mode: 'admin' | 'cron' } | { ok: false } {
  const url = new URL(req.url);
  const hdrs = headers();
  const adminEnv = (process.env.ADMIN_TOKEN || '').trim();
  const cronEnv = (process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim();

  // Presented:
  const qAdmin = (url.searchParams.get('token') || '').trim();
  const cAdmin = (cookies().get('admin_token')?.value || '').trim();
  const hAdmin = (hdrs.get('x-admin-token') || '').trim();

  const qCron = (url.searchParams.get('secret') || url.searchParams.get('cron_secret') || '').trim();
  const hCron = (hdrs.get('x-cron-secret') || '').trim();

  const auth = (hdrs.get('authorization') || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (adminEnv && (qAdmin === adminEnv || cAdmin === adminEnv || hAdmin === adminEnv || bearer === adminEnv)) {
    return { ok: true, mode: 'admin' };
  }
  if (cronEnv && (qCron === cronEnv || hCron === cronEnv || bearer === cronEnv)) {
    return { ok: true, mode: 'cron' };
  }
  return { ok: false };
}

/** ---------- MAIN ---------- */
export async function GET(req: Request) {
  const auth = isAuthorized(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized (cron/admin)' }, { status: 401 });

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1' || url.searchParams.get('send') !== '1';
  const onlyPhone = url.searchParams.get('phone') || undefined;

  const twilioReady = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

  let sent = 0, matches = 0;
  const details: any[] = [];

  try {
    let subs: any[];
    if (onlyPhone) {
      subs = await prisma.subscriber.findMany({
        where: { phoneE164: onlyPhone, active: true },
        take: 1,
        select: {
          phoneE164: true, active: true, zip: true, latitude: true, longitude: true,
          durationMin: true, timeZone: true, deliveryHourLocal: true, prefs: true, lastSentAt: true, createdAt: true,
        },
      });
    } else {
      subs = await prisma.subscriber.findMany({
        where: { active: true },
        select: {
          phoneE164: true, active: true, zip: true, latitude: true, longitude: true,
          durationMin: true, timeZone: true, deliveryHourLocal: true, prefs: true, lastSentAt: true, createdAt: true,
        },
      });
    }

    const nowUTC = new Date();

    for (const s of subs) {
      try {
        const p = (s.prefs as any) ?? {};
        const tz: string = s.timeZone ?? p.timeZone ?? 'America/Chicago';
        const deliveryHourLocal: number | undefined = (s.deliveryHourLocal ?? p.deliveryHourLocal ?? undefined);

        const nowParts = localParts(nowUTC, tz);
        if (!onlyPhone && typeof deliveryHourLocal === 'number' && deliveryHourLocal !== nowParts.hh) {
          details.push({ phone: s.phoneE164, tz, deliveryHourLocal, localHourNow: nowParts.hh, skipped: 'local hour does not match deliveryHourLocal' });
          continue;
        }

        if (s.latitude == null || s.longitude == null) {
          details.push({ phone: s.phoneE164, tz, skipped: 'missing coordinates' });
          continue;
        }
        matches++;

        const weather = await fetchWeather(s.latitude, s.longitude, tz);

        // Hourly array for *today’s* local date:
        const dayKey = localParts(nowUTC, tz).key;
        const hourlyAll = extractHourly(weather);
        const hourlyToday = hourlyAll.filter(h => localParts(h.time, tz).key === dayKey);

        // Civil dawn/dusk (consistent across SMS & homepage)
        let { civilDawn, civilDusk } = getCivilTimes(s.latitude, s.longitude, tz, nowUTC);

        // Minimal fallback if for some reason SunCalc returns undefined:
        if (!civilDawn || !civilDusk) {
          civilDawn = hourlyToday[0]?.time ?? nowUTC;
          civilDusk  = hourlyToday[hourlyToday.length - 1]?.time ?? nowUTC;
        }

        const dawnLocal = fmtLocalHM(civilDawn, tz);
        const duskLocal = fmtLocalHM(civilDusk, tz);
        const dateText = fmtLocalDateLine(nowUTC, tz);

        // Constrain to daylight (civil) & score
        const daylight = hourlyToday.filter(h => +h.time >= +civilDawn! && +h.time <= +civilDusk!);
        if (!daylight.length) {
          details.push({ phone: s.phoneE164, tz, dawnLocal, duskLocal, skipped: 'no daylight minutes' });
          continue;
        }

        const prefs: Prefs = {
          tempMin: p.tempMin, tempMax: p.tempMax, windMax: p.windMax, uvMax: p.uvMax, aqiMax: p.aqiMax,
          humidityMax: p.humidityMax, precipMax: p.precipMax, cloudMax: p.cloudMax,
        };
        const scored = daylight.map(h => ({ ...h, score: scorePoint(h, prefs) }));
        const durationMin = Math.max(30, Number(s.durationMin ?? 60) || 60);
        const best = findBestWindow(scored, durationMin);
        if (!best) {
          details.push({ phone: s.phoneE164, tz, dawnLocal, duskLocal, skipped: 'no contiguous window' });
          continue;
        }

        const startHM = fmtLocalHM(best.start, tz);
        const endHM = fmtLocalHM(new Date(best.start.getTime() + durationMin * 60_000), tz);

        // Chart adornments
        const dawnIdx = indexClosest(daylight.map(d => d.time), civilDawn!);
        const duskIdx = indexClosest(daylight.map(d => d.time), civilDusk!);
        const bestStartIdx = best.startIdx;
        const bestEndIdx = best.endIdx;

        const zipOrPlace = s.zip || `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`;
        const chartUrl = buildChartUrl({
          tz, zipOrPlace, daylight: scored, dawnIdx, duskIdx, bestStartIdx, bestEndIdx, dateText,
        });

        const rep = scored[bestStartIdx];
        const tempStr = rep.temperature !== undefined ? `${Math.round(rep.temperature)}°F` : '';
        const windStr = rep.windSpeed !== undefined ? `${Math.round(rep.windSpeed)} mph wind` : '';
        const uvStr = rep.uvIndex !== undefined ? `UV ${Math.round(rep.uvIndex)}` : '';
        const hum = rep.humidity !== undefined ? (rep.humidity <= 1 ? rep.humidity * 100 : rep.humidity) : undefined;
        const humStr = hum !== undefined ? `${Math.round(hum)}% RH` : '';
        const pr = rep.precipChance !== undefined ? (rep.precipChance <= 1 ? rep.precipChance * 100 : rep.precipChance) : undefined;
        const precipStr = pr !== undefined ? `${Math.round(pr)}% precip` : '';

        const sms =
          `Civil dawn ${dawnLocal} · Civil dusk ${duskLocal}\n` +
          `Best ${durationMin}min: ${startHM}–${endHM} (Score ${best.avgScore})\n` +
          [tempStr, windStr, uvStr, humStr, precipStr].filter(Boolean).join(' · ') +
          `\n— ClearSked (reply STOP to cancel)`;

        if (dry || !process.env.TWILIO_ACCOUNT_SID) {
          details.push({
            phone: s.phoneE164, tz, zip: s.zip, dawnLocal, duskLocal,
            durationMin, startLocal: startHM, endLocal: endHM, score: best.avgScore,
            chartUrl, dry: true,
          });
        } else {
          try {
            await sendSms(s.phoneE164, sms, chartUrl ? [chartUrl] : undefined);
            sent++;
            await prisma.subscriber.update({ where: { phoneE164: s.phoneE164 }, data: { lastSentAt: new Date() } });
            details.push({
              phone: s.phoneE164, tz, zip: s.zip, dawnLocal, duskLocal,
              durationMin, startLocal: startHM, endLocal: endHM, score: best.avgScore,
              chartUrl, sent: true,
            });
          } catch (e: any) {
            details.push({
              phone: s.phoneE164, tz, zip: s.zip, dawnLocal, duskLocal,
              durationMin, startLocal: startHM, endLocal: endHM, score: best.avgScore,
              chartUrl, error: `twilio: ${e?.message || 'send failed'}`,
            });
          }
        }
      } catch (inner: any) {
        details.push({ phone: s?.phoneE164, error: inner?.message || 'subscriber processing failed' });
      }
    }

    return NextResponse.json({ ok: true, mode: auth.mode, sent, matches, details });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
