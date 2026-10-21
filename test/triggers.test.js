// -----------------------------------------------------------------------------
// Readings -> scene events, the persisted memory, the widget. Pure.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_EVENTS_PER_READING, PACING, SCENE_TRIGGERS } from '../src/constants.js';
import { dayStartEvent, pruneAnnounced, readingEvents, safe } from '../src/triggers.js';
import { markHasher, normalizeMemory, serializeMemory } from '../src/store.js';
import { lessonsOf } from '../src/webuntis/model.js';
import { messageWidget, timetableWidget } from '../src/widget.js';
import { period } from './helpers/fakeWebUntis.js';

const BERLIN = 'Europe/Berlin';
const NOW = Date.parse('2026-10-21T04:30:00Z');
const hash = markHasher('ab'.repeat(32));
const H = 'f'.repeat(32);

test('values of an event: never undefined, NaN or Infinity', () => {
  assert.equal(safe(undefined), null);
  assert.equal(safe(Number.NaN), null);
  assert.equal(safe(Infinity), null);
  assert.equal(safe(0), 0);
  assert.equal(safe(false), false);
  assert.equal(safe('x'.repeat(400)).length, 300);
});

test('baseline remembers without firing; past lessons never fire; capped per reading', () => {
  const lessons = lessonsOf(
    [
      period({ id: 1, start: 500, end: 545, code: 'cancelled' }), // ended at 05:45
      ...Array.from({ length: 30 }, (_, i) =>
        period({ id: 100 + i, date: 20261022, start: 800 + i, end: 845, code: 'cancelled' }),
      ),
    ],
    BERLIN,
  );
  const announced = new Map();
  const baseline = readingEvents(lessons, {
    announced,
    now: NOW,
    timeZone: BERLIN,
    hash,
    baseline: true,
  });
  assert.equal(baseline.events.length, 0);
  assert.equal(baseline.marks.size, 30, 'the past lesson is not even remembered');
  const fresh = readingEvents(lessons, { announced: new Map(), now: NOW, timeZone: BERLIN, hash });
  assert.equal(fresh.events.length, MAX_EVENTS_PER_READING);
  assert.ok(fresh.events.every((e) => e.key === SCENE_TRIGGERS.CANCELLED));
});

test('held again, then cancelled again: fires a second time', () => {
  const cancelled = lessonsOf([period({ id: 1, code: 'cancelled' })], BERLIN);
  const held = lessonsOf([period({ id: 1 })], BERLIN);
  const announced = new Map();
  const apply = (r) => {
    r.unmarks.forEach((k) => announced.delete(k));
    r.marks.forEach((v, k) => announced.set(k, v));
    return r.events.length;
  };
  const ctx = { announced, now: NOW, timeZone: BERLIN, hash };
  assert.equal(apply(readingEvents(cancelled, ctx)), 1);
  assert.equal(apply(readingEvents(cancelled, ctx)), 0);
  assert.equal(apply(readingEvents(held, ctx)), 0);
  assert.equal(apply(readingEvents(cancelled, ctx)), 1);
});

test('the memory of past days is forgotten', () => {
  const announced = new Map([
    [`c|${H}`, '2026-10-20|'],
    [`x|${H}`, `2026-10-21|${H}`],
  ]);
  pruneAnnounced(announced, '2026-10-21');
  assert.deepEqual([...announced.keys()], [`x|${H}`]);
});

test('"school day starts": in its window only, not on a day without lessons', () => {
  const lessons = lessonsOf([period({ id: 1, start: 800, end: 845 })], BERLIN);
  const at = Date.parse('2026-10-21T05:30:00Z'); // 07:30, 30 minutes before
  const ctx = { timeZone: BERLIN, notice: 30, lastDate: null };
  assert.equal(dayStartEvent(lessons, { ...ctx, now: at - 1 }), null);
  assert.equal(dayStartEvent(lessons, { ...ctx, now: at }).date, '2026-10-21');
  assert.equal(dayStartEvent(lessons, { ...ctx, now: at + PACING.DAY_START_GRACE }), null);
  assert.equal(dayStartEvent(lessons, { ...ctx, now: at, lastDate: '2026-10-21' }), null);
  assert.equal(dayStartEvent([], { ...ctx, now: at }), null);
});

test('the persisted memory is repaired and bounded', () => {
  const now = NOW;
  const memory = normalizeMemory(
    {
      salt: 'not hex',
      lastAttemptAt: now + 3600_000,
      pause: { until: now + 30 * 24 * 3600_000, reason: 'x' },
      refused: { hash: 'zz' },
      announced: [
        [`c|${H}`, '2026-10-21|'],
        ['k', 'v'],
        ['c|1|2026-10-21|08:00', '2026-10-21'],
        'junk',
        [1, 2],
      ],
      dayStart: '21.10.2026',
      primed: 'yes',
    },
    now,
  );
  assert.match(memory.salt, /^[0-9a-f]{64}$/);
  assert.equal(memory.lastAttemptAt, now, 'a time in the future counts as now');
  assert.equal(memory.pause.until, now + PACING.PAUSE_MAX);
  assert.equal(memory.pause.reason, 'rate_limited');
  assert.equal(memory.refused, null);
  assert.deepEqual([...memory.announced], [[`c|${H}`, '2026-10-21|']], 'only hashed marks');
  assert.equal(memory.dayStart, null);
  assert.equal(memory.primed, false);
  assert.deepEqual(normalizeMemory(serializeMemory(memory), now), memory);
  assert.equal(normalizeMemory(null, now).pause, null);
});

test('the widget stays within the vocabulary with a long day', () => {
  const lessons = lessonsOf(
    Array.from({ length: 14 }, (_, i) =>
      period({
        id: i,
        start: 700 + i * 50,
        end: 745 + i * 50,
        subject: `Subject with a very long name ${i}`,
        code: i === 2 ? 'cancelled' : i === 3 ? 'irregular' : undefined,
      }),
    ).filter((p) => p.startTime % 100 < 60 && p.endTime % 100 < 60),
    BERLIN,
  );
  const content = timetableWidget({ date: '2026-10-21', lessons, readAt: '06:30' });
  assert.deepEqual(validateWidgetContent(content), []);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.ok(rows.length <= 10);
  assert.deepEqual(validateWidgetContent(timetableWidget({ date: '2026-10-25', lessons: [] })), []);
  assert.deepEqual(validateWidgetContent(messageWidget({ en: 'x'.repeat(500), fr: 'y' })), []);
});
