/**
 * Formalizer strategies (spec 06, "Formalizer strategies"). Browser-safe.
 *
 *   { id: 'rules' | 'encoder', available(): boolean | Promise<boolean>, supports(world): boolean,
 *     formalize(text, { worlds, session, source }) -> { segments, wires } | Promise<...> }
 *
 * Everything after formalization is identical whichever strategy produced the wires.
 */
import { formalize } from './rules/index.mjs?v=8898608004';

/** The rule formalizer (spec 03): always available, supports every world that has patterns. */
export function createRulesFormalizer() {
  return {
    id: 'rules',
    available: () => true,
    supports: (world) => (world?.patterns?.length ?? 0) > 0,
    formalize: (text, opts) => formalize(text, opts),
  };
}

/**
 * The encoder formalizer (vision section 5): talks to an inference worker at `endpoint`
 * (`GET <endpoint>/health` -> `{ ok, worlds: [ids with a loaded adapter] }`,
 * `POST <endpoint>/formalize` with `{ text, worlds: [ids] }` -> the spec 03 result shape).
 * `available()` never throws: it is false without an endpoint, without `fetch`, or while the worker does not answer.
 */
export function createEncoderFormalizer({ endpoint = null, fetchImpl = globalThis.fetch, timeoutMs = 1500, recheckMs = 15000 } = {}) {
  let adapters = new Set();
  let ok = false;
  let checkedAt = -Infinity;
  const base = endpoint ? String(endpoint).replace(/\/+$/, '') : null;
  const fetchJson = async (path, init) => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(base + path, { ...init, signal: ctl?.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { if (timer) clearTimeout(timer); }
  };
  return {
    id: 'encoder',
    endpoint: base,
    async available() {
      if (!base || typeof fetchImpl !== 'function') return false;
      if (Date.now() - checkedAt < recheckMs) return ok;
      checkedAt = Date.now();
      try {
        const h = await fetchJson('/health');
        ok = !!h?.ok;
        adapters = new Set(Array.isArray(h?.worlds) ? h.worlds : []);
      } catch { ok = false; adapters = new Set(); }
      return ok;
    },
    supports: (world) => ok && adapters.has(world?.id),
    async formalize(text, { worlds, source } = {}) {
      const ids = worlds.list().filter((w) => adapters.has(w.id)).map((w) => w.id);
      return fetchJson('/formalize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, worlds: ids, source }) });
    },
  };
}
