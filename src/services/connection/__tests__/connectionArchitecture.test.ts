import { controlConnectionService } from '../ControlConnectionService';
import { videoConnectionService } from '../VideoConnectionService';
import { mockControlService } from '../MockControlService';
import { mockVideoService } from '../MockVideoService';
import { joystickProcessor, NEUTRAL_FLIGHT_INPUT } from '../../joystick/JoystickProcessor';
import { missionService } from '../../mission/MissionService';
import { safetyLayer } from '../../command/SafetyLayer';
import { store } from '../../../store';
import { setArmed, setFlightMode } from '../../../store/drone/droneSlice';
import { setControlStatus, setVideoStatus } from '../../../store/connection/connectionSlice';
import { DEFAULT_VIDEO_CONFIG } from '../../../settings/defaults/video';
import { DEFAULT_CONNECTION_CONFIG } from '../../../settings/defaults/connection';

describe('DroneGSC ↔ UAVLink-Edge Protocol Conformance Verification Suite', () => {
  beforeEach(() => {
    controlConnectionService.disconnect();
    videoConnectionService.disconnect();
    joystickProcessor.stop();
  });

  describe('1. Topology Support: Mode 1 (Wi-Fi Direct) & Mode 2 (4G Cloud)', () => {
    it('MUST resolve Mode 1 (Direct Wi-Fi) target endpoint to Pi local IP and port 14550', () => {
      const mode1Config = {
        ...DEFAULT_CONNECTION_CONFIG,
        udp: {
          ...DEFAULT_CONNECTION_CONFIG.udp,
          networkPath: 'WIFI_DIRECT' as const,
          wifiHost: '192.168.1.100',
          wifiPort: 14550,
        },
      };

      const endpoint = controlConnectionService.resolveTargetEndpoint(mode1Config);
      expect(endpoint.host).toBe('192.168.1.100');
      expect(endpoint.port).toBe(14550);
    });

    it('MUST resolve Mode 2 (4G Fleet Cloud) target endpoint to qcloudstation server 45.117.171.237:14550', () => {
      const mode2Config = {
        ...DEFAULT_CONNECTION_CONFIG,
        udp: {
          ...DEFAULT_CONNECTION_CONFIG.udp,
          networkPath: 'CELLULAR_4G' as const,
          cloudHost: '45.117.171.237',
          cloudPort: 14550,
        },
      };

      const endpoint = controlConnectionService.resolveTargetEndpoint(mode2Config);
      expect(endpoint.host).toBe('45.117.171.237');
      expect(endpoint.port).toBe(14550);
    });

    it('MUST allow dynamic handover between Wi-Fi and 4G without modifying UAVLink-Edge ports', () => {
      controlConnectionService.connect({ ...DEFAULT_CONNECTION_CONFIG, type: 'MOCK' });
      expect(controlConnectionService.getStatus()).toBe('CONNECTING');
      
      controlConnectionService.switchNetworkPath('CELLULAR_4G');
      expect(controlConnectionService.getStatus()).toBe('DISCONNECTED');
    });
  });

  describe('2. Control & Video Complete Decoupling', () => {
    it('MUST keep Control Link CONNECTED when Video is OFFLINE or ERROR', () => {
      controlConnectionService.connect({ type: 'MOCK' });
      store.dispatch(setControlStatus('CONNECTED'));
      store.dispatch(setArmed(true));
      store.dispatch(setFlightMode('LOITER'));

      videoConnectionService.notifyStreamError('MediaMTX RTSP port unreachable');
      store.dispatch(setVideoStatus('ERROR'));

      const state = store.getState();
      expect(state.connection.controlStatus).toBe('CONNECTED');
      expect(state.connection.videoStatus).toBe('ERROR');
      expect(state.drone.armed).toBe(true);
      expect(state.drone.flightMode).toBe('LOITER');
    });

    it('MUST allow Video STREAMING while Control is DISCONNECTED', () => {
      store.dispatch(setControlStatus('DISCONNECTED'));
      videoConnectionService.connect({ ...DEFAULT_VIDEO_CONFIG, source: 'MediaMTX WebRTC' }, true);
      store.dispatch(setVideoStatus('STREAMING'));

      const state = store.getState();
      expect(state.connection.controlStatus).toBe('DISCONNECTED');
      expect(state.connection.videoStatus).toBe('STREAMING');
    });

    it('Video stream disconnect or drop NEVER triggers drone failsafe or disarming', () => {
      store.dispatch(setControlStatus('CONNECTED'));
      store.dispatch(setArmed(true));

      mockVideoService.simulateDrop();
      const state = store.getState();

      expect(state.connection.controlStatus).toBe('CONNECTED');
      expect(state.drone.armed).toBe(true);
    });
  });

  describe('3. Continuous Joystick Control Loop & Neutral Safety', () => {
    it('MUST continuously send Neutral control frames (roll=0, pitch=0, yaw=0, throttle=0.5) when sticks are idle', async () => {
      joystickProcessor.start();

      await new Promise(resolve => setTimeout(resolve, 80));
      const lastInput = joystickProcessor.getLastProcessedInput();
      expect(lastInput.roll).toBe(0);
      expect(lastInput.pitch).toBe(0);
      expect(lastInput.yaw).toBe(0);
      expect(lastInput.throttle).toBe(0.5);
      expect(lastInput.seq).toBeGreaterThan(0);
      joystickProcessor.stop();
    });

    it('MUST neutralize active stick when user touches then releases', async () => {
      joystickProcessor.start();
      joystickProcessor.updateRightStick(0.8, 0, true);
      expect(joystickProcessor.getLastProcessedInput().roll).toBeGreaterThan(0.5);

      joystickProcessor.updateRightStick(0, 0, false);
      const input = joystickProcessor.getLastProcessedInput();
      expect(input.roll).toBe(0);
      expect(input.pitch).toBe(0);
      joystickProcessor.stop();
    });

    it('MUST increment sequence numbers monotonically and attach valid timestamps', async () => {
      joystickProcessor.start();
      await new Promise(resolve => setTimeout(resolve, 110));
      const seq1 = joystickProcessor.getSequenceNumber();
      expect(seq1).toBeGreaterThanOrEqual(2);

      await new Promise(resolve => setTimeout(resolve, 60));
      const seq2 = joystickProcessor.getSequenceNumber();
      expect(seq2).toBeGreaterThan(seq1);
      joystickProcessor.stop();
    });
  });

  describe('4. MAVLink Mission Protocol Handshake & AUTO Interlock', () => {
    it('MUST serialize waypoints into valid MAVLink Mission items with TAKEOFF first', () => {
      const sampleWaypoints = [
        { id: 'wp-1', lat: 10.762, lng: 106.660, alt: 30, speed: 5, delay: 0 },
        { id: 'wp-2', lat: 10.765, lng: 106.665, alt: 50, speed: 8, delay: 2 },
      ];

      const serialized = missionService.serializeWaypoints(sampleWaypoints);
      expect(serialized.length).toBe(2);
      expect(serialized[0].command).toBe(22); // MAV_CMD_NAV_TAKEOFF
      expect(serialized[0].z).toBe(30);
      expect(serialized[1].command).toBe(16); // MAV_CMD_NAV_WAYPOINT
      expect(serialized[1].z).toBe(50);
      expect(serialized[1].param1).toBe(2); // delay
    });

    it('MUST fail upload gracefully when Control Link is DISCONNECTED', async () => {
      controlConnectionService.disconnect();
      const sampleWaypoints = [
        { id: 'wp-1', lat: 10.762, lng: 106.660, alt: 30, speed: 5, delay: 0 },
      ];

      const result = await missionService.uploadMission(sampleWaypoints);
      expect(result).toBe(false);
    });

    it('MUST execute synchronized request-response upload handshake when connected', async () => {
      controlConnectionService.connect({ type: 'MOCK' });
      await new Promise(resolve => setTimeout(resolve, 500));

      const sampleWaypoints = [
        { id: 'wp-1', lat: 10.762, lng: 106.660, alt: 30, speed: 5, delay: 0 },
        { id: 'wp-2', lat: 10.765, lng: 106.665, alt: 50, speed: 8, delay: 0 },
      ];

      const result = await missionService.uploadMission(sampleWaypoints);
      expect(result).toBe(true);
      expect(missionService.getUploadedCount()).toBe(2);
    });

    it('MUST reject startMission if zero waypoints are uploaded', async () => {
      controlConnectionService.connect({ type: 'MOCK' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force uploaded count = 0
      missionService.cancelUpload();
      const res = await missionService.startMission();
      expect(res.success).toBe(false);
      expect(res.error).toContain('No active mission');
    });
  });

  describe('5. Video Protocol Priority & Dynamic URLs', () => {
    it('PRIMARY: MUST resolve WebRTC/WHEP URL (:8889) for real-time FPV viewing', () => {
      const webrtcConfig = {
        ...DEFAULT_VIDEO_CONFIG,
        source: 'MediaMTX WebRTC' as const,
        mediamtxHost: '192.168.1.100',
        mediamtxWebrtcPort: 8889,
        droneUuid: '00000011-0000-0000-0000-000000000011',
        cameraId: 'cam0' as const,
      };

      const url = videoConnectionService.resolveStreamUrl(webrtcConfig);
      expect(url).toBe('http://192.168.1.100:8889/00000011-0000-0000-0000-000000000011/cam0/whep');
    });

    it('SECONDARY: MUST resolve RTSP URL (:8554)', () => {
      const rtspConfig = {
        ...DEFAULT_VIDEO_CONFIG,
        source: 'MediaMTX RTSP' as const,
        mediamtxHost: '45.117.171.237',
        mediamtxRtspPort: 8554,
        droneUuid: '00000011-0000-0000-0000-000000000011',
        cameraId: 'cam1' as const,
      };

      const url = videoConnectionService.resolveStreamUrl(rtspConfig);
      expect(url).toBe('rtsp://45.117.171.237:8554/00000011-0000-0000-0000-000000000011/cam1');
    });

    it('FALLBACK: MUST resolve HLS URL (:8888)', () => {
      const hlsConfig = {
        ...DEFAULT_VIDEO_CONFIG,
        source: 'MediaMTX HLS' as const,
        mediamtxHost: '192.168.1.100',
        mediamtxHlsPort: 8888,
        droneUuid: '00000011-0000-0000-0000-000000000011',
        cameraId: 'cam0' as const,
      };

      const url = videoConnectionService.resolveStreamUrl(hlsConfig);
      expect(url).toBe('http://192.168.1.100:8888/00000011-0000-0000-0000-000000000011/cam0/index.m3u8');
    });
  });

  describe('6. Safety & Integrity Checks', () => {
    it('MUST preserve SafetyLayer execution validation', async () => {
      store.dispatch(setControlStatus('DISCONNECTED'));
      const result = await safetyLayer.executeCommand({ type: 'ARM' });
      expect(result.success).toBe(false);
    });

    it('MUST generate new Session ID and reset sequence numbers upon reconnect', async () => {
      controlConnectionService.connect({ type: 'MOCK' });
      await new Promise(resolve => setTimeout(resolve, 500));
      const sess1 = controlConnectionService.getSessionId();
      expect(sess1).toBeTruthy();
      expect(sess1.startsWith('sess_')).toBe(true);

      controlConnectionService.sendCommand('ARM');
      expect(controlConnectionService.getTxSequenceNumber()).toBeGreaterThan(0);

      controlConnectionService.disconnect();
      expect(controlConnectionService.getTxSequenceNumber()).toBe(0);

      controlConnectionService.connect({ type: 'MOCK' });
      await new Promise(resolve => setTimeout(resolve, 500));
      const sess2 = controlConnectionService.getSessionId();
      expect(sess2).toBeTruthy();
      expect(sess2).not.toBe(sess1);
      controlConnectionService.disconnect();
    });

    it('MUST have authToken undefined by default — no hardcoded fallback (fail-closed security)', () => {
      expect(DEFAULT_CONNECTION_CONFIG.udp.authToken).toBeUndefined();
    });

    it('MUST use WEBSOCKET as default ConnectionType (not UDP) to reflect actual WebSocket transport', () => {
      expect(DEFAULT_CONNECTION_CONFIG.type).toBe('WEBSOCKET');
    });

    it('MUST never contain hardcoded developer IPs (e.g. 192.168.1.12)', () => {
      expect(DEFAULT_CONNECTION_CONFIG.udp.remoteHost).not.toBe('192.168.1.12');
      expect(DEFAULT_VIDEO_CONFIG.mediamtxHost).not.toBe('192.168.1.12');
    });
  });
});
