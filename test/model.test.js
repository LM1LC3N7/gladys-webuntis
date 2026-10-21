// -----------------------------------------------------------------------------
// WebUntis periods -> lessons, the times of the school, the days. Pure.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, clean, lessonOf, lessonsOf } from '../src/webuntis/model.js';
import {
  addDays,
  dateOfUntis,
  localParts,
  timeOfUntis,
  weekdayOf,
  zonedToInstant,
} from '../src/time.js';
import { lessonLine, pickDate, summaryOf } from '../src/day.js';
import { period } from './helpers/fakeWebUntis.js';

const BERLIN = 'Europe/Berlin';

test('WebUntis dates and times (datetime_utils.py), bad ones refused', () => {
  assert.equal(dateOfUntis(20261021), '2026-10-21');
  assert.equal(dateOfUntis('20240229'), '2024-02-29');
  assert.equal(dateOfUntis(20260230), null);
  assert.equal(dateOfUntis(2026102), null);
  assert.equal(dateOfUntis(null), null);
  assert.equal(timeOfUntis(755), '07:55');
  assert.equal(timeOfUntis(0), '00:00');
  assert.equal(timeOfUntis(1260), null);
  assert.equal(timeOfUntis(2400), null);
  assert.equal(timeOfUntis('8.5'), null);
});

test('wall times of the school, across the DST change and around midnight east and west', () => {
  assert.equal(zonedToInstant('2026-10-21', '08:00', BERLIN), Date.parse('2026-10-21T06:00:00Z'));
  // The Sunday of the change to winter time, and the Monday after it.
  assert.equal(zonedToInstant('2026-10-26', '08:00', BERLIN), Date.parse('2026-10-26T07:00:00Z'));
  assert.equal(zonedToInstant('2026-03-30', '08:00', BERLIN), Date.parse('2026-03-30T06:00:00Z'));
  // 23:30 UTC is already the next day in Helsinki, still the same in Lisbon.
  const late = Date.parse('2026-10-21T23:30:00Z');
  assert.equal(localParts(late, 'Europe/Helsinki').date, '2026-10-22');
  assert.equal(localParts(late, 'Europe/Lisbon').date, '2026-10-22');
  assert.equal(localParts(Date.parse('2026-10-21T22:30:00Z'), 'Europe/Lisbon').date, '2026-10-21');
  assert.equal(localParts(Date.parse('2026-10-21T22:30:00Z'), BERLIN).date, '2026-10-22');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(weekdayOf('2026-10-21'), 'wed');
  assert.equal(weekdayOf('2026-10-25'), 'sun');
});

test('a period: status, kind, names, texts (objects.py PeriodObject)', () => {
  const normal = lessonOf(period({ id: 1 }), BERLIN);
  assert.equal(normal.status, STATUSES.NORMAL);
  assert.equal(normal.subject, 'M');
  assert.equal(normal.subjectName, 'Mathematik');
  assert.equal(normal.room, 'R101');
  assert.equal(normal.teacher, 'MUE');
  assert.equal(normal.start, '08:00');
  assert.equal(normal.startAt, Date.parse('2026-10-21T06:00:00Z'));
  assert.equal(lessonOf(period({ id: 2, code: 'cancelled' }), BERLIN).status, STATUSES.CANCELLED);
  assert.equal(lessonOf(period({ id: 3, code: 'irregular' }), BERLIN).status, STATUSES.CHANGED);
  const moved = lessonOf(period({ id: 4, room: 'R9', orgRoom: 'R101' }), BERLIN);
  assert.equal(moved.status, STATUSES.CHANGED);
  assert.equal(moved.originalRoom, 'R101');
  const text = lessonOf(period({ id: 5, substText: 'Aufgaben\nim Moodle' }), BERLIN);
  assert.equal(text.status, STATUSES.CHANGED);
  assert.equal(text.text, 'Aufgaben im Moodle', 'no control character kept');
  assert.equal(lessonOf(period({ id: 6, lstype: 'ex' }), BERLIN).exam, true);
  assert.equal(lessonOf(period({ id: 7, lstype: 'xx' }), BERLIN).type, 'ls');
  assert.equal(lessonOf({ id: 8, date: 20261021, startTime: 900, endTime: 800 }, BERLIN), null);
  assert.equal(lessonOf({ id: 9, date: 'x', startTime: 800, endTime: 845 }, BERLIN), null);
  assert.equal(lessonOf(null, BERLIN), null);
  assert.equal(lessonOf([], BERLIN), null);
  // No class name is ever kept.
  assert.equal(JSON.stringify(normal).includes('kl'), false);
});

test('hostile answers: odd shapes, prototype keys, huge lists stay bounded', () => {
  const raw = JSON.parse(
    '{"id":1,"date":20261021,"startTime":800,"endTime":845,"su":[{"name":{"x":1}},"str",null],"__proto__":{"polluted":true},"ro":"R1"}',
  );
  const lesson = lessonOf(raw, BERLIN);
  assert.equal(lesson.subject, '');
  assert.equal(lesson.room, '');
  assert.equal({}.polluted, undefined);
  const many = Array.from({ length: 5000 }, (_, i) => period({ id: i, start: 800, end: 845 }));
  assert.equal(lessonsOf(many, BERLIN).length, 1000);
  assert.deepEqual(lessonsOf('nope', BERLIN), []);
  assert.equal(clean('a'.repeat(100), 10).length, 10);
});

test('the same period twice: a held copy wins over a cancelled one; sorted by time', () => {
  const lessons = lessonsOf(
    [
      period({ id: 2, start: 900, end: 945 }),
      period({ id: 1, start: 800, end: 845, code: 'cancelled' }),
      period({ id: 1, start: 800, end: 845 }),
    ],
    BERLIN,
  );
  assert.deepEqual(
    lessons.map((l) => [l.id, l.status]),
    [
      ['1', 'normal'],
      ['2', 'normal'],
    ],
  );
});

test('the day shown and its summary', () => {
  const lessons = lessonsOf(
    [
      period({ id: 1, start: 800, end: 845, code: 'cancelled' }),
      period({ id: 2, start: 850, end: 935, lstype: 'ex' }),
      period({ id: 3, date: 20261023, start: 800, end: 845 }),
    ],
    BERLIN,
  );
  const morning = Date.parse('2026-10-21T05:00:00Z');
  assert.equal(pickDate('auto', lessons, morning, BERLIN), '2026-10-21');
  assert.equal(pickDate('auto', lessons, Date.parse('2026-10-21T08:00:00Z'), BERLIN), '2026-10-23');
  assert.equal(pickDate('next_school_day', lessons, morning, BERLIN), '2026-10-23');
  assert.equal(pickDate('tomorrow', lessons, morning, BERLIN), '2026-10-22');
  const summary = summaryOf(lessons.filter((l) => l.date === '2026-10-21'));
  assert.equal(summary.count, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.exams, 1);
  assert.equal(summary.lateStart, true);
  assert.equal(lessonLine(lessons[1], 'fr'), '08:50–09:35 M (R101) · examen');
});

test('review M6: an absent time or date is not midnight', () => {
  for (const value of [null, undefined, '', true, false, ' ', '7:55']) {
    assert.equal(timeOfUntis(value), null, String(value));
    assert.equal(dateOfUntis(value), null, String(value));
  }
  assert.equal(timeOfUntis('755'), '07:55');
  assert.equal(lessonOf({ id: 1, date: 20261021, startTime: null, endTime: 845 }, BERLIN), null);
});
