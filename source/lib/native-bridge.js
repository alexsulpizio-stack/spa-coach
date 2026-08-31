(() => {
function createNativeBridge(hostWindow) {
  function get() {
    return typeof hostWindow.SpaNative === 'undefined' ? null : hostWindow.SpaNative;
  }
  function isNativeApp() {
    try { return Boolean(get()?.isNativeApp()); } catch (_) { return false; }
  }
  function notificationPermission() {
    try { return get()?.getNotificationPermission?.() || 'unavailable'; } catch (_) { return 'unavailable'; }
  }
  return Object.freeze({ get, isNativeApp, notificationPermission });
}

globalThis.SpaNativeBridge = Object.freeze({ createNativeBridge });
})();
