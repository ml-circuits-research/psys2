/**
 * Reusable sharding over worker_threads for the evaluation scripts.
 *
 *   defaultJobs()                    os.availableParallelism() (all cores)
 *   parseJobs(argv, dflt?)           value of `--jobs N` (integer >= 1) or the default
 *   runSharded({ file, items, jobs, workerData, chunk })
 *                                    main side: starts min(jobs, chunks) workers running `file` (the script itself),
 *                                    feeds them chunks of `items` on demand, returns the results in the ORIGINAL item order.
 *   serveShard(init)                 worker side, call at module top level when !isMainThread:
 *                                    `init(workerData)` runs once per worker (load engine / ONNX session) and returns
 *                                    `async (item, index) => result`.
 *
 * Items and results must be structured-cloneable. A worker error rejects the whole run and terminates all workers.
 * Typical use:
 *   if (!isMainThread) serveShard(async (wd) => { const env = await setup(wd); return (item) => handle(env, item); });
 *   const results = await runSharded({ file: fileURLToPath(import.meta.url), items, jobs, workerData });
 */
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData as wdata } from 'node:worker_threads';

export const defaultJobs = () => (availableParallelism ? availableParallelism() : 1);

export function parseJobs(argv = process.argv, dflt = defaultJobs()) {
  const i = argv.indexOf('--jobs');
  if (i < 0) return dflt;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--jobs expects an integer >= 1 (got ${argv[i + 1]})`);
  return n;
}

export async function runSharded({ file, items, jobs, workerData = {}, chunk }) {
  const results = new Array(items.length);
  if (!items.length) return results;
  const size = chunk ?? Math.max(1, Math.min(16, Math.ceil(items.length / (jobs * 8))));
  const nChunks = Math.ceil(items.length / size);
  let next = 0, doneItems = 0;
  await new Promise((res, rej) => {
    const workers = [];
    const stop = () => workers.forEach((w) => w.terminate());
    const feed = (w) => {
      if (next >= nChunks) return;
      const start = next++ * size;
      w.postMessage({ start, items: items.slice(start, start + size) });
    };
    for (let i = 0; i < Math.min(jobs, nChunks); i++) {
      const w = new Worker(file, { workerData: { ...workerData, __shard: true } });
      workers.push(w);
      w.on('message', (m) => {
        if (m.ready) return feed(w);
        if (m.error) { stop(); return rej(new Error(m.error)); }
        m.results.forEach((r, k) => { results[m.start + k] = r; });
        doneItems += m.results.length;
        if (doneItems === items.length) { stop(); res(); } else feed(w);
      });
      w.on('error', (e) => { stop(); rej(e); });
    }
  });
  return results;
}

export function serveShard(init) {
  if (isMainThread || !parentPort) return;
  let handler;
  const ready = Promise.resolve().then(() => init(wdata)).then((h) => { handler = h; parentPort.postMessage({ ready: true }); });
  ready.catch((e) => parentPort.postMessage({ error: e.stack ?? String(e) }));
  parentPort.on('message', async (m) => {
    try {
      await ready;
      const results = [];
      for (let k = 0; k < m.items.length; k++) results.push(await handler(m.items[k], m.start + k));
      parentPort.postMessage({ start: m.start, results });
    } catch (e) { parentPort.postMessage({ error: e.stack ?? String(e) }); }
  });
}
