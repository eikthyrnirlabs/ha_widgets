/*! ha_widgets bundle — generated, do not edit */
(function () {
'use strict';

/* --- helpers.js --- */
const MODES = ['hold', 'confirm', 'both'];

const DEFAULT_CONFIG = Object.freeze({
  entity: '',
  name: '',
  mode: 'hold',
  hold_seconds: 1.5,
  confirm_seconds: 5,
});

const MAX_HOLD_SECONDS = 10;
const MIN_CONFIRM_SECONDS = 1;
const MAX_CONFIRM_SECONDS = 30;

const ON_STATES = ['on', 'open', 'opening', 'true', 'locked', 'home'];

function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : 'hold';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isOn(state) {
  return !!state && ON_STATES.includes(state.state);
}

function resolveHoldMs(config, willActivate) {
  if (!config) return 0;
  if (config.mode === 'confirm') return 0;
  const hold = Number(config.hold_seconds);
  if (!hold || hold <= 0) return 0;
  if (!willActivate) return 500;
  return Math.round(clamp(hold, 0.1, MAX_HOLD_SECONDS) * 1000);
}

function resolveConfirmMs(config) {
  const seconds = Number(config.confirm_seconds);
  if (!seconds || seconds <= 0) return 5000;
  return Math.round(clamp(seconds, MIN_CONFIRM_SECONDS, MAX_CONFIRM_SECONDS) * 1000);
}

function validateConfig(config) {
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

function serviceFor(entityId, isCurrentlyOn) {
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

function i18n(key, params, lang = 'en') {
  const table = STRINGS[lang] || STRINGS.en;
  let text = table[key] || STRINGS.en[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}


/* --- hold-confirm-toggle.js --- */

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--ha-card-background, var(--card-background-color, #fff));
      box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,.1));
      cursor: pointer;
      position: relative;
      overflow: hidden;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      border: 2px solid transparent;
    }
    .card.pending {
      border-color: var(--warning-color, #ffa500);
    }
    .header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .name {
      font-weight: 500;
      font-size: 16px;
      color: var(--primary-text-color, #212121);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .state {
      font-size: 14px;
      color: var(--secondary-text-color, #727272);
      text-transform: capitalize;
    }
    .button {
      height: 52px;
      border-radius: 10px;
      background: var(--secondary-background-color, #e5e5e5);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 600;
      color: var(--primary-text-color, #212121);
      overflow: hidden;
    }
    .button.on {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    .bar {
      position: absolute;
      inset: 0;
      width: 0%;
      background: var(--primary-color, #03a9f4);
      opacity: .3;
    }
    .button.on .bar {
      background: var(--text-primary-color, #fff);
    }
    .label {
      position: relative;
      z-index: 1;
    }
    .hint {
      font-size: 12px;
      text-align: center;
      color: var(--secondary-text-color, #727272);
    }
    .hint.warning {
      color: var(--warning-color, #ffa500);
      font-weight: 600;
    }
    .missing {
      padding: 16px;
      color: var(--error-color, #db4437);
    }
  </style>
  <div class="card" part="card">
    <div class="header">
      <div class="name"></div>
      <div class="state"></div>
    </div>
    <div class="button">
      <div class="bar"></div>
      <div class="label"></div>
    </div>
    <div class="hint"></div>
  </div>
  <div class="missing" hidden></div>
`;

class HoldConfirmToggle extends HTMLElement {
  static getStubConfig() {
    return { ...DEFAULT_CONFIG, entity: 'switch.example' };
  }

  static get displayName() {
    return 'Hold/Confirm Toggle';
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._hass = null;
    this.config = { ...DEFAULT_CONFIG };
    this._confirmPending = false;
    this._holdActive = false;
    this._holdTimer = null;
    this._confirmTimer = null;
    this._confirmTicker = null;
    this._confirmExpiresAt = 0;
    this._suppressClick = false;
    this._boundPointerUp = () => this._finishHold(false);
    this._boundPointerCancel = () => this._finishHold(true);
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  setConfig(config) {
    const error = validateConfig(config);
    if (error) throw new Error(error);
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      mode: normalizeMode(config.mode),
    };
    this._clearConfirm();
    this._cancelHold();
    this._suppressClick = false;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_rows: 2, max_rows: 3 };
  }

  get _entity() {
    return this.hass ? this.hass.states[this.config.entity] : null;
  }

  get _isOn() {
    return isOn(this._entity);
  }

  get _holdMs() {
    return resolveHoldMs(this.config, !this._isOn);
  }

  connectedCallback() {
    document.addEventListener('pointerup', this._boundPointerUp);
    document.addEventListener('pointercancel', this._boundPointerCancel);
    this.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.addEventListener('click', (e) => this._onClick(e));
    this._render();
  }

  disconnectedCallback() {
    document.removeEventListener('pointerup', this._boundPointerUp);
    document.removeEventListener('pointercancel', this._boundPointerCancel);
    this._cancelHold();
    this._clearConfirm();
  }

  _callService() {
    const { domain, service } = serviceFor(this.config.entity, this._isOn);
    if (this.hass && this.hass.callService) {
      this.hass.callService(domain, service, { entity_id: this.config.entity });
    }
  }

  _onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this._suppressClick = false;
    if (this._confirmPending) return;
    const ms = this._holdMs;
    if (!ms) return;
    this._holdActive = true;
    this._holdStartedAt = Date.now();
    const bar = this.shadowRoot.querySelector('.bar');
    bar.style.transition = `width ${ms}ms linear`;
    bar.style.width = '100%';
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      this._holdActive = false;
      this._resetBar();
      this._callService();
    }, ms);
  }

  _finishHold(cancelled) {
    if (!this._holdActive) return;
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
    this._holdActive = false;
    this._resetBar();
    if (cancelled) return;
    if (this.config.mode === 'hold') return;
    this._suppressClick = true;
    this._beginConfirm();
  }

  _cancelHold() {
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
    this._holdActive = false;
    this._resetBar();
  }

  _resetBar() {
    const bar = this.shadowRoot.querySelector('.bar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = '0%';
  }

  _beginConfirm() {
    this._clearConfirm();
    this._confirmPending = true;
    const ms = resolveConfirmMs(this.config);
    this._confirmExpiresAt = Date.now() + ms;
    this._confirmTimer = setTimeout(() => {
      this._confirmTimer = null;
      this._clearConfirm();
    }, ms);
    this._confirmTicker = setInterval(() => this._render(), 200);
    this._render();
  }

  _clearConfirm() {
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
    clearInterval(this._confirmTicker);
    this._confirmTicker = null;
    this._confirmExpiresAt = 0;
    this._resetBar();
    if (this._confirmPending) {
      this._confirmPending = false;
      this._render();
    }
  }

  _onClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    if (this._confirmPending) {
      const button = e.composedPath().find(
        (el) => el.classList && el.classList.contains('button')
      );
      if (button) {
        this._clearConfirm();
        this._callService();
        return;
      }
      this._clearConfirm();
      return;
    }
    if (this._holdMs) return;
    this._beginConfirm();
  }

  _hint() {
    if (this._confirmPending) {
      const remaining = Math.max(
        0,
        Math.ceil((this._confirmExpiresAt - Date.now()) / 1000)
      );
      return i18n('confirm_prompt', { seconds: remaining });
    }
    const holdMs = this._holdMs;
    if (holdMs) {
      const seconds = (holdMs / 1000).toFixed(1).replace(/\.0$/, '');
      return i18n(
        this.config.mode === 'both' ? 'hold_or_tap_hint' : 'hold_hint',
        { seconds }
      );
    }
    return i18n('tap_hint');
  }

  _confirmBarRatio() {
    if (!this._confirmPending || !this._confirmExpiresAt) return 0;
    const total = resolveConfirmMs(this.config);
    const remaining = Math.max(0, this._confirmExpiresAt - Date.now());
    return total ? remaining / total : 0;
  }

  _render() {
    if (!this.shadowRoot || !this.config) return;
    const card = this.shadowRoot.querySelector('.card');
    const missing = this.shadowRoot.querySelector('.missing');
    const entity = this._entity;
    if (!entity) {
      card.hidden = true;
      missing.hidden = false;
      missing.textContent = `Entity not found: ${this.config.entity}`;
      return;
    }
    card.hidden = false;
    missing.hidden = true;
    const name =
      this.config.name ||
      (entity.attributes && entity.attributes.friendly_name) ||
      this.config.entity;
    this.shadowRoot.querySelector('.name').textContent = name;
    this.shadowRoot.querySelector('.state').textContent = entity.state;
    const button = this.shadowRoot.querySelector('.button');
    button.classList.toggle('on', this._isOn);
    button.classList.toggle('pending', this._confirmPending);
    this.shadowRoot.querySelector('.label').textContent = this._confirmPending
      ? i18n('confirm_button')
      : i18n(this._isOn ? 'on' : 'off');
    const hint = this.shadowRoot.querySelector('.hint');
    hint.textContent = this._hint();
    hint.classList.toggle('warning', this._confirmPending);
    card.classList.toggle('pending', this._confirmPending);
    const bar = this.shadowRoot.querySelector('.bar');
    if (this._confirmPending) {
      bar.style.transition = 'none';
      bar.style.width = `${Math.round(this._confirmBarRatio() * 100)}%`;
    } else if (!this._holdActive) {
      this._resetBar();
    }
  }
}

customElements.define('hold-confirm-toggle', HoldConfirmToggle);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hold-confirm-toggle',
  name: 'Hold/Confirm Toggle',
  description: i18n('card_description'),
  preview: false,
  documentationURL: 'https://github.com/eikthyrnirlabs/ha_widgets',
});


})();
