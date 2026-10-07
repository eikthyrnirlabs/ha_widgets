import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const SCENARIO = `
const noop = () => {};
const fakeEl = () => ({
  style: {},
  classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
  textContent: '',
  hidden: false,
  setAttribute: noop,
  addEventListener: noop,
});
globalThis.window = globalThis;
globalThis.document = {
  createElement: () => ({ innerHTML: '', content: { cloneNode: () => ({}) } }),
  addEventListener: noop,
  removeEventListener: noop,
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
  removeEventListener() {}
}
globalThis.HTMLElement = FakeHTMLElement;
const { HoldConfirmToggle } = await import(${JSON.stringify(join(root, 'src', 'hold-confirm-toggle.js'))});
const { TempDial } = await import(${JSON.stringify(join(root, 'src', 'temp-dial.js'))});

// three toggle instances with different configs (like different rooms)
const states = {
  'switch.a': { state: 'off', attributes: { friendly_name: 'A' } },
  'switch.b': { state: 'on', attributes: { friendly_name: 'B' } },
  'switch.c': { state: 'off', attributes: { friendly_name: 'C' } },
  'climate.x': { state: 'heat', attributes: { friendly_name: 'X', temperature: 20, unit_of_measurement: '°C' } },
  'climate.y': { state: 'off', attributes: { friendly_name: 'Y', temperature: 50, unit_of_measurement: '°C' } },
};
const hass = { states, callService: noop };

const t1 = new HoldConfirmToggle();
t1.setConfig({ entity: 'switch.a', mode: 'hold', hold_seconds: 1 });
t1.hass = hass;
const t2 = new HoldConfirmToggle();
t2.setConfig({ entity: 'switch.b', mode: 'confirm', confirm_seconds: 9 });
t2.hass = hass;
const t3 = new HoldConfirmToggle();
t3.setConfig({ entity: 'switch.c', mode: 'both', hold_seconds: 3, confirm_seconds: 2 });
t3.hass = hass;

// each instance keeps its own config
if (t1.config.entity !== 'switch.a' || t1.config.mode !== 'hold') throw new Error('t1 config wrong');
if (t2.config.entity !== 'switch.b' || t2.config.mode !== 'confirm') throw new Error('t2 config wrong');
if (t3.config.hold_seconds !== 3 || t3.config.confirm_seconds !== 2) throw new Error('t3 config wrong');

// confirm pending on one instance does not leak to others
t2._beginConfirm();
if (!t2._confirmPending) throw new Error('t2 should be pending');
if (t1._confirmPending) throw new Error('pending leaked to t1');
if (t3._confirmPending) throw new Error('pending leaked to t3');

// hold active on one instance does not leak
t3._onPointerDown({ button: 0 });
if (!t3._holdActive) throw new Error('t3 hold should be active');
if (t1._holdActive) throw new Error('hold leaked to t1');
t3._finishHold(true);

// dial instances with different ranges and colors
const d1 = new TempDial();
d1.setConfig({ entity: 'climate.x', min: 15, max: 30, step: 0.5, confirm_seconds: 5, low: 15, mid: 22.5, high: 30 });
d1.hass = hass;
const d2 = new TempDial();
d2.setConfig({ entity: 'climate.y', min: 40, max: 65, step: 1, confirm_seconds: 3, color: '#ff9800' });
d2.hass = hass;

if (d1.config.low !== 15 || d1.config.high !== 30) throw new Error('d1 thresholds wrong');
if (d2.config.low !== undefined || d2.config.color !== '#ff9800') throw new Error('d2 config wrong');

// d1 pending value does not affect d2
const wrapEl = fakeEl();
wrapEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 180 });
els['.dial-wrap'] = wrapEl;
d1._onDialPointerDown({ button: 0, clientX: 90, clientY: 20 });
d1._onPointerUp();
if (d1._pendingValue === null) throw new Error('d1 should have pending');
if (d2._pendingValue !== null) throw new Error('pending leaked between dials');
d1._clearConfirm();
d1._pendingValue = null;

// stub-only check ends here
console.log('isolation ok');
`;

check('widget instances with different configs are fully independent', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const scenarioPath = join(tmp, 'scenario.mjs');
  writeFileSync(scenarioPath, SCENARIO);
  const out = execFileSync('node', [scenarioPath], { encoding: 'utf8' });
  assert.ok(out.includes('isolation ok'), out);
});

check('widgets keep no mutable module-level state', () => {
  for (const f of ['hold-confirm-toggle.js', 'temp-dial.js']) {
    const src = readFileSync(join(root, 'src', f), 'utf8');
    const topLevel = src.split('export class')[0];
    const mutable = /(?:^|\n)\s*(?:let|var)\s+\w+/.test(topLevel);
    if (mutable) throw new Error(f + ' has mutable module-level state');
  }
});

console.log(`\n${passed} isolation checks passed`);
