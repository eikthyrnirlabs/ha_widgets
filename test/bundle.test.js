import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist', 'ha_widgets.js');

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
};

check('build produces dist/ha_widgets.js', () => {
  execFileSync('node', [join(root, 'scripts', 'build.js')], { stdio: 'inherit' });
  assert.ok(existsSync(dist));
});

check('bundle contains no ESM import/export syntax', () => {
  const code = readFileSync(dist, 'utf8');
  assert.ok(!/\bimport\s+.*\bfrom\b/.test(code), 'found import statement');
  assert.ok(!/^export\s/m.test(code), 'found export statement');
});

check('bundle parses as a script', () => {
  execFileSync('node', ['--check', dist]);
});

check('bundle registers the custom element', () => {
  const code = readFileSync(dist, 'utf8');
  assert.ok(code.includes("customElements.define('hold-confirm-toggle'"));
  assert.ok(code.includes('customCards'));
});

check('source modules parse as ESM', () => {
  const src = join(root, 'src');
  for (const f of ['helpers.js', 'dial-helpers.js', 'hold-confirm-toggle.js', 'temp-dial.js']) {
    execFileSync('node', ['--check', join(src, f)]);
  }
});

const SMOKE = `
const noop = () => {};
globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({
    innerHTML: '',
    content: { cloneNode: () => ({}) },
    style: {},
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    textContent: '',
    hidden: false,
    setAttribute: noop,
    addEventListener: noop,
  }),
  addEventListener: noop,
  removeEventListener: noop,
  querySelectorAll: () => [],
};
const defined = [];
globalThis.customElements = { define: (name) => defined.push(name), get: () => undefined };
globalThis.HTMLElement = class {};
await import(${JSON.stringify(dist)});
if (defined.length !== 2 || !defined.includes('hold-confirm-toggle') || !defined.includes('temp-dial')) {
  throw new Error('expected both elements registered, got: ' + JSON.stringify(defined));
}
console.log('smoke ok');
`;

check('bundle executes and registers every widget', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const smokePath = join(tmp, 'smoke.mjs');
  writeFileSync(smokePath, SMOKE);
  const out = execFileSync('node', [smokePath], { encoding: 'utf8' });
  assert.ok(out.includes('smoke ok'), out);
});

check('demo pages reference the bundle with a cache-busting version tag', () => {
  const tag = /\?v=([\w.\-]+)/;
  const tags = [];
  for (const page of ['buttons', 'dial']) {
    const html = readFileSync(join(root, 'demo', page, 'index.html'), 'utf8');
    const m = html.match(tag);
    assert.ok(m, `missing ?v= tag in demo/${page}/index.html`);
    tags.push(m[1]);
  }
  assert.equal(tags[0], tags[1], 'cache tags must match across demo pages');
  const bundle = readFileSync(dist, 'utf8');
  assert.ok(bundle.includes('version:'), 'bundle must embed its version');
});

console.log(`\n${passed} bundle checks passed`);
