import { useEffect, useRef } from 'react';
import { controlConnectionService } from '../services/connection/ControlConnectionService';
import { videoConnectionService } from '../services/connection/VideoConnectionService';
import { heartbeatService } from '../services/connection/HeartbeatService';
import { UniversalTelemetryData } from '../services/connection/UniversalConnectionService';
import { PROTOCOL_CONSTANTS } from '../config/protocolConstants';
import { useAppDispatch } from '../store/hooks';
import { 
  setStatus, 
  setControlStatus,
  setVideoStatus,
  setVideoError,
  setHeartbeat, 
  setLatency, 
  updateTrafficStats, 
  setDetectedVehicle 
} from '../store/connection/connectionSlice';
import { 
  updateGps, 
  updateBattery, 
  updateAttitude, 
  updateVelocity, 
  updateSensors,
  clearTelemetry 
} from '../store/telemetry/telemetrySlice';
import { setArmed, setFlightMode } from '../store/drone/droneSlice';

export function ConnectionManager() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // 1. Subscribe to Control Link status changes
    const unsubscribeControlStatus = controlConnectionService.onStatusChange((status) => {
      dispatch(setControlStatus(status));
      if (status === 'CONNECTED') {
        heartbeatService.start();
      } else {
        heartbeatService.stop();
        if (status === 'DISCONNECTED' || status === 'ERROR') {
          dispatch(clearTelemetry());
          dispatch(setArmed(false));
          dispatch(setFlightMode('DISCONNECTED'));
          dispatch(updateTrafficStats({ bytesRx: 0, bytesTx: 0, pps: 0 }));
        }
      }
    });

    // 2. Subscribe to Video Stream status changes (Completely Decoupled)
    const unsubscribeVideoStatus = videoConnectionService.onStatusChange((status, error) => {
      dispatch(setVideoStatus(status));
      dispatch(setVideoError(error || null));
    });

    // Field-specific UI Telemetry Throttling Timestamps
    let lastAttitudeTick = 0;
    let lastGpsTick = 0;
    let lastSlowTick = 0;
    let lastArmed: boolean | null = null;
    let lastFlightMode: string | null = null;

    // 3. Subscribe to real-time Telemetry stream
    const unsubscribeTelemetry = controlConnectionService.onTelemetry((data: UniversalTelemetryData) => {
      const timestamp = data.timestamp;
      const now = Date.now();
      
      if (!timestamp) return;

      heartbeatService.receiveHeartbeat();

      // Tier 1: Attitude & Artificial Horizon HUD (High-frequency ~20 Hz / 50ms)
      if (now - lastAttitudeTick >= PROTOCOL_CONSTANTS.THROTTLE_ATTITUDE_MS) {
        lastAttitudeTick = now;
        dispatch(updateAttitude({
          value: {
            roll: data.roll || 0,
            pitch: data.pitch || 0,
            yaw: data.yaw || 0,
          },
          timestamp,
        }));
      }

      // Tier 2: GPS Position, Speed & Velocity (~5 Hz / 200ms)
      if (now - lastGpsTick >= PROTOCOL_CONSTANTS.THROTTLE_GPS_VELOCITY_MS) {
        lastGpsTick = now;
        dispatch(updateGps({
          value: {
            latitude: data.latitude,
            longitude: data.longitude,
            altitude: data.altitude,
            satellites: data.satellites || 0,
            hdop: data.hdop || 0,
            gpsFix: (data.satellites && data.satellites >= 6) ? 3 : 0,
          },
          timestamp,
        }));

        dispatch(updateVelocity({
          value: {
            groundSpeed: data.speed,
            verticalSpeed: 0,
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0,
          },
          timestamp,
        }));
      }

      // State transitions (Immediate on change)
      if (lastArmed !== data.armed) {
        lastArmed = data.armed;
        dispatch(setArmed(data.armed));
      }
      if (lastFlightMode !== data.mode) {
        lastFlightMode = data.mode;
        dispatch(setFlightMode(data.mode));
      }

      // Tier 3: Low-Frequency Stats (Battery, Diagnostics, Traffic - 1 Hz / 1000ms)
      if (now - lastSlowTick >= PROTOCOL_CONSTANTS.THROTTLE_BATTERY_STATS_MS) {
        lastSlowTick = now;
        dispatch(setHeartbeat(timestamp));
        dispatch(setLatency(data.latencyMs));
        dispatch(updateTrafficStats({
          bytesRx: data.bytesRx,
          bytesTx: data.bytesTx,
          pps: data.packetsPerSec,
        }));
        dispatch(setDetectedVehicle({
          name: data.vehicleName,
          vehicleType: data.vehicleType,
          autopilot: data.autopilot,
        }));
        dispatch(updateBattery({
          value: {
            voltage: data.voltage || 0.0,
            current: data.current || 0.0,
            percentage: data.battery,
          },
          timestamp,
        }));

        if (data.sensors && data.sensors.length > 0) {
          dispatch(updateSensors({
            value: data.sensors,
            timestamp,
          }));
        }
      }
    });

    // 4. Subscribe to Heartbeat watchdog failures
    const unsubscribeHeartbeat = heartbeatService.onHeartbeat((isAlive) => {
      if (!isAlive) {
        dispatch(setControlStatus('DEGRADED'));
      }
    });

    // Cleanup
    return () => {
      unsubscribeControlStatus();
      unsubscribeVideoStatus();
      unsubscribeTelemetry();
      unsubscribeHeartbeat();
      controlConnectionService.disconnect();
      videoConnectionService.disconnect();
    };
  }, [dispatch]);

  // Headless component
  return null;
}
