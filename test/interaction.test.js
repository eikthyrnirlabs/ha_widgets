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

const calls = [];
function makeHass(states) {
  return {
    states,
    callService(domain, service, data) {
      calls.push({ domain, service, data });
      const entity = states[data.entity_id];
      if (service === 'toggle') {
        entity.state = entity.state === 'on' ? 'off' : 'on';
      } else if (service === 'turn_on') entity.state = 'on';
      else if (service === 'turn_off') entity.state = 'off';
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hold-mode card: can turn ON with full hold, then OFF with short hold.
{
  const states = { 'switch.hold': { state: 'off', attributes: {} } };
  const card = new HoldConfirmToggle();
  card.setConfig({ entity: 'switch.hold', mode: 'hold', hold_seconds: 0.2 });
  let hass = makeHass(states);
  card.hass = hass;
  card._onPointerDown({ button: 0 });
  await sleep(300);
  if (states['switch.hold'].state !== 'on') throw new Error('hold should turn on');
  if (calls.length !== 1) throw new Error('expected 1 call, got ' + calls.length);
  // simulate hass re-assignment like dashboards do after a state change
  hass = makeHass(states);
  card.hass = hass;
  card._onPointerDown({ button: 0 });
  await sleep(600);
  if (states['switch.hold'].state !== 'off') throw new Error('short hold should turn off');
  if (calls.length !== 2) throw new Error('expected 2 calls, got ' + calls.length);
  calls.length = 0;
}

// Confirm-mode card: tap opens confirm window, tapping again calls service.
{
  const states = { 'input_boolean.c': { state: 'off', attributes: {} } };
  const card = new HoldConfirmToggle();
  card.setConfig({ entity: 'input_boolean.c', mode: 'confirm', confirm_seconds: 5 });
  card.hass = makeHass(states);
  card._onClick({});
  if (!card._confirmPending) throw new Error('confirm should be pending after tap');
  card._onClick({ composedPath: () => [{ classList: { contains: () => true } }] });
  if (states['input_boolean.c'].state !== 'on') throw new Error('confirm should turn on');
  if (calls.length !== 1) throw new Error('expected 1 call, got ' + calls.length);
  calls.length = 0;
}

console.log('scenario ok');
`;

check('hold turns on then off; confirm turns on across hass re-assignments', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const scenarioPath = join(tmp, 'scenario.mjs');
  writeFileSync(scenarioPath, SCENARIO);
  const out = execFileSync('node', [scenarioPath], { encoding: 'utf8' });
  assert.ok(out.includes('scenario ok'), out);
});

check('demo keeps callService on the persistent hass object', () => {
  const demo = readFileSync(join(root, 'demo', 'index.html'), 'utf8');
  assert.ok(!demo.includes('card.hass = { states }'), 'demo must not strip callService');
  assert.ok(demo.includes('card.hass = hass'), 'demo must re-assign persistent hass');
});

console.log(`\n${passed} interaction checks passed`);
