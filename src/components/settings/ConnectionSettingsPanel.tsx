import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { 
  selectConnectionConfig, 
  setConnectionType,
  setVehicleType,
  setAutopilotType,
  updateUdpSettings,
  updateTcpSettings,
  updateSerialSettings,
  updateBluetoothSettings
} from '../../store/settings/settingsSlice';
import { 
  selectConnectionStatus, 
  selectControlStatus,
  selectVideoStatus,
  selectActivePortInfo,
  selectVehicleName,
  selectLatencyMs,
  selectPacketsPerSec,
  selectBytesReceived,
  setActiveConnectionInfo 
} from '../../store/connection/connectionSlice';
import { controlConnectionService } from '../../services/connection/ControlConnectionService';
import { videoConnectionService } from '../../services/connection/VideoConnectionService';
import { selectVideoSettings } from '../../store/settings/settingsSlice';
import { ConnectionType, VehicleType, AutopilotType, NetworkPath } from '../../settings/types/connection';

export function ConnectionSettingsPanel() {
  const dispatch = useAppDispatch();
  const config = useAppSelector(selectConnectionConfig);
  const videoSettings = useAppSelector(selectVideoSettings);
  const status = useAppSelector(selectConnectionStatus);
  const controlStatus = useAppSelector(selectControlStatus);
  const videoStatus = useAppSelector(selectVideoStatus);
  const portInfo = useAppSelector(selectActivePortInfo);
  const vehicleName = useAppSelector(selectVehicleName);
  const latencyMs = useAppSelector(selectLatencyMs);
  const packetsPerSec = useAppSelector(selectPacketsPerSec);
  const bytesReceived = useAppSelector(selectBytesReceived);

  const isConnected = controlStatus === 'CONNECTED';
  const isConnecting = controlStatus === 'CONNECTING' || controlStatus === 'RECONNECTING';

  const connectionTabs: { id: ConnectionType; label: string; icon: string; desc: string }[] = [
    { id: 'WEBSOCKET', label: 'Wi-Fi / 4G (WebSocket)', icon: '📶', desc: 'MAVLink over WebSocket Bridge (:8088/ws)' },
    { id: 'MOCK', label: 'SITL MOCK', icon: '🎮', desc: 'Virtual flight dynamics & mock feed' },
    { id: 'TCP', label: 'TCP Client', icon: '🌐', desc: 'Direct TCP stream' },
    { id: 'USB_SERIAL', label: 'USB OTG', icon: '🔌', desc: 'Direct FTDI/UART Serial' },
    { id: 'BLUETOOTH', label: 'Bluetooth', icon: '📡', desc: 'Wireless serial bridge' },
  ];

  const networkModes: { id: NetworkPath; label: string; desc: string }[] = [
    { id: 'WIFI_DIRECT', label: 'Mode 1: Direct Wi-Fi LAN', desc: 'Direct to Raspberry Pi AP / Local Wi-Fi' },
    { id: 'CELLULAR_4G', label: 'Mode 2: 4G Fleet Cloud', desc: 'Via qcloudstation Server (45.117.171.237)' },
  ];

  const vehicleTypes: { id: VehicleType; label: string; icon: string }[] = [
    { id: 'COPTER', label: 'Multirotor (Copter)', icon: '🚁' },
    { id: 'PLANE', label: 'Fixed Wing (Plane)', icon: '✈️' },
    { id: 'VTOL', label: 'VTOL QuadPlane', icon: '🛩️' },
    { id: 'ROVER', label: 'UGV / Boat (Rover)', icon: '🚜' },
    { id: 'SUB', label: 'Underwater Sub', icon: '🤿' },
  ];

  const autopilots: { id: AutopilotType; label: string }[] = [
    { id: 'ARDUPILOT', label: 'ArduPilot' },
    { id: 'PX4', label: 'PX4 Pro' },
    { id: 'INAV', label: 'INAV / MSP' },
  ];

  const handleSelectNetworkMode = (mode: NetworkPath) => {
    if (mode === 'WIFI_DIRECT') {
      const host = config.udp.wifiHost || config.udp.remoteHost || '192.168.1.100';
      dispatch(updateUdpSettings({
        networkPath: mode,
        remoteHost: host,
        wifiHost: host,
        remotePort: config.udp.wifiPort || 14550,
      }));
    } else if (mode === 'CELLULAR_4G') {
      const host = config.udp.cloudHost || '45.117.171.237';
      dispatch(updateUdpSettings({
        networkPath: mode,
        remoteHost: host,
        cloudHost: host,
        remotePort: config.udp.cloudPort || 14550,
      }));
    }
  };

  const handleConnect = () => {
    let portString = 'WS: 8088';
    if (config.type === 'WEBSOCKET') {
      const endpoint = controlConnectionService.resolveTargetEndpoint(config);
      portString = `WS: ${endpoint.host}:8088/ws`;
    } else if (config.type === 'TCP') {
      portString = `TCP: ${config.tcp.host}:${config.tcp.port}`;
    } else if (config.type === 'USB_SERIAL') {
      portString = `USB: ${config.serial.baudRate} baud`;
    } else if (config.type === 'BLUETOOTH') {
      portString = `BLE: ${config.bluetooth.deviceName}`;
    } else if (config.type === 'MOCK') {
      portString = 'SITL VIRTUAL';
    }

    dispatch(setActiveConnectionInfo({ type: config.type, portInfo: portString }));
    controlConnectionService.connect(config);
    videoConnectionService.connect(videoSettings, config.type === 'MOCK');
  };

  const handleDisconnect = () => {
    controlConnectionService.disconnect();
    videoConnectionService.disconnect();
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      showsVerticalScrollIndicator={true}
    >
      <Text style={styles.title}>DRONE CONTROL & TELEMETRY</Text>

      {/* Real-time Status Card (Showing Separated Control & Video Links) */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={styles.statusGroup}>
            <Text style={styles.statusHeader}>CONTROL LINK (MAVLINK UDP)</Text>
            <View style={styles.statusBadge}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: isConnected ? '#22c55e' : isConnecting ? '#f59e0b' : '#ef4444' }
              ]} />
              <Text style={styles.statusText}>{controlStatus}</Text>
            </View>
          </View>

          <View style={styles.statusGroup}>
            <Text style={styles.statusHeader}>VIDEO STREAM (MEDIAMTX)</Text>
            <View style={styles.statusBadge}>
              <View style={[
                styles.statusDot, 
                { backgroundColor: videoStatus === 'STREAMING' ? '#22c55e' : videoStatus === 'CONNECTING' ? '#f59e0b' : '#64748b' }
              ]} />
              <Text style={styles.statusText}>{videoStatus}</Text>
            </View>
          </View>
        </View>

        <View style={styles.subInfoRow}>
          <Text style={styles.portInfo}>{portInfo}</Text>
          <Text style={styles.vehicleBadge}>{vehicleName}</Text>
        </View>

        <View style={styles.metricsRow}>
          <Text style={styles.metricText}>Latency: <Text style={styles.metricVal}>{latencyMs ?? '--'} ms</Text></Text>
          <Text style={styles.metricText}>Telemetry: <Text style={styles.metricVal}>{packetsPerSec} pkt/s</Text></Text>
          <Text style={styles.metricText}>Data RX: <Text style={styles.metricVal}>{(bytesReceived / 1024).toFixed(1)} KB</Text></Text>
        </View>
      </View>

      {/* Protocol Tabs */}
      <View style={styles.tabsContainer}>
        {connectionTabs.map((tab) => {
          const isActive = config.type === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => dispatch(setConnectionType(tab.id))}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Protocol Config Body */}
      {config.type === 'WEBSOCKET' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Network Topology Selection</Text>
          <View style={styles.modeGroup}>
            {networkModes.map((mode) => {
              const isModeActive = config.udp.networkPath === mode.id;
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[styles.modeCard, isModeActive && styles.modeCardActive]}
                  onPress={() => handleSelectNetworkMode(mode.id)}
                >
                  <Text style={[styles.modeTitle, isModeActive && styles.modeTitleActive]}>
                    {mode.label}
                  </Text>
                  <Text style={styles.modeDesc}>{mode.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.label}>
              {config.udp.networkPath === 'CELLULAR_4G' ? 'Fleet Cloud Server Host' : 'Raspberry Pi Wi-Fi IP'}
            </Text>
            <TextInput 
              style={styles.input}
              value={config.udp.remoteHost}
              onChangeText={(text) => {
                if (config.udp.networkPath === 'CELLULAR_4G') {
                  dispatch(updateUdpSettings({ remoteHost: text, cloudHost: text }));
                } else {
                  dispatch(updateUdpSettings({ remoteHost: text, wifiHost: text }));
                }
              }}
              placeholder={config.udp.networkPath === 'CELLULAR_4G' ? '45.117.171.237' : '192.168.1.100'}
              placeholderTextColor="#555"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputRow, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Target MAVLink Port</Text>
              <TextInput 
                style={styles.input}
                value={config.udp.remotePort.toString()}
                onChangeText={(text) => dispatch(updateUdpSettings({ remotePort: parseInt(text) || 14550 }))}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputRow, { flex: 1 }]}>
              <Text style={styles.label}>Local Listen Port</Text>
              <TextInput 
                style={styles.input}
                value={config.udp.localPort.toString()}
                onChangeText={(text) => dispatch(updateUdpSettings({ localPort: parseInt(text) || 14550 }))}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>
      )}

      {config.type === 'MOCK' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SITL Virtual Simulation Mode</Text>
          <Text style={styles.mockInfo}>
            Mô phỏng bay SITL hoàn chỉnh: Hỗ trợ kiểm thử Virtual Joystick, Arming, Chuyển chế độ bay, Lập kế hoạch bay Mission và Giả lập Video độc lập mà không cần drone vật lý.
          </Text>
        </View>
      )}

      {config.type === 'TCP' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TCP Client Parameters</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>TCP Server Host</Text>
            <TextInput 
              style={styles.input}
              value={config.tcp.host}
              onChangeText={(text) => dispatch(updateTcpSettings({ host: text }))}
              placeholder="192.168.1.100"
              placeholderTextColor="#555"
            />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.label}>TCP Port</Text>
            <TextInput 
              style={styles.input}
              value={config.tcp.port.toString()}
              onChangeText={(text) => dispatch(updateTcpSettings({ port: parseInt(text) || 5760 }))}
              keyboardType="numeric"
            />
          </View>
        </View>
      )}

      {config.type === 'USB_SERIAL' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>USB Serial Telemetry (Direct)</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Device Port Path</Text>
            <TextInput 
              style={styles.input}
              value={config.serial.port}
              onChangeText={(text) => dispatch(updateSerialSettings({ port: text }))}
              placeholder="COM_USB_1 or /dev/ttyUSB0"
              placeholderTextColor="#555"
            />
          </View>
        </View>
      )}

      {config.type === 'BLUETOOTH' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bluetooth Telemetry</Text>
          <View style={styles.inputRow}>
            <Text style={styles.label}>Device Name</Text>
            <TextInput 
              style={styles.input}
              value={config.bluetooth.deviceName}
              onChangeText={(text) => dispatch(updateBluetoothSettings({ deviceName: text }))}
              placeholder="HC-05-DRONE"
              placeholderTextColor="#555"
            />
          </View>
        </View>
      )}

      {/* Target Vehicle Profile */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Target Drone Type & Autopilot</Text>
        <View style={styles.vehicleGrid}>
          {vehicleTypes.map((v) => {
            const isActive = config.vehicleType === v.id;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleCard, isActive && styles.vehicleCardActive]}
                onPress={() => dispatch(setVehicleType(v.id))}
              >
                <Text style={styles.vehicleCardIcon}>{v.icon}</Text>
                <Text style={[styles.vehicleCardLabel, isActive && styles.vehicleCardLabelActive]}>{v.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.autopilotGrid}>
          {autopilots.map((a) => {
            const isActive = config.autopilot === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.autopilotCard, isActive && styles.autopilotCardActive]}
                onPress={() => dispatch(setAutopilotType(a.id))}
              >
                <Text style={[styles.autopilotCardLabel, isActive && styles.autopilotCardLabelActive]}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Connect / Disconnect Action Buttons */}
      <View style={styles.buttonRow}>
        {isConnected ? (
          <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
            <Text style={styles.actionButtonText}>🔴 DISCONNECT DRONE CONTROL</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={handleConnect}>
            <Text style={styles.actionButtonText}>
              {isConnecting ? '⏳ CONNECTING CONTROL...' : '🔌 CONNECT TO DRONE'}
            </Text>
          </TouchableOpacity>
        )}
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
    marginBottom: 10,
  },
  statusGroup: {
    flexDirection: 'column',
    gap: 4,
  },
  statusHeader: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  subInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  portInfo: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  vehicleBadge: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: 'bold',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  metricText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  metricVal: {
    color: '#fff',
    fontWeight: 'bold',
  },
  tabsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  tabBtn: {
    flex: 1,
    minWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tabBtnActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  tabIcon: {
    fontSize: 13,
  },
  tabLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tabLabelActive: {
    color: '#38bdf8',
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
  modeGroup: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 14,
  },
  modeCard: {
    backgroundColor: '#161d2b',
    borderWidth: 1,
    borderColor: '#333',
    padding: 10,
    borderRadius: 6,
  },
  modeCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  modeTitle: {
    color: '#94a3b8',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 2,
  },
  modeTitleActive: {
    color: '#38bdf8',
  },
  modeDesc: {
    color: '#64748b',
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
  },
  inputRow: {
    marginBottom: 12,
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
    fontVariant: ['tabular-nums'],
  },
  mockInfo: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  vehicleCard: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#161d2b',
    borderWidth: 1,
    borderColor: '#333',
    padding: 10,
    borderRadius: 6,
  },
  vehicleCardActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  vehicleCardIcon: {
    fontSize: 16,
  },
  vehicleCardLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  vehicleCardLabelActive: {
    color: '#38bdf8',
  },
  autopilotGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  autopilotCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#161d2b',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 8,
    borderRadius: 6,
  },
  autopilotCardActive: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  autopilotCardLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  autopilotCardLabelActive: {
    color: '#fbbf24',
  },
  buttonRow: {
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  disconnectButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.8,
  },
});
