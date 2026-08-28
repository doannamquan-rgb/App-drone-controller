export interface JoystickInput {
  x: number;
  y: number;
  active: boolean;
  timestamp: number;
}

export interface FlightControlInput {
  roll: number;
  pitch: number;
  yaw: number;
  throttle: number;
  timestamp: number;
  seq?: number;
}

export type ControlMessageType = 'MANUAL_CONTROL' | 'HEARTBEAT' | 'COMMAND' | 'MISSION' | 'TELEMETRY';

export interface FlightControlPacket<T = any> {
  sessionId?: string;
  seq: number;
  timestamp: number;
  type: ControlMessageType;
  token?: string;
  payload: T;
}
