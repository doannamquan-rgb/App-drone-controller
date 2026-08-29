import { Platform, NativeModules } from 'react-native';
import { ConnectionConfig, ConnectionType, NetworkPath } from '../../settings/types/connection';
import { UniversalTelemetryData } from './UniversalConnectionService';
import { mockControlService } from './MockControlService';
import { AppConfig } from '../../config';
import { ControlMessageType, FlightControlPacket } from '../../types/joystick';

export type ControlConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'ERROR';

type TelemetryListener = (data: UniversalTelemetryData) => void;
type StatusListener = (status: ControlConnectionStatus) => void;

function getAutoDevHost(): string | null {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname;
    }
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL) {
      const match = scriptURL.match(/https?:\/\/([^/:]+)/);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        const host = match[1];
        if (host.includes('exp.direct') || host.includes('ngrok') || host.includes('expo.dev')) {
          return null;
        }
        return host;
      }
    }
  } catch (e) {}
  return null;
}

const createInitialState = (): UniversalTelemetryData => ({
  latitude: 0,
  longitude: 0,
  altitude: 0.0,
  speed: 0.0,
  battery: 0,
  mode: 'DISCONNECTED',
  armed: false,
  timestamp: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  heading: 0,
  satellites: 0,
  hdop: 0,
  voltage: 0.0,
  current: 0.0,
  vehicleType: 'COPTER',
  vehicleName: 'NO VEHICLE',
  autopilot: 'ARDUPILOT',
  bytesRx: 0,
  bytesTx: 0,
  packetsPerSec: 0,
  latencyMs: 0,
  sensors: [],
});

export class ControlConnectionService {
  private status: ControlConnectionStatus = 'DISCONNECTED';
  private telemetryListeners: TelemetryListener[] = [];
  private statusListeners: StatusListener[] = [];
  
  private activeConfig: ConnectionConfig | null = null;
  private ws: WebSocket | null = null;
  private state: UniversalTelemetryData = createInitialState();
  
  private sessionId: string = '';
  private lastRxSessionId: string = '';
  private lastHeartbeatTime: number = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTxInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private txSequenceNumber: number = 0;
  private lastRxSequenceNumber: number = 0;

  private bytesRx = 0;
  private bytesTx = 0;
  private currentPps = 0;

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Resolves the target MAVLink UDP endpoint according to active topology (Mode 1: Wi-Fi Direct vs Mode 2: 4G Cloud)
   */
  resolveTargetEndpoint(config?: Partial<ConnectionConfig>): { host: string; port: number } {
    const udp = config?.udp;
    const networkPath: NetworkPath = udp?.networkPath || 'WIFI_DIRECT';

    if (networkPath === 'CELLULAR_4G') {
      return {
        host: (udp?.cloudHost || '45.117.171.237').trim(),
        port: udp?.cloudPort || 14550,
      };
    }

    // Default to Mode 1 (Wi-Fi Direct)
    const targetHost = (udp?.remoteHost || udp?.wifiHost || '192.168.1.100').trim();
    return {
      host: targetHost || '192.168.1.100',
      port: udp?.wifiPort || udp?.remotePort || 14550,
    };
  }

  /**
   * Connect strictly to Control & Telemetry Transport (WebSocket / MAVLink / Mock)
   */
  connect(config?: Partial<ConnectionConfig>) {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING') return;

    this.activeConfig = config as ConnectionConfig;
    const cType = config?.type || 'WEBSOCKET';

    // Reset sequence numbers and start a fresh session on new connection attempt
    this.sessionId = this.generateSessionId();
    this.txSequenceNumber = 0;
    this.lastRxSequenceNumber = 0;
    this.lastRxSessionId = '';

    if (cType === 'MOCK') {
      this.connectMock(config);
      return;
    }

    this.setStatus('CONNECTING');
    this.connectNetwork(config);
  }

  /**
   * Handover between Wi-Fi Direct (Mode 1) and 4G Cloud (Mode 2) without app restart
   */
  switchNetworkPath(newPath: NetworkPath) {
    if (!this.activeConfig) return;
    this.activeConfig = {
      ...this.activeConfig,
      udp: {
        ...this.activeConfig.udp,
        networkPath: newPath,
      },
    };
    console.log(`[Control MAVLink] Switching network path to: ${newPath}`);
    this.disconnect();
    setTimeout(() => {
      this.connect(this.activeConfig || undefined);
    }, 200);
  }

  private connectMock(config?: Partial<ConnectionConfig>) {
    this.setStatus('CONNECTING');
    const unsubStatus = mockControlService.onStatusChange((mStatus) => {
      this.setStatus(mStatus);
    });
    mockControlService.connect(config);
    const unsubTelem = mockControlService.onTelemetry((mData) => {
      this.state = mData;
      this.lastHeartbeatTime = Date.now();
      this.telemetryListeners.forEach(l => l(this.state));
    });

    this.startHeartbeatWatchdog();
    this.startHeartbeatTx();
  }

  private connectNetwork(config?: Partial<ConnectionConfig>) {
    const endpoint = this.resolveTargetEndpoint(config);
    const candidateHosts: string[] = [];

    if (endpoint.host && endpoint.host !== '0.0.0.0') {
      candidateHosts.push(endpoint.host);
    }

    const autoDev = getAutoDevHost();
    if (autoDev && !candidateHosts.includes(autoDev)) {
      candidateHosts.push(autoDev);
    }

    if (Platform.OS === 'web') {
      if (!candidateHosts.includes('127.0.0.1')) candidateHosts.push('127.0.0.1');
      if (!candidateHosts.includes('localhost')) candidateHosts.push('localhost');
    } else {
      if (!candidateHosts.includes('10.0.2.2')) candidateHosts.push('10.0.2.2');
      if (!candidateHosts.includes('127.0.0.1')) candidateHosts.push('127.0.0.1');
    }

    this.tryConnectCandidates(candidateHosts, 0, config);
  }

  private tryConnectCandidates(
    candidates: string[],
    index: number,
    config?: Partial<ConnectionConfig>
  ) {
    if (index >= candidates.length) {
      console.warn('[Control MAVLink] Unable to establish connection to companion gateway.');
      this.setStatus('ERROR');
      this.scheduleReconnect();
      return;
    }

    const host = candidates[index];
    // Connect to MAVLink endpoint bridge (port 8088 / companion router)
    const wsUrl = `ws://${host}:8088/ws`;

    console.log(`[Control MAVLink] Connecting to MAVLink endpoint at ${wsUrl} (candidate ${index + 1}/${candidates.length})`);

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;
      let hasOpened = false;
      let handled = false;

      const proceedNext = () => {
        if (handled) return;
        handled = true;
        clearTimeout(connectTimeout);
        try { socket.close(); } catch (e) {}
        this.tryConnectCandidates(candidates, index + 1, config);
      };

      const connectTimeout = setTimeout(() => {
        if (!hasOpened && this.status === 'CONNECTING') {
          proceedNext();
        }
      }, 2000);

      socket.onopen = () => {
        if (handled) return;
        hasOpened = true;
        handled = true;
        clearTimeout(connectTimeout);
        console.log(`[Control MAVLink] Successfully connected to MAVLink endpoint: ${wsUrl} (Session: ${this.sessionId})`);
        this.lastHeartbeatTime = Date.now();
        this.txSequenceNumber = 0;
        this.lastRxSequenceNumber = 0;
        this.setStatus('CONNECTED');
        this.startHeartbeatWatchdog();
        this.startHeartbeatTx();
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'TELEMETRY' && parsed.data) {
            this.handleIncomingTelemetry(parsed.data, parsed.seq, parsed.sessionId || parsed.session_id);
          } else if (parsed.type === 'HEARTBEAT') {
            this.lastHeartbeatTime = Date.now();
            if (parsed.sessionId && parsed.sessionId !== this.lastRxSessionId) {
              this.lastRxSessionId = parsed.sessionId;
              this.lastRxSequenceNumber = 0;
            }
            if (parsed.seq !== undefined) {
              this.lastRxSequenceNumber = parsed.seq;
            }
          }
        } catch (e) {}
      };

      socket.onerror = () => {
        if (!hasOpened) {
          proceedNext();
        } else {
          this.setStatus('DEGRADED');
        }
      };

      socket.onclose = () => {
        this.stopHeartbeatTx();
        if (hasOpened && this.status === 'CONNECTED') {
          console.warn('[Control MAVLink] Socket closed unexpectedly.');
          this.setStatus('RECONNECTING');
          this.scheduleReconnect();
        } else if (!hasOpened) {
          proceedNext();
        }
        if (this.ws === socket) {
          this.ws = null;
        }
      };
    } catch (e) {
      this.tryConnectCandidates(candidates, index + 1, config);
    }
  }

  private handleIncomingTelemetry(telemData: Partial<UniversalTelemetryData>, seq?: number, incomingSessionId?: string) {
    // If incoming message belongs to a new session, reset sequence watchdog to prevent stale rejection
    if (incomingSessionId && incomingSessionId !== this.lastRxSessionId) {
      console.log(`[Control MAVLink] New session detected: ${incomingSessionId}, resetting sequence tracker.`);
      this.lastRxSessionId = incomingSessionId;
      this.lastRxSequenceNumber = 0;
    }

    // Drop delayed/out-of-order packets if seq is present (with sanity wrap window)
    if (seq !== undefined && seq <= this.lastRxSequenceNumber && (this.lastRxSequenceNumber - seq < 10000)) {
      console.warn(`[Control MAVLink] Dropped out-of-order telemetry seq=${seq}, lastSeq=${this.lastRxSequenceNumber}`);
      return;
    }
    if (seq !== undefined) {
      this.lastRxSequenceNumber = seq;
    }

    this.lastHeartbeatTime = Date.now();
    this.bytesRx += 128;
    this.currentPps = 10;

    this.state = {
      ...this.state,
      ...telemData,
      timestamp: Date.now(),
      bytesRx: this.bytesRx,
      bytesTx: this.bytesTx,
      packetsPerSec: this.currentPps,
    };

    if (this.status === 'DEGRADED' || this.status === 'RECONNECTING') {
      this.setStatus('CONNECTED');
    }

    this.telemetryListeners.forEach(l => l(this.state));
  }

  /**
   * Autonomous Heartbeat Watchdog (Monitors incoming telemetry/heartbeats from Pi)
   */
  private startHeartbeatWatchdog() {
    if (this.heartbeatInterval) return;

    this.lastHeartbeatTime = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (this.status !== 'CONNECTED' && this.status !== 'DEGRADED') return;

      const elapsed = Date.now() - this.lastHeartbeatTime;
      if (elapsed > AppConfig.CONNECTION_TIMEOUT) {
        console.warn(`[Control MAVLink] Heartbeat lost! (${elapsed}ms ago)`);
        this.setStatus('DEGRADED');
        this.scheduleReconnect();
      }
    }, 1000);
  }

  private stopHeartbeatWatchdog() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * GCS Heartbeat TX Loop (Sends periodic heartbeat packets from mobile GCS to Pi/Pixhawk)
   * Essential to keep vehicle/companion watchdog alive even when joysticks are idle.
   */
  private startHeartbeatTx() {
    if (this.heartbeatTxInterval) return;

    this.heartbeatTxInterval = setInterval(() => {
      if (this.status !== 'CONNECTED') return;
      this.sendHeartbeat();
    }, 1000); // 1 Hz heartbeat transmission
  }

  private stopHeartbeatTx() {
    if (this.heartbeatTxInterval) {
      clearInterval(this.heartbeatTxInterval);
      this.heartbeatTxInterval = null;
    }
  }

  private sendHeartbeat() {
    this.txSequenceNumber++;
    this.bytesTx += 32;

    if (this.activeConfig?.type === 'MOCK') {
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const token = this.activeConfig?.udp?.authToken;
        if (!token) {
          console.error(
            '[Control MAVLink] SECURITY: authToken is not configured. Refusing to send heartbeat over unauthenticated channel. ' +
            'Set udp.authToken in your connection settings before connecting.'
          );
          return;
        }
        const packet: FlightControlPacket = {
          sessionId: this.sessionId,
          seq: this.txSequenceNumber,
          timestamp: Date.now(),
          type: 'HEARTBEAT',
          token,
          payload: {
            source: 'DRONEGSC_MOBILE',
            vehicleType: this.activeConfig?.vehicleType || 'COPTER',
            autopilot: this.activeConfig?.autopilot || 'ARDUPILOT',
          },
        };
        this.ws.send(JSON.stringify(packet));
      } catch (e) {
        console.error('[Control MAVLink] Failed to send GCS heartbeat:', e);
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.status === 'RECONNECTING' || this.status === 'DEGRADED' || this.status === 'ERROR') {
        console.log('[Control MAVLink] Attempting autonomous reconnect...');
        this.connect(this.activeConfig || undefined);
      }
    }, 3000);
  }

  disconnect() {
    this.setStatus('DISCONNECTED');
    this.stopHeartbeatWatchdog();
    this.stopHeartbeatTx();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    mockControlService.disconnect();
    this.sessionId = '';
    this.txSequenceNumber = 0;
    this.lastRxSequenceNumber = 0;
    this.lastRxSessionId = '';
    this.state = createInitialState();
    this.telemetryListeners.forEach(l => l(this.state));
  }

  getStatus(): ControlConnectionStatus {
    return this.status;
  }

  getState(): UniversalTelemetryData {
    return this.state;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getTxSequenceNumber(): number {
    return this.txSequenceNumber;
  }

  getLastRxSequenceNumber(): number {
    return this.lastRxSequenceNumber;
  }

  onTelemetry(listener: TelemetryListener) {
    this.telemetryListeners.push(listener);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter(l => l !== listener);
    };
  }

  onStatusChange(listener: StatusListener) {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  private setStatus(newStatus: ControlConnectionStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.statusListeners.forEach(l => l(newStatus));
  }

  /**
   * Send high-priority control command directly to UAVLink-Edge via MAVLink
   */
  sendCommand(command: string, payload?: any, type: ControlMessageType = 'COMMAND'): boolean {
    if (this.status !== 'CONNECTED' && this.status !== 'DEGRADED') {
      console.warn('[Control MAVLink] Cannot send command while control link is disconnected.');
      return false;
    }

    this.bytesTx += 48;
    this.txSequenceNumber++;

    if (this.activeConfig?.type === 'MOCK') {
      return mockControlService.sendControlCommand(command, payload);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const token = this.activeConfig?.udp?.authToken;
        if (!token) {
          console.error(
            '[Control MAVLink] SECURITY: authToken is not configured. Refusing to send command over unauthenticated channel. ' +
            'Set udp.authToken in your connection settings before connecting.'
          );
          return false;
        }
        const packet: FlightControlPacket = {
          sessionId: this.sessionId,
          seq: this.txSequenceNumber,
          timestamp: Date.now(),
          type: type,
          token,
          payload: { command, payload },
        };
        this.ws.send(JSON.stringify(packet));
        return true;
      } catch (e) {
        console.error('[Control MAVLink] Failed to send command over socket:', e);
        return false;
      }
    }

    return true;
  }

  updateMockState(updates: Partial<UniversalTelemetryData>) {
    if (this.activeConfig?.type === 'MOCK') {
      mockControlService.updateState(updates);
    } else {
      this.state = {
        ...this.state,
        ...updates,
        timestamp: Date.now(),
      };
      this.telemetryListeners.forEach(l => l(this.state));
    }
  }
}

export const controlConnectionService = new ControlConnectionService();


