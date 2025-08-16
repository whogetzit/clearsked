// …existing imports…
const TZ = 'America/Chicago';

function nowInTZ(tz: string) {
  // Convert "now" into the given time zone
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}

function ymdInTZ(d: Date, tz: string) {
  // stable YYYY-MM-DD in the given TZ
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d); // e.g., 2025-08-15
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1) Only run at 5am CT
    const nowCT = nowInTZ(TZ);
    const hourCT = nowCT.getHours();
    if (hourCT !== 5) {
      return res.status(200).json({ ok: true, skipped: `not 5am CT`, hourCT });
    }

    const todayKey = ymdInTZ(nowCT, TZ);

    const subs = await prisma.subscriber.findMany({ where: { active: true } });

    let sent = 0, skippedAlreadyToday = 0;

    for (const s of subs) {
      // 2) Skip if we’ve already sent to this number today (in CT)
      if (s.lastSentAt) {
        const lastKey = ymdInTZ(new Date(s.lastSentAt), TZ);
        if (lastKey === todayKey) {
          skippedAlreadyToday++;
          continue;
        }
      }

      // === your existing fetch + score + MMS send code ===
      const data = await fetchWeather(s.latitude, s.longitude, process.env.TZ || TZ);
      const hours = (data as any)?.forecastHourly?.hours || [];
      const minutes = interpolateHourlyToMinutes(hours);

      const bands: UserBands = (s as any)?.prefs?.bands;
      const best = bestWindowWithBands(minutes, s.durationMin, bands);
      const values = minutes.map(m => Math.round(minuteScoreWithBands(m, bands) * 100));
      const labels = minutes.map(m => new Date(m.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }));

      // Dawn/Dusk markers + title (already in your code)
      const { dawn, dusk } = (function pickDawnDusk(data: any) {
        const d = data?.forecastDaily?.days?.[0] || data?.forecastDaily?.forecast?.[0] || data?.forecastDaily?.day?.[0] || data?.forecastDaily || {};
        const grab = (obj: any, keys: string[]) => keys.map(k => obj?.[k]).find(Boolean);
        const dawnRaw = grab(d, ['civilSunrise','dawn','firstLight','nauticalDawn','astronomicalDawn','sunriseCivil','daylightStart','civilStart','sunriseTimeCivil']) || d?.sunrise?.civil || d?.daylight?.civilStart;
        const duskRaw = grab(d, ['civilSunset','dusk','lastLight','nauticalDusk','astronomicalDusk','sunsetCivil','daylightEnd','civilEnd','sunsetTimeCivil']) || d?.sunset?.civil || d?.daylight?.civilEnd;
        const toDate = (v: any) => v ? new Date(v) : undefined;
        return { dawn: toDate(dawnRaw), dusk: toDate(duskRaw) };
      })(data);

      const fmt = (t: Date) => t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
      const markers = [
        dawn && { label: 'Dawn', x: fmt(dawn), color: 'rgba(54, 162, 235, 0.9)' },
        dusk && { label: 'Dusk', x: fmt(dusk), color: 'rgba(33, 97, 140, 0.9)' }
      ].filter(Boolean) as any[];
      const title = `Comfort — next 24h${dawn && dusk ? ` (Dawn ${fmt(dawn)} · Dusk ${fmt(dusk)})` : ''}`;
      const chartUrl = quickChartUrl(labels, values, title, markers);

      const body = `ClearSked · Best ${s.durationMin}m: ${best.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ })}–${best.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ })} · ${Math.round(best.score)}%\n— Built by ChatGPT-5 Thinking`;

      await sendMMS(s.phoneE164, body, chartUrl);
      await prisma.subscriber.update({ where: { id: s.id }, data: { lastSentAt: new Date() } });
      sent++;
    }

    res.status(200).json({ ok: true, sent, skippedAlreadyToday });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
