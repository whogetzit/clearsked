// pages/api/send-daily.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/server/db"; // adjust import
import { fetchWeather, interpolateHourlyToMinutes, bestWindowWithBands, minuteScoreWithBands, quickChartShortUrl } from "@/lib/weather"; // adjust import
import { sendMMS } from "@/lib/twilio"; // adjust import

const TZ = "America/Chicago";

// Gate manual calls unless you set CRON_TOKEN in Vercel
const REQUIRE_CRON_HEADER = true;
const CRON_TOKEN = process.env.CRON_TOKEN;

function nowInTZ(tz: string) {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

function ymdInTZ(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

// Optional: simple idempotency helper if you don’t want a SendLog table
async function markSentAndGuard(subscriberId: string, ymdKey: string) {
  // If you add a unique composite index on (subscriberId, ymdKey) in a SendLog table,
  // use an upsert here instead of relying on lastSentAt checks.
  await prisma.subscriber.update({
    where: { id: subscriberId },
    data: { lastSentAt: new Date() },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // Vercel Cron protection (recommended)
    if (REQUIRE_CRON_HEADER) {
      const isCron = req.headers["x-vercel-cron"] === "1";
      const tokenOk = CRON_TOKEN && req.headers.authorization === `Bearer ${CRON_TOKEN}`;
      if (!isCron && !tokenOk) {
        return res.status(403).json({ ok: false, error: "Forbidden (cron only)" });
      }
    }

    // Only run at 5am CT (handles DST correctly)
    const nowCT = nowInTZ(TZ);
    const hourCT = nowCT.getHours();
    if (hourCT !== 5) {
      return res.status(200).json({ ok: true, skipped: "not 5am CT", hourCT });
    }

    const todayKey = ymdInTZ(nowCT, TZ);

    const subs = await prisma.subscriber.findMany({ where: { active: true } });

    let sent = 0, skippedAlreadyToday = 0, failed = 0;

    for (const s of subs) {
      try {
        // Skip if already sent today (in CT)
        if (s.lastSentAt) {
          const lastKey = ymdInTZ(new Date(s.lastSentAt), TZ);
          if (lastKey === todayKey) {
            skippedAlreadyToday++;
            continue;
          }
        }

        // === fetch + scoring ===
        const data = await fetchWeather(s.latitude, s.longitude, TZ);

        const hours = (data as any)?.forecastHourly?.hours || [];
        // Downsample to 5-min to keep charts light for MMS
        const minutes = interpolateHourlyToMinutes(hours, 5); // adjust your helper to support step=5

        const bands: UserBands = (s as any)?.prefs?.bands;
        const best = bestWindowWithBands(minutes, s.durationMin, bands);

        const values = minutes.map(m => Math.round(minuteScoreWithBands(m, bands) * 100));
        const labels = minutes.map(m =>
          new Date(m.t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
        );

        // Dawn/Dusk markers + title
        const { dawn, dusk } = (function pickDawnDusk(data: any) {
          const d = data?.forecastDaily?.days?.[0]
            || data?.forecastDaily?.forecast?.[0]
            || data?.forecastDaily?.day?.[0]
            || data?.forecastDaily
            || {};
          const grab = (obj: any, keys: string[]) => keys.map(k => obj?.[k]).find(Boolean);
          const dawnRaw = grab(d, ["civilSunrise","dawn","firstLight","nauticalDawn","astronomicalDawn","sunriseCivil","daylightStart","civilStart","sunriseTimeCivil"]) || d?.sunrise?.civil || d?.daylight?.civilStart;
          const duskRaw = grab(d, ["civilSunset","dusk","lastLight","nauticalDusk","astronomicalDusk","sunsetCivil","daylightEnd","civilEnd","sunsetTimeCivil"]) || d?.sunset?.civil || d?.daylight?.civilEnd;
          const toDate = (v: any) => v ? new Date(v) : undefined;
          return { dawn: toDate(dawnRaw), dusk: toDate(duskRaw) };
        })(data);

        const fmt = (t: Date) => t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
        const markers = [
          dawn && { label: "Dawn", x: fmt(dawn), color: "rgba(54, 162, 235, 0.9)" },
          dusk && { label: "Dusk", x: fmt(dusk), color: "rgba(33, 97, 140, 0.9)" },
        ].filter(Boolean) as any[];

        const title = `Comfort — next 24h${dawn && dusk ? ` (Dawn ${fmt(dawn)} · Dusk ${fmt(dusk)})` : ""}`;

        // IMPORTANT: use a SHORT URL (QuickChart create API) or your own image proxy
        const chartUrl = await quickChartShortUrl({ labels, values, title, markers }); // implement POST -> shortUrl

        const body =
          `ClearSked · Best ${s.durationMin}m: `
          + `${best.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: TZ })}–`
          + `${best.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: TZ })} · `
          + `${Math.round(best.score)}%\n— Built by ChatGPT-5 Thinking`;

        await sendMMS(s.phoneE164, body, chartUrl);

        await markSentAndGuard(s.id, todayKey);
        sent++;
      } catch (err) {
        failed++;
        // Optional: log per-subscriber failure row for observability
        // await prisma.sendError.create({ data: { subscriberId: s.id, dateKey: todayKey, message: String(err) } });
        continue;
      }
    }

    return res.status(200).json({ ok: true, sent, skippedAlreadyToday, failed });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
