import { ConnectionConfig } from '../types/connection';
import { PROTOCOL_CONSTANTS } from '../../config/protocolConstants';

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  type: 'UDP',
  vehicleType: 'COPTER',
  autopilot: 'ARDUPILOT',
  protocol: 'MAVLINK_V2',
  udp: {
    remoteHost: '', // Configurable / empty by default for Wi-Fi Mode 1
    remotePort: PROTOCOL_CONSTANTS.MAVLINK_DEFAULT_PORT,
    localPort: PROTOCOL_CONSTANTS.MAVLINK_DEFAULT_PORT,
    networkPath: 'WIFI_DIRECT',
    wifiHost: '', // User enters Raspberry Pi local IP (e.g. 192.168.x.x or 10.42.0.1)
    wifiPort: PROTOCOL_CONSTANTS.MAVLINK_DEFAULT_PORT,
    cloudHost: PROTOCOL_CONSTANTS.FLEET_SERVER_HOST,
    cloudPort: PROTOCOL_CONSTANTS.MAVLINK_DEFAULT_PORT,
    autoConnect: true,
    reconnect: true,
    reconnectDelayMs: 1000,
    connectionTimeoutMs: 5000,
    heartbeatTimeoutMs: PROTOCOL_CONSTANTS.HEARTBEAT_TIMEOUT_MS,
  },
  tcp: {
    host: '',
    port: 5760,
    autoConnect: false,
    reconnect: true,
  },
  serial: {
    baudRate: 115200,
    port: 'COM_USB_1',
    autoConnect: false,
  },
  bluetooth: {
    deviceName: 'HC-05-DRONE',
    deviceId: '00:14:03:05:5A:B1',
    baudRate: 57600,
  },
  mock: {
    vehicleType: 'COPTER',
    autopilot: 'ARDUPILOT',
    simulateSensors: true,
    simulateBatteryDrain: true,
  },
};
