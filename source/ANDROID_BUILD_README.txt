SPA COACH v0.9.0 - ANDROID + SIGNED OTA BUILD

OPEN AND BUILD
1. Open the android folder in Android Studio.
2. Let Gradle sync finish, connect the phone, and click Run.
3. Android updates com.spacoach.app in place when the signing key matches. Do not uninstall first.
4. Gradle copies the canonical web files from source/ into the APK before every build.

COMMAND LINE BUILDS
- Development: cd android && ./gradlew :app:assembleDebug
- Signed release: CI runs :app:assembleRelease with the SPA_COACH_* signing secrets.
- Domain tests: npm test from this source directory.

DATA PRESERVATION
The applicationId remains com.spacoach.app. The web storage origin, localStorage key, and IndexedDB photo database are unchanged. An in-place, same-signature update retains the profile, history, photos, inventory, and pending work. Android refuses an update signed by a different key rather than silently deleting data.

SIGNING
Android Studio Run/debug builds use the computer user's default Android debug keystore. Published release builds use the protected CI keystore. Existing installs can only be updated by an APK signed with the same key. Never rotate the release keystore without a migration plan.

RELEASING AND VERSIONING
1. Change APP_VERSION and VERSION_CODE only in lib/version.js.
2. Merge to main. CI tests the domain logic, generates WebView assets, and builds a signed release APK.
3. CI refuses to replace an existing release, publishes Spa-Coach-v<version>.apk once, and signs the root update.json with the APK signing key.
4. Keep applicationId and the release signing key unchanged.

VERIFIED OTA UPDATES
Settings > Check for Updates fetches the HTTPS manifest. Spa Coach verifies the manifest with the public key from its own installed signing certificate, downloads the APK into private cache storage, checks its SHA-256 digest, package name, version, and signing certificate, and only then opens Android's installer. Android may first ask the user to allow Spa Coach to install unknown apps.

WEB ASSETS
Edit the files in source/ and source/lib/. Do not edit android/app/src/main/assets/www because it is generated and ignored by Git. Any Android build runs :app:syncWebAssets automatically. On Windows, SYNC_WEB_TO_ANDROID.bat can run that task explicitly.
