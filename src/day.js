// -----------------------------------------------------------------------------
// School days out of the lessons read: which day to show, its summary, its
// lines. Pure.
// -----------------------------------------------------------------------------

import { STATUSES } from './webuntis/model.js';
import { addDays, localParts } from './time.js';

/** Today's date in the school's time zone. */
export const todayOf = (now, timeZone) => localParts(now, timeZone).date;

export const lessonsOn = (lessons, date) => lessons.filter((l) => l.date === date);

const held = (lesson) => lesson.status !== STATUSES.CANCELLED;

/** The summary of the lessons of one day (sorted). */
export function summaryOf(dayLessons) {
  const kept = dayLessons.filter(held);
  const first = kept[0] ?? null;
  const last = kept.at(-1) ?? null;
  const firstPlanned = dayLessons[0] ?? null;
  return {
    count: kept.length,
    cancelled: dayLessons.filter((l) => l.status === STATUSES.CANCELLED).length,
    changed: dayLessons.filter((l) => l.status === STATUSES.CHANGED).length,
    exams: kept.filter((l) => l.exam).length,
    first,
    last,
    /** The first lesson planned is cancelled: the day starts later than usual. */
    lateStart: Boolean(first && firstPlanned && firstPlanned.startAt < first.startAt),
  };
}

/** The first date after `date` with a lesson held, or null. */
export function nextSchoolDay(lessons, date) {
  return lessons.find((l) => l.date > date && held(l))?.date ?? null;
}

/**
 * The date a widget or "read a school day" shows:
 * - `today`, `tomorrow`: that date;
 * - `next_school_day`: the first date after today with a lesson held;
 * - `auto`: today until its last lesson ends, then the next school day.
 * Falls back on today (or tomorrow) when no school day is in the reading.
 */
export function pickDate(choice, lessons, now, timeZone) {
  const today = todayOf(now, timeZone);
  if (choice === 'today') {
    return today;
  }
  if (choice === 'tomorrow') {
    return addDays(today, 1);
  }
  if (choice === 'next_school_day') {
    return nextSchoolDay(lessons, today) ?? addDays(today, 1);
  }
  const rest = lessonsOn(lessons, today).filter((l) => held(l) && l.endAt > now);
  if (rest.length > 0) {
    return today;
  }
  return nextSchoolDay(lessons, today) ?? today;
}

const STATUS_TEXT = {
  cancelled: { en: 'cancelled', fr: 'annulé' },
  changed: { en: 'changed', fr: 'modifié' },
  exam: { en: 'exam', fr: 'examen' },
};

/** "07:55–08:40 M (R101) · cancelled". */
export function lessonLine(lesson, language = 'en') {
  const parts = [`${lesson.start}–${lesson.end} ${lesson.subject || '?'}`];
  if (lesson.room) {
    parts[0] += ` (${lesson.room})`;
  }
  if (lesson.status !== STATUSES.NORMAL) {
    parts.push(STATUS_TEXT[lesson.status][language] ?? STATUS_TEXT[lesson.status].en);
  }
  if (lesson.exam && lesson.status !== STATUSES.CANCELLED) {
    parts.push(STATUS_TEXT.exam[language] ?? STATUS_TEXT.exam.en);
  }
  return parts.join(' · ');
}

/** Whole lines up to `max` characters, "…" when some were left out. */
export function joinLines(lines, max) {
  const kept = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > max - 2) {
      kept.push('…');
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join('\n');
}
