(() => {
  'use strict';

  const DATE_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };
  const DATE_TIME_OPTIONS = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };

  function formatDate(iso, locale, timeZone) {
    return new Intl.DateTimeFormat(locale, { ...DATE_OPTIONS, ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  }

  function formatDateTime(iso, locale, timeZone) {
    return new Intl.DateTimeFormat(locale, { ...DATE_TIME_OPTIONS, ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
  }

  function relativeTime(iso, now = Date.now()) {
    if (!iso) return 'recently';
    const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return formatDate(iso);
  }

  globalThis.SpaFormatting = Object.freeze({ formatDate, formatDateTime, relativeTime });
})();
