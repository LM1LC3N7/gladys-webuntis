# TODO — WebUntis v1

Handoff document: what is done, what was decided, what comes next. Keep it up
to date at the end of every milestone.

## Status

- [x] **Milestone 1 — core** (2026-10-21): JSON-RPC client ported from
      python-webuntis (authenticate, getKlassen, getTimetable with options,
      logout, error codes), own timetable or a class by name, lessons with
      cancellations, substitutions and exams, widget, three scene triggers,
      one scene action, test button, pacing and persisted pause/stop in
      `/data`, docs en/fr, cover. Tested against made-up answers only.

## Before announcing

- [ ] Test on a real Gladys 5.1+ with a real WebUntis pupil account (and a
      parent account with a class name).
- [ ] Review (effort `high`), then the store validator (cannot be run from the
      development session) and the CI on Node 22 and 24.
- [ ] Docker image built by the CI (no Docker on the development PC).

## To confirm with a real account (built blind)

- [ ] The element arrays of `getTimetable` with `*Fields` options carry `name`,
      `longname`, `orgid` and `orgname` as assumed in `src/webuntis/model.js`.
- [ ] `-8500` is the code of an unknown school name, and `-8509` the code of a
      missing right.
- [ ] The `personType` of a parent account (assumed not 2 nor 5) and whether a
      parent account may read the class timetable.
- [ ] `lstype: 'ex'` really marks exams in the timetable of the schools using
      them.
- [ ] The server accepts the honest `client` name `gladys-webuntis`.

## Decisions

- Version 0.1.0 set by hand in `package.json`, `package-lock.json`, the
  manifest and the `docker_image` tag; the first Release (patch) gives 0.1.1.
- Reference: python-webuntis (BSD-3-Clause, LICENSE read in the repository,
  commit `172ddd1`, PyPI 0.1.25 of 2026-07-08). The BSD notice is reproduced in
  full in `THIRD_PARTY_NOTICES.md`, copied into the image.
- Neighbour module: `gladys-todoist` (provider, widget, triggers, scene
  actions): same shape.
- Provider without device: nothing to discover, the status is republished at
  each `connected`.
- JSON-RPC only (the interface python-webuntis uses). The WebUntis web REST
  API (homework, messages, absences) is undocumented and used by the official
  apps: not used, no imitation of an app. So no homework in v1, despite the
  initial idea; noted in the docs' limits.
- Pacing: 30 minutes by default, 15 at least, 240 at most; one session per
  reading (login, timetable, logout), never kept between readings, never a
  second login in a reading. The class list (only when a class name is set)
  is read once a day.
- Refused credentials: no automatic new try ever (a WebUntis account can lock
  after several failures); a new try only on the test button, no sooner than
  the interval, or at once with other credentials. The refusal is kept as an
  HMAC (random salt of the state file) of the refused credentials, erased at
  the first success; never any fingerprint of working credentials.
- Configuration errors (parent account without class, unknown class, no right,
  no WebUntis at the address): no new try until the configuration changes
  (or the test button, after the interval).
- The timetable itself is never written to `/data` (minors' data): after a
  restart the widget waits for the next reading, which comes no sooner than
  the interval.
- Triggers: "lesson cancelled" once per lesson (again if it is held then
  cancelled again), "lesson changed" once per new value (room, teacher, times,
  subject, text), "school day starts" once a day at `notice` minutes before
  the first lesson held, within 5 minutes; the memory is persisted with a
  `primed` flag so a restart never fires the whole week again.
- Trigger fields: equality only in the core, so `subject` is the short name
  and the "when" filter a `multi_select` (today, tomorrow, later).
- Time zone: a select (Berlin by default); WebUntis times are wall times of
  the school, never read in the container's UTC.
- Events found while Gladys is disconnected are lost (the publication fails);
  the next readings go on.
- No German texts yet: the manifest and runtime texts are English and French,
  like the other modules.

## Ideas

- Several timetables (siblings) in one integration.
- Holidays (`getHolidays`) on the widget ("holidays until …").
- An "exam tomorrow" trigger.
- A `calendar` sibling (Gladys 5.2): the lessons in the Gladys calendar.
