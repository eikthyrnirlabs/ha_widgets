import {
  DEFAULT_DIAL_CONFIG,
  dialI18n,
  normalizeDialConfig,
  pointerToAngle,
  resolveDialColor,
  roundToStep,
  validateDialConfig,
  valueToAngle,
  angleToValue,
} from './dial-helpers.js';
import { clamp, resolveConfirmMs } from './helpers.js';

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

export class TempDial extends HTMLElement {
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
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.accept-btn')) return;
      this._onDialPointerDown(e);
    });
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

  _onAccept(e) {
    e.stopPropagation();
    e.preventDefault();
    if (this._pendingValue === null) return;
    const value = this._pendingValue;
    this._pendingValue = null;
    this._clearConfirm();
    this._callService(value);
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
    valueArc.setAttribute('d', arcPath(cx, cy, r, START_ANGLE, angle));
    this.shadowRoot.querySelector('.arc-pending').setAttribute('d', '');
    const dialColor = resolveDialColor(value, this.config);
    if (dialColor) {
      valueArc.style.stroke = dialColor;
    } else {
      valueArc.style.stroke = '';
    }
    const [kx, ky] = polar(cx, cy, r, angle);
    const knob = this.shadowRoot.querySelector('.knob');
    knob.style.left = `${kx / 2}%`;
    knob.style.top = `${ky / 2}%`;
    if (dialColor) {
      knob.style.background = dialColor;
    } else {
      knob.style.background = '';
    }
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
