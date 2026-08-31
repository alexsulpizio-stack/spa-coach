package com.spacoach.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

public class SpaBridge {
    private final MainActivity activity;
    private final SharedPreferences prefs;

    SpaBridge(MainActivity activity) {
        this.activity = activity;
        this.prefs = activity.getSharedPreferences("spa_native", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public boolean isNativeApp() { return true; }

    @JavascriptInterface
    public String getAppVersion() { return BuildConfig.VERSION_NAME; }

    @JavascriptInterface
    public String getNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return "granted";
        return prefs.getBoolean("notification_permission_asked", false) ? "denied" : "prompt";
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        prefs.edit().putBoolean("notification_permission_asked", true).apply();
        activity.runOnUiThread(activity::requestNotificationPermissionIfNeeded);
    }

    @JavascriptInterface
    public void scheduleReminder(String key, long atMillis, String title, String body) {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                prefs.edit().putBoolean("notification_permission_asked", true).apply();
                activity.requestNotificationPermissionIfNeeded();
            }
            ReminderScheduler.schedule(activity, key, atMillis, title, body);
        });
    }

    @JavascriptInterface
    public void cancelReminder(String key) {
        activity.runOnUiThread(() -> ReminderScheduler.cancel(activity, key));
    }

    @JavascriptInterface
    public void sendTestNotification() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                prefs.edit().putBoolean("notification_permission_asked", true).apply();
                activity.requestNotificationPermissionIfNeeded();
                return;
            }
            NotificationReceiver.post(
                activity,
                "Spa Coach test reminder",
                "Phone reminders are working. Tap to open Spa Coach.",
                NotificationReceiver.TEST_ID,
                false
            );
        });
    }

    @JavascriptInterface
    public void checkForUpdates() { activity.checkForUpdates(); }

    @JavascriptInterface
    public void checkForUpdatesSilently() { activity.checkForUpdates(false); }

    @JavascriptInterface
    public void saveBackup(String json, String filename) {
        activity.runOnUiThread(() -> activity.saveBackup(json, filename));
    }

    @JavascriptInterface
    public void shareBackup(String json, String filename) {
        activity.runOnUiThread(() -> activity.shareBackup(json, filename));
    }
}
