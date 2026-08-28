# EAS Over-The-Air (OTA) Updates Guide

This document explains the architecture, release workflow, channel isolation, and operational procedures for Over-The-Air (OTA) updates in **DroneGSC Mobile App**.

---

## 1. Overview & Architecture

DroneGSC uses **Expo Updates / EAS Update** to deliver instant JavaScript, TypeScript, UI, and business logic updates to installed mobile applications without requiring users to manually download and reinstall APK binaries.

```text
Developer / Agent
       ↓
Git Commit / PR
       ↓
CI/CD (Typecheck + Safety Tests)
       ↓
Preview Channel (Automated on main) ──> QA / Pilot Testing APK
       ↓
Maintainer Explicit Action (workflow_dispatch)
       ↓
Production Channel ───────────────────> Production Fleet APKs
```

---

## 2. Decoupled Runtime Version Architecture

To prevent breaking OTA updates when bumping minor JS/UI version numbers, DroneGSC **strictly decouples** the user-facing App Version from the Native Runtime Version.

* **App Version (`version` in `package.json` / `app.json`):** Tracks UI & feature releases (e.g. `1.0.0`, `1.0.1`, `1.0.2`, `1.1.0`).
* **Native Runtime Version (`runtimeVersion: "1.0.0"` in `app.json`):** Identifies native binary compatibility.

```text
Android Binary APK (Runtime: 1.0.0)
       │
       ├── OTA Update #1 (HUD styling tweak)
       ├── OTA Update #2 (Telemetry sensor visualizer)
       ├── OTA Update #3 (Mission planner coordinate display)
       ├── OTA Update #4 (Mock physics adjustment)
       └── OTA Update #5 (Settings diagnostic update)
```

> [!IMPORTANT]
> All OTA updates targeting `runtimeVersion: "1.0.0"` will be seamlessly received by all `1.0.0` APKs. The `runtimeVersion` is ONLY changed when native modules or native configurations change, which requires building a new APK binary.

---

## 3. Channels Strategy

| Channel | Target Audience | Trigger Mechanism | Build Profile |
|---|---|---|---|
| `development` | Core developers | Local development / Expo Dev Client | `development` |
| `preview` | QA Engineers & Test Pilots | Automated on merge to `main` (`preview-ota.yml`) | `preview` (APK) |
| `production` | Active Field Operators | **Strictly Manual / Explicit** (`publish-production-update.yml`) | `production` (APK/AAB) |

---

## 4. How to Publish OTA Updates

### Option A — Automated Preview Update (Via Git)
Merging code to `main` automatically runs tests and publishes to the `preview` channel via `.github/workflows/preview-ota.yml`.

### Option B — Manual / Production Release (Via GitHub Actions)
1. Go to **GitHub Actions** > **Publish Production OTA Update**.
2. Click **Run workflow**.
3. Enter the changelog message (e.g. `Fix telemetry altitude display in HUD`).
4. Select target channel (`production` or `preview`).
5. Click **Run workflow**.

### Option C — Command Line (Local Maintainer)
```bash
# Preview Channel
npm run update:preview
# or: eas update --channel preview --message "Preview test build"

# Production Channel
npm run update:prod
# or: eas update --channel production --message "Production release v1.0.1"
```

---

## 5. Rollback Strategy & Emergency Recovery

If an OTA update causes unexpected issues:

### 1. Instant EAS Rollback (CLI)
Rollback to the previous stable update on a channel:
```bash
npx eas-cli update:rollback --channel production
```

### 2. Emergency Launch Fallback
The `expo-updates` client has built-in anti-bricking protections. If a newly downloaded bundle crashes on startup, the client automatically rolls back to the safe embedded binary update (`isEmergencyLaunch: true`) and continues operating without bricking the app.

---

## 6. Offline & Server Resilience

* If the mobile device is offline or in a remote flight area with zero cellular connectivity, the app **boots immediately from the local cache** with zero timeout delay (`fallbackToCacheTimeout: 0`).
* OTA check failures are logged silently and will never block or interrupt Ground Control Station startup.
