(() => {
const APP_VERSION = '0.10.8';
const VERSION_CODE = 111;
const CACHE_NAME = `spa-coach-phone-v${APP_VERSION}`;

globalThis.SpaVersion = Object.freeze({ APP_VERSION, VERSION_CODE, CACHE_NAME });
})();
