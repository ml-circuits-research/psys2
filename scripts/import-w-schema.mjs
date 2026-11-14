#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Takes a PUBLISHED world schema (a `w.*` world of the knowledge catalog, library `std.schema` format) as the schema of a live world
 * (THIN LIVE WORLDS, worker-tasks 2026-11-14 06:20 item 2 and 09:55): writes the world's `schema.sop` in the host's `acts.schema` format.
 *
 *   node scripts/import-w-schema.mjs <catalog dir> <w.id> <world dir> [--id <schema id>] [--check]
 *
 * What the published schema says is mapped once, here, never copied by hand:
 *   std.schema.kind of=T acts=...        -> `acts.kind` T (the acts of all kinds are the world's acts)
 *   core.slot key=K kind=number|integer  -> `acts.attr` K type=number (min, max, default, step)
 *   core.slot enum=a enum=b              -> type=enum values=a values=b
 *   core.slot kind=boolean               -> type=bool
 *   core.slot kind=string|atom           -> type=text
 *   core.slot key=name                   -> the kind is `named=yes` (the host names things, no attribute)
 *   core.slot key=K type=<w.x.kind>      -> the kind is `in=<kind>` (a reference to a container)
 *   std.schema.capacity of=C key=K via=V -> kind V gets `capacity=K` (a container of that size)
 *   std.schema.limit                     -> `limit.items` (sum)
 *   core.word means=<kind|slot> text=... -> `word=` of the kind or attribute (the plural is the word that is the name plus s)
 * What the schema cannot say is the host's and lives in the world's own `schema.host.sop` (hand-written, "truly own"): host acts (undo, redo, save, load, send),
 * `limit.history`, `tabOnly`, `hooks=`, aspects, the view's words, value words. A wire of that file with the id of a generated wire adds its entries to it; any other wire is appended.
 * What the host cannot take is listed in the header of the output (rules `core.deny`, slots with `many`), never dropped silently.
 * The output starts with "GENERATED", so the landing table counts it as a generated file, not as hand-written lines.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { en } from '../src/lang/en.mjs';

/** Closed-class words of w.lang.en (prepositions, determiners, pronouns, question words, auxiliaries): never an attribute or kind word of a world ("in", "where", "with" are the grammar's). */
const CLOSED = new Set(['prep', 'det', 'pron', 'wh', 'aux'].flatMap((t) => { try { return [...en.words(t)]; } catch { return []; } }));
const open = (t) => !CLOSED.has(t.replace(/_/g, ' ')) && !CLOSED.has(t);

const vals = (w, k) => w.entries.filter((e) => e.key === k).map((e) => String(e.value.v));
const val = (w, k) => vals(w, k)[0];

export function convert({ text, overlay = '', id, wid, version }) {
  const { wires, errors } = parse(text, { source: `${wid}/schema.sop` });
  if (errors.length) throw new Error(`${wid}: ${errors[0].message}`);
  const mod = wires.find((w) => w.type === 'core.module');
  const world = wires.find((w) => w.type === 'std.schema.world');
  const short = (full) => full.replace(new RegExp(`^${wid.replace(/\./g, '\\.')}\\.`), '');
  const kindRules = new Map(wires.filter((w) => w.type === 'std.schema.kind').map((w) => [short(val(w, 'of')), w]));
  const types = wires.filter((w) => w.type === 'core.type');
  const kinds = types.filter((w) => kindRules.has(short(val(w, 'of'))));   // a type with an act rule is a kind of the live world; a parent with none (w.face.part) only passes its slots down
  const parentOf = new Map(types.map((t) => [short(val(t, 'of')), short(val(t, 'extends') ?? '')]));
  const lineage = (name) => { const out = []; for (let n = name; n && parentOf.has(n); n = parentOf.get(n)) out.push(n); return out; };
  const kindIds = new Set(kinds.map((k) => short(val(k, 'of'))));
  const rawSlots = wires.filter((w) => w.type === 'core.slot');
  // every slot of a kind and of the parents it extends, as { s: slot wire, of: kind name }
  const slotRows = kinds.flatMap((k) => { const name = short(val(k, 'of')); return rawSlots.filter((s) => lineage(name).includes(short(val(s, 'of')))).map((s) => ({ s, of: name })); });
  const words = wires.filter((w) => w.type === 'core.word');
  const wordsOf = (means) => words.filter((w) => val(w, 'means') === means).flatMap((w) => vals(w, 'text'));
  const skipped = [];
  const out = [];
  const acts = [...new Set([...kindRules.values()].flatMap((w) => vals(w, 'acts')))];
  const limits = wires.filter((w) => w.type === 'std.schema.limit').reduce((a, w) => a + Number(val(w, 'max') ?? 0), 0);
  const head = { id, noun: (val(world, 'doc') ?? wid).split(':')[0].replace(/^(a|an|the)\s+/i, ''), doc: val(world, 'doc') ?? '', acts, limit: limits };
  const capacity = wires.filter((w) => w.type === 'std.schema.capacity');
  const schemaWire = [`@${id} acts.schema`, `    noun="${head.noun.replace(/"/g, "'")}"`, `    doc="${head.doc.replace(/"/g, "'")} (taken from the published world schema ${wid} ${version ?? ''}; scripts/import-w-schema.mjs)"`, ...acts.map((a) => `    acts=${a}`)];
  if (limits) schemaWire.push(`    limit.items=${Math.min(limits, 100)}`);
  // kinds
  const kindWires = [];
  for (const k of kinds) {
    const name = short(val(k, 'of'));
    const mine = slotRows.filter((r) => r.of === name).map((r) => r.s);
    const refs = mine.filter((s) => kindIds.has(short(val(s, 'type') ?? '')));
    const named = mine.some((s) => val(s, 'key') === 'name');
    const kw = words.filter((w) => val(w, 'means') === val(k, 'of')).flatMap((w) => vals(w, 'text')).map((t) => t.replace(/\s+/g, '_'));
    const plural = kw.find((t) => t === `${name}s`) ?? `${name}s`;
    const cap = capacity.find((c) => short(val(c, 'holds')) === name);
    const lines = [`@${id}.${name} acts.kind`, `    plural=${plural}`];
    if (named) lines.push('    named=yes');
    if (refs.length) lines.push(`    in=${short(val(refs[0], 'type'))}`);
    if (cap) lines.push(`    capacity=${val(cap, 'key')}`);
    for (const t of [...new Set(kw)].filter((t) => t !== name && t !== plural && open(t))) lines.push(`    word=${t}`);
    kindWires.push(lines.join('\n'));
  }
  // attributes: one per key, the kinds that have it in `of=`
  const byKey = new Map();
  for (const { s, of } of slotRows) {
    const key = val(s, 'key');
    if (key === 'name' || refsKind(s)) continue;
    if (kindIds.has(key)) { skipped.push(`${of}.${key}: the name is also a kind of the world (the host names attributes and kinds in one space)`); continue; }
    if (vals(s, 'many').includes('true')) { skipped.push(`${of}.${key} (many): the host has one value per attribute`); continue; }
    if (!byKey.has(key)) byKey.set(key, { slot: s, of: [] });
    byKey.get(key).of.push(of);
  }
  function refsKind(s) { return kindIds.has(short(val(s, 'type') ?? '')); }
  const attrWires = [];
  for (const [key, { slot, of }] of byKey) {
    const kind = vals(slot, 'kind'), enums = vals(slot, 'enum');
    const type = /colou?r$/.test(key) ? 'colour' : enums.length ? 'enum' : kind.includes('boolean') ? 'bool' : kind.some((x) => x === 'number' || x === 'integer') ? 'number' : 'text';
    const lines = [`@${id}.${key} acts.attr`, ...of.map((o) => `    of=${o}`), `    type=${type}`];
    for (const e of enums) lines.push(`    values=${e}`);
    if (val(slot, 'min') != null) lines.push(`    min=${val(slot, 'min')}`);
    if (val(slot, 'max') != null) lines.push(`    max=${val(slot, 'max')}`);
    if (val(slot, 'default') != null && type !== 'bool') lines.push(`    default=${val(slot, 'default')}`);
    if (val(slot, 'step') != null) lines.push(`    step=${val(slot, 'step')}`);
    for (const t of [...new Set(of.flatMap((o) => lineage(o).flatMap((a) => wordsOf(`${wid}.${a}.${key}`))).concat(wordsOf(`${wid}.${key}`)))].map((t) => t.replace(/\s+/g, '_')).filter((t) => t !== key && open(t))) lines.push(`    word=${t}`);
    attrWires.push(lines.join('\n'));
  }
  for (const d of wires.filter((w) => w.type === 'core.deny')) skipped.push(`${d.id.replace(wid + '.', '')} (core.deny): checked by the library world, not by the host executor`);
  // overlay: entries of a wire with a generated id are added, other wires are appended
  const parts = [schemaWire.join('\n'), ...kindWires, ...attrWires];
  const ov = parse(overlay, { source: 'schema.host.sop' });
  if (ov.errors.length) throw new Error(`schema.host.sop: ${ov.errors[0].message}`);
  const blocks = overlay.split(/\n(?=@)/).filter((b) => /^@/.test(b));
  const idOf = (b) => /^@(\S+)/.exec(b)?.[1];
  const result = parts.map((p) => {
    const extra = blocks.filter((b) => idOf(b) === idOf(p));
    if (!extra.length) return p;
    const replaces = new Set(extra.flatMap((b) => b.split('\n').slice(1)).map((l) => /^\s*(noun|in|capacity|default)=/.exec(l)?.[1]).filter(Boolean));   // a single-valued entry of the host replaces the generated one
    p = p.split('\n').filter((l) => ![...replaces].some((k) => new RegExp(`^\\s*${k}=`).test(l))).join('\n');
    const seen = new Set(p.split('\n'));
    const add = extra.flatMap((b) => b.split('\n').slice(1)).filter((l) => l.trim() && !seen.has(l) && seen.add(l));   // entries the schema already has are not repeated
    return [p, ...add].join('\n');
  });
  const have = new Set(parts.map(idOf));
  for (const b of blocks) if (!have.has(idOf(b))) result.push(b.trim());
  const header = `# GENERATED by scripts/import-w-schema.mjs from the published world schema ${wid}${version ? ` version ${version}` : ''} and schema.host.sop (the host's own part). Never edited by hand.\n`
    + (skipped.length ? `# Not taken by the host (kept by the published schema): ${skipped.join('; ')}\n` : '');
  return { text: `${header}\n${result.join('\n\n')}\n`, skipped, version: val(mod, 'version') };
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [cat, wid, dir] = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--id');
  const idFlag = process.argv.indexOf('--id');
  const id = idFlag > 0 ? process.argv[idFlag + 1] : (() => { const t = readFileSync(join(dir, 'schema.host.sop'), 'utf8'); return /^@(\S+) acts\.schema/m.exec(t)[1]; })();
  const src = readFileSync(join(cat, wid, 'schema.sop'), 'utf8');
  const overlay = existsSync(join(dir, 'schema.host.sop')) ? readFileSync(join(dir, 'schema.host.sop'), 'utf8') : '';
  const version = /core\.module[^\n]*\bversion=(\d+)/.exec(src)?.[1];
  const { text } = convert({ text: src, overlay, id, wid, version });
  const f = join(dir, 'schema.sop');
  if (process.argv.includes('--check')) { if (!existsSync(f) || readFileSync(f, 'utf8') !== text) { console.error(`stale: ${basename(dir)}/schema.sop`); process.exit(1); } }
  else { writeFileSync(f, text); console.log(`written ${f} from ${wid} ${version ?? ''}`); }
}
