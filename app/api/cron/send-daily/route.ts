// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { env } from '@/lib/env';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION = 'send-daily.v3.2.0-styled';

// ----------------- Small utils -----------------
type Jsonish = unknown;
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function asPrefs(v: Jsonish): Record<string, unknown> {
  return isPlainObject(v) ? (v as Record<string, unknown>) : {};
}
function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function localParts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || '0');
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    hh: get('hour'),
    mm: get('minute'),
    key: `${get('year')}-${pad2(get('month'))}-${pad2(get('day'))}`,
  };
}
function fmtLocalHM(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
}
function fmtLocalDate(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}
function hourToken(d: Date, tz: string) {
  const p = localParts(d, tz);
  const h12 = (p.hh % 12) || 12;
  return `${h12}${p.hh < 12 ? 'a' : 'p'}`;
}
function asNumber(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}
function normalize01(x: number | undefined) {
  if (x === undefined) return undefined;
  if (x > 1) return Math.min(1, Math.max(0, x / 100));
  return Math.min(1, Math.max(0, x));
}
function compactJoin(items: (string | undefined)[], sep = ' · ') {
  return items.filter(Boolean).join(sep);
}
function locationText(zip?: string | null, lat?: number | null, lon?: number | null) {
  if (zip && zip.trim()) return zip.trim();
  if (typeof lat === 'number' && typeof lon === 'number') {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
  }
  return 'Location';
}

// ----------------- Auth helpers -----------------
type AuthResult =
  | { ok: true; mode: 'admin' | 'cron'; diag: any }
  | { ok: false; diag: any };

function isAuthorized(req: Request): AuthResult {
  const url = new URL(req.url);
  const hdrs = headers();

  const ADMIN_TOKEN = (env.ADMIN_TOKEN || '').trim();
  const CRON_SECRET = ((process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET) || '').trim();

  const tokenHeader = (hdrs.get('x-admin-token') || '').trim();
  const tokenQuery = (url.searchParams.get('token') || '').trim();
  const tokenCookie = (cookies().get('admin_token')?.value || '').trim();

  const authHeader = (hdrs.get('authorization') || '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';

  const cronHeader = (hdrs.get('x-cron-secret') || '').trim();
  const cronQuery = (url.searchParams.get('secret') || url.searchParams.get('cron_secret') || '').trim();

  const adminMatched =
    !!ADMIN_TOKEN &&
    (tokenHeader === ADMIN_TOKEN || tokenQuery === ADMIN_TOKEN || tokenCookie === ADMIN_TOKEN || bearer === ADMIN_TOKEN);

  const cronMatched =
    !!CRON_SECRET &&
    (cronHeader === CRON_SECRET || cronQuery === CRON_SECRET || bearer === CRON_SECRET);

  const diag = {
    envPresent: { ADMIN_TOKEN: !!ADMIN_TOKEN, CRON_SECRET: !!CRON_SECRET },
    presented: {
      header_admin: !!tokenHeader,
      query_admin: !!tokenQuery,
      cookie_admin: !!tokenCookie,
      bearer: !!bearer,
      header_cron: !!cronHeader,
      query_cron: !!cronQuery,
    },
    matched: { adminMatched, cronMatched },
  };

  if (adminMatched) return { ok: true, mode: 'admin', diag };
  if (cronMatched) return { ok: true, mode: 'cron', diag };
  return { ok: false, diag };
}

// ----------------- Weather parsing -----------------
type HourSample = {
  time: Date;
  temperature?: number;
  windSpeed?: number;
  uvIndex?: number;
  humidity?: number;       // 0-1 or 0-100
  precipChance?: number;   // 0-1 or 0-100
  cloudCover?: number;     // 0-1 or 0-100
  aqi?: number;
};
function extractHourly(w: any): HourSample[] {
  const hours: any[] =
    w?.forecastHourly?.hours ??
    w?.forecastHourly?.forecast ??
    w?.forecastHourly ??
    [];

  return hours
    .map((h: any) => {
      const tIso =
        h?.forecastStart?.toString?.() ??
        h?.startTime?.toString?.() ??
        h?.time?.toString?.();
      const time = tIso ? new Date(tIso) : new Date(NaN);

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

function extractSunTimes(w: any, tz: string, targetKey: string) {
  const days: any[] =
    w?.forecastDaily?.days ??
    w?.forecastDaily?.forecast ??
    w?.forecastDaily ??
    [];

  let sunriseISO: string | undefined;
  let sunsetISO: string | undefined;

  for (const d of days) {
    const rises = [d?.sunrise, d?.sunriseTime, d?.sunriseISO, d?.solar?.sunrise].filter(Boolean).map(String);
    const sets  = [d?.sunset,  d?.sunsetTime,  d?.sunsetISO,  d?.solar?.sunset ].filter(Boolean).map(String);

    let sr: Date | undefined;
    for (const s of rises) {
      const dd = new Date(s);
      if (!Number.isNaN(dd.getTime()) && localParts(dd, tz).key === targetKey) { sr = dd; break; }
    }
    let ss: Date | undefined;
    for (const s of sets) {
      const dd = new Date(s);
      if (!Number.isNaN(dd.getTime()) && localParts(dd, tz).key === targetKey) { ss = dd; break; }
    }
    if (sr || ss) { sunriseISO = sr?.toISOString(); sunsetISO = ss?.toISOString(); break; }
  }

  return {
    sunrise: sunriseISO ? new Date(sunriseISO) : undefined,
    sunset:  sunsetISO ? new Date(sunsetISO)  : undefined,
  };
}

// ----------------- Scoring -----------------
type Prefs = {
  tempMin?: number; tempMax?: number;
  windMax?: number; uvMax?: number; aqiMax?: number;
  humidityMax?: number; precipMax?: number; cloudMax?: number;
};
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

function findBestWindow(samples: (HourSample & { score: number })[], durationMin: number, tz: string) {
  const k = Math.max(1, Math.round(durationMin / 60));
  if (samples.length === 0) return null;

  let bestSum = -1;
  let bestIdx = -1;
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
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const avgScore = Math.round(bestSum / k);

  return {
    start, end, avgScore,
    repr: samples[bestIdx],
    startHM: fmtLocalHM(start, tz),
    endHM: fmtLocalHM(end, tz),
    startIdx: bestIdx,
    endIdx: Math.min(samples.length - 1, bestIdx + k - 1),
  };
}

// ----------------- Chart URL (styled + date/location) -----------------
function buildChartUrl(args: {
  tz: string;
  daylight: (HourSample & { score: number })[];
  dawnIdx: number;
  duskIdx: number;
  bestStartIdx: number;
  bestEndIdx: number;
  titleLine1: string;   // e.g., "ClearSked — 61550"
  titleLine2: string;   // e.g., "Tue, Aug 19"
  subtitle: string;     // e.g., "Best 60m 5:40–6:40 AM (Score 85) • Civil 5:40–8:22"
}) {
  const { tz, daylight, dawnIdx, duskIdx, bestStartIdx, bestEndIdx, titleLine1, titleLine2, subtitle } = args;

  const labels = daylight.map(h => hourToken(h.time, tz));
  const temps = daylight.map(h => (h.temperature !== undefined ? Math.round(h.temperature) : null));

  // guard indices
  const _dawn = Math.max(0, Math.min(labels.length - 1, dawnIdx));
  const _dusk = Math.max(0, Math.min(labels.length - 1, duskIdx));
  const _b0 = Math.max(0, Math.min(labels.length - 1, bestStartIdx));
  const _b1 = Math.max(_b0, Math.min(labels.length - 1, bestEndIdx));

  // Colors chosen to match site vibe (slate grid, blue line, emerald window)
  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temp °F',
          data: temps,
          borderColor: '#2563eb',                  // blue-600
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
          text: [titleLine1, titleLine2],         // two-line title: location and date
          color: '#0f172a',                        // slate-900
          font: { size: 16, weight: '600' },
          padding: { top: 8, bottom: 4 },
        },
        subtitle: {
          display: true,
          text: subtitle,
          color: '#334155',                        // slate-700
          font: { size: 12 },
          padding: { bottom: 8 },
        },
        annotation: {
          annotations: {
            dawnLine: {
              type: 'line',
              xMin: _dawn, xMax: _dawn,
              borderColor: 'rgba(2,6,23,0.5)',     // near-black w/ 50%
              borderWidth: 2, borderDash: [6, 6],
            },
            duskLine: {
              type: 'line',
              xMin: _dusk, xMax: _dusk,
              borderColor: 'rgba(2,6,23,0.5)',
              borderWidth: 2, borderDash: [6, 6],
            },
            bestBox: {
              type: 'box',
              xMin: _b0, xMax: _b1,
              backgroundColor: 'rgba(16, 185, 129, 0.18)', // emerald-500 @ ~18%
              borderWidth: 0,
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#334155' },            // slate-700
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.18)' }, // slate-400 @ 18%
          ticks: {
            color: '#334155',
            callback: (v: any) => `${v}°`,
          },
        },
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

// ----------------- Main handler -----------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get('debug') === '1';

  // Auth & diag
  const auth = isAuthorized(req);
  if (url.searchParams.get('diag') === '1') {
    return NextResponse.json({
      ok: true,
      version: VERSION,
      authorized: auth.ok,
      mode: (auth as any).mode || null,
      diag: auth.diag,
      now: new Date().toISOString(),
      try_examples: {
        cron_query: '/api/cron/send-daily?dry=1&secret=YOUR_CRON_SECRET',
        admin_query: '/api/cron/send-daily?dry=1&token=YOUR_ADMIN_TOKEN',
      },
    });
  }
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized (cron/admin)' }, { status: 401 });
  }

  const dry = url.searchParams.get('dry') === '1' || !url.searchParams.get('send');
  const onlyPhone = url.searchParams.get('phone') || undefined;

  // Twilio readiness
  const twilioReady = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

  try {
    // ---- DB fetch with automatic safe fallback ----
    const baseWhere = onlyPhone ? { phoneE164: onlyPhone, active: true } : { active: true };

    async function fetchSubsUnsafe() {
      return prisma.subscriber.findMany({
        where: baseWhere,
        select: {
          phoneE164: true, active: true, zip: true, latitude: true, longitude: true,
          durationMin: true, timeZone: true, deliveryHourLocal: true, // may not exist in some DBs
          prefs: true, lastSentAt: true, createdAt: true,
        },
      });
    }
    async function fetchSubsSafe() {
      return prisma.subscriber.findMany({
        where: baseWhere,
        select: {
          phoneE164: true, active: true, zip: true, latitude: true, longitude: true,
          durationMin: true, prefs: true, lastSentAt: true, createdAt: true,
        },
      });
    }

    let subs: any[] = [];
    let usedSafe = false;
    try {
      subs = await fetchSubsUnsafe();
    } catch {
      usedSafe = true;
      subs = await fetchSubsSafe();
    }

    // ---- Iterate subscribers ----
    const nowUTC = new Date();
    let sent = 0;
    let matches = 0;
    const details: any[] = [];

    for (const s of subs) {
      try {
        const p = asPrefs(s.prefs);
        const tz: string =
          (s.timeZone as string | undefined) ??
          (p.timeZone as string | undefined) ??
          'America/Chicago';

        const deliveryHourLocal: number | undefined =
          (s.deliveryHourLocal as number | undefined) ??
          (p.deliveryHourLocal as number | undefined);

        const locText = locationText(s.zip, s.latitude, s.longitude);
        const dateText = fmtLocalDate(nowUTC, tz);

        const partsNow = localParts(nowUTC, tz);
        const force = url.searchParams.get('force') === '1';
        if (!force && typeof deliveryHourLocal === 'number' && deliveryHourLocal !== partsNow.hh) {
          details.push({
            phone: s.phoneE164, tz, deliveryHourLocal, localHourNow: partsNow.hh,
            skipped: 'local hour does not match deliveryHourLocal',
          });
          continue;
        }

        if (s.latitude == null || s.longitude == null) {
          details.push({ phone: s.phoneE164, tz, skipped: 'missing coordinates' });
          continue;
        }

        matches++;

        // Weather
        let weather: any;
        try {
          weather = await fetchWeather(s.latitude, s.longitude, tz);
        } catch (werr: any) {
          details.push({ phone: s.phoneE164, tz, error: `weather: ${werr?.message || 'fetch failed'}` });
          continue;
        }

        // Filter to today's local day
        const dayKey = localParts(nowUTC, tz).key;
        const hourlyAll = extractHourly(weather);
        const hourlyToday = hourlyAll.filter(h => localParts(h.time, tz).key === dayKey);

        // Daylight (civil) from forecast daily (fallbacks if missing)
        let { sunrise, sunset } = extractSunTimes(weather, tz, dayKey);
        if (!sunrise || !sunset) {
          const daylightGuess = hourlyToday.filter(h => (h.uvIndex ?? 0) > 0);
          if (daylightGuess.length > 0) {
            sunrise = daylightGuess[0].time;
            sunset = daylightGuess[daylightGuess.length - 1].time;
          } else {
            const any = hourlyToday[0]?.time ?? nowUTC;
            const lp = localParts(any, tz);
            const findAt = (hh: number) =>
              hourlyToday.find(h => localParts(h.time, tz).hh === hh)?.time
              ?? new Date(any.getTime() + (hh - lp.hh) * 3600_000);
            sunrise = findAt(6);
            sunset = findAt(18);
          }
        }
        const dawnLocal = sunrise ? fmtLocalHM(sunrise, tz) : '';
        const duskLocal = sunset ? fmtLocalHM(sunset, tz) : '';

        const daylight = hourlyToday.filter(h => {
          if (!sunrise || !sunset) return true;
          const t = h.time.getTime();
          return t >= +sunrise && t <= +sunset;
        });

        if (daylight.length === 0) {
          details.push({
            phone: s.phoneE164, tz, deliveryHourLocal, localHourNow: partsNow.hh,
            dawnLocal, duskLocal, skipped: 'no daylight minutes',
          });
          continue;
        }

        // Prefs
        const prefs: Prefs = {
          tempMin: (p.tempMin as number | undefined),
          tempMax: (p.tempMax as number | undefined),
          windMax: (p.windMax as number | undefined),
          uvMax:   (p.uvMax   as number | undefined),
          aqiMax:  (p.aqiMax  as number | undefined),
          humidityMax: (p.humidityMax as number | undefined),
          precipMax:  (p.precipMax  as number | undefined),
          cloudMax:   (p.cloudMax   as number | undefined),
        };

        // Score daylight
        const scored: (HourSample & { score: number })[] =
          daylight.map(h => ({ ...h, score: scorePoint(h, prefs) }));

        const durationMin = Math.max(30, Number(s.durationMin ?? 60) || 60);
        const best = findBestWindow(scored, durationMin, tz);

        if (!best) {
          details.push({
            phone: s.phoneE164, tz, deliveryHourLocal, localHourNow: partsNow.hh,
            dawnLocal, duskLocal, skipped: 'no contiguous window',
          });
          continue;
        }

        // Compose SMS (now includes date + location in first line)
        const rep = best.repr;
        const tempStr = rep.temperature !== undefined ? `${Math.round(rep.temperature)}°F` : '';
        const windStr = rep.windSpeed !== undefined ? `${Math.round(rep.windSpeed)} mph wind` : '';
        const uvStr   = rep.uvIndex   !== undefined ? `UV ${Math.round(rep.uvIndex)}` : '';
        const hum     = rep.humidity !== undefined ? (rep.humidity <= 1 ? rep.humidity * 100 : rep.humidity) : undefined;
        const humStr  = hum !== undefined ? `${Math.round(hum)}% RH` : '';
        const pr      = rep.precipChance !== undefined ? (rep.precipChance <= 1 ? rep.precipChance * 100 : rep.precipChance) : undefined;
        const precipStr = pr !== undefined ? `${Math.round(pr)}% precip` : '';

        const headerLine = `${dateText} — ${locText}`;
        const dawnDusk   = `Civil dawn ${dawnLocal} · Civil dusk ${duskLocal}`;
        const bestLine   = `Best ${durationMin}min (daylight): ${best.startHM}–${best.endHM} (Score ${best.avgScore})`;
        const condLine   = compactJoin([tempStr, windStr, uvStr, humStr, precipStr]);

        const smsPreview =
          `${headerLine}\n` +
          `${dawnDusk}\n` +
          `${bestLine}\n` +
          `${condLine}\n` +
          `— ClearSked (reply STOP to cancel)`;

        // Build chart URL (indices relative to daylight array), include date/location in title
        const dawnIdx = 0;
        const duskIdx = Math.max(0, daylight.length - 1);

        const titleLine1 = `ClearSked — ${locText}`;
        const titleLine2 = dateText;
        const subtitle   = `Best ${durationMin}m ${best.startHM}–${best.endHM} (Score ${best.avgScore}) • Civil ${dawnLocal}–${duskLocal}`;

        const chartUrl = buildChartUrl({
          tz,
          daylight: scored,
          dawnIdx,
          duskIdx,
          bestStartIdx: best.startIdx,
          bestEndIdx: best.endIdx,
          titleLine1,
          titleLine2,
          subtitle,
        });

        // Send or dry-run
        if (!dry) {
          if (!twilioReady) {
            details.push({
              phone: s.phoneE164, tz, dawnLocal, duskLocal,
              date: dateText, location: locText,
              requestedDuration: durationMin, usedDuration: durationMin,
              startLocal: best.startHM, endLocal: best.endHM,
              bestScore: best.avgScore, smsPreview, chartUrl,
              error: 'twilio: credentials missing',
            });
          } else {
            try {
              await sendSms(s.phoneE164, smsPreview, chartUrl ? [chartUrl] : undefined);
              sent++;
              await prisma.subscriber.update({
                where: { phoneE164: s.phoneE164 },
                data: { lastSentAt: new Date() },
              });
              details.push({
                phone: s.phoneE164, tz, dawnLocal, duskLocal,
                date: dateText, location: locText,
                requestedDuration: durationMin, usedDuration: durationMin,
                startLocal: best.startHM, endLocal: best.endHM,
                bestScore: best.avgScore, smsPreview, chartUrl, sent: true,
              });
            } catch (e: any) {
              details.push({
                phone: s.phoneE164, tz, dawnLocal, duskLocal,
                date: dateText, location: locText,
                requestedDuration: durationMin, usedDuration: durationMin,
                startLocal: best.startHM, endLocal: best.endHM,
                bestScore: best.avgScore, smsPreview, chartUrl,
                error: `twilio: ${e?.message || 'send failed'}`,
              });
            }
          }
        } else {
          details.push({
            phone: s.phoneE164, tz, dawnLocal, duskLocal,
            date: dateText, location: locText,
            requestedDuration: durationMin, usedDuration: durationMin,
            startLocal: best.startHM, endLocal: best.endHM,
            bestScore: best.avgScore, smsPreview, chartUrl,
            skipped: 'dry-run',
          });
        }
      } catch (inner: any) {
        details.push({ phone: s?.phoneE164, error: inner?.message || 'subscriber processing failed' });
      }
    }

    return NextResponse.json({
      ok: true,
      version: VERSION,
      mode: (auth as any).mode || null,
      usedSafeSelect: usedSafe,
      sent,
      matches,
      details,
    });
  } catch (e: any) {
    const body: any = { ok: false, error: e?.message || 'server error' };
    if (debug && e?.stack) body.stack = e.stack;
    return NextResponse.json(body, { status: 500 });
  }
}
