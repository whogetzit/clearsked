// lib/sun.ts

// ---- Types ----
export type CivilTimes = {
  dawn: Date;
  sunrise: Date;
  sunset: Date;
  dusk: Date;
};

export type LocalParts = {
  Y: number; M: number; D: number; h: number; m: number;
  hh: string; mm: string;
};

// ---- Utils ----
const pad = (n: number) => String(n).padStart(2, '0');

function toTZ(date: Date | number, tz: string) {
  const d = new Date(date);
  // Returns a Date object representing the same wall-clock time in tz
  return new Date(new Date(d.toLocaleString('en-US', { timeZone: tz })));
}

// ---- Exports your code expects ----
export function localParts(d: Date = new Date(), tz = 'UTC'): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const getNum = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');

  const Y = getNum('year');
  const M = getNum('month');
  const D = getNum('day');
  const h = getNum('hour');
  const m = getNum('minute');

  return { Y, M, D, h, m, hh: pad(h), mm: pad(m) };
}

export function fmtLocalHM(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function fmtLocalDateLine(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function hourToken(d = new Date(), tz = 'UTC') {
  const { Y, M, D, h } = localParts(d, tz);
  return `${Y}${pad(M)}${pad(D)}${pad(h)}`; // e.g., "2025081911"
}

/**
 * getCivilTimes
 * Placeholder (simple fixed times) to unblock builds.
 * Replace later with accurate solar calculations if needed.
 */
export function getCivilTimes(
  _lat: number,
  _lon: number,
  date = new Date(),
  tz = 'America/Chicago'
): CivilTimes {
  const base = toTZ(date, tz);
  const mk = (h: number, m = 0) => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };
  // Placeholder values; swap with precise solar calculations later.
  return {
    dawn: mk(6, 30),
    sunrise: mk(7, 0),
    sunset: mk(19, 0),
    dusk: mk(19, 30),
  };
}
