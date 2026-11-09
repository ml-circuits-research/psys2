#!/usr/bin/env node
/**
 * Migrates the patterns of one world to the phrase macros of `lang.common` (L4, spec 03 section 2.5).
 *
 *   node scripts/migrate-macros.mjs <world> [--write] [--verbose]
 *
 * For every pattern `match`:
 *   - alternatives that can never match (the tokenizer always drops their words: please, ok, okay, well, um) are removed from every group;
 *     a group left empty disappears when it is optional;
 *   - an optional lead-in or suffix group (3 or more alternatives; the optional groups before the first and after the last other
 *     element) whose alternatives are mostly (>= 50 %, at least 3) in a macro becomes `[$macro]?`; alternatives outside every
 *     macro stay inline next to it (`[$lang.lead.polite|my_own_phrase]?`);
 *   - groups it cannot map are kept (minus unreachable alternatives) and listed in the report;
 *   - identical remaining inline lists (3+ alternatives, 40+ bytes) that occur in 2+ groups become world-local phrases
 *     `phrase.<world>.g<N>_<first alt>` appended to lexicon.sop (and lexicon.extra.sop when the world has one), `frame=false` unless
 *     every use is a lead-in or suffix.
 * Dry run by default (report only). With --write the world's patterns.sop is rewritten in place; nothing but `match=` lines change.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse, getAll } from '../src/soplang/index.mjs';
import { parseGroup, rolesOf, isUnreachable, MIN_GROUP } from './lib/phrase-groups.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'worlds');
const argv = process.argv.slice(2);
const world = argv.find((a) => !a.startsWith('--'));
const WRITE = argv.includes('--write'), VERBOSE = argv.includes('--verbose');
if (!world) { console.error('usage: node scripts/migrate-macros.mjs <world> [--write] [--verbose]'); process.exit(2); }
const file = join(ROOT, world, 'patterns.sop');
if (!existsSync(file)) { console.error(`no ${file}`); process.exit(2); }

/** Macros of lang.common: id -> Set of alternatives (joined with _), by role. */
const macros = new Map();
for (const x of parse(readFileSync(join(ROOT, 'lang.common', 'lexicon.sop'), 'utf8')).wires) {
  if (x.type !== 'core.phrase') continue;
  macros.set(x.id.replace(/^phrase\./, ''), new Set(getAll(x, 'alt').map((v) => v.v)));
}
// only the frame groups seeded for patterns: `lang.lead.ask` (and the other L8 groups) are lists for ctx.lang.stripLead and say more than a pattern lead-in may
const ROLE_MACROS = { lead: ['lang.lead.polite', 'lang.lead.question', 'lang.lead.filler'].filter((k) => macros.has(k)), tail: [...macros.keys()].filter((k) => k.startsWith('lang.tail.')) };

const stats = { patterns: 0, changed: 0, groups: 0, mapped: 0, dropped: 0, droppedGroups: 0, leftover: 0, local: 0, localUses: 0 };
const unmapped = new Map();

/** Pass 1 on one element: a group becomes { macros, inline, optional, role } (null = removed); other elements stay strings. */
function mapGroup(part, role) {
  const g = parseGroup(part);
  if (!g) return part;
  const existing = g.alts.filter((a) => a.startsWith('$')).map((a) => a.slice(1));
  const alts = g.alts.filter((a) => a !== '' && !a.startsWith('$'));
  const reachable = alts.filter((a) => !isUnreachable(a));
  stats.groups++;
  stats.dropped += alts.length - reachable.length;
  if (!reachable.length && !existing.length) {
    if (g.optional) { stats.droppedGroups++; return null; }
    return part;   // a required group of only unreachable alternatives: leave for review
  }
  let macrosUsed = [...existing], inline = reachable;
  if (role !== 'body' && g.optional && alts.length >= MIN_GROUP) {
    const cover = ROLE_MACROS[role].map((id) => ({ id, hit: reachable.filter((a) => macros.get(id).has(a)) })).filter((c) => c.hit.length >= Math.max(1, MACRO_SHARE * reachable.length));   // a macro that covers only a few alternatives of the group would add all its other alternatives: widening
    const covered = new Set(cover.flatMap((c) => c.hit));
    if (covered.size >= 1 && covered.size >= reachable.length / 2) {
      cover.sort((a, b) => b.hit.length - a.hit.length);
      macrosUsed = [...new Set([...existing, ...cover.map((c) => c.id)])];
      inline = reachable.filter((a) => !covered.has(a));
      stats.mapped++; stats.leftover += inline.length;
      if (VERBOSE && inline.length) console.error(`  inline next to macro: ${inline.join(' ')}`);
    } else {
      const key = `${role}: ${reachable.slice(0, 8).join('|')}${reachable.length > 8 ? '|...' : ''}`;
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
    }
  }
  return { macros: macrosUsed, inline, optional: g.optional, role, orig: part };
}

const MACRO_SHARE = 0.3;   // a macro is used for a group only when it holds at least this share of the group's alternatives
const LOCAL_MIN_ALTS = 3, LOCAL_MIN_BYTES = 40;
const localPhrases = new Map();   // inline key -> { id, alts, frame, uses }

function render(e) {
  if (typeof e === 'string') return e;
  const local = localPhrases.get(e.inline.join('|'));
  const inlineOk = e.inline.length >= LOCAL_MIN_ALTS && local?.uses >= 2;
  const items = [...e.macros.map((id) => '$' + id), ...(inlineOk ? ['$' + local.id] : e.inline)];
  if (inlineOk) stats.localUses++;
  return `[${items.join('|')}]${e.optional ? '?' : ''}`;
}

function mapMatch(match) {
  const parts = match.trim().split(/\s+/);
  const roles = rolesOf(parts);
  return parts.map((part, k) => mapGroup(part, roles[k])).filter((r) => r !== null);
}

const text = readFileSync(file, 'utf8');
const lines = text.split('\n');
const MATCH = /^(\s+match=)"((?:[^"\\]|\\.)*)"\s*$/;
const mapped = [];   // [{ i, prefix, orig, elements }]
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(MATCH);
  if (!m) continue;
  stats.patterns++;
  const orig = m[2].replace(/\\(["\\])/g, '$1');
  mapped.push({ i, prefix: m[1], orig, elements: mapMatch(orig) });
}
// pass 2: identical inline lists that remain in two or more groups become world-local phrases (exact: same alternatives, same order)
const counts = new Map();
for (const { elements } of mapped) for (const e of elements) {
  if (typeof e === 'string' || e.inline.length < LOCAL_MIN_ALTS) continue;
  const key = e.inline.join('|');
  if (key.length < LOCAL_MIN_BYTES) continue;
  if (e.inline.some((a) => !/^[A-Za-z0-9_.'-]+$/.test(a))) continue;   // a punctuation alternative (`:`, `=`) is not a SOP atom: the group stays inline
  const c = counts.get(key) ?? { n: 0, frame: true };
  c.n++; if (e.role === 'body') c.frame = false;
  counts.set(key, c);
}
const lexFile = join(ROOT, world, 'lexicon.sop');
const lexText = existsSync(lexFile) ? readFileSync(lexFile, 'utf8') : '';
let serial = 0;
for (const [key, c] of [...counts].sort((a, b) => b[1].n * b[0].length - a[1].n * a[0].length)) {
  if (c.n < 2) continue;
  const alts = key.split('|');
  let id;
  do { id = `${world}.g${++serial}_${alts[0].replace(/[^a-z0-9_]/g, '')}`; } while (lexText.includes(`@phrase.${id} `));
  localPhrases.set(key, { id, alts, frame: c.frame, uses: c.n });
  stats.local++;
}
for (const { i, prefix, orig, elements } of mapped) {
  const next = elements.map(render).join(' ');
  if (next === orig) continue;
  if (!next.trim()) { console.error(`line ${i + 1}: migration would empty the match; kept`); continue; }
  stats.changed++;
  lines[i] = `${prefix}"${next.replace(/(["\\])/g, '\\$1')}"`;
}
const phraseText = [...localPhrases.values()].map((p) => `@phrase.${p.id} core.phrase\n${p.frame ? '' : '    frame=false\n'}    doc="World-local group used by ${p.uses} patterns (made by scripts/migrate-macros.mjs)."\n${p.alts.map((a) => `    alt=${a}\n`).join('')}`).join('\n');
const out = lines.join('\n');
console.log(`${world}: ${stats.patterns} patterns, ${stats.changed} changed; groups ${stats.groups}: ${stats.mapped} mapped to lang.common macros (${stats.leftover} alternatives left inline), ${stats.dropped} unreachable alternatives dropped, ${stats.droppedGroups} empty groups removed; ${stats.local} world-local phrases for repeated lists (${stats.localUses} uses)`);
console.log(`patterns.sop ${text.length} -> ${out.length} bytes (${((1 - out.length / text.length) * 100).toFixed(1)} % smaller)`);
if (unmapped.size) {
  console.log(`unmapped lead-in / suffix groups (kept inline), ${unmapped.size} distinct:`);
  for (const [k, n] of [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}x ${k.length > 160 ? k.slice(0, 160) + '...' : k}`);
}
if (WRITE) {
  writeFileSync(file, out);
  if (phraseText) {
    // the avatar's lexicon.sop is generated and ends with lexicon.extra.sop verbatim: keep both in step
    for (const f of ['lexicon.sop', 'lexicon.extra.sop']) {
      const path = join(ROOT, world, f);
      if (existsSync(path)) writeFileSync(path, readFileSync(path, 'utf8').replace(/\n*$/, '\n\n') + phraseText);
    }
  }
  console.log(`wrote ${file}${phraseText ? ' and the world-local phrases in lexicon.sop' : ''}`);
} else console.log('dry run (pass --write to rewrite the file)');
