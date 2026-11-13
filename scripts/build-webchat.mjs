#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Builds the static browser demo (spec 06 "Webchat", spec 07 §4).
//
//   node scripts/build-webchat.mjs [--out <dir>] [--models [<export dir>] [--meta-only]]      (default out: docs/webchat)
//
// Output (only these paths are written; everything else in the out dir is left alone):
//   lib/                    browser-safe copies of src/{soplang,legends,worlds,formalizer,interpreter,dialog,translate,astra,reasoner,knowledge,vendor}
//                           and src/loaders/bundle-loader.mjs, relative imports preserved
//   worlds/index.json       { worlds: { <id>: { files: { 'world.sop': text, ... }, opsUrl: 'worlds/<id>/ops.mjs' } } }
//   worlds/<id>/*.mjs       the world's operation modules
//   build-info.json         { worlds, files: { path: sha256 }, builtAt, commit }  (commit: short id of HEAD when built, "-dirty" when src/worlds/docs sources differ from it; also stamped into index.html as window.__psys2Build, spec 06 "Build version")
//   models/dispatcher/      (only with --models [dir], default dir training/runs/export/dispatcher-distilbert) the Encoder formalizer's model:
//                           model.int8.onnx, vocab.txt, meta.json. Copied only when changed, never removed; meta.json carries a `version` block. --meta-only regenerates meta.json without touching the model.
//   surprise-pool.json      (CLI: when missing or with --surprise; `surprise: true` in code; takes about 25 minutes) the SURPRISE button's pool: canonical examples validated in fresh sessions and in click walks [{ text, world, tab }]. Left alone otherwise; tests/surprise.test.mjs flags stale entries.
// Idempotent: lib/, worlds/ and build-info.json are removed and recreated on every run.
import { readFile, writeFile, readdir, mkdir, rm, cp, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { slotDeclarations } from '../src/worlds/describe.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIB_DIRS = ['soplang', 'legends', 'worlds', 'formalizer', 'interpreter', 'dialog', 'translate', 'astra', 'reasoner', 'knowledge', 'vendor'];
const LIB_FILES = ['loaders/bundle-loader.mjs'];
const WORLD_TEXT = /\.(sop|json|txt|md)$/;
// Files the browser never reads (the loader treats a missing tests.sop as empty; coverage.md is a human catalogue): left out of worlds/index.json to keep it small (L10).
// describe.sop (core.describe, E3/DESCRIBE-ALL) is read in full only with PSYS_GEN_PATTERNS in Node tools; the webchat never generates patterns, so only its slot= declarations are shipped (below).
const BROWSER_SKIP = new Set(['tests.sop', 'coverage.md', 'describe.sop']);

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
  const published = await readJson(path.join(to, 'meta.json'));   // NX integration: the heads' label tables and gate live in the published meta.json; a regeneration keeps them
  await writeFile(path.join(to, 'meta.json'), JSON.stringify({ model: meta.model, worlds: meta.worlds, context: meta.context, max_len: meta.max_len, onnx: meta.onnx, ...(meta.edit_tags ? { edit_threshold: meta.edit_threshold ?? 0.5 } : {}), version, ...(published.nx ? { nx: published.nx } : {}) }, null, 1) + '\n');
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
const DYNAMIC_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+\.mjs)['"]\s*\)/g;
/** The relative `.mjs` specifiers of a module text (static imports, re-exports, and literal `import('./x.mjs')`). */
function specifiersOf(text) {
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) { const s = m[1] ?? m[2]; if (s.endsWith('.mjs')) out.push(s); }
  for (const m of text.matchAll(DYNAMIC_RE)) out.push(m[1]);
  return out;
}
/**
 * Versions the module graph of lib/ and worlds/ for workers (COMPUTE-BUDGET D item 4). A worker has no import map, so its imports are plain URLs and could pair a
 * fresh module with a stale cached one (Pages sends max-age=600). Every module gets a version that covers its own text and everything it imports (a Merkle hash;
 * an import cycle is one unit), and every relative specifier in these generated files is rewritten to `<specifier>?v=<version of the target>`. A module therefore
 * always loads exactly the dependencies it was built with, in a worker and in the page alike, and unchanged subgraphs stay cached across deploys.
 * The page's import map maps the plain URLs to the same versioned URLs (one module instance). Returns { 'lib/x.mjs': version, ... }.
 */
export async function versionGraph(outDir) {
  const nodes = new Map();   // rel -> { text, deps: Set<rel> }
  for (const sub of ['lib', 'worlds']) {
    if (!(await exists(path.join(outDir, sub)))) continue;
    for (const f of await walk(path.join(outDir, sub))) if (f.endsWith('.mjs')) { const rel = `${sub}/${f}`; nodes.set(rel, { text: await readFile(path.join(outDir, rel), 'utf8'), deps: new Set() }); }
  }
  const resolveSpec = (rel, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
  for (const [rel, n] of nodes) for (const s of specifiersOf(n.text)) { const d = resolveSpec(rel, s); if (nodes.has(d)) n.deps.add(d); }
  // Tarjan: strongly connected components in dependency order (a component after everything it depends on)
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], comps = [];
  let counter = 0;
  const visit = (v) => {   // bounded: depth-first over the finite module graph; each node is visited once (index map)
    index.set(v, counter); low.set(v, counter); counter++; stack.push(v); onStack.add(v);
    for (const w of nodes.get(v).deps) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) { const c = []; let w; do { w = stack.pop(); onStack.delete(w); c.push(w); } while (w !== v); comps.push(c); }   // bounded: pops down to v, which is on the stack
  };
  for (const v of [...nodes.keys()].sort()) if (!index.has(v)) visit(v);
  const ver = {};
  for (const c of comps) {
    const members = new Set(c);
    const ext = new Set();
    for (const m of c) for (const d of nodes.get(m).deps) if (!members.has(d)) ext.add(`${d}@${ver[d]}`);
    const body = [...c].sort().map((m) => `${m}:${sha(nodes.get(m).text)}`).join('\n') + '\n' + [...ext].sort().join('\n');
    const v = sha(body).slice(0, 10);
    for (const m of c) ver[m] = v;
  }
  for (const [rel, n] of nodes) {
    const rewrite = (s) => { const d = resolveSpec(rel, s); return nodes.has(d) ? `${s}?v=${ver[d]}` : s; };
    const text = n.text
      .replace(IMPORT_RE, (all, a, b) => { const s = a ?? b; return s.endsWith('.mjs') ? all.replace(s, rewrite(s)) : all; })
      .replace(DYNAMIC_RE, (all, s) => all.replace(s, rewrite(s)));
    if (text !== n.text) await writeFile(path.join(outDir, rel), text);
  }
  return ver;
}

/** Every module of the page (app, ui, lib, world ops; not vendor/) with a short content hash, plus worlds/index.json: { 'lib/dialog/index.mjs': '1a2b3c4d5e', ... }. */
async function moduleVersions(outDir, graph = {}) {
  const out = {};
  const add = async (rel) => { out[rel] = sha(await readFile(path.join(outDir, rel))).slice(0, 10); };
  if (await exists(path.join(outDir, 'app.mjs'))) await add('app.mjs');
  for (const sub of ['ui', 'lib', 'worlds']) {
    if (!(await exists(path.join(outDir, sub)))) continue;
    for (const f of await walk(path.join(outDir, sub))) if (f.endsWith('.mjs')) await add(`${sub}/${f}`);
  }
  Object.assign(out, graph);   // lib and worlds: the graph version (the same string their own imports carry), so the page and the workers load one instance
  if (await exists(path.join(outDir, 'worlds/index.json'))) await add('worlds/index.json');
  return out;
}
/** Short id of HEAD, with "-dirty" when tracked sources (not the generated docs/webchat output) differ from it; 'unknown' outside a checkout. */
export function gitCommit(root) {
  try {
    const run = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const id = run('rev-parse', '--short', 'HEAD');
    return run('status', '--porcelain', '--untracked-files=no', '--', '.', ':!docs/webchat') ? `${id}-dirty` : id;
  } catch { return 'unknown'; }
}

async function writeEarlyLoad({ outDir, tabFiles, ids, graph, build }) {
  const file = path.join(outDir, 'index.html');
  if (!(await exists(file))) return;
  const html = await readFile(file, 'utf8');
  // the engine (dialog, formalizers, translators, world operations) runs in ui/engine-worker.mjs (COMPUTE-BUDGET): the page thread does not preload it
  const roots = ['app.mjs', 'lib/soplang/index.mjs', 'lib/dialog/time-limits.mjs', ...tabFiles.map((f) => `ui/tabs/${f}`)];
  const mods = await importGraph(outDir, roots);
  // Cache busting (URGENT-FREEZE): GitHub Pages serves everything with max-age=600, so after a deploy a browser mixes old and new files for ten minutes
  // (and an unversioned worker URL can stay old). An import map sends every module URL to `<url>?v=<content hash>`: one index.html always names one
  // consistent set of files, unchanged files stay cached across deploys, and the ORT worker and worlds/index.json take their versions from window.__psys2Mod.
  const ver = await moduleVersions(outDir, graph);
  const imports = Object.fromEntries(Object.entries(ver).filter(([k]) => k.endsWith('.mjs')).map(([k, v]) => [`./${k}`, `./${k}?v=${v}`]));
  const makeBlock = (b) => [EARLY_BEGIN,
    `<script type="importmap">${JSON.stringify({ imports })}</script>`,
    `<script>window.__psys2Build = ${JSON.stringify(b)};</script>`,
    `<script>window.__psys2Mod = ${JSON.stringify(ver)};</script>`,
    ...mods.filter((m) => ver[m]).map((m) => `<link rel="modulepreload" href="${m}?v=${ver[m]}">`),
    `<script>window.__psys2Early = { worlds: fetch('worlds/index.json?v=${ver['worlds/index.json']}'), dispatcherMeta: fetch('models/dispatcher/meta.json', { cache: 'no-cache' }).catch(() => null) };</script>`,
    EARLY_END].join('\n  ');
  const a = html.indexOf(EARLY_BEGIN), b = html.indexOf(EARLY_END);
  // idempotent: when only the build time would change (same commit, same files), keep the previous block and its time
  const prev = a >= 0 && b > a ? /window\.__psys2Build = (\{[^;]*\});/.exec(html.slice(a, b)) : null;
  let prevBuild = null;
  try { prevBuild = prev ? JSON.parse(prev[1]) : null; } catch { /* old block */ }
  let block = makeBlock(build);
  if (prevBuild && prevBuild.commit === build.commit && makeBlock({ ...build, builtAt: prevBuild.builtAt }) === html.slice(a, b + EARLY_END.length)) block = makeBlock({ ...build, builtAt: prevBuild.builtAt });
  const next = a >= 0 && b > a ? html.slice(0, a) + block + html.slice(b + EARLY_END.length) : html.replace('</head>', () => `  ${block}\n</head>`);
  if (next !== html) await writeFile(file, next);
}

export async function buildWebchat({ root = REPO, outDir = path.join(root, 'docs/webchat'), models = null, metaOnly = false, surprise = false, log = () => {} } = {}) {
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
      if (f === 'coverage.md') {   // not in index.json; the debug view (developer mode) fetches it on demand
        await mkdir(path.join(outDir, 'worlds', id), { recursive: true });
        await cp(path.join(dir, f), path.join(outDir, 'worlds', id, f));
        continue;
      }
      if (f === 'describe.sop') {   // only the `slot=` declarations (spec 16 section 8) go to the browser, not the wording
        const decl = slotDeclarations(await readFile(path.join(dir, f), 'utf8'));
        if (decl) entry.files[f] = decl;
        continue;
      }
      if (BROWSER_SKIP.has(f)) continue;
      if (WORLD_TEXT.test(f)) entry.files[f] = await readFile(path.join(dir, f), 'utf8');
      else if (f.endsWith('.mjs')) {
        await mkdir(path.dirname(path.join(outDir, 'worlds', id, f)), { recursive: true });
        await cp(path.join(dir, f), path.join(outDir, 'worlds', id, f));
      }
    }
    if (await exists(path.join(dir, 'ops.mjs'))) entry.opsUrl = `worlds/${id}/ops.mjs`;
    if (await exists(path.join(dir, 'fns.mjs'))) entry.fnsUrl = `worlds/${id}/fns.mjs`;   // the actions and reply words of a matrix world (spec 15), loaded only with the matrix reasoner
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
  const graph = await versionGraph(outDir);   // rewrites the imports of lib/ and worlds/ to versioned URLs
  const build = { commit: gitCommit(root), builtAt: new Date().toISOString() };
  await writeEarlyLoad({ outDir, tabFiles, ids, graph, build });

  // 3b. dispatcher model for the Encoder formalizer (optional)
  const modelFiles = models ? await copyDispatcherModel({ root, outDir, exportDir: typeof models === 'string' ? models : DEFAULT_MODEL_EXPORT, metaOnly, log }) : null;

  // 3c. SURPRISE pool: validated against the source worlds with the rules formalizer
  if (surprise) {
    const [{ createFsLoader }, { createEngine }, { buildSurprisePool }] = await Promise.all([import('../src/loaders/fs-loader.mjs'), import('../src/dialog/index.mjs'), import('../src/dialog/surprise.mjs')]);
    const { pool, dropped } = await buildSurprisePool(await createEngine({ loader: createFsLoader({ roots: [worldsRoot] }) }));
    await writeFile(path.join(outDir, 'surprise-pool.json'), JSON.stringify(pool) + '\n');
    log(`webchat: surprise pool ${pool.length} examples (${dropped.length} dropped)`);
  }

  // 4. build info
  const files = {};
  for (const sub of ['lib', 'worlds']) {
    for (const f of await walk(path.join(outDir, sub))) files[`${sub}/${f}`] = sha(await readFile(path.join(outDir, sub, f)));
  }
  const info = { worlds: ids, tabs: tabFiles, dispatcherModel: !!modelFiles, files, builtAt: build.builtAt, commit: build.commit };
  await writeFile(path.join(outDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  log(`webchat: ${ids.length} worlds, ${Object.keys(files).length} files -> ${outDir}`);
  return info;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const outDir = i > 0 ? path.resolve(process.argv[i + 1]) : undefined;
  const m = process.argv.indexOf('--models');
  const models = m > 0 ? (process.argv[m + 1] && !process.argv[m + 1].startsWith('--') ? process.argv[m + 1] : true) : null;
  await buildWebchat({ outDir, models, metaOnly: process.argv.includes('--meta-only'), surprise: process.argv.includes('--surprise') || !(await exists(path.join(outDir ?? path.join(REPO, 'docs/webchat'), 'surprise-pool.json'))), log: console.log });
}
