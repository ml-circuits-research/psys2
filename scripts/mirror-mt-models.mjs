#!/usr/bin/env node
/**
 * MT-MIRROR: copies the on-device translation model files of the given languages next to the page (docs/webchat/models-mt/<lang>/<direction>/<file>, the gzip as
 * Mozilla publishes it) and records each copy as `mirror` in docs/webchat/vendor/bergamot/registry.json.
 *
 * Why: Mozilla's Google bucket (registry.baseUrl) answers CORS for localhost only (checked 2026-11-14), so a page served from GitHub Pages cannot read it:
 * every download ends in "Failed to fetch". The page reads a file's `mirror` first (same origin, no CORS) and the bucket second. The Mozilla CDN of the
 * Remote Settings attachments is no way out: it answers 406 to Chrome's User-Agent. Languages without a mirror still work wherever the bucket allows (localhost).
 * The files are checked: size against the registry, the model's sha256 after gunzip. Run it again after scripts/build-mt-registry.mjs (which rewrites the registry).
 *
 *   node scripts/mirror-mt-models.mjs ro [more codes]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'docs/webchat');
const REG = join(WEB, 'vendor/bergamot/registry.json');
const reg = JSON.parse(readFileSync(REG, 'utf8'));
const langs = process.argv.slice(2);
if (!langs.length) { console.error('usage: node scripts/mirror-mt-models.mjs <lang> [<lang>...]'); process.exit(1); }

for (const lang of langs) {
  const L = reg.langs[lang];
  if (!L) throw new Error(`no registry entry for "${lang}"`);
  for (const dir of ['fromEn', 'toEn']) {
    for (const f of Object.values(L[dir].files)) {
      const rel = `models-mt/${lang}/${dir}/${basename(f.path)}`, file = join(WEB, rel);
      if (!existsSync(file)) {
        const r = await fetch(`${reg.baseUrl}/${f.path}`);
        if (!r.ok) throw new Error(`${f.path}: ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length !== f.bytes) throw new Error(`${f.path}: ${buf.length} bytes, the registry says ${f.bytes}`);
        if (f.sha256 && createHash('sha256').update(gunzipSync(buf)).digest('hex') !== f.sha256) throw new Error(`${f.path}: checksum differs`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, buf);
        console.log(`  ${rel}  ${(buf.length / 1e6).toFixed(1)} MB`);
      }
      f.mirror = rel;
    }
  }
}
writeFileSync(REG, JSON.stringify(reg) + '\n');
console.log(`mirrored: ${Object.entries(reg.langs).filter(([, L]) => Object.values(L.fromEn.files).every((f) => f.mirror)).map(([c]) => c).join(', ')}`);
