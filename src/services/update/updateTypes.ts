export type UpdateStatus = 
  | 'IDLE' 
  | 'CHECKING' 
  | 'DOWNLOADING' 
  | 'READY_TO_APPLY' 
  | 'APPLYING' 
  | 'UP_TO_DATE' 
  | 'ERROR' 
  | 'UNSUPPORTED';

export type SafetyBlockReason = 
  | 'SAFE_CONFIRMED' 
  | 'ARMED' 
  | 'UNSAFE_FLIGHT_MODE' 
  | 'UNCONFIRMED_STATE' 
  | 'DISCONNECTED_REAL_VEHICLE' 
  | 'UNKNOWN_STATE';

export interface SafetyCheckResult {
  isSafe: boolean;
  reason: SafetyBlockReason;
  message: string;
}

export interface UpdateMetadata {
  appVersion: string;
  runtimeVersion: string | null;
  channel: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
  isSupported: boolean;
}

export interface CheckUpdateResult {
  isAvailable: boolean;
  manifest?: any;
  error?: string;
}

export interface FetchUpdateResult {
  isSuccess: boolean;
  manifest?: any;
  error?: string;
}
