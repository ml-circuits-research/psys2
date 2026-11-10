// Dedicated onnxruntime-web worker (HANG2): runs the dispatcher and normalizer sessions off the page thread, single-threaded WASM, no COOP/COEP.
// Protocol with lib/formalizer/ort-client.mjs: { op: 'create' | 'run' | 'cancel' | 'release', id, ... } -> { id, outputs | error | cancelled }.
// Jobs run one at a time, in order. A queued job is dropped on `cancel`; a job that is running cannot be interrupted (WASM is synchronous),
// so the client terminates this worker when it does not finish within the grace period and starts a new one.
import * as ort from '../vendor/onnxruntime/ort.wasm.bundle.min.mjs';

ort.env.wasm.wasmPaths = new URL('../vendor/onnxruntime/', import.meta.url).href;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const sessions = new Map();
const queue = [];
const cancelled = new Set();
let draining = false;

const copyOut = (t) => { const data = new t.data.constructor(t.data); return { type: t.type, data, dims: [...t.dims] }; };
const toTensor = (f) => new ort.Tensor(f.type, f.data, f.dims);

async function exec(m) {
  if (m.op === 'create') {
    sessions.set(m.sid, await ort.InferenceSession.create(m.bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', ...(m.opts ?? {}) }));
    return { id: m.id, ok: true };
  }
  const s = sessions.get(m.sid);
  if (!s) throw new Error('unknown session');
  const feeds = {};
  for (const [k, v] of Object.entries(m.feeds)) feeds[k] = toTensor(v);
  const out = await (Array.isArray(m.fetch) && m.fetch.length ? s.run(feeds, m.fetch) : s.run(feeds));   // `fetch`: only the outputs the caller needs are computed and copied back
  const outputs = {}, transfer = [];
  for (const [k, v] of Object.entries(out)) { outputs[k] = copyOut(v); transfer.push(outputs[k].data.buffer); }
  return { id: m.id, outputs, transfer };
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const m = queue.shift();
    if (cancelled.delete(m.id)) { postMessage({ id: m.id, cancelled: true }); continue; }
    try {
      const { transfer, ...res } = await exec(m);
      postMessage(res, transfer ?? []);
    } catch (e) { postMessage({ id: m.id, error: String(e?.message ?? e) }); }
  }
  draining = false;
}

onmessage = (ev) => {
  const m = ev.data;
  if (m.op === 'cancel') { if (queue.some((q) => q.id === m.id)) cancelled.add(m.id); return; }
  if (m.op === 'release') { sessions.delete(m.sid); return; }
  queue.push(m);
  drain();
};
