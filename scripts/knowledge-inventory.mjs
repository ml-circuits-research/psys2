// SPDX-License-Identifier: AGPL-3.0-only
// KNOWLEDGE-OUT step 1: the inventory of general knowledge held by the worlds. Lists
//   - every fact type of each world's kb.sop (with its wire count),
//   - every data table in world code (a top-level const holding at least TABLE_MIN quoted words),
//   - every lexicon group (worlds/<w>/lexicon.sop) with at least GROUP_MIN words,
// each with its catalog counterpart (the catalog world whose vocabulary overlaps the item's words most, by name) or "none".
//   node scripts/knowledge-inventory.mjs [--catalog <docs/worlds folder>] [--out <markdown file>] [--json] [--update-baseline]
// The test tests/knowledge-inventory.test.mjs reads `inventory()` and fails when an item is NEW or grew against tests/fixtures/knowledge-inventory-baseline.json
// (today's allowed items; the file shrinks as items move to the catalog: run with --update-baseline after a move, never to admit a new general fact).
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
export const BASELINE = path.join(ROOT, 'tests/fixtures/knowledge-inventory-baseline.json');
export const TABLE_MIN = 10, GROUP_MIN = 8;

/** Worlds that do not hold knowledge of the world at large: the application, the user, the session, the shared phrase library, platform fixtures of a game or a sample. */
export const EXEMPT = {
  'ui.help': 'facts about the application', 'ui.shell': 'facts about the application', 'user.profile': 'facts about the user', 'meta.worlds': 'facts about the worlds',
  'lang.common': 'shared phrase library (ADR-007)', core: 'platform core', 'session.conversation': 'the session', 'session.dialogue': 'the session', 'session.things': 'the session',
};
/** Item names that are the world's own sample data (stays, marked as such) or rules of a game. */
export const SAMPLE = new Set(['kids.shop|kb|kids.shop.price', 'media.music|kb|media.music.song']);

const worldsDir = path.join(ROOT, 'worlds');
const listWorlds = () => readdirSync(worldsDir).filter((d) => statSync(path.join(worldsDir, d)).isDirectory() && !EXEMPT[d]).sort();
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/** { world, type, wires } for each fact type of each kb.sop (`@id type ...`, the attributes may follow on indented lines). */
function kbTypes(world) {
  const counts = new Map();
  for (const line of read(path.join(worldsDir, world, 'kb.sop')).split('\n')) {
    const m = /^@\S+\s+(\S+)/.exec(line);
    if (!m || m[1].startsWith('core.')) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts].map(([type, n]) => ({ kind: 'kb', world, name: type, size: n, words: [] }));
}
function kbWords(world, type) {
  const out = new Set();
  const lines = read(path.join(worldsDir, world, 'kb.sop')).split('\n');
  let on = false;
  for (const l of lines) {
    const h = /^@\S+\s+(\S+)/.exec(l);
    if (h) on = h[1] === type;
    if (!on) continue;
    for (const m of l.matchAll(/\b(?:name|key|word|text)=("[^"]*"|\S+)/g)) out.add(m[1].replace(/"/g, '').replace(/_/g, ' ').toLowerCase());
  }
  return [...out];
}

/** The quoted words of a top-level `const NAME = [ ... ]` / `{ ... }` / `new Set([...])` / `new Map([...])`, or null when it holds fewer than TABLE_MIN. */
function codeTables(file, world) {
  const src = read(file), out = [];
  const re = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:new\s+(?:Set|Map)\(\s*)?([[{])/gm;
  for (let m; (m = re.exec(src));) {
    let i = m.index + m[0].length, depth = 1, words = [];
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
        const s = src.slice(i + 1, j);
        if (c !== '`' && /^[A-Za-z][A-Za-z' -]{1,30}$/.test(s)) words.push(s.toLowerCase());
        i = j + 1; continue;
      }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '[' || c === '{' || c === '(') depth++;
      else if (c === ']' || c === '}' || c === ')') depth--;
      i++;
    }
    words = [...new Set(words)];
    if (words.length >= TABLE_MIN) out.push({ kind: 'table', world, name: `${path.relative(ROOT, file)}:${m[1]}`, size: words.length, words });
  }
  return out;
}

/** Lexicon groups with their words: `@lex.<w>.<group> core.lexicon` then indented `word=` lines. */
function lexiconGroups(world) {
  const out = [];
  let cur = null;
  for (const line of read(path.join(worldsDir, world, 'lexicon.sop')).split('\n')) {
    const h = /^@(\S+)\s+core\.lexicon/.exec(line);
    if (h) { cur = { kind: 'lexicon', world, name: h[1], size: 0, words: [] }; out.push(cur); continue; }
    if (!cur) continue;
    const m = /^\s+word=(\S+)/.exec(line);
    if (m) { cur.size++; cur.words.push(m[1].replace(/"/g, '').replace(/_/g, ' ').toLowerCase()); }
  }
  return out.filter((g) => g.size >= GROUP_MIN);
}

function jsFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== 'vendor') out.push(...jsFiles(p)); } else if (f.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/** Every item of every non-exempt world: { kind, world, name, size, words }. Deterministic order. */
export function inventory() {
  const items = [];
  for (const w of listWorlds()) {
    for (const t of kbTypes(w)) items.push({ ...t, words: kbWords(w, t.name) });
    for (const f of jsFiles(path.join(worldsDir, w))) items.push(...codeTables(f, w));
    items.push(...lexiconGroups(w));
  }
  return items.map((i) => ({ ...i, key: `${i.world}|${i.kind}|${i.name}`, sample: SAMPLE.has(`${i.world}|${i.kind}|${i.name}`) }));
}

/** The catalog world whose vocabulary holds most of the words ("none" below 25%): reads the catalog's vocab.json and index.json by name only. */
export function counterparts(items, catalogDir) {
  let vocab = null;
  try { vocab = JSON.parse(read(path.join(catalogDir, 'vocab.json'))); } catch { /* no catalog */ }
  return items.map((it) => {
    if (!vocab || !it.words.length) return { ...it, counterpart: 'none', overlap: 0 };
    const per = new Map();
    let hit = 0;
    for (const w of it.words) {
      const sh = vocab[w] ?? vocab[w.replace(/ies$/, 'y')] ?? vocab[w.replace(/s$/, '')];
      if (!sh?.length) continue;
      hit++;
      for (const w2 of new Set(sh.map((s) => s.split('/')[0]))) per.set(w2, (per.get(w2) ?? 0) + 1);
    }
    const best = [...per].sort((a, b) => b[1] - a[1])[0];
    const overlap = hit / it.words.length;
    return { ...it, counterpart: overlap >= 0.25 && best ? best[0] : 'none', overlap: Math.round(overlap * 100), best: best?.[0] ?? null };
  });
}

/** Items that are new or bigger than the baseline allows. */
export function violations(items, baseline = JSON.parse(read(BASELINE) || '{}')) {
  return items.filter((i) => !i.sample && (baseline[i.key] === undefined || i.size > baseline[i.key])).map((i) => ({ key: i.key, size: i.size, allowed: baseline[i.key] ?? null }));
}

function markdown(items, catalogDir) {
  const out = ['# Knowledge inventory 2026-11-13 (KNOWLEDGE-OUT step 1)', '',
    `Generated by \`node scripts/knowledge-inventory.mjs\` against the catalog at \`${catalogDir}\`. A checklist: tick an item when it is read from the catalog and deleted from the world.`,
    `Items: kb fact types, code tables (>= ${TABLE_MIN} words) and lexicon groups (>= ${GROUP_MIN} words) of every world that is not exempt (${Object.keys(EXEMPT).join(', ')}). Counterpart: the catalog world whose vocabulary holds at least 25% of the item's words, else none. Samples that stay (marked) are not listed as to-move.`, ''];
  const byWorld = new Map();
  for (const i of items) (byWorld.get(i.world) ?? byWorld.set(i.world, []).get(i.world)).push(i);
  for (const [w, list] of byWorld) {
    out.push(`## ${w}`, '', '| done | kind | item | size | counterpart | overlap |', '| --- | --- | --- | ---: | --- | ---: |');
    for (const i of list) out.push(`| [ ] | ${i.kind} | \`${i.name}\`${i.sample ? ' (sample, stays)' : ''} | ${i.size} | ${i.counterpart === 'none' ? 'none' : i.counterpart} | ${i.overlap}% |`);
    out.push('');
  }
  const none = items.filter((i) => i.counterpart === 'none' && !i.sample);
  out.push('## Items with no counterpart in the catalog', '', ...none.map((i) => `- [ ] ${i.world}: \`${i.name}\` (${i.kind}, ${i.size})`), '');
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const catalogDir = arg('--catalog', path.join(ROOT, 'tests/fixtures/catalog'));
  const items = counterparts(inventory(), catalogDir);
  if (process.argv.includes('--update-baseline')) {
    writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(items.filter((i) => !i.sample).map((i) => [i.key, i.size])), null, 1)}\n`);
    console.log(`baseline: ${items.length} items`);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(items.map(({ words, ...r }) => r), null, 1));
  const out = arg('--out', null);
  if (out) { writeFileSync(out, markdown(items, catalogDir)); console.log(`wrote ${out}: ${items.length} items, ${items.filter((i) => i.counterpart !== 'none').length} with a counterpart`); }
  else if (!process.argv.includes('--json')) console.log(markdown(items, catalogDir));
}
