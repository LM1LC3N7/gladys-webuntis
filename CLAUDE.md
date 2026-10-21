# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `provider` (no device): a
Node.js service (Node 22+, ESM, no build step) in its own sandboxed Docker
container, talking to Gladys through `@gladysassistant/integration-sdk`
(v0.15). It reads a **WebUntis** school timetable, read only, through the
JSON-RPC interface of the school's server, ported from python-webuntis
(BSD-3-Clause, `THIRD_PARTY_NOTICES.md`). Unofficial: not affiliated with
Untis GmbH. Same shape as `gladys-todoist`.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` (Node 22 and 24) and `audit` before every
commit.

## Architecture

```
index.js                  SDK wiring only (handlers registered before connect())
src/app.js                WebUntisApp: lifecycle, scheduler, reading, status, triggers,
                          scene action, widget, test button
src/webuntis/client.js    JSON-RPC client (python-webuntis remote.py, session.py)
src/webuntis/model.js     periods -> lessons (objects.py); every period field name is here
src/day.js                the day shown, summary, lines (pure)
src/triggers.js           readings and the clock -> scene events (pure)
src/widget.js             the "timetable" widget (pure)
src/store.js              the /data file (normalized, bounded)
src/time.js               wall times in an IANA zone, WebUntis dates and times (pure)
src/http.js               the only network access: bounded size and time, no redirect
src/config.js, constants.js, i18n.js
scripts/cover.mjs         cover.png (800 × 534), plain Node
test/helpers/             a fake WebUntis behind fetch, fake timers and clock
```

## Rules

- **Read only.** No device, no command, no widget button.
- **Minors' data.** Never log, show in a status or an error, nor write to
  `/data`: the username (often the pupil's name), the password, the school,
  a class name, a pupil, a lesson. Logs carry counts and error codes only.
  `getTimetable` asks for class ids only (`klasseFields: ['id']`).
- **The password** is a `secret` field: "kept by Gladys in its database, never
  shown again", never "encrypted" (a test refuses the word). Sent only in the
  `authenticate` request, over HTTPS, never after a redirection
  (`redirect: 'manual'`).
- **Be gentle with the school's server.** One reading per `poll_minutes`
  (never below 15); the last attempt is kept in `/data` (written at most once
  a minute) and nothing reads sooner: restart, `connected`, unchanged config,
  test button. A reading in progress is joined, never doubled. 429/5xx:
  persisted pause, 60 s to 6 h. A refused login (`-8504`) or unknown school
  (`-8500`): persisted stop for these credentials (HMAC of the refused ones
  only, erased at the first success); the test button may try once more after
  the interval. Never a second login in the same reading.
- **Generations.** A reading of a former configuration publishes nothing and
  sets no status (checked after every await).
- **Events**: one per transition, never on the first reading of a timetable
  (`primed` in `/data`), never for a past lesson, at most 20 per kind per
  reading; every value a string, a finite number, a boolean or null.
- **Keys are forever**: manifest keys (`src/constants.js`), trigger fields and
  variables, action outputs, widget settings.
- **Versions belong to the Release workflow**; 0.1.0 was set by hand for the
  first milestone. Every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` in sync.
  Comments explain why, in English. Tests never touch the network.
