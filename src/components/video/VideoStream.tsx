import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectVideoSettings } from '../../store/settings/settingsSlice';
import { selectVideoStatus, setVideoStatus, setVideoError } from '../../store/connection/connectionSlice';
import { videoConnectionService } from '../../services/connection/VideoConnectionService';

export function VideoStream() {
  const dispatch = useAppDispatch();
  const videoSettings = useAppSelector(selectVideoSettings);
  const videoStatus = useAppSelector(selectVideoStatus);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Dynamic stream URL resolved by VideoConnectionService (MediaMTX HLS / RTSP / WebRTC)
  const videoSource = useMemo(() => {
    return videoConnectionService.resolveStreamUrl(videoSettings);
  }, [videoSettings]);

  const player = useVideoPlayer(videoSource || '', (p) => {
    if (!videoSource) return;
    p.loop = true;
    p.muted = true;
    try {
      p.play();
    } catch (e: any) {
      setLocalError(e.message || 'Playback initialization error');
      videoConnectionService.notifyStreamError(e.message || 'Playback error');
    }
  });

  const prevSourceRef = React.useRef<string | null>(videoSource);

  useEffect(() => {
    if (!player || !videoSource) return;
    if (prevSourceRef.current !== videoSource) {
      prevSourceRef.current = videoSource;
      try {
        player.replace(videoSource);
        player.play();
      } catch (e: any) {
        setLocalError(e.message || 'Playback replace error');
      }
    }
  }, [player, videoSource]);

  useEffect(() => {
    if (!player) return;

    const subPlaying = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
      if (event.isPlaying) {
        setLocalError(null);
        videoConnectionService.notifyStreamPlaying();
        dispatch(setVideoStatus('STREAMING'));
        dispatch(setVideoError(null));
      } else {
        videoConnectionService.notifyStreamStopped();
      }
    });

    const subStatus = player.addListener('statusChange', (event) => {
      if (event.status === 'error') {
        const msg = event.error?.message || 'Media stream unreachable';
        setLocalError(msg);
        videoConnectionService.notifyStreamError(msg);
        dispatch(setVideoStatus('ERROR'));
        dispatch(setVideoError(msg));
      }
    });

    return () => {
      subPlaying.remove();
      subStatus.remove();
    };
  }, [player, dispatch]);

  if (videoSettings.source === 'Disabled' || !videoSource) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <VideoView
        style={styles.video}
        player={player}
        nativeControls={false}
        contentFit="cover"
      />
      {/* Non-intrusive stream status indicator (Decoupled from Drone Control) */}
      {!isPlaying && (
        <View style={styles.connectingPill}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: localError ? '#ef4444' : '#f59e0b' }
          ]} />
          <Text numberOfLines={1} style={styles.connectingText}>
            {localError 
              ? `VIDEO: ${videoSettings.source} (${localError})`
              : `CONNECTING VIDEO (${videoSettings.source})...`
            }
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  connectingPill: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectingText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
