(() => {
function formatMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 'later';
  if (value < 60) return `${value} min`;
  if (value === 60) return '1 hour';
  if (value < 1440 && value % 60 === 0) return `${value / 60} hours`;
  if (value === 1440) return '1 day';
  return `${Math.round(value / 60)} hours`;
}

function makeFollowUp(id, at, plan, issues, options = {}) {
  if (!plan || plan.action === 'none') return null;
  const delay = options.delayMinutes;
  const treatmentSkipped = Boolean(options.treatmentSkipped);
  if (treatmentSkipped && plan.action === 'dose') {
    return {
      sourceTestId: id, createdAt: at, dueAt: null, kind: 'action',
      title: `Still needs attention: ${plan.title}`, focus: plan.focus || 'water chemistry',
      reason: 'The test was logged, but the recommended treatment was not marked complete.',
      unresolvedIssues: issues
    };
  }
  const dueAt = Number.isFinite(delay) && delay > 0
    ? new Date(new Date(at).getTime() + delay * 60000).toISOString()
    : null;
  return {
    sourceTestId: id, createdAt: at, dueAt, kind: 'retest',
    title: plan.followUpTitle || 'Retest water', focus: plan.focus || 'water chemistry',
    reason: plan.action === 'wait'
      ? 'Waiting before making another adjustment.'
      : plan.action === 'dose'
        ? 'Confirm the water response before another dose.'
        : 'Confirm the reading before the next adjustment.',
    unresolvedIssues: issues
  };
}

globalThis.SpaFollowUp = Object.freeze({ formatMinutes, makeFollowUp });
})();
