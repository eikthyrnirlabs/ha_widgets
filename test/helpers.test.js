import {
  MODES,
  DEFAULT_CONFIG,
  isOn,
  normalizeMode,
  resolveHoldMs,
  resolveConfirmMs,
  serviceFor,
  validateConfig,
  i18n,
  clamp,
} from '../src/helpers.js';
import assert from 'node:assert';

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

check('normalizeMode accepts valid modes', () => {
  assert.equal(normalizeMode('hold'), 'hold');
  assert.equal(normalizeMode('confirm'), 'confirm');
  assert.equal(normalizeMode('both'), 'both');
});

check('normalizeMode falls back to hold', () => {
  assert.equal(normalizeMode('bogus'), 'hold');
  assert.equal(normalizeMode(undefined), 'hold');
});

check('isOn recognizes common active states', () => {
  assert.equal(isOn({ state: 'on' }), true);
  assert.equal(isOn({ state: 'open' }), true);
  assert.equal(isOn({ state: 'home' }), true);
  assert.equal(isOn({ state: 'off' }), false);
  assert.equal(isOn(null), false);
});

check('resolveHoldMs scales with hold_seconds when activating', () => {
  const cfg = { mode: 'hold', hold_seconds: 2 };
  assert.equal(resolveHoldMs(cfg, true), 2000);
  const short = { mode: 'hold', hold_seconds: 0.5 };
  assert.equal(resolveHoldMs(short, true), 500);
});

check('resolveHoldMs clamps extreme values', () => {
  const tooLong = { mode: 'hold', hold_seconds: 999 };
  assert.equal(resolveHoldMs(tooLong, true), 10000);
  const tiny = { mode: 'hold', hold_seconds: 0.001 };
  assert.equal(resolveHoldMs(tiny, true), 100);
});

check('resolveHoldMs uses short hold for deactivation', () => {
  const cfg = { mode: 'hold', hold_seconds: 5 };
  assert.equal(resolveHoldMs(cfg, false), 500);
});

check('resolveHoldMs is zero in confirm mode', () => {
  const cfg = { mode: 'confirm', hold_seconds: 2 };
  assert.equal(resolveHoldMs(cfg, true), 0);
});

check('resolveConfirmMs clamps window', () => {
  assert.equal(resolveConfirmMs({ confirm_seconds: 5 }), 5000);
  assert.equal(resolveConfirmMs({ confirm_seconds: 999 }), 30000);
  assert.equal(resolveConfirmMs({ confirm_seconds: 0 }), 5000);
  assert.equal(resolveConfirmMs({}), 5000);
});

check('validateConfig requires an entity', () => {
  assert.ok(validateConfig({}));
  assert.ok(validateConfig(null));
  assert.equal(validateConfig({ entity: 'switch.x', mode: 'hold', hold_seconds: 1 }), null);
});

check('validateConfig rejects bad mode', () => {
  assert.ok(validateConfig({ entity: 'switch.x', mode: 'wat', hold_seconds: 1 }));
});

check('validateConfig requires positive hold_seconds unless confirm mode', () => {
  assert.ok(validateConfig({ entity: 'switch.x', mode: 'hold', hold_seconds: 0 }));
  assert.equal(validateConfig({ entity: 'switch.x', mode: 'confirm' }), null);
});

check('serviceFor uses toggle where supported', () => {
  assert.deepEqual(serviceFor('switch.kitchen', true), { domain: 'switch', service: 'toggle' });
  assert.deepEqual(serviceFor('light.bed', false), { domain: 'light', service: 'toggle' });
  assert.deepEqual(serviceFor('input_boolean.guest', true), { domain: 'input_boolean', service: 'toggle' });
});

check('serviceFor falls back to turn_on/turn_off', () => {
  assert.deepEqual(serviceFor('scene.movie', false), { domain: 'scene', service: 'turn_on' });
  assert.deepEqual(serviceFor('script.doorbell', false), { domain: 'script', service: 'turn_on' });
  assert.deepEqual(serviceFor('automation.x', true), { domain: 'automation', service: 'turn_off' });
});

check('i18n interpolates params', () => {
  const text = i18n('hold_hint', { seconds: 1.5 });
  assert.ok(text.includes('1.5'));
  assert.ok(!text.includes('{seconds}'));
});

check('clamp works', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

check('DEFAULT_CONFIG is frozen', () => {
  assert.throws(() => { 'use strict'; DEFAULT_CONFIG.mode = 'x'; });
});

console.log(`\n${passed} assertions groups passed`);
