import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectUpdateStatus,
  selectIsUpdateAvailable,
  selectIsUpdateReady,
  selectUpdateMetadata,
  selectUpdateSafety,
  selectUpdateError,
  selectLastCheckTime,
  clearError,
} from '../../store/update/updateSlice';
import { updateService } from '../../services/update/updateService';
import { selectIsArmed, selectDroneMode } from '../../store/drone/droneSlice';

export function SystemSettingsPanel() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectUpdateStatus);
  const isAvailable = useAppSelector(selectIsUpdateAvailable);
  const isReady = useAppSelector(selectIsUpdateReady);
  const metadata = useAppSelector(selectUpdateMetadata);
  const safety = useAppSelector(selectUpdateSafety);
  const error = useAppSelector(selectUpdateError);
  const lastCheck = useAppSelector(selectLastCheckTime);
  const isArmed = useAppSelector(selectIsArmed);
  const flightMode = useAppSelector(selectDroneMode);

  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    updateService.init();
  }, []);

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    dispatch(clearError());
    const result = await updateService.checkForUpdate();
    setIsChecking(false);

    if (result.isAvailable) {
      Alert.alert('Update Available', 'A new OTA update is ready for download.');
    } else if (!result.error && status === 'UP_TO_DATE') {
      Alert.alert('Up to Date', 'DroneGSC is currently running the latest version.');
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    const result = await updateService.fetchUpdate();
    setIsDownloading(false);
    if (result.isSuccess) {
      Alert.alert('Download Complete', 'The update has been cached locally. You can restart when safe.');
    }
  };

  const handleApplyUpdate = async () => {
    if (isArmed) {
      Alert.alert(
        'Flight Safety Interlock Active',
        'Cannot restart DroneGSC while the drone is ARMED. Disarm before applying updates.'
      );
      return;
    }

    Alert.alert(
      'Apply Update & Restart',
      'This will safely reload the application to apply the latest updates. Ensure the drone is parked and disarmed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart Now',
          style: 'destructive',
          onPress: async () => {
            const res = await updateService.applyUpdateSafely(true);
            if (!res.success) {
              Alert.alert('Update Blocked', res.error || 'Failed to apply update.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      showsVerticalScrollIndicator={true}
    >
      <Text style={styles.sectionHeader}>SYSTEM & OTA UPDATE MANAGEMENT</Text>

      {/* Flight Safety Interlock Banner */}
      <View style={[styles.safetyCard, isArmed ? styles.safetyCardAlert : styles.safetyCardSafe]}>
        <View style={styles.safetyHeader}>
          <Text style={styles.safetyIcon}>{isArmed ? '⚠️' : '🛡️'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.safetyTitle}>
              {isArmed ? 'FLIGHT SAFETY INTERLOCK ACTIVE' : 'SAFETY GUARD: SAFE FOR UPDATES'}
            </Text>
            <Text style={styles.safetySubtitle}>
              Flight Mode: <Text style={{ color: '#fff', fontWeight: 'bold' }}>{flightMode}</Text> | State:{' '}
              <Text style={{ color: isArmed ? '#f43f5e' : '#10b981', fontWeight: 'bold' }}>
                {isArmed ? 'ARMED' : 'DISARMED'}
              </Text>
            </Text>
          </View>
        </View>
        <Text style={styles.safetyMessage}>{safety.message}</Text>
      </View>

      {/* App & Runtime Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GCS RUNTIME & VERSION INFO</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Version (JS):</Text>
          <Text style={styles.infoValue}>{metadata.appVersion}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Native Runtime Version:</Text>
          <Text style={styles.infoValueHighlight}>{metadata.runtimeVersion || '1.0.0'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>EAS Update Channel:</Text>
          <Text style={styles.infoValue}>{metadata.channel || 'development'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Bundle Source:</Text>
          <Text style={styles.infoValue}>
            {metadata.isEmbeddedLaunch ? 'Embedded Binary Bundle' : 'Downloaded OTA Bundle'}
          </Text>
        </View>

        {metadata.updateId && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Active Update ID:</Text>
            <Text style={styles.infoValueCode}>{metadata.updateId.substring(0, 16)}...</Text>
          </View>
        )}

        {metadata.isEmergencyLaunch && (
          <View style={styles.emergencyBanner}>
            <Text style={styles.emergencyText}>
              Emergency Launch Fallback Active: {metadata.emergencyLaunchReason || 'Unknown failure'}
            </Text>
          </View>
        )}
      </View>

      {/* OTA Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>OVER-THE-AIR (OTA) UPDATES</Text>
        
        <Text style={styles.description}>
          OTA updates allow patching UI, telemetry visualizations, mission planner, and bug fixes without reinstalling the APK.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {lastCheck && (
          <Text style={styles.lastCheckText}>
            Last Checked: {new Date(lastCheck).toLocaleTimeString()}
          </Text>
        )}

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.actionBtn, isChecking && styles.actionBtnDisabled]}
            onPress={handleCheckUpdate}
            disabled={isChecking}
          >
            {isChecking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>🔍 Check for Updates</Text>
            )}
          </TouchableOpacity>

          {isAvailable && !isReady && (
            <TouchableOpacity
              style={[styles.downloadBtn, isDownloading && styles.actionBtnDisabled]}
              onPress={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.actionBtnText}>⬇️ Download Update</Text>
              )}
            </TouchableOpacity>
          )}

          {isReady && (
            <TouchableOpacity
              style={[styles.restartBtn, isArmed && styles.restartBtnDisabled]}
              onPress={handleApplyUpdate}
              disabled={isArmed}
            >
              <Text style={styles.actionBtnText}>
                {isArmed ? '⛔ Cannot Restart (ARMED)' : '🔄 Install & Safe Restart'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
    padding: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: '#00aaff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  safetyCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  safetyCardSafe: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10b981',
  },
  safetyCardAlert: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: '#f43f5e',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  safetyIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  safetyTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  safetySubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  safetyMessage: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 6,
  },
  description: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  infoValueHighlight: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  infoValueCode: {
    color: '#a78bfa',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  emergencyBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    padding: 10,
    borderRadius: 6,
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  emergencyText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    borderRadius: 6,
    borderColor: '#ef4444',
    borderWidth: 1,
    marginBottom: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
  },
  lastCheckText: {
    color: '#666',
    fontSize: 11,
    marginBottom: 12,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    backgroundColor: '#1f2937',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  downloadBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartBtn: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartBtnDisabled: {
    backgroundColor: '#374151',
    opacity: 0.6,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
