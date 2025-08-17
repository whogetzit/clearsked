// lib/solar.ts
// Civil dawn/dusk using the NOAA-style algorithm.
// Returns UTC Date objects for the subscriber's local calendar day.

export type CivilTimes = { dawnUTC: Date; duskUTC: Date };

const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;

// Get Y/M/D for the given 'when' in a specific IANA timezone
export function getLocalYMD(timeZone: string, when = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(when);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  return { year: y, month: m, day: d };
}

function dayOfYearUTC(year: number, month: number, day: number) {
  const noonUTC = Date.UTC(year, month - 1, day, 12, 0, 0);
  const jan1UTC = Date.UTC(year, 0, 1, 0, 0, 0);
  return Math.floor((noonUTC - jan1UTC) / 86_400_000) + 1;
}

function solarUT(
  isSunrise: boolean,
  zenith: number,
  lat: number,
  lon: number,
  N: number
) {
  const lngHour = lon / 15;
  const t = N + ((isSunrise ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(deg2rad(M)) + 0.02 * Math.sin(deg2rad(2 * M)) + 282.634;
  L = (L + 360) % 360;

  let RA = rad2deg(Math.atan(0.91764 * Math.tan(deg2rad(L))));
  RA = (RA + 360) % 360;

  const Lq = Math.floor(L / 90) * 90;
  const RAq = Math.floor(RA / 90) * 90;
  RA = RA + (Lq - RAq);
  RA = RA / 15;

  const sinDec = 0.39782 * Math.sin(deg2rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  let cosH =
    (Math.cos(deg2rad(zenith)) - sinDec * Math.sin(deg2rad(lat))) /
    (cosDec * Math.cos(deg2rad(lat)));
  cosH = Math.min(1, Math.max(-1, cosH));

  let H = isSunrise ? 360 - rad2deg(Math.acos(cosH)) : rad2deg(Math.acos(cosH));
  H = H / 15;

  const T = H + RA - 0.06571 * t - 6.622;
  let UT = (T - lngHour) % 24;
  if (UT < 0) UT += 24;
  return UT; // hours in 0..24
}

export function civilTwilightUTC(
  lat: number,
  lon: number,
  timeZone: string,
  when = new Date()
): CivilTimes {
  const { year, month, day } = getLocalYMD(timeZone, when);
  const N = dayOfYearUTC(year, month, day);
  const ZENITH = 96; // civil twilight
  const dawnUT = solarUT(true, ZENITH, lat, lon, N);
  const duskUT = solarUT(false, ZENITH, lat, lon, N);
  const baseUTC = Date.UTC(year, month - 1, day, 0, 0, 0);
  return {
    dawnUTC: new Date(baseUTC + Math.round(dawnUT * 3_600_000)),
    duskUTC: new Date(baseUTC + Math.round(duskUT * 3_600_000)),
  };
}

export function formatLocalTime(d: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    // fallback: HH:MM (UTC)
    return d.toISOString().slice(11, 16);
  }
}
