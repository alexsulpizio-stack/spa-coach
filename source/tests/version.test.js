import test from 'node:test';
import assert from 'node:assert/strict';

import { isUnpublishedRelease } from '../scripts/verify-version.mjs';

test('a newer version code and name is an unpublished release', () => {
  assert.equal(isUnpublishedRelease('0.9.9', 99, { versionCode: 98, versionName: '0.9.8' }), true);
});

test('the already published version is not an unpublished release', () => {
  assert.equal(isUnpublishedRelease('0.9.8', 98, { versionCode: 98, versionName: '0.9.8' }), false);
});
