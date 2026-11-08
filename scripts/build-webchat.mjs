#!/usr/bin/env node
// Builds the static browser demo (spec 06 "Webchat", spec 07 §4).
//
//   node scripts/build-webchat.mjs [--out <dir>] [--models [<export dir>]]      (default out: docs/webchat)
//
// Output (only these paths are written; everything else in the out dir is left alone):
//   lib/                    browser-safe copies of src/{soplang,legends,worlds,formalizer,interpreter,dialog,translate}
//                           and src/loaders/bundle-loader.mjs, relative imports preserved
//   worlds/index.json       { worlds: { <id>: { files: { 'world.sop': text, ... }, opsUrl: 'worlds/<id>/ops.mjs' } } }
//   worlds/<id>/*.mjs       the world's operation modules
//   build-info.json         { worlds, files: { path: sha256 }, builtAt }  (no commit ids)
//   models/dispatcher/      (only with --models [dir], default dir training/runs/export/dispatcher-distilbert) the Encoder formalizer's model:
//                           model.int8.onnx, vocab.txt, meta.json. Copied, never removed; *.onnx is gitignored (see the vendor README).
// Idempotent: lib/, worlds/ and build-info.json are removed and recreated on every run.
import { readFile, writeFile, readdir, mkdir, rm, cp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIB_DIRS = ['soplang', 'legends', 'worlds', 'formalizer', 'interpreter', 'dialog', 'translate'];
const LIB_FILES = ['loaders/bundle-loader.mjs'];
const WORLD_TEXT = /\.(sop|json|txt|md)$/;

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

/** Copy the exported dispatcher (python -m psys2_train.export_onnx) into <outDir>/models/dispatcher. Returns the file list or null when the export is missing. */
export async function copyDispatcherModel({ root = REPO, outDir, exportDir = DEFAULT_MODEL_EXPORT, log = () => {} } = {}) {
  const from = path.resolve(root, exportDir);
  const files = { 'model.int8.onnx': 'model.int8.onnx', 'vocab.txt': 'tokenizer/vocab.txt' };
  if (!(await exists(path.join(from, files['model.int8.onnx'])))) { log(`webchat: no dispatcher export in ${from} (run: cd training && python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert); the Encoder option stays unavailable`); return null; }
  const to = path.join(outDir, 'models/dispatcher');
  await mkdir(to, { recursive: true });
  for (const [dst, src] of Object.entries(files)) await cp(path.join(from, src), path.join(to, dst));
  const meta = JSON.parse(await readFile(path.join(from, 'meta.json'), 'utf8'));
  await writeFile(path.join(to, 'meta.json'), JSON.stringify({ model: meta.model, worlds: meta.worlds, context: meta.context, max_len: meta.max_len, onnx: meta.onnx }, null, 1) + '\n');
  log(`webchat: dispatcher model (${meta.model}, int8) -> ${to}`);
  return Object.keys(files).concat('meta.json');
}

export async function buildWebchat({ root = REPO, outDir = path.join(root, 'docs/webchat'), models = null, log = () => {} } = {}) {
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

  // 3b. dispatcher model for the Encoder formalizer (optional)
  const modelFiles = models ? await copyDispatcherModel({ root, outDir, exportDir: typeof models === 'string' ? models : DEFAULT_MODEL_EXPORT, log }) : null;

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
  await buildWebchat({ outDir, models, log: console.log });
}
