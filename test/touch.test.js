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

const SCENARIO = `
const noop = () => {};
const fakeEl = () => ({
  style: {},
  classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
  textContent: '',
  hidden: false,
  setAttribute: noop,
  addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 180 }),
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
class FakeHTMLElement {
  attachShadow() {
    const cache = {};
    this.shadowRoot = {
      appendChild: noop,
      querySelector: (sel) => { cache[sel] = cache[sel] || fakeEl(); return cache[sel]; },
    };
    return this.shadowRoot;
  }
  addEventListener() {}
  removeEventListener() {}
}
globalThis.HTMLElement = FakeHTMLElement;
const { HoldConfirmToggle } = await import(${JSON.stringify(join(root, 'src', 'hold-confirm-toggle.js'))});
const { TempDial } = await import(${JSON.stringify(join(root, 'src', 'temp-dial.js'))});

const calls = [];
const makeHass = (states) => ({
  states,
  callService(domain, service, data) {
    calls.push({ domain, service, data });
    const e = states[data.entity_id];
    if (service === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
    if (service === 'set_value') e.state = String(data.value);
  },
});

// Toggle: a touch that turns into a scroll (pointercancel) must not toggle
{
  const states = { 'switch.garage': { state: 'off', attributes: {} } };
  const card = new HoldConfirmToggle();
  card.setConfig({ entity: 'switch.garage', mode: 'hold', hold_seconds: 2 });
  card.hass = makeHass(states);
  card._onPointerDown({ button: 0 });
  card._finishHold(true); // pointercancel path
  if (states['switch.garage'].state !== 'off') throw new Error('cancel must not toggle');
  if (card._holdActive) throw new Error('hold must end on cancel');
  if (calls.length !== 0) throw new Error('no service call expected');
  // after cancel, a fresh hold still works
  card._onPointerDown({ button: 0 });
  if (!card._holdActive) throw new Error('hold should restart');
  card._finishHold(true);
}

// Dial: scroll-cancel discards the drag entirely, no confirm window
{
  const states = {
    'input_number.room_target': { state: '21', attributes: {} },
  };
  const dial = new TempDial();
  dial.setConfig({ entity: 'input_number.room_target', min: 15, max: 30, step: 0.5, confirm_seconds: 5 });
  dial.hass = makeHass(states);
  dial._onDialPointerDown({ button: 0, clientX: 90, clientY: 20 });
  if (dial._pendingValue !== 22.5) throw new Error('drag should set 22.5');
  dial._onPointerUp(true); // scroll took over
  if (dial._pendingValue !== null) throw new Error('cancel must discard pending value');
  if (calls.length !== 0) throw new Error('no service call expected on cancel');
  // element state untouched: current value still 21
  const q = (sel) => dial.shadowRoot.querySelector(sel);
  if (q('.value').textContent !== '21') throw new Error('dial should show current value after cancel, got ' + q('.value').textContent);
}

console.log('touch ok');
`;

check('scroll-cancel on toggle and dial discards gesture without side effects', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const scenarioPath = join(tmp, 'scenario.mjs');
  writeFileSync(scenarioPath, SCENARIO);
  const out = execFileSync('node', [scenarioPath], { encoding: 'utf8' });
  assert.ok(out.includes('touch ok'), out);
});

check('widgets do not block page scrolling with touch-action', () => {
  const toggle = readFileSync(join(root, 'src', 'hold-confirm-toggle.js'), 'utf8');
  assert.ok(!/touch-action:\s*none/.test(toggle), 'toggle must not set touch-action: none');
  const dial = readFileSync(join(root, 'src', 'temp-dial.js'), 'utf8');
  assert.ok(!/touch-action:\s*none/.test(dial), 'dial must not set touch-action: none');
  assert.ok(/touch-action:\s*pan-y/.test(dial), 'dial should allow vertical panning');
});

console.log(`\n${passed} touch checks passed`);
