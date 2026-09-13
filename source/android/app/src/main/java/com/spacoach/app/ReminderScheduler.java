package com.spacoach.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public final class ReminderScheduler {
    static final String PREFS = "spa_reminders";
    static final String[] KEYS = {"retest", "filter", "drain", "replacement", "water-test", "chlorine-floater"};
    static final String MODE_EXACT = "exact";
    static final String MODE_FALLBACK = "allow-while-idle";

    private ReminderScheduler() {}

    static int idFor(String key) {
        if ("water-test".equals(key)) return 4006;
        if ("chlorine-floater".equals(key)) return 4007;
        return "filter".equals(key) ? 4003 : "drain".equals(key) ? 4004 : "replacement".equals(key) ? 4005 : 4001;
    }

    public static boolean canScheduleExact(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return am != null && am.canScheduleExactAlarms();
    }

    public static synchronized void schedule(Context context, String key, long atMillis, String title, String body) {
        schedule(context, key, atMillis, title, body, false);
    }

    private static void schedule(Context context, String key, long atMillis, String title, String body, boolean force) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (atMillis <= 0) return;
        if (prefs.getLong(key + "_delivered_at", Long.MIN_VALUE) == atMillis) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        boolean unchanged = prefs.getBoolean(key + "_active", false)
            && prefs.getLong(key + "_at", 0L) == atMillis;
        // Content may change without changing the reminder's identity.
        prefs.edit().putString(key + "_title", title).putString(key + "_body", body).apply();
        if (unchanged && !force) return;
        prefs.edit().putBoolean(key + "_active", true)
            .putLong(key + "_at", atMillis)
            .putString(key + "_title", title)
            .putString(key + "_body", body)
            .apply();

        PendingIntent pi = alarmIntent(context, key);
        am.cancel(pi);
        long when = Math.max(System.currentTimeMillis() + 1500L, atMillis);

        String mode;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && canScheduleExact(context)) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            mode = MODE_EXACT;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
            mode = MODE_FALLBACK;
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, when, pi);
            mode = MODE_EXACT;
        }
        prefs.edit().putString(key + "_mode", mode).apply();
    }

    public static synchronized void cancel(Context context, String key) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(context, key));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(key + "_active", false)
            .apply();
    }

    public static synchronized void rescheduleAfterBoot(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        for (String key : KEYS) {
            if (p.getBoolean(key + "_active", false)) {
                schedule(
                    context,
                    key,
                    p.getLong(key + "_at", 0L),
                    p.getString(key + "_title", "Spa Coach reminder"),
                    p.getString(key + "_body", "Open Spa Coach for your next step."),
                    true
                );
            }
        }
    }

    // Persist before posting: duplicate broadcasts, app syncs, and reboot cannot
    // alert again for this occurrence. A new completion/due time re-arms it.
    static synchronized boolean claimDelivery(Context context, String key, long dueAt) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!p.getBoolean(key + "_active", false)
                || p.getLong(key + "_at", 0L) != dueAt
                || dueAt > System.currentTimeMillis()
                || p.getLong(key + "_delivered_at", Long.MIN_VALUE) == dueAt) return false;
        boolean saved = p.edit().putLong(key + "_delivered_at", dueAt)
            .putBoolean(key + "_active", false).commit();
        if (saved) {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(alarmIntent(context, key));
        }
        return saved;
    }

    static PendingIntent alarmIntent(Context context, String key) {
        Intent i = new Intent(context, NotificationReceiver.class);
        i.setAction("com.spacoach.app.REMINDER_" + key);
        i.putExtra("reminder_key", key);
        i.putExtra("reminder_due_at", context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(key + "_at", 0L));
        return PendingIntent.getBroadcast(
            context,
            idFor(key),
            i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
