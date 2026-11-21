// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE SITE'S OWN COPY OF THE PINNED CATALOG (reviewer 2026-11-15 09:10 item 2, questions.md Q33): the files the app can load from the pinned catalog folder (index.json, vocab.json,
 * every world's schema and shards listed in index.json) are copied byte for byte to `<outDir>/catalog/<commit>/`, the first source of `KNOWLEDGE_URLS` on the page
 * (src/knowledge/catalog-pin.mjs `siteCatalogUrl`). Other pins' folders under `<outDir>/catalog/` are removed (one copy on the site). Idempotent: a file whose bytes are already
 * there is not rewritten. Lazily fetched by the page (never in the asset manifest or the service worker's list); the external mirrors stay the fallback.
 *
 *   copySiteCatalog({ outDir, dir, commit }) -> { files, bytes, written, removed }
 *   siteCatalogFiles(dir) -> [relative paths]
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** The files of a catalog folder the app can load: the root files, the optional vocabulary buckets, every schema and shard index.json lists (worlds and schemas). */
export async function siteCatalogFiles(dir) {
  const index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
  const out = new Set(['index.json', 'vocab.json', 'LICENSES.md', 'README.md']);   // the catalog's licences travel with its data (attribution)
  for (const w of [...(index.worlds ?? []), ...(Array.isArray(index.schemas) ? index.schemas : [])]) {   // knowledge worlds and the world schemas (w.face, w.chart, ...)
    if (w.schema) out.add(w.schema);
    if (w.vocabulary) out.add(w.vocabulary);
    for (const s of w.shards ?? []) if (s.path) out.add(s.path);
  }
  if (existsSync(path.join(dir, 'vocab'))) for (const f of await readdir(path.join(dir, 'vocab'))) if (f.endsWith('.json')) out.add(`vocab/${f}`);
  return [...out].filter((p) => !p.includes('..') && existsSync(path.join(dir, p))).sort();
}

export async function copySiteCatalog({ outDir, dir, commit }) {
  const base = path.join(outDir, 'catalog'), to = path.join(base, commit);
  const files = await siteCatalogFiles(dir);
  let bytes = 0, written = 0;
  for (const f of files) {
    const b = await readFile(path.join(dir, f));
    bytes += b.length;
    const dst = path.join(to, f);
    if (existsSync(dst) && Buffer.compare(await readFile(dst), b) === 0) continue;
    await mkdir(path.dirname(dst), { recursive: true });
    await writeFile(dst, b);
    written++;
  }
  // The vocabulary buckets the page asks for first (src/knowledge/facts.mjs vocab/index.json): a pinned folder that does not publish them gets them cut
  // here from its own vocab.json (scripts/build-catalog-vocab.mjs), so every catalog file the page asks the site for exists (no 404 for vocab/index.json).
  if (!existsSync(path.join(dir, 'vocab')) && existsSync(path.join(dir, 'vocab.json'))) {
    const { bucketVocab } = await import('../build-catalog-vocab.mjs');
    const index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')), buckets = bucketVocab(JSON.parse(await readFile(path.join(dir, 'vocab.json'), 'utf8')));
    const cut = { ...Object.fromEntries(Object.entries(buckets).map(([b, e]) => [`vocab/${b}.json`, JSON.stringify(e)])),
      'vocab/index.json': JSON.stringify({ version: index.version ?? null, buckets: Object.fromEntries(Object.entries(buckets).map(([b, e]) => [b, Object.keys(e).length])) }) };
    await mkdir(path.join(to, 'vocab'), { recursive: true });
    for (const [f, text] of Object.entries(cut)) {
      const dst = path.join(to, f), b = Buffer.from(text);
      bytes += b.length; files.push(f);
      if (existsSync(dst) && Buffer.compare(await readFile(dst), b) === 0) continue;
      await writeFile(dst, b); written++;
    }
  }
  const removed = [];
  for (const e of await readdir(base, { withFileTypes: true })) if (e.name !== commit) { await rm(path.join(base, e.name), { recursive: true, force: true }); removed.push(e.name); }
  return { files: files.length, bytes, written, removed };
}
