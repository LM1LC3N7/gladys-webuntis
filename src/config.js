// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { TIME_ZONES } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  time_zone: 'Europe/Berlin',
  poll_minutes: 30,
  lookahead_days: 7,
  day_start_notice_minutes: 60,
};

/** The bounds of the number fields: they MUST match `min` / `max` in the manifest. */
export const BOUNDS = {
  poll_minutes: [15, 240],
  lookahead_days: [1, 14],
  day_start_notice_minutes: [0, 240],
};

const number = (value, key) => {
  const n = Number(value);
  const [min, max] = BOUNDS[key];
  return Number.isFinite(n) && value !== '' && value !== null && value !== undefined
    ? Math.min(max, Math.max(min, Math.round(n)))
    : DEFAULTS[key];
};

const text = (value, max = 200) =>
  typeof value === 'string'
    ? value.trim().slice(0, max)
    : typeof value === 'number'
      ? String(value)
      : '';

/**
 * The host of the WebUntis server, from what the user pasted: a host name
 * ("neilo.webuntis.com"), or the address of the WebUntis page of the school
 * ("https://neilo.webuntis.com/WebUntis/?school=..."). Always reached over
 * HTTPS: the password goes there. Empty when it is not a host name.
 */
export function serverHost(raw) {
  let value = text(raw, 300).toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.split(/[/?#]/)[0];
  // A user:password@ part is never accepted (it would end up in the URL).
  if (value.includes('@')) {
    return '';
  }
  const match =
    /^([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+)(?::(\d{1,5}))?$/.exec(
      value,
    );
  if (!match) {
    return '';
  }
  const port = match[2] === undefined ? undefined : Number(match[2]);
  if (port !== undefined && (port < 1 || port > 65535)) {
    return '';
  }
  return port === undefined || port === 443 ? match[1] : `${match[1]}:${port}`;
}

export function normalizeConfig(raw = {}) {
  const value = raw ?? {};
  const zone = text(value.time_zone);
  return {
    server: serverHost(value.server),
    /** The login name of the school ("school" on the WebUntis login page). */
    school: text(value.school),
    /** Never logged: it is often the pupil's own name. */
    username: text(value.username),
    /** Sent to the school's WebUntis server only, in the login request; never logged. */
    password: typeof value.password === 'string' ? value.password : '',
    /** Optional: read this class instead of the account's own timetable (parent accounts). Never logged. */
    className: text(value.class_name, 60),
    timeZone: TIME_ZONES.includes(zone) ? zone : DEFAULTS.time_zone,
    pollMinutes: number(value.poll_minutes, 'poll_minutes'),
    lookaheadDays: number(value.lookahead_days, 'lookahead_days'),
    dayStartNotice: number(value.day_start_notice_minutes, 'day_start_notice_minutes'),
  };
}

/** Everything needed to log in is there. */
export const isComplete = (config) =>
  Boolean(config.server && config.school && config.username && config.password);

/**
 * What restarts the integration when it changes: every key the integration
 * reads, sorted. Kept in memory only (it contains the password); a
 * reconnection to Gladys with the same configuration changes nothing.
 */
export function configFingerprint(raw = {}) {
  const value = raw ?? {};
  const keys = [
    'server',
    'school',
    'username',
    'password',
    'class_name',
    'time_zone',
    'poll_minutes',
    'lookahead_days',
    'day_start_notice_minutes',
  ];
  return createHash('sha256')
    .update(JSON.stringify(keys.map((key) => [key, value[key] ?? null])))
    .digest('hex');
}
