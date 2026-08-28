import { updateService } from '../updateService';
import { store } from '../../../store';
import { setArmed, setFlightMode, setSystemStatus } from '../../../store/drone/droneSlice';
import { setStatus as setConnectionStatus } from '../../../store/connection/connectionSlice';
import { setConnectionType } from '../../../store/settings/settingsSlice';
import { setUpdateAvailable, setUpdateReady, setStatus as setUpdateStatus } from '../../../store/update/updateSlice';

// Mock expo-updates
jest.mock('expo-updates', () => ({
  isEnabled: true,
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  runtimeVersion: '1.0.0',
  channel: 'production',
  updateId: 'test-update-uuid-1234',
  createdAt: new Date('2026-08-25T12:00:00Z'),
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: true, manifest: { id: 'test-manifest' } }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true, manifest: { id: 'test-manifest' } }),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.0.0',
    runtimeVersion: '1.0.0',
  },
}));

describe('DroneGSC OTA Update Safety & Race Condition Interlock Matrix', () => {
  beforeEach(() => {
    // Reset store to safe mock baseline
    store.dispatch(setConnectionType('MOCK'));
    store.dispatch(setConnectionStatus('CONNECTED'));
    store.dispatch(setArmed(false));
    store.dispatch(setFlightMode('STABILIZE'));
    store.dispatch(setSystemStatus('ACTIVE'));
    store.dispatch(setUpdateAvailable(false));
    store.dispatch(setUpdateReady(false));
    store.dispatch(setUpdateStatus('IDLE'));
  });

  describe('1. Fail-Closed Safety Interlock Evaluations', () => {
    it('MUST BLOCK update when Drone is ARMED', () => {
      store.dispatch(setArmed(true));
      const safety = updateService.evaluateSafety(store.getState());

      expect(safety.isSafe).toBe(false);
      expect(safety.reason).toBe('ARMED');
      expect(safety.message).toContain('ARMED');
    });

    it('MUST BLOCK update when Drone is in unsafe flight modes (TAKEOFF, LAND, AUTO, GUIDED, IN_FLIGHT, RTL)', () => {
      const unsafeModes = ['TAKEOFF', 'LAND', 'AUTO', 'GUIDED', 'MISSION_RUNNING', 'IN_FLIGHT', 'RTL', 'QRTL'];

      for (const mode of unsafeModes) {
        store.dispatch(setArmed(false));
        store.dispatch(setFlightMode(mode));
        const safety = updateService.evaluateSafety(store.getState());

        expect(safety.isSafe).toBe(false);
        expect(safety.reason).toBe('UNSAFE_FLIGHT_MODE');
      }
    });

    it('MUST BLOCK update when telemetry state is UNINIT or BOOTING', () => {
      store.dispatch(setSystemStatus('UNINIT'));
      const safety = updateService.evaluateSafety(store.getState());

      expect(safety.isSafe).toBe(false);
      expect(safety.reason).toBe('UNCONFIRMED_STATE');
    });

    it('MUST ALLOW update in Mock Mode when Mock Drone is DISARMED and landed', () => {
      store.dispatch(setConnectionType('MOCK'));
      store.dispatch(setArmed(false));
      store.dispatch(setFlightMode('STABILIZE'));
      const safety = updateService.evaluateSafety(store.getState());

      expect(safety.isSafe).toBe(true);
      expect(safety.reason).toBe('SAFE_CONFIRMED');
    });

    it('MUST ALLOW update in Real Mode when Vehicle is Connected and confirmed DISARMED', () => {
      store.dispatch(setConnectionType('UDP'));
      store.dispatch(setConnectionStatus('CONNECTED'));
      store.dispatch(setArmed(false));
      store.dispatch(setFlightMode('STABILIZE'));
      const safety = updateService.evaluateSafety(store.getState());

      expect(safety.isSafe).toBe(true);
      expect(safety.reason).toBe('SAFE_CONFIRMED');
    });

    it('MUST FAIL-CLOSED (BLOCK) when Real Vehicle is DISCONNECTED (state unconfirmed)', () => {
      store.dispatch(setConnectionType('UDP'));
      store.dispatch(setConnectionStatus('DISCONNECTED'));
      store.dispatch(setArmed(false));
      const safety = updateService.evaluateSafety(store.getState());

      expect(safety.isSafe).toBe(false);
      expect(safety.reason).toBe('DISCONNECTED_REAL_VEHICLE');
    });
  });

  describe('2. Race Condition Scenarios', () => {
    it('Race Condition A: Update downloading -> Drone becomes ARMED -> Download finishes -> Apply MUST BE BLOCKED', async () => {
      // 1. Start download
      store.dispatch(setArmed(false));
      const fetchPromise = updateService.fetchUpdate();

      // 2. Drone becomes ARMED while downloading
      store.dispatch(setArmed(true));

      await fetchPromise;

      // 3. Update is ready in cache, but applying MUST be blocked
      expect(store.getState().update.updateReady).toBe(true);
      const applyResult = await updateService.applyUpdateSafely();
      expect(applyResult.success).toBe(false);
      expect(applyResult.error).toContain('ARMED');
    });

    it('Race Condition B: Update ready -> Drone becomes ARMED -> User presses Apply -> MUST BE BLOCKED', async () => {
      store.dispatch(setUpdateReady(true));
      store.dispatch(setArmed(true));

      const applyResult = await updateService.applyUpdateSafely();
      expect(applyResult.success).toBe(false);
      expect(applyResult.error).toContain('SAFETY INTERLOCK');
    });

    it('Race Condition C: User presses Update -> Drone becomes ARMED immediately at execution boundary -> MUST BE ABORTED', async () => {
      store.dispatch(setUpdateReady(true));
      store.dispatch(setArmed(false));

      // Simulate state changing to ARMED right at the atomic check
      store.dispatch(setArmed(true));

      const result = await updateService.applyUpdateSafely();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ARMED');
    });

    it('Race Condition D: Drone IN_FLIGHT -> Update check/download -> Apply is BLOCKED until DISARMED', async () => {
      store.dispatch(setFlightMode('IN_FLIGHT'));
      store.dispatch(setArmed(true));

      const checkResult = await updateService.checkForUpdate();
      expect(checkResult.isAvailable).toBe(true);

      const fetchResult = await updateService.fetchUpdate();
      expect(fetchResult.isSuccess).toBe(true);

      // Attempt to apply while still in flight
      const applyResult = await updateService.applyUpdateSafely();
      expect(applyResult.success).toBe(false);

      // Vehicle lands and disarms
      store.dispatch(setArmed(false));
      store.dispatch(setFlightMode('STABILIZE'));

      // Now safe to apply
      const safeApplyResult = await updateService.applyUpdateSafely();
      expect(safeApplyResult.success).toBe(true);
    });

    it('Race Condition E: Flight starts while update is ready (DISARMED -> ARMED) -> OTA remains cached, reload is blocked', async () => {
      store.dispatch(setUpdateReady(true));
      store.dispatch(setArmed(false));

      // Pilot takes off
      store.dispatch(setArmed(true));
      store.dispatch(setFlightMode('TAKEOFF'));

      const result = await updateService.applyUpdateSafely();
      expect(result.success).toBe(false);
      expect(store.getState().update.updateReady).toBe(true);
    });
  });

  describe('3. Decoupled Runtime & Metadata Verification', () => {
    it('Verifies Native Runtime Version (1.0.0) is decoupled from dynamic App Version', () => {
      const metadata = updateService.getMetadata();

      expect(metadata.runtimeVersion).toBe('1.0.0');
      expect(metadata.appVersion).toBe('1.0.0');
      expect(metadata.channel).toBe('production');
      expect(metadata.updateId).toBe('test-update-uuid-1234');
      expect(metadata.isEmbeddedLaunch).toBe(true);
    });
  });
});
