#!/usr/bin/env node
/**
 * MT-SERIOUS: builds docs/webchat/vendor/bergamot/registry.json, the on-device translation model registry the webchat reads
 * (ui/mt-host.mjs, spec 06 "On-device translation model").
 *
 * Source: Mozilla's public model registry (the models of Firefox Translations, bergamot-translator student models, MPL-2.0):
 *   https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json
 * A language is listed only when BOTH directions with English exist (the worlds are English). For each direction the smallest released model
 * is taken; sizes are the gzip sizes of the files as downloaded (HEAD requests). The bucket answers CORS for localhost only (checked 2026-11-14), so the page fetches a file from its own host when the registry has a
 * `mirror` for it (scripts/mirror-mt-models.mjs, run after this script) and from the bucket otherwise; either way it is cached in Cache Storage.
 *
 *   node scripts/build-mt-registry.mjs [--local models.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const reg = arg('local') ? JSON.parse(readFileSync(arg('local'), 'utf8')) : await (await fetch(SRC)).json();
const RELEASED = new Set(['Release', 'Release Desktop', 'Release Android']);

async function sizeOf(path) {
  const r = await fetch(`${reg.baseUrl}/${path}`, { method: 'HEAD' });
  const n = Number(r.headers.get('content-length'));
  if (!r.ok || !n) throw new Error(`no size for ${path} (${r.status})`);
  return n;
}
async function direction(entries) {
  const ok = (entries ?? []).filter((e) => RELEASED.has(e.releaseStatus) && e.files?.model && e.files.lexicalShortlist && (e.files.vocab || (e.files.srcVocab && e.files.trgVocab)));
  let best = null;
  for (const e of ok) {
    const files = {};
    for (const [k, v] of Object.entries(e.files)) if (k !== 'qualityModel' && v?.path) files[k] = { path: v.path, bytes: await sizeOf(v.path), ...(v.uncompressedSize ? { uncompressedBytes: v.uncompressedSize, sha256: v.uncompressedHash } : {}) };
    const bytes = Object.values(files).reduce((n, f) => n + f.bytes, 0);
    const m = e.metrics?.['flores200-plus'] ?? {};
    const cand = { architecture: e.architecture, bytes, files, flores: { bleu: m.bleu != null ? +m.bleu.toFixed(1) : null, comet22: m.comet22 != null ? +m.comet22.toFixed(4) : null } };
    if (!best || cand.bytes < best.bytes) best = cand;
  }
  return best;
}

const langs = {};
for (const key of Object.keys(reg.models).sort()) {
  const m = key.match(/^en-(.+)$/);
  if (!m || !reg.models[`${m[1]}-en`]) continue;
  const fromEn = await direction(reg.models[key]), toEn = await direction(reg.models[`${m[1]}-en`]);
  if (fromEn && toEn) langs[m[1]] = { bytes: fromEn.bytes + toEn.bytes, fromEn, toEn };
}
const out = { generated: reg.generated, source: SRC, baseUrl: reg.baseUrl, engine: 'bergamot-translator 0.4.9 (MPL-2.0); models: Mozilla Firefox Translations (MPL-2.0)', languages: Object.keys(langs).length, langs };
const file = join(REPO, 'docs/webchat/vendor/bergamot/registry.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`${out.languages} languages with both directions -> ${file}`);
for (const [l, v] of Object.entries(langs)) console.log(`  ${l.padEnd(8)} ${(v.bytes / 1e6).toFixed(1).padStart(6)} MB  en>${l} ${v.fromEn.architecture} bleu ${v.fromEn.flores.bleu}  ${l}>en ${v.toEn.architecture} bleu ${v.toEn.flores.bleu}`);
