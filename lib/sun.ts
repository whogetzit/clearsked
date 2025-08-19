// lib/sun.ts

// ---- Types ----
export type CivilTimes = {
  // Primary fields
  dawn: Date;
  sunrise: Date;
  sunset: Date;
  dusk: Date;
  // Aliases for compatibility with existing page code
  civilDawn: Date;
  civilDusk: Date;
};

export type LocalParts = {
  Y: number; M: number; D: number; h: number; m: number;
  hh: string; mm: string;
  /** Day key like "20250819" for grouping/filtering */
  key: string;
};

// ---- Utils ----
const pad = (n: number) => String(n).padStart(2, '0');

/** Return a Date that reflects the same wall-clock time in the given tz */
function toTZ(date: Date | number, tz: string) {
  const d = new Date(date);
  return new Date(new Date(d.toLocaleString('en-US', { timeZone: tz })));
}

// ---- Exports your app expects ----
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
  const key = `${Y}${pad(M)}${pad(D)}`; // "YYYYMMDD"

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

export function hourToken(d: Date = new Date(), tz = 'UTC') {
  const { Y, M, D, h } = localParts(d, tz);
  return `${Y}${pad(M)}${pad(D)}${pad(h)}`; // e.g., "2025081911"
}

/**
 * getCivilTimes
 * Compat function that supports BOTH:
 *  - getCivilTimes(lat, lon, date?, tz?)
 *  - getCivilTimes(lat, lon, tz, date)
 * Returns both {dawn,dusk} and {civilDawn,civilDusk} aliases.
 */
export function getCivilTimes(
  lat: number,
  lon: number,
  a?: Date | string,
  b?: Date | string
): CivilTimes {
  // Defaults
  let date: Date = new Date();
  let tz: string = 'America/Chicago';

  // Arg normalization:
  // If third arg is a string -> it's tz; fourth (if any) is date.
  // If third arg is a Date -> it's date; fourth (if any) is tz.
  if (a instanceof Date) {
    date = a;
    if (typeof b === 'string') tz = b;
  } else if (typeof a === 'string') {
    tz = a;
    if (b instanceof Date) date = b;
  }

  // NOTE: lat/lon unused in this placeholder. Replace with real solar math later.
  const base = toTZ(date, tz);
  const mk = (h: number, m = 0) => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Simple stand-in values (customize/replace with real calculations)
  const dawn = mk(6, 30);
  const sunrise = mk(7, 0);
  const sunset = mk(19, 0);
  const dusk = mk(19, 30);

  // Provide both naming schemes for compatibility
  return {
    dawn,
    sunrise,
    sunset,
    dusk,
    civilDawn: dawn,
    civilDusk: dusk,
  };
}
