// FREEZE 5: ORT restart budget (2 per 5 minutes, then the models pause) and deadlines scaled by device speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrtClient, OrtPaused, OrtTimeout, measureDeviceSpeed } from '../src/formalizer/ort-client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fake worker whose runs hang while `hang.on` is set. */
function fake(hang) {
  const log = { spawned: 0 };
  const spawn = () => {
    log.spawned++;
    let dead = false;
    const w = { onmessage: null, terminate() { dead = true; },
      postMessage(m) {
        if (dead || m.op === 'cancel' || m.op === 'release') return;
        if (m.op === 'run' && hang.on) return;
        setTimeout(() => { if (!dead) w.onmessage?.({ data: m.op === 'create' ? { id: m.id, ok: true } : { id: m.id, outputs: { out: { type: 'float32', data: Float32Array.from([1]), dims: [1] } } } }); }, 1);
      } };
    return w;
  };
  return { spawn, log };
}
const feeds = (ort) => ({ x: new ort.Tensor('float32', Float32Array.from([1]), [1]) });

test('a third restart inside the window pauses the models: calls fail fast with OrtPaused, no reload, resume() lifts it', async () => {
  const hang = { on: true };
  const { spawn, log } = fake(hang);
  let paused = null, loads = 0;
  const c = createOrtClient({ spawn, graceMs: 20, onPause: (p) => { paused = p; } });
  const s = await c.ort.InferenceSession.create(async () => { loads++; return new Uint8Array(4); }, { name: 't' });
  for (let i = 0; i < 2; i++) {
    await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 10 }), OrtTimeout);
    for (let k = 0; k < 100 && c.restarts < i + 1; k++) await sleep(10);
    assert.equal(c.restarts, i + 1);
  }
  assert.equal(c.paused, null);
  const loadsBefore = loads;
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 10 }), OrtTimeout);
  for (let k = 0; k < 100 && !c.paused; k++) await sleep(10);
  assert.ok(c.paused, 'the third restart paused the models');
  assert.ok(paused.reason.includes('2 worker restarts'));
  assert.equal(c.restarts, 2);
  assert.equal(c.stats.pauses, 1);
  assert.equal(loads, loadsBefore, 'no session reload while paused');
  const spawned = log.spawned;
  await assert.rejects(s.run(feeds(c.ort)), OrtPaused);
  await assert.rejects(c.ort.InferenceSession.create(new Uint8Array(4)), OrtPaused);
  assert.equal(log.spawned, spawned, 'no worker is started while paused');
  hang.on = false;
  c.resume();
  assert.equal(c.paused, null);
  assert.equal((await s.run(feeds(c.ort))).out.data[0], 1);
});

test('restarts older than the window do not count', async () => {
  const hang = { on: true };
  const { spawn } = fake(hang);
  let t = 0;
  const c = createOrtClient({ spawn, graceMs: 20, now: () => t, restartBudget: { max: 1, windowMs: 1000 } });
  const s = await c.ort.InferenceSession.create(async () => new Uint8Array(4), { name: 't' });
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 10 }), OrtTimeout);
  for (let k = 0; k < 100 && c.restarts < 1; k++) await sleep(10);
  t += 5000;
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 10 }), OrtTimeout);
  for (let k = 0; k < 100 && c.restarts < 2; k++) await sleep(10);
  assert.equal(c.restarts, 2);
  assert.equal(c.paused, null);
});

test('deadlines and grace are multiplied by the device speed factor', async () => {
  const hang = { on: true };
  const { spawn } = fake(hang);
  const c = createOrtClient({ spawn, graceMs: 20, speed: 5 });
  const s = await c.ort.InferenceSession.create(new Uint8Array(4), { name: 't' });
  const t0 = Date.now();
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 20 }), OrtTimeout);
  assert.ok(Date.now() - t0 >= 90, 'a 20 ms deadline at speed 5 is 100 ms');
  assert.equal(c.speed, 5);
});

test('measureDeviceSpeed gives a factor between 1 and 8', () => {
  const v = measureDeviceSpeed();
  assert.ok(v >= 1 && v <= 8);
});
