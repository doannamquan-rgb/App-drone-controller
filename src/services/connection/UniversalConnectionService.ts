import { ConnectionConfig } from '../../settings/types/connection';
import { controlConnectionService, ControlConnectionStatus } from './ControlConnectionService';
import { videoConnectionService } from './VideoConnectionService';
import { SensorState } from '../../store/telemetry/telemetrySlice';
import { VehicleType, AutopilotType } from '../../settings/types/connection';

export type UniversalConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface UniversalTelemetryData {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  battery: number;
  mode: string;
  armed: boolean;
  timestamp: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
  heading?: number;
  satellites?: number;
  hdop?: number;
  voltage?: number;
  current?: number;
  sensors?: SensorState[];
  vehicleType: VehicleType;
  vehicleName: string;
  autopilot: AutopilotType;
  bytesRx: number;
  bytesTx: number;
  packetsPerSec: number;
  latencyMs: number;
}

type TelemetryListener = (data: UniversalTelemetryData) => void;
type StatusListener = (status: UniversalConnectionStatus) => void;

class UniversalConnectionService {
  connect(config?: Partial<ConnectionConfig>) {
    controlConnectionService.connect(config);
  }

  disconnect() {
    controlConnectionService.disconnect();
    videoConnectionService.disconnect();
  }

  getStatus(): UniversalConnectionStatus {
    const rawStatus = controlConnectionService.getStatus();
    if (rawStatus === 'CONNECTED') return 'CONNECTED';
    if (rawStatus === 'CONNECTING' || rawStatus === 'RECONNECTING') return 'CONNECTING';
    if (rawStatus === 'DISCONNECTED') return 'DISCONNECTED';
    return 'ERROR';
  }

  getState(): UniversalTelemetryData {
    return controlConnectionService.getState();
  }

  onTelemetry(listener: TelemetryListener) {
    return controlConnectionService.onTelemetry(listener);
  }

  onStatusChange(listener: StatusListener) {
    return controlConnectionService.onStatusChange((rawStatus: ControlConnectionStatus) => {
      let mapped: UniversalConnectionStatus = 'DISCONNECTED';
      if (rawStatus === 'CONNECTED') mapped = 'CONNECTED';
      else if (rawStatus === 'CONNECTING' || rawStatus === 'RECONNECTING') mapped = 'CONNECTING';
      else if (rawStatus === 'DISCONNECTED') mapped = 'DISCONNECTED';
      else mapped = 'ERROR';
      listener(mapped);
    });
  }

  sendCommand(command: string, payload?: any): boolean {
    return controlConnectionService.sendCommand(command, payload);
  }

  updateMockState(updates: Partial<UniversalTelemetryData>) {
    controlConnectionService.updateMockState(updates);
  }
}

export const universalConnectionService = new UniversalConnectionService();
