import {
  DEFAULT_CONFIG,
  clamp,
  isOn,
  i18n,
  normalizeMode,
  resolveConfirmMs,
  resolveHoldMs,
  serviceFor,
  validateConfig,
} from './helpers.js';

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

export class HoldConfirmToggle extends HTMLElement {
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
    this.hass = null;
    this.config = { ...DEFAULT_CONFIG };
    this._confirmPending = false;
    this._holdActive = false;
    this._holdTimer = null;
    this._confirmTimer = null;
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
    this._beginConfirm();
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
    this._confirmTimer = setTimeout(() => {
      this._confirmPending = false;
      this._render();
    }, resolveConfirmMs(this.config));
    this._render();
  }

  _clearConfirm() {
    clearTimeout(this._confirmTimer);
    this._confirmTimer = null;
    if (this._confirmPending) {
      this._confirmPending = false;
      this._render();
    }
  }

  _onClick(e) {
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
      return i18n('confirm_prompt', { seconds: this.config.confirm_seconds });
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

  _render() {
    if (!this.shadowRoot) return;
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
