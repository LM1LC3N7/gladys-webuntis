# gladys-webuntis

[Gladys Assistant](https://gladysassistant.com) external integration for
**WebUntis** school timetables: the lessons of the day on the dashboard, scene
triggers "lesson cancelled", "lesson changed" and "school day starts", and a
scene action "read a school day". Read only. **Unofficial, not affiliated with
Untis GmbH. Never tested with a real account.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (WebUntisApp)
                 ├─ src/webuntis/client.js   JSON-RPC: authenticate, getKlassen, getTimetable, logout
                 ├─ src/webuntis/model.js    periods -> lessons (pure)
                 ├─ src/day.js               the day shown, its summary and lines (pure)
                 ├─ src/triggers.js          readings and the clock -> scene events (pure)
                 ├─ src/widget.js            the timetable widget (pure)
                 ├─ src/store.js             /data: last attempt, pause, refusal, memory of the events
                 └─ src/http.js              the only network access (bounded, no redirect)
```

- **Account**: the JSON-RPC interface of the school's WebUntis server
  (`https://<server>/WebUntis/jsonrpc.do?school=<school>`), with a pupil or
  teacher account; a class name for an account without a timetable of its own.
  The password is a `secret` field: kept by Gladys in its database, never shown
  again, sent only to that server in the `authenticate` request.
- **Reading**: one short session every `poll_minutes` (30 by default, 15 at
  least): `authenticate`, `getTimetable` from today to `lookahead_days`, `logout`.
  The time of the last attempt is kept in `/data`: no restart, reconnection,
  unchanged configuration or test button reads sooner. 429 and 5xx pause the
  readings (persisted, 6 h at most). A refused login (`-8504`) or an unknown
  school (`-8500`) stops everything for these credentials (persisted, salted
  fingerprint of the refused credentials only, erased at the first success).
- **Triggers**: a reading is compared with the memory of what was announced
  (persisted, ids and dates only): a cancellation fires once, a change once per
  new value; the first reading of a timetable fires nothing. "School day starts"
  is a local minute tick on the lessons read.
- **Privacy**: no log line, status, error or file in `/data` names the account,
  the school, a class, a pupil or a lesson; class names are never even read.

Ported from [python-webuntis](https://github.com/python-webuntis/python-webuntis)
(BSD-3-Clause): see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), shipped in
the image.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit                                   # npm audit --omit=dev
npx github:GladysAssistant/integration-store .  # store admission checks
node scripts/cover.mjs cover.png                # regenerate the cover (800 × 534)
```

The tests run against the SDK's fake Gladys and a fake WebUntis server
(`test/helpers/fakeWebUntis.js`) shaped after python-webuntis and its test data.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the version
in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds the
multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0 (see `LICENSE`). Contains logic ported from python-webuntis,
BSD-3-Clause (see `THIRD_PARTY_NOTICES.md`). WebUntis and Untis are trademarks
of Untis GmbH.
