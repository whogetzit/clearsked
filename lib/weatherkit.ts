// lib/weatherkit.ts
import "server-only";
import jwt from "jsonwebtoken";
import { env } from "@/lib/env";

function getKey() {
  return Buffer.from(env.WEATHERKIT_P8_BASE64, "base64").toString("utf8");
}

// Cache JWT for ~25 minutes to avoid re-signing every call
let cachedToken: { value: string; exp: number } | null = null;

export function weatherkitJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedToken.exp - 60) return cachedToken.value;

  const exp = now + 30 * 60;
  const value = jwt.sign(
    { iss: env.WEATHERKIT_TEAM_ID, iat: now, exp, sub: env.WEATHERKIT_SERVICE_ID },
    getKey(),
    { algorithm: "ES256", header: { kid: env.WEATHERKIT_KEY_ID, id: `${env.WEATHERKIT_TEAM_ID}.${env.WEATHERKIT_SERVICE_ID}` } }
  );
  cachedToken = { value, exp };
  return value;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000, retries = 1) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`WeatherKit ${res.status}`);
    return res;
  } catch (err) {
    if (retries > 0) return fetchWithTimeout(url, init, ms, retries - 1);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export async function fetchWeather(lat: number, lon: number, tz: string) {
  const token = weatherkitJWT();
  const base = `https://weatherkit.apple.com/api/v1/weather/en/${lat}/${lon}`;
  const qs = new URLSearchParams({ dataSets: "forecastHourly,forecastDaily,airQualityForecast", timezone: tz });
  const res = await fetchWithTimeout(`${base}?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}
