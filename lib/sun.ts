// lib/sun.ts

// add near top-level (outside functions)
const pad = (n: number) => String(n).padStart(2, '0');

// Optionally export a type so TS knows hh/mm exist
export type LocalParts = {
  Y: number; M: number; D: number; h: number; m: number;
  hh: string; mm: string;
};

export function localParts(d = new Date(), tz = 'UTC'): LocalParts {
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

  const Y = get('year');
  const M = get('month');
  const D = get('day');
  const h = get('hour');
  const m = get('minute');

  return { Y, M, D, h, m, hh: pad(h), mm: pad(m) };
}

// adjust hourToken to use the shared pad
export function hourToken(d = new Date(), tz = 'UTC') {
  const { Y, M, D, h } = localParts(d, tz);
  return `${Y}${pad(M)}${pad(D)}${pad(h)}`;
}
