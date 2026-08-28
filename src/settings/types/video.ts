export type VideoSource = 
  | 'MediaMTX HLS' 
  | 'MediaMTX RTSP' 
  | 'MediaMTX WebRTC' 
  | 'Disabled' 
  | 'MPEG-TS' 
  | 'RTSP' 
  | 'UDP H.264';
export type VideoResolution = 'Auto' | '720p' | '1080p';
export type VideoFps = 15 | 24 | 30 | 60;
export type VideoBitrate = 'Auto' | 'Low' | 'Medium' | 'High' | 'Custom';
export type VideoBuffer = 'Low' | 'Medium' | 'High';
export type VideoFormat = 'MP4' | 'MKV';
export type RtspTransport = 'UDP' | 'TCP';
export type CameraId = 'cam0' | 'cam1';

export interface VideoSettings {
  source: VideoSource;
  
  // MediaMTX / UAVLink-Edge Video Pipeline
  mediamtxHost: string;
  mediamtxRtspPort: number;
  mediamtxHlsPort: number;
  mediamtxWebrtcPort: number;
  droneUuid: string;
  cameraId: CameraId;
  
  // UDP config
  udpListenAddress: string;
  udpPort: number;
  
  // RTSP config
  rtspUrl: string;
  rtspUsername?: string;
  rtspPassword?: string;
  rtspTransport: RtspTransport;
  
  // Quality
  resolution: VideoResolution;
  fps: VideoFps;
  bitrate: VideoBitrate;
  customBitrateKbps?: number;
  
  // Latency
  lowLatencyMode: boolean;
  bufferSize: VideoBuffer;
  
  // Recording
  recordingEnabled: boolean;
  autoRecord: boolean;
  recordWhenArmed: boolean;
  stopWhenDisarmed: boolean;
  format: VideoFormat;
  maxStorageGb: number;
  autoDelete: boolean;
}
