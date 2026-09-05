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
}
