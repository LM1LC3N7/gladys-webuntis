// -----------------------------------------------------------------------------
// WebUntis JSON -> lessons. Pure; every WebUntis field name of a period is
// here. Ported from python-webuntis `objects.py` (PeriodObject: `code`,
// `type`, `lstext`, `substText`, `info`, the `orgid` of the original
// teachers / rooms / subjects) and `utils/datetime_utils.py` (dates and
// times as integers).
//
// Only what is shown is kept: subject, room, teacher, times, status and the
// school's texts. Never the class names, nor any pupil.
// -----------------------------------------------------------------------------

import { MAX_LESSONS } from '../constants.js';
import { dateOfUntis, timeOfUntis, zonedToInstant } from '../time.js';

/** objects.py PeriodObject.type: the lesson kinds. */
export const LESSON_TYPES = ['ls', 'oh', 'sb', 'bs', 'ex'];
export const STATUSES = { NORMAL: 'normal', CANCELLED: 'cancelled', CHANGED: 'changed' };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]+/g;

/** A school text: a string without control characters, cut. */
export function clean(value, max = 60) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const text = String(value).replace(CONTROL, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The elements of a period (`su`, `te`, `ro`): an array of objects, at most 10 kept. */
const elements = (value) => (Array.isArray(value) ? value.filter(isObject).slice(0, 10) : []);

/** The short names of elements, joined ("R101, R102"). */
const names = (list, key = 'name') =>
  [...new Set(list.map((e) => clean(e[key])).filter(Boolean))].join(', ').slice(0, 60);

/** An element replaced for this period (objects.py `original_*`: an `orgid` is there). */
const replaced = (list) =>
  list.some(
    (e) =>
      (e.orgid !== undefined && e.orgid !== null && e.orgid !== 0 && e.orgid !== e.id) ||
      (typeof e.orgname === 'string' && e.orgname !== '' && e.orgname !== e.name),
  );

/**
 * One period as a lesson, or null when it cannot be placed in time:
 * `{ key, id, date, start, end, startAt, endAt, subject, subjectName, room,
 *    teacher, originalRoom, originalTeacher, type, exam, status, text }`.
 */
export function lessonOf(raw, timeZone) {
  if (!isObject(raw)) {
    return null;
  }
  const date = dateOfUntis(raw.date);
  const start = timeOfUntis(raw.startTime);
  const end = timeOfUntis(raw.endTime);
  if (!date || !start || !end || end < start) {
    return null;
  }
  const id = Number.isInteger(raw.id) ? String(raw.id) : `${start}`;
  const subjects = elements(raw.su);
  const teachers = elements(raw.te);
  const rooms = elements(raw.ro);
  const code = raw.code === 'cancelled' || raw.code === 'irregular' ? raw.code : null;
  const type = LESSON_TYPES.includes(raw.lstype) ? raw.lstype : 'ls';
  const substText = clean(raw.substText, 200);
  const changed =
    code === 'irregular' ||
    replaced(teachers) ||
    replaced(rooms) ||
    replaced(subjects) ||
    substText !== '';
  const status =
    code === 'cancelled' ? STATUSES.CANCELLED : changed ? STATUSES.CHANGED : STATUSES.NORMAL;
  const text = [substText, clean(raw.lstext, 200), clean(raw.info, 200)]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 300);
  return {
    key: `${id}|${date}|${start}`,
    id,
    date,
    start,
    end,
    startAt: zonedToInstant(date, start, timeZone),
    endAt: zonedToInstant(date, end, timeZone),
    subject: names(subjects) || clean(raw.lstext, 40),
    subjectName: names(subjects, 'longname') || names(subjects),
    room: names(rooms),
    teacher: names(teachers),
    originalRoom: names(rooms, 'orgname'),
    originalTeacher: names(teachers, 'orgname'),
    type,
    exam: type === 'ex',
    status,
    text,
  };
}

/** What makes a change worth one event: a new value of any of these fires again. */
export const changeSignature = (lesson) =>
  [lesson.start, lesson.end, lesson.subject, lesson.room, lesson.teacher, lesson.text].join('|');

/** The answer of getTimetable as lessons: placed, deduplicated, sorted, bounded. */
export function lessonsOf(periods, timeZone) {
  const byKey = new Map();
  for (const raw of Array.isArray(periods) ? periods.slice(0, MAX_LESSONS * 2) : []) {
    const lesson = lessonOf(raw, timeZone);
    if (!lesson) {
      continue;
    }
    const known = byKey.get(lesson.key);
    // The same period twice (a class split in groups): a cancelled copy does
    // not hide a held one.
    if (!known || (known.status === STATUSES.CANCELLED && lesson.status !== STATUSES.CANCELLED)) {
      byKey.set(lesson.key, lesson);
    }
  }
  return [...byKey.values()]
    .sort(
      (a, b) =>
        a.startAt - b.startAt ||
        a.endAt - b.endAt ||
        (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0),
    )
    .slice(0, MAX_LESSONS);
}
