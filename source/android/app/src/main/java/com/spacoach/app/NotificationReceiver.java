package com.spacoach.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class NotificationReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "spa_retests";
    public static final int TEST_ID = 4002;

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences p = context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
        String key = intent.getStringExtra("reminder_key");
        if (key == null) key = "retest";
        String title = p.getString(key + "_title", "Spa Coach reminder");
        String body = p.getString(key + "_body", "Open Spa Coach for your next step.");
        post(context, title, body, ReminderScheduler.idFor(key), true);
        p.edit().putBoolean(key + "_active", false).apply();
    }

    public static void post(Context context, String title, String body, int notificationId, boolean finishRetest) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Spa retest reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Water-test and maintenance follow-up reminders from Spa Coach");
            nm.createNotificationChannel(channel);
        }

        Intent launch = new Intent(context, MainActivity.class);
        launch.setAction("com.spacoach.app.OPEN_RETEST");
        launch.putExtra("spa_action", "retest");
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setPriority(Notification.PRIORITY_HIGH)
            .setCategory(Notification.CATEGORY_REMINDER);

        boolean posted = false;
        try {
            nm.notify(notificationId, b.build());
            posted = true;
        } catch (SecurityException ignored) {}
        if (finishRetest && posted) {
            // The key-specific active flag is cleared by onReceive.
        }
    }
}
