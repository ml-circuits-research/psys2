#!/usr/bin/env node
/**
 * PSys2 command line (spec 06): chat, test-world <id|all>, parse <file>, formalize "<text>".
 * Options: --root <dir> (repeatable) adds world roots; defaults to <repo>/worlds.
 * --jobs N (test-world all): worlds run in min(N, worlds) worker threads, default os.availableParallelism(); output stays in world order
 * and the exit code is unchanged (--jobs 1 runs in-process).
 */
import { readFile } from 'node:fs/promises';
import readline from 'node:readline/promises';
import { createFsLoader, DEFAULT_ROOT } from './loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from './dialog/index.mjs';
import { parse, serialize } from './soplang/index.mjs';
import { formalize, FormSession } from './formalizer/index.mjs';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { parseJobs, runSharded, serveShard } from '../scripts/lib/shard.mjs';

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
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') roots.push(argv[++i]);
    else rest.push(argv[i]);
  }
  return { roots: roots.length ? [...roots, DEFAULT_ROOT] : [DEFAULT_ROOT], rest };
}

async function makeEngine(roots) {
  return createEngine({ loader: createFsLoader({ roots }), translator: await loadTranslator() });
}

const SELF = fileURLToPath(import.meta.url);

async function testOne(eng, id) {
  if (!eng.set.get(id)) return { lines: [`${id}: unknown world`], bad: 1 };
  const r = await runWorldTests(eng, id);
  const note = r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0].reason})` : '';
  return { lines: [`${id}: ${r.passed}/${r.total - r.skipped.length} passed${note}`, ...r.failed.map((f) => `  FAIL ${f.id}: ${f.message}`)], bad: r.failed.length };
}

async function cmdTestWorld(roots, target) {
  const engine = await makeEngine(roots);
  const ids = !target || target === 'all' ? engine.set.list().map((w) => w.id) : [target];
  let bad = 0;
  const problems = engine.problems();
  const relevant = target && target !== 'all' ? problems.filter((p) => p.startsWith(target + ':') || p.startsWith('legend:')) : problems;
  for (const p of relevant) { console.log(`  problem: ${p}`); bad++; }
  const jobs = Math.min(parseJobs(), ids.length);
  const results = jobs > 1
    ? await runSharded({ file: SELF, items: ids, jobs, chunk: 1, workerData: { roots } })
    : await (async () => { const out = []; for (const id of ids) out.push(await testOne(engine, id)); return out; })();
  for (const r of results) { for (const l of r.lines) console.log(l); bad += r.bad; }
  return bad ? 1 : 0;
}

async function cmdChat(roots) {
  const engine = await makeEngine(roots);
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
  const { roots, rest } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = rest;
  switch (cmd) {
    case 'chat': return cmdChat(roots);
    case 'test-world': return cmdTestWorld(roots, arg);
    case 'parse': return arg ? cmdParse(arg) : usage();
    case 'formalize': return arg ? cmdFormalize(roots, rest.slice(1).join(' ')) : usage();
    default: return usage();
  }
}

function usage() {
  console.error('usage: node src/cli.mjs chat | test-world <id|all> | parse <file.sop> | formalize "<text>"  [--root <dir>]');
  return 2;
}

if (!isMainThread) {
  serveShard(async (wd) => {
    const eng = await makeEngine(wd.roots);
    return (id) => testOne(eng, id);
  });
} else process.exitCode = await main();
