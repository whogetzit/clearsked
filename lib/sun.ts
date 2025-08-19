// lib/sun.ts

// --- Types ---
export type CivilTimes = {
  sunrise: Date;
  sunset: Date;
  dawn: Date;
  dusk: Date;
};

// --- Helpers ---
function toTZ(date: Date | number, tz: string) {
  // Create a Date that reflects the same wall-clock time in `tz`
  // (works well for formatting/comparisons without extra deps)
  const d = new Date(date);
  return new Date(new Date(d.toLocaleString('en-US', { timeZone: tz })));
}

export function localParts(d = new Date(), tz = 'UTC') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => Number(fmt.find((p) => p.type === t)?.value ?? '0');
  return { Y: get('year'), M: get('month'), D: get('day'), h: get('hour'), m: get('minute') };
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
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Y}${pad(M)}${pad(D)}${pad(h)}`; // e.g. 20250819 11:00 -> "2025081911"
}

/**
 * getCivilTimes
 * Minimal placeholder to unblock builds. Replace with precise solar calcs when ready.
 * Returns approximate civil times for the provided date/coords in `tz`.
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

  // Approx times; swap in real solar calculations later.
  return {
    dawn: mk(6, 30),
    sunrise: mk(7, 0),
    sunset: mk(19, 0),
    dusk: mk(19, 30),
  };
}
