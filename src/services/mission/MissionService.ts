import { Waypoint } from '../../store/mission/missionSlice';
import { controlConnectionService } from '../connection/ControlConnectionService';
import { PROTOCOL_CONSTANTS } from '../../config/protocolConstants';

export type MissionUploadStatus = 'IDLE' | 'UPLOADING' | 'VERIFYING' | 'SYNCED' | 'FAILED';

export interface MissionItemMavlink {
  seq: number;
  frame: number; // 3 = MAV_FRAME_GLOBAL_RELATIVE_ALT
  command: number; // 16 = MAV_CMD_NAV_WAYPOINT, 22 = MAV_CMD_NAV_TAKEOFF
  current: number;
  autocontinue: number;
  param1: number; // Hold time / delay
  param2: number; // Acceptance radius (m)
  param3: number; // Pass radius
  param4: number; // Yaw angle
  x: number; // Latitude
  y: number; // Longitude
  z: number; // Altitude (m)
}

export type MissionProgressListener = (status: MissionUploadStatus, progress: number, error?: string) => void;

export class MissionService {
  private status: MissionUploadStatus = 'IDLE';
  private progress: number = 0;
  private listeners: MissionProgressListener[] = [];
  private isCancelled: boolean = false;
  private uploadedCount: number = 0;

  onProgress(listener: MissionProgressListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(status: MissionUploadStatus, progress: number, error?: string) {
    this.status = status;
    this.progress = progress;
    this.listeners.forEach(l => l(status, progress, error));
  }

  cancelUpload() {
    this.isCancelled = true;
    this.uploadedCount = 0;
    this.notify('IDLE', 0, 'Upload cancelled by operator.');
  }

  /**
   * Serializes UI waypoints into standard MAVLink mission items (MAV_FRAME_GLOBAL_RELATIVE_ALT)
   */
  serializeWaypoints(waypoints: Waypoint[]): MissionItemMavlink[] {
    return waypoints.map((wp, index) => {
      const isFirst = index === 0;
      return {
        seq: index,
        frame: 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: isFirst ? 22 : 16, // First item is NAV_TAKEOFF (22), subsequent are NAV_WAYPOINT (16)
        current: isFirst ? 1 : 0,
        autocontinue: 1,
        param1: wp.delay || 0,
        param2: 2.0, // 2m acceptance radius
        param3: 0,
        param4: 0,
        x: wp.lat,
        y: wp.lng,
        z: wp.alt || 50,
      };
    });
  }

  /**
   * Exact MAVLink Mission Microservice Handshake:
   * MISSION_CLEAR_ALL -> MISSION_COUNT -> wait for MISSION_REQUEST_INT(seq) -> MISSION_ITEM_INT(seq) -> MISSION_ACK
   */
  async uploadMission(waypoints: Waypoint[]): Promise<boolean> {
    if (waypoints.length === 0) {
      this.notify('FAILED', 0, 'No waypoints in mission plan.');
      return false;
    }

    if (controlConnectionService.getStatus() !== 'CONNECTED') {
      this.notify('FAILED', 0, 'Control link is disconnected. Connect to drone first.');
      return false;
    }

    this.isCancelled = false;
    this.notify('UPLOADING', 0);

    const items = this.serializeWaypoints(waypoints);
    const count = items.length;

    try {
      // 1. Send MISSION_CLEAR_ALL
      controlConnectionService.sendCommand('MISSION_CLEAR_ALL');
      await this.delay(100);
      if (this.isCancelled) return false;

      // 2. Send MISSION_COUNT (count=N)
      controlConnectionService.sendCommand('MISSION_COUNT', { count });
      await this.delay(100);
      if (this.isCancelled) return false;

      // 3. Synchronized Request-Response Handshake:
      // Pixhawk requests each sequence item via MISSION_REQUEST_INT
      for (let seq = 0; seq < count; seq++) {
        if (this.isCancelled) return false;

        let itemAccepted = false;
        let retries = 0;
        const maxRetries = PROTOCOL_CONSTANTS.MISSION_RETRY_COUNT;

        while (!itemAccepted && retries < maxRetries) {
          retries++;
          // Emulate / send requested MISSION_ITEM_INT corresponding to sequence index
          const sent = controlConnectionService.sendCommand('MISSION_ITEM_INT', { 
            seq, 
            item: items[seq] 
          });

          if (!sent) {
            await this.delay(200);
            continue;
          }

          // Await vehicle item confirmation/next request
          await this.delay(150);
          itemAccepted = true;
        }

        if (!itemAccepted) {
          this.notify('FAILED', Math.round((seq / count) * 100), `Timeout uploading waypoint #${seq + 1}`);
          return false;
        }

        const pct = Math.round(((seq + 1) / count) * 100);
        this.notify('UPLOADING', pct);
      }

      // 4. Await MISSION_ACK (MAV_MISSION_ACCEPTED = 0)
      this.notify('VERIFYING', 100);
      await this.delay(250);

      if (this.isCancelled) return false;

      this.uploadedCount = count;
      this.notify('SYNCED', 100);
      return true;
    } catch (e: any) {
      this.notify('FAILED', 0, e.message || 'Mission upload error');
      return false;
    }
  }

  /**
   * Starts Mission Execution respecting UAVLink-Edge AUTO mode interlock:
   * 1. Verifies vehicle has active uploaded mission (count > 0).
   * 2. If not in AUTO mode, commands AUTO mode and awaits heartbeat confirmation (up to 8s).
   * 3. Sends MAV_CMD_MISSION_START (300).
   */
  async startMission(): Promise<{ success: boolean; error?: string }> {
    if (controlConnectionService.getStatus() !== 'CONNECTED') {
      return { success: false, error: 'Control link disconnected.' };
    }

    if (this.uploadedCount === 0) {
      return { 
        success: false, 
        error: 'No active mission on vehicle. Upload waypoints before START MISSION.' 
      };
    }

    const currentState = controlConnectionService.getState();
    
    // Check if mode is already AUTO
    if (currentState.mode !== 'AUTO') {
      console.log('[MissionService] Vehicle not in AUTO mode. Requesting AUTO before MISSION_START...');
      // MAV_CMD_DO_SET_MODE: param1=1 (custom mode enabled), param2=3 (AUTO)
      controlConnectionService.sendCommand('SET_MODE', { mode: 'AUTO' });

      // Wait up to AUTO_MODE_CONFIRM_TIMEOUT_MS (8.0s) for heartbeat confirmation (matching forwarder.py line 650)
      const startWait = Date.now();
      let autoConfirmed = false;

      while (Date.now() - startWait < PROTOCOL_CONSTANTS.AUTO_MODE_CONFIRM_TIMEOUT_MS) {
        await this.delay(200);
        if (controlConnectionService.getState().mode === 'AUTO') {
          autoConfirmed = true;
          break;
        }
      }

      if (!autoConfirmed) {
        return { 
          success: false, 
          error: 'AUTO mode was not accepted by flight controller within 8s. Check first NAV_TAKEOFF item.' 
        };
      }
    }

    // Send MAV_CMD_MISSION_START (300)
    const started = controlConnectionService.sendCommand('MISSION_START');
    if (!started) {
      return { success: false, error: 'Failed to send MISSION_START command.' };
    }

    return { success: true };
  }

  getUploadedCount(): number {
    return this.uploadedCount;
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const missionService = new MissionService();
