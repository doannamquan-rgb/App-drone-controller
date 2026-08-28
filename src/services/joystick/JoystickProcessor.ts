import { JoystickInput, FlightControlInput } from '../../types/joystick';
import { InputMapper } from './InputMapper';
import { PROTOCOL_CONSTANTS, JOYSTICK_MESSAGE_CONFIG } from '../../config/protocolConstants';
import { safetyLayer } from '../command/SafetyLayer';

export type FlightControlListener = (input: FlightControlInput) => void;

export const NEUTRAL_FLIGHT_INPUT: FlightControlInput = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: 0.5,
  timestamp: 0,
};

class JoystickProcessor {
  private leftStick: JoystickInput = { x: 0, y: 0, active: false, timestamp: 0 };
  private rightStick: JoystickInput = { x: 0, y: 0, active: false, timestamp: 0 };
  
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: FlightControlListener[] = [];
  private lastProcessedInput: FlightControlInput = { ...NEUTRAL_FLIGHT_INPUT };
  private sequenceNumber: number = 0;

  // Primary control message type
  private messageType = JOYSTICK_MESSAGE_CONFIG.PRIMARY;

  // Update inputs directly from UI touch handlers (Buffered for network, immediate for UI)
  updateLeftStick(x: number, y: number, active: boolean) {
    this.leftStick = { x, y, active, timestamp: Date.now() };
    const flightInput = InputMapper.mapInputs(this.leftStick, this.rightStick);
    flightInput.seq = this.sequenceNumber;
    flightInput.timestamp = this.leftStick.timestamp;
    this.lastProcessedInput = flightInput;
    this.listeners.forEach(l => l(flightInput));
    if (!this.intervalId) {
      this.tick();
    }
  }
  
  updateRightStick(x: number, y: number, active: boolean) {
    this.rightStick = { x, y, active, timestamp: Date.now() };
    const flightInput = InputMapper.mapInputs(this.leftStick, this.rightStick);
    flightInput.seq = this.sequenceNumber;
    flightInput.timestamp = this.rightStick.timestamp;
    this.lastProcessedInput = flightInput;
    this.listeners.forEach(l => l(flightInput));
    if (!this.intervalId) {
      this.tick();
    }
  }

  // Reset both sticks to centered neutral safe position
  resetToNeutral() {
    this.sequenceNumber++;
    this.leftStick = { x: 0, y: 0, active: false, timestamp: Date.now() };
    this.rightStick = { x: 0, y: 0, active: false, timestamp: Date.now() };
    this.lastProcessedInput = { 
      ...NEUTRAL_FLIGHT_INPUT, 
      timestamp: Date.now(),
      seq: this.sequenceNumber 
    };
    this.listeners.forEach(l => l(this.lastProcessedInput));
    safetyLayer.executeJoystickCommand(this.lastProcessedInput);
  }

  // UI components can subscribe to see processed output (e.g. for display)
  onProcessedInput(listener: FlightControlListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  start() {
    if (this.intervalId) return;
    
    const intervalMs = 1000 / PROTOCOL_CONSTANTS.JOYSTICK_UPDATE_RATE_HZ;
    
    // Initial tick on start
    this.tick();
    
    this.intervalId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Neutralize on stop
    this.resetToNeutral();
  }

  getLastProcessedInput(): FlightControlInput {
    return this.lastProcessedInput;
  }
  
  getSequenceNumber(): number {
    return this.sequenceNumber;
  }
  
  private tick() {
    const now = Date.now();
    
    // Command Timeout protection: If stick has had no touch update beyond timeout (500ms), neutralize it
    if (this.leftStick.active && now - this.leftStick.timestamp > PROTOCOL_CONSTANTS.JOYSTICK_TIMEOUT_MS) {
      this.leftStick = { x: 0, y: 0, active: false, timestamp: now };
    }
    if (this.rightStick.active && now - this.rightStick.timestamp > PROTOCOL_CONSTANTS.JOYSTICK_TIMEOUT_MS) {
      this.rightStick = { x: 0, y: 0, active: false, timestamp: now };
    }
    
    this.sequenceNumber++;

    // Map raw inputs to flight control inputs (Neutral if inactive/centered)
    const flightInput = InputMapper.mapInputs(this.leftStick, this.rightStick);
    flightInput.seq = this.sequenceNumber;
    flightInput.timestamp = now;
    this.lastProcessedInput = flightInput;
    
    // Notify listeners (UI feedback)
    this.listeners.forEach(l => l(flightInput));
    
    // Send continuous control frame via Safety Layer (prevents autopilot failsafe timeout)
    safetyLayer.executeJoystickCommand(flightInput);
  }
}

export const joystickProcessor = new JoystickProcessor();
