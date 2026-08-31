package com.spacoach.app;

import static android.content.Context.ALARM_SERVICE;
import static android.content.Context.MODE_PRIVATE;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.AlarmManager;
import android.content.Context;

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
        assertTrue(context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).getBoolean("filter_active", false));
        ShadowAlarmManager alarms = Shadows.shadowOf((AlarmManager) context.getSystemService(ALARM_SERVICE));
        assertEquals(1, alarms.getScheduledAlarms().size());

        ReminderScheduler.cancel(context, "filter");
        assertFalse(context.getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).getBoolean("filter_active", true));
        assertEquals(0, alarms.getScheduledAlarms().size());
    }
}
