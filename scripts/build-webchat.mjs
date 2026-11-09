#!/usr/bin/env node
// Builds the static browser demo (spec 06 "Webchat", spec 07 §4).
//
//   node scripts/build-webchat.mjs [--out <dir>] [--models [<export dir>] [--meta-only]]      (default out: docs/webchat)
//
// Output (only these paths are written; everything else in the out dir is left alone):
//   lib/                    browser-safe copies of src/{soplang,legends,worlds,formalizer,interpreter,dialog,translate,astra}
//                           and src/loaders/bundle-loader.mjs, relative imports preserved
//   worlds/index.json       { worlds: { <id>: { files: { 'world.sop': text, ... }, opsUrl: 'worlds/<id>/ops.mjs' } } }
//   worlds/<id>/*.mjs       the world's operation modules
//   build-info.json         { worlds, files: { path: sha256 }, builtAt }  (no commit ids)
//   models/dispatcher/      (only with --models [dir], default dir training/runs/export/dispatcher-distilbert) the Encoder formalizer's model:
//                           model.int8.onnx, vocab.txt, meta.json. Copied only when changed, never removed; meta.json carries a `version` block. --meta-only regenerates meta.json without touching the model.
// Idempotent: lib/, worlds/ and build-info.json are removed and recreated on every run.
import { readFile, writeFile, readdir, mkdir, rm, cp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIB_DIRS = ['soplang', 'legends', 'worlds', 'formalizer', 'interpreter', 'dialog', 'translate', 'astra'];
const LIB_FILES = ['loaders/bundle-loader.mjs'];
const WORLD_TEXT = /\.(sop|json|txt|md)$/;
// Files the browser never reads (the loader treats a missing tests.sop as empty; coverage.md is a human catalogue): left out of worlds/index.json to keep it small (L10).
const BROWSER_SKIP = new Set(['tests.sop', 'coverage.md']);

const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir, base = dir) {
  const out = [];
  for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

export const DEFAULT_MODEL_EXPORT = 'training/runs/export/dispatcher-distilbert';

const fileSha256 = async (p) => createHash('sha256').update(await readFile(p)).digest('hex');

/**
 * Copy the exported dispatcher (python -m psys2_train.export_onnx) into <outDir>/models/dispatcher and write meta.json with a `version` block
 * (checkpoint, model name, dataset baseline commit and hash, export date, sha256 of model.int8.onnx, headline metrics).
 * Idempotent: unchanged files are not rewritten and the export date comes from the export's mtime, so a rerun gives no git diff.
 * Returns the file list, or null (nothing touched) when the export is missing. With metaOnly, the published model and vocab are left alone
 * and only meta.json is regenerated from the published model's sha256.
 */
export async function copyDispatcherModel({ root = REPO, outDir, exportDir = DEFAULT_MODEL_EXPORT, metaOnly = false, log = () => {} } = {}) {
  const from = path.resolve(root, exportDir);
  const files = { 'model.int8.onnx': 'model.int8.onnx', 'vocab.txt': 'tokenizer/vocab.txt' };
  const srcModel = path.join(from, files['model.int8.onnx']);
  if (!(await exists(srcModel))) { log(`webchat: no dispatcher export in ${from} (run: cd training && python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert); models/dispatcher left untouched`); return null; }
  const to = path.join(outDir, 'models/dispatcher');
  await mkdir(to, { recursive: true });
  if (await exists(path.join(from, 'edit-vocab.json'))) files['edit-vocab.json'] = 'edit-vocab.json';   // rephraser (edit-tag head) tag vocabulary
  if (!metaOnly) {
    for (const [dst, src] of Object.entries(files)) {
      const a = path.join(from, src), b = path.join(to, dst);
      if (!(await exists(b)) || (await fileSha256(a)) !== (await fileSha256(b))) await cp(a, b);
    }
  }
  const meta = JSON.parse(await readFile(path.join(from, 'meta.json'), 'utf8'));
  const name = path.basename(from);
  const readJson = async (p) => (await exists(p)) ? JSON.parse(await readFile(p, 'utf8')) : {};
  const res = await readJson(path.join(root, 'training/results', `${name}.json`));
  const rules = await readJson(path.join(root, 'training/results/rules.json'));
  const seg = res.test?.segmentation?.boundary;
  const r3 = (x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : null);
  const version = {
    checkpoint: path.posix.join(path.relative(root, path.dirname(path.dirname(from))).split(path.sep).join('/'), name),
    model: meta.model,
    dataset_baseline_commit: rules.baseline_commit ?? null,
    dataset_hash: res.data_hash ?? null,
    export_date: (await stat(srcModel)).mtime.toISOString().slice(0, 10),
    sha256: await fileSha256(path.join(to, 'model.int8.onnx')),
    metrics: { split: 'test', world_top1: r3(res.test?.world?.top1), world_top3: r3(res.test?.world?.top3), seg_f1: r3(seg?.f1) },
  };
  await writeFile(path.join(to, 'meta.json'), JSON.stringify({ model: meta.model, worlds: meta.worlds, context: meta.context, max_len: meta.max_len, onnx: meta.onnx, ...(meta.edit_tags ? { edit_threshold: meta.edit_threshold ?? 0.5 } : {}), version }, null, 1) + '\n');
  log(`webchat: dispatcher model (${meta.model}, int8, sha256 ${version.sha256.slice(0, 12)}) -> ${to}${metaOnly ? ' (meta.json only)' : ''}`);
  return Object.keys(files).concat('meta.json');
}

const EARLY_BEGIN = '<!-- early-load:begin (written by scripts/build-webchat.mjs) -->', EARLY_END = '<!-- early-load:end -->';
const IMPORT_RE = /(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|[;\n])\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/g;
/** Static import graph (relative specifiers only) reachable from `roots`, as paths relative to outDir. */
async function importGraph(outDir, roots) {
  const seen = new Set(); const stack = [...roots];
  while (stack.length) {
    const rel = stack.pop(); if (seen.has(rel)) continue;
    let text; try { text = await readFile(path.join(outDir, rel), 'utf8'); } catch { continue; }
    seen.add(rel);
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2]; if (!spec.endsWith('.mjs') && !spec.endsWith('.js')) continue;
      stack.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
  }
  return [...seen].sort();
}
async function writeEarlyLoad({ outDir, tabFiles, ids }) {
  const file = path.join(outDir, 'index.html');
  if (!(await exists(file))) return;
  const html = await readFile(file, 'utf8');
  const roots = ['app.mjs', 'lib/dialog/index.mjs', 'lib/loaders/bundle-loader.mjs', 'lib/translate/index.mjs', 'lib/soplang/index.mjs', 'lib/dialog/runtime-config.mjs', 'lib/formalizer/wordpiece.mjs',
    ...tabFiles.map((f) => `ui/tabs/${f}`), ...ids.map((id) => `worlds/${id}/ops.mjs`)];
  const mods = await importGraph(outDir, roots);
  const block = [EARLY_BEGIN,
    ...mods.map((m) => `<link rel="modulepreload" href="${m}">`),
    `<script>window.__psys2Early = { worlds: fetch('worlds/index.json'), dispatcherMeta: fetch('models/dispatcher/meta.json', { cache: 'no-cache' }).catch(() => null) };</script>`,
    EARLY_END].join('\n  ');
  const a = html.indexOf(EARLY_BEGIN), b = html.indexOf(EARLY_END);
  const next = a >= 0 && b > a ? html.slice(0, a) + block + html.slice(b + EARLY_END.length) : html.replace('</head>', () => `  ${block}\n</head>`);
  if (next !== html) await writeFile(file, next);
}

export async function buildWebchat({ root = REPO, outDir = path.join(root, 'docs/webchat'), models = null, metaOnly = false, log = () => {} } = {}) {
  const src = path.join(root, 'src');
  const worldsRoot = path.join(root, 'worlds');
  await mkdir(outDir, { recursive: true });
  for (const p of ['lib', 'worlds', 'build-info.json']) await rm(path.join(outDir, p), { recursive: true, force: true });

  // 1. library
  for (const d of LIB_DIRS) {
    if (await exists(path.join(src, d))) await cp(path.join(src, d), path.join(outDir, 'lib', d), { recursive: true });
  }
  for (const f of LIB_FILES) {
    await mkdir(path.dirname(path.join(outDir, 'lib', f)), { recursive: true });
    await cp(path.join(src, f), path.join(outDir, 'lib', f));
  }

  // 2. worlds
  const bundle = { worlds: {} };
  const ids = [];
  for (const e of (await readdir(worldsRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || !(await exists(path.join(worldsRoot, e.name, 'world.sop')))) continue;
    const id = e.name;
    const dir = path.join(worldsRoot, id);
    const entry = { files: {} };
    for (const f of await walk(dir)) {
      if (BROWSER_SKIP.has(f)) continue;
      if (WORLD_TEXT.test(f)) entry.files[f] = await readFile(path.join(dir, f), 'utf8');
      else if (f.endsWith('.mjs')) {
        await mkdir(path.dirname(path.join(outDir, 'worlds', id, f)), { recursive: true });
        await cp(path.join(dir, f), path.join(outDir, 'worlds', id, f));
      }
    }
    if (await exists(path.join(dir, 'ops.mjs'))) entry.opsUrl = `worlds/${id}/ops.mjs`;
    bundle.worlds[id] = entry;
    ids.push(id);
  }
  await mkdir(path.join(outDir, 'worlds'), { recursive: true });
  await writeFile(path.join(outDir, 'worlds/index.json'), JSON.stringify(bundle) + '\n');

  // 3. tab plugins: docs/webchat/ui/tabs/*.mjs -> ui/tabs/index.json (loaded by app.mjs, spec 07 §6)
  const tabsSrc = path.join(root, 'docs/webchat/ui/tabs');
  const tabFiles = (await exists(tabsSrc)) ? (await readdir(tabsSrc)).filter((f) => f.endsWith('.mjs')).sort() : [];
  await mkdir(path.join(outDir, 'ui/tabs'), { recursive: true });
  await writeFile(path.join(outDir, 'ui/tabs/index.json'), JSON.stringify(tabFiles) + '\n');

  // 3a. early loading (PERF round 2): index.html gets modulepreload links for the whole module graph (app, lib, tabs, world ops) so that a
  // high-latency link fetches them in parallel instead of one import round trip at a time, and an early fetch of worlds/index.json and the model meta file.
  await writeEarlyLoad({ outDir, tabFiles, ids });

  // 3b. dispatcher model for the Encoder formalizer (optional)
  const modelFiles = models ? await copyDispatcherModel({ root, outDir, exportDir: typeof models === 'string' ? models : DEFAULT_MODEL_EXPORT, metaOnly, log }) : null;

  // 4. build info
  const files = {};
  for (const sub of ['lib', 'worlds']) {
    for (const f of await walk(path.join(outDir, sub))) files[`${sub}/${f}`] = sha(await readFile(path.join(outDir, sub, f)));
  }
  const info = { worlds: ids, tabs: tabFiles, dispatcherModel: !!modelFiles, files, builtAt: new Date().toISOString() };
  await writeFile(path.join(outDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  log(`webchat: ${ids.length} worlds, ${Object.keys(files).length} files -> ${outDir}`);
  return info;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const outDir = i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  const m = process.argv.indexOf('--models');
  const models = m > 0 ? (process.argv[m + 1] && !process.argv[m + 1].startsWith('--') ? process.argv[m + 1] : true) : null;
  await buildWebchat({ outDir, models, metaOnly: process.argv.includes('--meta-only'), log: console.log });
}
