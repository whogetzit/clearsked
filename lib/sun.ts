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
  /** Day key like "20250819" for grouping/filtering */
  key: string;
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

  const hh = pad(h);
  const mm = pad(m);
  const key = `${Y}${pad(M)}${pad(D)}`; // <- NEW: day key "YYYYMMDD"

  return { Y, M, D, h, m, hh, mm, key };
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

export function hourToken(
