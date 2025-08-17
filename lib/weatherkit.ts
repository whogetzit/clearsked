// lib/weatherkit.ts
import jwt from "jsonwebtoken";

/** Safely decode base64 PEM (works in Node & Edge) */
function base64ToUtf8(b64: string): string {
  // Node (server) has Buffer; Edge may have atob
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  if (typeof atob !== "undefined") return decodeURIComponent(escape(atob(b64)));
  throw new Error("Base64 decode not available in this runtime");
}

const TEAM_ID = process.env.WEATHERKIT_TEAM_ID;
const SERVICE_ID = process.env.WEATHERKIT_SERVICE_ID; // e.g. "com.your.bundleid"
const KEY_ID = process.env.WEATHERKIT_KEY_ID;         // 10-char key id from Apple
const P8_BASE64 = process.env.WEATHERKIT_P8_BASE64;   // base64 of your *.p8 contents

function getPrivateKey(): string {
  if (!P8_BASE64) throw new Error("Missing env WEATHERKIT_P8_BASE64");
  return base64ToUtf8(P8_BASE64);
}

export function weatherkitJWT(): string {
  if (!TEAM_ID) throw new Error("Missing env WEATHERKIT_TEAM_ID");
  if (!SERVICE_ID) throw new Error("Missing env WEATHERKIT_SERVICE_ID");
  if (!KEY_ID) throw new Error("Missing env WEATHERKIT_KEY_ID");

  const now = Math.floor(Date.now() / 1000);
  // 30-minute lifetime is recommended by Apple
  return jwt.sign(
    { iss: TEAM_ID, iat: now, exp: now + 30 * 60, sub: SERVICE_ID },
    getPrivateKey(),
    { algorithm: "ES256", header: { kid: KEY_ID, id: `${TEAM_ID}.${SERVICE_ID}` } }
  );
}

export async function fetchWeather(lat: number, lon: number, tz: string) {
  const token = weatherkitJWT();
  const url = new URL(`https://weatherkit.apple.com/api/v1/weather/en/${lat}/${lon}`);
  url.searchParams.set("dataSets", "forecastHourly,forecastDaily,airQualityForecast");
  url.searchParams.set("timezone", tz);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    // Make sure this runs server-side only; WeatherKit is server-to-server
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WeatherKit ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}
