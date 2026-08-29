# DroneGSC & UAVLink-Edge Connection & Video Architecture

## 1. Existing UAVLink-Edge Architecture

**UAVLink-Edge** is the onboard companion software stack running on a Raspberry Pi 5 (or CM5) connected to a Pixhawk / ArduPilot / PX4 flight controller and hardware cameras.

### Key Ports & Interfaces in UAVLink-Edge
* **MAVLink Downlink / Uplink (UDP)**: Port 14550 (or 14540 local listen)
* **WebSocket Control Bridge**: Port 8088/ws (WebSocket JSON bridge bridging Mobile App to MAVLink)
* **Web Management / REST API**: Port 8080 (FastAPI / aiohttp / standard HTTP endpoints)
* **Auth**: Static Bearer Token trong JSON payload gửi qua WebSocket — trường `token` trong mỗi `FlightControlPacket`. **KHÔNG CÓ** Port 5770 hay HMAC-SHA256 Challenge-Response nào trong code thực tế của app hay forwarder.py được xác nhận.
* **MediaMTX Video Streaming**:
  * RTSP publish & ingest: rtsp://<host>:8554/<uuid>/cam0
  * WebRTC (WHEP): http://<host>:8889/<uuid>/cam0/whep
  * HLS: http://<host>:8888/<uuid>/cam0/index.m3u8
* **Pixhawk Interface**: Serial /dev/ttyAMA0 @ 921600 baud or Ethernet 10.41.10.2:14550.

---

## 2. Current DroneGSC Architecture

In DroneGSC MobileApp:
* Separates ControlConnectionService (Control, Telemetry, Heartbeat) and VideoConnectionService (MediaMTX stream).
* Dynamic host/port based on Settings (Mode 1: Wi-Fi Direct vs Mode 2: 4G Fleet Cloud).
* Strict 20 Hz Joystick Loop with monotonic sequence numbering and Session ID lifecycle.
* GCS Heartbeat TX Loop (1 Hz) keeping vehicle watchdog active when joysticks are idle.

---

## 3. Problems / Mismatches Identified & Resolved

| Area | UAVLink-Edge Reality | Old DroneGSC State | Solution in Refactor |
| :--- | :--- | :--- | :--- |
| **Control Path** | WebSocket JSON Gateway (:8088/ws) converting to MAVLink UDP :14550 / UART. | Sent commands without rate control or GCS Heartbeat TX. | Strict 20Hz loop, monotonic seq, Session ID, Token Auth, GCS Heartbeat 1 Hz. |
| **Hardcoded IPs** | Dynamic host/port based on Wi-Fi AP or 4G VPS. | Hardcoded 192.168.1.12. | Removed all hardcoded IPs, user configurable Mode 1 (Wi-Fi) and Mode 2 (4G). |
| **Video Channel** | MediaMTX H.264 over RTSP (:8554), HLS (:8888), WebRTC WHEP (:8889). | Coupled video and drone state. | 100% decoupled. Video failure never triggers drone failsafe. |
| **Video Failure Impact** | Camera lag does not affect telemetry / control. | Entangled in Redux state. | Completely decoupled in Redux and React components. |
| **Joystick Loop** | Requires continuous neutral loop to avoid FC failsafe. | Sent touch events only. | 20Hz continuous loop sending neutral frames when idle. |

---

## 4. Control Protocol

Control commands are sent directly to the UAVLink-Edge / Pixhawk control endpoint:
1. **Mode Setting**: MAV_CMD_DO_SET_MODE (176) with param1 = 1 and param2 = <custom_mode_id>.
2. **Arm / Disarm**: MAV_CMD_COMPONENT_ARM_DISARM (400) with param1 = 1 (Arm) or 0 (Disarm).
3. **Takeoff**: MAV_CMD_NAV_TAKEOFF (22) with param7 = target_altitude_m.
4. **Land**: MAV_CMD_NAV_LAND (21) or mode LAND.
5. **Return to Launch (RTL)**: MAV_CMD_NAV_RETURN_TO_LAUNCH (20) or mode RTL.
6. **Manual Control / Joystick**: MANUAL_CONTROL (#69) containing normalized stick inputs (x, y, z, r scaled -1000 to 1000).

---

## 5. Telemetry Protocol

Telemetry is decoded from MAVLink streams or polled from UAVLink-Edge /api/telemetry:
* **HEARTBEAT**: Decodes base_mode (SAFETY_ARMED), custom_mode, system_status.
* **VFR_HUD**: Decodes alt (m), groundspeed (m/s), climb (m/s), heading (deg).
* **GLOBAL_POSITION_INT**: Decodes lat, lon, relative_alt, vx, vy, vz.
* **GPS_RAW_INT**: Decodes fix_type, satellites_visible, hdop.
* **SYS_STATUS** & **BATTERY_STATUS**: Pack voltage (V), current draw (cA), remaining battery percentage (%).
* **ATTITUDE**: Roll, pitch, yaw (rad converted to deg).
* **COMPANION STATUS**: Companion heartbeat, GPS diagnosis, and camera live status.

---

## 6. Video Protocol & Latency Limitations

Video is transported completely out-of-band from control and telemetry:
* **Mobile Player Compatibility & Latency Notice**:
  * expo-video natively plays HLS (http://<host>:8888/<uuid>/cam0/index.m3u8) with hardware acceleration on Android and iOS.
  * **CRITICAL LATENCY NOTICE**: HLS introduces a buffer/chunk latency of **~1.0 to 1.5 seconds** (or 2-3s depending on GOP segment size). **HLS IS NOT SUITABLE FOR REAL-TIME MANUAL FPV FLIGHT CONTROL VIA JOYSTICK**, as manual piloting requires ultra-low latency (<200ms).
  * HLS is currently used as an **interim stable video stream** for surveillance, framing, and monitoring while running standard Expo client builds.
  * **Roadmap / Milestone for Native WebRTC**: Full real-time FPV stream (<200ms) will be implemented using react-native-webrtc (WHEP SDP Offer/Answer client connected to MediaMTX port 8889) upon moving to Custom Dev Client native builds (eas build --profile development).
  * No video frames are converted to JSON or passed to Redux.
  * Buffer size is set to Low / low-latency mode to avoid latency creep.

---

## 7. Mission Protocol

Mission planning follows the MAVLink Mission Microservice state machine:
MISSION_COUNT -> MISSION_REQUEST (seq 0..N-1) -> MISSION_ITEM_INT -> MISSION_ACK.
States: IDLE -> UPLOADING (0-100%) -> VERIFYING -> SYNCED / FAILED.

---

## 8. Wi-Fi Path & 9. 4G Path (NAT Traversal Architecture)

* **Wi-Fi LAN Path (Mode 1)**:
  * Direct IP communication with Pi (e.g. 192.168.x.x or AP mode 10.42.0.1).
  * Low latency (<15 ms), high bandwidth for HD video.
* **4G WAN / Cloud Path (Mode 2 - NAT Traversal via VPS Relay)**:
  * When both Raspberry Pi and Mobile Phone use 4G LTE SIM cards, both are behind Carrier-Grade NAT (CGNAT) without public IP addresses and direct inbound traffic is blocked.
  * **Video NAT Solution**:
    - Raspberry Pi establishes an Outbound RTSP push to the public VPS (rtsp://45.117.171.237:8554/<uuid>/cam0).
    - DroneGSC Mobile App establishes an Outbound pull (HLS on :8888 or WebRTC on :8889) to the public VPS.
    - Since both connections are outbound initiated to a public IP, neither carrier NAT blocks traffic.
  * **Control NAT Solution (Option A: Relay on VPS)**:
    - Pi companion software connects outbound to VPS.
    - DroneGSC App connects outbound via WebSocket to VPS port 8088/ws.
    - The VPS router/relay maintains bidirectional session/token mapping and forwards telemetry down to mobile and joystick/commands up to Pi.
* **Unified Protocol**:
  * The control protocol (WebSocket JSON to MAVLink Bridge) and video protocol (MediaMTX H.264) remain identical across Wi-Fi and 4G. Only endpoint addresses (Host/IP) change.

---

## 10. Actual Control / Video Separation Architecture

> **REALITY NOTE (CODE IMPLEMENTATION)**: package.json does not currently include raw UDP socket native libraries (react-native-udp). DroneGSC App communicates over a high-speed **WebSocket JSON Bridge (ws://<host>:8088/ws)** with session ID, sequence numbers, auth token, and GCS Heartbeat TX. The companion Python forwarder (forwarder.py) on the Pi / VPS translates these messages directly to MAVLink UDP (:14550) or Serial UART to Pixhawk.

---

## 11. Reconnection Strategy & 12. Safety Behavior

1. **Control Connection Interruption & Sequence Reset**:
   * If Heartbeat packet stream is interrupted beyond CONNECTION_TIMEOUT (3000 ms):
   * controlConnectionState transitions to RECONNECTING / DEGRADED.
   * Virtual Joystick immediately zeroes out and enters Neutral safe state (stops issuing active directional deflection).
   * UI displays high-visibility Warning Banner.
   * Background reconnect loop executes with exponential backoff.
   * **Session & Sequence Reset**: Khi reconnect thành công (socket.onopen), một sessionId mới được sinh ra và bộ đếm txSequenceNumber = 0, lastRxSequenceNumber = 0 được reset về 0 để tránh drop vĩnh viễn các gói tin của phiên làm việc mới.
2. **Security & Whitelist (VPS Relay)**:
   * Mỗi gói tin điều khiển và heartbeat mang trường token: authToken và sessionId. Forwarder trên VPS/Pi xác thực token trước khi chuyển tiếp vào Pixhawk.
3. **Video Stream Interruption**:
   * If video stream drops or buffers:
   * videoConnectionState transitions to RECONNECTING or OFFLINE.
   * HUD displays non-intrusive stream status pill.
   * **FLIGHT CONTROL & TELEMETRY ARE UNTOUCHED AND OPERATE AT FULL PERFORMANCE.**
   * Video reconnects independently without resetting MAVLink sessions.
4. **OTA Update Safety Interlock**:
   * Remains strict: OTA update apply is forbidden when armed, in-flight, or during active manual control.

---

## 13. Security Debt & Open Items

### 13.1 Transport Encryption — wss:// cho Mode 2 (4G)

> **⚠ SECURITY DEBT — VIỆC CÒN NỢ**

* **Hiện trạng**: Kênh App → VPS (Mode 2 - 4G) đang dùng **`ws://` (cleartext WebSocket)** qua internet công khai. Token xác thực và toàn bộ lệnh điều khiển drone (ARM, DISARM, TAKEOFF, v.v.) được gửi **không mã hoá** qua mạng 4G/WAN.
* **Rủi ro**: Bất kỳ ai có thể MITM (Man-in-the-Middle) trên đường truyền đều có thể đọc token và phát lại lệnh điều khiển.
* **Giải pháp cần triển khai**: Nâng cấp VPS lên HTTPS/WSS bằng TLS certificate (Let's Encrypt hoặc self-signed CA), sau đó đổi URL kết nối từ `ws://<vps>:8088/ws` → `wss://<vps>:8088/ws`. Mode 1 (Wi-Fi LAN) là local network có thể giữ `ws://` hoặc nâng lên `wss://` tuỳ chọn.
* **Mốc thời gian dự kiến**: Cần hoàn thành trước khi drone bay qua 4G trong môi trường thực tế / ngoài trời.
* **Scope**: Thay đổi này cần cấu hình phía VPS/Pi (TLS cert, nginx/caddy reverse proxy), không chỉ phía app.

### 13.2 Token Rotation — Đổi Token Thủ Công Trên Pi/VPS

> **⚠ HÀNH ĐỘNG CẦN THỰC HIỆN NGAY NGOÀI REPO**

* Token mặc định `UAVLink_GCS_Default_Token_2026` đã bị **lộ công khai** trong git history của repo public này.
* **Người dùng phải đổi token thủ công** trong file cấu hình của `forwarder.py` hoặc companion Python service trên Pi và VPS:
  ```bash
  # Ví dụ trên Pi / VPS — tìm và thay thế trong forwarder.py hoặc .env
  AUTH_TOKEN="<token-mới-bí-mật-của-bạn>"
  ```
* Sau đó, nhập token mới này vào phần Settings của DroneGSC App (trường `udp.authToken`) — app sẽ từ chối kết nối nếu không có token (`fail-closed`).
* Token KHÔNG CÒN được hard-code hay có giá trị mặc định nào trong app kể từ commit này.

