/**
 * Prayer-time calculation, fully offline. Follows the standard astronomical method used by
 * praytimes.org: sun declination and equation of time from the date, then the hour angle at
 * which the sun reaches each prayer's depression angle.
 */
import type { PrayerName } from './types';

export type CalcMethod = 'karachi' | 'mwl' | 'isna' | 'egypt' | 'makkah';
export type AsrSchool = 'standard' | 'hanafi';

export const METHODS: Record<CalcMethod, { label: string; fajr: number; isha: number | { minutes: number } }> = {
  karachi: { label: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
  mwl: { label: 'Muslim World League', fajr: 18, isha: 17 },
  isna: { label: 'ISNA (North America)', fajr: 15, isha: 15 },
  egypt: { label: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  makkah: { label: 'Umm al-Qura, Makkah', fajr: 18.5, isha: { minutes: 90 } },
};

export const PRAYERS: PrayerName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export interface Location {
  name: string;
  lat: number;
  lng: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));
const arcsin = (x: number) => deg(Math.asin(x));
const arccos = (x: number) => deg(Math.acos(x));
const arctan2 = (y: number, x: number) => deg(Math.atan2(y, x));
const arccot = (x: number) => deg(Math.atan(1 / x));
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};

function julian(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function sun(jd: number): { declination: number; equation: number } {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fix(arctan2(cos(e) * sin(L), cos(L)) / 15, 24);
  return { declination: arcsin(sin(e) * sin(L)), equation: q / 15 - RA };
}

/**
 * Local clock times for one calendar day, as Date objects in the device's time zone.
 * A prayer the sun never reaches (very high latitudes) is null.
 */
export function prayerTimes(
  date: Date,
  location: { lat: number; lng: number },
  method: CalcMethod = 'karachi',
  school: AsrSchool = 'hanafi',
): Record<PrayerName, Date | null> {
  const { lat, lng } = location;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const jd = julian(y, m, d) - lng / (15 * 24);
  const midday = new Date(y, m - 1, d, 12);
  const zone = -midday.getTimezoneOffset() / 60;

  const midDay = (t: number) => fix(12 - sun(jd + t).equation, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const decl = sun(jd + t).declination;
    const x = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    if (x < -1 || x > 1) return NaN;
    const T = arccos(x) / 15;
    return midDay(t) + (before ? -T : T);
  };
  const asrTime = (factor: number, t: number) => {
    const decl = sun(jd + t).declination;
    return angleTime(-arccot(factor + tan(Math.abs(lat - decl))), t, false);
  };

  const config = METHODS[method];
  const raw: Record<PrayerName, number> = {
    fajr: angleTime(config.fajr, 5 / 24, true),
    sunrise: angleTime(0.833, 6 / 24, true),
    dhuhr: midDay(12 / 24),
    asr: asrTime(school === 'hanafi' ? 2 : 1, 13 / 24),
    maghrib: angleTime(0.833, 18 / 24, false),
    isha: 0,
  };
  raw.isha = typeof config.isha === 'number' ? angleTime(config.isha, 18 / 24, false) : raw.maghrib + config.isha.minutes / 60;
  // Dhuhr a minute after the zenith, as is customary.
  raw.dhuhr += 1 / 60;

  const out = {} as Record<PrayerName, Date | null>;
  for (const name of PRAYERS) {
    const hours = raw[name] + zone - lng / 15;
    if (!Number.isFinite(hours)) {
      out[name] = null;
      continue;
    }
    const minutes = Math.round(hours * 60);
    out[name] = new Date(y, m - 1, d, 0, minutes);
  }
  return out;
}

/** Timestamps of one prayer (plus an offset) for the next `days` days, for the native scheduler. */
export function upcomingPrayerTimes(
  prayer: PrayerName,
  offsetMinutes: number,
  location: { lat: number; lng: number },
  method: CalcMethod,
  school: AsrSchool,
  from: Date = new Date(),
  days = 120,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const time = prayerTimes(day, location, method, school)[prayer];
    if (!time) continue;
    const at = time.getTime() + offsetMinutes * 60_000;
    if (at > from.getTime()) out.push(at);
  }
  return out;
}

export const CITIES: Location[] = [
  { name: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
  { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
  { name: 'Faisalabad', lat: 31.4504, lng: 73.135 },
  { name: 'Multan', lat: 30.1575, lng: 71.5249 },
  { name: 'Peshawar', lat: 34.0151, lng: 71.5249 },
  { name: 'Quetta', lat: 30.1798, lng: 66.975 },
  { name: 'Sialkot', lat: 32.4945, lng: 74.5229 },
  { name: 'Gujranwala', lat: 32.1877, lng: 74.1945 },
  { name: 'Hyderabad', lat: 25.396, lng: 68.3578 },
  { name: 'Makkah', lat: 21.3891, lng: 39.8579 },
  { name: 'Madinah', lat: 24.5247, lng: 39.5692 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Riyadh', lat: 24.7136, lng: 46.6753 },
  { name: 'Doha', lat: 25.2854, lng: 51.531 },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
  { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
];
