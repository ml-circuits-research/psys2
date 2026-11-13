/**
 * Where the knowledge catalog files come from (spec 17): a directory of the sop-knowledge-worlds `docs/worlds` tree, or its GitHub Pages base URL.
 * `createKnowledgeSource(location)` returns `{ text(path) -> Promise<string|null> }` for `createCatalog`. A URL is read with `fetch` (Node 20 and the
 * browser); a directory with `node:fs/promises`, imported on demand so this file can be bundled for the browser.
 * `knowledgeLocation()` is the host's setting: the `PSYS2_KNOWLEDGE` environment variable (a directory or a URL); unset means no catalog.
 */
export const knowledgeLocation = () => globalThis.process?.env?.PSYS2_KNOWLEDGE || null;

export function createKnowledgeSource(location) {
  const base = String(location).replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) {
    return { text: async (p) => { const r = await fetch(`${base}/${p}`); return r.ok ? r.text() : null; } };
  }
  return {
    text: async (p) => {
      const { readFile } = await import('node:fs/promises');
      try { return await readFile(`${base}/${p}`, 'utf8'); } catch { return null; }
    },
  };
}
