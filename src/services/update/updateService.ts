import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { store, RootState } from "../../store";
import {
  setStatus,
  setUpdateAvailable,
  setUpdateReady,
  setUpdateMetadata,
  setSafetyState,
  setLastCheckTime,
  setError,
} from "../../store/update/updateSlice";
import { UpdateConfig } from "./updateConfig";
import {
  UpdateMetadata,
  SafetyCheckResult,
  CheckUpdateResult,
  FetchUpdateResult,
} from "./updateTypes";

class UpdateService {
  private isInitialized = false;
  private backgroundFlowRunning = false;
  private safetyWatcherUnsubscribe: (() => void) | null = null;
  private onUpdateReadyCallback: (() => void) | null = null;

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    const metadata = this.getMetadata();
    store.dispatch(setUpdateMetadata(metadata));
    const safety = this.evaluateSafety(store.getState());
    store.dispatch(setSafetyState(safety));
  }

  public onUpdateReady(callback: () => void): () => void {
    this.onUpdateReadyCallback = callback;
    return () => { this.onUpdateReadyCallback = null; };
  }

  public async startBackgroundCheckFlow(delayMs = 5000): Promise<void> {
    if (this.backgroundFlowRunning) return;
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    if (!Updates.isEnabled || isDev) {
      console.log("[OTA] Background check skipped: running in dev/Expo Go mode.");
      return;
    }
    this.backgroundFlowRunning = true;
    await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    console.log("[OTA] Starting background update check...");
    const checkResult = await this.checkForUpdate();
    if (!checkResult.isAvailable) {
      console.log("[OTA] No update available. Background check complete.");
      this.backgroundFlowRunning = false;
      return;
    }
    console.log("[OTA] Update found. Downloading in background...");
    const fetchResult = await this.fetchUpdate();
    if (!fetchResult.isSuccess) {
      console.warn("[OTA] Background download failed:", fetchResult.error);
      this.backgroundFlowRunning = false;
      return;
    }
    console.log("[OTA] Update downloaded. Waiting for safe disarmed window...");
    this.startSafetyWatcher();
  }

  private startSafetyWatcher(): void {
    if (this.safetyWatcherUnsubscribe) return;
    const checkAndNotify = () => {
      const state = store.getState();
      if (!state.update.updateReady) return;
      const safety = this.evaluateSafety(state);
      store.dispatch(setSafetyState(safety));
      if (safety.isSafe) {
        console.log("[OTA] Safe window opened. Notifying user of pending update.");
        this.onUpdateReadyCallback?.();
        this.safetyWatcherUnsubscribe?.();
        this.safetyWatcherUnsubscribe = null;
      }
    };
    this.safetyWatcherUnsubscribe = store.subscribe(checkAndNotify);
    checkAndNotify();
  }

  public stopSafetyWatcher(): void {
    this.safetyWatcherUnsubscribe?.();
    this.safetyWatcherUnsubscribe = null;
  }

  public getMetadata(): UpdateMetadata {
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    const isSupported = Updates.isEnabled && !isDev;
    const appVersion = Constants.expoConfig?.version || UpdateConfig.DEFAULT_APP_VERSION;
    return {
      appVersion,
      runtimeVersion: Updates.runtimeVersion || UpdateConfig.DEFAULT_RUNTIME_VERSION,
      channel: Updates.channel || "development",
      updateId: Updates.updateId || null,
      createdAt: Updates.createdAt || null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
      emergencyLaunchReason: Updates.emergencyLaunchReason || null,
      isSupported,
    };
  }

  public evaluateSafety(state: RootState): SafetyCheckResult {
    const { drone, connection, settings } = state;
    const isMock = settings?.connection?.type === "MOCK" || (settings?.connection as any)?.mode === "MOCK";
    if (drone.armed) {
      return { isSafe: false, reason: "ARMED", message: "Vehicle is currently ARMED! Reloading is strictly blocked for flight safety." };
    }
    const currentMode = (drone.flightMode || "").toUpperCase();
    if (UpdateConfig.UNSAFE_FLIGHT_MODES.includes(currentMode)) {
      return { isSafe: false, reason: "UNSAFE_FLIGHT_MODE", message: `Vehicle is in active flight mode (${drone.flightMode})! Reloading is blocked.` };
    }
    const currentStatus = (drone.systemStatus || "").toUpperCase();
    if (currentStatus === "UNINIT" || currentStatus === "BOOTING") {
      return { isSafe: false, reason: "UNCONFIRMED_STATE", message: "Vehicle system state is uninitialized. Telemetry not yet established." };
    }
    if (isMock) {
      if (!drone.armed) {
        return { isSafe: true, reason: "SAFE_CONFIRMED", message: "Mock Drone is DISARMED and safely idle on ground." };
      }
    }
    if (connection.status === "CONNECTED") {
      if (!drone.armed && (UpdateConfig.SAFE_IDLE_MODES.includes(currentMode) || currentMode === "UNKNOWN")) {
        return { isSafe: true, reason: "SAFE_CONFIRMED", message: "Real vehicle is connected and confirmed DISARMED on ground." };
      }
      return { isSafe: false, reason: "UNSAFE_FLIGHT_MODE", message: `Real vehicle is in unverified flight mode: ${drone.flightMode}` };
    }
    return { isSafe: false, reason: "DISCONNECTED_REAL_VEHICLE", message: "App is disconnected from Real Vehicle. Vehicle state is unconfirmed. Verify vehicle is physically landed and disarmed before applying update." };
  }

  public async checkForUpdate(): Promise<CheckUpdateResult> {
    store.dispatch(setStatus("CHECKING"));
    store.dispatch(setLastCheckTime(Date.now()));
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    if (!Updates.isEnabled || isDev) {
      store.dispatch(setStatus("UNSUPPORTED"));
      return { isAvailable: false, error: "OTA updates are disabled in Development Mode / Expo Go." };
    }
    try {
      const checkPromise = Updates.checkForUpdateAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Update check timed out.")), UpdateConfig.CHECK_TIMEOUT_MS)
      );
      const update = await Promise.race([checkPromise, timeoutPromise]);
      if (update.isAvailable) {
        store.dispatch(setUpdateAvailable(true));
        store.dispatch(setStatus("IDLE"));
        return { isAvailable: true, manifest: update.manifest };
      } else {
        store.dispatch(setUpdateAvailable(false));
        store.dispatch(setStatus("UP_TO_DATE"));
        return { isAvailable: false };
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to check for updates";
      store.dispatch(setError(errorMessage));
      return { isAvailable: false, error: errorMessage };
    }
  }

  public async fetchUpdate(): Promise<FetchUpdateResult> {
    store.dispatch(setStatus("DOWNLOADING"));
    const isDev = typeof __DEV__ !== "undefined" && __DEV__;
    if (!Updates.isEnabled || isDev) {
      store.dispatch(setStatus("UNSUPPORTED"));
      return { isSuccess: false, error: "OTA updates are disabled in Development Mode." };
    }
    try {
      const fetchPromise = Updates.fetchUpdateAsync();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Update download timed out.")), UpdateConfig.FETCH_TIMEOUT_MS)
      );
      const result = await Promise.race([fetchPromise, timeoutPromise]);
      if (result.isNew) {
        store.dispatch(setUpdateReady(true));
        store.dispatch(setStatus("READY_TO_APPLY"));
        const safety = this.evaluateSafety(store.getState());
        store.dispatch(setSafetyState(safety));
        return { isSuccess: true, manifest: result.manifest };
      } else {
        store.dispatch(setStatus("UP_TO_DATE"));
        return { isSuccess: true };
      }
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to download update";
      store.dispatch(setError(errorMessage));
      return { isSuccess: false, error: errorMessage };
    }
  }

  public async applyUpdateSafely(forceIfDisconnected = false): Promise<{ success: boolean; error?: string }> {
    const currentState = store.getState();
    const safety = this.evaluateSafety(currentState);
    if (!safety.isSafe) {
      if (forceIfDisconnected && safety.reason === "DISCONNECTED_REAL_VEHICLE") {
        // Pilot manually confirmed vehicle powered down
      } else {
        store.dispatch(setSafetyState(safety));
        return { success: false, error: `UPDATE BLOCKED BY SAFETY INTERLOCK: ${safety.message}` };
      }
    }
    const atomicState = store.getState();
    if (atomicState.drone.armed) {
      const blockSafety: SafetyCheckResult = {
        isSafe: false, reason: "ARMED",
        message: "CRITICAL: Drone became ARMED immediately before reload. Reload cancelled.",
      };
      store.dispatch(setSafetyState(blockSafety));
      return { success: false, error: blockSafety.message };
    }
    store.dispatch(setStatus("APPLYING"));
    this.stopSafetyWatcher();
    try {
      const isDev = typeof __DEV__ !== "undefined" && __DEV__;
      if (Updates.isEnabled && !isDev) {
        await Updates.reloadAsync();
      } else {
        store.dispatch(setStatus("IDLE"));
      }
      return { success: true };
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to reload app";
      store.dispatch(setError(errorMessage));
      return { success: false, error: errorMessage };
    }
  }
}

export const updateService = new UpdateService();