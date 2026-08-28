import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { useAppSelector } from '../../store/hooks';
import {
  selectIsUpdateReady,
  selectUpdateMetadata,
  selectUpdateSafety,
} from '../../store/update/updateSlice';
import { updateService } from '../../services/update/updateService';
import { selectIsArmed, selectDroneMode } from '../../store/drone/droneSlice';

interface UpdateNotificationModalProps {
  visible: boolean;
  onClose: () => void;
}

export function UpdateNotificationModal({ visible, onClose }: UpdateNotificationModalProps) {
  const isReady = useAppSelector(selectIsUpdateReady);
  const metadata = useAppSelector(selectUpdateMetadata);
  const safety = useAppSelector(selectUpdateSafety);
  const isArmed = useAppSelector(selectIsArmed);
  const flightMode = useAppSelector(selectDroneMode);

  if (!visible || !isReady) return null;

  const handleRestart = async () => {
    if (isArmed) return;
    onClose();
    await updateService.applyUpdateSafely(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.icon}>🚀</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>New OTA Update Available</Text>
              <Text style={styles.subtitle}>Runtime: {metadata.runtimeVersion || '1.0.0'}</Text>
            </View>
          </View>

          {/* Body */}
          <Text style={styles.bodyText}>
            A new update containing UI improvements and bug fixes has been downloaded in the background.
          </Text>

          {/* Safety Status */}
          <View style={[styles.safetyBox, isArmed ? styles.safetyBoxAlert : styles.safetyBoxSafe]}>
            <Text style={[styles.safetyText, isArmed ? styles.safetyTextAlert : styles.safetyTextSafe]}>
              {isArmed
                ? `⛔ Flight Interlock: Drone is ARMED (${flightMode}). Restart disabled.`
                : `🛡️ Flight Guard: DISARMED (${flightMode}). Safe to restart.`}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissBtnText}>Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.applyBtn, isArmed && styles.applyBtnDisabled]}
              onPress={handleRestart}
              disabled={isArmed}
            >
              <Text style={styles.applyBtnText}>
                {isArmed ? 'Locked (Armed)' : 'Restart & Update'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '90%',
    maxWidth: 440,
    backgroundColor: '#12161f',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
    marginRight: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#38bdf8',
    fontSize: 12,
    marginTop: 2,
  },
  bodyText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  safetyBox: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 16,
  },
  safetyBoxSafe: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10b981',
  },
  safetyBoxAlert: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    borderColor: '#f43f5e',
  },
  safetyText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  safetyTextSafe: {
    color: '#10b981',
  },
  safetyTextAlert: {
    color: '#f43f5e',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dismissBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#1e293b',
  },
  dismissBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  applyBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#0284c7',
  },
  applyBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  applyBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
