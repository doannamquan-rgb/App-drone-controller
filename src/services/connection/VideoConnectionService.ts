import { VideoSettings, VideoSource } from '../../settings/types/video';
import { VideoConnectionStatus } from '../../store/connection/connectionSlice';
import { mockVideoService } from './MockVideoService';

type VideoStatusListener = (status: VideoConnectionStatus, error?: string | null) => void;

export class VideoConnectionService {
  private status: VideoConnectionStatus = 'OFFLINE';
  private currentError: string | null = null;
  private statusListeners: VideoStatusListener[] = [];
  private activeSettings: VideoSettings | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Resolves the real media URL for expo-video or native media player according to priority:
   * 1. PRIMARY: MediaMTX WebRTC / WHEP (:8889/.../whep)
   * 2. SECONDARY: MediaMTX RTSP (:8554/...)
   * 3. FALLBACK: MediaMTX HLS (:8888/.../index.m3u8)
   */
  resolveStreamUrl(settings: VideoSettings): string | null {
    if (settings.source === 'Disabled') return null;

    if (settings.source === 'MPEG-TS') {
      return 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    }

    const host = (settings.mediamtxHost || '192.168.1.100').trim();
    const uuid = (settings.droneUuid || '00000011-0000-0000-0000-000000000011').trim();
    const cam = settings.cameraId || 'cam0';

    // PRIMARY: WebRTC / WHEP (Recommended for realtime FPV viewing)
    if (settings.source === 'MediaMTX WebRTC') {
      const port = settings.mediamtxWebrtcPort || 8889;
      return `http://${host}:${port}/${uuid}/${cam}/whep`;
    }

    // SECONDARY: RTSP Stream
    if (settings.source === 'MediaMTX RTSP') {
      const port = settings.mediamtxRtspPort || 8554;
      return `rtsp://${host}:${port}/${uuid}/${cam}`;
    }

    // FALLBACK: HLS Stream
    if (settings.source === 'MediaMTX HLS') {
      const port = settings.mediamtxHlsPort || 8888;
      return `http://${host}:${port}/${uuid}/${cam}/index.m3u8`;
    }

    if (settings.source === 'RTSP' && settings.rtspUrl) {
      return settings.rtspUrl;
    }

    if (settings.source === 'UDP H.264') {
      return `udp://${settings.udpListenAddress || '0.0.0.0'}:${settings.udpPort || 5600}`;
    }

    return null;
  }

  /**
   * Get Fallback URL (e.g. if WebRTC / RTSP fails, fallback to HLS)
   */
  resolveFallbackUrl(settings: VideoSettings): string | null {
    const host = (settings.mediamtxHost || '192.168.1.100').trim();
    const uuid = (settings.droneUuid || '00000011-0000-0000-0000-000000000011').trim();
    const cam = settings.cameraId || 'cam0';
    const port = settings.mediamtxHlsPort || 8888;
    return `http://${host}:${port}/${uuid}/${cam}/index.m3u8`;
  }

  connect(settings: VideoSettings, isMockMode: boolean = false) {
    this.activeSettings = settings;

    if (settings.source === 'Disabled') {
      this.disconnect();
      return;
    }

    if (isMockMode) {
      mockVideoService.connect(settings);
      mockVideoService.onStatusChange((mStatus, mErr) => {
        this.setStatus(mStatus, mErr);
      });
      return;
    }

    this.setStatus('CONNECTING', null);
  }

  notifyStreamPlaying() {
    if (this.status !== 'STREAMING') {
      this.setStatus('STREAMING', null);
    }
  }

  notifyStreamError(errorMessage: string) {
    this.setStatus('ERROR', errorMessage);
    this.scheduleReconnect();
  }

  notifyStreamStopped() {
    if (this.status === 'STREAMING') {
      this.setStatus('RECONNECTING', 'Video stream paused or buffering...');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.activeSettings && this.activeSettings.source !== 'Disabled') {
        console.log('[Video MediaMTX] Attempting independent video stream recovery...');
        this.setStatus('CONNECTING', null);
      }
    }, 4000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    mockVideoService.disconnect();
    this.setStatus('OFFLINE', null);
  }

  getStatus(): VideoConnectionStatus {
    return this.status;
  }

  getError(): string | null {
    return this.currentError;
  }

  onStatusChange(listener: VideoStatusListener) {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  private setStatus(status: VideoConnectionStatus, error: string | null = null) {
    this.status = status;
    this.currentError = error;
    this.statusListeners.forEach(l => l(status, error));
  }
}

export const videoConnectionService = new VideoConnectionService();
