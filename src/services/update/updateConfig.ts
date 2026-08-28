export const UpdateConfig = {
  // Unsafe flight modes where reloading / applying update is strictly forbidden
  UNSAFE_FLIGHT_MODES: [
    'TAKEOFF',
    'LAND',
    'AUTO',
    'GUIDED',
    'MISSION_RUNNING',
    'IN_FLIGHT',
    'RTL',
    'QRTL',
    'FOLLOW',
    'CIRCLE',
    'BRAKE',
    'THROW',
    'ACRO_FLIGHT',
    'AUTOTUNE',
  ],

  // Modes considered safely idle only if vehicle is explicitly DISARMED
  SAFE_IDLE_MODES: [
    'STABILIZE',
    'MANUAL',
    'HOLD',
    'LOITER',
    'ALT_HOLD',
    'DISARMED',
    'STANDBY',
    'INITIALIZING',
  ],

  // Network & fetch timeouts
  CHECK_TIMEOUT_MS: 10000,
  FETCH_TIMEOUT_MS: 30000,

  // Fallback info
  DEFAULT_APP_VERSION: '1.0.0',
  DEFAULT_RUNTIME_VERSION: '1.0.0',
};
