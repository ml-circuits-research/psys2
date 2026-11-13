/**
 * Test preload (`node --import`): no test may touch the network (worker-tasks 2026-11-13, rule B; specs/06 "Testing").
 * `fetch` and `http(s).request` to any host other than loopback throw `NetworkForbiddenError`, and every attempt is appended to the file named by
 * `PSYS2_NET_LOG` so that `scripts/run-tests.mjs` fails the run even when a test catches the error. Tests that need a fetch inject their own `fetch`
 * (a stub passed as `fetchImpl` or assigned to `globalThis.fetch` inside the test); local servers (`listen(0)` on 127.0.0.1) keep working.
 */
import http from 'node:http';
import https from 'node:https';
import { appendFileSync } from 'node:fs';

export class NetworkForbiddenError extends Error {}
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const log = process.env.PSYS2_NET_LOG;

function check(target) {
  let host = '';
  try {
    if (typeof target === 'string' || target instanceof URL) { const u = new URL(String(target)); host = u.protocol === 'data:' || u.protocol === 'blob:' ? 'localhost' : u.hostname; }
    else if (target?.url) { host = new URL(target.url).hostname; }
    else host = String(target?.hostname ?? target?.host ?? 'localhost').replace(/:\d+$/, '');
  } catch { host = ''; }
  if (LOOPBACK.has(host)) return;
  const what = typeof target === 'string' ? target : target?.href ?? target?.url ?? JSON.stringify(target);
  if (log && !/psys2-self-test/.test(what)) { try { appendFileSync(log, `${process.argv[1] ?? '?'}\t${what}\n`); } catch { /* the error below still fails the test */ } }
  throw new NetworkForbiddenError(`tests must not touch the network: ${what} (stub fetch in the test)`);
}

const realFetch = globalThis.fetch;
if (typeof realFetch === 'function' && !realFetch.__noNetwork) {
  const guarded = async (input, init) => { check(input); return realFetch(input, init); };
  guarded.__noNetwork = true;
  globalThis.fetch = guarded;
}
for (const mod of [http, https]) {
  for (const name of ['request', 'get']) {
    const orig = mod[name];
    mod[name] = function (a, b, c) { check(typeof a === 'string' || a instanceof URL ? a : a ?? {}); return orig.call(this, a, b, c); };
  }
}
