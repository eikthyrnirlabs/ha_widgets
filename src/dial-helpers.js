import { clamp } from './helpers.js';

export const DEFAULT_DIAL_CONFIG = Object.freeze({
  entity: '',
  name: '',
  step: 0.5,
  min: 15,
  max: 30,
  unit: '°C',
  confirm_seconds: 5,
  color: '',
  low: undefined,
  mid: undefined,
  high: undefined,
  humidity_entity: '',
});

export const DIAL_COLORS = Object.freeze({
  cold: '#2196f3',
  mild: '#4caf50',
  hot: '#f44336',
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
  if (config.humidity_entity !== undefined && typeof config.humidity_entity !== 'string') {
    return 'humidity_entity must be an entity id';
  }
  const thresholds = ['low', 'mid', 'high'].filter(
    (k) => config[k] !== undefined && config[k] !== null
  );
  if (thresholds.length === 3) {
    const low = Number(config.low);
    const mid = Number(config.mid);
    const high = Number(config.high);
    if (Number.isNaN(low) || Number.isNaN(mid) || Number.isNaN(high) || low >= mid || mid >= high) {
      return 'low, mid, high must be numbers with low < mid < high';
    }
  } else if (thresholds.length !== 0) {
    return 'low, mid and high must all be defined together';
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

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const to2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const ratio = clamp(t, 0, 1);
  return rgbToHex(
    ca[0] + (cb[0] - ca[0]) * ratio,
    ca[1] + (cb[1] - ca[1]) * ratio,
    ca[2] + (cb[2] - ca[2]) * ratio
  );
}

export function hasColorScale(config) {
  return (
    ['low', 'mid', 'high'].every(
      (k) =>
        config[k] !== undefined &&
        config[k] !== null &&
        !Number.isNaN(Number(config[k]))
    ) &&
    Number(config.low) < Number(config.mid) &&
    Number(config.mid) < Number(config.high)
  );
}

export function resolveDialColor(value, config) {
  if (hasColorScale(config)) {
    if (value === null || value === undefined) return null;
    const low = Number(config.low);
    const mid = Number(config.mid);
    const high = Number(config.high);
    if (value <= low) return DIAL_COLORS.cold;
    if (value >= high) return DIAL_COLORS.hot;
    if (value <= mid) {
      return mixHex(DIAL_COLORS.cold, DIAL_COLORS.mild, (value - low) / (mid - low));
    }
    return mixHex(DIAL_COLORS.mild, DIAL_COLORS.hot, (value - mid) / (high - mid));
  }
  return config.color || null;
}

export function readTemperature(entity) {
  if (!entity) return null;
  const attrs = entity.attributes || {};
  const raw =
    attrs.temperature ?? attrs.current_temperature ?? entity.state;
  if (raw === undefined || raw === null || raw === 'unknown' || raw === 'unavailable') {
    return null;
  }
  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

export function readHumidity(entity) {
  if (!entity) return null;
  const attrs = entity.attributes || {};
  let raw = attrs.humidity ?? entity.state;
  if (raw === undefined || raw === null || raw === 'unknown' || raw === 'unavailable') {
    return null;
  }
  let unit = attrs.unit_of_measurement || '%';
  if (unit !== '%') {
    unit = '%';
  }
  const num = Number(raw);
  return Number.isNaN(num) ? null : { value: num, unit };
}
