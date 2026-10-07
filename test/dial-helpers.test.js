import {
  DEFAULT_DIAL_CONFIG,
  validateDialConfig,
  normalizeDialConfig,
  roundToStep,
  angleToValue,
  valueToAngle,
  pointerToAngle,
  dialI18n,
  hexToRgb,
  rgbToHex,
  mixHex,
  hasColorScale,
  resolveDialColor,
  DIAL_COLORS,
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

check('validateDialConfig enforces threshold rules', () => {
  const base = { entity: 'climate.x', min: 15, max: 30, step: 0.5, confirm_seconds: 5 };
  assert.equal(validateDialConfig({ ...base, low: 18, mid: 21, high: 24 }), null);
  assert.ok(validateDialConfig({ ...base, low: 24, mid: 21, high: 18 }));
  assert.ok(validateDialConfig({ ...base, low: 18, mid: 21 }));
  assert.ok(validateDialConfig({ ...base, mid: 21 }));
});

check('hexToRgb and rgbToHex round-trip', () => {
  assert.deepEqual(hexToRgb('#2196f3'), [33, 150, 243]);
  assert.equal(hexToRgb('nope'), null);
  assert.equal(rgbToHex(33, 150, 243), '#2196f3');
});

check('mixHex interpolates between colors', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
});

check('hasColorScale requires all three ordered thresholds', () => {
  assert.ok(hasColorScale({ low: 18, mid: 21, high: 24 }));
  assert.ok(!hasColorScale({ low: 18, mid: 21 }));
  assert.ok(!hasColorScale({}));
  assert.ok(!hasColorScale({ low: 24, mid: 21, high: 18 }));
});

check('resolveDialColor scales blue-green-red across thresholds', () => {
  const cfg = { low: 15, mid: 22.5, high: 30 };
  assert.equal(resolveDialColor(10, cfg), DIAL_COLORS.cold);
  assert.equal(resolveDialColor(15, cfg), DIAL_COLORS.cold);
  assert.equal(resolveDialColor(22.5, cfg), DIAL_COLORS.mild);
  assert.equal(resolveDialColor(30, cfg), DIAL_COLORS.hot);
  assert.equal(resolveDialColor(40, cfg), DIAL_COLORS.hot);
  const belowMid = resolveDialColor(18.75, cfg);
  assert.ok(belowMid !== DIAL_COLORS.cold && belowMid !== DIAL_COLORS.mild);
});

check('resolveDialColor falls back to single color or none', () => {
  assert.equal(resolveDialColor(20, { color: '#ff9800' }), '#ff9800');
  assert.equal(resolveDialColor(20, {}), null);
  const gradientAt20 = resolveDialColor(20, { low: 15, mid: 22.5, high: 30, color: '#ff9800' });
  assert.ok(gradientAt20 !== '#ff9800', 'gradient must win over color when thresholds set');
  assert.equal(gradientAt20, mixHex(DIAL_COLORS.cold, DIAL_COLORS.mild, (20 - 15) / (22.5 - 15)));
});

check('thresholds take precedence over explicit color', () => {
  const cfg = { low: 15, mid: 22.5, high: 30, color: '#ff9800' };
  assert.equal(resolveDialColor(29, cfg), mixHex(DIAL_COLORS.mild, DIAL_COLORS.hot, (29 - 22.5) / (30 - 22.5)));
});

console.log(`\n${passed} dial helper checks passed`);
