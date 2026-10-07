export const MODES = ['hold', 'confirm', 'both'];

export const DEFAULT_CONFIG = Object.freeze({
  entity: '',
  name: '',
  mode: 'hold',
  hold_seconds: 1.5,
  confirm_seconds: 5,
});

export const MAX_HOLD_SECONDS = 10;
export const MIN_CONFIRM_SECONDS = 1;
export const MAX_CONFIRM_SECONDS = 30;

export const ON_STATES = ['on', 'open', 'opening', 'true', 'locked', 'home'];

export function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : 'hold';
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function isOn(state) {
  return !!state && ON_STATES.includes(state.state);
}

export function resolveHoldMs(config, willActivate) {
  if (!config) return 0;
  if (config.mode === 'confirm') return 0;
  const hold = Number(config.hold_seconds);
  if (!hold || hold <= 0) return 0;
  if (!willActivate) return 500;
  return Math.round(clamp(hold, 0.1, MAX_HOLD_SECONDS) * 1000);
}

export function resolveConfirmMs(config) {
  const seconds = Number(config.confirm_seconds);
  if (!seconds || seconds <= 0) return 5000;
  return Math.round(clamp(seconds, MIN_CONFIRM_SECONDS, MAX_CONFIRM_SECONDS) * 1000);
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return 'Invalid configuration';
  }
  if (!config.entity || typeof config.entity !== 'string') {
    return 'You must define an entity';
  }
  if (config.mode !== undefined && !MODES.includes(config.mode)) {
    return `mode must be one of: ${MODES.join(', ')}`;
  }
  const hold = Number(config.hold_seconds);
  if (config.mode !== 'confirm' && (!hold || hold <= 0)) {
    return 'hold_seconds must be a positive number';
  }
  return null;
}

export function serviceFor(entityId, isCurrentlyOn) {
  const domain = String(entityId || '').split('.')[0];
  if (['input_boolean', 'switch', 'light', 'fan', 'humidifier'].includes(domain)) {
    return { domain, service: 'toggle' };
  }
  return {
    domain,
    service: isCurrentlyOn ? 'turn_off' : 'turn_on',
  };
}

const STRINGS = {
  en: {
    on: 'ON',
    off: 'OFF',
    hold_hint: 'Press and hold {seconds}s to activate',
    tap_hint: 'Tap, then confirm',
    hold_or_tap_hint: 'Hold {seconds}s, or tap and confirm',
    confirm_prompt: 'Tap again within {seconds}s to confirm',
    confirm_button: 'Confirm?',
    card_description: 'Toggle that requires hold or confirmation to activate',
  },
};

export function i18n(key, params, lang = 'en') {
  const table = STRINGS[lang] || STRINGS.en;
  let text = table[key] || STRINGS.en[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
