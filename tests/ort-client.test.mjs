import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatcherFormalizer } from '../src/dialog/encoder-dispatch.mjs';
import { createOrtClient, OrtTimeout, OrtAborted } from '../src/formalizer/ort-client.mjs';
import { createNormalizerRuntime } from '../src/dialog/normalizer-runtime.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A fake ORT worker (the real one is docs/webchat/ui/ort-worker.mjs). Runs one job at a time like the real one; `script(job)` decides what a run
 * does: 'ok' answers after `ms`, 'hang' never answers (a blocked WASM call), 'stuck-then-ok' answers after a long time.
 */
function fakeWorkerFactory(script = () => ({ kind: 'ok', ms: 1 })) {
  const log = { spawned: 0, terminated: 0, creates: 0, runs: 0, cancels: [] };
  const spawn = () => {
    log.spawned++;
    let dead = false, busyUntil = Promise.resolve();
    const w = {
      onmessage: null,
      terminate() { dead = true; log.terminated++; },
      postMessage(m) {
        if (dead) return;
        const reply = (r) => { if (!dead) w.onmessage?.({ data: r }); };
        if (m.op === 'cancel') { log.cancels.push(m.id); return; }
        if (m.op === 'release') return;
        if (m.op === 'create') { log.creates++; busyUntil = busyUntil.then(() => sleep(1)).then(() => reply({ id: m.id, ok: true })); return; }
        log.runs++;
        const job = { ...m, n: log.runs };
        busyUntil = busyUntil.then(async () => {
          const b = script(job);
          if (b.kind === 'hang') return new Promise(() => {});
          await sleep(b.ms ?? 1);
          reply({ id: m.id, outputs: { out: { type: 'float32', data: Float32Array.from([job.n]), dims: [1] } } });
        });
      },
    };
    return w;
  };
  return { spawn, log };
}
const feeds = (ort) => ({ x: new ort.Tensor('float32', Float32Array.from([1, 2]), [2]) });

test('ort client: a run returns tensors and the same input tensor can be fed again (no detached buffers)', async () => {
  const { spawn } = fakeWorkerFactory();
  const c = createOrtClient({ spawn });
  const s = await c.ort.InferenceSession.create(new Uint8Array(4), { name: 't' });
  const f = feeds(c.ort);
  const a = await s.run(f), b = await s.run(f);
  assert.equal(a.out.data[0], 1); assert.equal(b.out.data[0], 2);
  assert.equal(f.x.data.buffer.byteLength, 8);
});

test('ort client: a deadline rejects the call, a worker that finishes within 300 ms is kept', async () => {
  const { spawn, log } = fakeWorkerFactory((j) => (j.n === 1 ? { kind: 'ok', ms: 120 } : { kind: 'ok', ms: 1 }));
  const c = createOrtClient({ spawn, graceMs: 300 });
  const s = await c.ort.InferenceSession.create(new Uint8Array(4), { name: 't' });
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 30 }), OrtTimeout);
  await sleep(200);
  assert.equal(log.spawned, 1); assert.equal(c.restarts, 0);
  assert.deepEqual(log.cancels.length, 1);
  assert.equal((await s.run(feeds(c.ort))).out.data[0], 2);
});

test('ort client: a hung worker is terminated and re-created after the grace period; sessions reload from their source and the next call works', async () => {
  const { spawn, log } = fakeWorkerFactory((j) => (j.n === 1 ? { kind: 'hang' } : { kind: 'ok', ms: 1 }));
  const c = createOrtClient({ spawn, graceMs: 300 });
  let loads = 0;
  const s = await c.ort.InferenceSession.create(async () => { loads++; return new Uint8Array(4); }, { name: 't' });
  const t0 = Date.now();
  await assert.rejects(s.run(feeds(c.ort), { deadlineMs: 50 }), OrtTimeout);
  await sleep(450);
  assert.equal(c.restarts, 1); assert.equal(log.spawned, 2); assert.equal(log.terminated, 1);
  assert.ok(Date.now() - t0 < 1200);
  assert.equal(loads, 2, 'the session source was read again');
  assert.equal((await s.run(feeds(c.ort))).out.data[0], 2);
});

test('ort client: an abort signal cancels the call; a queued job is dropped, other lanes are untouched', async () => {
  const { spawn, log } = fakeWorkerFactory((j) => (j.n === 1 ? { kind: 'hang' } : { kind: 'ok', ms: 1 }));
  const c = createOrtClient({ spawn, graceMs: 100 });
  const a = await c.ort.InferenceSession.create(async () => new Uint8Array(4), { name: 'a', lane: 'a' });
  const b = await c.ort.InferenceSession.create(async () => new Uint8Array(4), { name: 'b', lane: 'b' });
  const ctl = new AbortController();
  const p = a.run(feeds(c.ort), { signal: ctl.signal, deadlineMs: 5000 });
  const q = assert.rejects(p, OrtAborted);
  await sleep(10);
  ctl.abort();
  await q;
  assert.equal((await b.run(feeds(c.ort))).out.data[0] > 0, true, 'the other lane keeps answering while lane a recovers');
  await sleep(250);
  assert.equal(c.restarts, 1);
  assert.equal(log.spawned, 3);
  assert.ok((await a.run(feeds(c.ort))).out.data[0] > 0);
});

test('normalizer runtime: decoding stops at input length x 1.5 + 8 steps and at its deadline', async () => {
  let decoderRuns = 0;
  const tokenizer = { model: { vocab: [['<pad>', 0], ['</s>', 0], ['<unk>', 0], ['▁a', -1], ['▁b', -1]], unk_id: 2 } };
  const ort = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } } };
  const mk = () => {
    const encoder = { run: async () => { const o = {}; for (let i = 0; i < 1; i++) { o[`cross_k.${i}`] = new ort.Tensor('float32', new Float32Array(4), [1, 1, 1, 4]); o[`cross_v.${i}`] = new ort.Tensor('float32', new Float32Array(4), [1, 1, 1, 4]); } return o; } };
    const decoder = { run: async () => {   // never emits </s>: the first token has a rising score, the end token never wins
      decoderRuns++;
      const logits = new Float32Array(3 * 5); for (let b = 0; b < 3; b++) { logits[b * 5 + 3] = 5; logits[b * 5 + 1] = -100; }
      return { logits: new ort.Tensor('float32', logits, [3, 5]), 'new_self_k.0': new ort.Tensor('float32', new Float32Array(3 * 4), [3, 1, 1, 4]), 'new_self_v.0': new ort.Tensor('float32', new Float32Array(3 * 4), [3, 1, 1, 4]) };
    } };
    return { encoder, decoder };
  };
  const { encoder, decoder } = mk();
  const nz = createNormalizerRuntime({ ort, encoder, decoder, tokenizer, config: { layers: 1, heads: 1, dKv: 4 }, maxNew: 48 });
  const n = nz.tokenizer.encode('w | t | a').length;
  await nz.propose({ world: 'w', tab: 't', text: 'a', beam: 3 });
  assert.equal(decoderRuns, Math.min(48, Math.ceil(n * 1.5) + 8));
  decoderRuns = 0;
  let t = 0;
  const nz2 = createNormalizerRuntime({ ort, encoder, decoder, tokenizer, config: { layers: 1, heads: 1, dKv: 4 }, deadlineMs: 5, now: () => (t += 3) });
  await assert.rejects(nz2.propose({ world: 'w', tab: 't', text: 'a', beam: 3 }), /deadline/);
  assert.ok(decoderRuns < 5);
});

/** The session of the HANG2 report, in a dispatcher whose model calls go through the ORT client and one of them hangs. */
const REPLAY = ['make it liek a girl', 'make a house and a man', 'draw a some clouds and 2 suns', 'show Bern city', 'get me to New Youk', 'fa ochi visatori', 'fa-i ochii mari'];

test('HANG2 replay: rules mode makes zero model calls (load, encoder runs, normalizer runs)', async () => {
  let loads = 0, runs = 0;
  const enc = createDispatcherFormalizer({ load: async () => { loads++; return { worlds: [], async predict() { runs++; throw new Error('no'); } }; }, normalizer: { async propose() { runs++; return { status: 'ready', rewrites: [] }; } } });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), formalizers: { encoder: enc } });
  enc.attach(engine);
  const session = engine.createSession({ formalizer: 'rules' });
  for (const m of REPLAY) await session.send(m);
  assert.equal(loads, 0); assert.equal(runs, 0);
});

test('HANG2 replay: a model call that hangs in the worker never costs a turn; the worker is re-created and the next messages use the model again', async () => {
  const worlds = ['kids.arith', 'games.chess', 'kids.animals'];
  const { spawn, log } = fakeWorkerFactory((j) => (j.n === 3 ? { kind: 'hang' } : { kind: 'ok', ms: 2 }));
  const c = createOrtClient({ spawn, graceMs: 300 });
  const sess = await c.ort.InferenceSession.create(async () => new Uint8Array(4), { name: 'dispatcher', deadlineMs: 150 });
  const runtime = {
    worlds,
    async predict(text) {
      await sess.run({ x: new c.ort.Tensor('float32', Float32Array.from([1]), [1]) });   // the model call of this message
      return { text, context: {}, boundaries: [], segmentations: [{ score: -0.1, segments: [{ start: 0, end: text.length, text, worlds: [{ world: 'kids.arith', score: 0.9 }] }] }] };
    },
  };
  const enc = createDispatcherFormalizer({ load: async () => runtime });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), formalizers: { encoder: enc } });
  enc.attach(engine);
  const session = engine.createSession({ formalizer: 'encoder' });
  const times = [];
  const out = [];
  for (const m of ['What is 2 plus 3', 'What is 20 divided by 4', 'What is 7 times 6', 'What is 9 minus 4', 'What is 1 plus 1']) {
    const t = Date.now(); out.push((await session.send(m)).text); times.push(Date.now() - t);
  }
  for (let i = 0; i < 50 && c.restarts < 1; i++) await sleep(100);   // the grace timer may be late on a busy machine
  assert.match(out[2], /42/);                                 // the hung call: answered by the rules
  assert.ok(times.every((t) => t < 2000), `every turn answered quickly: ${times}`);
  assert.equal(c.restarts, 1);
  assert.ok(log.runs >= 5, 'the model was called again after the restart');
});

test('ort client: the `fetch` option reaches the worker (only the named outputs are computed and copied)', async () => {
  const seen = [];
  const { spawn } = fakeWorkerFactory((job) => { seen.push(job.fetch ?? null); return { kind: 'ok', ms: 1 }; });
  const c = createOrtClient({ spawn, defaultDeadlineMs: 500 });
  const s = await c.ort.InferenceSession.create(new Uint8Array(4), { name: 't' });
  await s.run(feeds(c.ort), { fetch: ['seg_logits'] });
  await s.run(feeds(c.ort));
  assert.deepEqual(seen, [['seg_logits'], null]);
});
