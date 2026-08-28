import { VehicleType, AutopilotType, ConnectionConfig } from '../../settings/types/connection';
import { UniversalTelemetryData } from './UniversalConnectionService';

export type ControlStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'ERROR';
type TelemetryListener = (data: UniversalTelemetryData) => void;
type StatusListener = (status: ControlStatus) => void;

export class MockControlService {
  private status: ControlStatus = 'DISCONNECTED';
  private telemetryListeners: TelemetryListener[] = [];
  private statusListeners: StatusListener[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private state: UniversalTelemetryData = {
    latitude: 10.762622,
    longitude: 106.660172,
    altitude: 0.0,
    speed: 0.0,
    battery: 100,
    mode: 'LOITER',
    armed: false,
    timestamp: Date.now(),
    roll: 0,
    pitch: 0,
    yaw: 0,
    heading: 0,
    satellites: 16,
    hdop: 0.8,
    voltage: 16.8,
    current: 0.5,
    vehicleType: 'COPTER',
    vehicleName: 'ArduCopter V4.5.1 (SITL Simulation)',
    autopilot: 'ARDUPILOT',
    bytesRx: 0,
    bytesTx: 0,
    packetsPerSec: 10,
    latencyMs: 12,
    sensors: [],
  };

  connect(config?: Partial<ConnectionConfig>) {
    this.setStatus('CONNECTING');
    setTimeout(() => {
      const vType: VehicleType = config?.vehicleType || 'COPTER';
      const apType: AutopilotType = config?.autopilot || 'ARDUPILOT';

      let vName = 'ArduCopter V4.5.1 (SITL Simulation)';
      let defaultMode = 'LOITER';

      if (vType === 'PLANE') {
        vName = apType === 'PX4' ? 'PX4 FixedWing v1.14' : 'ArduPlane V4.5.0';
        defaultMode = 'FBWA';
      } else if (vType === 'VTOL') {
        vName = 'QuadPlane VTOL V4.5.0';
        defaultMode = 'QLOITER';
      } else if (vType === 'ROVER') {
        vName = 'ArduRover V4.5.0';
        defaultMode = 'MANUAL';
      } else if (vType === 'SUB') {
        vName = 'ArduSub V4.5.0';
        defaultMode = 'STABILIZE';
      } else if (apType === 'PX4') {
        vName = 'PX4 Autopilot v1.14.2';
        defaultMode = 'POSCTL';
      }

      this.state.vehicleType = vType;
      this.state.autopilot = apType;
      this.state.vehicleName = vName;
      this.state.mode = defaultMode;
      this.state.armed = false;
      this.state.altitude = 0.0;
      this.state.speed = 0.0;
      this.state.battery = 98;
      this.state.satellites = 18;

      this.setStatus('CONNECTED');
      this.startTelemetryLoop();
    }, 400);
  }

  disconnect() {
    this.setStatus('DISCONNECTED');
    this.stopTelemetryLoop();
  }

  getStatus(): ControlStatus {
    return this.status;
  }

  getState(): UniversalTelemetryData {
    return this.state;
  }

  onTelemetry(listener: TelemetryListener) {
    this.telemetryListeners.push(listener);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter(l => l !== listener);
    };
  }

  onStatusChange(listener: StatusListener) {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  private setStatus(newStatus: ControlStatus) {
    this.status = newStatus;
    this.statusListeners.forEach(l => l(newStatus));
  }

  private startTelemetryLoop() {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      if (this.status !== 'CONNECTED') return;

      const now = Date.now();
      const packetSize = 142 + Math.floor(Math.random() * 40);
      this.state.bytesRx += packetSize;
      this.state.packetsPerSec = 10;
      this.state.latencyMs = 10 + Math.floor(Math.random() * 5);
      this.state.timestamp = now;

      // Realistic dynamics when armed & in-flight
      if (this.state.armed && this.state.altitude > 0) {
        if (this.state.mode === 'TAKEOFF' && this.state.altitude < 15) {
          this.state.altitude = Math.min(15, this.state.altitude + 0.5);
          this.state.speed = 2.0;
        } else if (this.state.mode === 'LAND') {
          this.state.altitude = Math.max(0, this.state.altitude - 0.4);
          if (this.state.altitude === 0) {
            this.state.armed = false;
            this.state.speed = 0;
            this.state.mode = 'LOITER';
          }
        }

        const headingRad = ((this.state.yaw || 0) * Math.PI) / 180;
        const groundSpeed = this.state.speed || 1.0;
        this.state.latitude += Math.cos(headingRad) * groundSpeed * 0.0000003;
        this.state.longitude += Math.sin(headingRad) * groundSpeed * 0.0000003;
      }

      this.state.battery = Math.max(0, this.state.battery - 0.001);
      this.state.voltage = 14.8 + (this.state.battery / 100) * 2.0;

      this.telemetryListeners.forEach(l => l(this.state));
    }, 100); // 10 Hz
  }

  private stopTelemetryLoop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateState(updates: Partial<UniversalTelemetryData>) {
    this.state = {
      ...this.state,
      ...updates,
      timestamp: Date.now(),
    };
    this.telemetryListeners.forEach(l => l(this.state));
  }

  sendControlCommand(command: string, payload?: any): boolean {
    if (this.status !== 'CONNECTED') return false;
    this.state.bytesTx += 48;

    if (command === 'SET_MODE' && payload?.mode) {
      this.state.mode = payload.mode;
    } else if (command === 'ARM') {
      this.state.armed = true;
    } else if (command === 'DISARM') {
      this.state.armed = false;
    } else if (command === 'TAKEOFF') {
      this.state.mode = 'TAKEOFF';
    } else if (command === 'LAND') {
      this.state.mode = 'LAND';
    } else if (command === 'RTL') {
      this.state.mode = 'RTL';
    }

    this.telemetryListeners.forEach(l => l(this.state));
    return true;
  }
}

export const mockControlService = new MockControlService();
