#!/usr/bin/env node
/**
 * PSys2 command line (spec 06): chat, test-world <id|all>, parse <file>, formalize "<text>".
 * Options: --root <dir> (repeatable) adds world roots; defaults to <repo>/worlds.
 * --jobs N (test-world all): worlds run in min(N, worlds) worker threads, default os.availableParallelism(); output stays in world order
 * and the exit code is unchanged (--jobs 1 runs in-process).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import readline from 'node:readline/promises';
import { createFsLoader, DEFAULT_ROOT } from './loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from './dialog/index.mjs';
import { parse, serialize } from './soplang/index.mjs';
import { formalize, FormSession } from './formalizer/index.mjs';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { parseJobs, runSharded, serveShard } from '../scripts/lib/shard.mjs';
import { budget } from './dialog/budget.mjs';
import { createFacts } from './knowledge/facts.mjs';
import { needsOf } from './dialog/knowledge-lookup.mjs';
import { createKnowledgeSource } from './loaders/knowledge-source.mjs';
import path from 'node:path';

import { applyReasonerFlag } from '../scripts/lib/reasoner-flag.mjs';
applyReasonerFlag();   // --reasoner ops|matrix (spec 15)

/** Load ../translate/index.mjs when it exists; returns a translator or null. */
async function loadTranslator() {
  try {
    const mod = await import('./translate/index.mjs');
    const t = typeof mod.createTranslator === 'function' ? mod.createTranslator() : (mod.default ?? mod);
    return typeof t.translate === 'function' && typeof t.detectLanguage === 'function' ? t : null;
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /translate/.test(String(e.message))) return null;
    if (e?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw e;
  }
}

function parseArgs(argv) {
  const roots = [];
  const rest = [];
  let noCatalog = false;
  for (let i = 0; i < argv.length; i++) {
    budget.tick('cli.parseArgs');
    if (argv[i] === '--root') roots.push(argv[++i]);
    else if (argv[i] === '--no-catalog') noCatalog = true;
    else if (argv[i] === '--reasoner') i++;   // read by applyReasonerFlag
    else if (argv[i].startsWith('--reasoner=')) continue;
    else rest.push(argv[i]);
  }
  return { roots: roots.length ? [...roots, DEFAULT_ROOT] : [DEFAULT_ROOT], rest, noCatalog };
}

async function makeEngine(roots) {
  // The historical grammar worlds need the legacy pattern compiler; the application composition never loads it.
  const { checkPattern } = await import('./formalizer/rules/index.mjs'), { expandShape } = await import('./formalizer/rules/shapes.mjs');
  return createEngine({ loader: createFsLoader({ roots }), translator: await loadTranslator(), options: { patterns: { checkPattern, expandShape } } });
}

const SELF = fileURLToPath(import.meta.url);

// A world that runs on a SOP area (it ships area.sop: worlds/sop-area.mjs reads it) keeps its old generated
// operations.sop / tests.sop only as a retired format: its commands are its area's act rules, the JavaScript those
// operations named is deleted, and its acceptance is the SOP-area suites of `npm test` (tests/*-sop-area*.test.mjs,
// tests/*-declared-host.test.mjs). test-world lists such a world as retired instead of running the old rows.
const sopAreaWorld = (roots, id) => roots.some((root) => existsSync(path.join(root, id, 'area.sop')));

async function testOne(eng, id, roots = [DEFAULT_ROOT]) {
  if (!eng.set.get(id)) return { lines: [`${id}: unknown world`], bad: 1 };
  if (sopAreaWorld(roots, id)) return { lines: [`${id}: retired format (runs on its SOP area; acceptance: npm test)`], bad: 0, first: 0 };
  // a world that needs catalog models (its `needs` hook: the avatar's faces) is tested against the local fixture of the catalog (tests/fixtures/catalog), never the network
  const needsCatalog = (needsOf(eng.set.get(id)).length > 0 || eng.set.get(id).lexicons.some((l) => l.open)) && !eng.knowledge;   // or a lexicon open to the catalog (open=knowledge)
  if (needsCatalog) eng.setKnowledge(createFacts({ source: createKnowledgeSource(path.join(DEFAULT_ROOT, '../tests/fixtures/catalog')) }));
  let r;
  try { r = await runWorldTests(eng, id); } finally { if (needsCatalog) eng.setKnowledge(null); }
  const note = r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0].reason})` : '';
  return { lines: [`${id}: ${r.passed}/${r.total - r.skipped.length} passed${note}`, ...r.failed.map((f) => `  FAIL ${f.id}${f.follower ? ' (follower)' : ''}: ${f.message}`)], bad: r.failed.length, first: r.failed.filter((f) => !f.follower).length };
}

async function cmdTestWorld(roots, target) {
  const engine = await makeEngine(roots);
  const ids = !target || target === 'all' ? engine.set.list().map((w) => w.id) : [target];
  let bad = 0;
  const problems = engine.problems();
  // The retired operations of a SOP-area world (their functions are deleted with the old tab code) are not problems.
  const retired = (p) => / ops\.mjs has no function /.test(p) && sopAreaWorld(roots, p.split(':')[0]);
  const relevant = (target && target !== 'all' ? problems.filter((p) => p.startsWith(target + ':') || p.startsWith('legend:')) : problems).filter((p) => !retired(p));
  for (const p of relevant) { console.log(`  problem: ${p}`); bad++; }
  const jobs = Math.min(parseJobs(), ids.length);
  const results = jobs > 1
    ? await runSharded({ file: SELF, items: ids, jobs, chunk: 1, workerData: { roots } })
    : await (async () => { const out = []; for (const id of ids) out.push(await testOne(engine, id, roots)); return out; })();
  let first = 0;
  for (const r of results) { for (const l of r.lines) console.log(l); bad += r.bad; first += r.first ?? r.bad; }
  console.log(`failing rows: ${bad}; first failures per session: ${first} (a session's later failing rows are followers)`);
  if (!target || target === 'all') { try { await writeFile(path.join(DEFAULT_ROOT, '../training/eval/test-world-last.json'), JSON.stringify({ date: new Date().toISOString().slice(0, 10), rawFailingRows: bad, firstFailures: first }) + '\n'); } catch { /* optional */ } }
  return bad ? 1 : 0;
}

async function cmdChat(roots, { noCatalog = false } = {}) {
  const engine = await makeEngine(roots);
  // the page's knowledge by default (the pinned catalog, read from the site copy, no network); --no-catalog runs without
  if (noCatalog) console.log('no catalog (--no-catalog)');
  else { const { attachPinnedCatalog, catalogLine } = await import('../scripts/lib/pinned-knowledge.mjs'); console.log(catalogLine(await attachPinnedCatalog(engine))); }
  const session = engine.createSession({ language: 'auto' });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('PSys2 chat. Worlds: ' + engine.worlds().map((w) => w.id).join(', ') + '. Type :memory, :trace or :quit.');
  let last = null;
  // Iterate lines (works for interactive use and for piped input, where rl.question loses buffered lines).
  rl.setPrompt('you> ');
  if (process.stdin.isTTY) rl.prompt();
  for await (let line of rl) {
    line = line.trim();
    if (!process.stdin.isTTY && line) console.log('you> ' + line);
    if (!line) { if (process.stdin.isTTY) rl.prompt(); continue; }
    if (!line) continue;
    if (line === ':quit') break;
    if (line === ':memory') console.log(session.memory());
    else if (line === ':trace') console.log(JSON.stringify(last?.trace, null, 2));
    else {
      last = await session.send(line);
      console.log('psys2> ' + last.text);
      for (const t of session.settleHeadless(last)) console.log('psys2> ' + t);   // the CLI is the host: engine moves fall back to the built-in player
    }
    if (process.stdin.isTTY) rl.prompt();
  }
  rl.close();
  return 0;
}

async function cmdParse(file) {
  const { wires, errors } = parse(await readFile(file, 'utf8'), { source: file });
  for (const e of errors) console.log(`${file}:${e.line}:${e.column}: ${e.message}`);
  console.log(`${wires.length} wires, ${errors.length} errors`);
  return errors.length ? 1 : 0;
}

async function cmdFormalize(roots, text) {
  const engine = await makeEngine(roots);
  const form = new FormSession();
  const defaults = form.initDefaults();
  void defaults;
  const { segments, wires } = formalize(text, { worlds: engine.set, session: form, source: 'cli' });
  for (const s of segments) {
    console.log(`# ${JSON.stringify(s.text)} ${s.unparsed ? 'UNPARSED' : s.match.patternId}${s.errors.length ? ' errors: ' + s.errors.join('; ') : ''}`);
  }
  process.stdout.write(serialize(wires));
  return segments.some((s) => s.unparsed) ? 1 : 0;
}

async function main() {
  const { roots, rest, noCatalog } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = rest;
  switch (cmd) {
    case 'chat': return cmdChat(roots, { noCatalog });
    case 'test-world': return cmdTestWorld(roots, arg);
    case 'parse': return arg ? cmdParse(arg) : usage();
    case 'formalize': return arg ? cmdFormalize(roots, rest.slice(1).join(' ')) : usage();
    default: return usage();
  }
}

function usage() {
  console.error('usage: node src/cli.mjs chat [--no-catalog] | test-world <id|all> | parse <file.sop> | formalize "<text>"  [--root <dir>] [--reasoner ops|matrix]');
  return 2;
}

if (!isMainThread) {
  serveShard(async (wd) => {
    const eng = await makeEngine(wd.roots);
    return (id) => testOne(eng, id, wd.roots);
  });
} else process.exitCode = await main();
