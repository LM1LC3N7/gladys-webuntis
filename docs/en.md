# WebUntis

Unofficial connector, not affiliated with Untis GmbH. It reads a **WebUntis**
school timetable, read only, and brings it to Gladys: a dashboard widget, scene
triggers when a lesson is cancelled or changed and when the school day starts,
and a scene action to read a school day.

**Never tested with a real account**: it was built from the WebUntis JSON-RPC
interface as the open-source library python-webuntis uses it. Please report
what works and what does not.

## What you need

- The address of your school's WebUntis page, for example
  `https://neilo.webuntis.com/WebUntis/?school=demo-school#/basic/login`.
- A WebUntis **pupil or teacher** account of that school (username and
  password). A parent account has no timetable of its own: enter the class
  name too (see below).

## Configuration

| Field                               | What to enter                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| WebUntis server                     | The host of the page (`neilo.webuntis.com`); the whole address can be pasted. Always reached over HTTPS. |
| School name                         | The `school=` part of the address (`demo-school`).                                                       |
| Username, password                  | The WebUntis account.                                                                                    |
| Class (optional)                    | Empty: the account's own timetable. A class name as WebUntis shows it (`7b`): that class's timetable.    |
| Time zone of the school             | Berlin by default (Vienna, Zurich and others offered).                                                   |
| Reading interval                    | 30 minutes by default, 15 at least.                                                                      |
| Days read ahead                     | 7 by default (today and the next week).                                                                  |
| "School day starts": minutes before | 60 by default.                                                                                           |

The password is kept by Gladys in its database, never shown again, and sent
only to the school's WebUntis server, in the login request. The integration
never logs the username, the password, the school, a class or a pupil's name,
nor the lessons: only counts and error codes.

## How it reads

Every reading is one short session: login, the timetable from today to the
days ahead, logout. To be gentle with the school's server, which every pupil
shares:

- one reading every 30 minutes by default, never more often than every 15;
- nothing reads sooner: neither the "Test the connection" button, nor a
  restart of the integration, nor a reconnection to Gladys, nor saving an
  unchanged configuration (the time of the last attempt is kept);
- when the server answers "too many requests" (429) or has a problem (5xx),
  the readings pause (its Retry-After, or 30 minutes; 6 hours at most), also
  across a restart;
- when WebUntis **refuses the username or the password**, nothing more is sent
  with them, even after a restart, until you change them. The test button may
  try once more, no sooner than the interval. Several failed logins can lock a
  WebUntis account: check the password on the school's page first.

## Dashboard widget "School timetable"

The lessons of one day: time, subject, room and teacher; a cancelled lesson in
red, a changed one in orange, an exam in blue; the time of the reading. Choose
the day shown: today then the next school day (default), today, tomorrow, or
the next school day.

## Scene triggers

| Trigger           | When                                                                                                           | Filters                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Lesson cancelled  | A lesson of the coming days is now cancelled.                                                                  | Subject (short name), when (today, tomorrow, later). |
| Lesson changed    | A lesson has a substitution: another teacher, room or time, or a text of the school. Again on each new change. | Subject, when.                                       |
| School day starts | Once a school day, the configured minutes before the first lesson held.                                        | Days of the week.                                    |

A change is seen at the next reading (every 30 minutes by default), not live.
The first reading after the configuration only remembers the timetable: it
fires nothing. Past lessons never fire.

The variables of the triggers are used as `{{triggerEvent.data.<key>}}`, for
example `{{triggerEvent.data.subject}}`, `{{triggerEvent.data.start}}`,
`{{triggerEvent.data.room}}`, `{{triggerEvent.data.text}}`, or for "school day
starts" `{{triggerEvent.data.first_start}}` and
`{{triggerEvent.data.late_start}}` (true when the first lesson is cancelled).

## Scene action "Read a school day"

The lessons of a day from the last reading (no new request): date, lessons
held, cancelled, changed, exams, first start, first subject, end of the day,
the list one lesson per line. Handy for a morning message.

## Limits

- Read only: no homework, no messages, no absences (they are not in the
  JSON-RPC interface this integration uses).
- One timetable per integration.
- A lesson changed a few minutes before it starts may be seen after it
  started (the interval).
- Some schools disable the JSON-RPC interface or give pupils no right to read
  their timetable through it: the status then says so.
