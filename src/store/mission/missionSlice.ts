import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  delay: number;
}

export interface MissionState {
  waypoints: Waypoint[];
  selectedWaypointId: string | null;
  syncStatus: 'UNSYNCED' | 'SYNCING' | 'SYNCED' | 'ERROR';
  syncProgress: number;
}

const initialState: MissionState = {
  waypoints: [],
  selectedWaypointId: null,
  syncStatus: 'UNSYNCED',
  syncProgress: 0,
};

export const missionSlice = createSlice({
  name: 'mission',
  initialState,
  reducers: {
    addWaypoint: (state, action: PayloadAction<{ lat: number; lng: number }>) => {
      const prev = state.waypoints[state.waypoints.length - 1];
      const newWaypoint: Waypoint = {
        id: uuidv4(),
        lat: action.payload.lat,
        lng: action.payload.lng,
        alt: prev ? prev.alt : 50,
        speed: prev ? prev.speed : 5,
        delay: 0,
      };
      state.waypoints.push(newWaypoint);
      state.selectedWaypointId = newWaypoint.id;
      state.syncStatus = 'UNSYNCED';
    },
    updateWaypoint: (state, action: PayloadAction<{ id: string; changes: Partial<Waypoint> }>) => {
      const idx = state.waypoints.findIndex(w => w.id === action.payload.id);
      if (idx !== -1) {
        state.waypoints[idx] = { ...state.waypoints[idx], ...action.payload.changes };
        state.syncStatus = 'UNSYNCED';
      }
    },
    deleteWaypoint: (state, action: PayloadAction<string>) => {
      state.waypoints = state.waypoints.filter(w => w.id !== action.payload);
      if (state.selectedWaypointId === action.payload) {
        state.selectedWaypointId = null;
      }
      state.syncStatus = 'UNSYNCED';
    },
    selectWaypoint: (state, action: PayloadAction<string | null>) => {
      state.selectedWaypointId = action.payload;
    },
    clearMission: (state) => {
      state.waypoints = [];
      state.selectedWaypointId = null;
      state.syncStatus = 'UNSYNCED';
    },
    setSyncStatus: (state, action: PayloadAction<'UNSYNCED' | 'SYNCING' | 'SYNCED' | 'ERROR'>) => {
      state.syncStatus = action.payload;
    },
    setSyncProgress: (state, action: PayloadAction<number>) => {
      state.syncProgress = action.payload;
    },
  },
});

export const { 
  addWaypoint, 
  updateWaypoint, 
  deleteWaypoint, 
  selectWaypoint, 
  clearMission,
  setSyncStatus,
  setSyncProgress
} = missionSlice.actions;

export const selectWaypoints = (state: RootState) => state.mission.waypoints;
export const selectSelectedWaypointId = (state: RootState) => state.mission.selectedWaypointId;
export const selectSelectedWaypoint = (state: RootState) => 
  state.mission.waypoints.find(w => w.id === state.mission.selectedWaypointId) || null;
export const selectSyncStatus = (state: RootState) => state.mission.syncStatus;
export const selectSyncProgress = (state: RootState) => state.mission.syncProgress;

import { missionService } from '../../services/mission/MissionService';

export const uploadMission = (): any => {
  return async (dispatch: any, getState: any) => {
    const state = getState();
    const waypoints = state.mission.waypoints;
    
    if (waypoints.length === 0) return;

    dispatch(setSyncStatus('SYNCING'));
    dispatch(setSyncProgress(0));

    const unsubscribe = missionService.onProgress((status, progress, error) => {
      if (status === 'UPLOADING' || status === 'VERIFYING') {
        dispatch(setSyncStatus('SYNCING'));
        dispatch(setSyncProgress(progress));
      } else if (status === 'SYNCED') {
        dispatch(setSyncStatus('SYNCED'));
        dispatch(setSyncProgress(100));
      } else if (status === 'FAILED') {
        dispatch(setSyncStatus('ERROR'));
      }
    });

    try {
      await missionService.uploadMission(waypoints);
    } finally {
      unsubscribe();
    }
  };
};

export default missionSlice.reducer;
