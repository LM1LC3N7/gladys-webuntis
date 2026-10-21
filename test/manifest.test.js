// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIONS,
  DAY_CHOICES,
  DAY_KINDS,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  TIME_ZONES,
  WEEKDAYS,
  WIDGETS,
} from '../src/constants.js';
import { BOUNDS, DEFAULTS } from '../src/config.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics; version 0.1.0 everywhere', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'provider');
  assert.match(manifest.gladys_version, />=5\.1\.0/);
  assert.equal(manifest.version, '0.1.0');
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-webuntis:${manifest.version}`);
  assert.equal(pkg.name, 'gladys-webuntis');
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/LM1LC3N7\/gladys-webuntis\/main\/cover\.png$/,
  );
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
    assert.ok(manifest.config_schema[0].description[lang].length <= 1000, 'section text');
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  assert.match(manifest.config_schema[0].description.en, /not affiliated with Untis/);
  assert.match(manifest.config_schema[0].description.en, /Never tested with a real account/);
  assert.match(manifest.config_schema[0].description.fr, /Jamais testé avec un vrai compte/);
});

test('every text is bilingual; placeholders are objects', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code; the password is a secret, never said "encrypted"', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  assert.equal(fields.password.type, 'secret');
  assert.match(fields.password.description.en, /Kept by Gladys in its database, never shown again/);
  assert.match(fields.password.description.fr, /Gardé par Gladys dans sa base, jamais réaffiché/);
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.equal(fields[key].default, value, key);
  }
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    assert.deepEqual([fields[key].min, fields[key].max], [min, max], key);
  }
  assert.ok(BOUNDS.poll_minutes[0] >= 15, 'the school server is never read more often');
  assert.deepEqual(
    fields.time_zone.options.map((o) => o.value),
    TIME_ZONES,
  );
  for (const key of ['server', 'school', 'username', 'password']) {
    assert.equal(fields[key].required, true, key);
  }
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((w) => w.key).sort(), Object.values(WIDGETS).sort());
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  assert.ok(index.includes('onWidgetGet(WIDGETS.TIMETABLE'));
  assert.ok(index.includes('onAction(ACTIONS.TEST'));
  const triggers = Object.fromEntries(manifest.scene_triggers.map((t) => [t.key, t]));
  for (const key of [SCENE_TRIGGERS.CANCELLED, SCENE_TRIGGERS.CHANGED]) {
    const day = triggers[key].fields.find((f) => f.key === 'day');
    assert.deepEqual(
      day.options.map((o) => o.value),
      DAY_KINDS,
    );
    // Every field filters on a variable of the same key.
    for (const field of triggers[key].fields) {
      assert.ok(
        triggers[key].variables.some((v) => v.key === field.key),
        field.key,
      );
    }
  }
  const weekday = triggers[SCENE_TRIGGERS.DAY_START].fields.find((f) => f.key === 'weekday');
  assert.deepEqual(
    weekday.options.map((o) => o.value),
    WEEKDAYS,
  );
  const dayField = manifest.scene_actions[0].fields.find((f) => f.key === 'day');
  assert.deepEqual(
    dayField.options.map((o) => o.value),
    DAY_CHOICES,
  );
  assert.deepEqual(
    manifest.widgets[0].settings[0].options.map((o) => o.value),
    DAY_CHOICES,
  );
});

test('read only: no device, no command, no widget button', () => {
  assert.equal(index.includes('onSetValue'), false);
  assert.equal(index.includes('onWidgetAction'), false);
  assert.equal(index.includes('publishDiscoveredDevices'), false);
});
