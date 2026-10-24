(() => {
const APP_VERSION = '0.10.12';
const VERSION_CODE = 115;
const CACHE_NAME = `spa-coach-phone-v${APP_VERSION}`;

globalThis.SpaVersion = Object.freeze({ APP_VERSION, VERSION_CODE, CACHE_NAME });
})();
