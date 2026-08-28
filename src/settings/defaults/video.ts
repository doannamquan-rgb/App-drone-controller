import { VideoSettings } from '../types/video';
import { PROTOCOL_CONSTANTS } from '../../config/protocolConstants';

export const DEFAULT_VIDEO_CONFIG: VideoSettings = {
  source: 'Disabled',
  
  // MediaMTX defaults
  mediamtxHost: '', // Configurable / empty by default (inherits active connection host)
  mediamtxRtspPort: PROTOCOL_CONSTANTS.MEDIAMTX_RTSP_PORT,
  mediamtxHlsPort: PROTOCOL_CONSTANTS.MEDIAMTX_HLS_PORT,
  mediamtxWebrtcPort: PROTOCOL_CONSTANTS.MEDIAMTX_WEBRTC_PORT,
  droneUuid: PROTOCOL_CONSTANTS.DEFAULT_DRONE_UUID_TEMPLATE,
  cameraId: PROTOCOL_CONSTANTS.DEFAULT_CAMERA_ID,
  
  udpListenAddress: '0.0.0.0',
  udpPort: 5600,
  
  rtspUrl: '',
  rtspTransport: 'TCP',
  
  resolution: 'Auto',
  fps: 30,
  bitrate: 'Auto',
  
  lowLatencyMode: true,
  bufferSize: 'Low',
  
  recordingEnabled: false,
  autoRecord: false,
  recordWhenArmed: true,
  stopWhenDisarmed: true,
  format: 'MP4',
  maxStorageGb: 10,
  autoDelete: true,
};
