// -----------------------------------------------------------------------------
// Constants of the WebUntis integration: endpoint, pacing, limits and the
// manifest keys. Every WebUntis field name lives in src/webuntis/.
// -----------------------------------------------------------------------------

/** The JSON-RPC endpoint of a WebUntis server (python-webuntis `utils/userinput.py`). */
export const RPC_PATH = '/WebUntis/jsonrpc.do';

/**
 * Identifies the integration on every request and as the `client` of the
 * login. Honest: it never poses as the Untis app or a browser.
 */
export const CLIENT_NAME = 'gladys-webuntis';
export const USER_AGENT = 'gladys-webuntis/0.1 (+https://github.com/LM1LC3N7/gladys-webuntis)';

/** One request never waits longer than this. */
export const HTTP_TIMEOUT = 20_000;
/** Largest answer read (a week of a class timetable is far below). */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Be gentle with the school's server: one reading (login, timetable, logout)
 * every `poll_minutes`, 30 by default, never below 15. Nothing reads faster:
 * neither the test button, nor a reconnection to Gladys, nor a restart (the
 * time of the last attempt is kept in /data).
 */
export const PACING = {
  /** The scheduler and the "school day starts" check run once a minute. */
  TICK: 60_000,
  /** A 429 or a 5xx pauses every reading at least this long... */
  PAUSE_MIN: 60_000,
  /** ...this long when the server gives no Retry-After... */
  PAUSE_DEFAULT: 30 * 60_000,
  /** ...and never longer than this (a bogus Retry-After cannot freeze the integration). */
  PAUSE_MAX: 6 * 60 * 60_000,
  /** The time of the last attempt is written to /data at most this often. */
  SAVE_MIN_GAP: 60_000,
  /** A "school day starts" event fires at most this late after its time (a restart, a slow tick). */
  DAY_START_GRACE: 5 * 60_000,
};

/** The class list (only read when a class name is configured) is reused for a day. */
export const CLASSES_TTL = 24 * 60 * 60_000;

/** Events of one kind fired by one reading at most. */
export const MAX_EVENTS_PER_READING = 20;
/** Announced lesson changes remembered at most (in /data). */
export const MAX_ANNOUNCED = 400;
/** Lessons kept from one answer at most (a class timetable of two weeks fits easily). */
export const MAX_LESSONS = 1000;
/** Longest string of a scene event or an output (the core caps them at 1000). */
export const MAX_TEXT = 300;
/** Longest text of the `list` output of "read a school day". */
export const MAX_LIST_TEXT = 1500;
/** Rows of the widget status list (the vocabulary allows 10). */
export const WIDGET_ROWS = 10;

/** The time zones offered (the WebUntis times are wall times of the school). */
export const TIME_ZONES = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Luxembourg',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Paris',
  'Europe/Rome',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Bratislava',
  'Europe/Ljubljana',
  'Europe/London',
];

/** Days of the week as the `weekday` variable and field give them. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** How far a changed lesson is (the `day` variable and field). */
export const DAY_KINDS = ['today', 'tomorrow', 'later'];

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = { GET_DAY: 'get_school_day' };
export const SCENE_TRIGGERS = {
  CANCELLED: 'lesson_cancelled',
  CHANGED: 'lesson_changed',
  DAY_START: 'school_day_starts',
};
export const WIDGETS = { TIMETABLE: 'timetable' };
/** The days a widget or "read a school day" can show. */
export const DAY_CHOICES = ['auto', 'today', 'tomorrow', 'next_school_day'];
