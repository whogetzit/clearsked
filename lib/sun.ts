// lib/sun.ts
import SunCalc from 'suncalc';

export type CivilWindow = {
  dawn?: Date;   // civil dawn
  dusk?: Date;   // civil dusk
};

export function getCivilWindow(lat: number, lon: number, when: Date): CivilWindow {
  // SunCalc expects a Date in UTC or local; it returns JS Dates in local time.
  // We use it just to get the civil phases (dawn/dusk).
  const t = SunCalc.getTimes(when, lat, lon);
  return {
    dawn: t.dawn ?? undefined,
    dusk: t.dusk ?? undefined,
  };
}

export function fmtLocalHM(d: Date | undefined, tz: string): string {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    // If an invalid tz sneaks in, fall back to local
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }
}

export function localDayKey(d: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  const y = get('year');
  const m = get('month');
  const day = get('day');
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
