// -----------------------------------------------------------------------------
// A fake WebUntis server behind `fetch` (src/http.js setFetch): the JSON-RPC
// methods the integration calls, shaped after python-webuntis (its tests'
// static answers and session.py) — authenticate, getKlassen, getTimetable,
// logout — with the error codes of remote.py. Every call is recorded.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

export const ACCOUNT = { username: 'pupil.one', password: 'pa55-word', school: 'demo-school' };

/** A period as getTimetable returns it with the field options of the client. */
export function period({
  id,
  date = 20261021,
  start = 800,
  end = 845,
  subject = 'M',
  subjectName = 'Mathematik',
  room = 'R101',
  teacher = 'MUE',
  code,
  lstype,
  substText,
  orgRoom,
  orgTeacher,
}) {
  const raw = {
    id,
    date,
    startTime: start,
    endTime: end,
    kl: [{ id: 7 }],
    su: [{ id: 3, name: subject, longname: subjectName }],
    ro: [{ id: 11, name: room, longname: `Room ${room}` }],
    te: [{ id: 21, name: teacher }],
  };
  if (code) raw.code = code;
  if (lstype) raw.lstype = lstype;
  if (substText) raw.substText = substText;
  if (orgRoom) raw.ro[0] = { ...raw.ro[0], orgid: 12, orgname: orgRoom };
  if (orgTeacher) raw.te[0] = { ...raw.te[0], orgid: 22, orgname: orgTeacher };
  return raw;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export function installWebUntis({
  account = ACCOUNT,
  personType = 5,
  personId = 42,
  periods = [],
  klassen = [{ id: 7, name: '7b', longName: 'Klasse 7b' }],
} = {}) {
  const fake = {
    account: { ...account },
    personType,
    personId,
    periods,
    klassen,
    /** Every request: { host, school, method, params, cookie, userAgent }. */
    calls: [],
    sessions: 0,
    /** A hook run before the method: return a Response to answer instead. */
    intercept: undefined,
    methods() {
      return this.calls.map((c) => c.method);
    },
    restore() {
      setFetch(previous);
    },
  };
  const previous = setFetch(async (url, init) => {
    const parsed = new URL(url);
    const body = JSON.parse(init.body);
    const call = {
      host: parsed.host,
      protocol: parsed.protocol,
      path: parsed.pathname,
      school: parsed.searchParams.get('school'),
      method: body.method,
      params: body.params,
      cookie: init.headers.Cookie,
      userAgent: init.headers['User-Agent'],
      redirect: init.redirect,
    };
    fake.calls.push(call);
    const custom = fake.intercept?.(call, body);
    if (custom) {
      return typeof custom === 'function' ? custom(body) : custom;
    }
    const answer = (result) => json({ jsonrpc: '2.0', id: body.id, result });
    const error = (code, message) =>
      json({ jsonrpc: '2.0', id: body.id, error: { code, message } });
    if (call.school !== fake.account.school) {
      return error(-8500, 'invalid schoolname');
    }
    if (body.method === 'authenticate') {
      if (
        body.params.user !== fake.account.username ||
        body.params.password !== fake.account.password
      ) {
        return error(-8504, 'bad credentials');
      }
      fake.sessions += 1;
      return answer({
        sessionId: `SESSION${fake.sessions}`,
        personType: fake.personType,
        personId: fake.personId,
        klasseId: 7,
      });
    }
    if (!/^JSESSIONID=SESSION\d+$/.test(call.cookie ?? '')) {
      return error(-8520, 'not authenticated');
    }
    if (body.method === 'logout') {
      return answer({});
    }
    if (body.method === 'getKlassen') {
      return answer(fake.klassen);
    }
    if (body.method === 'getTimetable') {
      const periodsNow =
        typeof fake.periods === 'function' ? fake.periods(body.params) : fake.periods;
      return answer(periodsNow);
    }
    return error(-32601, 'Method not found');
  });
  return fake;
}

export { json };
