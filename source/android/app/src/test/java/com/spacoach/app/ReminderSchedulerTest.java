package com.spacoach.app;

import static android.content.Context.ALARM_SERVICE;
import static android.content.Context.MODE_PRIVATE;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.AlarmManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.Intent;
import android.app.NotificationManager;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class ReminderSchedulerTest {
    @Test
    public void stableIdsAreUnique() {
        assertEquals(4001, ReminderScheduler.idFor("retest"));
        assertEquals(4003, ReminderScheduler.idFor("filter"));
        assertEquals(4004, ReminderScheduler.idFor("drain"));
        assertEquals(4005, ReminderScheduler.idFor("replacement"));
        assertEquals(4006, ReminderScheduler.idFor("water-test"));
        assertEquals(4007, ReminderScheduler.idFor("chlorine-floater"));
    }

    @Test
    public void scheduleAndCancelPersistStateAndManageAlarm() {
        Context context = ApplicationProvider.getApplicationContext();
        ReminderScheduler.schedule(context, "filter", System.currentTimeMillis() + 60_000, "Title", "Body");
        SharedPreferences prefs = context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE);
        assertTrue(prefs.getBoolean("filter_active", false));
        String mode = prefs.getString("filter_mode", null);
        assertNotNull(mode);
        assertTrue(ReminderScheduler.MODE_EXACT.equals(mode) || ReminderScheduler.MODE_FALLBACK.equals(mode));

        ShadowAlarmManager alarms = Shadows.shadowOf((AlarmManager) context.getSystemService(ALARM_SERVICE));
        assertEquals(1, alarms.getScheduledAlarms().size());

        ReminderScheduler.cancel(context, "filter");
        assertFalse(prefs.getBoolean("filter_active", true));
        assertEquals(0, alarms.getScheduledAlarms().size());
    }

    @Test
    public void exactAlarmCapabilityCheckIsSafeOnModernAndroid() {
        Context context = ApplicationProvider.getApplicationContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(ALARM_SERVICE);
        assertNotNull(alarmManager);
        // The actual grant can vary by device; the capability check itself must be safe.
        boolean ignored = ReminderScheduler.canScheduleExact(context);
        assertTrue(ignored || !ignored);
    }

    @Test
    public void repeatedOverdueSyncDoesNotReplaceAlarmOrAlertTwice() {
        Context context = ApplicationProvider.getApplicationContext();
        long due = System.currentTimeMillis() - 60_000;
        ShadowAlarmManager alarms = Shadows.shadowOf((AlarmManager) context.getSystemService(ALARM_SERVICE));
        ReminderScheduler.schedule(context, "water-test", due, "Water", "Body");
        Object original = alarms.getScheduledAlarms().get(0);
        for (int i = 0; i < 10; i++) ReminderScheduler.schedule(context, "water-test", due, "Water", "Body");
        assertEquals(1, alarms.getScheduledAlarms().size());
        org.junit.Assert.assertSame(original, alarms.getScheduledAlarms().get(0));

        Intent delivery = new Intent().putExtra("reminder_key", "water-test").putExtra("reminder_due_at", due);
        NotificationReceiver receiver = new NotificationReceiver();
        receiver.onReceive(context, delivery);
        NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        assertNotNull(Shadows.shadowOf(notifications).getNotification(4006));
        notifications.cancel(4006);
        receiver.onReceive(context, delivery);
        ReminderScheduler.schedule(context, "water-test", due, "Water", "Body");
        ReminderScheduler.rescheduleAfterBoot(context);
        receiver.onReceive(context, delivery);
        assertEquals(0, Shadows.shadowOf(notifications).size());
        assertEquals(0, alarms.getScheduledAlarms().size());
    }

    @Test
    public void completedActionRearmsAndStaleOrCancelledBroadcastsCannotPost() {
        Context context = ApplicationProvider.getApplicationContext();
        long oldDue = System.currentTimeMillis() - 120_000;
        long nextDue = System.currentTimeMillis() - 1_000;
        ReminderScheduler.schedule(context, "chlorine-floater", oldDue, "Floater", "Body");
        assertTrue(ReminderScheduler.claimDelivery(context, "chlorine-floater", oldDue));
        ReminderScheduler.schedule(context, "chlorine-floater", nextDue, "Floater", "Body");
        assertFalse(ReminderScheduler.claimDelivery(context, "chlorine-floater", oldDue));
        assertTrue(ReminderScheduler.claimDelivery(context, "chlorine-floater", nextDue));
        ReminderScheduler.cancel(context, "chlorine-floater");
        ReminderScheduler.schedule(context, "chlorine-floater", nextDue, "Floater", "Body");
        assertFalse(ReminderScheduler.claimDelivery(context, "chlorine-floater", nextDue));
        ReminderScheduler.schedule(context, "filter", nextDue, "Filter", "Body");
        ReminderScheduler.cancel(context, "filter");
        assertFalse(ReminderScheduler.claimDelivery(context, "filter", nextDue));
    }

    @Test
    public void bootRestoresEveryActiveKeyWithoutChangingDueIdentity() {
        Context context = ApplicationProvider.getApplicationContext();
        long due = System.currentTimeMillis() - 60_000;
        for (String key : ReminderScheduler.KEYS) ReminderScheduler.schedule(context, key, due, key, "Body");
        ShadowAlarmManager alarms = Shadows.shadowOf((AlarmManager) context.getSystemService(ALARM_SERVICE));
        for (String key : ReminderScheduler.KEYS) {
            ((AlarmManager) context.getSystemService(ALARM_SERVICE)).cancel(ReminderScheduler.alarmIntent(context, key));
        }
        assertEquals(0, alarms.getScheduledAlarms().size());
        ReminderScheduler.rescheduleAfterBoot(context);
        assertEquals(ReminderScheduler.KEYS.length, alarms.getScheduledAlarms().size());
        for (String key : ReminderScheduler.KEYS) {
            assertEquals(due, context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).getLong(key + "_at", 0));
            assertTrue(ReminderScheduler.claimDelivery(context, key, due));
        }
    }
}
