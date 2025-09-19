# Octopus Intelligent Wheel Card

A beautiful wheel-style card for Home Assistant that displays EV charging schedules in an intuitive circular format. **Compatible with both Octopus Intelligent and Ohme chargers**.

## Features

- 🎡 **Circular Wheel Display**: Visual representation of charge slots around a 24-hour clock
- ⚡ **Real-time Updates**: Automatically updates every minute to show current status
- 🎨 **Color-coded Slots**: 
  - Green: Currently active charging slot
  - Blue: Scheduled future charging slots
  - Gray: Past charging slots
- 📊 **Detailed Information**: Shows slot times, duration, and pricing
- 🔧 **Customizable**: Adjustable wheel size and number of slots displayed
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔌 **Multi-Charger Support**: Works with both Octopus Intelligent and Ohme chargers

## Installation

### Method 1: HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend" → "Explore & Download Repositories"
3. Search for "Octopus Intelligent Wheel Card"
4. Click "Download this repository with HACS"
5. Restart Home Assistant

### Method 2: Manual Installation

1. Download the `octopus-intelligent-wheel-card.js` file
2. Place it in your Home Assistant `www` folder
3. Add the resource to your Lovelace configuration:

```yaml
resources:
  - url: /local/octopus-intelligent-wheel-card.js
    type: module
```

## Configuration

### Basic Configuration

```yaml
type: custom:octopus-intelligent-wheel-card
entity: sensor.octopus_intelligent_charger
```

### Advanced Configuration

```yaml
type: custom:octopus-intelligent-wheel-card
entity: sensor.octopus_intelligent_charger
name: "My EV Charger"
wheel_size: 300
show_slots: 24
slot_duration: 30
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **Required** | The sensor entity that provides charge slot data |
| `name` | string | "Octopus Intelligent" | Display name for the card |
| `wheel_size` | number | 300 | Size of the wheel in pixels |
| `show_slots` | number | 24 | Number of slots to display |
| `slot_duration` | number | 30 | Default slot duration in minutes |

## Entity Requirements

The card expects your charger entity to have attributes containing charge slot information. It will look for data in the following attributes:

**Octopus Intelligent:**
- `next_slot_start`
- `next_slot_end`
- `charge_slots`
- `intelligent_slots`
- `scheduled_slots`
- `dispatches` (for Octopus dispatches entity)

**Ohme Chargers:**
- `slots`
- `charge_schedule`
- `scheduled_charges`
- `upcoming_slots`
- `next_charge`
- `current_slot`

### Expected Data Format

The card can handle various data formats from different charger types:

#### Octopus Intelligent Format
```json
{
  "attributes": {
    "charge_slots": [
      {
        "start": "2024-01-15T02:00:00Z",
        "end": "2024-01-15T04:00:00Z",
        "price": 0.05,
        "duration": 120
      }
    ],
    "intelligent_slots": [...],
    "scheduled_slots": [...]
  }
}
```

#### Octopus Dispatches Format
```json
{
  "attributes": {
    "dispatches": [
      {
        "start": "2024-01-15T02:00:00Z",
        "end": "2024-01-15T04:00:00Z",
        "price": 0.05
      }
    ]
  }
}
```

#### Ohme Charger Format
```json
{
  "attributes": {
    "slots": [
      {
        "start": "2024-01-15T02:00:00Z",
        "end": "2024-01-15T04:00:00Z",
        "duration": 120
      }
    ],
    "charge_schedule": [...],
    "scheduled_charges": [...]
  }
}
```

#### Ohme Time String Format
The card also supports Ohme's time string format:
```
"02:30-04:55" or "02:30-04:55 (7.5p/kWh)"
```

## Supported Chargers

This card is compatible with multiple EV charger types and their respective Home Assistant integrations:

### Octopus Intelligent Chargers
Works with the [Octopus Energy Home Assistant integration](https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy). Requirements:
1. The Octopus Energy integration installed
2. Your Octopus Intelligent tariff configured
3. Your EV charger connected and reporting to Home Assistant

### Ohme Chargers
Works with the [Ohme Home Assistant integration](https://github.com/home-assistant/core/tree/dev/homeassistant/components/ohme). Requirements:
1. The Ohme integration installed
2. Your Ohme charger connected and configured
3. Charging schedules being reported to Home Assistant

### Other Compatible Chargers
The card is designed to be flexible and may work with other EV charger integrations that provide similar charging schedule data in their sensor attributes.

## Troubleshooting

### Card Not Displaying

1. Check that the entity exists in Home Assistant
2. Verify the entity has charge slot data in its attributes
3. Check the browser console for any JavaScript errors

### No Charge Slots Showing

**For Octopus Intelligent:**
1. Ensure your Octopus Intelligent tariff is active
2. Check that your EV is plugged in and connected
3. Verify the integration is receiving data from Octopus

**For Ohme Chargers:**
1. Ensure your Ohme charger is connected and online
2. Check that charging schedules are being generated
3. Verify the Ohme integration is receiving data from your charger
4. Make sure your EV is plugged in and the charger is in intelligent mode

### Styling Issues

The card uses Home Assistant's CSS variables for theming. If you have custom themes, ensure they define:
- `--card-background-color`
- `--primary-text-color`
- `--secondary-text-color`
- `--primary-color`

## Examples

### Multiple Chargers (Mixed Types)

```yaml
type: vertical-stack
cards:
  - type: custom:octopus-intelligent-wheel-card
    entity: sensor.octopus_intelligent_charger
    name: "Octopus Intelligent Charger"
    wheel_size: 250
  - type: custom:octopus-intelligent-wheel-card
    entity: sensor.ohme_charger
    name: "Ohme Charger"
    wheel_size: 250
```

### In a Grid Layout

```yaml
type: grid
columns: 2
square: false
cards:
  - type: custom:octopus-intelligent-wheel-card
    entity: sensor.your_charger_entity
    name: "Charging Schedule"
  - type: entities
    entities:
      - sensor.your_charger_entity
      - sensor.ev_battery_level
      - sensor.electricity_price
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information about your setup

## Changelog

### Version 1.0.0
- Initial release
- Basic wheel card functionality
- Support for Octopus Intelligent charge slots
- Support for Ohme charger schedules
- Real-time updates
- Customizable appearance
- Multi-charger compatibility
