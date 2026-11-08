// Stockfish.js 19 (lite, single-threaded WASM, GPL-3.0) in a Web Worker, spoken to over UCI.
// The engine only chooses moves for the effects chess.engine.bestmove and chess.engine.hint; the rules live in the world.
// Levels 1-8 map to Stockfish's "Skill Level" option plus a search depth cap, so low levels are quick and weak.

const SKILL = [0, 0, 2, 5, 8, 11, 14, 17, 20];
const DEPTH = [0, 1, 2, 3, 5, 7, 10, 14, 0];

export function createStockfish(url) {
  let worker = null, ready = null, queue = Promise.resolve();
  const listeners = new Set();
  const info = { status: 'idle', error: null };
  const start = () => (ready ??= new Promise((resolve, reject) => {
    info.status = 'loading';
    const fail = (e) => { info.status = 'unavailable'; info.error = e; reject(e); };
    try { worker = new Worker(url); } catch (e) { fail(e); return; }
    const timer = setTimeout(() => fail(new Error('Stockfish did not start in time')), 20000);
    worker.onerror = (e) => { clearTimeout(timer); fail(new Error(e?.message || 'Stockfish failed to load')); };
    worker.onmessage = (ev) => {
      const line = typeof ev.data === 'string' ? ev.data : String(ev.data?.data ?? '');
      if (line === 'uciok') worker.postMessage('isready');
      else if (line === 'readyok') { clearTimeout(timer); info.status = 'ready'; resolve(); }
      for (const l of [...listeners]) l(line);
    };
    worker.postMessage('uci');
  }));
  function search(fen, level, movetime) {
    const run = queue.then(async () => {
      await start();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(on); worker.postMessage('stop'); reject(new Error('engine timeout')); }, movetime + 12000);
        const on = (line) => {
          const m = /^bestmove (\S+)/.exec(line);
          if (!m) return;
          listeners.delete(on); clearTimeout(timer);
          if (m[1] === '(none)') reject(new Error('no legal move')); else resolve(m[1]);
        };
        listeners.add(on);
        const l = Math.min(8, Math.max(1, Number(level) || 3));
        worker.postMessage(`setoption name Skill Level value ${SKILL[l]}`);
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go ${DEPTH[l] ? `depth ${DEPTH[l]} ` : ''}movetime ${Math.max(50, Number(movetime) || 500)}`);
      });
    });
    queue = run.catch(() => {});
    return run;
  }
  return { info, warm: () => start().catch(() => {}), bestmove: search, destroy() { worker?.terminate(); worker = null; ready = null; info.status = 'idle'; } };
}
