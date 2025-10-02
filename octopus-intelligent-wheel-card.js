// Version information
const VERSION = '1.0.2';

class OctopusIntelligentWheelCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.chargeSlots = [];
    this.currentTime = new Date();
    this.updateInterval = null;
  }

  static get properties() {
    return {
      hass: Object,
      config: Object,
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this.config = {
      name: 'Octopus Intelligent',
      show_slots: 24,
      wheel_size: 300,
      slot_duration: 30,
      charger_type: 'auto', // 'ohme', 'zappi', or 'auto'
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.updateCard();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this.updateInterval = setInterval(() => {
      this.currentTime = new Date();
      this.updateCard();
    }, 60000); // Update every minute
  }

  disconnectedCallback() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  updateCard() {
    if (!this._hass || !this.config) return;

    const entity = this._hass.states[this.config.entity];
    if (!entity) {
      this.renderError('Entity not found');
      return;
    }

    // Parse charge slots from entity attributes
    this.chargeSlots = this.parseChargeSlots(entity.attributes);
    
    // Debug: Log entity data to console
    console.log('=== OCTOPUS WHEEL CARD DEBUG ===');
    console.log('Entity:', this.config.entity);
    console.log('State:', entity.state);
    console.log('Attributes:', entity.attributes);
    console.log('Charger Type:', this.config.charger_type);
    console.log('Parsed charge slots:', this.chargeSlots);
    console.log('Number of charge slots:', this.chargeSlots.length);
    
    // Debug each individual charge slot
    this.chargeSlots.forEach((slot, index) => {
      console.log(`Charge Slot ${index + 1}:`, {
        start: new Date(slot.start).toLocaleString(),
        end: new Date(slot.end).toLocaleString(),
        duration: slot.duration,
        isActive: slot.isActive
      });
    });
    console.log('================================');
    
    // If no real charge slots found, don't render anything
    if (this.chargeSlots.length === 0) {
      this.renderEmpty();
      return;
    }
    
    this.render();
  }

  parseChargeSlots(attributes) {
    const slots = [];
    
    // Auto-detect charger type if not specified
    let chargerType = this.config.charger_type;
    if (chargerType === 'auto') {
      chargerType = this.detectChargerType(attributes);
    }
    
    console.log('Detected/configured charger type:', chargerType);
    
    // Look for common Octopus Intelligent and OHME attributes
    const possibleAttributes = [
      'next_slot_start',
      'next_slot_end',
      'charge_slots',
      'intelligent_slots',
      'scheduled_slots',
      // Octopus dispatches format
      'dispatches',
      'upcoming_dispatches',
      'scheduled_dispatches',
      'next_dispatch',
      // OHME specific attributes
      'slots',
      'charge_schedule',
      'scheduled_charges',
      'upcoming_slots',
      'next_charge',
      'current_slot',
      // Zappi specific attributes
      'planned_dispatches',
      'next_start',
      'next_end',
      'current_start',
      'current_end',
      // Pricing attributes
      'current_price',
      'tariff_rate',
      'electricity_price',
      'octopus_price',
      'rate',
      'price'
    ];

    // Debug: Log all attributes to see what's available
    console.log('Charger Sensor Attributes:', attributes);
    console.log('All sensor attributes:', Object.keys(attributes));

    // Try to find charge slot data in various possible attributes
    for (const attr of possibleAttributes) {
      if (attributes[attr]) {
        console.log(`Found attribute: ${attr}`, attributes[attr]);
        if (Array.isArray(attributes[attr])) {
          // Handle different dispatch formats based on charger type
          if (attr === 'dispatches' || attr === 'upcoming_dispatches' || attr === 'scheduled_dispatches') {
            const dispatchSlots = this.parseOctopusDispatches(attributes[attr]);
            slots.push(...dispatchSlots);
          } else if (attr === 'planned_dispatches' && chargerType === 'zappi') {
            // Handle Zappi planned_dispatches format
            console.log('=== CALLING ZAPPI PARSER ===');
            console.log('Attribute:', attr);
            console.log('Charger type:', chargerType);
            console.log('Data:', attributes[attr]);
            const zappiSlots = this.parseZappiDispatches(attributes[attr]);
            console.log('Zappi slots returned:', zappiSlots);
            slots.push(...zappiSlots);
            console.log('Total slots after Zappi parsing:', slots.length);
          } else {
            slots.push(...attributes[attr]);
          }
        } else if (typeof attributes[attr] === 'object') {
          slots.push(attributes[attr]);
        }
      }
    }

    // If no slots found in attributes, check if the sensor state itself contains slot data
    if (slots.length === 0 && this._hass && this._hass.states[this.config.entity]) {
      const entityState = this._hass.states[this.config.entity];
      console.log('Entity state:', entityState);
      
      // Check if the state itself is an array of slots
      if (Array.isArray(entityState.state)) {
        slots.push(...entityState.state);
      } else if (typeof entityState.state === 'string' && entityState.state.includes('-') && chargerType === 'ohme') {
        // Handle OHME format like "02:30-04:55" or multiple slots (only for OHME chargers)
        const ohmeSlots = this.parseOHMEState(entityState.state, entityState.attributes);
        if (ohmeSlots) {
          if (Array.isArray(ohmeSlots)) {
            slots.push(...ohmeSlots);
          } else {
            slots.push(ohmeSlots);
          }
        }
      }
    }

    console.log('Parsed slots:', slots);
    return this.processSlots(slots);
  }

  detectChargerType(attributes) {
    console.log('=== CHARGER TYPE DETECTION ===');
    console.log('Attributes for detection:', attributes);
    console.log('Provider:', attributes.provider);
    console.log('Has planned_dispatches:', !!attributes.planned_dispatches);
    console.log('Has next_start:', !!attributes.next_start);
    console.log('Has next_end:', !!attributes.next_end);
    
    // Check for Zappi-specific attributes
    if (attributes.provider === 'MYENERGI' || 
        attributes.planned_dispatches || 
        attributes.next_start || 
        attributes.next_end) {
      console.log('-> Detected ZAPPI charger type');
      return 'zappi';
    }
    
    // Check for OHME-specific attributes or time string format
    if (this._hass && this._hass.states[this.config.entity]) {
      const entityState = this._hass.states[this.config.entity];
      console.log('Entity state for OHME detection:', entityState.state);
      if (typeof entityState.state === 'string' && entityState.state.includes('-')) {
        console.log('-> Detected OHME charger type');
        return 'ohme';
      }
    }
    
    // Default to ohme for backward compatibility
    console.log('-> Defaulting to OHME charger type');
    return 'ohme';
  }

  parseZappiDispatches(plannedDispatches) {
    console.log('=== ZAPPI DISPATCH PARSING DEBUG ===');
    console.log('Raw planned_dispatches:', plannedDispatches);
    console.log('Number of dispatches:', plannedDispatches.length);
    
    const slots = [];
    
    for (let i = 0; i < plannedDispatches.length; i++) {
      const dispatch = plannedDispatches[i];
      console.log(`Processing dispatch ${i + 1}:`, dispatch);
      console.log('Dispatch keys:', Object.keys(dispatch));
      
      // Zappi dispatches typically have start/end times
      let start, end;
      
      // Try different possible field names for start time
      if (dispatch.start) {
        start = new Date(dispatch.start);
        console.log(`  -> Found start: ${dispatch.start} -> ${start.toISOString()}`);
      } else if (dispatch.start_time) {
        start = new Date(dispatch.start_time);
        console.log(`  -> Found start_time: ${dispatch.start_time} -> ${start.toISOString()}`);
      } else if (dispatch.startTime) {
        start = new Date(dispatch.startTime);
        console.log(`  -> Found startTime: ${dispatch.startTime} -> ${start.toISOString()}`);
      } else if (dispatch.from) {
        start = new Date(dispatch.from);
        console.log(`  -> Found from: ${dispatch.from} -> ${start.toISOString()}`);
      } else if (dispatch.begin) {
        start = new Date(dispatch.begin);
        console.log(`  -> Found begin: ${dispatch.begin} -> ${start.toISOString()}`);
      } else if (dispatch.dispatch_start) {
        start = new Date(dispatch.dispatch_start);
        console.log(`  -> Found dispatch_start: ${dispatch.dispatch_start} -> ${start.toISOString()}`);
      } else {
        console.log(`  -> No start time found in dispatch ${i + 1}`);
      }
      
      // Try different possible field names for end time
      if (dispatch.end) {
        end = new Date(dispatch.end);
        console.log(`  -> Found end: ${dispatch.end} -> ${end.toISOString()}`);
      } else if (dispatch.end_time) {
        end = new Date(dispatch.end_time);
        console.log(`  -> Found end_time: ${dispatch.end_time} -> ${end.toISOString()}`);
      } else if (dispatch.endTime) {
        end = new Date(dispatch.endTime);
        console.log(`  -> Found endTime: ${dispatch.endTime} -> ${end.toISOString()}`);
      } else if (dispatch.to) {
        end = new Date(dispatch.to);
        console.log(`  -> Found to: ${dispatch.to} -> ${end.toISOString()}`);
      } else if (dispatch.finish) {
        end = new Date(dispatch.finish);
        console.log(`  -> Found finish: ${dispatch.finish} -> ${end.toISOString()}`);
      } else if (dispatch.dispatch_end) {
        end = new Date(dispatch.dispatch_end);
        console.log(`  -> Found dispatch_end: ${dispatch.dispatch_end} -> ${end.toISOString()}`);
      } else {
        console.log(`  -> No end time found in dispatch ${i + 1}`);
      }
      
      // If we couldn't parse dates, skip this dispatch
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.log(`  -> Could not parse dates for dispatch ${i + 1}, skipping`);
        console.log(`  -> Start valid: ${!!start && !isNaN(start.getTime())}, End valid: ${!!end && !isNaN(end.getTime())}`);
        continue;
      }
      
      const duration = Math.round((end - start) / (1000 * 60)); // Duration in minutes
      
      const slot = {
        start: start.toISOString(),
        end: end.toISOString(),
        duration,
        price: dispatch.price || dispatch.cost || dispatch.rate || dispatch.tariff_rate || 0,
        isActive: this.isSlotActive(start, end),
        source: 'zappi_dispatch'
      };
      
      console.log(`  -> Created slot:`, slot);
      slots.push(slot);
    }
    
    console.log('Final parsed Zappi dispatch slots:', slots);
    console.log('=====================================');
    return slots;
  }


  parseOHMEState(stateString, attributes = {}) {
    console.log('=== OHME STATE PARSING DEBUG ===');
    console.log('Parsing OHME state:', stateString);
    console.log('Current time:', new Date().toLocaleString());
    
    // Handle multiple slots separated by commas, semicolons, or newlines
    const slotStrings = stateString.split(/[,;\n]/).map(s => s.trim()).filter(s => s);
    console.log('Original state string:', stateString);
    console.log('Split slot strings:', slotStrings);
    console.log('Number of slot strings:', slotStrings.length);
    
    // Debug each individual slot string
    slotStrings.forEach((slotStr, index) => {
      console.log(`Slot ${index + 1}: "${slotStr}"`);
    });
    const slots = [];
    
    // First pass: parse all slots and determine the base date
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find the earliest slot time to determine the base date
    let earliestHour = 23;
    let hasOvernightSlots = false;
    let hasEveningSlots = false;
    let hasEarlyMorningSlots = false;
    
    console.log('Starting overnight slot detection loop...');
    for (const slotString of slotStrings) {
      console.log('Processing slot string:', slotString);
      const timeMatch = slotString.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(?:\s*\(([^)]+)\))?/);
      if (timeMatch) {
        const [, startHour, startMin, endHour, endMin] = timeMatch;
        const startHourNum = parseInt(startHour);
        const endHourNum = parseInt(endHour);
        const startMinNum = parseInt(startMin);
        const endMinNum = parseInt(endMin);
        
        console.log(`Analyzing slot ${slotString}: start=${startHourNum}:${startMin}, end=${endHourNum}:${endMin}`);
        
        // Check if this is an overnight slot (spans across midnight)
        // An overnight slot is one where the end time is earlier in the day than the start time
        // This happens when a slot spans across midnight (e.g., 22:00-02:00)
        const isOvernight = endHourNum < startHourNum || (endHourNum === startHourNum && endMinNum < startMinNum);
        if (isOvernight) {
          hasOvernightSlots = true;
          console.log(`  -> Overnight slot detected!`);
        }
        
        // Also check if this schedule spans from evening to early morning
        // If we have evening slots (18+) AND early morning slots (0-6), it's an overnight schedule
        if (startHourNum >= 18) {
          hasEveningSlots = true;
          console.log(`  -> Evening slot detected (${startHourNum}:${startMin})`);
        } else if (startHourNum <= 6) {
          hasEarlyMorningSlots = true;
          console.log(`  -> Early morning slot detected (${startHourNum}:${startMin})`);
        }
        
        // Track the earliest hour
        if (startHourNum < earliestHour) {
          earliestHour = startHourNum;
        }
      }
    }
    
    // Determine if this is an overnight schedule (spans from evening to early morning)
    const isOvernightSchedule = hasOvernightSlots || (hasEveningSlots && hasEarlyMorningSlots);
    
    console.log('Schedule analysis:', {
      isOvernightSchedule,
      hasEveningSlots,
      hasEarlyMorningSlots,
      currentHour: now.getHours()
    });
    
    console.log('Date calculation debug:');
    console.log('- now:', now.toISOString());
    console.log('- today:', today.toISOString());
    console.log('- tomorrow:', tomorrow.toISOString());
    console.log('- hasOvernightSlots:', hasOvernightSlots, 'hasEveningSlots:', hasEveningSlots, 'hasEarlyMorningSlots:', hasEarlyMorningSlots);
    console.log('- isOvernightSchedule:', isOvernightSchedule, 'earliestHour:', earliestHour);
    console.log('- Current time:', now.toISOString(), 'Current hour:', now.getHours());
    
    // Second pass: create slots with individual date assignment
    for (const slotString of slotStrings) {
      // Parse OHME format like "02:30-04:55" or "02:30-04:55 (5.5p/kWh)"
      const timeMatch = slotString.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})(?:\s*\(([^)]+)\))?/);
      if (!timeMatch) {
        console.log('Could not parse OHME time format:', slotString);
        continue;
      }
      
      const [, startHour, startMin, endHour, endMin, priceInfo] = timeMatch;
      const startHourNum = parseInt(startHour);
      const endHourNum = parseInt(endHour);
      const startMinNum = parseInt(startMin);
      const endMinNum = parseInt(endMin);
      
      // Determine the correct date for this specific slot
      let slotDate = today;
      
      // Simplified date assignment logic
      if (isOvernightSchedule) {
        // For overnight schedules, use a simpler approach:
        // - Evening slots (18:00+) are for today
        // - Early morning slots (00:00-06:00) are for tomorrow if we're in the evening, otherwise today
        // - Mid-day slots (06:00-18:00) are for today
        
        if (startHourNum >= 18) {
          // Evening slots are for today
          slotDate = today;
          console.log(`  -> Evening slot (${startHourNum}:${startMin}), assigning to today`);
        } else if (startHourNum <= 6) {
          // Early morning slots
          if (now.getHours() >= 18) {
            // If it's evening now, early morning slots are for tomorrow
            slotDate = tomorrow;
            console.log(`  -> Early morning slot (${startHourNum}:${startMin}), evening now, assigning to tomorrow`);
          } else {
            // If it's early morning now, these slots are for today
            slotDate = today;
            console.log(`  -> Early morning slot (${startHourNum}:${startMin}), early morning now, assigning to today`);
          }
        } else {
          // Mid-day slots are for today
          slotDate = today;
          console.log(`  -> Mid-day slot (${startHourNum}:${startMin}), assigning to today`);
        }
      } else {
        // For non-overnight schedules, all slots are for today
        slotDate = today;
        console.log(`  -> Non-overnight slot (${startHourNum}:${startMin}), assigning to today`);
      }
      
      // Create start and end times using the determined date
      const start = new Date(slotDate.getTime() + (startHourNum * 60 + startMinNum) * 60000);
      const end = new Date(slotDate.getTime() + (endHourNum * 60 + endMinNum) * 60000);
      
      // Handle overnight slots - if end time is before start time, it spans to next day
      if (end <= start) {
        end.setDate(end.getDate() + 1);
        console.log(`  -> Overnight slot detected, end time moved to next day: ${end.toLocaleString()}`);
      }
      
      const slot = {
        start: start.toISOString(),
        end: end.toISOString(),
        duration: Math.round((end - start) / (1000 * 60)),
        price: 0, // Not displayed, always 7.5p/kWh for OHME
        isActive: this.isSlotActive(start, end)
      };
      
      console.log(`=== SLOT CREATED ===`);
      console.log(`Original string: "${slotString}"`);
      console.log(`Assigned date: ${slotDate.toDateString()}`);
      console.log(`Start time: ${start.toLocaleString()}`);
      console.log(`End time: ${end.toLocaleString()}`);
      console.log(`Duration: ${slot.duration} minutes`);
      console.log(`Is active: ${slot.isActive}`);
      console.log(`Is past: ${this.isSlotPast(start)}`);
      console.log(`Current time: ${now.toLocaleString()}`);
      console.log(`===================`);
      
      slots.push(slot);
    }
    
    console.log('Parsed OHME slots:', slots);
    return slots.length === 1 ? slots[0] : slots;
  }

  parseOctopusDispatches(dispatches) {
    console.log('Parsing Octopus dispatches:', dispatches);
    const slots = [];
    
    for (const dispatch of dispatches) {
      // Octopus dispatches typically have start/end times and may have different field names
      let start, end;
      
      // Try different possible field names for start time
      if (dispatch.start) {
        start = new Date(dispatch.start);
      } else if (dispatch.start_time) {
        start = new Date(dispatch.start_time);
      } else if (dispatch.startTime) {
        start = new Date(dispatch.startTime);
      } else if (dispatch.from) {
        start = new Date(dispatch.from);
      } else if (dispatch.begin) {
        start = new Date(dispatch.begin);
      } else if (dispatch.dispatch_start) {
        start = new Date(dispatch.dispatch_start);
      }
      
      // Try different possible field names for end time
      if (dispatch.end) {
        end = new Date(dispatch.end);
      } else if (dispatch.end_time) {
        end = new Date(dispatch.end_time);
      } else if (dispatch.endTime) {
        end = new Date(dispatch.endTime);
      } else if (dispatch.to) {
        end = new Date(dispatch.to);
      } else if (dispatch.finish) {
        end = new Date(dispatch.finish);
      } else if (dispatch.dispatch_end) {
        end = new Date(dispatch.dispatch_end);
      }
      
      // If we couldn't parse dates, skip this dispatch
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.log('Could not parse dispatch dates:', dispatch);
        continue;
      }
      
      const duration = Math.round((end - start) / (1000 * 60)); // Duration in minutes
      
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        duration,
        price: dispatch.price || dispatch.cost || dispatch.rate || dispatch.tariff_rate || 0,
        isActive: this.isSlotActive(start, end),
        source: 'octopus_dispatch'
      });
    }
    
    console.log('Parsed Octopus dispatch slots:', slots);
    return slots;
  }

  processSlots(slots) {
    const processedSlots = slots.map(slot => {
      // Handle different date/time formats that OHME might use
      let start, end;
      
      if (slot.start) {
        start = new Date(slot.start);
      } else if (slot.start_time) {
        start = new Date(slot.start_time);
      } else if (slot.startTime) {
        start = new Date(slot.startTime);
      } else if (slot.from) {
        start = new Date(slot.from);
      } else if (slot.begin) {
        start = new Date(slot.begin);
      }
      
      if (slot.end) {
        end = new Date(slot.end);
      } else if (slot.end_time) {
        end = new Date(slot.end_time);
      } else if (slot.endTime) {
        end = new Date(slot.endTime);
      } else if (slot.to) {
        end = new Date(slot.to);
      } else if (slot.finish) {
        end = new Date(slot.finish);
      }
      
      // If we couldn't parse dates, skip this slot
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.log('Could not parse slot dates:', slot);
        return null;
      }
      
      const duration = Math.round((end - start) / (1000 * 60)); // Duration in minutes
      
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        duration,
        price: slot.price || slot.cost || slot.rate || 0,
        isActive: this.isSlotActive(start, end)
      };
    }).filter(slot => slot !== null);
    
    // Sort by start time
    const sortedSlots = processedSlots.sort((a, b) => new Date(a.start) - new Date(b.start));
    
    console.log('Processed and sorted slots:');
    sortedSlots.forEach((slot, index) => {
      const startDate = new Date(slot.start);
      const endDate = new Date(slot.end);
      console.log(`${index + 1}. ${startDate.toLocaleString()} - ${endDate.toLocaleString()} (${slot.duration}min) [${startDate.toDateString()}]`);
    });
    
    return sortedSlots;
  }

  isSlotActive(start, end) {
    const now = this.currentTime;
    const startTime = new Date(start);
    const endTime = new Date(end);
    return now >= startTime && now <= endTime;
  }
  
  isSlotPast(start) {
    const now = this.currentTime;
    const startTime = new Date(start);
    return now > startTime;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          font-family: var(--mdc-typography-body1-font-family, Roboto, sans-serif);
        }
        
        .card {
          background: var(--card-background-color, #fff);
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 20px;
          text-align: center;
        }
        
        .header {
          font-size: 18px;
          font-weight: 500;
          margin-bottom: 20px;
          color: var(--primary-text-color, #000);
        }
        
        
        
        .current-time {
          font-size: 14px;
          color: var(--secondary-text-color, #666);
          margin-bottom: 10px;
        }
        
        .slots-info {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 20px;
        }
        
        .slot-info {
          background: var(--card-background-color, #ffffff);
          padding: 20px;
          border-radius: 12px;
          font-size: 14px;
          border: 2px solid var(--divider-color, #e0e0e0);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        
        .slot-info::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 6px;
          height: 100%;
          background: #e0e0e0;
        }
        
        .slot-info.active {
          background: var(--success-color, #e8f5e8);
          border-color: var(--success-color, #4caf50);
          box-shadow: 0 4px 16px rgba(76, 175, 80, 0.2);
        }
        
        .slot-info.active::before {
          background: var(--success-color, #4caf50);
        }
        
        .slot-info.scheduled {
          background: var(--card-background-color, #ffffff);
          border-color: var(--primary-color, #03a9f4);
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .slot-info.scheduled::before {
          background: var(--primary-color, #03a9f4);
        }
        
        .slot-info.past {
          background: var(--disabled-color, #f5f5f5);
          border-color: var(--disabled-color, #bdbdbd);
          opacity: 0.7;
        }
        
        .slot-info.past::before {
          background: var(--disabled-color, #bdbdbd);
        }
        
        .slot-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        
        .slot-time {
          font-size: 18px;
          font-weight: 600;
          color: var(--primary-text-color, #000);
        }
        
        .slot-status {
          font-size: 12px;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .slot-status.active {
          background: #4caf50;
          color: white;
        }
        
        .slot-status.scheduled {
          background: var(--primary-color, #03a9f4);
          color: white;
        }
        
        .slot-status.past {
          background: #bdbdbd;
          color: white;
        }
        
        .slot-details {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .slot-duration {
          color: var(--secondary-text-color, #666);
          font-size: 14px;
        }
        
        .slot-icon {
          font-size: 20px;
        }
        
        
        .legend {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 15px;
          font-size: 12px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }
        
        .legend-color.active { background: #4caf50; }
        .legend-color.scheduled { background: #2196f3; }
        .legend-color.past { background: #f5f5f5; }
      </style>
      
      <div class="card">
        <div class="header">${this.config.name}</div>
        
        <div class="slots-info">
          ${this.renderSlotsInfo()}
        </div>
        
        <div class="legend">
          <div class="legend-item">
            <div class="legend-color active"></div>
            <span>Active</span>
          </div>
          <div class="legend-item">
            <div class="legend-color scheduled"></div>
            <span>Scheduled</span>
          </div>
          <div class="legend-item">
            <div class="legend-color past"></div>
            <span>Past</span>
          </div>
        </div>
      </div>
    `;
  }

  renderWheel() {
    const now = this.currentTime;
    const slots = this.chargeSlots.slice(0, this.config.show_slots);
    
    // Render hour markers first
    const hourMarkers = this.renderHourMarkers();
    
    // Then render charge slots
    const slotSegments = slots.map((slot, index) => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const startAngle = this.timeToAngle(start);
      const endAngle = this.timeToAngle(end);
      
      let className = 'slot-segment';
      if (slot.isActive) {
        className += ' active';
      } else if (start > now) {
        className += ' scheduled';
      } else {
        className += ' past';
      }
      
      return `
        <div class="${className}" 
             style="transform: rotate(${startAngle}deg);
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    top: 0;
                    left: 0;
                    border-radius: 50%;
                    background: conic-gradient(from ${startAngle}deg, 
                      ${slot.isActive ? '#4caf50' : start > now ? '#2196f3' : '#f5f5f5'} 
                      ${startAngle}deg, 
                      ${slot.isActive ? '#8bc34a' : start > now ? '#03a9f4' : '#e0e0e0'} 
                      ${endAngle}deg,
                      transparent ${endAngle}deg);
                    clip-path: polygon(50% 50%, 
                      ${50 + 50 * Math.cos((startAngle - 90) * Math.PI / 180)}% 
                      ${50 + 50 * Math.sin((startAngle - 90) * Math.PI / 180)}%,
                      ${50 + 50 * Math.cos((endAngle - 90) * Math.PI / 180)}% 
                      ${50 + 50 * Math.sin((endAngle - 90) * Math.PI / 180)}%);">
        </div>
      `;
    }).join('');
    
    return hourMarkers + slotSegments;
  }
  
  renderHourMarkers() {
    const markers = [];
    for (let hour = 0; hour < 24; hour += 2) { // Every 2 hours
      const angle = (hour / 24) * 360;
      const x = 50 + 45 * Math.cos((angle - 90) * Math.PI / 180);
      const y = 50 + 45 * Math.sin((angle - 90) * Math.PI / 180);
      
      markers.push(`
        <div class="hour-marker" style="
          position: absolute;
          left: ${x}%;
          top: ${y}%;
          transform: translate(-50%, -50%);
          width: 4px;
          height: 4px;
          background: var(--primary-color, #03a9f4);
          border-radius: 50%;
          opacity: 0.6;
        "></div>
      `);
    }
    return markers.join('');
  }

  renderSlotsInfo() {
    // Sort slots by start time to ensure first slot shows first
    const sortedSlots = [...this.chargeSlots].sort((a, b) => new Date(a.start) - new Date(b.start));
    
    return sortedSlots.slice(0, 6).map(slot => {
      const start = new Date(slot.start);
      const end = new Date(slot.end);
      const now = this.currentTime;
      
      let className = 'slot-info';
      let status = '';
      let icon = '';
      
      // Better status detection
      
      if (slot.isActive) {
        className += ' active';
        status = 'Active';
        icon = '⚡';
      } else if (now < start) {
        // Slot hasn't started yet
        className += ' scheduled';
        status = 'Scheduled';
        icon = '⏰';
      } else if (now > end) {
        // Slot has finished
        className += ' past';
        status = 'Past';
        icon = '✅';
      } else {
        // Slot is currently running (fallback)
        className += ' active';
        status = 'Active';
        icon = '⚡';
      }
      
      return `
        <div class="${className}">
          <div class="slot-header">
            <div class="slot-time">${this.formatTime(start)} - ${this.formatTime(end)}</div>
            <div class="slot-status ${status.toLowerCase()}">${status}</div>
          </div>
          <div class="slot-details">
            <div class="slot-duration">${slot.duration} minutes</div>
            <div class="slot-icon">${icon}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  timeToAngle(time) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    return ((hours + minutes / 60) / 24) * 360;
  }

  formatTime(time) {
    return time.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  }

  renderEmpty() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          font-family: var(--mdc-typography-body1-font-family, Roboto, sans-serif);
        }
        .empty-state {
          background: var(--card-background-color, #fff);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 40px 20px;
          text-align: center;
          border: 2px dashed var(--divider-color, #e0e0e0);
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.6;
        }
        .empty-title {
          font-size: 18px;
          font-weight: 500;
          color: var(--primary-text-color, #000);
          margin-bottom: 8px;
        }
        .empty-subtitle {
          font-size: 14px;
          color: var(--secondary-text-color, #666);
          margin-bottom: 20px;
          line-height: 1.4;
        }
      </style>
        <div class="empty-state">
          <div class="empty-icon">⚡</div>
          <div class="empty-title">No Charge Slots Available</div>
          <div class="empty-subtitle">
            Your Octopus Intelligent charger doesn't have any scheduled charge slots at the moment.<br>
            This is normal when your EV isn't plugged in or no charging is needed.
          </div>
        </div>
    `;
  }

  renderError(message) {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          font-family: var(--mdc-typography-body1-font-family, Roboto, sans-serif);
        }
        .error {
          color: var(--error-color, #f44336);
          text-align: center;
          padding: 20px;
        }
      </style>
      <div class="error">${message}</div>
    `;
  }
}

customElements.define('octopus-intelligent-wheel-card', OctopusIntelligentWheelCard);

// HACS configuration
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'octopus-intelligent-wheel-card',
  name: 'Octopus Intelligent Wheel Card',
  description: 'A wheel card to display Octopus Intelligent charge slots with multi-charger support',
  preview: true,
  documentationURL: 'https://github.com/JaseCat/octopus-intelligent-wheel-card'
});

// Debug function for testing OHME parsing
window.testOHMEParsing = function(stateString) {
  console.log('=== TESTING OHME PARSING ===');
  const card = new OctopusIntelligentWheelCard();
  const result = card.parseOHMEState(stateString);
  console.log('Test result:', result);
  console.log('============================');
  return result;
};
