package com.spacoach.app;

import static android.content.Context.MODE_PRIVATE;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ReceiverInstrumentationTest {
    @Test
    public void bootReceiverKeepsActiveReminderScheduled() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).edit()
                .putBoolean("filter_active", true)
                .putLong("filter_at", System.currentTimeMillis() + 60_000)
                .apply();
        new BootReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertTrue(context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).getBoolean("filter_active", false));
        ReminderScheduler.cancel(context, "filter");
    }

    @Test
    public void notificationReceiverClearsDeliveredReminder() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).edit().putBoolean("retest_active", true).apply();
        new NotificationReceiver().onReceive(context, new Intent(context, NotificationReceiver.class).putExtra("reminder_key", "retest"));
        assertFalse(context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).getBoolean("retest_active", true));
    }
}
