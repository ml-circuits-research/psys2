#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * GLUE LINT (reviewer 2026-11-15 20:45, owner order): how much hand-written glue stands between a declared world and the generic mechanisms. Report-only: it counts, per declared
 * world (a world with request.sop), in every file reachable by relative imports from the door's surface (its tool.mjs, the operations the request door calls: the tool
 * primitives, the view, the scene executor, undo / redo), else from its ops.mjs (inside the repository, the vendored library excepted):
 *   requestReads  reads of the request, the plan or its facts in world code (goal.request / goal.facts / goal.steps / goal.plan / goal.roles, .constraints, readRequest ...)
 *   wordLiterals  string literals equal to a word the world declares in request.sop (a kind, a value of a slot enum: sizes, places, layouts) — words that belong in the declarations
 *   replies       reply sentences written in code ("I drew ...", "There is no ...", "Where should ...")
 *   textRegex     regular expressions run on text (.test / .exec / .match / .replace with a regex literal, new RegExp)
 * The numbers go down as worlds become tool primitives + views + declarations (std.tool.op / param / bind). Never a gate.
 *
 *   node scripts/glue-lint.mjs [--json] [--ops]     --ops: from ops.mjs for every world (the measure before the door had its own surface)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The files reachable from one file by relative imports (the vendored library and node: modules excepted). */
function reachable(entry) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f) || !existsSync(f) || f.includes(`${join('src', 'vendor')}`)) continue;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const p = resolve(dirname(f), m[1] ?? m[2]);
      if (/\.m?js$/.test(p)) todo.push(p);
    }
  }
  return [...seen];
}

/** The words a world declares in request.sop: its kinds and the enum values of its slots. */
function declaredWords(text) {
  const words = new Set();
  for (const m of text.matchAll(/^@\S+ std\.schema\.kind of=("[^"]+"|\S+)/gm)) words.add(m[1].replace(/^"|"$/g, ''));
  for (const m of text.matchAll(/^@\S+ core\.slot [^\n]*$/gm)) for (const e of m[0].matchAll(/enum=("[^"]+"|\S+)/g)) words.add(e[1].replace(/^"|"$/g, ''));
  return words;
}

export function glueLint() {
  const out = {};
  for (const id of readdirSync(join(REPO, 'worlds')).sort()) {
    const req = join(REPO, 'worlds', id, 'request.sop'), tool = join(REPO, 'worlds', id, 'tool.mjs'), ops = existsSync(tool) && !process.argv.includes('--ops') ? tool : join(REPO, 'worlds', id, 'ops.mjs');   // the door's surface (tool.mjs: what the door calls) when the world has one, else all its operations
    if (!existsSync(req) || !existsSync(ops)) continue;
    const words = declaredWords(readFileSync(req, 'utf8'));
    const files = reachable(ops);
    const c = { files: files.length, requestReads: 0, wordLiterals: 0, replies: 0, textRegex: 0, byFile: {} };
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');   // comments are not glue
      const n = {
        requestReads: (code.match(/\bgoal\.(?:request|facts|steps|plan|roles)\b|\.constraints\b|\breadRequest\b|\brequest\.facts\b/g) ?? []).length,
        wordLiterals: [...code.matchAll(/(['"])([a-z][a-z_ ]{1,30})\1/g)].filter((m) => words.has(m[2])).length,
        replies: (code.match(/['"`](?:I |I'|The |There |What |Where |Which |It |Say |Try |OK|Here )[^'"`\n]{6,}/g) ?? []).length,
        textRegex: (code.match(/\/(?![*/])(?:\\.|[^/\n\\])+\/[gimsuy]*\.(?:test|exec)\(|\.(?:match|matchAll|replace|replaceAll|split|search)\(\s*\/(?![*/])|new RegExp\(/g) ?? []).length,
      };
      for (const k of Object.keys(n)) c[k] += n[k];
      if (Object.values(n).some((x) => x)) c.byFile[relative(REPO, f)] = n;
    }
    out[id] = c;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = glueLint();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log('world            files  requestReads  wordLiterals  replies  textRegex');
    for (const [id, c] of Object.entries(r)) console.log(`${id.padEnd(16)} ${String(c.files).padStart(5)}  ${String(c.requestReads).padStart(12)}  ${String(c.wordLiterals).padStart(12)}  ${String(c.replies).padStart(7)}  ${String(c.textRegex).padStart(9)}`);
  }
}
