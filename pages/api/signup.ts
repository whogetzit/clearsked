import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';
import { zipToLatLon } from '../../lib/zip';
import { fetchWeather } from '../../lib/weatherkit';
import { interpolateHourlyToMinutes, quickChartUrl, minuteScoreWithBands, bestWindowWithBands, UserBands } from '../../lib/scoring';
import { sendMMS } from '../../lib/twilio';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method!=='POST') return res.status(405).json({message:'Method not allowed'});
  const { zip, duration, phone, prefs } = req.body || {};
  try{
    const { lat, lon } = zipToLatLon(String(zip));
    const data = await fetchWeather(lat, lon, process.env.TZ || 'America/Chicago');
    const hours = (data as any)?.forecastHourly?.hours || [];
    const minutes = interpolateHourlyToMinutes(hours);
    const phoneE164 = String(phone).startsWith('+')? String(phone) : '+1'+String(phone);

    await prisma.subscriber.upsert({
      where:{ phoneE164 },
      update:{ zip:String(zip), latitude:lat, longitude:lon, durationMin:Number(duration), active:true, prefs: prefs || undefined },
      create:{ phoneE164, zip:String(zip), latitude:lat, longitude:lon, durationMin:Number(duration), active:true, prefs: prefs || undefined }
    });

    const bands:UserBands = prefs?.bands;
    const best = bestWindowWithBands(minutes, Number(duration), bands);
    const values = minutes.map(m => Math.round(minuteScoreWithBands(m, bands)*100));
    const labels = minutes.map((m,i)=> (i%30===0? new Date(m.t).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):''));
    const chartUrl = quickChartUrl(labels, values, 'Comfort — next 24h');

    const body = `ClearSked signup OK for ${zip}. Best ${duration}m window: ${best.start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}–${best.end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} · Score ${Math.round(best.score)}%\n— Built by ChatGPT-5 Thinking`;
    await sendMMS(phoneE164, body, chartUrl);
    return res.status(200).json({ message: 'Signed up! Check your phone for today’s chart.', best, chartUrl });
  }catch(e:any){
    return res.status(400).json({ message: e.message||'Signup failed' });
  }
}
