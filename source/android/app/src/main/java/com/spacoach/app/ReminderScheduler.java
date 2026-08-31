package com.spacoach.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public final class ReminderScheduler {
    static final String PREFS = "spa_reminders";
    static final String[] KEYS = {"retest", "filter", "drain", "replacement"};
    private ReminderScheduler() {}
    static int idFor(String key) { return "filter".equals(key) ? 4003 : "drain".equals(key) ? 4004 : "replacement".equals(key) ? 4005 : 4001; }
    public static void schedule(Context context, String key, long atMillis, String title, String body) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(key+"_active",true)
            .putLong(key+"_at",atMillis).putString(key+"_title",title).putString(key+"_body",body).apply();
        AlarmManager am=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi=alarmIntent(context,key); am.cancel(pi);
        long when=Math.max(System.currentTimeMillis()+1500L,atMillis);
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.M) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi); else am.set(AlarmManager.RTC_WAKEUP,when,pi);
    }
    public static void cancel(Context context,String key) {
        ((AlarmManager)context.getSystemService(Context.ALARM_SERVICE)).cancel(alarmIntent(context,key));
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean(key+"_active",false).apply();
    }
    public static void rescheduleAfterBoot(Context context) {
        SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        for(String key:KEYS) if(p.getBoolean(key+"_active",false)) schedule(context,key,
            Math.max(p.getLong(key+"_at",0L),System.currentTimeMillis()+3000L),p.getString(key+"_title","Spa Coach reminder"),p.getString(key+"_body","Open Spa Coach for your next step."));
    }
    static PendingIntent alarmIntent(Context context,String key) {
        Intent i=new Intent(context,NotificationReceiver.class); i.setAction("com.spacoach.app.REMINDER_"+key); i.putExtra("reminder_key",key);
        return PendingIntent.getBroadcast(context,idFor(key),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
}
