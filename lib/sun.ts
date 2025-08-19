// lib/sun.ts
import SunCalc from 'suncalc';

/** Build a UTC date pinned at 12:00 so SunCalc picks the intended local day. */
function localDateNoonUTC(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Extract local (y,m,d,hh,mm) for a UTC date in a target tz. */
export function localParts(dateUTC: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(dateUTC);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value || '0');
  const y = get('year'), m = get('month'), d = get('day');
  const hh = get('hour'), mm = get('minute');
  return { y, m, d, hh, mm, key: `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` };
}

/** Civil dawn/dusk (−6°) for the local day at tz. Safe fallbacks included. */
export function getCivilTimes(
  lat: number,
  lon: number,
  tz: string,
  dateUTC: Date
): { civilDawn?: Date; civilDusk?: Date } {
  const { y, m, d } = localParts(dateUTC, tz);
  const base = localDateNoonUTC(y, m, d);

  const t = SunCalc.getTimes(base, lat, lon);

  const civilDawn =
    t.civilDawn || t.dawn || t.nauticalDawn || t.sunrise || undefined;

  const civilDusk =
    t.civilDusk || t.dusk || t.nauticalDusk || t.sunset || undefined;

  return { civilDawn, civilDusk };
}

/** h:mm AM/PM in tz */
export function fmtLocalHM(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
}

/** Mon, Aug 19 in tz */
export function fmtLocalDateLine(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

/** “7a/8a/…/12p/1p …” compact label for an hour tick in tz */
export function hourToken(d: Date, tz: string) {
  const p = localParts(d, tz);
  const h12 = (p.hh % 12) || 12;
  return `${h12}${p.hh < 12 ? 'a' : 'p'}`;
}
