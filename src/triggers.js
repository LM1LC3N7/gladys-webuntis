// -----------------------------------------------------------------------------
// Readings -> scene events. Pure.
//
// - "Lesson cancelled": once per lesson, the first time a reading sees it
//   cancelled (again after it was held, then cancelled once more).
// - "Lesson changed": once per lesson and per new value (another room,
//   teacher, time or substitution text).
// - "School day starts": once a day, `notice` minutes before the first lesson
//   held, on the minute tick (no request).
// The first reading without any memory fires nothing: it only remembers.
// Past lessons never fire. Every value of an event is a string, a finite
// number, a boolean or null (never undefined, never NaN).
// -----------------------------------------------------------------------------

import {
  MAX_ANNOUNCED,
  MAX_EVENTS_PER_READING,
  MAX_TEXT,
  PACING,
  SCENE_TRIGGERS,
} from './constants.js';
import { STATUSES, changeSignature } from './webuntis/model.js';
import { lessonsOn, summaryOf, todayOf } from './day.js';
import { daysBetween, weekdayOf } from './time.js';

/** A value a scene event accepts: undefined, NaN and the infinities become null. */
export function safe(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return String(value).slice(0, MAX_TEXT);
}

const flat = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, safe(v)]));

const dayKind = (days) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'later');

/** The variables of "lesson cancelled" and "lesson changed". */
export function lessonData(lesson, today) {
  const days = daysBetween(today, lesson.date);
  return flat({
    subject: lesson.subject,
    subject_name: lesson.subjectName,
    date: lesson.date,
    weekday: weekdayOf(lesson.date),
    day: dayKind(days),
    days_ahead: days,
    start: lesson.start,
    end: lesson.end,
    room: lesson.room,
    teacher: lesson.teacher,
    original_room: lesson.originalRoom,
    original_teacher: lesson.originalTeacher,
    text: lesson.text,
    exam: lesson.exam,
  });
}

/**
 * The events of a reading. `announced` maps a mark ("c|<hash of the lesson>"
 * for a cancellation, "x|<hash of the lesson>" for a change) to its value ("<date>|"
 * plus, for a change, the hash of what changed): `hash` is a salted HMAC, so
 * /data never holds a subject, a room, a teacher, a time or a school text; `baseline` (no
 * memory yet) records without firing. Resolves `{ events, marks, unmarks }`:
 * the marks to set and to remove.
 */
export function readingEvents(lessons, { announced, now, timeZone, hash, baseline = false }) {
  const today = todayOf(now, timeZone);
  const events = [];
  const marks = new Map();
  const unmarks = [];
  const fired = { cancelled: 0, changed: 0 };
  for (const lesson of lessons) {
    if (lesson.endAt <= now) {
      continue;
    }
    const lessonHash = hash(lesson.key);
    const cancelKey = `c|${lessonHash}`;
    const changeKey = `x|${lessonHash}`;
    if (lesson.status === STATUSES.CANCELLED) {
      if (!announced.has(cancelKey)) {
        marks.set(cancelKey, `${lesson.date}|`);
        if (!baseline && fired.cancelled < MAX_EVENTS_PER_READING) {
          fired.cancelled += 1;
          events.push({ key: SCENE_TRIGGERS.CANCELLED, data: lessonData(lesson, today) });
        }
      }
      continue;
    }
    if (announced.has(cancelKey)) {
      // Held again: a later cancellation is news once more.
      unmarks.push(cancelKey);
    }
    if (lesson.status === STATUSES.CHANGED) {
      const signature = `${lesson.date}|${hash(changeSignature(lesson))}`;
      if (announced.get(changeKey) !== signature) {
        marks.set(changeKey, signature);
        if (!baseline && fired.changed < MAX_EVENTS_PER_READING) {
          fired.changed += 1;
          events.push({ key: SCENE_TRIGGERS.CHANGED, data: lessonData(lesson, today) });
        }
      }
    }
  }
  return { events, marks, unmarks };
}

/** The date a mark belongs to ("c|..." keeps the date, "x|..." starts its value with it). */
const markDate = (value) => String(value).slice(0, 10);

/** Forget the marks of past days, and the oldest beyond MAX_ANNOUNCED. */
export function pruneAnnounced(announced, today) {
  for (const [key, value] of announced) {
    if (markDate(value) < today) {
      announced.delete(key);
    }
  }
  while (announced.size > MAX_ANNOUNCED) {
    announced.delete(announced.keys().next().value);
  }
}

/**
 * "School day starts": the event of today when the clock is between the
 * notice time and the notice time plus the grace, and today was not
 * announced yet. Resolves `{ event, date }` or null.
 */
export function dayStartEvent(lessons, { now, timeZone, notice, lastDate }) {
  const today = todayOf(now, timeZone);
  if (lastDate === today) {
    return null;
  }
  const summary = summaryOf(lessonsOn(lessons, today));
  if (!summary.first) {
    return null;
  }
  const at = summary.first.startAt - notice * 60_000;
  if (now < at || now >= at + PACING.DAY_START_GRACE) {
    return null;
  }
  return {
    date: today,
    event: {
      key: SCENE_TRIGGERS.DAY_START,
      data: flat({
        date: today,
        weekday: weekdayOf(today),
        first_start: summary.first.start,
        first_subject: summary.first.subject,
        first_room: summary.first.room,
        last_end: summary.last.end,
        lesson_count: summary.count,
        cancelled_count: summary.cancelled,
        changed_count: summary.changed,
        exam_count: summary.exams,
        late_start: summary.lateStart,
        minutes_before: notice,
      }),
    },
  };
}
