// -----------------------------------------------------------------------------
// Wall times in a time zone, without a library. Pure.
//
// WebUntis gives dates and times as wall times of the school ("20261021",
// "755" for 07:55), without any offset: they are turned into instants with
// the time zone of the configuration, never with the container's (UTC).
// -----------------------------------------------------------------------------

import { WEEKDAYS } from './constants.js';

const formatters = new Map();

function formatter(timeZone) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  return format;
}

function wallParts(instant, timeZone) {
  const parts = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(instant))) {
    parts[type] = value;
  }
  return parts;
}

/** The offset of the zone at an instant, in ms (Berlin in October: +2 h). */
function offsetAt(instant, timeZone) {
  const p = wallParts(instant, timeZone);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - (instant - (((instant % 1000) + 1000) % 1000));
}

/** "2026-10-21" + "07:55" in Europe/Berlin -> the instant (ms). */
export function zonedToInstant(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = String(time ?? '00:00')
    .split(':')
    .map(Number);
  const wall = Date.UTC(y, m - 1, d, h || 0, min || 0);
  // Two passes: the offset at the guessed instant, then at the corrected one
  // (a DST change between them moves the answer by an hour).
  const guess = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(guess, timeZone);
}

/** An instant as the wall date and time of a zone: { date: '2026-10-21', time: '07:55' }. */
export function localParts(instant, timeZone) {
  const p = wallParts(instant, timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** The date `days` after `date` ("2026-10-31", 1 -> "2026-11-01"). */
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (two "YYYY-MM-DD"). */
export function daysBetween(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "mon" ... "sun" of a date. */
export function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

/** "2026-10-21" -> 20261021 (the date format of WebUntis). */
export const untisDate = (date) => Number(date.replaceAll('-', ''));

/** 20261021 -> "2026-10-21"; null when it is not a plausible date. */
export function dateOfUntis(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 19700101 || n > 29991231) {
    return null;
  }
  const y = Math.floor(n / 10000);
  const m = Math.floor(n / 100) % 100;
  const d = n % 100;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 755 -> "07:55"; null when it is not a time of day. */
export function timeOfUntis(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 2359 || n % 100 > 59) {
    return null;
  }
  return `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
}
