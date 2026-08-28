# DroneGSC & UAVLink-Edge Connection & Video Architecture

## 1. Existing UAVLink-Edge Architecture

**UAVLink-Edge** is the onboard companion software stack running on a Raspberry Pi 5 (or CM5) connected to a Pixhawk / ArduPilot / PX4 flight controller and hardware cameras.

```text
                                 Raspberry Pi 5 (UAVLink-Edge)
                                ┌─────────────────────────────────────────────────────────────┐
                                │                                                             │
                                │  ┌───────────────────────────────────────────────────────┐  │
                                │  │                     Forwarder                         │  │
                                │  │   - MAVLink Router (Serial /dev/ttyAMA* @ 921600)    │  │
                                │  │   - Ethernet (10.41.10.10 <-> 10.41.10.2:14550)       │  │
                                │  │   - UDP Downlink / Uplink (:14550 / :14540)           │  │
                                │  │   - Session Refresh / Heartbeat Keepalive             │  │
                                │  └─────────────────────────▲─────────────────────────────┘  │
                                │                            │ (MAVLink Telemetry & Control)  │
┌──────────────┐                │                            ▼                                │
│   Pixhawk    │◄── UART/ETH ───┤                    Telemetry Service                        │
│ (ArduPilot/  │  (MAVLink v2)  │             (Cache: GPS, Mode, Batt, Alt)                   │
│     PX4)     │                │                            │                                │
└──────────────┘                │  ┌─────────────────────────▼─────────────────────────────┐  │
                                │  │                      Web API                          │  │
                                │  │             HTTP/REST Bridge (:8080)                  │  │
                                │  │   /api/telemetry, /api/status, /api/camera, /api/params│ │
                                │  └───────────────────────────────────────────────────────┘  │
                                │                                                             │
                                │  ┌───────────────────────────────────────────────────────┐  │
                                │  │            Camera Pipeline (Independent)              │  │
                                │  │   - CSI (Picamera2 / libcamera) / USB V4L2 (/dev/vid0)│  │
                                │  │   - H.264 Hardware / CPU Encoder                      │  │
                                │  │   - MediaMTX RTSP Server (:8554)                      │  │
                                │  │     re-published as WebRTC WHEP (:8889) & HLS (:8888) │  │
                                │  │   - Publish path: /<drone_uuid>/cam0 (or cam1)        │  │
                                │  │   - Camera MAVLink Bridge (comp_id=100, info/status)  │  │
                                │  └───────────────────────────────────────────────────────┘  │
                                └─────────────────────────────────────────────────────────────┘
```

### Key Ports & Interfaces in UAVLink-Edge
* **MAVLink Downlink / Uplink (UDP)**: Port `14550` (or `14540` local listen)
* **Web Management / REST API**: Port `8080` (FastAPI / aiohttp / standard HTTP endpoints)
* **Auth Service (TCP)**: Port `5770` (HMAC-SHA256 Challenge-Response)
* **MediaMTX Video Streaming**:
  * RTSP publish & ingest: `rtsp://<host>:8554/<uuid>/cam0`
  * WebRTC (WHEP): `http://<host>:8889/<uuid>/cam0/whep`
  * HLS: `http://<host>:8888/<uuid>/cam0/index.m3u8`
* **Pixhawk Interface**: Serial `/dev/ttyAMA0` @ 921600 baud or Ethernet `10.41.10.2:14550`.

---

## 2. Current DroneGSC Architecture

In `DroneGSC MobileApp`, the legacy implementation had:
* A unified `UniversalConnectionService` which tried connecting via WebSocket (`ws://host:8088/ws`) to a Python proxy, mixing control and state.
* Hardcoded development IP fallback (`192.168.1.12`).
* Video stream component (`VideoStream.tsx`) rendered video through `expo-video`, but video source selection in settings was uncoordinated with the actual MediaMTX endpoints (`cam0` / `cam1` HLS/RTSP).
* Virtual Joystick sent updates through mock dispatching, lacking a dedicated real control loop with continuous neutral state transmission.
* Settings panel showed theoretical transport types (USB OTG, Bluetooth, TCP) without clear mapping to the actual Wi-Fi / 4G UDP and MediaMTX transport.

---

## 3. Problems / Mismatches Identified

| Area | UAVLink-Edge Reality | Old DroneGSC State | Solution in Refactor |
| :--- | :--- | :--- | :--- |
| **Control Path** | UDP socket on port `14550` / `14540` exchanging standard MAVLink packets (or local REST/WebSocket bridge). | Looked for a proprietary WebSocket bridge on port `8088`. | Support direct UDP / MAVLink and HTTP/REST telemetry streaming with distinct Control Connection Service. |
| **Hardcoded IPs** | Dynamic host/port based on Wi-Fi AP or 4G IP. | Hardcoded `192.168.1.12` in candidate lists. | Remove all hardcoded IPs. Make Pi Host, Control Port, Video Port fully configurable with smart defaults. |
| **Video Channel** | Independent MediaMTX stream (H.264 over RTSP :8554, WebRTC WHEP :8889, HLS :8888) on path `/<uuid>/cam0`. | Treated video as a single string URL without separation of lifecycle, error handling, or stream state. | Fully separate Video Connection Lifecycle from Control Lifecycle. Connect via HLS/RTSP/WHEP endpoint. |
| **Video Failure Impact** | Camera failure or stream lag has zero impact on Pixhawk flight telemetry or control. | Video disconnection was visually entangled with drone state. | Complete architectural decoupling. Video disconnect NEVER sets drone status to disconnected or triggers RTL. |
| **Joystick Loop** | Requires continuous control commands or neutral reset to avoid flight controller failsafe timeout. | Only updated on touch motion without a steady background neutral control loop. | Implement continuous `JoystickProcessor` control loop (10-20 Hz) transmitting neutral packets when idle. |
| **Mission Upload** | MAVLink Mission Protocol (`MISSION_COUNT`, `MISSION_ITEM_INT`, `MISSION_ACK`). | UI simulated progress via timers without real serialization / ACK state. | Implement structured mission serialization and state machine (`IDLE` -> `UPLOADING` -> `VERIFYING` -> `SYNCED` / `FAILED`). |

---

## 4. Control Protocol

Control commands are sent directly to the UAVLink-Edge / Pixhawk control endpoint:
1. **Mode Setting**: `MAV_CMD_DO_SET_MODE` (176) with `param1 = 1` (`MAV_MODE_FLAG_CUSTOM_MODE_ENABLED`) and `param2 = <custom_mode_id>`.
2. **Arm / Disarm**: `MAV_CMD_COMPONENT_ARM_DISARM` (400) with `param1 = 1` (Arm) or `0` (Disarm), `param2 = 0` (force=0 for safety check).
3. **Takeoff**: `MAV_CMD_NAV_TAKEOFF` (22) with `param7 = target_altitude_m`.
4. **Land**: `MAV_CMD_NAV_LAND` (21) or mode `LAND` (ArduCopter mode 9 / PX4 Land).
5. **Return to Launch (RTL)**: `MAV_CMD_NAV_RETURN_TO_LAUNCH` (20) or mode `RTL` (ArduCopter mode 6).
6. **Manual Control / Joystick**: `MANUAL_CONTROL` (#69) containing normalized stick inputs (`x`, `y`, `z`, `r` scaled -1000 to 1000) or RC overrides.

---

## 5. Telemetry Protocol

Telemetry is decoded from MAVLink streams or polled from UAVLink-Edge `/api/telemetry` & `/api/status`:
* **HEARTBEAT**: Decodes `base_mode` (`SAFETY_ARMED`), `custom_mode` (mapped via `_ARDUCOPTER_MODES` and `_PX4_MAIN_MODES`), `system_status`.
* **VFR_HUD**: Decodes `alt` (m), `groundspeed` (m/s), `climb` (m/s), `heading` (deg).
* **GLOBAL_POSITION_INT**: Decodes `lat` (degE7), `lon` (degE7), `relative_alt` (mm), `vx`, `vy`, `vz`.
* **GPS_RAW_INT**: Decodes `fix_type` (0=No, 2=2D, 3=3D Fix), `satellites_visible`, `eph`/`epv`.
* **SYS_STATUS** & **BATTERY_STATUS**: Pack voltage (V), current draw (cA), remaining battery percentage (%).
* **ATTITUDE**: Roll, pitch, yaw (rad converted to deg).
* **COMPANION STATUS**: Companion heartbeat, GPS diagnosis, and camera live status (comp_id 190/255).

---

## 6. Video Protocol

Video is transported completely out-of-band from MAVLink:
```text
Pi Camera Module / USB Cam
           ↓
libcamera-vid / Picamera2 / V4L2
           ↓
Hardware H.264 Encoder (Baseline profile, ultrafast/zerolatency, repeat headers)
           ↓
MediaMTX (RTSP ingest :8554)
           │
           ├─► RTSP Endpoint:    rtsp://<host>:8554/<uuid>/cam0
           ├─► WebRTC (WHEP):    http://<host>:8889/<uuid>/cam0/whep
           └─► HLS Low-Latency:  http://<host>:8888/<uuid>/cam0/index.m3u8
                                         │
                                         ▼
                            Mobile Video Player (VideoStream)
                            - Independent React lifecycle
                            - Zero Redux frame overhead
                            - Fast reconnect & frame drop
```

* **Mobile Player Compatibility**:
  * `expo-video` natively plays HLS (`http://<host>:8888/<uuid>/cam0/index.m3u8`) and HTTP media with hardware acceleration on Android and iOS.
  * RTSP is supported if configured with an RTSP-capable native player or low-latency gateway.
  * No video frames are converted to JSON or passed to Redux.
  * Buffer size is set to `Low` / low-latency mode to avoid latency creep.

---

## 7. Mission Protocol

Mission planning follows the MAVLink Mission Microservice state machine:
```text
UI Mission -> Validation -> Serialize -> Upload
                                            │
                                  ┌─────────▼─────────┐
                                  │   MISSION_COUNT   │ (N items)
                                  └─────────┬─────────┘
                                            │
                             ◄─── MISSION_REQUEST (seq 0..N-1)
                                            │
                                  ┌─────────▼─────────┐
                                  │  MISSION_ITEM_INT │
                                  └─────────┬─────────┘
                                            │
                                  ┌─────────▼─────────┐
                                  │    MISSION_ACK    │
                                  └───────────────────┘
```
States: `IDLE` -> `UPLOADING` (0-100%) -> `VERIFYING` -> `SYNCED` / `FAILED`.

---

## 8. Wi-Fi Path & 9. 4G Path

* **Wi-Fi LAN Path**:
  * Direct IP communication with Pi (e.g. `192.168.x.x` or AP mode `10.42.0.1`).
  * Low latency (<15 ms), high bandwidth for HD video.
* **4G WAN / Cloud Path**:
  * Communication routed via Public IP / Fleet Server (`45.117.171.237` or customized domain).
  * Control via UDP / MAVLink forwarder; Video via MediaMTX server over 4G uplink.
* **Unified Protocol**:
  * The control protocol (MAVLink/UDP) and video protocol (MediaMTX H.264) remain **identical** across Wi-Fi and 4G. Only endpoint addresses (Host/IP) change.

---

## 10. Control / Video Separation Architecture

```text
                                  ┌───────────────────────────┐
                                  │        DroneGSC App       │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 │                                                             │
                 ▼                                                             ▼
   ┌───────────────────────────┐                                 ┌───────────────────────────┐
   │ ControlConnectionService  │                                 │   VideoConnectionService  │
   │ (Status: CONNECTED)       │                                 │   (Status: CONNECTED)     │
   ├───────────────────────────┤                                 ├───────────────────────────┤
   │ - Transport: UDP/MAVLink  │                                 │ - Transport: HLS / RTSP   │
   │ - Commands: Arm, Mode...  │                                 │ - MediaMTX Stream Engine  │
   │ - Joystick Control Loop   │                                 │ - Decoupled Frame Render  │
   │ - Telemetry Service       │                                 │ - Independent Reconnect   │
   │ - Heartbeat Monitor       │                                 │ - NO REDUX FRAME TRAFFIC  │
   │ - Triggers Safety Failsafe│                                 │ - NEVER TRIGGERS FAILSAFE │
   └─────────────┬─────────────┘                                 └─────────────┬─────────────┘
                 │                                                             │
                 ▼                                                             ▼
           Raspberry Pi                                                  MediaMTX Stream
        (MAVLink Forwarder)                                            (H.264 Live Video)
```

---

## 11. Reconnection Strategy & 12. Safety Behavior

1. **Control Connection Interruption**:
   * If Heartbeat or UDP packet stream is interrupted beyond `CONNECTION_TIMEOUT` (3000 ms):
   * `controlConnectionState` transitions to `RECONNECTING` / `DEGRADED`.
   * Virtual Joystick immediately zeroes out and enters `Neutral` safe state (stops issuing active directional deflection).
   * UI displays high-visibility Warning Banner.
   * Background reconnect loop executes with exponential backoff.
2. **Video Stream Interruption**:
   * If video stream drops or buffers:
   * `videoConnectionState` transitions to `RECONNECTING` or `OFFLINE`.
   * HUD displays non-intrusive stream status pill.
   * **FLIGHT CONTROL & TELEMETRY ARE UNTOUCHED AND OPERATE AT FULL PERFORMANCE.**
   * Video reconnects independently without resetting MAVLink sessions.
3. **OTA Update Safety Interlock**:
   * Remains strict: OTA update apply is forbidden when armed, in-flight, or during active manual control.

---

## 13. Proposed New File Architecture

* `src/services/connection/`:
  * `ControlConnectionService.ts` — Main singleton managing MAVLink/UDP control transport and lifecycle.
  * `VideoConnectionService.ts` — Singleton managing Video stream state and MediaMTX endpoint resolution.
  * `TelemetryService.ts` — Decodes and validates telemetry from MAVLink/REST.
  * `HeartbeatService.ts` — Autonomous heartbeat monitor with fail-safe alerts.
  * `MockControlService.ts` & `MockVideoService.ts` — Realistic dual-stream simulation.
  * `ConnectionTypes.ts` — Unified status types (`controlStatus`, `videoStatus`).
* `src/services/command/`:
  * `CommandService.ts` & `SafetyLayer.ts` — Command execution with pre-validation and audit logging.
* `src/services/joystick/`:
  * `JoystickProcessor.ts` — 10-20 Hz control loop with active neutral enforcement.
* `src/services/mission/`:
  * `MissionService.ts` — MAVLink mission upload state machine and verification.
* `src/store/`:
  * `connectionSlice.ts` — Stores separated `controlStatus` and `videoStatus`.
  * `settingsSlice.ts` — Clean settings reflecting actual Pi Host, Control Port, Video Port, MediaMTX URLs.
* `src/components/video/VideoStream.tsx`:
  * Native rendering via `expo-video` connected to `VideoConnectionService`.

---

## 14. Verification & Test Plan

1. **Control Matrix**:
   * Connect over Wi-Fi / 4G endpoint -> Receive Heartbeat & Telemetry.
   * Send Arm, Mode Change, Land, RTL -> Validate ACK.
   * Joystick motion & release -> Validate neutral state transmission.
   * Sever control link -> Validate failsafe warning and zeroing of commands.
2. **Video Matrix**:
   * Video connect & playback -> Latency bounded.
   * Disconnect video -> Verify Control and Telemetry remain 100% operational.
   * Reconnect video -> Verify seamless playback restoration.
3. **Combined Scenarios**:
   * Control Connected + Video Offline.
   * Control Connected + Video Connected.
   * Wi-Fi to 4G failover test.
   * OTA Update safety interlock remains 100% intact.
