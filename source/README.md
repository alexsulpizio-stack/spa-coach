# Spa Coach PHONE v0.9.5

Spa Coach is a local-first hot-tub water testing and maintenance coach. The browser app and Android WebView use the same canonical web source in this directory.

## New in v0.9.5

- Results, review, and history always show each pad’s sampled color next to the reading

## New in v0.9.4

- Full-resolution pad sampling, strip-plastic white balance, and CIEDE2000 chlorine matching
- Extra wet-strip prototypes including total chlorine
- Automatic tip/handle order correction and learned colors only when a reading is changed
- Weak geometry falls back to manual taps instead of forcing a low-confidence auto-read

## New in v0.9.3

- OTA manifest signatures use Android JSON quoting so Check for Updates can verify GitHub-published APKs

## New in v0.9.2

- Cache-busted, no-store OTA checks so newly published updates appear immediately
- Bounded, lower-resolution automatic pad detection with safe manual fallback
- Immutable releases with signed OTA manifests and pre-install APK identity checks
- Rollback-safe backup restore with explicit backup and state migrations
- Scanner regression fixtures and opt-in, resettable learned-color calibration
- Browser end-to-end, accessibility, Android unit, and receiver instrumentation tests
- Keyboard focus, live-region, reduced-motion, and manual-reading accessibility improvements
- Source-first CI and signed release APKs
- SHA-256 verification before an OTA APK can reach Android's installer
- Automated tests for chemistry safety, dosing, backups, and reminders
- Build-time Android asset generation and centralized versioning
- Maintenance dashboard with due and overdue status
- Editable stock levels, low-stock alerts, and product label doses
- Filter replacement reminders and logging
- Full backup and restore, including saved strip photos
- Daily silent OTA update checks plus the manual update button

- Beginner-friendly first-run onboarding.
- Editable chemical inventory used by treatment recommendations.
- Filter-rinse and drain/refill schedules, logging, due dates, and separate Android reminders.
- Clearer due/overdue maintenance status and explicit app versioning.
- Configurable HTTPS OTA update checking for future same-signature APKs.

## Retained from v0.4.0

- **Android system retest notifications** that can appear while Spa Coach is closed.
- A timed follow-up is mirrored into Android whenever you use **LOG TEST & WAIT** or log a treatment that needs a retest.
- Tapping a Spa Coach notification opens the app directly into the **Retest Water** flow.
- Pending retest reminders are restored after a phone reboot.
- Settings now shows notification permission/status plus **ENABLE PHONE REMINDERS** and **SEND TEST NOTIFICATION** in the installed Android app.
- Browser/Wi-Fi mode still works, but correctly explains that outside-app reminders require the installed Android build.
- The native Android file chooser preserves separate **Take Photo** and **Choose From Phone** behavior.
- Existing v0.3.1 automatic pad detection, manual Back-one-pad correction, saved photos, history, chemistry sanity checks, treatment prioritization and unresolved-issue tracking are retained.

## Important: two ways to run this package

### Browser/Wi-Fi test build
Run `start_phone.bat` exactly as before. This is still useful for scanner/UI testing, but it **cannot reliably notify you after the browser is closed**.

### Native Android notification build
The `android` folder contains the Android Studio project. See `ANDROID_BUILD_README.txt` for build/install instructions. Once installed, Spa Coach stores its data on the phone and no PC or local web server is needed.

## Notification timing

The Android wrapper uses a battery-friendly `AlarmManager` reminder rather than requesting special exact-alarm privileges. The notification should fire around the selected retest time, but Android can delay it slightly in deep sleep/Doze mode.

## Local-first privacy

The scanner, history, chemistry state and saved test-strip images remain local to the device. The native reminder stores only the due time and short reminder text needed to recreate the notification after a reboot.

## Safety

The strip scanner remains experimental and is not a certified water-testing instrument. Spa Coach is intentionally conservative about rejected/uncertain pads and blocks treatment when key chemistry is not reliable enough.

## Development

- Run browser mode with `start_phone.bat`.
- Run domain tests with `npm test`.
- Build Android from `android/` with `./gradlew :app:assembleDebug`.
- Android's `preBuild` task copies the canonical web files and `lib/` modules into generated WebView assets; do not edit `android/app/src/main/assets/www`.
- Change the app version only in `lib/version.js`.

CI builds directly from this `source/` tree. The old checked-in source ZIP is no longer used.
