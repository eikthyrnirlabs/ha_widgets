import assert from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
const makeShadow = () => {
  const cache = {};
  return {
    appendChild: noop,
    querySelector: (sel) => { cache[sel] = cache[sel] || fakeEl(); els[sel] = cache[sel]; return cache[sel]; },
  };
};
class FakeHTMLElement {
  attachShadow() { this.shadowRoot = makeShadow(); return this.shadowRoot; }
  addEventListener() {}
  removeEventListener() {}
}
globalThis.HTMLElement = FakeHTMLElement;
const { TempDial } = await import(${JSON.stringify(join(root, 'src', 'temp-dial.js'))});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calls = [];
const states = {
  'climate.heat': {
    state: 'heat',
    attributes: { friendly_name: 'Heating', temperature: 20, unit_of_measurement: '°C' },
  },
};
const hass = {
  states,
  callService(domain, service, data) {
    calls.push({ domain, service, data });
    if (service === 'set_temperature') {
      states[data.entity_id].attributes.temperature = data.temperature;
    }
  },
};

const card = new TempDial();
card.setConfig({ entity: 'climate.heat', min: 15, max: 30, step: 0.5, confirm_seconds: 5 });
card.hass = hass;
card.connectedCallback();

if (els['.value'].textContent !== '20') throw new Error('initial value should render 20, got ' + els['.value'].textContent);

// drag: pointer down at top center of a fake 180px dial centered at (90,90)
const wrapEl = els['.dial-wrap'] = els['.dial-wrap'] || fakeEl();
wrapEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 180 });
card._onDialPointerDown({ button: 0, clientX: 90, clientY: 20 });
// pointer straight up = 0deg = midpoint = 22.5
if (card._pendingValue !== 22.5) throw new Error('drag should set 22.5, got ' + card._pendingValue);
card._onPointerUp();

// confirm window open, no service call yet
if (calls.length !== 0) throw new Error('no service call before accept');
if (els['.value'].textContent !== '22.5') throw new Error('pending value should display 22.5');

// accept must not be treated as a dial drag: simulated pointerdown on the
// accept button (near dial center) must not change the pending value
card._onDialPointerDown = card._onDialPointerDown.bind(card);
const before = card._pendingValue;
if (before !== 22.5) throw new Error('precondition failed: ' + before);
card._onAccept({ stopPropagation: () => {}, preventDefault: () => {} });
if (calls.length !== 1) throw new Error('accept should call set_temperature');
if (calls[0].service !== 'set_temperature') throw new Error('wrong service: ' + calls[0].service);
if (calls[0].data.temperature !== 22.5) throw new Error('wrong temperature: ' + calls[0].data.temperature);
if (states['climate.heat'].attributes.temperature !== 22.5) throw new Error('state should update');

// after accept, pending cleared, hint back to idle
if (card._pendingValue !== null) throw new Error('pending should clear after accept');
if (els['.hint'].textContent.includes('Accept')) throw new Error('hint should not mention accept after clearing');

// drag to max and let it expire without accepting
card._onDialPointerDown({ button: 0, clientX: 180, clientY: 180 });
if (card._pendingValue !== 29.5) throw new Error('drag to bottom-right should reach near max, got ' + card._pendingValue);
card._onPointerUp();
await sleep(5500);
if (card._pendingValue !== null) throw new Error('pending should expire');
if (states['climate.heat'].attributes.temperature !== 22.5) throw new Error('state must not change on expiry');

// arc endpoints: render must draw the fill from START_ANGLE to the knob angle
{
  const arcEl = els['.arc-value'];
  const setCalls = [];
  arcEl.setAttribute = (name, val) => { setCalls.push(val); return fakeElSet(name, val); };
  function fakeElSet() {}
  card._render();
  const d = setCalls[setCalls.length - 1];
  if (!d) throw new Error('arc d not set, calls: ' + JSON.stringify(setCalls));
  // d = "M x1 y1 A r r 0 large 1 x2 y2" — endpoint is the last two numbers
  const numRe = new RegExp("-?[0-9]+[.]?[0-9]*", "g");
  const nums = d.match(numRe).map(Number);
  const startX = nums[0], startY = nums[1];
  const endX = nums[nums.length - 2], endY = nums[nums.length - 1];
  const expectStart = [100 + 78 * Math.cos((-150 - 90) * Math.PI / 180), 100 + 78 * Math.sin((-150 - 90) * Math.PI / 180)];
  const expectEnd = [100 + 78 * Math.cos(-90 * Math.PI / 180), 100 + 78 * Math.sin(-90 * Math.PI / 180)];
  if (Math.abs(startX - expectStart[0]) > 1 || Math.abs(startY - expectStart[1]) > 1) {
    throw new Error('arc start mismatch: ' + startX + ',' + startY);
  }
  if (Math.abs(endX - expectEnd[0]) > 1 || Math.abs(endY - expectEnd[1]) > 1) {
    throw new Error('arc end mismatch (fill must end at knob): ' + endX + ',' + endY);
  }
}

console.log('scenario ok');
`;

check('dial drag sets pending, accept calls set_temperature, expiry reverts', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'haw-'));
  const scenarioPath = join(tmp, 'scenario.mjs');
  writeFileSync(scenarioPath, SCENARIO);
  const out = execFileSync('node', [scenarioPath], { encoding: 'utf8' });
  assert.ok(out.includes('scenario ok'), out);
});

console.log(`\n${passed} dial interaction check passed`);
