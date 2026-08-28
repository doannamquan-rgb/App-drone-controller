import { VideoConnectionStatus } from '../../store/connection/connectionSlice';
import { VideoSettings } from '../../settings/types/video';

type VideoStatusListener = (status: VideoConnectionStatus, error?: string | null) => void;

export class MockVideoService {
  private status: VideoConnectionStatus = 'OFFLINE';
  private statusListeners: VideoStatusListener[] = [];
  private currentError: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  connect(settings?: Partial<VideoSettings>) {
    if (settings?.source === 'Disabled') {
      this.setStatus('OFFLINE', null);
      return;
    }

    this.setStatus('CONNECTING', null);
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.setStatus('STREAMING', null);
    }, 600);
  }

  disconnect() {
    if (this.timer) clearTimeout(this.timer);
    this.setStatus('OFFLINE', null);
  }

  simulateDrop() {
    this.setStatus('RECONNECTING', 'Connection lost, retrying stream...');
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.setStatus('STREAMING', null);
    }, 2000);
  }

  simulateError(errorMessage: string = 'Stream pipeline unavailable') {
    this.setStatus('ERROR', errorMessage);
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

export const mockVideoService = new MockVideoService();
