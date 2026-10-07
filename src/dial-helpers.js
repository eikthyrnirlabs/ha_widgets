import { clamp } from './helpers.js';

export const DEFAULT_DIAL_CONFIG = Object.freeze({
  entity: '',
  name: '',
  step: 0.5,
  min: 15,
  max: 30,
  unit: '°C',
  confirm_seconds: 5,
});

export function validateDialConfig(config) {
  if (!config || typeof config !== 'object') {
    return 'Invalid configuration';
  }
  if (!config.entity || typeof config.entity !== 'string') {
    return 'You must define an entity';
  }
  const min = Number(config.min);
  const max = Number(config.max);
  if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
    return 'min must be less than max';
  }
  const step = Number(config.step);
  if (Number.isNaN(step) || step <= 0) {
    return 'step must be a positive number';
  }
  const confirm = Number(config.confirm_seconds);
  if (Number.isNaN(confirm) || confirm <= 0) {
    return 'confirm_seconds must be a positive number';
  }
  return null;
}

export function normalizeDialConfig(config) {
  return {
    ...DEFAULT_DIAL_CONFIG,
    ...config,
    step: Math.max(0.1, Number(config.step) || DEFAULT_DIAL_CONFIG.step),
    min: Number(config.min),
    max: Number(config.max),
    confirm_seconds: clamp(
      Number(config.confirm_seconds) || DEFAULT_DIAL_CONFIG.confirm_seconds,
      1,
      30
    ),
  };
}

export function roundToStep(value, step) {
  const safeStep = step > 0 ? step : 0.5;
  return Math.round(value / safeStep) * safeStep;
}

export const DIAL_MIN_ANGLE = -150;
export const DIAL_MAX_ANGLE = 150;

export function angleToValue(angleDeg, min, max) {
  const ratio = clamp((angleDeg - DIAL_MIN_ANGLE) / (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE), 0, 1);
  return min + ratio * (max - min);
}

export function valueToAngle(value, min, max) {
  if (max <= min) return DIAL_MIN_ANGLE;
  const ratio = clamp((value - min) / (max - min), 0, 1);
  return DIAL_MIN_ANGLE + ratio * (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE);
}

export function pointerToAngle(cx, cy, px, py) {
  const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  return (angle + 360) % 360;
}

const DIAL_STRINGS = {
  en: {
    dial_description: 'Temperature dial with dial-then-accept confirmation',
    accept: 'Accept',
    accept_hint: 'Dial, then press Accept within {seconds}s',
    dial_hint: 'Drag the dial to set, then accept',
  },
};

export function dialI18n(key, params, lang = 'en') {
  const table = DIAL_STRINGS[lang] || DIAL_STRINGS.en;
  let text = table[key] || DIAL_STRINGS.en[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
