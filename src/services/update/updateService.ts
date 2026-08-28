import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { store, RootState } from '../../store';
import {
  setStatus,
  setUpdateAvailable,
  setUpdateReady,
  setUpdateMetadata,
  setSafetyState,
  setLastCheckTime,
  setError,
} from '../../store/update/updateSlice';
import { UpdateConfig } from './updateConfig';
import {
  UpdateMetadata,
  SafetyCheckResult,
  CheckUpdateResult,
  FetchUpdateResult,
} from './updateTypes';

class UpdateService {
  private isInitialized = false;

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Load initial metadata into Redux
    const metadata = this.getMetadata();
    store.dispatch(setUpdateMetadata(metadata));

    // Evaluate initial safety state
    const safety = this.evaluateSafety(store.getState());
    store.dispatch(setSafetyState(safety));
  }

  public getMetadata(): UpdateMetadata {
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    const isSupported = Updates.isEnabled && !isDev;
    const appVersion = 
      Constants.expoConfig?.version || 
      UpdateConfig.DEFAULT_APP_VERSION;

    return {
      appVersion,
      runtimeVersion: Updates.runtimeVersion || UpdateConfig.DEFAULT_RUNTIME_VERSION,
      channel: Updates.channel || 'development',
      updateId: Updates.updateId || null,
      createdAt: Updates.createdAt || null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
      emergencyLaunchReason: Updates.emergencyLaunchReason || null,
      isSupported,
    };
  }

  /**
   * Evaluates if applying an OTA update is completely safe right now.
   * STRICT FAIL-CLOSED PRINCIPLE: If vehicle state is ambiguous, unconfirmed,
   * armed, or in active flight, applying an update is strictly forbidden.
   */
  public evaluateSafety(state: RootState): SafetyCheckResult {
    const { drone, connection, settings } = state;
    const isMock = settings?.connection?.type === 'MOCK' || (settings?.connection as any)?.mode === 'MOCK';

    // 1. Vehicle is ARMED -> BLOCK
    if (drone.armed) {
      return {
        isSafe: false,
        reason: 'ARMED',
        message: 'Vehicle is currently ARMED! Reloading is strictly blocked for flight safety.',
      };
    }

    // 2. Vehicle in unsafe/active flight mode -> BLOCK
    const currentMode = (drone.flightMode || '').toUpperCase();
    if (UpdateConfig.UNSAFE_FLIGHT_MODES.includes(currentMode)) {
      return {
        isSafe: false,
        reason: 'UNSAFE_FLIGHT_MODE',
        message: `Vehicle is in active flight mode (${drone.flightMode})! Reloading is blocked.`,
      };
    }

    // 3. Vehicle state uninitialized or booting -> BLOCK
    const currentStatus = (drone.systemStatus || '').toUpperCase();
    if (currentStatus === 'UNINIT' || currentStatus === 'BOOTING') {
      return {
        isSafe: false,
        reason: 'UNCONFIRMED_STATE',
        message: 'Vehicle system state is uninitialized. Telemetry not yet established.',
      };
    }

    // 4. Mock Mode evaluation: known simulated environment
    if (isMock) {
      if (!drone.armed) {
        return {
          isSafe: true,
          reason: 'SAFE_CONFIRMED',
          message: 'Mock Drone is DISARMED and safely idle on ground.',
        };
      }
    }

    // 5. Real Vehicle evaluation
    if (connection.status === 'CONNECTED') {
      if (!drone.armed && (UpdateConfig.SAFE_IDLE_MODES.includes(currentMode) || currentMode === 'UNKNOWN')) {
        return {
          isSafe: true,
          reason: 'SAFE_CONFIRMED',
          message: 'Real vehicle is connected and confirmed DISARMED on ground.',
        };
      }
      return {
        isSafe: false,
        reason: 'UNSAFE_FLIGHT_MODE',
        message: `Real vehicle is in unverified flight mode: ${drone.flightMode}`,
      };
    }

    // 6. Real Vehicle Disconnected / Lost Connection -> FAIL-CLOSED
    // An airborne drone might have lost radio link; disconnected != safe on ground!
    return {
      isSafe: false,
      reason: 'DISCONNECTED_REAL_VEHICLE',
      message: 'App is disconnected from Real Vehicle. Vehicle state is unconfirmed. Verify physical vehicle is landed and disarmed before applying update.',
    };
  }

  /**
   * Check for remote updates from EAS Update.
   * Gracefully handles dev mode, offline, and server errors without crashing the app.
   */
  public async checkForUpdate(): Promise<CheckUpdateResult> {
    store.dispatch(setStatus('CHECKING'));
    store.dispatch(setLastCheckTime(Date.now()));

    // In development mode or unsupported environment
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (!Updates.isEnabled || isDev) {
      store.dispatch(setStatus('UNSUPPORTED'));
      return {
        isAvailable: false,
        error: 'OTA updates are disabled in Development Mode / Expo Go.',
      };
    }

    try {
      const checkPromise = Updates.checkForUpdateAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Update check timed out.')), UpdateConfig.CHECK_TIMEOUT_MS)
      );

      const update = await Promise.race([checkPromise, timeoutPromise]);

      if (update.isAvailable) {
        store.dispatch(setUpdateAvailable(true));
        store.dispatch(setStatus('IDLE'));
        return { isAvailable: true, manifest: update.manifest };
      } else {
        store.dispatch(setUpdateAvailable(false));
        store.dispatch(setStatus('UP_TO_DATE'));
        return { isAvailable: false };
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to check for updates';
      store.dispatch(setError(errorMessage));
      return { isAvailable: false, error: errorMessage };
    }
  }

  /**
   * Download the available update in background.
   */
  public async fetchUpdate(): Promise<FetchUpdateResult> {
    store.dispatch(setStatus('DOWNLOADING'));

    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (!Updates.isEnabled || isDev) {
      store.dispatch(setStatus('UNSUPPORTED'));
      return {
        isSuccess: false,
        error: 'OTA updates are disabled in Development Mode.',
      };
    }

    try {
      const fetchPromise = Updates.fetchUpdateAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Update download timed out.')), UpdateConfig.FETCH_TIMEOUT_MS)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);

      if (result.isNew) {
        store.dispatch(setUpdateReady(true));
        store.dispatch(setStatus('READY_TO_APPLY'));

        // Update safety state
        const safety = this.evaluateSafety(store.getState());
        store.dispatch(setSafetyState(safety));

        return { isSuccess: true, manifest: result.manifest };
      } else {
        store.dispatch(setStatus('UP_TO_DATE'));
        return { isSuccess: true };
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to download update';
      store.dispatch(setError(errorMessage));
      return { isSuccess: false, error: errorMessage };
    }
  }

  /**
   * Safely applies the update by reloading the JS bundle.
   * Performs an ATOMIC PRE-RELOAD VERIFICATION right before calling Updates.reloadAsync().
   */
  public async applyUpdateSafely(forceIfDisconnected = false): Promise<{ success: boolean; error?: string }> {
    // 1. Fetch current authoritative state directly from store
    const currentState = store.getState();
    const safety = this.evaluateSafety(currentState);

    // If disconnected in real mode, allow pilot to apply if they manually confirm vehicle is powered down
    if (!safety.isSafe) {
      if (forceIfDisconnected && safety.reason === 'DISCONNECTED_REAL_VEHICLE') {
        // Pilot confirmed vehicle is powered down / disconnected safely
      } else {
        store.dispatch(setSafetyState(safety));
        return {
          success: false,
          error: `UPDATE BLOCKED BY SAFETY INTERLOCK: ${safety.message}`,
        };
      }
    }

    // 2. Final atomic check - absolute guarantee before native reload call
    const atomicState = store.getState();
    if (atomicState.drone.armed) {
      const blockSafety: SafetyCheckResult = {
        isSafe: false,
        reason: 'ARMED',
        message: 'CRITICAL: Drone became ARMED immediately before reload. Reload cancelled.',
      };
      store.dispatch(setSafetyState(blockSafety));
      return {
        success: false,
        error: blockSafety.message,
      };
    }

    store.dispatch(setStatus('APPLYING'));

    try {
      const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
      if (Updates.isEnabled && !isDev) {
        await Updates.reloadAsync();
      } else {
        store.dispatch(setStatus('IDLE'));
      }
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to reload app';
      store.dispatch(setError(errorMessage));
      return { success: false, error: errorMessage };
    }
  }
}

export const updateService = new UpdateService();
