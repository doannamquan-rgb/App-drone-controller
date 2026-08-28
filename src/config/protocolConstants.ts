/**
 * Protocol Constants for DroneGSC ↔ UAVLink-Edge
 * Source of Truth: docs/ACTUAL_UAVLINK_EDGE_PROTOCOL.md & forwarder.py
 */

export const PROTOCOL_CONSTANTS = {
  // MAVLink Network Ports
  MAVLINK_DEFAULT_PORT: 14550,
  PI_LOCAL_LISTEN_PORT: 14540,
  PI_WEB_ADMIN_PORT: 8080,
  FLEET_SERVER_AUTH_PORT: 5770,

  // MediaMTX Video Streaming Ports
  MEDIAMTX_RTSP_PORT: 8554,
  MEDIAMTX_HLS_PORT: 8888,
  MEDIAMTX_WEBRTC_PORT: 8889,
  MEDIAMTX_ICE_UDP_PORT: 8189,

  // Timeouts & Retry Limits
  HEARTBEAT_TIMEOUT_MS: 3000,
  JOYSTICK_TIMEOUT_MS: 500,
  JOYSTICK_UPDATE_RATE_HZ: 20,
  MISSION_RETRY_COUNT: 3,
  AUTO_MODE_CONFIRM_TIMEOUT_MS: 8000, // Explicitly verified from UAVLink-Edge forwarder.py line 650

  // Field-specific UI Telemetry Throttling Intervals (ms)
  THROTTLE_ATTITUDE_MS: 50,      // ~20 Hz for high-responsiveness HUD artificial horizon
  THROTTLE_GPS_VELOCITY_MS: 200, // ~5 Hz for Position, Speed, Heading
  THROTTLE_BATTERY_STATS_MS: 1000, // 1 Hz for Battery, Diagnostics, Traffic stats

  // Fleet Server Mode 2 Default Endpoint
  FLEET_SERVER_HOST: '45.117.171.237',
  
  // Template / Placeholder UUID (Configurable per drone in Connection & Video settings)
  DEFAULT_DRONE_UUID_TEMPLATE: '00000011-0000-0000-0000-000000000011',
  DEFAULT_CAMERA_ID: 'cam0' as const,
};

export type JoystickMavlinkMessageType = 'MANUAL_CONTROL' | 'RC_CHANNELS_OVERRIDE';

export const JOYSTICK_MESSAGE_CONFIG = {
  PRIMARY: 'MANUAL_CONTROL' as JoystickMavlinkMessageType, // Message #69: normalized x,y,z,r in [-1000, 1000], z in [0, 1000]
  LEGACY_FALLBACK: 'RC_CHANNELS_OVERRIDE' as JoystickMavlinkMessageType, // Message #70: PWM microseconds [1000 - 2000]
};
