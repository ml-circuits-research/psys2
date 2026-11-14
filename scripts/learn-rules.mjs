#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FIRST `learnRules` RUN on the ledger (spec 16, "Learned reading rules"). Measurement only; nothing is told to a world and no rule reaches the runtime.
 *
*   node scripts/learn-rules.mjs [--with-cousin-pairs] [--facts k.animals] [--catalog <dir>] [--admit 1] [--min 2] [--degree 2] [--out file.json]
 *
 * Cases: (a) the texts of the failing paraphrase classes of training/eval/failures.jsonl that the library reads as an `ask` frame of a thing, with that frame; (b) the pairs of
 * training/eval/form-pairs.jsonl with same_meaning (a variant, and the frame of its canonical). A third of the cases (by a stable hash) are held out and never used to induce; the
 * VALID COUSINS of every case (library `cousins`) are held out too. Rules the library admits (all training cases pass, held-out share holds) are applied as a reading step in the
 * script only: judged on the held-out cases and on the cousins, the step reads a text by the learned rule when `readByTypes` does not read it as the case's frame.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from './cousins.mjs';
import { READ } from './lib/cousins-host.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const jsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const third = (t) => parseInt(createHash('sha1').update(t).digest('hex').slice(0, 6), 16) % 3 === 0;
const same = (a, b) => a && b && a.key === b.key && a.of?.id === b.of?.id;

const lib = await import('../src/vendor/sopworld/sopworld.mjs');
if (!lib.learnRules || !lib.cousins) throw new Error('the vendored sopworld has no learnRules / cousins');
const world = buildWorld(lib, { catalog: resolve(arg('catalog', join(REPO, 'tests/fixtures/catalog'))), facts: arg('facts', 'k.animals') });
// learnRules (0.84) takes the holder id as the holder's name token, so it learns on a copy of the world whose ids ARE the names (single-word names only: a rule binds one token per variable)
const lw = new lib.World();
const nameOf = (id) => String(world.get(id)?.attrs?.name?.[0] ?? '').replace(/^"|"$/g, '');
const simple = (id) => /^[a-z]+$/.test(nameOf(id));
for (const w of world.wires.values()) {
  if (w.type.startsWith('core.') || !simple(w.id)) continue;
  const at = Object.entries(w.attrs).filter(([k, v]) => !k.startsWith('core.') && k !== 'name' && v.length === 1 && /^[\w.-]+$/.test(String(v[0]).replace(/^"|"$/g, ''))).map(([k, v]) => `${k}=${String(v[0]).replace(/^"|"$/g, '')}`);
  try { lw.tell(`@${nameOf(w.id)} ${w.type} name=${nameOf(w.id)} ${at.join(' ')}`); } catch { /* a fact the library refuses is left out */ }
}
const toLearn = (c) => (simple(c.frame.of.id) ? { text: c.text, frame: { ...c.frame, of: { id: nameOf(c.frame.of.id) } } } : null);
const askOf = (text) => { const b = lib.readByTypes(world, text, READ).best; return b?.is === 'ask' && b.of?.id ? b : null; };

// the cases, with their source; a text is a case once
const seen = new Set(), all = [];
const add = (text, frame, source) => { if (!frame || seen.has(text)) return; seen.add(text); all.push({ text, frame, source }); };
for (const r of jsonl(join(REPO, 'training/eval/failures.jsonl'))) if (String(r.class ?? '').startsWith('paraphrase:')) add(r.text, askOf(r.text), 'ledger');
for (const r of jsonl(join(REPO, 'training/eval/form-pairs.jsonl'))) if (r.same_meaning && (r.source !== 'cousins' || process.argv.includes('--with-cousin-pairs'))) add(r.variant, askOf(r.canonical), r.source);
const learnable = all.map(toLearn).filter(Boolean);
const train = learnable.filter((c) => !third(c.text)), held = learnable.filter((c) => third(c.text));
const cousinsOf = (c) => lib.cousins(lw, { text: c.text, frame: c.frame }, { degree: Number(arg('degree', 2)), read: READ, known: all.map((x) => x.text), n: 8 });

const rules = lib.learnRules(lw, train, { heldOut: held, cousins: cousinsOf, admit: Number(arg('admit', 1)), min: Number(arg('min', 2)) });
const admitted = rules.filter((r) => r.admitted);

// the reading step, in the script: the learned rule reads the text when the typed reader does not give the case's frame
const enc = (text) => '@u utter ' + String(text).toLowerCase().replace(/[?!.]+\s*$/, '').match(/[\p{L}\p{N}_'-]+/gu).map((x, i) => `t${i + 1}=${x}`).join(' ');
const ruleReads = (text) => {
  for (const r of admitted) {
    const f = lw.fork();
    try { if (!f.load(r.text).ok) continue; f.tell(enc(text)); const rows = f.ask('ask key=?k of=?o'); if (rows.length === 1) return { key: rows[0].k, of: { id: rows[0].o } }; } catch { /* the rule does not read it */ }
  }
  return null;
};
// why a rule fails its own training cases: the first support texts it does not read as the case's frame (the learner's `train` only counts)
const failing = (r) => {
  const out = [];
  for (const t of r.support ?? []) {
    const c = train.find((x) => x.text === t); const f = lw.fork();
    let a = null; try { if (f.load(r.text).ok) { f.tell(enc(t)); const rows = f.ask('ask key=?k of=?o'); a = rows.length === 1 ? { key: rows[0].k, of: { id: rows[0].o } } : { rows: rows.length }; } } catch (e) { a = { error: String(e.message ?? e).slice(0, 60) }; }
    if (!same(a, c?.frame)) out.push({ text: t, got: a, want: c?.frame?.of?.id });
    if (out.length >= 2) break;
  }
  return out;
};
const judgeSet = (list) => {
  let typed = 0, learned = 0, both = 0, wrongLearned = 0;
  for (const c of list) {
    const t = same(lib.readByTypes(lw, c.text, READ).best, c.frame), l = ruleReads(c.text);
    if (t) typed++;
    if (l && same(l, c.frame)) learned++; else if (l) wrongLearned++;
    if (t || (l && same(l, c.frame))) both++;
  }
  return { of: list.length, typed, learned, either: both, wrongByRule: wrongLearned };
};
const cous = held.concat(train).flatMap((c) => cousinsOf(c).filter((x) => x.valid && x.text).map((x) => ({ text: x.text, frame: x.frame })));
const result = {
  library: 'vendored', cases: all.length, learnable: learnable.length, train: train.length, heldOut: held.length,
  rules: rules.map((r) => ({ admitted: !!r.admitted, why: r.why ?? '', support: r.support?.length ?? 0, train: r.train, heldOut: r.heldOut, sample: r.support?.slice(0, 2), ...(r.admitted || !r.text ? {} : { failing: failing(r) }) })),
  step: { heldOut: judgeSet(held), cousins: judgeSet(cous.slice(0, 400)) },
};
console.log(JSON.stringify(result, null, 1));
if (arg('out', null)) writeFileSync(resolve(arg('out')), JSON.stringify({ ...result, rulesText: admitted.map((r) => r.text) }, null, 1));
