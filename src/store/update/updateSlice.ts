import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import { UpdateStatus, SafetyBlockReason, UpdateMetadata } from '../../services/update/updateTypes';

export interface UpdateState {
  status: UpdateStatus;
  updateAvailable: boolean;
  updateReady: boolean;
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string | null;
  appVersion: string;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
  lastCheckTime: number | null;
  error: string | null;
  safetyLocked: boolean;
  safetyReason: SafetyBlockReason;
  safetyMessage: string;
}

const initialState: UpdateState = {
  status: 'IDLE',
  updateAvailable: false,
  updateReady: false,
  updateId: null,
  channel: null,
  runtimeVersion: '1.0.0',
  appVersion: '1.0.0',
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  lastCheckTime: null,
  error: null,
  safetyLocked: false,
  safetyReason: 'SAFE_CONFIRMED',
  safetyMessage: 'Vehicle is in safe idle state.',
};

export const updateSlice = createSlice({
  name: 'update',
  initialState,
  reducers: {
    setStatus: (state, action: PayloadAction<UpdateStatus>) => {
      state.status = action.payload;
    },
    setUpdateAvailable: (state, action: PayloadAction<boolean>) => {
      state.updateAvailable = action.payload;
    },
    setUpdateReady: (state, action: PayloadAction<boolean>) => {
      state.updateReady = action.payload;
    },
    setUpdateMetadata: (state, action: PayloadAction<Partial<UpdateMetadata>>) => {
      if (action.payload.appVersion !== undefined) state.appVersion = action.payload.appVersion;
      if (action.payload.runtimeVersion !== undefined) state.runtimeVersion = action.payload.runtimeVersion;
      if (action.payload.channel !== undefined) state.channel = action.payload.channel;
      if (action.payload.updateId !== undefined) state.updateId = action.payload.updateId;
      if (action.payload.isEmbeddedLaunch !== undefined) state.isEmbeddedLaunch = action.payload.isEmbeddedLaunch;
      if (action.payload.isEmergencyLaunch !== undefined) state.isEmergencyLaunch = action.payload.isEmergencyLaunch;
      if (action.payload.emergencyLaunchReason !== undefined) state.emergencyLaunchReason = action.payload.emergencyLaunchReason;
    },
    setSafetyState: (state, action: PayloadAction<{ isSafe: boolean; reason: SafetyBlockReason; message: string }>) => {
      state.safetyLocked = !action.payload.isSafe;
      state.safetyReason = action.payload.reason;
      state.safetyMessage = action.payload.message;
    },
    setLastCheckTime: (state, action: PayloadAction<number>) => {
      state.lastCheckTime = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      if (action.payload) {
        state.status = 'ERROR';
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setStatus,
  setUpdateAvailable,
  setUpdateReady,
  setUpdateMetadata,
  setSafetyState,
  setLastCheckTime,
  setError,
  clearError,
} = updateSlice.actions;

export const selectUpdateStatus = (state: RootState) => state.update.status;
export const selectIsUpdateAvailable = (state: RootState) => state.update.updateAvailable;
export const selectIsUpdateReady = (state: RootState) => state.update.updateReady;
export const selectUpdateMetadata = (state: RootState) => ({
  appVersion: state.update.appVersion,
  runtimeVersion: state.update.runtimeVersion,
  channel: state.update.channel,
  updateId: state.update.updateId,
  isEmbeddedLaunch: state.update.isEmbeddedLaunch,
  isEmergencyLaunch: state.update.isEmergencyLaunch,
  emergencyLaunchReason: state.update.emergencyLaunchReason,
});
export const selectUpdateSafety = (state: RootState) => ({
  isLocked: state.update.safetyLocked,
  reason: state.update.safetyReason,
  message: state.update.safetyMessage,
});
export const selectLastCheckTime = (state: RootState) => state.update.lastCheckTime;
export const selectUpdateError = (state: RootState) => state.update.error;

export default updateSlice.reducer;
