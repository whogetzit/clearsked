import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { fetchWeather } from '../../../lib/weatherkit';
import { interpolateHourlyToMinutes, quickChartUrl, minuteScoreWithBands, bestWindowWithBands, UserBands } from '../../../lib/scoring';
import { sendMMS } from '../../../lib/twilio';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  try{
    const subs = await prisma.subscriber.findMany({ where:{ active:true } });
    for(const s of subs){
      const data = await fetchWeather(s.latitude, s.longitude, process.env.TZ || 'America/Chicago');
      const hours = (data as any)?.forecastHourly?.hours || [];
      const minutes = interpolateHourlyToMinutes(hours);
      const bands:UserBands = (s as any)?.prefs?.bands;
      const best = bestWindowWithBands(minutes, s.durationMin, bands);
      const values = minutes.map(m => Math.round(minuteScoreWithBands(m, bands)*100));
      const labels = minutes.map((m,i)=> (i%30===0? new Date(m.t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):''));
      const chartUrl = quickChartUrl(labels, values, 'Comfort — next 24h');
      const body = `ClearSked · Best ${s.durationMin}m: ${best.start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}–${best.end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} · ${Math.round(best.score)}%\n— Built by ChatGPT-5 Thinking`;
      await sendMMS(s.phoneE164, body, chartUrl);
      await prisma.subscriber.update({ where:{ id:s.id }, data:{ lastSentAt: new Date() } });
    }
    res.status(200).json({ ok:true, count: subs.length });
  }catch(e:any){
    res.status(500).json({ ok:false, error: e.message });
  }
}
