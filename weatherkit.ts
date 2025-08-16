import jwt from 'jsonwebtoken'; import fetch from 'node-fetch';
const TEAM_ID=process.env.WEATHERKIT_TEAM_ID!, SERVICE_ID=process.env.WEATHERKIT_SERVICE_ID!, KEY_ID=process.env.WEATHERKIT_KEY_ID!, P8_BASE64=process.env.WEATHERKIT_P8_BASE64!;
function getKey(){ return Buffer.from(P8_BASE64,'base64').toString('utf8'); }
export function weatherkitJWT(){ const now=Math.floor(Date.now()/1000); return jwt.sign({iss:TEAM_ID,iat:now,exp:now+1800,sub:SERVICE_ID}, getKey(), {algorithm:'ES256', header:{kid:KEY_ID,id:`${TEAM_ID}.${SERVICE_ID}`}}); }
export async function fetchWeather(lat:number,lon:number,tz:string){ const token=weatherkitJWT(); const url=`https://weatherkit.apple.com/api/v1/weather/en/${lat}/${lon}`; const qs=new URLSearchParams({dataSets:'forecastHourly,forecastDaily,airQualityForecast',timezone:tz}); const r=await fetch(`${url}?${qs}`,{headers:{Authorization:`Bearer ${token}`}}); if(!r.ok) throw new Error('WeatherKit error '+r.status); return r.json(); }
