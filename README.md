# ha_widgets

Custom Lovelace widgets for Home Assistant. Small, focused cards built for the
things stock dashboards don't do well — starting with safety toggles that are
hard to trigger by accident from a phone.

## Widgets

### Hold/Confirm Toggle (`hold-confirm-toggle`)

A toggle card that won't switch on by accident. To **turn something ON** you
must either:

- **Hold** the button for a configurable duration (default 1.5s), or
- **Tap, then confirm** within a time window.

Turning something **off** always uses a short 0.5s hold (or the confirm flow),
so deactivating stays quick.

Useful for garage doors, heating, irons, pumps — anything you don't want
triggered by a pocket tap or a fumbled scroll.

![type: custom](https://img.shields.io/badge/type-custom-orange)

#### Options

| Name             | Type    | Default      | Description                                                                 |
| ---------------- | ------- | ------------ | --------------------------------------------------------------------------- |
| `type`           | string  | **required** | `custom:hold-confirm-toggle`                                                |
| `entity`         | string  | **required** | Entity to toggle (e.g. `switch.garage_door`)                                |
| `name`           | string  | friendly name | Card title                                                                  |
| `mode`           | string  | `hold`       | `hold` — hold to activate · `confirm` — tap then confirm · `both` — either   |
| `hold_seconds`   | number  | `1.5`        | How long to hold to activate (0.1–10, ignored in `confirm` mode)             |
| `confirm_seconds`| number | `5`          | How long the confirmation window stays open (1–30)                           |

#### Example

```yaml
type: custom:hold-confirm-toggle
entity: switch.garage_door
name: Garage Door
mode: both
hold_seconds: 2
confirm_seconds: 5
```

## Try it online

A browser demo is hosted on GitHub Pages — simulated entities, no Home
Assistant needed:

**[Open the demos](https://eikthyrnirlabs.github.io/ha_widgets/demo/)**

### Temperature Dial (`temp-dial`)

A circular dial for climate entities. Drag the knob (or anywhere on the dial)
to pick a temperature, then press **Accept** in the center within the
confirmation window. Nothing is sent to Home Assistant until you accept, and
an unconfirmed change reverts when the window expires.

#### Options

| Name              | Type    | Default      | Description                                          |
| ----------------- | ------- | ------------ | ---------------------------------------------------- |
| `type`            | string  | **required** | `custom:temp-dial`                                   |
| `entity`          | string  | **required** | Climate entity (e.g. `climate.heating`)              |
| `name`            | string  | friendly name | Card title                                          |
| `min`             | number  | `15`         | Dial minimum                                        |
| `max`             | number  | `30`         | Dial maximum                                        |
| `step`            | number  | `0.5`        | Rounding increment while dragging                   |
| `unit`            | string  | entity unit  | Unit shown next to the value (e.g. `°C`)            |
| `confirm_seconds` | number  | `5`          | How long the accept window stays open (1–30)        |
| `color`           | string  | theme color  | Single color for knob and fill (e.g. `#ff9800`)      |
| `low`             | number  | –            | Blue-green-red gradient: value shown as blue          |
| `mid`             | number  | –            | Gradient midpoint (green). Set all three or none     |
| `high`            | number  | –            | Gradient top (red)                                   |

If `low`, `mid` and `high` are all set, the knob and circle fill blend
blue → green → red across that range (overriding `color`). With none set,
`color` applies as a single color; with neither, the theme's primary color
is used.

#### Example

```yaml
type: custom:temp-dial
entity: climate.heating
min: 15
max: 30
step: 0.5
confirm_seconds: 5
```

## Using widgets in multiple rooms

Every card instance is fully independent: all state (config, pending
confirmations, hold timers, dial values) lives on the element instance, never
in shared module state. You can add the same widget type to any number of
dashboards and rooms with different entities, options, and simultaneous
interactions — an active confirmation on one card never affects another.
This is enforced by a multi-instance test in CI.

## Installation

### HACS (recommended)

1. Add this repository in HACS as a **Lovelace** custom repository:
   `https://github.com/eikthyrnirlabs/ha_widgets`
2. Install **ha_widgets**.
3. Add the resource (HACS usually does this automatically):

```yaml
resources:
  - type: js
    url: /hacsfiles/ha_widgets/ha_widgets.js
```

### Manual

1. Download [`dist/ha_widgets.js`](dist/ha_widgets.js).
2. Copy it to `<config>/www/ha_widgets.js`.
3. Add it under **Settings → Dashboards → Resources** (or in YAML):

```yaml
resources:
  - type: js
    url: /local/ha_widgets.js
```

## Development

- `npm test` — run unit tests (logic) and bundle checks
- `npm run build` — regenerate `dist/ha_widgets.js`
- `npm run lint` — eslint over `src/`, `test/`, `scripts/`

Each widget lives in its own module under `src/`. Widgets are plain custom
elements (no framework), so they load fast and work in any dashboard. Pure
logic (timing, config validation, service selection) is kept in `src/helpers.js`
so it can be unit-tested without a browser.

## License

[MIT](LICENSE)
