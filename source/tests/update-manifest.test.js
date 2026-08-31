import test from 'node:test';
import assert from 'node:assert/strict';

import { canonical } from '../scripts/canonicalize-update-manifest.mjs';

test('OTA canonical JSON escapes solidus the way Android phones verify', () => {
  const payload = {
    versionCode: 92,
    versionName: '0.9.2',
    packageName: 'com.spacoach.app',
    apkUrl: 'https://github.com/alexsulpizio-stack/spa-coach/releases/download/v0.9.2/Spa-Coach-v0.9.2.apk',
    apkSha256: '995ce68c5a980eb6cdfad04f34da3c62ec5c2fbbe6dfa1f2b357b828c8f5cdf1',
    signingCertSha256: '2fdaca693d5d6a3f20a470ee64c20f300dd70649d80a3fad2820eb1b81e2d810',
    notes: 'Automated Spa Coach Android release v0.9.2.',
    signature: { alg: 'RS256', value: 'ignored' }
  };
  delete payload.signature;
  const actual = canonical(payload);
  assert.equal(
    actual,
    '{"apkSha256":"995ce68c5a980eb6cdfad04f34da3c62ec5c2fbbe6dfa1f2b357b828c8f5cdf1","apkUrl":"https:\\/\\/github.com\\/alexsulpizio-stack\\/spa-coach\\/releases\\/download\\/v0.9.2\\/Spa-Coach-v0.9.2.apk","notes":"Automated Spa Coach Android release v0.9.2.","packageName":"com.spacoach.app","signingCertSha256":"2fdaca693d5d6a3f20a470ee64c20f300dd70649d80a3fad2820eb1b81e2d810","versionCode":92,"versionName":"0.9.2"}'
  );
  assert.match(actual, /https:\\\/\\\//);
});
