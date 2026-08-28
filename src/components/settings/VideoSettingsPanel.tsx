import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectVideoSettings, updateVideoSettings } from '../../store/settings/settingsSlice';
import { selectVideoStatus } from '../../store/connection/connectionSlice';
import { CameraId } from '../../settings/types/video';

export function VideoSettingsPanel() {
  const dispatch = useAppDispatch();
  const video = useAppSelector(selectVideoSettings);
  const videoStatus = useAppSelector(selectVideoStatus);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const isStreaming = videoStatus === 'STREAMING';
  const isConnecting = videoStatus === 'CONNECTING' || videoStatus === 'RECONNECTING';

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      showsVerticalScrollIndicator={true}
    >
      <Text style={styles.title}>LIVE VIDEO STREAMING</Text>

      {/* Real-time Video Stream Status Card */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>MEDIA STREAM STATUS</Text>
          <View style={styles.statusBadge}>
            <View style={[
              styles.statusDot, 
              { backgroundColor: isStreaming ? '#22c55e' : isConnecting ? '#f59e0b' : '#64748b' }
            ]} />
            <Text style={styles.statusText}>{videoStatus}</Text>
          </View>
        </View>
        <Text style={styles.infoText}>
          Video Media stream is completely decoupled from Flight Control & Telemetry. Video disconnect never affects flight safety.
        </Text>
      </View>

      {/* Video Source Selection (Aligned with Protocol Priority) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Video Protocol & Transport Priority</Text>
        
        <View style={styles.inputRow}>
          <Text style={styles.label}>Media Source Mode</Text>
          <View style={styles.buttonGroup}>
            {[
              { id: 'MediaMTX WebRTC', label: '1. WebRTC / WHEP (PRIMARY - Ultra Low Latency)' },
              { id: 'MediaMTX RTSP', label: '2. RTSP Stream (SECONDARY - Direct Stream)' },
              { id: 'MediaMTX HLS', label: '3. HLS Stream (FALLBACK - High Latency)' },
              { id: 'MPEG-TS', label: 'FPV Demo Stream' },
              { id: 'Disabled', label: 'Disabled (HUD Horizon)' },
            ].map((src) => (
              <TouchableOpacity
                key={src.id}
                style={[styles.groupButton, video.source === src.id && styles.groupButtonActive]}
                onPress={() => dispatch(updateVideoSettings({ source: src.id as any }))}
              >
                <Text numberOfLines={1} style={[styles.groupButtonText, video.source === src.id && styles.groupButtonTextActive]}>
                  {src.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* MediaMTX Configuration */}
        {(video.source === 'MediaMTX WebRTC' || video.source === 'MediaMTX RTSP' || video.source === 'MediaMTX HLS') && (
          <>
            <View style={styles.inputRow}>
              <Text style={styles.label}>MediaMTX Server Host (Raspberry Pi / Cloud IP)</Text>
              <TextInput 
                style={styles.input}
                value={video.mediamtxHost}
                onChangeText={(text) => dispatch(updateVideoSettings({ mediamtxHost: text }))}
                placeholder="192.168.1.100 or 45.117.171.237"
                placeholderTextColor="#555"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputRow, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>WebRTC (WHEP) Port</Text>
                <TextInput 
                  style={styles.input}
                  value={video.mediamtxWebrtcPort.toString()}
                  onChangeText={(text) => dispatch(updateVideoSettings({ mediamtxWebrtcPort: parseInt(text) || 8889 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputRow, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>RTSP Port</Text>
                <TextInput 
                  style={styles.input}
                  value={video.mediamtxRtspPort.toString()}
                  onChangeText={(text) => dispatch(updateVideoSettings({ mediamtxRtspPort: parseInt(text) || 8554 }))}
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.inputRow, { flex: 1 }]}>
                <Text style={styles.label}>HLS Port</Text>
                <TextInput 
                  style={styles.input}
                  value={video.mediamtxHlsPort.toString()}
                  onChangeText={(text) => dispatch(updateVideoSettings({ mediamtxHlsPort: parseInt(text) || 8888 }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputRow, { flex: 2, marginRight: 10 }]}>
                <Text style={styles.label}>Drone UUID</Text>
                <TextInput 
                  style={styles.input}
                  value={video.droneUuid}
                  onChangeText={(text) => dispatch(updateVideoSettings({ droneUuid: text }))}
                  placeholder="00000011-0000-0000-0000-000000000011"
                  placeholderTextColor="#555"
                />
              </View>
              <View style={[styles.inputRow, { flex: 1 }]}>
                <Text style={styles.label}>Camera Stream</Text>
                <View style={styles.cameraButtonGroup}>
                  {(['cam0', 'cam1'] as CameraId[]).map((cam) => (
                    <TouchableOpacity
                      key={cam}
                      style={[styles.camBtn, video.cameraId === cam && styles.camBtnActive]}
                      onPress={() => dispatch(updateVideoSettings({ cameraId: cam }))}
                    >
                      <Text style={[styles.camBtnText, video.cameraId === cam && styles.camBtnTextActive]}>
                        {cam.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}

        {video.source === 'MPEG-TS' && (
          <View style={styles.card}>
            <Text style={styles.infoText}>
              🎥 Chế độ FPV Demo Stream: Tự động phát luồng video FPV máy bay Full HD để kiểm tra khả năng hiển thị đồng hồ đo HUD trên nền video thời gian thực.
            </Text>
          </View>
        )}
      </View>

      {/* Latency & Quality */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latency & Low-Latency Options</Text>
        
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Low Latency Mode</Text>
            <Text style={styles.switchDesc}>Minimizes buffer size for real-time drone piloting</Text>
          </View>
          <Switch 
            value={video.lowLatencyMode}
            onValueChange={(val) => { dispatch(updateVideoSettings({ lowLatencyMode: val })); }}
            trackColor={{ false: '#333', true: '#0284c7' }}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputRow, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Resolution</Text>
            <View style={styles.buttonGroup}>
              {['Auto', '720p', '1080p'].map((res) => (
                <TouchableOpacity
                  key={res}
                  style={[styles.groupButton, video.resolution === res && styles.groupButtonActive]}
                  onPress={() => dispatch(updateVideoSettings({ resolution: res as any }))}
                >
                  <Text style={[styles.groupButtonText, video.resolution === res && styles.groupButtonTextActive]}>
                    {res}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>
            {saved ? '✓ VIDEO SETTINGS SAVED' : 'SAVE VIDEO SETTINGS'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 1,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#0c121e',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginBottom: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  infoText: {
    color: '#64748b',
    fontSize: 12,
  },
  section: {
    backgroundColor: '#0c121e',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#38bdf8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
  },
  inputRow: {
    marginBottom: 14,
  },
  label: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#161d2b',
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    padding: 10,
    borderRadius: 6,
    fontSize: 13,
  },
  buttonGroup: {
    flexDirection: 'column',
    gap: 6,
  },
  groupButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#161d2b',
    borderWidth: 1,
    borderColor: '#333',
  },
  groupButtonActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  groupButtonText: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  groupButtonTextActive: {
    color: '#fff',
  },
  cameraButtonGroup: {
    flexDirection: 'row',
    height: 40,
    backgroundColor: '#161d2b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  camBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBtnActive: {
    backgroundColor: '#0284c7',
  },
  camBtnText: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  camBtnTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161d2b',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
  },
  switchLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  switchDesc: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
