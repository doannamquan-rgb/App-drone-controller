# Building & Installing Android APK for DroneGSC

This guide covers building standalone Android APKs and installing them on physical mobile devices and ground control tablets.

---

## 1. Prerequisites

1. **Node.js** (v20+ recommended)
2. **EAS CLI**:
   ```bash
   npm install -g eas-cli
   ```
3. **Expo Account & EAS Login**:
   ```bash
   npx eas-cli login
   ```

---

## 2. Build Profiles in `eas.json`

| Profile | Output Format | Channel | Use Case |
|---|---|---|---|
| `preview` | `.apk` (Direct Install) | `preview` | Internal Testing / QA |
| `production` | `.apk` (Direct Install) | `production` | Field Deployment & Sideloading |
| `production-aab`| `.aab` (Android App Bundle)| `production` | Google Play Store Upload |
| `development` | `.apk` (Dev Client) | `development` | Local Development with Native Debugger |

---

## 3. How to Build an APK

### Option A — Automated Build via GitHub Actions (Recommended)
1. Go to **GitHub Actions** > **Build Android APK**.
2. Click **Run workflow** and select the profile (`preview` or `production`).
3. Download the generated `.apk` artifact directly when completed.

### Option B — EAS Cloud Build (CLI)
```bash
# Build Preview APK (Channel: preview)
npm run build:apk:preview

# Build Production APK (Channel: production)
npm run build:apk:prod
```
EAS will output a direct download URL for the generated `.apk`.

### Option C — Local Build (Requires Android SDK & Gradle)
```bash
npx eas-cli build --platform android --profile preview --local
```

---

## 4. How to Install the APK on Android

### Method 1: Direct Download (Easiest)
1. Open the EAS Build download link or GitHub Actions artifact link on your Android device / GCS tablet.
2. Download the `.apk` file.
3. Open the file and tap **Install** (allow "Install unknown apps" if prompted).

### Method 2: ADB (Android Debug Bridge)
1. Connect your Android device to your computer via USB (enable **USB Debugging** in Developer Options).
2. Verify device connection:
   ```bash
   adb devices
   ```
3. Install the APK:
   ```bash
   adb install -r DroneGSC-v1.0.0.apk
   ```

---

## 5. Verifying Installation & Mock Mode

1. Launch **DroneGSC** on the Android device.
2. The app locks in landscape mode.
3. Default connection is set to **Mock Drone Mode**.
4. Tap **Settings** (⚙️) > **SYSTEM** to verify:
   - App Version: `1.0.0`
   - Native Runtime Version: `1.0.0`
   - Channel: `production` or `preview`
   - Safety Guard: `SAFE FOR UPDATES`
5. Switch to **FLIGHT** screen and test virtual joysticks, HUD gauges, and mock drone telemetry physics.
