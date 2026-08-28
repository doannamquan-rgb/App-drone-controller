# DroneGSC Release Management & Versioning Strategy

This guide defines the versioning policy, release checklist, and decision criteria for choosing between **OTA Updates** and **APK Binary Builds**.

---

## 1. Versioning Architecture

DroneGSC adheres to Semantic Versioning (`MAJOR.MINOR.PATCH`):

```text
       MAJOR . MINOR . PATCH
         │       │       └── UI bug fixes, small visual adjustments (OTA)
         │       └────────── New features, screens, telemetry panels (OTA / APK)
         └────────────────── Breaking architectural/native changes (APK Mandatory)
```

### Version Hierarchy

| Layer | Identifier | Example | Location |
|---|---|---|---|
| **App Version** | User-facing version string | `1.0.0`, `1.0.1` | `package.json`, `app.json` |
| **Android Version Code** | Incremental integer for stores | `1`, `2`, `3` | `app.json` (`android.versionCode`) |
| **Native Runtime Version** | Binary runtime compatibility string | `"1.0.0"`, `"2.0.0"` | `app.json` (`runtimeVersion`) |
| **OTA Update ID** | Unique hash of JS bundle | `a1b2c3d4-...` | Generated per EAS Update |

---

## 2. Decision Matrix: OTA vs APK

| Category | Change Type | OTA Allowed? | Requires New APK? |
|---|---|:---:|:---:|
| **UI & Styling** | Color adjustments, HUD widgets, Map overlays | ✅ Yes | ❌ No |
| **Business Logic** | Redux slices, telemetry parsing, calculations | ✅ Yes | ❌ No |
| **Simulation** | Mock Drone physics, synthetic sensor noise | ✅ Yes | ❌ No |
| **Navigation** | New screens, tab navigation reorganization | ✅ Yes | ❌ No |
| **Bug Fixes** | Null checks, state race conditions | ✅ Yes | ❌ No |
| **Native Dependencies**| Adding or updating native libraries | ❌ No | ✅ **YES** |
| **Expo SDK** | Upgrading Expo SDK version | ❌ No | ✅ **YES** |
| **React Native** | Upgrading React Native core | ❌ No | ✅ **YES** |
| **Android Manifest** | Permissions (`INTERNET`, `BLUETOOTH`, `LOCATION`) | ❌ No | ✅ **YES** |
| **Gradle / Build** | Gradle plugins, NDK, compileSdkVersion | ❌ No | ✅ **YES** |

---

## 3. Step-by-Step Release Checklist

### Step 1: Pre-Release Validation
Before publishing any OTA or building an APK:
1. Run static analysis:
   ```bash
   npm run typecheck
   ```
2. Run test suite & safety verification:
   ```bash
   npm test
   ```

### Step 2: Publish OTA Update (For JS/UI Changes)
1. Commit changes to `main`.
2. Verify automated update on `preview` channel.
3. Test using a device with the Preview APK.
4. Trigger the GitHub Action **Publish Production OTA Update** via `workflow_dispatch`.

### Step 3: Publish APK Release (For Native / Major Releases)
1. Update `app.json`:
   - Increment `version` (e.g. `1.1.0`).
   - Increment `android.versionCode` (e.g. `2`).
   - If native runtime changed, increment `runtimeVersion` (e.g. `"2.0.0"`).
2. Create and push a git release tag:
   ```bash
   git tag -a v1.1.0 -m "Release v1.1.0"
   git push origin v1.1.0
   ```
3. GitHub Actions (`build-apk.yml`) triggers automatically, builds `DroneGSC-v1.1.0.apk`, and uploads it as an artifact.
