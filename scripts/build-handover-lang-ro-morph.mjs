#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Writes handover/w.lang.ro/shards/morphology.sop (the paradigm classes of the Romanian language world, in the library's std.morph notation) from the table below, and
 * VALIDATES the rules: for every dictionary lemma of a paradigm class (handover/w.lang.ro/dictionary/*.tsv, written by build-handover-lang-ro.mjs) the forms the rules
 * generate must be forms the translator's own analyser accepts for that lemma (the hand-written morphology of src/translate/morphology.ro.mjs). Reports the
 * agreement per class. Romanian morphemes are DATA here (the language world).
 *
 *   node scripts/build-handover-lang-ro-morph.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foldKey } from '../src/translate/normalize.mjs';
import { analyze } from '../src/translate/morphology.ro.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'handover/w.lang.ro');
mkdirSync(join(OUT, 'shards'), { recursive: true });

// A noun cell is [num, case, def, suffix]. `drop` is cut from the lemma to get the stem.
const N = (g, drop, sg, sgDef, sgGen, sgGenDef, pl, plDef, plGen, plGenDef) => ({ pos: 'noun', gender: g, drop, cells: [
  ['sg', 'nomacc', 'no', sg], ['sg', 'nomacc', 'yes', sgDef], ['sg', 'gendat', 'no', sgGen], ['sg', 'gendat', 'yes', sgGenDef],
  ['pl', 'nomacc', 'no', pl], ['pl', 'nomacc', 'yes', plDef], ['pl', 'gendat', 'no', plGen], ['pl', 'gendat', 'yes', plGenDef]] });
const CLASSES = {
  'n.f.ă-e': N('f', 'ă', 'ă', 'a', 'e', 'ei', 'e', 'ele', 'e', 'elor'),
  'n.f.ă-i': N('f', 'ă', 'ă', 'a', 'i', 'ii', 'i', 'ile', 'i', 'ilor'),
  'n.f.ie-ii': N('f', 'e', 'e', 'a', 'i', 'ei', 'i', 'ile', 'i', 'ilor'),
  'n.f.e-i': N('f', 'e', 'e', 'ea', 'i', 'ii', 'i', 'ile', 'i', 'ilor'),
  'n.f.are-ări': N('f', 'are', 'are', 'area', 'ări', 'ării', 'ări', 'ările', 'ări', 'ărilor'),
  'n.f.are-ri': N('f', 'are', 'are', 'area', 'ri', 'rii', 'ri', 'rile', 'ri', 'rilor'),
  'n.m._-i': N('m', '', '_', 'ul', '_', 'ului', 'i', 'ii', 'i', 'ilor'),
  'n.m.u-i': N('m', 'u', 'u', 'ul', 'u', 'ului', 'i', 'ii', 'i', 'ilor'),
  'n.n._-uri': N('n', '', '_', 'ul', '_', 'ului', 'uri', 'urile', 'uri', 'urilor'),
  'n.n._-e': N('n', '', '_', 'ul', '_', 'ului', 'e', 'ele', 'e', 'elor'),
  'n.n.n-ane': N('n', 'n', 'n', 'nul', 'n', 'nului', 'ane', 'anele', 'ane', 'anelor'),
};
// Verbs: [tense, person, num, suffix] on the stem (lemma minus the infinitive ending `a`). Imperative 2sg = present 3sg; subjunctive = present, but the 3rd person is `e`.
const V = (e1, e2, e3, e4, e5, e6, imp, s3) => ({ pos: 'verb', drop: 'a', cells: [
  ['pres', 1, 'sg', e1], ['pres', 2, 'sg', e2], ['pres', 3, 'sg', e3], ['pres', 1, 'pl', e4], ['pres', 2, 'pl', e5], ['pres', 3, 'pl', e6],
  ['imper', 2, 'sg', imp], ['imper', 2, 'pl', e5], ['subj', 3, 'sg', s3], ['subj', 3, 'pl', s3], ['part', 0, 'sg', 'at'], ['ger', 0, 'sg', 'ând'], ['inf', 0, 'sg', 'a']] });
CLASSES['v.a'] = V('', 'i', 'ă', 'ăm', 'ați', 'ă', 'ă', 'e');
CLASSES['v.az'] = V('ez', 'ezi', 'ează', 'ăm', 'ați', 'ează', 'ează', 'eze');
// -esc verbs of the first conjugation family are listed with their forms in the dictionary (v.is): the class keeps the endings only
CLASSES['v.is'] = { pos: 'verb', drop: 'i', cells: [['pres', 1, 'sg', 'esc'], ['pres', 2, 'sg', 'ești'], ['pres', 3, 'sg', 'ește'], ['pres', 1, 'pl', 'im'], ['pres', 2, 'pl', 'iți'], ['pres', 3, 'pl', 'esc'], ['imper', 2, 'sg', 'ește'], ['imper', 2, 'pl', 'iți'], ['subj', 3, 'sg', 'ească'], ['subj', 3, 'pl', 'ească'], ['part', 0, 'sg', 'it'], ['ger', 0, 'sg', 'ind'], ['inf', 0, 'sg', 'i']] };
// Adjectives: [gender, num, suffix] on the stem (the masculine singular).
const A = (g, drop, ms, fs, mp, fp) => ({ pos: 'adj', gender: g, drop, cells: [['sg', 'm', ms], ['sg', 'f', fs], ['pl', 'm', mp], ['pl', 'f', fp]] });
CLASSES['a._-ă-i-e'] = A('', '', '_', 'ă', 'i', 'e');
CLASSES['a.t-tă-ți-te'] = A('', 't', 't', 'tă', 'ți', 'te');   // înalt -> înalți: t > ț
CLASSES['a.s-asă-și-ase'] = A('', 's', 's', 'asă', 'și', 'ase');

const q = (s) => (/[^a-zA-Z0-9_.-]/.test(s) ? `"${s}"` : s);
const lines = [`# w.lang.ro/shards/morphology: the paradigm classes (std.morph notation): one class per ending pattern, one ending per feature cell; forms are generated from a dictionary lemma, never listed`,
  '# DRAFT written against the translator\'s own hand-written morphology; validated by scripts/build-handover-lang-ro-morph.mjs (agreement per class in handover/w.lang.ro/README.md)', '# source: hand-core 1, PSys2 src/translate/morphology.ro.mjs', '# license: CC0-1.0', ''];
const nameId = (c) => foldKey(c).replace(/[^a-z0-9]+/gi, '_');
for (const [name, c] of Object.entries(CLASSES)) {
  lines.push(`@w.lang.ro.class.${nameId(name)} w.lang.ro.class name=${q(name)} pos=${c.pos}${c.gender ? ` gender=${c.gender}` : ''}${c.drop ? ` drop=${q(c.drop)}` : ''} core.source="hand-core 1"`);
  c.cells.forEach((cell, i) => {
    const f = c.pos === 'noun' ? { num: cell[0], case: cell[1], def: cell[2] } : c.pos === 'verb' ? { tense: cell[0], ...(cell[1] ? { person: cell[1] } : {}), num: cell[2] } : { num: cell[0], gender: cell[1] };
    const suffix = c.pos === 'noun' ? cell[3] : c.pos === 'verb' ? cell[3] : cell[2];
    lines.push(`@w.lang.ro.ending.${nameId(name)}.${i + 1} w.lang.ro.ending class=${q(name)} suffix=${suffix === '' ? '_' : q(suffix)} ${Object.entries(f).map(([k, v]) => `${k}=${v}`).join(' ')} core.source="hand-core 1"`);
  });
}
lines.push('', '# diacritics accepted as absent: both spellings analyse to one lemma', ...[['ă', 'a'], ['â', 'a'], ['î', 'i'], ['ș', 's'], ['ț', 't'], ['ş', 's'], ['ţ', 't']].map(([a, b], i) => `@w.lang.ro.fold.${i + 1} w.lang.ro.fold from=${a} to=${b} core.source="hand-core 1"`),
  '', '# the clitic hyphen of the written form (spune-mi, fă-ți, dă-i-le)', '@w.lang.ro.split.hyphen w.lang.ro.split text="-" core.source="hand-core 1"', '');
writeFileSync(join(OUT, 'shards/morphology.sop'), lines.join('\n') + '\n');

// ---- validation ---------------------------------------------------------------------------------------------------------------------------
const dict = [];
for (const f of readdirSync(join(OUT, 'dictionary'))) for (const l of readFileSync(join(OUT, 'dictionary', f), 'utf8').split('\n')) { if (!l || l.startsWith('#')) continue; const [lemma, pc, g] = l.split('\t'); dict.push({ lemma, pos: pc.split(':')[0], cls: pc.split(':')[1], g }); }
const gen = (cls, lemma) => { const c = CLASSES[cls]; const stem = c.drop && lemma.endsWith(c.drop) ? lemma.slice(0, -c.drop.length) : lemma; return c.cells.map((cell) => ({ cell, form: stem + (c.pos === 'adj' ? (cell[2] === '_' ? '' : cell[2]) : (cell[3] === '_' ? '' : cell[3])) })); };
const accepted = (form, lemma, pos) => analyze(foldKey(form)).some((a) => a.pos === pos && (a.entry.ro === lemma || a.entry.inf === lemma));
const rep = {};
for (const d of dict) {
  if (!CLASSES[d.cls]) continue;
  const r = (rep[d.cls] ??= { lemmas: 0, forms: 0, ok: 0, lemmasAllOk: 0, miss: [] });
  r.lemmas++;
  let all = true;
  for (const { cell, form } of gen(d.cls, d.lemma)) {
    if (cell[0] === 'inf' || cell[0] === 'ger' || cell[0] === 'part' || cell[0] === 'subj') continue;   // the translator's analyser covers present, imperative and the nouns' and adjectives' forms
    if (d.pos === 'noun' && cell[1] === 'gendat' && cell[2] === 'no') continue;   // the indefinite genitive-dative equals another form: not analysed apart
    r.forms++;
    if (accepted(form, d.lemma, d.pos)) r.ok++; else { all = false; if (r.miss.length < 4) r.miss.push(`${d.lemma}:${form}`); }
  }
  if (all) r.lemmasAllOk++;
}
const tot = Object.values(rep).reduce((a, r) => ({ forms: a.forms + r.forms, ok: a.ok + r.ok, lemmas: a.lemmas + r.lemmas, all: a.all + r.lemmasAllOk }), { forms: 0, ok: 0, lemmas: 0, all: 0 });
writeFileSync(join(OUT, 'VALIDATION.json'), JSON.stringify({ perClass: rep, total: { ...tot, formAgreementPct: Math.round((1000 * tot.ok) / tot.forms) / 10, lemmaAllFormsPct: Math.round((1000 * tot.all) / tot.lemmas) / 10 } }, null, 1) + '\n');
for (const [c, r] of Object.entries(rep)) console.log(c.padEnd(14), `lemmas ${String(r.lemmas).padStart(3)}  forms ${r.ok}/${r.forms}  all-ok lemmas ${r.lemmasAllOk}`, r.miss.length ? `  e.g. ${r.miss.join(' ')}` : '');
console.log('TOTAL', JSON.stringify(tot), `form agreement ${(100 * tot.ok / tot.forms).toFixed(1)} %`);
