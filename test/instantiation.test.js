import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

const SMOKE = `
const noop = () => {};
const fakeEl = () => ({
  style: {},
  classList: { toggle: noop, add: noop, remove: noop },
  textContent: '',
  hidden: false,
});
globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({ innerHTML: '', content: { cloneNode: () => ({}) } }),
  addEventListener: noop,
  querySelectorAll: () => [],
};
globalThis.customCards = [];
globalThis.customElements = { define: noop, get: () => undefined };
const els = {};
class FakeHTMLElement {
  attachShadow() {
    this.shadowRoot = {
      appendChild: noop,
      querySelector: (sel) => { els[sel] = els[sel] || fakeEl(); return els[sel]; },
    };
    return this.shadowRoot;
  }
  addEventListener() {}
}
globalThis.HTMLElement = FakeHTMLElement;
const { HoldConfirmToggle } = await import(${JSON.stringify(join(root, 'src', 'hold-confirm-toggle.js'))});
const card = new HoldConfirmToggle();
card.setConfig({ entity: 'switch.x', mode: 'hold', hold_seconds: 1 });
card.hass = { states: { 'switch.x': { state: 'off', attributes: {} } } };
if (!els['.name'] || els['.name'].textContent !== 'switch.x') {
  throw new Error('name not rendered: ' + (els['.name'] && els['.name'].textContent));
}
if (!els['.hint'] || !els['.hint'].textContent.includes('1')) {
  throw new Error('hint not rendered');
}
console.log('instantiation ok');
`;

check('card instantiates, renders, before/after setConfig without throwing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const smokePath = join(tmp, 'smoke.mjs');
  writeFileSync(smokePath, SMOKE);
  const out = execFileSync('node', [smokePath], { encoding: 'utf8' });
  assert.ok(out.includes('instantiation ok'), out);
});

check('constructor sets hass without touching config before setConfig', () => {
  const src = readFileSync(join(root, 'src', 'hold-confirm-toggle.js'), 'utf8');
  assert.ok(!/this\.hass = null;/.test(src), 'constructor must not fire hass setter');
  assert.ok(/if \(!this\.shadowRoot \|\| !this\.config\) return;/.test(src), '_render must guard');
});

console.log(`\n${passed} instantiation checks passed`);
