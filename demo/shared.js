export function createHass(states, { onCall } = {}) {
  const hass = {
    states,
    callService(domain, service, data) {
      const entity = states[data.entity_id];
      if (service === 'toggle') {
        entity.state = entity.state === 'on' ? 'off' : 'on';
      } else if (service === 'turn_on') {
        entity.state = 'on';
      } else if (service === 'turn_off') {
        entity.state = 'off';
      } else if (service === 'set_temperature') {
        entity.attributes.temperature = data.temperature;
      }
      for (const card of document.querySelectorAll('hold-confirm-toggle, temp-dial')) {
        card.hass = hass;
      }
      if (onCall) onCall(domain, service, data);
    },
  };
  return hass;
}

export function createLog(targetId) {
  const logEl = document.getElementById(targetId);
  let logged = false;
  return (domain, service, entityId) => {
    if (!logged) {
      logEl.innerHTML = '';
      logged = true;
    }
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString();
    li.innerHTML = `<span class="svc">${domain}.${service}</span>(${entityId}) at ${time}`;
    logEl.prepend(li);
  };
}

export function configToYaml(config, type) {
  const keys = [
    'entity',
    'name',
    'mode',
    'hold_seconds',
    'confirm_seconds',
    'min',
    'max',
    'step',
    'unit',
    'color',
    'low',
    'mid',
    'high',
    'humidity_entity',
  ];
  const lines = [['type', 'custom:' + type]];
  for (const k of keys) {
    if (config[k] !== undefined) lines.push([k, config[k]]);
  }
  return lines
    .map(([k, v]) => `<span class="k">${k}:</span> ${v}`)
    .join('\n');
}

export function renderCard(grid, tagName, config, hass) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const card = document.createElement(tagName);
  card.setConfig(config);
  card.hass = hass;
  const pre = document.createElement('div');
  pre.className = 'config';
  pre.innerHTML = configToYaml(config, tagName);
  cell.appendChild(card);
  cell.appendChild(pre);
  grid.appendChild(cell);
  return card;
}
