// -----------------------------------------------------------------------------
// The integration itself: the WebUntis account, the readings, the scene
// triggers, the scene action, the widget and the test button. index.js only
// wires the SDK handlers to it.
//
// Pace (be gentle with the school's server): one reading (login, timetable
// of the next days, logout) every `poll_minutes`, 30 by default, never below
// 15. The time of the last attempt is kept in /data: neither a restart, nor
// a reconnection to Gladys, nor saving an unchanged configuration, nor the
// test button reads sooner. A 429 or a 5xx pauses the readings (persisted,
// at most 6 h). A refused password stops everything until the credentials
// change (persisted); the test button may try once more, never sooner than
// the interval. The "school day starts" check runs on a local minute tick
// and makes no request.
//
// Nothing logged ever names the account, the school, a class or a lesson:
// only counts and error codes.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { configFingerprint, isComplete, normalizeConfig } from './config.js';
import { MAX_LIST_TEXT, PACING, WIDGETS } from './constants.js';
import { joinLines, lessonLine, lessonsOn, pickDate, summaryOf, todayOf } from './day.js';
import { T } from './i18n.js';
import {
  credentialsHash,
  fileStore,
  normalizeMemory,
  scopeHash,
  serializeMemory,
} from './store.js';
import { addDays, localParts, untisDate, weekdayOf } from './time.js';
import { dayStartEvent, pruneAnnounced, readingEvents, safe } from './triggers.js';
import { WebUntisClient, WebUntisError } from './webuntis/client.js';
import { lessonsOf } from './webuntis/model.js';
import { messageWidget, timetableWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

/** The errors that need the configuration changed (not the password): no retry until then. */
const CONFIG_ERRORS = {
  needs_class: T.needsClass,
  unknown_class: T.unknownClass,
  no_right: T.noRight,
  not_webuntis: T.notWebuntis,
};

export class WebUntisApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'webuntis' }),
    now = Date.now,
    timers = defaultTimers,
    store = fileStore(),
    clientFactory = (options) => new WebUntisClient(options),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.clientFactory = clientFactory;
    this.config = normalizeConfig();
    this.fingerprint = undefined;
    this.client = undefined;
    this.memory = undefined;
    this.generation = 0;
    this.tickTimer = undefined;
    this.saveTimer = undefined;
    this.savedAt = 0;
    /** The reading in progress (a second request joins it). */
    this.reading = undefined;
    /** The lessons of the last reading, undefined before the first one. */
    this.lessons = undefined;
    this.readAt = undefined;
    this.outsideSchoolYear = false;
    /** The code of the last failed reading, cleared by a successful one. */
    this.lastError = undefined;
    /** A configuration error (class, rights, address): no reading until the configuration changes. */
    this.configError = undefined;
    /** Something was typed in the server field (an invalid host is not "not configured"). */
    this.serverGiven = false;
    /** A new timetable or new credentials: the first reading need not wait. */
    this.immediate = false;
    this.lastStatus = undefined;
  }

  // --- Lifecycle -------------------------------------------------------------

  async loadMemory() {
    if (!this.memory) {
      const raw = await this.store.load().catch(() => null);
      this.memory ??= normalizeMemory(raw, this.now());
    }
    return this.memory;
  }

  /**
   * Gladys (re)connected: the status is published again (the core keeps it
   * in memory only). The same configuration resumes as it was: no reading
   * before its time, the pauses and blocks stay, a reading in progress goes on.
   */
  async connected(raw = {}) {
    this.lastStatus = undefined;
    if (this.fingerprint !== undefined && configFingerprint(raw) === this.fingerprint) {
      this.startTick();
      await this.reportStatus();
      await this.tick();
      return;
    }
    await this.start(raw);
  }

  /** A configuration saved: only a real change restarts. */
  async configUpdated(raw = {}) {
    if (configFingerprint(raw) === this.fingerprint) {
      return;
    }
    this.logger.info('Configuration updated');
    await this.start(raw);
  }

  async start(raw = {}) {
    this.stopTick();
    this.generation += 1;
    const generation = this.generation;
    const memory = await this.loadMemory();
    if (generation !== this.generation) {
      return;
    }
    const config = normalizeConfig(raw);
    this.fingerprint = configFingerprint(raw);
    this.config = config;
    this.serverGiven = typeof raw?.server === 'string' && raw.server.trim() !== '';
    this.configError = undefined;
    this.lastError = undefined;
    this.client = undefined;
    if (!isComplete(config)) {
      await this.reportStatus();
      return;
    }
    const scope = scopeHash(memory.salt, config);
    if (memory.scope !== scope) {
      // Another timetable: its own memory, and no wait for the first reading.
      memory.scope = scope;
      memory.announced = new Map();
      memory.dayStart = null;
      memory.primed = false;
      this.lessons = undefined;
      this.readAt = undefined;
      this.immediate = true;
      await this.persist({ urgent: true });
      if (generation !== this.generation) {
        return;
      }
    }
    if (memory.refused && memory.refused.hash !== credentialsHash(memory.salt, config)) {
      // Other credentials than the ones refused: they may be tried at once.
      this.immediate = true;
    }
    this.client = this.clientFactory({
      server: config.server,
      school: config.school,
      username: config.username,
      password: config.password,
      now: this.now,
    });
    this.startTick();
    await this.reportStatus();
    await this.tick();
  }

  /** Stop the timers; a reading in progress ends but publishes nothing. */
  stop() {
    this.generation += 1;
    this.stopTick();
  }

  /** Gladys went away: the timers stop, the state stays for the reconnection. */
  disconnected() {
    this.stopTick();
  }

  async shutdown() {
    this.stop();
    if (this.saveTimer !== undefined) {
      this.timers.clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      await this.writeMemory();
    }
  }

  startTick() {
    this.stopTick();
    this.tickTimer = this.timers.setInterval(
      () => this.tick().catch((err) => this.logger.warn(`Tick failed: ${err.message}`)),
      PACING.TICK,
    );
  }

  stopTick() {
    if (this.tickTimer !== undefined) {
      this.timers.clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  // --- Persistence -------------------------------------------------------------

  async writeMemory() {
    this.savedAt = this.now();
    try {
      await this.store.save(serializeMemory(this.memory));
    } catch (err) {
      this.logger.warn(`Saving the state failed: ${err.code ?? 'error'}`);
    }
  }

  /** Written at most once a minute; a refusal or a pause is written at once. */
  async persist({ urgent = false } = {}) {
    if (!this.memory) {
      return;
    }
    if (urgent || this.now() - this.savedAt >= PACING.SAVE_MIN_GAP) {
      if (this.saveTimer !== undefined) {
        this.timers.clearTimeout(this.saveTimer);
        this.saveTimer = undefined;
      }
      await this.writeMemory();
      return;
    }
    if (this.saveTimer === undefined) {
      this.saveTimer = this.timers.setTimeout(
        () => {
          this.saveTimer = undefined;
          this.writeMemory();
        },
        PACING.SAVE_MIN_GAP - (this.now() - this.savedAt),
      );
    }
  }

  // --- Scheduling ----------------------------------------------------------------

  /** The credentials of the configuration are the ones WebUntis refused. */
  refused() {
    const refused = this.memory?.refused;
    return Boolean(
      refused && this.client && refused.hash === credentialsHash(this.memory.salt, this.config),
    );
  }

  /** When the next reading may start (null: none until the configuration changes). */
  nextReadAt() {
    if (!this.client || this.configError || this.refused()) {
      return null;
    }
    const now = this.now();
    const interval = this.config.pollMinutes * 60_000;
    let at =
      this.immediate || !this.memory.lastAttemptAt ? now : this.memory.lastAttemptAt + interval;
    if (this.memory.pause && this.memory.pause.until > at) {
      at = this.memory.pause.until;
    }
    return at;
  }

  /** The minute tick: "school day starts", then a reading when it is due. */
  async tick() {
    await this.checkDayStart();
    const at = this.nextReadAt();
    if (at !== null && at <= this.now() && !this.readingCurrent()) {
      await this.read();
    }
  }

  /** A reading of the current configuration is in progress. */
  readingCurrent() {
    return this.reading !== undefined && this.readingGeneration === this.generation;
  }

  /**
   * One reading at a time: a second call joins the one in progress. A reading
   * of a former configuration does not hold the new one back (it will
   * publish nothing).
   */
  read() {
    if (!this.readingCurrent()) {
      const promise = this.doRead().finally(() => {
        if (this.reading === promise) {
          this.reading = undefined;
        }
      });
      this.reading = promise;
      this.readingGeneration = this.generation;
    }
    return this.reading;
  }

  async doRead() {
    const generation = this.generation;
    const { client, config, memory } = this;
    if (!client) {
      return;
    }
    const now = this.now();
    this.immediate = false;
    memory.lastAttemptAt = now;
    await this.persist();
    const today = todayOf(now, config.timeZone);
    let result;
    try {
      result = await client.readTimetable({
        from: untisDate(today),
        to: untisDate(addDays(today, config.lookaheadDays)),
        className: config.className,
      });
    } catch (err) {
      if (generation === this.generation) {
        await this.failed(err, generation);
      }
      return;
    }
    // A late answer of an older configuration publishes nothing.
    if (generation !== this.generation) {
      return;
    }
    const lessons = lessonsOf(result.periods, config.timeZone);
    const readAt = this.now();
    // Erasing a refusal or a pause is written at once.
    const cleared = memory.refused !== null || memory.pause !== null;
    memory.refused = null;
    memory.pause = null;
    this.lastError = undefined;
    this.lessons = lessons;
    this.readAt = readAt;
    this.outsideSchoolYear = result.outsideSchoolYear;
    const { events, marks, unmarks } = readingEvents(lessons, {
      announced: memory.announced,
      now: readAt,
      timeZone: config.timeZone,
      // The first reading of a timetable only remembers (persisted: a restart keeps it).
      baseline: !memory.primed,
    });
    memory.primed = true;
    for (const key of unmarks) {
      memory.announced.delete(key);
    }
    for (const [key, value] of marks) {
      memory.announced.set(key, value);
    }
    pruneAnnounced(memory.announced, todayOf(readAt, config.timeZone));
    await this.persist({ urgent: cleared });
    if (generation !== this.generation) {
      return;
    }
    this.logger.info(`Timetable read: ${lessons.length} lessons, ${events.length} events`);
    await this.publish(events, generation);
    if (generation !== this.generation) {
      return;
    }
    this.gladys.requestWidgetRefresh(WIDGETS.TIMETABLE);
    await this.reportStatus();
    await this.checkDayStart();
  }

  async failed(err, generation) {
    const { memory } = this;
    const code = err instanceof WebUntisError ? err.code : 'network';
    this.logger.warn(`WebUntis reading failed (${code})`);
    if (err instanceof WebUntisError && err.final) {
      memory.refused = { hash: credentialsHash(memory.salt, this.config), code, at: this.now() };
      this.lessons = undefined;
      this.readAt = undefined;
      await this.persist({ urgent: true });
    } else if (code === 'rate_limited' || code === 'server') {
      const wait = Math.min(
        PACING.PAUSE_MAX,
        Math.max(PACING.PAUSE_MIN, err.retryAfter ?? PACING.PAUSE_DEFAULT),
      );
      memory.pause = { until: this.now() + wait, reason: code };
      await this.persist({ urgent: true });
    } else if (CONFIG_ERRORS[code]) {
      this.configError = code;
    }
    this.lastError = code;
    if (generation === this.generation) {
      await this.reportStatus();
    }
  }

  async publish(events, generation) {
    for (const event of events) {
      if (generation !== this.generation) {
        return;
      }
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
  }

  /** "School day starts", once a day, from the lessons already read. */
  async checkDayStart() {
    if (!this.lessons || !this.memory) {
      return;
    }
    const found = dayStartEvent(this.lessons, {
      now: this.now(),
      timeZone: this.config.timeZone,
      notice: this.config.dayStartNotice,
      lastDate: this.memory.dayStart,
    });
    if (!found) {
      return;
    }
    this.memory.dayStart = found.date;
    await this.persist({ urgent: true });
    await this.publish([found.event], this.generation);
  }

  // --- Status --------------------------------------------------------------------

  clock(instant) {
    return localParts(instant, this.config.timeZone).time;
  }

  /** The status the state gives (never a name, never the account). */
  statusOf() {
    if (!isComplete(this.config)) {
      return {
        connected: false,
        message: this.serverGiven && !this.config.server ? T.badServer : T.notConfigured,
      };
    }
    if (this.refused()) {
      return {
        connected: false,
        message: this.memory.refused.code === 'unknown_school' ? T.unknownSchool : T.badCredentials,
      };
    }
    if (this.configError) {
      return { connected: false, message: CONFIG_ERRORS[this.configError] };
    }
    const next = this.nextReadAt();
    const nextText = next === null ? '—' : this.clock(next);
    if (this.memory.pause && this.memory.pause.until > this.now()) {
      return {
        connected: false,
        message: T.paused(Math.max(1, Math.ceil((this.memory.pause.until - this.now()) / 60_000))),
      };
    }
    if (this.lastError) {
      return { connected: false, message: T.failed(this.lastError, nextText) };
    }
    if (this.lessons && this.readAt) {
      return {
        connected: true,
        message: this.outsideSchoolYear
          ? T.outsideSchoolYear({ at: this.clock(this.readAt), next: nextText })
          : T.ok({
              at: this.clock(this.readAt),
              lessons: this.lessons.filter((l) => l.status !== 'cancelled').length,
              days: this.config.lookaheadDays,
              next: nextText,
            }),
      };
    }
    return { connected: true, message: T.waiting(nextText) };
  }

  async reportStatus() {
    const { connected, message } = this.statusOf();
    const key = JSON.stringify([connected, message]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Scene action ------------------------------------------------------------------

  /** "Read a school day": from the last reading, never a new request. */
  getSchoolDay(fields = {}) {
    if (!this.lessons) {
      throw new Error(T.notRead.en);
    }
    const date = pickDate(fields.day ?? 'today', this.lessons, this.now(), this.config.timeZone);
    const lessons = lessonsOn(this.lessons, date);
    const summary = summaryOf(lessons);
    return {
      date,
      weekday: weekdayOf(date),
      has_school: summary.count > 0,
      lesson_count: summary.count,
      cancelled_count: summary.cancelled,
      changed_count: summary.changed,
      exam_count: summary.exams,
      first_start: safe(summary.first?.start),
      first_subject: safe(summary.first?.subject),
      last_end: safe(summary.last?.end),
      late_start: summary.lateStart,
      list: joinLines(
        lessons.map((l) => lessonLine(l)),
        MAX_LIST_TEXT,
      ),
      read_at: new Date(this.readAt).toISOString(),
    };
  }

  // --- Dashboard widget --------------------------------------------------------------

  getWidget({ settings = {} } = {}) {
    if (!this.client) {
      return messageWidget(this.statusOf().message ?? T.widget.notConfigured);
    }
    if (!this.lessons) {
      const status = this.statusOf();
      return messageWidget(status.connected ? T.widget.notRead : status.message, { ttl: 120 });
    }
    const date = pickDate(settings.day ?? 'auto', this.lessons, this.now(), this.config.timeZone);
    return timetableWidget({
      date,
      lessons: lessonsOn(this.lessons, date),
      readAt: this.clock(this.readAt),
      ttl: 300,
    });
  }

  // --- Configuration screen button ------------------------------------------------------

  /**
   * "Test the connection": reads now only when a reading is due (a refused
   * password included: one more try, never sooner than the interval);
   * otherwise shows the last result and when the next reading comes.
   */
  async testConnection() {
    if (!this.client) {
      return this.statusOf().message;
    }
    if (this.readingCurrent()) {
      await this.reading;
      await this.reportStatus();
      return T.testRead(this.statusOf().message);
    }
    const interval = this.config.pollMinutes * 60_000;
    const last = this.memory.lastAttemptAt;
    const spaced = !last || this.now() - last >= interval;
    const pausedNow = this.memory.pause && this.memory.pause.until > this.now();
    if (this.refused() && spaced && !pausedNow) {
      // One spaced new try with the refused credentials, on the user's click.
      this.memory.refused = null;
      await this.read();
      await this.reportStatus();
      return T.testRead(this.statusOf().message);
    }
    if (this.configError && spaced && !pausedNow) {
      this.configError = undefined;
      await this.read();
      await this.reportStatus();
      return T.testRead(this.statusOf().message);
    }
    const at = this.nextReadAt();
    if (at !== null && at <= this.now()) {
      await this.read();
      await this.reportStatus();
      return T.testRead(this.statusOf().message);
    }
    return T.testNotDue(this.statusOf().message);
  }
}
