(() => {
const DAY_MS = 86400000;

function maintenanceDueAt(lastDone, days, now = Date.now()) {
  const base = lastDone ? new Date(lastDone).getTime() : now;
  return base + Math.max(1, Number(days) || 1) * DAY_MS;
}

function maintenanceDue(lastDone, days, now = Date.now()) {
  if (!lastDone) return { label: 'Not started', level: 'neutral' };
  const daysLeft = Math.ceil((maintenanceDueAt(lastDone, days, now) - now) / DAY_MS);
  if (daysLeft < 0) return { label: `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`, level: 'bad' };
  if (daysLeft === 0) return { label: 'Due today', level: 'caution' };
  return { label: `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, level: daysLeft <= 2 ? 'caution' : 'good' };
}

function futureRelative(iso, now = Date.now()) {
  if (!iso) return 'No timer set';
  const milliseconds = new Date(iso).getTime() - now;
  if (milliseconds <= -60000) {
    const overdueMinutes = Math.floor(Math.abs(milliseconds) / 60000);
    if (overdueMinutes < 60) return `Overdue by ${overdueMinutes} min`;
    const overdueHours = Math.floor(overdueMinutes / 60);
    const remainingMinutes = overdueMinutes % 60;
    return remainingMinutes ? `Overdue by ${overdueHours} hr ${remainingMinutes} min` : `Overdue by ${overdueHours} hr`;
  }
  if (milliseconds <= 0) return 'Due now';
  const minutes = Math.ceil(milliseconds / 60000);
  if (minutes < 60) return `Retest in ${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `Retest in ${hours} hr ${remainingMinutes} min` : `Retest in ${hours} hr`;
  }
  const days = Math.ceil(minutes / 1440);
  return `Retest in ${days} day${days === 1 ? '' : 's'}`;
}

globalThis.SpaReminders = Object.freeze({ futureRelative, maintenanceDue, maintenanceDueAt });
})();
