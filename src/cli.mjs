#!/usr/bin/env node
/**
 * PSys2 command line (spec 06): test-world <id|all>, parse <file>.
 * Options: --root <dir> (repeatable) adds world roots; defaults to <repo>/worlds.
 *
 * test-world: a world that runs on a SOP area (it ships area.sop) is accepted by the SOP-area suites of `npm test`; test-world runs the
 * suites of tests/*-sop-area*.test.mjs that name the world. The historical grammar worlds (patterns.sop read by the retired rule formalizer)
 * have no reader any more: they are listed as retired, never run.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEFAULT_ROOT } from './loaders/fs-loader.mjs';
import { parse } from './soplang/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const roots = [], rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') roots.push(argv[++i]);
    else rest.push(argv[i]);
  }
  return { roots: roots.length ? [...roots, DEFAULT_ROOT] : [DEFAULT_ROOT], rest };
}

const worldDir = (roots, id) => roots.map((root) => path.join(root, id)).find((dir) => existsSync(path.join(dir, 'world.sop'))) ?? null;
const sopAreaWorld = (roots, id) => roots.some((root) => existsSync(path.join(root, id, 'area.sop')));

async function listWorlds(roots) {
  const ids = new Set();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory() && existsSync(path.join(root, entry.name, 'world.sop'))) ids.add(entry.name);
  }
  return [...ids].sort();
}

/** The SOP-area suites that name the world (by its id). */
async function areaSuites(id) {
  const dir = path.join(REPO, 'tests'), out = [];
  for (const name of (await readdir(dir)).filter((n) => /-sop-area.*\.test\.mjs$/.test(n)).sort()) { const text = await readFile(path.join(dir, name), 'utf8'); if (text.includes(`worlds/${id}/`) || [`'${id}'`, `"${id}"`].some((q) => text.includes(q))) out.push(path.join('tests', name)); }
  return out;
}

async function cmdTestWorld(roots, target) {
  const ids = !target || target === 'all' ? await listWorlds(roots) : [target];
  let bad = 0;
  for (const id of ids) {
    if (!worldDir(roots, id)) { console.log(`${id}: unknown world`); bad++; continue; }
    if (!sopAreaWorld(roots, id)) { console.log(`${id}: retired grammar world (no reader runs its patterns)`); continue; }
    const suites = await areaSuites(id);
    if (!suites.length) { console.log(`${id}: SOP area without a suite that names it`); bad++; continue; }
    const r = spawnSync(process.execPath, ['--test', ...suites], { cwd: REPO, encoding: 'utf8' });
    const count = (k) => Number(new RegExp(`^# ${k} (\\d+)`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
    console.log(`${id}: ${count('pass')}/${count('tests')} passed (${suites.join(', ')})`);
    if (r.status !== 0) bad++;
  }
  return bad ? 1 : 0;
}

async function cmdParse(file) {
  const { wires, errors } = parse(await readFile(file, 'utf8'), { source: file });
  for (const e of errors) console.log(`${file}:${e.line}:${e.column}: ${e.message}`);
  console.log(`${wires.length} wires, ${errors.length} errors`);
  return errors.length ? 1 : 0;
}

function usage() {
  console.error('usage: node src/cli.mjs test-world <id|all> | parse <file.sop>  [--root <dir>]');
  return 2;
}

async function main() {
  const { roots, rest } = parseArgs(process.argv.slice(2));
  const [cmd, arg] = rest;
  switch (cmd) {
    case 'test-world': return cmdTestWorld(roots, arg);
    case 'parse': return arg ? cmdParse(arg) : usage();
    default: return usage();
  }
}

process.exitCode = await main();
