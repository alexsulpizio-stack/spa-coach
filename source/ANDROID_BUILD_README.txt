SPA COACH v0.6.0 - ANDROID + OTA BUILD

OPEN AND BUILD
1. Open the android folder in Android Studio.
2. Let Gradle sync finish, connect the phone, and click Run.
3. Android updates com.spacoach.app in place when the signing key matches. Do not uninstall first.

DATA PRESERVATION
The applicationId remains com.spacoach.app. The web storage origin, localStorage key, and IndexedDB photo database are unchanged. An in-place, same-signature update retains the profile, history, photos, inventory, and pending work. Android refuses an update signed by a different key rather than silently deleting data.

SIGNING
Android Studio Run/debug builds use the PC user's default Android debug keystore. To update the currently installed debug build, build on the same Windows account or copy and protect that exact debug keystore. A future production keystore cannot replace this debug-signed installation without a one-time migration/reinstall.

OTA SETUP
1. Host update.json and the signed APK at stable HTTPS addresses.
2. In android/app/build.gradle, replace https://example.invalid/spa-coach/update.json with the hosted update.json URL.
3. Build and install that updater-enabled APK once through Android Studio.
4. Future versions need a higher versionCode, the same applicationId/signing key, a newly hosted APK, and an updated update.json.
5. In Settings, tap CHECK FOR UPDATES. Android opens the secure APK download and asks for install confirmation.

The included update.json is a template. Replace apkUrl with the real hosted APK URL before publishing it.

V0.5 FEATURES
- Beginner onboarding
- Editable chemical inventory
- Filter rinse and drain/refill logging, schedules, and Android reminders
- Clear due/overdue retest status
- Version code 60 / version name 0.6.0
- Existing scanner, automatic pad detection, manual back/undo, saved photos, maintenance loop, and retest reminders retained

After editing root web files, run SYNC_WEB_TO_ANDROID.bat before building.
