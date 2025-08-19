// app/api/cron/send-daily/route.ts
import { NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { fetchWeather } from '@/lib/weatherkit';
import { sendSms } from '@/lib/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* --------------------------------- AUTH ---------------------------------- */
/** Accepts:
 *  - ADMIN: header x-admin-token | query ?token= | cookie admin_token | Authorization: Bearer
 *  - CRON : header x-cron-secret or x-vercel-cron-secret | query ?secret= or ?cron_secret= or ?vercel_cron_secret= | Authorization: Bearer
 *  Env: ADMIN_TOKEN, CRON_SECRET (or VERCEL_CRON_SECRET)
 */
function isAuthorized(req: Request): { ok: true; mode: 'admin' | 'cron' } | { ok: false } {
  const url = new URL(req.url);
  const hdrs = headers();
  const cks = cookies();

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  const cronSecret = ((process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET) || '').trim();

  const authHdr = (hdrs.get('authorization') || '').trim();
  const bearer = authHdr.toLowerCase().startsWith('bearer ') ? authHdr.slice(7).trim() : '';

  // Admin presentations
  const adminHeader = (hdrs.get('x-admin-token') || '').trim();
  const adminQuery  = (url.searchParams.get('token') || '').trim();
  const adminCookie = (cks.get('admin_token')?.value || '').trim();

  // Cron presentations (many names)
  const cronHeader1 = (hdrs.get('x-cron-secret') || '').trim();
  const cronHeader2 = (hdrs.get('x-vercel-cron-secret') || '').trim();
  const cronQuery1  = (url.searchParams.get('secret') || '').trim();
  const cronQuery2  = (url.searchParams.get('cron_secret') || '').trim();
  const cronQuery3  = (url.searchParams.get('vercel_cron_secret') || '').trim();

  const adminMatch =
    !!adminToken && [adminHeader, adminQuery, adminCookie, bearer].some(v => v === adminToken);

  const cronMatch =
    !!cronSecret && [cronHeader1, cronHeader2, cronQuery1, cronQuery2, cronQuery3, bearer].some(v => v === cronSecret);

  if (adminMatch) return { ok: true, mode: 'admin' };
  if (cronMatch)  return { ok: true, mode: 'cron' };
  return { ok: false };
}

/* ---------------------------- DATE/TIME HELPERS --------------------------- */
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
function startOfLocalDayKey(d: Date, tz: string) {
  return localParts(d, tz).key; // 'YYYY-MM-DD'
}
function hourToken(d: Date, tz: string) {
  const p = localParts(d, tz);
  const h12 = (p.hh % 12) || 12;
  return `${h12}${p.hh < 12 ? 'a' : 'p'}`;
}

/* ----------------------------- WEATHER PARSERS ---------------------------- */
type HourSample = {
  time: Date;
  temperature?: number;
  windSpeed?: number;
  uvIndex?: number;
  humidity?: number;      // 0-1 or 0-100
  precipChance?: number;  // 0-1 or 0-100
  cloudCover?: number;    // 0-1 or 0-100
  aqi?: number;
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
      const tIso =
        h?.forecastStart?.toString?.() ??
        h?.startTime?.toString?.() ??
        h?.time?.toString?.();
      const time = tIso ? new Date(tIso) : new Date(NaN);
      const temperature =
        asNumber(h?.temperature) ??
        asNumber(h?.temperatureApparent) ??
        asNumber(h?.temperatureMin);
      const windSpeed = asNumber(h?.windSpeed) ?? asNumber(h?.wind?.speed);
      const uvIndex = asNumber(h?.uvIndex) ?? asNumber(h?.uvIndexForecast);
      const humidity =
        normalize01(asNumber(h?.humidity)) ??
        normalize01(asNumber(h?.relativeHumidity));
      const precipChance =
        normalize01(asNumber(h?.precipitationChance)) ??
        normalize01(asNumber(h?.precipitationProbability));
      const cloudCover =
        normalize01(asNumber(h?.cloudCover)) ??
        normalize01(asNumber(h?.cloudAmount));
      const aqi = asNumber(h?.airQualityIndex);
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
    const rises = [d?.sunrise, d?.sunriseTime, d?.sunriseEpoch, d?.sunriseISO, d?.sunriseDate, d?.solar?.sunrise]
      .filter(Boolean).map(String);
    const sets  = [d?.sunset,  d?.sunsetTime,  d?.sunsetEpoch,  d?.sunsetISO,  d?.sunsetDate,  d?.solar?.sunset]
      .filter(Boolean).map(String);
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
    sunset:  sunsetISO  ? new Date(sunsetISO)  : undefined,
  };
}

/* -------------------------------- SCORING -------------------------------- */
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
  const k = Math.max(1, Math.round(durationMin / 60)); // hours worth of slots
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

/* -------------------------- CHART (QuickChart URL) ------------------------ */
function buildChartUrl(args: {
  tz: string;
  daylight: (HourSample & { score: number })[];
  dawnIdx: number;
  duskIdx: number;
  bestStartIdx: number;
  bestEndIdx: number;
  title: string;
}) {
  const { tz, daylight, dawnIdx, duskIdx, bestStartIdx, bestEndIdx, title } = args;
  const labels = daylight.map(h => hourToken(h.time, tz));
  const temps = daylight.map(h => (h.temperature !== undefined ? Math.round(h.temperature) : null));

  const clamp = (i: number) => Math.max(0, Math.min(labels.length - 1, i));
  const _dawn = clamp(dawnIdx);
  const _dusk = clamp(duskIdx);
  const _b0 = clamp(bestStartIdx);
  const _b1 = Math.max(_b0, clamp(bestEndIdx));

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Temp °F',
          data: temps,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.15)',
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 } },
        annotation: {
          annotations: {
            dawnLine: {
              type: 'line',
              xMin: _dawn, xMax: _dawn,
              borderColor: 'rgba(0,0,0,0.5)',
              borderWidth: 2,
              borderDash: [6, 6],
            },
            duskLine: {
              type: 'line',
              xMin: _dusk, xMax: _dusk,
              borderColor: 'rgba(0,0,0,0.5)',
              borderWidth: 2,
              borderDash: [6, 6],
            },
            bestBox: {
              type: 'box',
              xMin: _b0, xMax: _b1,
              backgroundColor: 'rgba(16, 185, 129, 0.18)',
              borderWidth: 0,
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { callback: (v: any) => `${v}°` } },
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

/* ------------------------------- GET HANDLER ------------------------------ */
export async function GET(req: Request) {
  const url = new URL(req.url);

  // Optional trace to debug what’s being presented (no secrets leaked)
  if (url.searchParams.get('trace') === '1') {
    const hdrs = headers();
    const cks  = cookies();
    const auth = isAuthorized(req);
    return NextResponse.json({
      ok: auth.ok,
      mode: (auth as any).mode || undefined,
      envPresent: {
        ADMIN_TOKEN: !!(process.env.ADMIN_TOKEN || '').trim(),
        CRON_SECRET: !!((process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET) || '').trim(),
      },
      presented: {
        header_admin: !!(hdrs.get('x-admin-token') || '').trim(),
        query_admin:  !!(url.searchParams.get('token') || '').trim(),
        cookie_admin: !!(cks.get('admin_token')?.value || '').trim(),
        bearer:       (() => {
          const a = (hdrs.get('authorization') || '').trim();
          return a.toLowerCase().startsWith('bearer ') && !!a.slice(7).trim();
        })(),
        header_cron:  !!((hdrs.get('x-cron-secret') || hdrs.get('x-vercel-cron-secret')) || '').trim(),
        query_cron:   !!((url.searchParams.get('secret') ||
                           url.searchParams.get('cron_secret') ||
                           url.searchParams.get('vercel_cron_secret') || '').trim()),
      },
    });
  }

  const auth = isAuthorized(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized (cron/admin)' }, { status: 401 });
  }

  try {
    const dry = url.searchParams.get('dry') === '1' || !url.searchParams.get('send'); // default: dry-run
    const onlyPhone = url.searchParams.get('phone') || undefined;

    let sent = 0;
    let matches = 0;
    const details: any[] = [];

    const twilioReady = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
    );

    // IMPORTANT: select only columns that definitely exist in your DB schema
    const subscriberSelect = {
      phoneE164: true,
      active: true,
      zip: true,
      latitude: true,
      longitude: true,
      durationMin: true,
      prefs: true,        // legacy JSON bag (may include timeZone, deliveryHourLocal, thresholds)
      createdAt: true,
      lastSentAt: true,
    } satisfies Parameters<typeof prisma.subscriber.findMany>[0]['select'];

    const subs = await prisma.subscriber.findMany({
      where: { active: true, ...(onlyPhone ? { phoneE164: onlyPhone } : {}) },
      select: subscriberSelect,
      ...(onlyPhone ? { take: 1 } : {}),
    });

    const nowUTC = new Date();

    for (const s of subs) {
      try {
        const p = s.prefs ?? {};
        const tz: string = p.timeZone ?? 'America/Chicago';
        const deliveryHourLocal: number | undefined = (p.deliveryHourLocal ?? undefined);

        const partsNow = localParts(nowUTC, tz);
        if (!onlyPhone && typeof deliveryHourLocal === 'number' && deliveryHourLocal !== partsNow.hh) {
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

        const weather = await fetchWeather(s.latitude, s.longitude, tz);
        const dayKey = startOfLocalDayKey(nowUTC, tz);

        const hourlyAll = extractHourly(weather);
        const hourlyToday = hourlyAll.filter(h => localParts(h.time, tz).key === dayKey);

        let { sunrise, sunset } = extractSunTimes(weather, tz, dayKey);
        // Fallback if missing: use hours where UV>0, else 06–18 local
        if (!sunrise || !sunset) {
          const daylightGuess = hourlyToday.filter(h => (h.uvIndex ?? 0) > 0);
          if (daylightGuess.length > 0) {
            sunrise = daylightGuess[0].time;
            sunset  = daylightGuess[daylightGuess.length - 1].time;
          } else {
            const any = hourlyToday[0]?.time ?? nowUTC;
            const lp = localParts(any, tz);
            const findAt = (hh: number) =>
              hourlyToday.find(h => localParts(h.time, tz).hh === hh)?.time
              ?? new Date(any.getTime() + (hh - lp.hh) * 3600_000);
            sunrise = findAt(6);
            sunset  = findAt(18);
          }
        }

        const dawnLocal = sunrise ? fmtLocalHM(sunrise, tz) : '';
        const duskLocal = sunset ? fmtLocalHM(sunset, tz) : '';

        // Constrain to daylight
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

        // Preferences (from prefs JSON bag)
        const prefs: Prefs = {
          tempMin: p.tempMin ?? undefined,
          tempMax: p.tempMax ?? undefined,
          windMax: p.windMax ?? undefined,
          uvMax: p.uvMax ?? undefined,
          aqiMax: p.aqiMax ?? undefined,
          humidityMax: p.humidityMax ?? undefined,
          precipMax: p.precipMax ?? undefined,
          cloudMax: p.cloudMax ?? undefined,
        };

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

        // Compose SMS
        const rep = best.repr;
        const tempStr = rep.temperature !== undefined ? `${Math.round(rep.temperature)}°F` : '';
        const windStr = rep.windSpeed !== undefined ? `${Math.round(rep.windSpeed)} mph wind` : '';
        const uvStr = rep.uvIndex !== undefined ? `UV ${Math.round(rep.uvIndex)}` : '';
        const hum = rep.humidity !== undefined ? (rep.humidity <= 1 ? rep.humidity * 100 : rep.humidity) : undefined;
        const humStr = hum !== undefined ? `${Math.round(hum)}% RH` : '';
        const pr = rep.precipChance !== undefined ? (rep.precipChance <= 1 ? rep.precipChance * 100 : rep.precipChance) : undefined;
        const precipStr = pr !== undefined ? `${Math.round(pr)}% precip` : '';

        const smsPreview =
          `Civil dawn ${dawnLocal} · Civil dusk ${duskLocal}\n` +
          `Best ${durationMin}min (daylight): ${best.startHM}–${best.endHM} (Score ${best.avgScore})\n` +
          [tempStr, windStr, uvStr, humStr, precipStr].filter(Boolean).join(' · ') +
          `\n— ClearSked (reply STOP to cancel)`;

        // Build chart URL (indices relative to daylight array)
        const dawnIdx = 0; // daylight begins at dawn
        const duskIdx = Math.max(0, daylight.length - 1);
        const title = `Best ${durationMin}m ${best.startHM}–${best.endHM} (Score ${best.avgScore})`;
        const chartUrl = buildChartUrl({
          tz,
          daylight: scored,
          dawnIdx,
          duskIdx,
          bestStartIdx: best.startIdx,
          bestEndIdx: best.endIdx,
          title,
        });

        if (dry) {
          details.push({
            phone: s.phoneE164, tz, dawnLocal, duskLocal,
            requestedDuration: durationMin, usedDuration: durationMin,
            startLocal: best.startHM, endLocal: best.endHM,
            bestScore: best.avgScore, smsPreview, chartUrl,
            skipped: 'dry-run',
          });
        } else if (!twilioReady) {
          details.push({
            phone: s.phoneE164, tz, dawnLocal, duskLocal,
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
              requestedDuration: durationMin, usedDuration: durationMin,
              startLocal: best.startHM, endLocal: best.endHM,
              bestScore: best.avgScore, smsPreview, chartUrl, sent: true,
            });
          } catch (e: any) {
            details.push({
              phone: s.phoneE164, tz, dawnLocal, duskLocal,
              requestedDuration: durationMin, usedDuration: durationMin,
              startLocal: best.startHM, endLocal: best.endHM,
              bestScore: best.avgScore, smsPreview, chartUrl,
              error: `twilio: ${e?.message || 'send failed'}`,
            });
          }
        }
      } catch (inner: any) {
        details.push({ phone: s?.phoneE164, error: inner?.message || 'subscriber processing failed' });
      }
    }

    return NextResponse.json({ ok: true, method: 'GET', sent, matches, details });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server error' }, { status: 500 });
  }
}
