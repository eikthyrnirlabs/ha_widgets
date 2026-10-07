import {
  DEFAULT_DIAL_CONFIG,
  validateDialConfig,
  normalizeDialConfig,
  roundToStep,
  angleToValue,
  valueToAngle,
  pointerToAngle,
  dialI18n,
} from '../src/dial-helpers.js';
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

check('validateDialConfig requires an entity', () => {
  assert.ok(validateDialConfig({}));
  assert.ok(validateDialConfig(null));
  assert.equal(
    validateDialConfig({ entity: 'climate.x', min: 15, max: 30, step: 0.5, confirm_seconds: 5 }),
    null
  );
});

check('validateDialConfig rejects min >= max', () => {
  assert.ok(validateDialConfig({ entity: 'climate.x', min: 30, max: 30, step: 0.5, confirm_seconds: 5 }));
  assert.ok(validateDialConfig({ entity: 'climate.x', min: 31, max: 30, step: 0.5, confirm_seconds: 5 }));
});

check('validateDialConfig rejects bad step and confirm', () => {
  assert.ok(validateDialConfig({ entity: 'climate.x', min: 15, max: 30, step: 0, confirm_seconds: 5 }));
  assert.ok(validateDialConfig({ entity: 'climate.x', min: 15, max: 30, step: 0.5, confirm_seconds: -1 }));
});

check('normalizeDialConfig applies defaults and clamps confirm', () => {
  const cfg = normalizeDialConfig({ entity: 'climate.x', min: 10, max: 25, step: 1, confirm_seconds: 999 });
  assert.equal(cfg.unit, '°C');
  assert.equal(cfg.confirm_seconds, 30);
  assert.equal(cfg.min, 10);
  assert.equal(cfg.max, 25);
});

check('roundToStep snaps to the step grid', () => {
  assert.equal(roundToStep(21.3, 0.5), 21.5);
  assert.equal(roundToStep(21.24, 0.5), 21.0);
  assert.equal(roundToStep(22, 1), 22);
  assert.equal(roundToStep(21.2, 0), 21.0);
});

check('angleToValue maps -150..150 across min..max', () => {
  assert.equal(angleToValue(-150, 15, 30), 15);
  assert.equal(angleToValue(0, 15, 30), 22.5);
  assert.equal(angleToValue(150, 15, 30), 30);
  assert.equal(angleToValue(200, 15, 30), 30);
  assert.equal(angleToValue(-200, 15, 30), 15);
});

check('valueToAngle is the inverse of angleToValue', () => {
  assert.equal(valueToAngle(15, 15, 30), -150);
  assert.equal(valueToAngle(22.5, 15, 30), 0);
  assert.equal(valueToAngle(30, 15, 30), 150);
  for (const v of [15, 18.75, 22.5, 26.25, 30]) {
    const angle = valueToAngle(v, 15, 30);
    assert.ok(Math.abs(angleToValue(angle, 15, 30) - v) < 1e-9, `${v} roundtrip`);
  }
});

check('pointerToAngle converts pointer position to degrees', () => {
  // pointer directly above center = 0deg (top)
  assert.ok(Math.abs(pointerToAngle(100, 100, 100, 40)) < 0.001);
  // pointer to the right = 90deg
  assert.ok(Math.abs(pointerToAngle(100, 100, 160, 100) - 90) < 0.001);
  // pointer below = 180
  assert.ok(Math.abs(pointerToAngle(100, 100, 100, 160) - 180) < 0.001);
  // pointer left = 270
  assert.ok(Math.abs(pointerToAngle(100, 100, 40, 100) - 270) < 0.001);
});

check('dialI18n interpolates params', () => {
  const text = dialI18n('accept_hint', { seconds: 4 });
  assert.ok(text.includes('4'));
  assert.ok(!text.includes('{seconds}'));
});

check('DEFAULT_DIAL_CONFIG is frozen', () => {
  assert.throws(() => { 'use strict'; DEFAULT_DIAL_CONFIG.step = 9; });
});

console.log(`\n${passed} dial helper checks passed`);
