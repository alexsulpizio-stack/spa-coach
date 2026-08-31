# Spa Coach PHONE v0.6.0

This upgrade keeps the working v0.3.1 scanner/maintenance loop and adds a native Android shell for real device notifications.

## New in v0.6.0

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
