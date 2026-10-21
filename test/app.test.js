// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake WebUntis server.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WebUntisApp } from '../src/app.js';
import { ACTIONS, PACING, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import { memoryStore } from '../src/store.js';
import { ACCOUNT, installWebUntis, json, period } from './helpers/fakeWebUntis.js';
import { createClock, createFakeTimers } from './helpers/fakeTimers.js';

const CONFIG = {
  server: 'https://neilo.webuntis.com/WebUntis/?school=demo-school#/basic/login',
  school: ACCOUNT.school,
  username: ACCOUNT.username,
  password: ACCOUNT.password,
};
// Wednesday 21 October 2026, 06:30 in Berlin (UTC+2).
const START = '2026-10-21T04:30:00Z';
const MINUTE = 60_000;

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const outputsOf = (key) =>
  manifest.scene_actions
    .find((a) => a.key === key)
    .outputs.map((o) => o.key)
    .sort();
const variablesOf = (key) =>
  manifest.scene_triggers
    .find((t) => t.key === key)
    .variables.map((v) => v.key)
    .sort();

const WEEK = () => [
  period({ id: 1, start: 800, end: 845 }),
  period({ id: 2, start: 850, end: 935, subject: 'D', subjectName: 'Deutsch', room: 'R102' }),
  period({
    id: 3,
    start: 955,
    end: 1040,
    subject: 'E',
    subjectName: 'Englisch',
    code: 'cancelled',
  }),
  period({ id: 4, date: 20261022, start: 755, end: 840, subject: 'BIO', lstype: 'ex' }),
  period({ id: 5, date: 20261022, start: 845, end: 930, subject: 'SP' }),
];

let webuntis;
afterEach(() => {
  webuntis?.restore();
  webuntis = undefined;
});

function silentLogger(logs) {
  return Object.fromEntries(
    ['debug', 'info', 'warn', 'error'].map((level) => [
      level,
      (...args) => logs.push(`${level} ${args.map(String).join(' ')}`),
    ]),
  );
}

async function setup({
  config = CONFIG,
  periods = WEEK(),
  store = memoryStore(),
  clock = createClock(START),
  fakeOptions = {},
  connect = true,
} = {}) {
  webuntis ??= installWebUntis({ periods, ...fakeOptions });
  const gladys = createFakeGladys({ selector: 'webuntis', config });
  const timers = createFakeTimers();
  const logs = [];
  const app = new WebUntisApp({
    gladys,
    logger: silentLogger(logs),
    now: clock.now,
    timers,
    store,
  });
  // What index.js wires.
  gladys.onSceneAction(SCENE_ACTIONS.GET_DAY, (f) => app.getSchoolDay(f));
  gladys.onWidgetGet(WIDGETS.TIMETABLE, (request) => app.getWidget(request));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onConfigUpdated((c) => app.configUpdated(c));
  gladys.on('connected', async () => app.connected(await gladys.getConfig()));
  if (connect) {
    await gladys.connect();
  }
  /** One minute passes and the tick runs. */
  const minute = async (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      clock.advance(MINUTE);
      await timers
        .intervals()
        .find((t) => t.ms === PACING.TICK)
        ?.fn();
      await app.reading;
    }
  };
  return { app, gladys, timers, clock, store, logs, minute };
}

const count = (method) => webuntis.calls.filter((c) => c.method === method).length;

test('the first reading: one login, the timetable, a logout; the password goes to the school only', async () => {
  const { gladys, logs, app } = await setup();
  assert.deepEqual(webuntis.methods(), ['authenticate', 'getTimetable', 'logout']);
  for (const call of webuntis.calls) {
    assert.equal(call.protocol, 'https:');
    assert.equal(call.host, 'neilo.webuntis.com');
    assert.equal(call.path, '/WebUntis/jsonrpc.do');
    assert.equal(call.school, 'demo-school');
    assert.equal(call.redirect, 'manual', 'a redirection is never followed with the password');
    assert.match(call.userAgent, /^gladys-webuntis\//);
  }
  const [login, timetable] = webuntis.calls;
  assert.deepEqual(login.params, {
    user: ACCOUNT.username,
    password: ACCOUNT.password,
    client: 'gladys-webuntis',
  });
  assert.equal(login.cookie, undefined);
  assert.equal(timetable.cookie, 'JSESSIONID=SESSION1');
  assert.deepEqual(timetable.params.options.element, { id: 42, type: 5 });
  assert.equal(timetable.params.options.startDate, 20261021);
  assert.equal(timetable.params.options.endDate, 20261028);
  assert.equal(JSON.stringify(timetable.params).includes(ACCOUNT.password), false);
  // The first reading only remembers: the cancelled lesson fires nothing.
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /4 lessons in the next 7 days/);
  assert.deepEqual(gladys.fake.widgetRefreshes, [WIDGETS.TIMETABLE]);
  // Nothing logged names the account, the school, a subject or a room.
  const text = logs.join('\n');
  for (const secret of [
    ACCOUNT.username,
    ACCOUNT.password,
    'demo-school',
    'Mathematik',
    'R101',
    'SESSION1',
  ]) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(app.lessons.length, 5);
});

test('never read again before the interval; a new cancellation fires once, a change once per value', async () => {
  const { gladys, minute } = await setup();
  await minute(29);
  assert.equal(count('authenticate'), 1, 'nothing before 30 minutes');
  webuntis.periods = WEEK().map((p) =>
    p.id === 2
      ? { ...p, code: 'cancelled' }
      : p.id === 5
        ? period({
            id: 5,
            date: 20261022,
            start: 845,
            end: 930,
            subject: 'SP',
            orgRoom: 'GYM1',
            room: 'GYM2',
          })
        : p,
  );
  await minute();
  assert.equal(count('authenticate'), 2);
  const cancelled = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CANCELLED);
  const changed = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CHANGED);
  assert.equal(cancelled.length, 1);
  assert.equal(changed.length, 1);
  assert.deepEqual(Object.keys(cancelled[0].data).sort(), variablesOf(SCENE_TRIGGERS.CANCELLED));
  assert.deepEqual(Object.keys(changed[0].data).sort(), variablesOf(SCENE_TRIGGERS.CHANGED));
  assert.equal(cancelled[0].data.subject, 'D');
  assert.equal(cancelled[0].data.day, 'today');
  assert.equal(cancelled[0].data.start, '08:50');
  assert.equal(changed[0].data.day, 'tomorrow');
  assert.equal(changed[0].data.room, 'GYM2');
  assert.equal(changed[0].data.original_room, 'GYM1');
  for (const event of gladys.fake.sceneEvents) {
    for (const value of Object.values(event.data)) {
      assert.ok(
        value === null || ['string', 'boolean'].includes(typeof value) || Number.isFinite(value),
        `${event.key}: ${value}`,
      );
    }
  }
  // The same reading again: nothing new.
  await minute(30);
  assert.equal(count('authenticate'), 3);
  const changes = gladys.fake.sceneEvents.filter((e) => e.key !== SCENE_TRIGGERS.DAY_START);
  assert.equal(changes.length, 2);
  // 07:00 in Berlin passed meanwhile: 60 minutes before the first lesson.
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.DAY_START).length, 1);
  // Another room for the changed lesson: fires again.
  webuntis.periods = webuntis.periods.map((p) =>
    p.id === 5
      ? period({
          id: 5,
          date: 20261022,
          start: 845,
          end: 930,
          subject: 'SP',
          orgRoom: 'GYM1',
          room: 'GYM3',
        })
      : p,
  );
  await minute(30);
  assert.equal(gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CHANGED).length, 2);
});

test('a restart reads no sooner than the interval and keeps the memory of the announced changes', async () => {
  const store = memoryStore();
  const clock = createClock(START);
  const first = await setup({ store, clock });
  assert.equal(count('authenticate'), 1);
  await first.app.shutdown();
  clock.advance(10 * MINUTE);
  webuntis.periods = WEEK().map((p) => (p.id === 2 ? { ...p, code: 'cancelled' } : p));
  const second = await setup({ store, clock });
  assert.equal(count('authenticate'), 1, 'the restart did not read');
  assert.match(second.gladys.fake.connectionStatus.message.en, /next reading at 07:00/);
  const widget = await second.gladys.fake.widgetGet(WIDGETS.TIMETABLE);
  assert.deepEqual(validateWidgetContent(widget.data.content), []);
  await second.minute(20);
  assert.equal(count('authenticate'), 2);
  // Lesson 3 was already cancelled (announced at the first reading): only lesson 2 fires.
  const events = second.gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.CANCELLED);
  assert.deepEqual(
    events.map((e) => e.data.subject),
    ['D'],
  );
  const saved = JSON.stringify(store.data);
  for (const secret of [ACCOUNT.username, ACCOUNT.password, 'demo-school', 'neilo', 'Mathematik']) {
    assert.equal(saved.includes(secret), false, `${secret} in /data`);
  }
});

test('a reconnection or an unchanged configuration never starts another reading', async () => {
  let release;
  const { app, gladys } = await setup({ connect: false });
  // Hold the timetable answer: the reading stays in progress.
  webuntis.intercept = (call) =>
    call.method === 'getTimetable'
      ? (body) =>
          new Promise((resolve) => {
            release = () => resolve(json({ jsonrpc: '2.0', id: body.id, result: WEEK() }));
          })
      : undefined;
  const connecting = gladys.connect();
  await new Promise((resolve) => setImmediate(resolve));
  await app.connected(CONFIG);
  await app.configUpdated(CONFIG);
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(count('authenticate'), 1);
  release();
  await connecting;
  await app.reading;
  assert.equal(count('authenticate'), 1);
  assert.equal(app.lessons.length, 5);
  await app.connected(CONFIG);
  assert.equal(count('authenticate'), 1, 'connected again: the interval is kept');
  assert.equal(gladys.fake.connectionStatus.connected, true, 'the status is published again');
});

test('a late answer of a former configuration publishes nothing', async () => {
  let release;
  const { app, gladys } = await setup({ connect: false });
  webuntis.intercept = (call) =>
    call.method === 'getTimetable' && call.params.options.element.type === 5
      ? (body) =>
          new Promise((resolve) => {
            release = () => resolve(json({ jsonrpc: '2.0', id: body.id, result: WEEK() }));
          })
      : undefined;
  const connecting = gladys.connect();
  await new Promise((resolve) => setImmediate(resolve));
  // Another timetable (a class) while the first reading waits.
  await app.configUpdated({ ...CONFIG, class_name: '7B ' });
  assert.equal(count('getKlassen'), 1);
  const before = gladys.fake.connectionStatuses.length;
  const lessons = app.lessons;
  release();
  await connecting;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.connectionStatuses.length, before, 'no status from the old reading');
  assert.equal(app.lessons, lessons, 'the old lessons are not kept');
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('refused credentials: persisted stop, spaced new try on the test button only, erased by a success', async () => {
  const store = memoryStore();
  const clock = createClock(START);
  const bad = { ...CONFIG, password: 'wrong' };
  const first = await setup({ store, clock, config: bad });
  assert.equal(count('authenticate'), 1);
  assert.equal(count('logout'), 0);
  assert.equal(first.gladys.fake.connectionStatus.connected, false);
  assert.match(
    first.gladys.fake.connectionStatus.message.en,
    /refused the username or the password/,
  );
  assert.match(store.data.refused.hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(store.data).includes('wrong'), false);
  await first.minute(120);
  assert.equal(count('authenticate'), 1, 'never retried by itself');
  await first.app.shutdown();
  // A restart with the same refused password: nothing is sent.
  const second = await setup({ store, clock, config: bad });
  assert.equal(count('authenticate'), 1);
  assert.match(second.gladys.fake.connectionStatus.message.en, /refused/);
  // The test button: one spaced new try (the last one is 2 hours old).
  const ack = await second.gladys.fake.action(ACTIONS.TEST);
  assert.equal(count('authenticate'), 2);
  assert.match(ack.data.message.en, /refused/);
  // Clicked again at once: no new try.
  await second.gladys.fake.action(ACTIONS.TEST);
  assert.equal(count('authenticate'), 2);
  // The right password: tried at once, and the fingerprint of the refused one is erased.
  await second.gladys.fake.configUpdated(CONFIG);
  assert.equal(count('authenticate'), 3);
  assert.equal(second.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.data.refused, null);
});

test('an unknown school is a persisted stop too', async () => {
  const { gladys, minute, store } = await setup({ config: { ...CONFIG, school: 'other' } });
  assert.match(gladys.fake.connectionStatus.message.en, /does not know this school/);
  assert.equal(store.data.refused.code, 'unknown_school');
  await minute(60);
  assert.equal(count('authenticate'), 1);
});

test('429 with Retry-After: a bounded pause, persisted across a restart', async () => {
  const store = memoryStore();
  const clock = createClock(START);
  webuntis = installWebUntis({ periods: WEEK() });
  webuntis.intercept = (call) =>
    call.method === 'authenticate' ? json({}, 429, { 'Retry-After': '3600' }) : undefined;
  const first = await setup({ store, clock });
  assert.match(first.gladys.fake.connectionStatus.message.en, /paused for 60 min/);
  assert.equal(store.data.pause.until, clock.now() + 3600_000);
  webuntis.intercept = undefined;
  await first.minute(45);
  assert.equal(count('authenticate'), 1, 'the pause holds past the interval');
  await first.app.shutdown();
  const second = await setup({ store, clock });
  assert.equal(count('authenticate'), 1, 'and across a restart');
  await second.minute(15);
  assert.equal(count('authenticate'), 2);
  assert.equal(second.gladys.fake.connectionStatus.connected, true);
  assert.equal(store.data.pause, null);
});

test('a 5xx pauses 30 minutes; a Retry-After of a week is capped at 6 hours', async () => {
  webuntis = installWebUntis({ periods: WEEK() });
  webuntis.intercept = (call) => (call.method === 'authenticate' ? json({}, 502) : undefined);
  const { store, clock, app } = await setup();
  assert.equal(store.data.pause.until, clock.now() + 30 * MINUTE);
  assert.equal(store.data.pause.reason, 'server');
  webuntis.intercept = () => json({}, 503, { 'Retry-After': String(7 * 24 * 3600) });
  clock.advance(30 * MINUTE);
  await app.tick();
  assert.equal(store.data.pause.until, clock.now() + 6 * 60 * MINUTE);
});

test('a parent account needs a class: no new try until the configuration changes; the class is read by its name', async () => {
  webuntis = installWebUntis({ periods: WEEK(), personType: 12 });
  const { gladys, minute } = await setup();
  assert.match(gladys.fake.connectionStatus.message.en, /enter the class name/);
  assert.deepEqual(webuntis.methods(), ['authenticate', 'logout']);
  await minute(60);
  assert.equal(count('authenticate'), 1);
  await gladys.fake.configUpdated({ ...CONFIG, class_name: 'klasse 7B' });
  assert.deepEqual(webuntis.methods().slice(2), [
    'authenticate',
    'getKlassen',
    'getTimetable',
    'logout',
  ]);
  const timetable = webuntis.calls.find((c) => c.method === 'getTimetable');
  assert.deepEqual(timetable.params.options.element, { id: 7, type: 1 });
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('dates outside the school year: an empty timetable, said so', async () => {
  webuntis = installWebUntis();
  webuntis.intercept = (call) =>
    call.method === 'getTimetable'
      ? (body) =>
          json({ jsonrpc: '2.0', id: body.id, error: { code: -7004, message: 'no allowed date' } })
      : undefined;
  const { gladys, app } = await setup();
  assert.deepEqual(app.lessons, []);
  assert.match(gladys.fake.connectionStatus.message.en, /outside the school year/);
  assert.equal(count('logout'), 1);
});

test('"school day starts": once, at the notice before the first lesson held, kept across a restart', async () => {
  const store = memoryStore();
  const clock = createClock(START);
  // The first lesson (08:00) is cancelled: the day starts at 08:50.
  const periods = WEEK().map((p) => (p.id === 1 ? { ...p, code: 'cancelled' } : p));
  const first = await setup({ store, clock, periods });
  await first.minute(79); // 07:49 in Berlin
  assert.equal(first.gladys.fake.sceneEvents.length, 0);
  await first.minute(); // 07:50: 60 minutes before 08:50
  const events = first.gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.DAY_START);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0].data).sort(), variablesOf(SCENE_TRIGGERS.DAY_START));
  assert.equal(events[0].data.first_start, '08:50');
  assert.equal(events[0].data.late_start, true);
  assert.equal(events[0].data.weekday, 'wed');
  assert.equal(events[0].data.lesson_count, 1);
  assert.equal(events[0].data.cancelled_count, 2);
  await first.minute(3);
  await first.app.shutdown();
  const second = await setup({ store, clock, periods });
  await second.minute(2);
  assert.equal(
    second.gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.DAY_START).length,
    0,
    'not again after a restart',
  );
});

test('"read a school day": the outputs of the manifest, from the last reading only', async () => {
  const { gladys } = await setup();
  const calls = webuntis.calls.length;
  const today = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DAY, { day: 'today' });
  assert.equal(today.success, true);
  assert.deepEqual(Object.keys(today.data.outputs).sort(), outputsOf(SCENE_ACTIONS.GET_DAY));
  assert.equal(today.data.outputs.lesson_count, 2);
  assert.equal(today.data.outputs.cancelled_count, 1);
  assert.equal(today.data.outputs.first_start, '08:00');
  assert.equal(today.data.outputs.last_end, '09:35');
  assert.match(today.data.outputs.list, /09:55–10:40 E \(R101\) · cancelled/);
  const next = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DAY, { day: 'next_school_day' });
  assert.equal(next.data.outputs.date, '2026-10-22');
  assert.equal(next.data.outputs.exam_count, 1);
  const saturday = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_DAY, { day: 'tomorrow' });
  assert.equal(saturday.data.outputs.date, '2026-10-22');
  assert.equal(webuntis.calls.length, calls, 'no request');
});

test('the widget: valid content, today then the next school day', async () => {
  const { gladys, clock } = await setup();
  const morning = await gladys.fake.widgetGet(WIDGETS.TIMETABLE, { settings: { day: 'auto' } });
  assert.deepEqual(validateWidgetContent(morning.data.content), []);
  assert.equal(morning.data.content.components[0].text.en, 'Wednesday 21/10');
  const rows = morning.data.content.components.find((c) => c.type === 'status').items;
  assert.equal(rows.length, 3);
  assert.equal(rows[2].color, 'danger');
  clock.set('2026-10-21T08:00:00Z'); // 10:00, the last lesson held ended at 09:35
  const later = await gladys.fake.widgetGet(WIDGETS.TIMETABLE);
  assert.equal(later.data.content.components[0].text.en, 'Thursday 22/10');
  assert.deepEqual(validateWidgetContent(later.data.content), []);
});

test('the test button never reads sooner than the interval', async () => {
  const { gladys, clock } = await setup();
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(count('authenticate'), 1);
  assert.match(ack.data.message.en, /^Not read again/);
  clock.advance(30 * MINUTE);
  const again = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(count('authenticate'), 2);
  assert.match(again.data.message.en, /^Read now/);
});

test('an answer too large, or a redirection, is refused and retried at the interval only', async () => {
  webuntis = installWebUntis({ periods: WEEK() });
  webuntis.intercept = (call) =>
    call.method === 'getTimetable'
      ? new Response('x'.repeat(3 * 1024 * 1024), { status: 200 })
      : undefined;
  const { gladys, minute } = await setup();
  assert.match(gladys.fake.connectionStatus.message.en, /unexpected answer/);
  assert.equal(count('logout'), 1, 'the session is closed anyway');
  webuntis.intercept = (call) =>
    call.method === 'authenticate'
      ? new Response('', { status: 302, headers: { Location: 'https://elsewhere.example/' } })
      : undefined;
  await minute(29);
  assert.equal(count('authenticate'), 1);
  await minute();
  assert.equal(count('authenticate'), 2);
  assert.match(gladys.fake.connectionStatus.message.en, /unexpected answer/);
});

test('the time of the last attempt is written at most once a minute', async () => {
  const { store, app, clock } = await setup();
  const saves = store.saves;
  clock.advance(10_000);
  await app.persist();
  await app.persist();
  assert.equal(store.saves, saves, 'held back');
  clock.advance(60_000);
  await app.persist();
  assert.equal(store.saves, saves + 1);
});

test('nothing configured, or a server that is not a host name', async () => {
  const empty = await setup({ config: {} });
  assert.match(empty.gladys.fake.connectionStatus.message.en, /Fill in the WebUntis server/);
  await empty.gladys.fake.configUpdated({ ...CONFIG, server: 'user:pw@evil.example/x' });
  assert.match(empty.gladys.fake.connectionStatus.message.en, /not a host name/);
  assert.equal(webuntis.calls.length, 0);
  const widget = await empty.gladys.fake.widgetGet(WIDGETS.TIMETABLE);
  assert.deepEqual(validateWidgetContent(widget.data.content), []);
  const action = await empty.gladys.fake.sceneAction(SCENE_ACTIONS.GET_DAY, {});
  assert.equal(action.success, false);
});
