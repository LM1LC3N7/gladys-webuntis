// -----------------------------------------------------------------------------
// The dashboard widget "School timetable". Pure. No button: the integration
// only reads.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WEEKDAYS, WIDGET_ROWS } from './constants.js';
import { T, dayTitle } from './i18n.js';
import { summaryOf } from './day.js';
import { weekdayOf } from './time.js';
import { STATUSES } from './webuntis/model.js';

const cut = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
/** A plain or multi-language text, cut to `max` characters per language. */
const bound = (text, max) =>
  typeof text === 'string'
    ? cut(text, max)
    : Object.fromEntries(Object.entries(text).map(([lang, value]) => [lang, cut(value, max)]));

/** A body-only content: the empty or degraded states. */
export function messageWidget(text, { ttl = 300 } = {}) {
  return {
    ttl_seconds: ttl,
    components: [
      { type: 'text', text: T.widget.title, variant: 'heading' },
      { type: 'text', text: bound(text, 300), variant: 'body' },
    ],
  };
}

function row(lesson) {
  const label = cut(`${lesson.start} ${lesson.subject || '?'}`, 40);
  if (lesson.status === STATUSES.CANCELLED) {
    return { label, value: T.widget.cancelled, icon: 'x-circle', color: WIDGET_COLORS.DANGER };
  }
  const value = cut([lesson.room, lesson.teacher].filter(Boolean).join(' · ') || '—', 40);
  if (lesson.status === STATUSES.CHANGED) {
    return { label, value, icon: 'alert-triangle', color: WIDGET_COLORS.WARNING };
  }
  if (lesson.exam) {
    return { label, value, icon: 'edit-3', color: WIDGET_COLORS.INFO };
  }
  return { label, value, icon: 'book-open', color: WIDGET_COLORS.NEUTRAL };
}

/**
 * The lessons of one day: its title, a summary, up to 10 rows (the last
 * counting the rest), the time of the reading.
 */
export function timetableWidget({ date, lessons, readAt, ttl = 300 }) {
  const components = [
    { type: 'text', text: dayTitle(date, WEEKDAYS.indexOf(weekdayOf(date))), variant: 'heading' },
  ];
  // The budget allows two texts: the heading and one more, carrying the time of the reading.
  const read = readAt ? T.widget.readAt(readAt) : null;
  const withRead = (text, separator) =>
    read
      ? { en: `${text.en}${separator}${read.en}`, fr: `${text.fr}${separator}${read.fr}` }
      : text;
  if (lessons.length === 0) {
    components.push({ type: 'text', text: withRead(T.widget.noLessons, '\n'), variant: 'body' });
  } else {
    const summary = summaryOf(lessons);
    components.push({
      type: 'text',
      text: bound(withRead(T.widget.summary(summary), ' · '), 80),
      variant: 'caption',
    });
    const shown = lessons.length > WIDGET_ROWS ? lessons.slice(0, WIDGET_ROWS - 1) : lessons;
    const rows = shown.map(row);
    if (lessons.length > shown.length) {
      rows.push({
        label: T.widget.more(lessons.length - shown.length),
        value: '…',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items: rows });
  }
  return { ttl_seconds: Math.max(60, Math.min(3600, Math.round(ttl))), components };
}
