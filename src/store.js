// -----------------------------------------------------------------------------
// What must survive a restart, in /data (the only writable place of the
// container), so that a restart never reads the school's server before its
// time and never tries a refused password again:
// - `lastAttemptAt`: the time of the last reading attempt;
// - `pause`: the end of a pause asked by the server (429, 5xx);
// - `refused`: the fingerprint (HMAC with a random salt of this file) of the
//   credentials WebUntis refused, erased at the first successful login.
//   Never any fingerprint of credentials that worked;
// - `scope`: a fingerprint of the timetable read (server, school, account,
//   class; no password), so that the memory below belongs to it;
// - `announced`: the lesson changes already announced (lesson ids, dates and
//   the school's short names), `dayStart`: the last day announced, and
//   `primed`: this timetable was read once (its first reading fires nothing).
// No timetable, no name, no password, no session. Bounded when read back.
// The file is readable by the container user only (0600).
// -----------------------------------------------------------------------------

import { createHmac, randomBytes } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { MAX_ANNOUNCED, PACING } from './constants.js';

export const STATE_FILE = '/data/webuntis-state.json';

export function fileStore(path = STATE_FILE) {
  // One write at a time: two saves never share the temporary file.
  let chain = Promise.resolve();
  return {
    async load() {
      try {
        const text = await readFile(path, 'utf8');
        return text.length > 256 * 1024 ? null : JSON.parse(text);
      } catch {
        return null;
      }
    },
    save(data) {
      const text = JSON.stringify(data);
      const write = chain.then(async () => {
        const temporary = `${path}.tmp`;
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, path);
      });
      chain = write.catch(() => {});
      return write;
    },
  };
}

/** For the tests: the same JSON round trip as the file. */
export function memoryStore(initial = null) {
  return {
    data: initial === null ? null : JSON.parse(JSON.stringify(initial)),
    saves: 0,
    async load() {
      return this.data === null ? null : JSON.parse(JSON.stringify(this.data));
    },
    async save(data) {
      this.data = JSON.parse(JSON.stringify(data));
      this.saves += 1;
    },
  };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const HEX64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The persisted state, repaired and bounded (`now` caps what lies in the future). */
export function normalizeMemory(raw, now) {
  const data = isObject(raw) ? raw : {};
  const pause = isObject(data.pause) ? data.pause : {};
  const refused = isObject(data.refused) ? data.refused : {};
  const announced = Array.isArray(data.announced) ? data.announced : [];
  return {
    salt:
      typeof data.salt === 'string' && HEX64.test(data.salt)
        ? data.salt
        : randomBytes(32).toString('hex'),
    // A last attempt "in the future" (a clock set back) counts as now.
    lastAttemptAt:
      Number.isFinite(data.lastAttemptAt) && data.lastAttemptAt > 0
        ? Math.min(data.lastAttemptAt, now)
        : null,
    pause:
      Number.isFinite(pause.until) && pause.until > now
        ? {
            until: Math.min(pause.until, now + PACING.PAUSE_MAX),
            reason: pause.reason === 'server' ? 'server' : 'rate_limited',
          }
        : null,
    refused:
      typeof refused.hash === 'string' && HEX64.test(refused.hash)
        ? {
            hash: refused.hash,
            code: refused.code === 'unknown_school' ? 'unknown_school' : 'bad_credentials',
            at: Number.isFinite(refused.at) ? Math.min(refused.at, now) : now,
          }
        : null,
    scope: typeof data.scope === 'string' && HEX64.test(data.scope) ? data.scope : null,
    announced: new Map(
      announced
        .filter(
          (entry) =>
            Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            entry[0].length <= 200 &&
            typeof entry[1] === 'string' &&
            entry[1].length <= 400,
        )
        .slice(-MAX_ANNOUNCED),
    ),
    dayStart: typeof data.dayStart === 'string' && DATE.test(data.dayStart) ? data.dayStart : null,
    primed: data.primed === true,
  };
}

/** The JSON written to /data. */
export function serializeMemory(memory) {
  return {
    salt: memory.salt,
    lastAttemptAt: memory.lastAttemptAt,
    pause: memory.pause,
    refused: memory.refused,
    scope: memory.scope,
    announced: [...memory.announced.entries()],
    dayStart: memory.dayStart,
    primed: memory.primed,
  };
}

const hmac = (salt, parts) =>
  createHmac('sha256', salt).update(JSON.stringify(parts)).digest('hex');

/** The fingerprint of credentials, kept only once WebUntis refused them. */
export const credentialsHash = (salt, config) =>
  hmac(salt, ['credentials', config.server, config.school, config.username, config.password]);

/** Which timetable is read: no password in it. */
export const scopeHash = (salt, config) =>
  hmac(salt, ['scope', config.server, config.school, config.username, config.className]);
