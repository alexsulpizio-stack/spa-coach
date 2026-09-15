(() => {
const APP_VERSION = '0.10.21';
const VERSION_CODE = 124;
const CACHE_NAME = `spa-coach-phone-v${APP_VERSION}`;

globalThis.SpaVersion = Object.freeze({ APP_VERSION, VERSION_CODE, CACHE_NAME });
})();
