// -----------------------------------------------------------------------------
// The texts users and contributors read are UTF-8 without BOM, never mojibake
// (UTF-8 bytes read as Latin-1 / Windows-1252 and saved again: "é" becoming
// "Ã" + "©", "’" becoming "â" + "€" + "™"), without control bytes, and never
// claim that Gladys encrypts the password (a `secret` field is kept in clear
// in its database).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const MOJIBAKE = /[ÂÃ][\u0080-¿€]|â€/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ENCRYPTED = /chiffr|encrypt|crypt[ée]/i;

const DOCS = [
  'gladys-assistant-integration.json',
  'docs/en.md',
  'docs/fr.md',
  'README.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'TODO.md',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
];
const CODE = [
  'index.js',
  'Dockerfile',
  'package.json',
  ...readdirSync(new URL('../src/', import.meta.url), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => `src/${f.replaceAll('\\', '/')}`),
  ...readdirSync(new URL('../test/', import.meta.url), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => `test/${f.replaceAll('\\', '/')}`)
    // This file spells mojibake on purpose.
    .filter((f) => f !== 'test/encoding.test.js'),
];

for (const file of [...DOCS, ...CODE]) {
  test(`${file}: UTF-8 without BOM, no mojibake, no control byte`, () => {
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM');
    const text = bytes.toString('utf8');
    assert.ok(!text.includes('�'), 'invalid UTF-8');
    const lines = text.split('\n');
    const bad = lines.findIndex((l) => MOJIBAKE.test(l));
    assert.equal(bad, -1, `mojibake on line ${bad + 1}`);
    const control = lines.findIndex((l) => CONTROL.test(l.replace(/\r$/, '')));
    assert.equal(control, -1, `control byte on line ${control + 1}`);
  });
}

for (const file of [...DOCS.filter((f) => f !== 'CLAUDE.md' && f !== 'TODO.md'), 'src/i18n.js']) {
  test(`${file}: never says the password is encrypted`, () => {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const line = text.split('\n').findIndex((l) => ENCRYPTED.test(l));
    assert.equal(line, -1, `"encrypted" on line ${line + 1}`);
  });
}

test('the patterns catch what they should', () => {
  assert.match('FranÃ§ais', MOJIBAKE, 'ç read as Latin-1');
  assert.match('Â«', MOJIBAKE, '« read as Latin-1');
  assert.match('lâ€™app', MOJIBAKE, '’ read as Windows-1252');
  assert.doesNotMatch('Français « Découverte » 800×534 — l’app…', MOJIBAKE);
  assert.match('stocké chiffré', ENCRYPTED);
  assert.match('stored encrypted', ENCRYPTED);
  assert.match('a\u0007b', CONTROL);
  assert.doesNotMatch('a\tb', CONTROL);
});

test('LICENSE names nobody', () => {
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.match(license, /Apache License/);
  assert.match(license, /Copyright \[yyyy\] \[name of copyright owner\]/);
  assert.doesNotMatch(license, /Copyright (?:\(c\) )?\d{4}/i);
});

test('the image ships the license and the BSD notice of python-webuntis', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY [^\n]*LICENSE[^\n]*THIRD_PARTY_NOTICES\.md/);
  const notices = readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  assert.match(notices, /Copyright \(c\) 2013-2016, Markus Unterwaditzer/);
  assert.match(notices, /Copyright \(c\) 2018, August Hörandl/);
  assert.match(notices, /Redistributions of source code must retain the above copyright notice/);
  assert.match(notices, /The names of the contributors may not be used to endorse or promote/);
  assert.match(notices, /EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE/);
});

test('the cover is a PNG of 800 × 534', () => {
  const png = readFileSync(new URL('../cover.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 800);
  assert.equal(png.readUInt32BE(20), 534);
});
