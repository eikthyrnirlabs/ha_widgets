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


/* --- dial-helpers.js --- */

const DEFAULT_DIAL_CONFIG = Object.freeze({
  entity: '',
  name: '',
  step: 0.5,
  min: 15,
  max: 30,
  unit: '°C',
  confirm_seconds: 5,
});

function validateDialConfig(config) {
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

function normalizeDialConfig(config) {
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

function roundToStep(value, step) {
  const safeStep = step > 0 ? step : 0.5;
  return Math.round(value / safeStep) * safeStep;
}

const DIAL_MIN_ANGLE = -150;
const DIAL_MAX_ANGLE = 150;

function angleToValue(angleDeg, min, max) {
  const ratio = clamp((angleDeg - DIAL_MIN_ANGLE) / (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE), 0, 1);
  return min + ratio * (max - min);
}

function valueToAngle(value, min, max) {
  if (max <= min) return DIAL_MIN_ANGLE;
  const ratio = clamp((value - min) / (max - min), 0, 1);
  return DIAL_MIN_ANGLE + ratio * (DIAL_MAX_ANGLE - DIAL_MIN_ANGLE);
}

function pointerToAngle(cx, cy, px, py) {
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

function dialI18n(key, params, lang = 'en') {
  const table = DIAL_STRINGS[lang] || DIAL_STRINGS.en;
  let text = table[key] || DIAL_STRINGS.en[key] || key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}


/* --- hold-confirm-toggle.js --- */

const cardTemplate = document.createElement('template');
cardTemplate.innerHTML = `
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
    this.shadowRoot.appendChild(cardTemplate.content.cloneNode(true));
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


/* --- temp-dial.js --- */


const dialTemplate = document.createElement('template');
dialTemplate.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--ha-card-background, var(--card-background-color, #fff));
      box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,.1));
      border: 2px solid transparent;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .card.pending {
      border-color: var(--warning-color, #ffa500);
    }
    .name {
      font-weight: 500;
      font-size: 16px;
      color: var(--primary-text-color, #212121);
    }
    .dial-wrap {
      position: relative;
      width: 180px;
      height: 180px;
    }
    svg.track {
      position: absolute;
      inset: 0;
    }
    .arc-track {
      fill: none;
      stroke: var(--secondary-background-color, #e5e5e5);
      stroke-width: 14;
      stroke-linecap: round;
    }
    .arc-value {
      fill: none;
      stroke: var(--primary-color, #03a9f4);
      stroke-width: 14;
      stroke-linecap: round;
    }
    .arc-pending {
      fill: none;
      stroke: var(--warning-color, #ffa500);
      stroke-width: 14;
      stroke-linecap: round;
    }
    .knob {
      position: absolute;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      border: 3px solid var(--card-background-color, #fff);
      box-shadow: 0 1px 4px rgba(0,0,0,.3);
      cursor: grab;
      transform: translate(-50%, -50%);
    }
    .knob:active { cursor: grabbing; }
    .center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      pointer-events: none;
    }
    .value {
      font-size: 34px;
      font-weight: 600;
      color: var(--primary-text-color, #212121);
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: 13px;
      color: var(--secondary-text-color, #727272);
    }
    .accept-btn {
      pointer-events: auto;
      border: none;
      border-radius: 20px;
      padding: 5px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color, #03a9f4);
      display: none;
    }
    .accept-btn.visible { display: inline-block; }
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
  <div class="card">
    <div class="name"></div>
    <div class="dial-wrap">
      <svg class="track" viewBox="0 0 200 200">
        <path class="arc-track"></path>
        <path class="arc-value"></path>
        <path class="arc-pending"></path>
      </svg>
      <div class="knob"></div>
      <div class="center">
        <div class="value"></div>
        <div class="unit"></div>
        <button class="accept-btn" type="button"></button>
      </div>
    </div>
    <div class="hint"></div>
  </div>
  <div class="missing" hidden></div>
`;

const START_ANGLE = -150;
const SWEEP = 300;

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, fromAngle, toAngle) {
  if (toAngle - fromAngle < 0.5) {
    return '';
  }
  const [x1, y1] = polar(cx, cy, r, fromAngle);
  const [x2, y2] = polar(cx, cy, r, toAngle);
  const large = toAngle - fromAngle > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

class TempDial extends HTMLElement {
  static getStubConfig() {
    return { ...DEFAULT_DIAL_CONFIG, entity: 'climate.example' };
  }

  static get displayName() {
    return 'Temperature Dial';
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(dialTemplate.content.cloneNode(true));
    this._hass = null;
    this.config = { ...DEFAULT_DIAL_CONFIG };
    this._dragging = false;
    this._pendingValue = null;
    this._confirmTimer = null;
    this._confirmTicker = null;
    this._confirmExpiresAt = 0;
    this._boundPointerMove = (e) => this._onPointerMove(e);
    this._boundPointerUp = () => this._onPointerUp();
  }

  set hass(value) {
    this._hass = value;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  setConfig(config) {
    const error = validateDialConfig(config);
    if (error) throw new Error(error);
    this.config = normalizeDialConfig(config);
    this._clearConfirm();
    this._suppressClick = false;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_rows: 3, max_rows: 4 };
  }

  get _entity() {
    return this.hass ? this.hass.states[this.config.entity] : null;
  }

  get _currentValue() {
    const entity = this._entity;
    if (!entity) return null;
    const temp =
      entity.attributes &&
      (entity.attributes.temperature ??
        entity.attributes.current_temperature ??
        null);
    return temp === null ? null : Number(temp);
  }

  get _unit() {
    const entity = this._entity;
    const fromEntity = entity && entity.attributes && entity.attributes.unit_of_measurement;
    return this.config.unit || fromEntity || '°C';
  }

  get _displayValue() {
    return this._pendingValue !== null ? this._pendingValue : this._currentValue;
  }

  connectedCallback() {
    const wrap = this.shadowRoot.querySelector('.dial-wrap');
    wrap.addEventListener('pointerdown', (e) => this._onDialPointerDown(e));
    const knob = this.shadowRoot.querySelector('.knob');
    knob.addEventListener('pointerdown', (e) => this._onDialPointerDown(e));
    const accept = this.shadowRoot.querySelector('.accept-btn');
    accept.addEventListener('click', (e) => this._onAccept(e));
    document.addEventListener('pointermove', this._boundPointerMove);
    document.addEventListener('pointerup', this._boundPointerUp);
    document.addEventListener('pointercancel', this._boundPointerUp);
    this._render();
  }

  disconnectedCallback() {
    document.removeEventListener('pointermove', this._boundPointerMove);
    document.removeEventListener('pointerup', this._boundPointerUp);
    document.removeEventListener('pointercancel', this._boundPointerUp);
    this._clearConfirm();
  }

  _callService(value) {
    if (!this.hass || !this.hass.callService) return;
    const domain = this.config.entity.split('.')[0];
    this.hass.callService(domain, 'set_temperature', {
      entity_id: this.config.entity,
      temperature: value,
    });
  }

  _onDialPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this._clearConfirm();
    this._dragging = true;
    this._updateFromPointer(e);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._updateFromPointer(e);
  }

  _onPointerUp() {
    if (!this._dragging) return;
    this._dragging = false;
    if (this._pendingValue === null || this._pendingValue === this._currentValue) {
      this._render();
      return;
    }
    this._beginConfirm();
  }

  _updateFromPointer(e) {
    const wrap = this.shadowRoot.querySelector('.dial-wrap');
    const rect = wrap.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const a = pointerToAngle(cx, cy, e.clientX, e.clientY);
    let t = a > 180 ? a - 360 : a;
    t = clamp(t, -150, 150);
    const raw = angleToValue(t, this.config.min, this.config.max);
    this._pendingValue = roundToStep(raw, this.config.step);
    this._render();
  }

  _beginConfirm() {
    this._clearConfirm();
    const ms = resolveConfirmMs(this.config);
    this._confirmExpiresAt = Date.now() + ms;
    this._confirmTimer = setTimeout(() => {
      this._confirmTimer = null;
      this._pendingValue = null;
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
    this._render();
  }

  get _confirmPendingView() {
    return this._pendingValue !== null;
  }

  _onAccept(e) {
    e.stopPropagation();
    if (this._pendingValue === null) return;
    const value = this._pendingValue;
    this._pendingValue = null;
    this._clearConfirm();
    this._callService(value);
  }

  _hint() {
    if (this._pendingValue !== null && this._pendingValue !== this._currentValue) {
      const remaining = Math.max(
        0,
        Math.ceil((this._confirmExpiresAt - Date.now()) / 1000)
      );
      return dialI18n('accept_hint', { seconds: remaining });
    }
    return dialI18n('dial_hint');
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
    const value = this._displayValue;
    const pending = this._pendingValue !== null && this._pendingValue !== this._currentValue;
    const angle = value === null ? 0 : valueToAngle(value, this.config.min, this.config.max);
    this.shadowRoot.querySelector('.value').textContent =
      value === null ? '--' : String(Math.round(value * 10) / 10);
    this.shadowRoot.querySelector('.unit').textContent = this._unit;
    const cx = 100;
    const cy = 100;
    const r = 78;
    this.shadowRoot.querySelector('.arc-track').setAttribute(
      'd',
      arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP)
    );
    const valueArc = this.shadowRoot.querySelector('.arc-value');
    valueArc.setAttribute('d', arcPath(cx, cy, r, START_ANGLE, START_ANGLE + angle));
    this.shadowRoot.querySelector('.arc-pending').setAttribute('d', '');
    const [kx, ky] = polar(cx, cy, r, angle);
    const knob = this.shadowRoot.querySelector('.knob');
    knob.style.left = `${kx / 2}%`;
    knob.style.top = `${ky / 2}%`;
    const accept = this.shadowRoot.querySelector('.accept-btn');
    const showAccept = pending;
    accept.classList.toggle('visible', showAccept);
    if (showAccept) {
      accept.textContent = dialI18n('accept');
    }
    const hint = this.shadowRoot.querySelector('.hint');
    hint.textContent = this._hint();
    hint.classList.toggle('warning', pending);
    card.classList.toggle('pending', pending);
  }
}

customElements.define('temp-dial', TempDial);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'temp-dial',
  name: 'Temperature Dial',
  description: dialI18n('dial_description'),
  preview: false,
  documentationURL: 'https://github.com/eikthyrnirlabs/ha_widgets',
});


})();
