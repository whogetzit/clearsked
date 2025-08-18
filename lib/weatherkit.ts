// lib/weatherkit.ts
import "server-only";
import jwt from "jsonwebtoken";

const TEAM_ID = process.env.WEATHERKIT_TEAM_ID!;
const SERVICE_ID = process.env.WEATHERKIT_SERVICE_ID!;
const KEY_ID = process.env.WEATHERKIT_KEY_ID!;
const P8_BASE64 = process.env.WEATHERKIT_P8_BASE64!;

function getKey() {
  return Buffer.from(P8_BASE64, "base64").toString("utf8");
}

// ---- Cache the JWT for up to 25 minutes to avoid re-signing every call
let cachedToken: { value: string; exp: number } | null = null;
export function weatherkitJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedToken.exp - 60) {
    return cachedToken.value;
  }
  const exp = now + 30 * 60; // 30 minutes
  const value = jwt.sign(
    { iss: TEAM_ID, iat: now, exp, sub: SERVICE_ID },
    getKey(),
    { algorithm: "ES256", header: { kid: KEY_ID, id: `${TEAM_ID}.${SERVICE_ID}` } }
  );
  cachedToken = { value, exp };
  return value;
}

// Very small fetch helper with timeout + basic retry
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000, retries = 1) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
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
  const qs = new URLSearchParams({
    dataSets: "forecastHourly,forecastDaily,airQualityForecast",
    timezone: tz,
  });
  const res = await fetchWithTimeout(`${base}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Tell Next this is server-side and not cacheable by ISR
    cache: "no-store",
  });
  return res.json();
}
