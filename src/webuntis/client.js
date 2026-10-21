// -----------------------------------------------------------------------------
// The WebUntis JSON-RPC client, ported from python-webuntis (BSD-3-Clause,
// see THIRD_PARTY_NOTICES.md): `utils/remote.py` (the request, the error
// codes), `session.py` (authenticate, getTimetable with its options, getKlassen,
// logout) and `utils/userinput.py` (the endpoint).
//
// One reading is one short session: authenticate, (the class list, once a
// day, when a class name is configured), the timetable of the period, logout.
// The session is never kept between readings and a refused login is never
// tried again in the same reading (python-webuntis `login_repeat` = 0).
//
// Nothing here logs: the username is often the pupil's own name, the
// password and the session id are secrets, the answers are a minor's
// timetable. Errors carry a code and a fixed text, never what the server
// echoed.
// -----------------------------------------------------------------------------

import { CLASSES_TTL, CLIENT_NAME, RPC_PATH } from '../constants.js';
import { HttpError, postJson } from '../http.js';

/** The WebUntis error codes python-webuntis interprets (remote.py `_errorcodes`), plus the school one. */
export const RPC_CODES = {
  METHOD_NOT_FOUND: -32601,
  BAD_CREDENTIALS: -8504,
  NOT_LOGGED_IN: -8520,
  NO_RIGHT: -8509,
  INVALID_SCHOOL: -8500,
  DATE_NOT_ALLOWED: [-7004, -8507],
};

/** The element types of getTimetable (session.py `element_type_table`). */
export const ELEMENT_TYPES = { klasse: 1, teacher: 2, subject: 3, room: 4, student: 5 };

export class WebUntisError extends Error {
  /**
   * `code`: 'bad_credentials' and 'unknown_school' are final (nothing is sent
   * again until the configuration changes); 'no_right', 'needs_class',
   * 'unknown_class' need a configuration change too but are not about the
   * password; 'rate_limited' and 'server' pause the readings; 'network',
   * 'timeout', 'protocol', 'session', 'remote' are retried at the next
   * interval.
   */
  constructor(code, message, { final = false, retryAfter, rpcCode } = {}) {
    super(message);
    this.name = 'WebUntisError';
    this.code = code;
    this.final = final;
    this.retryAfter = retryAfter;
    this.rpcCode = rpcCode;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** A session id fit for a Cookie header (no separator, no line break). */
const SESSION_ID = /^[A-Za-z0-9._~-]{1,200}$/;

/** A transport failure as a WebUntisError (429 and 5xx pause, the rest is retried later). */
function fromHttp(err) {
  if (!(err instanceof HttpError)) {
    return new WebUntisError('network', 'Unreachable');
  }
  if (err.kind === 'http' && (err.status === 429 || err.status === 503)) {
    return new WebUntisError('rate_limited', `HTTP ${err.status}`, { retryAfter: err.retryAfter });
  }
  if (err.kind === 'http' && err.status >= 500) {
    return new WebUntisError('server', `HTTP ${err.status}`, { retryAfter: err.retryAfter });
  }
  if (err.kind === 'http' && err.status === 404) {
    // No WebUntis at this address (or not this path): a configuration error.
    return new WebUntisError('not_webuntis', 'HTTP 404');
  }
  if (err.kind === 'http') {
    return new WebUntisError('remote', `HTTP ${err.status}`);
  }
  if (err.kind === 'timeout') {
    return new WebUntisError('timeout', err.message);
  }
  if (err.kind === 'too_large' || err.kind === 'redirect') {
    return new WebUntisError('protocol', err.message);
  }
  return new WebUntisError('network', err.message);
}

/** A JSON-RPC error answer as a WebUntisError (remote.py `_parse_error_code`). */
function fromRpc(error) {
  const code = Number(isObject(error) ? error.code : NaN);
  if (code === RPC_CODES.BAD_CREDENTIALS) {
    return new WebUntisError('bad_credentials', 'Login refused', { final: true, rpcCode: code });
  }
  if (code === RPC_CODES.INVALID_SCHOOL) {
    return new WebUntisError('unknown_school', 'Unknown school', { final: true, rpcCode: code });
  }
  if (code === RPC_CODES.NOT_LOGGED_IN) {
    return new WebUntisError('session', 'Session lost', { rpcCode: code });
  }
  if (code === RPC_CODES.NO_RIGHT) {
    return new WebUntisError('no_right', 'No right for this timetable', { rpcCode: code });
  }
  if (RPC_CODES.DATE_NOT_ALLOWED.includes(code)) {
    return new WebUntisError('date_not_allowed', 'Dates outside the school year', {
      rpcCode: code,
    });
  }
  if (code === RPC_CODES.METHOD_NOT_FOUND) {
    return new WebUntisError('protocol', 'Method not found', { rpcCode: code });
  }
  return new WebUntisError('remote', `WebUntis error ${Number.isFinite(code) ? code : '?'}`, {
    rpcCode: Number.isFinite(code) ? code : undefined,
  });
}

/** Folded for a class name lookup: case, accents and spaces do not matter. */
export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

export class WebUntisClient {
  constructor({ server, school, username, password, now = Date.now }) {
    this.url = `https://${server}${RPC_PATH}?school=${encodeURIComponent(school)}`;
    this.username = username;
    this.password = password;
    this.now = now;
    this.nextId = 1;
    /** Requests sent since the start (shown by the test button). */
    this.requests = 0;
    /** { key, id, at }: the class found by its name, reused for a day. */
    this.classCache = undefined;
  }

  /** One JSON-RPC call (remote.py `rpc_request`). */
  async call(method, params, sessionId) {
    const id = `gladys-${this.nextId++}`;
    const headers = sessionId ? { Cookie: `JSESSIONID=${sessionId}` } : {};
    this.requests += 1;
    let answer;
    try {
      answer = await postJson(this.url, { id, method, params, jsonrpc: '2.0' }, { headers });
    } catch (err) {
      throw fromHttp(err);
    }
    let body;
    try {
      body = JSON.parse(answer.text);
    } catch {
      throw new WebUntisError('protocol', 'The answer is not JSON');
    }
    if (!isObject(body)) {
      throw new WebUntisError('protocol', 'Unexpected answer');
    }
    if (Object.hasOwn(body, 'error') && body.error !== null && body.error !== undefined) {
      throw fromRpc(body.error);
    }
    // remote.py `_parse_result`: the id must be the one sent.
    if (body.id !== id) {
      throw new WebUntisError('protocol', 'The answer is for another request');
    }
    if (!Object.hasOwn(body, 'result')) {
      throw new WebUntisError('protocol', 'Answer without a result');
    }
    return body.result;
  }

  /** session.py `login`: the session id and who logged in. */
  async authenticate() {
    const result = await this.call('authenticate', {
      user: this.username,
      password: this.password,
      client: CLIENT_NAME,
    });
    if (!isObject(result) || typeof result.sessionId !== 'string') {
      throw new WebUntisError('protocol', 'Login answered without a session');
    }
    if (!SESSION_ID.test(result.sessionId)) {
      throw new WebUntisError('protocol', 'Unusable session id');
    }
    const personType = Number(result.personType);
    const personId = Number(result.personId);
    return {
      sessionId: result.sessionId,
      personType: Number.isInteger(personType) ? personType : null,
      personId: Number.isInteger(personId) && personId > 0 ? personId : null,
    };
  }

  /** session.py `logout`; best effort, never throws. */
  async logout(sessionId) {
    try {
      await this.call('logout', {}, sessionId);
    } catch {
      // The session expires by itself on the server.
    }
  }

  /** The id of the class named `className` (getKlassen, reused for a day). */
  async classId(className, sessionId) {
    const key = fold(className);
    if (this.classCache?.key === key && this.now() - this.classCache.at < CLASSES_TTL) {
      return this.classCache.id;
    }
    const result = await this.call('getKlassen', {}, sessionId);
    if (!Array.isArray(result)) {
      throw new WebUntisError('protocol', 'Unexpected class list');
    }
    const found = result.find(
      (k) =>
        isObject(k) && Number.isInteger(k.id) && (fold(k.name) === key || fold(k.longName) === key),
    );
    if (!found) {
      throw new WebUntisError('unknown_class', 'Unknown class');
    }
    this.classCache = { key, id: found.id, at: this.now() };
    return found.id;
  }

  /** The element whose timetable is read: the class configured, else the account's own. */
  async element(login, className, sessionId) {
    if (className) {
      return { id: await this.classId(className, sessionId), type: ELEMENT_TYPES.klasse };
    }
    // A pupil (5) or a teacher (2) reads their own timetable; any other
    // account (a parent, an office account) needs a class name.
    if (
      login.personId &&
      (login.personType === ELEMENT_TYPES.student || login.personType === ELEMENT_TYPES.teacher)
    ) {
      return { id: login.personId, type: login.personType };
    }
    throw new WebUntisError('needs_class', 'This account has no timetable of its own');
  }

  /**
   * One reading: the periods from `from` to `to` (WebUntis dates, 20261021),
   * as WebUntis returns them (see model.js). Resolves
   * `{ periods, outsideSchoolYear }`.
   */
  async readTimetable({ from, to, className }) {
    const login = await this.authenticate();
    try {
      const element = await this.element(login, className, login.sessionId);
      let periods;
      try {
        // session.py `_timetable_extended_raw`, with the fields we show
        // (never the class names: they are not needed).
        periods = await this.call(
          'getTimetable',
          {
            options: {
              element,
              startDate: from,
              endDate: to,
              onlyBaseTimetable: false,
              showBooking: false,
              showInfo: true,
              showSubstText: true,
              showLsText: true,
              showStudentgroup: false,
              klasseFields: ['id'],
              roomFields: ['id', 'name', 'longname'],
              subjectFields: ['id', 'name', 'longname'],
              teacherFields: ['id', 'name'],
            },
          },
          login.sessionId,
        );
      } catch (err) {
        if (err instanceof WebUntisError && err.code === 'date_not_allowed') {
          return { periods: [], outsideSchoolYear: true };
        }
        throw err;
      }
      if (!Array.isArray(periods)) {
        throw new WebUntisError('protocol', 'Unexpected timetable');
      }
      return { periods, outsideSchoolYear: false };
    } finally {
      await this.logout(login.sessionId);
    }
  }
}
