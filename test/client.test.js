// -----------------------------------------------------------------------------
// The JSON-RPC client (remote.py, session.py) and the configuration.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { WebUntisClient, WebUntisError, fold } from '../src/webuntis/client.js';
import { configFingerprint, normalizeConfig, serverHost } from '../src/config.js';
import { retryAfterMs } from '../src/http.js';
import { ACCOUNT, installWebUntis, json, period } from './helpers/fakeWebUntis.js';

let webuntis;
afterEach(() => {
  webuntis?.restore();
  webuntis = undefined;
});

const client = (overrides = {}) =>
  new WebUntisClient({ server: 'neilo.webuntis.com', ...ACCOUNT, ...overrides });

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof WebUntisError, err.message);
    assert.equal(err.code, code);
    return true;
  });
}

test('the server: a host name from whatever was pasted, HTTPS only, no credentials in it', () => {
  assert.equal(serverHost('neilo.webuntis.com'), 'neilo.webuntis.com');
  assert.equal(
    serverHost(' HTTPS://Neilo.WebUntis.com/WebUntis/?school=x#/basic '),
    'neilo.webuntis.com',
  );
  assert.equal(serverHost('http://untis.school.example:8443/'), 'untis.school.example:8443');
  assert.equal(serverHost('untis.school.example:443'), 'untis.school.example');
  assert.equal(serverHost('user:pw@neilo.webuntis.com'), '');
  assert.equal(serverHost('localhost'), '');
  assert.equal(serverHost('neilo.webuntis.com:99999'), '');
  assert.equal(serverHost('bad_host.example'), '');
  assert.equal(serverHost(undefined), '');
  assert.equal(
    client({ school: 'a b&c' }).url,
    'https://neilo.webuntis.com/WebUntis/jsonrpc.do?school=a%20b%26c',
  );
});

test('the configuration: defaults and bounds; the fingerprint never shows the password', () => {
  const config = normalizeConfig({
    server: 'neilo.webuntis.com',
    school: 'demo',
    username: ' pupil ',
    password: ' spaces kept ',
    poll_minutes: 1,
    lookahead_days: 99,
    day_start_notice_minutes: '',
    time_zone: 'Mars/Olympus',
  });
  assert.equal(config.username, 'pupil');
  assert.equal(config.password, ' spaces kept ');
  assert.equal(config.pollMinutes, 15, 'never below 15 minutes');
  assert.equal(config.lookaheadDays, 14);
  assert.equal(config.dayStartNotice, 60);
  assert.equal(config.timeZone, 'Europe/Berlin');
  const fingerprint = configFingerprint({ password: 'secret-value' });
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(fingerprint, configFingerprint({ password: 'other' }));
  assert.equal(configFingerprint({ a: 1 }), configFingerprint({}), 'unknown keys do not count');
});

test('the error codes of remote.py and the transport errors', async () => {
  webuntis = installWebUntis({ periods: [period({ id: 1 })] });
  await rejects(client({ password: 'nope' }).readTimetable({ from: 1, to: 2 }), 'bad_credentials');
  await rejects(client({ school: 'nope' }).readTimetable({ from: 1, to: 2 }), 'unknown_school');
  const reply = (error) => (call) =>
    call.method === 'getTimetable'
      ? (body) => json({ jsonrpc: '2.0', id: body.id, error })
      : undefined;
  webuntis.intercept = reply({ code: -8509, message: 'no right' });
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'no_right');
  webuntis.intercept = reply({ code: -8520, message: 'not authenticated' });
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'session');
  webuntis.intercept = reply({ code: -8507, message: 'date' });
  assert.deepEqual(await client().readTimetable({ from: 1, to: 2 }), {
    periods: [],
    outsideSchoolYear: true,
  });
  webuntis.intercept = reply('not an object');
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'remote');
  webuntis.intercept = (call) =>
    call.method === 'getTimetable'
      ? (body) => json({ jsonrpc: '2.0', id: `${body.id}x`, result: [] })
      : undefined;
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'protocol');
  webuntis.intercept = (call) =>
    call.method === 'authenticate'
      ? (body) => json({ jsonrpc: '2.0', id: body.id, result: { sessionId: 'a\r\nSet-Cookie: x' } })
      : undefined;
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'protocol');
  webuntis.intercept = () => new Response('<html>maintenance</html>', { status: 200 });
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'protocol');
  webuntis.intercept = () => new Response('', { status: 404 });
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'not_webuntis');
  webuntis.intercept = () => json({}, 429, { 'Retry-After': '120' });
  await assert.rejects(client().readTimetable({ from: 1, to: 2 }), (err) => {
    assert.equal(err.code, 'rate_limited');
    assert.equal(err.retryAfter, 120_000);
    return true;
  });
  webuntis.intercept = () => {
    throw new TypeError('fetch failed');
  };
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'network');
});

test('every reading logs out, even after an error; a refused login sends nothing else', async () => {
  webuntis = installWebUntis();
  await rejects(client({ password: 'x' }).readTimetable({ from: 1, to: 2 }), 'bad_credentials');
  assert.deepEqual(webuntis.methods(), ['authenticate']);
  webuntis.calls.length = 0;
  webuntis.intercept = (call) => (call.method === 'getTimetable' ? json({}, 500) : undefined);
  await rejects(client().readTimetable({ from: 1, to: 2 }), 'server');
  assert.deepEqual(webuntis.methods(), ['authenticate', 'getTimetable', 'logout']);
});

test('the class list is read once a day; a class is found by its folded name', async () => {
  webuntis = installWebUntis({
    personType: 12,
    klassen: [{ id: 9, name: '5a', longName: 'Klasse 5ä' }],
  });
  let now = 0;
  const c = new WebUntisClient({ server: 'neilo.webuntis.com', ...ACCOUNT, now: () => now });
  await c.readTimetable({ from: 1, to: 2, className: 'KLASSE 5A' });
  await c.readTimetable({ from: 1, to: 2, className: 'klasse 5a' });
  assert.equal(webuntis.calls.filter((x) => x.method === 'getKlassen').length, 1);
  now += 25 * 3600_000;
  await c.readTimetable({ from: 1, to: 2, className: '5a' });
  assert.equal(webuntis.calls.filter((x) => x.method === 'getKlassen').length, 2);
  await rejects(c.readTimetable({ from: 1, to: 2, className: '6c' }), 'unknown_class');
  await rejects(c.readTimetable({ from: 1, to: 2 }), 'needs_class');
  assert.equal(fold(' Klasse 5ä '), 'klasse5a');
  assert.equal(c.requests, webuntis.calls.length);
});

test('Retry-After: seconds or a date', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  assert.equal(retryAfterMs('30', now), 30_000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 10:05:00 GMT', now), 300_000);
  assert.equal(retryAfterMs('soon', now), undefined);
  assert.equal(retryAfterMs(null, now), undefined);
});
