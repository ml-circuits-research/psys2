// The watchdog and Stop end the turn, not the engine worker: a worker that ends the aborted request by itself (at its next turn-guard
// check) keeps running, with the reader loaded in it; only a request still running at the runaway limit gets the worker terminated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineClient } from '../docs/webchat/ui/engine-client.mjs';

function fakeWorkers({ answerAbortAfterMs }) {
  const workers = [];
  const spawn = () => {
    const w = { terminated: false, sends: new Map(), onmessage: null,
      reply(id, ok, value) { if (!this.terminated) this.onmessage?.({ data: { type: 'res', id, ok, ...(ok ? { value } : { error: value }) } }); },
      postMessage(m) {
        if (m.op === 'init') setTimeout(() => this.reply(m.id, true, { state: {}, meta: null }), 1);
        else if (m.op === 'send') this.sends.set(m.id, m);
        else if (m.op === 'abort' && answerAbortAfterMs != null) setTimeout(() => this.reply(m.id, false, { name: 'TurnAborted', reason: m.reason, stage: 'execute' }), answerAbortAfterMs);
      },
      terminate() { this.terminated = true; } };
    workers.push(w);
    return w;
  };
  return { spawn, workers };
}

const client = (spawn, runawayMs) => createEngineClient({ base: 'http://x/', spawn, getSettings: () => ({}), getTab: () => 'draw', limits: { watchdogMs: 8000, runawayMs, startMs: 5000 } });

test('an aborted turn that the worker ends late (beyond the old 300 ms grace) does not restart the worker', async () => {
  const { spawn, workers } = fakeWorkers({ answerAbortAfterMs: 700 });
  const c = client(spawn, 3000);
  await c.boot({});
  const ctl = new AbortController();
  const p = c.session.send('draw a big house', { signal: ctl.signal });
  setTimeout(() => ctl.abort(new DOMException('turn time limit', 'TimeoutError')), 20);
  await assert.rejects(p, (e) => e.name === 'TurnAborted' && e.reason === 'timeout');
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, false);
  assert.equal(c.stats.kills.length, 0);
  assert.equal(c.isBad('draw a big house'), false);   // not remembered as a known-slow input: it may be asked again
  c.destroy();
});

test('with a runaway limit set, a request still running at it gets the worker terminated and replaced', async () => {
  const { spawn, workers } = fakeWorkers({ answerAbortAfterMs: null });
  const c = client(spawn, 1000);
  await c.boot({});
  const ctl = new AbortController();
  const p = c.session.send('loop forever', { signal: ctl.signal });
  setTimeout(() => ctl.abort(new DOMException('stopped', 'AbortError')), 20);
  const t0 = Date.now();
  await assert.rejects(p, (e) => e.name === 'TurnAborted' && e.reason === 'stopped');
  assert.ok(Date.now() - t0 >= 900, 'killed only at the runaway limit');
  assert.equal(workers[0].terminated, true);
  assert.equal(c.stats.kills.length, 1);
  assert.equal(workers.length, 2);
  c.destroy();
});

test('by default (runaway limit 0) a stopped request is never killed: the worker and its reader stay', async () => {
  const { spawn, workers } = fakeWorkers({ answerAbortAfterMs: 1500 });
  const c = createEngineClient({ base: 'http://x/', spawn, getSettings: () => ({}), getTab: () => 'draw', limits: { watchdogMs: 60000, runawayMs: 0, startMs: 5000 } });
  await c.boot({});
  const ctl = new AbortController();
  const p = c.session.send('slow', { signal: ctl.signal });
  setTimeout(() => ctl.abort(new DOMException('stopped', 'AbortError')), 20);
  await assert.rejects(p, (e) => e.name === 'TurnAborted' && e.reason === 'stopped');
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, false);
  assert.equal(c.stats.kills.length, 0);
  c.destroy();
});
