# Drone Flight Safety & OTA Interlock Architecture

DroneGSC is a mission-critical **Ground Control Station (GCS)** for autonomous and manual UAV operations. This document details the **Drone Safety Guard & Fail-Closed Interlock** that protects flight sessions from unexpected OTA reloads.

---

## 1. Golden Safety Rule

> [!CAUTION]
> **UNDER NO CIRCUMSTANCES SHALL AN OTA UPDATE RELOAD, RESTART, OR DISRUPT THE GCS APPLICATION WHILE A VEHICLE IS ARMED, IN FLIGHT, OR IN AN UNCONFIRMED STATE.**

---

## 2. Fail-Closed State Interlock Matrix

The `UpdateService` evaluates the authoritative state of the UAV before executing any reload action:

```mermaid
flowchart TD
    A["User Triggers or Background Proposes Update"] --> B["Atomic Safety Check at Execution Boundary"]
    B --> C{"Vehicle ARMED?"}
    C -->|YES (armed=true)| D["⛔ REJECT & LOCK RELOAD<br/>Display Red Warning"]
    C -->|NO| E{"Active Flight Mode?"}
    E -->|TAKEOFF, LAND, AUTO, GUIDED, MISSION, RTL, IN_FLIGHT| D
    E -->|NO| F{"Telemetry Initialized?"}
    F -->|UNINIT or BOOTING| D
    F -->|YES| G{"Connection Type?"}
    G -->|MOCK Mode & Disarmed| H["✅ ALLOW RELOAD"]
    G -->|Real Mode & Connected & Confirmed Disarmed| H
    G -->|Real Mode & DISCONNECTED| I["⚠️ FAIL-CLOSED BLOCK<br/>(Airborne link loss danger)"]
```

---

## 3. Detailed Interlock Rules

### 1. ARMED Protection (`drone.armed === true`)
* **Behavior:** Reload action is strictly disabled.
* **Rationale:** Motors are energized. Any JS thread reset causes instantaneous loss of joystick telemetry and pilot control.

### 2. Flight Mode Protection
* **Unsafe Modes:** `TAKEOFF`, `LAND`, `AUTO`, `GUIDED`, `MISSION_RUNNING`, `IN_FLIGHT`, `RTL`, `QRTL`, `FOLLOW`, `CIRCLE`, `BRAKE`, `THROW`.
* **Behavior:** Reload action is locked even if `armed` telemetry momentarily glitches.

### 3. Fail-Closed on Disconnected Real Drone
* **Behavior:** If the app is set to Real Drone connection (`UDP`, `TCP`, `SERIAL`) and the link drops (`status: 'DISCONNECTED'`), reload is **LOCKED BY DEFAULT**.
* **Rationale:** If radio link fails during mid-air flight, the drone may still be flying in failsafe/RTL. The GCS must remain active to re-establish link immediately upon vehicle return.

### 4. Background Download Separation
* **Download:** Allowed to stream and cache bundles in background. CPU impact is minimal and non-blocking.
* **Apply/Reload:** Gated behind pilot confirmation and safe state validation.

---

## 4. Atomic Execution Boundary Protection

To eliminate race conditions (e.g. pilot arming the drone in the millisecond between pressing update and native reload executing), `updateService.applyUpdateSafely()` re-queries the Redux store **synchronously and atomically** directly before calling `Updates.reloadAsync()`.

If `armed` turns `true` at the exact boundary, reload is immediately aborted and an alert is dispatched.
