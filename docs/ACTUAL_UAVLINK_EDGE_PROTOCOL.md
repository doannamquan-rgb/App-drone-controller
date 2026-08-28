# ACTUAL UAVLINK-EDGE PROTOCOL & ARCHITECTURE SPECIFICATION

**Document Version:** 2.2.0  
**Source of Truth:** [`UAVLink-Edge` Repository](https://github.com/CosShin/UAVLink-Edge)  
**Consumer:** `DroneGSC MobileApp` (Android / iOS Ground Control Station)  
**Date:** 2026-08-25

---

## 1. System Overview & Network Topology

UAVLink-Edge is the companion computer software stack running on Raspberry Pi 5 / CM5. It acts as an intelligent MAVLink telemetry router, mission forwarder, authentication agent, and multi-stream camera publisher between the **Pixhawk Flight Controller** and Ground Control Stations (GCS) or Fleet Servers (**qcloudstation**).

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 CONTROL TOPOLOGY                                 │
└──────────────────────────────────────────────────────────────────────────────────┘

       [ MODE 1: DIRECT WI-FI LAN ]                    [ MODE 2: 4G FLEET CLOUD ]
   (Short-range Field Operations / AP)            (Long-range BVLOS / Cellular Ops)

      📱 DroneGSC MobileApp                          📱 DroneGSC MobileApp
               │                                              │
         MAVLink UDP                                    MAVLink UDP
        (Port 14550)                                   (Port 14550)
               │                                              │
               ▼                                              ▼
    🍓 Raspberry Pi (CM5)                         🌐 qcloudstation Server
      [ Configurable Host IP ]                      [ 45.117.171.237 ]
               │                                              ▲
               │                                              │ MAVLink UDP Uplink/Downlink
               │                                              │ (Port 14550)
               │                                              │
               │                                     🍓 Raspberry Pi (CM5)
               │                                        (via 4G LTE Modem)
               │                                              │
               └──────────────────────┬───────────────────────┘
                                      │
                         MAVLink v2 (921600 baud UART)
                         or Ethernet (10.41.10.10 ↔ 10.41.10.2)
                                      │
                                      ▼
                           🎮 Pixhawk / ArduPilot
```

### DroneGSC Topology Support:
DroneGSC MobileApp **MUST SUPPORT BOTH**:
1. **Direct Wi-Fi Mode (Mode 1)**: Target Host = Configurable Pi IP (empty default / user enters `192.168.x.x` or `10.42.0.1`), Port = `14550`.
2. **4G Cloud Mode (Mode 2)**: Target Host = Fleet Server IP (`45.117.171.237`), Port = `14550`.

---

## 2. Port & Endpoint Verification Matrix

| Component | Host / Interface | Port / Protocol | Direction | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Pixhawk $\leftrightarrow$ Pi (Serial)** | `/dev/ttyAMA0` (or `ttyAMA2`) | `921600` baud UART | Bi-directional | Primary MAVLink connection (`MAVLINK_PATH_SERIAL`) |
| **Pixhawk $\leftrightarrow$ Pi (Ethernet)** | `10.41.10.10` $\leftrightarrow$ `10.41.10.2` | UDP `14550` / `14540` | Bi-directional | Ethernet link with 1 Hz partner heartbeat |
| **Pi $\rightarrow$ Server (MAVLink Uplink)** | `45.117.171.237` | UDP `14550` | Pi $\rightarrow$ Server | Forwarded telemetry (~70 msg/s) & Pixhawk heartbeat |
| **Server $\rightarrow$ Pi (MAVLink Downlink)** | `45.117.171.237` | UDP `14550` | Server $\rightarrow$ Pi | Control commands (`DO_SET_MODE`, `MISSION_START`, joystick) |
| **Mobile $\leftrightarrow$ GCS Endpoint** | Pi IP or Server IP | UDP `14550` | Bi-directional | DroneGSC Control & Telemetry link |
| **Pi Camera $\rightarrow$ MediaMTX** | `127.0.0.1` or Server | RTSP `8554` (TCP) | Pi $\rightarrow$ MediaMTX | H.264 camera ingest (`/<uuid>/cam0`, GOP=15) |
| **MediaMTX WebRTC (WHEP)** | Pi IP or Server IP | HTTP/TCP `8889` + UDP `8189` | MediaMTX $\rightarrow$ Mobile | **PRIMARY** Video Stream (`/<uuid>/cam0/whep`) |
| **MediaMTX RTSP** | Pi IP or Server IP | RTSP/TCP `8554` | MediaMTX $\rightarrow$ Mobile | **SECONDARY** Video Stream (`/<uuid>/cam0`) |
| **MediaMTX HLS** | Pi IP or Server IP | HTTP/TCP `8888` | MediaMTX $\rightarrow$ Mobile | **FALLBACK** Video Stream (`/<uuid>/cam0/index.m3u8`) |
| **Pi $\leftrightarrow$ Server Auth** | `45.117.171.237` | TCP `5770` | Bi-directional | HMAC-SHA256 authentication & token handshake |
| **Pi Web Server** | Pi IP | HTTP `8080` | Bi-directional | Web management, camera config, `/api/status` |
| **WireGuard VPN** | `45.117.171.237` | UDP `51820` | Pi $\leftrightarrow$ Server | Fleet VPN tunnel (`uavlink0` on `10.8.0.x`) |

---

## 3. Control & Telemetry Protocols

### A. Telemetry Processing & UI Throttling Architecture
MAVLink telemetry internal processing and UI rendering are decoupled into field-specific tiers:
* **Attitude & Flight HUD Dynamics (High-frequency):** ~20 Hz (50ms interval) for smooth artificial horizon rendering.
* **GPS Position, Speed & Velocity:** ~5 Hz (200ms interval) for responsive map and compass navigation.
* **Battery, Sensors & Traffic Diagnostics:** ~1 Hz (1000ms interval) to maximize CPU efficiency and battery life.
* **Video Playback:** Independent hardware-decoded frame rate (e.g. 30 FPS via native decoder).

### B. Real-time Joystick Control
* **Primary Message:** `MANUAL_CONTROL` (#69) — normalized values $x, y, z, r \in [-1000, 1000]$ and $z \in [0, 1000]$. Standard MAVLink control command.
* **Fallback / Legacy Message:** `RC_CHANNELS_OVERRIDE` (#70) — PWM microsecond values $1000 - 2000 \ \mu\text{s}$ ($1500 \ \mu\text{s}$ center). Used when vehicle firmware requires raw RC channel mapping.
* **Selection Rule:** `MANUAL_CONTROL` is selected by default; if vehicle config / firmware requires raw RC override, `RC_CHANNELS_OVERRIDE` is dispatched.
* **Control Loop:** Continuous **10–20 Hz** loop.
* **Neutral Safety:** When sticks are released or centered, the loop continuously outputs neutral safe frames:
  $$\text{roll} = 0,\quad \text{pitch} = 0,\quad \text{yaw} = 0,\quad \text{throttle} = 0.5$$
* **Timeout Protection:** If touch events cease for $> 500\text{ ms}$ (`JOYSTICK_TIMEOUT_MS`), input is automatically neutralized.
* **Strict Rule:** REST API is **NEVER** used for joystick control.

### C. Flight Commands & Normalization
* **ARM / DISARM**: `MAV_CMD_COMPONENT_ARM_DISARM` (400), param1 = 1 (Arm) / 0 (Disarm).
* **SET MODE**: `MAV_CMD_DO_SET_MODE` (176).
  * `forwarder.py` requires `param1 = 1` (`MAV_MODE_FLAG_CUSTOM_MODE_ENABLED`) and `param2 = custom_mode` (e.g. `LOITER = 5`, `AUTO = 3`, `RTL = 6`, `LAND = 9`, `STABILIZE = 0`).
* **TAKEOFF**: `MAV_CMD_NAV_TAKEOFF` (22), param7 = target altitude in meters.
* **LAND**: `MAV_CMD_NAV_LAND` (21).
* **RTL**: `MAV_CMD_NAV_RETURN_TO_LAUNCH` (20).

---

## 4. MAVLink Mission Protocol (Exact Handshake)

```text
  DroneGSC (Mobile)                                    Pixhawk / UAVLink-Edge
         │                                                       │
         │───────────── 1. MISSION_CLEAR_ALL ───────────────────►│ (Clears active mission)
         │                                                       │
         │───────────── 2. MISSION_COUNT (count=N) ─────────────►│
         │                                                       │
         │◄──────────── 3. MISSION_REQUEST_INT (seq=0) ──────────│ (Vehicle requests item 0)
         │                                                       │
         │───────────── 4. MISSION_ITEM_INT (seq=0) ────────────►│ (Takeoff waypoint)
         │                                                       │
         │◄──────────── 5. MISSION_REQUEST_INT (seq=1) ──────────│ (Vehicle requests item 1)
         │                                                       │
         │───────────── 6. MISSION_ITEM_INT (seq=1) ────────────►│
         │                                                       │
         │                          ...                          │
         │                                                       │
         │◄──────────── 7. MISSION_REQUEST_INT (seq=N-1) ────────│ (Vehicle requests last item)
         │                                                       │
         │───────────── 8. MISSION_ITEM_INT (seq=N-1) ──────────►│
         │                                                       │
         │◄──────────── 9. MISSION_ACK (type=0 ACCEPTED) ────────│ (Mission sync verified!)
         ▼                                                       ▼
```

### Edge Autopilot Mode Interlock on `MISSION_START`:
In `forwarder.py` (lines 648–657), when `MAV_CMD_MISSION_START` (300) is received:
1. If vehicle has 0 mission items, the command is **rejected locally**.
2. If vehicle is not in `AUTO` mode, edge queues CMD 300, issues `MAV_CMD_DO_SET_MODE` to `AUTO`, waits for heartbeat confirmation (up to `AUTO_MODE_CONFIRM_TIMEOUT_MS = 8000ms`), and then sends CMD 300 to Pixhawk.

---

## 5. Video Stream Architecture & Protocol Priority

UAVLink-Edge publishes camera streams using MediaMTX.

```text
  Camera Sensor (CSI/USB) ──► H.264 Encoder (GOP=15, zerolatency) ──► MediaMTX
                                                                      │
     ┌────────────────────────────────────────────────────────────────┤
     │                                │                               │
     ▼                                ▼                               ▼
1. WebRTC / WHEP (:8889)       2. RTSP (:8554)                 3. HLS (:8888)
   (PRIMARY - Ultra Low Latency)  (SECONDARY - Direct Stream)     (FALLBACK - High Latency)
   Delay: 100-250ms               Delay: 300-600ms                Delay: 1.5-3.0s
```

### Native Playback Realities:
* **WebRTC/WHEP (`:8889`):** Requires WebRTC signaling client (`RTCPeerConnection` with HTTP POST signaling to `/whep` and UDP media on port `8189`). Standard video player libraries cannot decode WHEP as raw video files.
* **RTSP (`:8554`):** Supported on Android via ExoPlayer `RtspMediaSource`.
* **HLS (`:8888`):** Universal native playback supported on all Android & iOS devices via `expo-video`.

---

## 6. Centralized Protocol Constants

```typescript
export const PROTOCOL_CONSTANTS = {
  MAVLINK_DEFAULT_PORT: 14550,
  PI_LOCAL_LISTEN_PORT: 14540,
  PI_WEB_ADMIN_PORT: 8080,
  FLEET_SERVER_AUTH_PORT: 5770,

  MEDIAMTX_RTSP_PORT: 8554,
  MEDIAMTX_HLS_PORT: 8888,
  MEDIAMTX_WEBRTC_PORT: 8889,
  MEDIAMTX_ICE_UDP_PORT: 8189,

  HEARTBEAT_TIMEOUT_MS: 3000,
  JOYSTICK_TIMEOUT_MS: 500,
  JOYSTICK_UPDATE_RATE_HZ: 20,
  MISSION_RETRY_COUNT: 3,
  AUTO_MODE_CONFIRM_TIMEOUT_MS: 8000,

  THROTTLE_ATTITUDE_MS: 50,
  THROTTLE_GPS_VELOCITY_MS: 200,
  THROTTLE_BATTERY_STATS_MS: 1000,

  FLEET_SERVER_HOST: '45.117.171.237',
  FLEET_DRONE_UUID: '00000011-0000-0000-0000-000000000011',
};
```
