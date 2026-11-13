import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITIES, PRAYERS, prayerTimes, upcomingPrayerTimes } from './prayer';

// The test process runs in Pakistan Standard Time so the expectations below are wall-clock times.
process.env.TZ = 'Asia/Karachi';
const lahore = CITIES[0];
const minutes = (d: Date | null) => (d ? d.getHours() * 60 + d.getMinutes() : NaN);
const near = (actual: Date | null, hh: number, mm: number, tolerance: number) => {
  const diff = Math.abs(minutes(actual) - (hh * 60 + mm));
  assert.ok(diff <= tolerance, `expected ~${hh}:${String(mm).padStart(2, '0')}, got ${actual?.toTimeString().slice(0, 5)}`);
};

test('prayers are in order through the day', () => {
  for (const month of [0, 3, 6, 9]) {
    const t = prayerTimes(new Date(2026, month, 15), lahore, 'karachi', 'hanafi');
    const ordered = PRAYERS.map((p) => minutes(t[p]));
    assert.deepEqual([...ordered].sort((a, b) => a - b), ordered);
  }
});

test('Lahore around the June solstice matches published timetables', () => {
  const t = prayerTimes(new Date(2026, 5, 21), lahore, 'karachi', 'hanafi');
  near(t.sunrise, 4, 59, 5);
  near(t.dhuhr, 12, 6, 5);
  near(t.maghrib, 19, 10, 5);
  near(t.fajr, 3, 25, 10);
  near(t.isha, 20, 45, 10);
  // Hanafi Asr is later than the standard (Shafi'i) Asr.
  const standard = prayerTimes(new Date(2026, 5, 21), lahore, 'karachi', 'standard');
  assert.ok(minutes(t.asr) - minutes(standard.asr) > 30);
});

test('Lahore in December has short days', () => {
  const t = prayerTimes(new Date(2026, 11, 21), lahore, 'karachi', 'hanafi');
  near(t.sunrise, 7, 0, 6);
  near(t.maghrib, 17, 4, 6);
});

test('Makkah method uses a fixed interval for Isha', () => {
  const t = prayerTimes(new Date(2026, 2, 1), CITIES.find((c) => c.name === 'Makkah')!, 'makkah', 'standard');
  assert.equal(minutes(t.isha) - minutes(t.maghrib), 90);
});

test('the sun never sets deep enough for Isha at extreme latitudes', () => {
  const t = prayerTimes(new Date(2026, 5, 21), { lat: 69.6, lng: 18.9 }, 'mwl', 'standard');
  assert.equal(t.isha, null);
});

test('upcoming times are in the future, ascending, with the offset applied', () => {
  const from = new Date(2026, 0, 10, 13, 0);
  const plain = upcomingPrayerTimes('maghrib', 0, lahore, 'karachi', 'hanafi', from, 10);
  const later = upcomingPrayerTimes('maghrib', 15, lahore, 'karachi', 'hanafi', from, 10);
  assert.equal(plain.length, 10);
  assert.ok(plain.every((t, i) => t > from.getTime() && (i === 0 || t > plain[i - 1])));
  assert.equal(later[0] - plain[0], 15 * 60_000);
});
