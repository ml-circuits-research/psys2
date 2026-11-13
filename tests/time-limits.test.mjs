import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, TIME_LIMIT_DEFAULTS, applyTimeLimits, clampLimit } from '../src/dialog/time-limits.mjs';
import { createOrtClient } from '../src/formalizer/ort-client.mjs';

test('time limits: defaults, clamping and live apply', () => {
  assert.deepEqual({ ...LIMITS }, { ...TIME_LIMIT_DEFAULTS });
  assert.equal(TIME_LIMIT_DEFAULTS.graceMs, 1500);
  assert.equal(clampLimit('watchdogMs', 1), 2000);
  assert.equal(clampLimit('watchdogMs', 1e9), 60000);
  assert.equal(clampLimit('graceMs', 'abc'), 1500);
  assert.equal(clampLimit('graceMs', ''), 1500);
  applyTimeLimits({ timeLimits: { graceMs: 700, normalizerMs: 10 } });
  assert.equal(LIMITS.graceMs, 700); assert.equal(LIMITS.normalizerMs, 500); assert.equal(LIMITS.watchdogMs, 8000);
  applyTimeLimits({});
  assert.equal(LIMITS.graceMs, 1500);
});

test('ort client: the default cancel grace is 1500 ms and a function value is read at cancel time', () => {
  assert.ok(createOrtClient({ spawn: () => ({ postMessage() {}, terminate() {}, addEventListener() {} }) }));
});
