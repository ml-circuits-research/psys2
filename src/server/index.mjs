/**
 * HTTP server (spec 06). Node only, no framework, JSON in and out.
 *   node src/server/index.mjs [--port 8080] [--root <worlds dir>]
 * Sessions live in memory and expire after an idle timeout (default 30 minutes).
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../loaders/fs-loader.mjs';
import { createEngine } from '../dialog/index.mjs';

export const VERSION = '0.1.0';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

async function loadTranslator() {
  try {
    const mod = await import('../translate/index.mjs');
    const t = typeof mod.createTranslator === 'function' ? mod.createTranslator() : (mod.default ?? mod);
    return typeof t.translate === 'function' && typeof t.detectLanguage === 'function' ? t : null;
  } catch { return null; }
}

/**
 * Create (but do not start) the HTTP server.
 * @returns {{ server: http.Server, sessions: Map, close(): void }}
 */
export function createServer({ engine, idleMs = 30 * 60 * 1000 } = {}) {
  const sessions = new Map(); // id -> { session, last }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) if (now - s.last > idleMs) sessions.delete(id);
  }, Math.min(idleMs, 60_000));
  sweep.unref();

  const send = (res, status, body, type = 'application/json') => {
    const data = type === 'application/json' ? JSON.stringify(body) : String(body);
    res.writeHead(status, { 'content-type': type + '; charset=utf-8', ...CORS });
    res.end(data);
  };
  const readJson = (req) => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
  const legendSummary = (ns) => {
    const L = engine.set.legends;
    return {
      namespace: ns,
      types: [...L.types.values()].filter((t) => t.namespace === ns).map((t) => ({ name: t.name, extends: t.extends, doc: t.doc })),
      keys: [...L.keys.values()].filter((k) => k.id.startsWith(ns + '.')).map((k) => ({ id: k.id, ask: k.ask, card: k.card })),
    };
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean); // v1 ...
      if (parts[0] !== 'v1') return send(res, 404, { error: 'not found' });
      const [, a, b, c] = parts;
      if (req.method === 'GET' && a === 'health' && !b) return send(res, 200, { ok: true, version: VERSION, worlds: engine.set.list().length });
      if (req.method === 'GET' && a === 'worlds' && !b) return send(res, 200, engine.worlds());
      if (req.method === 'GET' && a === 'worlds' && b && !c) {
        const w = engine.set.get(b);
        if (!w) return send(res, 404, { error: `unknown world '${b}'` });
        return send(res, 200, { manifest: w.summary(), legend: legendSummary(w.id), tests: { count: w.tests.length, ids: w.tests.map((t) => t.id) } });
      }
      if (req.method === 'POST' && a === 'worlds' && c === 'improvements') return notImplemented(res, send);
      if (req.method === 'POST' && a === 'learn') return notImplemented(res, send);
      if (req.method === 'POST' && a === 'sessions' && !b) {
        const body = await readJson(req);
        const id = randomUUID();
        sessions.set(id, { session: engine.createSession({ language: body.language ?? 'auto', formalizer: body.formalizer }), last: Date.now() });
        return send(res, 201, { sessionId: id });
      }
      if (a === 'sessions' && b && c) {
        const entry = sessions.get(b);
        if (!entry) return send(res, 404, { error: 'unknown or expired session' });
        entry.last = Date.now();
        if (req.method === 'POST' && c === 'messages') {
          const body = await readJson(req);
          if (typeof body.text !== 'string') return send(res, 400, { error: 'body must be { "text": string }' });
          return send(res, 200, await entry.session.send(body.text));
        }
        if (req.method === 'GET' && c === 'memory') return send(res, 200, entry.session.memory(), 'text/plain');
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      return send(res, e.message === 'invalid JSON' || e.message === 'body too large' ? 400 : 500, { error: e.message });
    }
  });
  return { server, sessions, close: () => { clearInterval(sweep); server.close(); } };
}

function notImplemented(res, send) {
  return send(res, 501, { error: 'not implemented: C1 construction and C3 improvement are described in vision/PSys2-vision-v1.md sections 9-11' });
}

/** Entry point when run directly. */
async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const port = Number(arg('--port') ?? process.env.PORT ?? 8080);
  const root = arg('--root');
  const engine = await createEngine({ loader: createFsLoader({ roots: root ? [root, DEFAULT_ROOT] : [DEFAULT_ROOT] }), translator: await loadTranslator() });
  const { server } = createServer({ engine });
  server.listen(port, () => console.log(`PSys2 server on http://localhost:${port} (${engine.worlds().length} worlds)`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
