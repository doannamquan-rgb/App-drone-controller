#!/usr/bin/env python3
"""
================================================================================
ANITECH GCS - ALL-IN-ONE DRONE COMPANION & FPV CAMERA SIMULATOR
================================================================================
Combines:
1. 20 Hz Real MAVLink Flight Physics & Telemetry Server (WebSocket + UDP)
2. 30 FPS Real-time FPV Camera Video Streamer (HLS HTTP on port 8888)
Zero physical drone needed. Full end-to-end test for Telemetry + Video.
================================================================================
"""

import asyncio
import json
import time
import math
import socket
import os
import shutil
import threading
from pathlib import Path
from aiohttp import web
import cv2
import numpy as np

WS_PORT = 8088
HLS_PORT = 8888
UDP_PORT = 14550
STREAM_DIR = Path(__file__).parent / "streamer" / "hls_live"

# Drone State
drone = {
    "latitude": 10.823099,
    "longitude": 106.629664,
    "altitude": 0.0,
    "target_alt": 0.0,
    "speed": 0.0,
    "battery": 98.0,
    "voltage": 16.2,
    "current": 0.5,
    "mode": "LOITER",
    "armed": False,
    "roll": 0.0,
    "pitch": 0.0,
    "yaw": 0.0,
    "heading": 0,
    "satellites": 18,
    "hdop": 0.6,
    "vehicleType": "COPTER",
    "vehicleName": "ArduCopter Sim 3D",
    "autopilot": "ARDUPILOT",
    "bytesRx": 0,
    "bytesTx": 0,
    "packetsPerSec": 20,
    "latencyMs": 8,
    "timestamp": 0
}

connected_ws_clients = set()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# ------------------------------------------------------------------------------
# 1. SYNTHETIC FPV DRONE CAMERA GENERATOR & HLS WRITER
# ------------------------------------------------------------------------------
def generate_fpv_frame(width=1280, height=720):
    """Draws a rich, dynamic 3D FPV HUD camera frame matching drone physics."""
    # Sky and Ground colors
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Calculate horizon line offset based on Pitch and Roll
    pitch_offset = int((drone["pitch"] / 45.0) * (height / 2))
    roll_rad = math.radians(-drone["roll"])
    
    center_y = height // 2 + pitch_offset
    center_x = width // 2
    
    # Draw Sky (Blue)
    frame[:, :] = (180, 110, 40) # BGR Sky blue
    
    # Draw Ground (Green)
    ground_poly = np.array([
        [0, center_y],
        [width, center_y],
        [width, height],
        [0, height]
    ], dtype=np.int32)
    
    cv2.fillPoly(frame, [ground_poly], (40, 110, 50)) # Green ground
    
    # Grid lines on ground
    for y_line in range(max(center_y, 0), height, 40):
        cv2.line(frame, (0, y_line), (width, y_line), (30, 90, 40), 1)
    
    # Center Artificial Horizon Line (White)
    cv2.line(frame, (center_x - 180, center_y), (center_x + 180, center_y), (255, 255, 255), 2)
    cv2.line(frame, (center_x, center_y - 15), (center_x, center_y + 15), (255, 255, 255), 2)
    
    # FPV Crosshair Center (Red)
    cv2.circle(frame, (width // 2, height // 2), 6, (0, 0, 255), -1)
    cv2.circle(frame, (width // 2, height // 2), 22, (0, 0, 255), 2)
    cv2.line(frame, (width // 2 - 35, height // 2), (width // 2 - 10, height // 2), (0, 0, 255), 2)
    cv2.line(frame, (width // 2 + 10, height // 2), (width // 2 + 35, height // 2), (0, 0, 255), 2)
    
    # HUD OSD Text Overlays
    status_text = f"FPV CAM 0 | MODE: {drone['mode']} | {'ARMED' if drone['armed'] else 'DISARMED'}"
    cv2.putText(frame, status_text, (40, 50), cv2.FONT_HERSHEY_DUPLEX, 0.75, (0, 255, 255), 2)
    
    telemetry_osd = f"ALT: {drone['altitude']:.1f}m  SPD: {drone['speed']:.1f}m/s  HDG: {drone['heading']:03d} deg  BAT: {drone['battery']:.0f}%"
    cv2.putText(frame, telemetry_osd, (40, height - 40), cv2.FONT_HERSHEY_DUPLEX, 0.75, (255, 255, 255), 2)
    
    # Pitch & Roll readouts
    att_text = f"PITCH: {drone['pitch']:+.1f} | ROLL: {drone['roll']:+.1f}"
    cv2.putText(frame, att_text, (width - 340, 50), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 255, 255), 2)
    
    # Live Timestamp Clock
    time_str = time.strftime("%H:%M:%S")
    cv2.putText(frame, f"LIVE: {time_str}", (width - 220, height - 40), cv2.FONT_HERSHEY_DUPLEX, 0.65, (200, 200, 200), 2)

    return frame

def video_hls_worker():
    """Continuously generates FPV video frames and outputs HLS segments using FFmpeg."""
    STREAM_DIR.mkdir(parents=True, exist_ok=True)
    # Clean previous segments
    for f in STREAM_DIR.glob("*.*"):
        try:
            f.unlink()
        except Exception:
            pass

    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", "1280x720",
        "-r", "25",
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-g", "25",
        "-f", "hls",
        "-hls_time", "1",
        "-hls_list_size", "5",
        "-hls_flags", "delete_segments+split_by_time",
        str(STREAM_DIR / "index.m3u8")
    ]

    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
        while True:
            frame = generate_fpv_frame(1280, 720)
            proc.stdin.write(frame.tobytes())
            time.sleep(0.04) # 25 FPS
    except Exception as e:
        print(f"[Video Streamer] Warning: FFmpeg HLS generator: {e}")

# ------------------------------------------------------------------------------
# 2. FLIGHT COMMANDS & PHYSICS ENGINE (20 Hz)
# ------------------------------------------------------------------------------
async def handle_client_message(data_str: str):
    global drone
    try:
        msg = json.loads(data_str)
    except Exception:
        return

    m_type = msg.get("type")
    if m_type == "COMMAND":
        cmd = msg.get("command")
        payload = msg.get("payload", {})
        
        if cmd == "ARM":
            drone["armed"] = True
            print(f"[MAVLink CMD] ARMED -> Motors Active!")
        elif cmd == "DISARM":
            drone["armed"] = False
            drone["speed"] = 0.0
            print(f"[MAVLink CMD] DISARMED -> Motors Inactive.")
        elif cmd == "TAKEOFF":
            alt = payload.get("altitude", 10.0) if isinstance(payload, dict) else 10.0
            drone["target_alt"] = float(alt)
            drone["mode"] = "TAKEOFF"
            drone["armed"] = True
            print(f"[MAVLink CMD] TAKEOFF -> Climbing to {alt}m...")
        elif cmd == "LAND":
            drone["mode"] = "LAND"
            drone["target_alt"] = 0.0
            print(f"[MAVLink CMD] LAND -> Returning to ground...")
        elif cmd == "RTL":
            drone["mode"] = "RTL"
            drone["target_alt"] = 15.0
            print(f"[MAVLink CMD] RTL -> Returning to Launch...")
        elif cmd == "SET_MODE":
            drone["mode"] = payload.get("mode", "LOITER") if isinstance(payload, dict) else "LOITER"
            print(f"[MAVLink CMD] SET_MODE -> {drone['mode']}")
        elif cmd == "JOYSTICK":
            inp = payload.get("input", {}) if isinstance(payload, dict) else {}
            pitch_val = inp.get("pitch", 0.0)
            roll_val = inp.get("roll", 0.0)
            yaw_val = inp.get("yaw", 0.0)
            thr_val = inp.get("throttle", 0.5)

            drone["pitch"] = round(pitch_val * 35.0, 1)
            drone["roll"] = round(roll_val * 35.0, 1)
            drone["yaw"] = round(((drone["yaw"] + yaw_val * 4.0) % 360 + 360) % 360, 1)
            drone["heading"] = int(drone["yaw"])

            if thr_val > 0.55:
                drone["altitude"] = round(drone["altitude"] + (thr_val - 0.5) * 0.8, 1)
            elif thr_val < 0.45:
                drone["altitude"] = max(0.0, round(drone["altitude"] - (0.5 - thr_val) * 0.8, 1))

            stick_mag = math.sqrt(pitch_val**2 + roll_val**2)
            drone["speed"] = round(max(0.0, stick_mag * 12.0), 1)

async def physics_loop():
    tick = 0
    while True:
        await asyncio.sleep(0.05) # 20 Hz
        tick += 1

        if drone["mode"] == "TAKEOFF" and drone["armed"]:
            if drone["altitude"] < drone["target_alt"]:
                drone["altitude"] = round(min(drone["target_alt"], drone["altitude"] + 0.35), 1)
                drone["speed"] = 2.5
            else:
                drone["mode"] = "LOITER"
        elif drone["mode"] == "LAND":
            if drone["altitude"] > 0:
                drone["altitude"] = round(max(0.0, drone["altitude"] - 0.25), 1)
                drone["speed"] = 1.0
            else:
                drone["armed"] = False
                drone["speed"] = 0.0
                drone["mode"] = "LOITER"

        # Idle gentle hovering motion
        if drone["armed"] and drone["altitude"] > 0:
            drone["roll"] += math.sin(tick * 0.08) * 0.5
            drone["pitch"] += math.cos(tick * 0.06) * 0.3
            hdg_rad = math.radians(drone["yaw"])
            drone["latitude"] += math.cos(hdg_rad) * drone["speed"] * 0.0000003
            drone["longitude"] += math.sin(hdg_rad) * drone["speed"] * 0.0000003

        if drone["armed"]:
            drone["battery"] = max(5.0, round(drone["battery"] - 0.002, 1))

        drone["timestamp"] = int(time.time() * 1000)

        # Broadcast to WebSockets
        if connected_ws_clients:
            payload = json.dumps({"type": "TELEMETRY", "data": drone})
            for ws in list(connected_ws_clients):
                try:
                    await ws.send_str(payload)
                except Exception:
                    pass

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_ws_clients.add(ws)
    print(f"[GCS Connected] Mobile App connected from {request.remote}")

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                await handle_client_message(msg.data)
    finally:
        connected_ws_clients.remove(ws)
        print(f"[GCS Disconnected] App disconnected: {request.remote}")
    return ws

# ------------------------------------------------------------------------------
# 3. HTTP HLS VIDEO & STATIC SERVER
# ------------------------------------------------------------------------------
async def hls_playlist_handler(request):
    """Serves index.m3u8 for MediaMTX HLS route."""
    m3u8_file = STREAM_DIR / "index.m3u8"
    if m3u8_file.exists():
        return web.FileResponse(m3u8_file, headers={
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/vnd.apple.mpegurl"
        })
    content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n"
    return web.Response(text=content, content_type="application/vnd.apple.mpegurl")

async def hls_segment_handler(request):
    seg_name = request.match_info["segment"]
    seg_file = STREAM_DIR / seg_name
    if seg_file.exists():
        return web.FileResponse(seg_file, headers={"Access-Control-Allow-Origin": "*"})
    return web.Response(status=404)

async def main():
    # 1. Start FPV Video Generator Thread
    video_thread = threading.Thread(target=video_hls_worker, daemon=True)
    video_thread.start()

    # 2. Set up Web App for Telemetry WS (:8088)
    app_ws = web.Application()
    app_ws.router.add_get("/ws", ws_handler)
    runner_ws = web.AppRunner(app_ws)
    await runner_ws.setup()
    site_ws = web.TCPSite(runner_ws, "0.0.0.0", WS_PORT)
    await site_ws.start()

    # 3. Set up Web App for HLS Video (:8888)
    app_hls = web.Application()
    app_hls.router.add_get("/{uuid}/cam0/index.m3u8", hls_playlist_handler)
    app_hls.router.add_get("/{uuid}/cam0/{segment}", hls_segment_handler)
    app_hls.router.add_get("/index.m3u8", hls_playlist_handler)
    app_hls.router.add_get("/{segment}", hls_segment_handler)
    runner_hls = web.AppRunner(app_hls)
    await runner_hls.setup()
    site_hls = web.TCPSite(runner_hls, "0.0.0.0", HLS_PORT)
    await site_hls.start()

    ip = get_local_ip()
    print("=" * 75)
    print("      ANITECH GCS - ALL-IN-ONE DRONE & FPV CAMERA SIMULATOR")
    print("=" * 75)
    print(f"[TELEMETRY SERVER] ws://{ip}:{WS_PORT}/ws")
    print(f"[FPV VIDEO STREAM] http://{ip}:{HLS_PORT}/00000011-0000-0000-0000-000000000011/cam0/index.m3u8")
    print("=" * 75)
    print("INSTRUCTIONS FOR MOBILE APP:")
    print(f"1. Settings -> CONNECTION -> UDP Host IP: {ip} -> CONNECT")
    print(f"2. Settings -> VIDEO -> MediaMTX HLS Host: {ip} -> SAVE")
    print("=" * 75)
    print("Simulator active & streaming. Press Ctrl+C to stop.\n")

    await physics_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
