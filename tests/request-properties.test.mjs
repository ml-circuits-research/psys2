// SPDX-License-Identifier: AGPL-3.0-only
// Spec 28 section 6 (owner GO 2026-11-15 14:00): the properties P1-P8 of a request over generated sentences, for the make / arrange / change acts of the tab worlds,
// in English and in Romanian (through the rules translator). Each property counts the generated cases that hold; the test fails when a count falls below its
// ratchet (MIN), so the count can only go up. `PSYS2_REQUEST_REPORT=1` prints every failing case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

// The ratchet: the number of cases of each property that held at the last landing (baseline 2026-11-15 before spec 28: see worker-log.md).
const MIN = { P1: 19, P2: 17, P3: 6, P4: 12, P5: 9, P6: 5, P7: 4, P8: 7 };   // 2026-11-15 spec 28 + Documents: 87/96 (a margin of one for the sampled diagrams)

const loader = createFsLoader(DEFAULT_ROOT);
const engines = {
  en: await createEngine({ loader }),
  ro: await createEngine({ loader, translator: createTranslator() }),
};
const TAB = { diagram: 'diagram', draw: 'draw', docs: 'editor', map: 'map', charts: 'charts', music: 'music' };
const session = (lang, tab) => { const s = engines[lang].createSession({ language: lang }); s.setWorldState('ui.shell', { activeTab: TAB[tab] }); return s; };

// ---- measures of a result (the visible state of the open world) -------------------------------------------------------------------------------------
const M = {
  diagram: (st) => { const d = st['diagram.sketch'] ?? {}; const sh = d.shapes ?? []; return { parts: sh.length, kinds: new Set(sh.map((x) => x.shape)), kindList: sh.map((x) => x.shape), links: (d.edges ?? []).length, extent: sh.reduce((a, x) => a + (x.size ?? 0), 0), sig: JSON.stringify([sh.map((x) => `${x.shape}:${x.label ?? x.name}`).sort(), (d.edges ?? []).length]) }; },
  draw: (st) => { const d = st['art.draw'] ?? {}; const ob = d.objects ?? []; return { parts: ob.length, kinds: new Set(ob.map((o) => o.kind)), kindList: ob.map((o) => o.kind), extent: ob.reduce((a, o) => a + (o.size ?? 0), 0), sig: JSON.stringify(ob.map((o) => o.kind).sort()) }; },
  docs: (st) => { const d = st['docs.editor'] ?? {}; const bl = d.blocks ?? []; return { parts: bl.filter((b) => b.kind === 'heading').length, words: bl.reduce((a, b) => a + String(b.text ?? '').split(/\s+/).filter(Boolean).length, 0), docs: d.title ? 1 : 0, kinds: new Set(), kindList: [], extent: 0, sig: d.title ?? '' }; },
  charts: (st) => { const d = st['data.charts'] ?? {}; const c = (d.charts ?? []).find((x) => x.id === d.active) ?? (d.charts ?? []).at(-1); return { parts: c?.labels?.length ?? 0, charts: (d.charts ?? []).length, kinds: new Set(c ? [c.type] : []), kindList: c ? [c.type] : [], extent: 0, sig: JSON.stringify(c?.labels ?? []) }; },
  map: (st) => { const d = st['geo.map'] ?? {}; return { parts: (d.markers ?? []).length + (d.highlighted ?? []).length, kinds: new Set(), kindList: [], extent: 0, sig: JSON.stringify([d.center, d.highlighted]) }; },
  music: (st) => { const d = st['media.music'] ?? {}; return { parts: d.current ? 1 : 0, kinds: new Set(), kindList: [], extent: 0, sig: d.current?.title ?? '' }; },
};
const kindOf = (w) => w.replace(/(?:es|s)$/, (m) => (/(?:ss|sh|ch|x)es$/.test(w) ? 'es'.slice(0, m.length - 1) : '')).replace(/ie$/, 'y');

/** Run turns in one session; returns the replies and the measure after each turn. */
async function run(lang, tab, turns) {
  const s = session(lang, tab);
  const out = [];
  for (const t of turns) {
    let r;
    try { r = await s.send(t, { language: lang }); } catch (e) { r = { text: `ERROR ${e.message}`, trace: {} }; }
    out.push({ text: t, reply: String(r.text ?? ''), trace: r.trace ?? {}, m: M[tab](s.state()) });
  }
  return out;
}

// ---- the generated cases --------------------------------------------------------------------------------------------------------------------------
// each case: { p, lang, tab, turns, ok(res) } — `res` the list of { reply, trace, m } per turn. Romanian sentences are the same requests in Romanian.
const cases = [];
const add = (p, tab, en, ro, ok) => { cases.push({ p, lang: 'en', tab, turns: en, ok }); if (ro) cases.push({ p, lang: 'ro', tab, turns: ro, ok }); };
const RO_KIND = { circle: ['cercuri', 'cerc'], square: ['pătrate', 'pătrat'], diamond: ['romburi', 'romb'], triangle: ['triunghiuri', 'triunghi'] };

// P1: "not X" never yields X; "not all X" yields more than one kind
for (const k of ['circle', 'square', 'diamond', 'triangle']) {
  add('P1', 'diagram', [`draw a diagram with 6 nodes, not ${k}s`], [`desenează o diagramă cu 6 noduri, nu ${RO_KIND[k][0]}`], (r) => r[0].m.parts > 0 && !r[0].m.kinds.has(k));
  add('P1', 'diagram', [`draw 6 nodes, not all ${k}s`], [`desenează 6 noduri, nu toate ${RO_KIND[k][0]}`], (r) => r[0].m.parts >= 2 && r[0].m.kinds.size > 1);
}
add('P1', 'diagram', ['make a diagram that is not a circle'], ['fă o diagramă care nu este un cerc'], (r) => r[0].m.parts >= 2);
add('P1', 'draw', ['draw a pond without ducks'], ['desenează un iaz fără rațe'], (r) => r[0].m.parts > 0 && !r[0].m.kinds.has('duck'));
add('P1', 'draw', ['draw a garden with no flowers'], ['desenează o grădină fără flori'], (r) => r[0].m.parts > 0 && !r[0].m.kinds.has('flower'));

// P2: a count or a range is respected
for (const n of [4, 7]) add('P2', 'diagram', [`draw a diagram with ${n} nodes`], [`desenează o diagramă cu ${n} noduri`], (r) => r[0].m.parts === n);
for (const [a, b] of [[5, 10], [3, 5]]) add('P2', 'diagram', [`draw a diagram with ${a}-${b} nodes`], [`desenează o diagramă cu ${a}-${b} noduri`], (r) => r[0].m.parts >= a && r[0].m.parts <= b);
add('P2', 'diagram', ['make a nice diagram with 5 to 8 nodes and arrows'], ['fă o diagramă frumoasă cu 5 până la 8 noduri și săgeți'], (r) => r[0].m.parts >= 5 && r[0].m.parts <= 8 && r[0].m.links >= 1);
add('P2', 'diagram', ['add 3 squares'], ['adaugă 3 pătrate'], (r) => r[0].m.parts === 3 && r[0].m.kinds.has('square'));
add('P2', 'draw', ['draw 4 trees'], ['desenează 4 copaci'], (r) => r[0].m.kindList.filter((k) => k === 'tree').length === 4);
add('P2', 'draw', ['draw a few clouds'], ['desenează câțiva nori'], (r) => { const n = r[0].m.kindList.filter((k) => k === 'cloud').length; return n >= 2 && n <= 5; });
add('P2', 'charts', ['make a bar chart with 5 bars'], ['fă un grafic cu bare cu 5 bare'], (r) => r[0].m.parts === 5);
add('P2', 'docs', ['write a story about a lake with 3 chapters'], ['scrie o poveste despre un lac cu 3 capitole'], (r) => r[0].m.parts === 3);

// P3: small < default < big, in parts and in extent (three sessions: the measures are compared)
const P3 = [
  ['diagram', ['draw a small diagram', 'draw a diagram', 'draw a big diagram'], ['desenează o diagramă mică', 'desenează o diagramă', 'desenează o diagramă mare']],
  ['draw', ['draw a small pond', 'draw a pond', 'draw a big pond'], ['desenează un iaz mic', 'desenează un iaz', 'desenează un iaz mare']],
  ['draw', ['draw a small forest', 'draw a forest', 'draw a big forest'], ['desenează o pădure mică', 'desenează o pădure', 'desenează o pădure mare']],
  ['docs', ['write a short story about a lake', 'write a story about a lake', 'write a long story about a lake'], ['scrie o poveste scurtă despre un lac', 'scrie o poveste despre un lac', 'scrie o poveste lungă despre un lac']],
];
for (const [tab, en, ro] of P3) for (const [lang, ts] of [['en', en], ['ro', ro]]) cases.push({ p: 'P3', lang, tab, turns: ts, separate: true, ok: (r) => {
  const size = (x) => (tab === 'docs' ? x.m.words : x.m.parts * 1000 + x.m.extent);
  return size(r[0]) < size(r[1]) && size(r[1]) < size(r[2]) && r[0].m.parts <= r[1].m.parts && r[1].m.parts <= r[2].m.parts;
} });

// P4: a reaction after a result changes that result in the stated direction and does not add a second result
add('P4', 'diagram', ['draw a random diagram', 'too many'], ['desenează o diagramă aleatorie', 'prea multe'], (r) => r[1].m.parts < r[0].m.parts && r[1].m.parts > 0);
add('P4', 'diagram', ['add 5 random nodes', 'not all circles, better layout'], ['adaugă 5 noduri aleatorii', 'nu toate cercuri, o așezare mai bună'], (r) => r[1].m.parts === r[0].m.parts && r[1].m.kinds.size > 1);
add('P4', 'diagram', ['create a random diagram', 'this is stupid, my expectation was to get a nice diagram 5-10 nodes, arrows, nice layout, not a circle'], ['creează o diagramă aleatorie', 'e o prostie, mă așteptam la o diagramă frumoasă cu 5-10 noduri, săgeți, o așezare frumoasă, nu un cerc'], (r) => r[1].m.parts >= 5 && r[1].m.parts <= 10 && r[1].m.links >= 1 && r[1].m.kinds.size > 1);
add('P4', 'draw', ['draw a pond', 'too much'], ['desenează un iaz', 'prea mult'], (r) => r[1].m.parts < r[0].m.parts && r[1].m.parts > 0);
add('P4', 'draw', ['draw a small pond', 'bigger'], ['desenează un iaz mic', 'mai mare'], (r) => r[1].m.extent > r[0].m.extent && r[1].m.kindList.filter((k) => k === 'lake' || k === 'pond').length === 1);
add('P4', 'docs', ['write a story about a lake', 'too long'], ['scrie o poveste despre un lac', 'prea lungă'], (r) => r[1].m.words < r[0].m.words && r[1].m.words > 0);
add('P4', 'diagram', ['draw a diagram with 6 nodes', 'no, squares'], ['desenează o diagramă cu 6 noduri', 'nu, pătrate'], (r) => r[1].m.parts === r[0].m.parts && r[1].m.kinds.has('square'));

// P5: every content word is in the request or named as unread in the reply
const P5 = [
  ['diagram', 'draw a diagram with 6 nodes, florbish', 'desenează o diagramă cu 6 noduri, florbish'],
  ['diagram', 'draw a nice diagram with arrows', 'desenează o diagramă frumoasă cu săgeți'],
  ['draw', 'draw a small pond in the corner with a duck', 'desenează un iaz mic în colț cu o rață'],
  ['docs', 'write a short story about ancient hobbits', 'scrie o poveste scurtă despre hobbiți antici'],
  ['diagram', 'this is stupid, my expectation was a nice diagram', 'e o prostie, mă așteptam la o diagramă frumoasă'],
];
const STOP = new Set('a an the of to in on at for with and or but is are was were be it this that i you me my your do not no please some any all'.split(' '));
for (const [tab, en, ro] of P5) add('P5', tab, [en], [ro], (r) => {
  const q = r[0].trace.request;
  if (!q) return false;
  const english = String(r[0].trace.english ?? r[0].text).toLowerCase().match(/[a-z]+/g) ?? [];
  const covered = new Set([...(q.used ?? []), ...(q.unread ?? [])]);
  const content = english.filter((w) => !STOP.has(w) && w.length > 2);
  return content.every((w) => covered.has(w)) && (q.unread ?? []).every((w) => r[0].reply.toLowerCase().includes(w));
});

// P6: no catch-all reading executes: a request with a word no reader knows is either not carried out or says what it assumed
for (const [tab, en, ro] of [['diagram', 'creare a random diagram', 'creare o diagramă aleatorie'], ['diagram', 'blorf a diagram', 'blorf o diagramă'], ['draw', 'zibble a picture of a cat', 'zibble o imagine cu o pisică'], ['docs', 'florp a document', 'florp un document']]) {
  add('P6', tab, [en], [ro], (r) => (r[0].m.parts === 0 || /took that as|assumed|I read|I understood/i.test(r[0].reply) || /am luat|am presupus|am înțeles/i.test(r[0].reply)) && !/^Drew a circle\.?$/i.test(r[0].reply));
}

// P7: "random" twice gives two different results, both inside the typical range
add('P7', 'diagram', ['draw a random diagram', 'draw a random diagram'], ['desenează o diagramă aleatorie', 'desenează o diagramă aleatorie'], (r) => r[0].m.sig !== r[1].m.sig && [r[0], r[1]].every((x) => x.m.parts >= 5 && x.m.parts <= 9) && r[1].m.parts <= 9);
add('P7', 'diagram', ['add 5 random nodes', 'again'], ['adaugă 5 noduri aleatorii', 'din nou'], (r) => r[0].m.kinds.size > 1 && r[1].m.sig !== r[0].m.sig && r[1].m.parts === 5);
add('P7', 'draw', ['draw a random pond', 'another one'], ['desenează un iaz aleatoriu', 'încă unul'], (r) => r[0].m.parts >= 2 && r[1].m.sig !== r[0].m.sig);

// P8: a constraint the world cannot honour is named in the reply
add('P8', 'diagram', ['draw a diagram with 6 nodes in 3 chapters'], ['desenează o diagramă cu 6 noduri în 3 capitole'], (r) => /chapter|capitol/i.test(r[0].reply));
add('P8', 'music', ['play a happy song with 3 chapters'], ['cântă un cântec vesel cu 3 capitole'], (r) => /chapter|capitol/i.test(r[0].reply));
add('P8', 'map', ['show Tenerife with 3 chapters'], ['arată Tenerife cu 3 capitole'], (r) => /chapter|capitol/i.test(r[0].reply));
add('P8', 'charts', ['make a bar chart with 5 bars about bees, with a duck'], ['fă un grafic cu bare cu 5 bare despre albine, cu o rață'], (r) => /duck|rață|rata/i.test(r[0].reply));

// ---- run --------------------------------------------------------------------------------------------------------------------------------------------
const results = [];
for (const c of cases) {
  let res;
  if (c.separate) { res = []; for (const t of c.turns) res.push((await run(c.lang, c.tab, [t]))[0]); } else res = await run(c.lang, c.tab, c.turns);
  let ok = false;
  try { ok = !!c.ok(res); } catch { ok = false; }
  results.push({ ...c, res, pass: ok });
}
const counts = {};
for (const p of Object.keys(MIN)) {
  const of = results.filter((r) => r.p === p);
  counts[p] = { pass: of.filter((r) => r.pass).length, of: of.length, en: of.filter((r) => r.pass && r.lang === 'en').length, ro: of.filter((r) => r.pass && r.lang === 'ro').length };
}
console.log(`request properties: ${Object.entries(counts).map(([p, c]) => `${p} ${c.pass}/${c.of} (en ${c.en}, ro ${c.ro})`).join('; ')}; total ${results.filter((r) => r.pass).length}/${results.length}`);
if (process.env.PSYS2_REQUEST_REPORT) for (const r of results.filter((x) => !x.pass)) console.log(`FAIL ${r.p} ${r.lang} ${r.tab}: ${r.res.map((x) => `${x.text} -> ${x.reply.slice(0, 140)} [${x.m.parts} ${[...x.m.kinds].join(',')}${x.m.links != null ? ` l${x.m.links}` : ''}${x.m.words != null ? ` w${x.m.words}` : ''} e${x.m.extent}]`).join(' || ')}`);

for (const p of Object.keys(MIN)) test(`${p}: at least ${MIN[p]} generated cases hold (${counts[p].pass}/${counts[p].of})`, () => assert.ok(counts[p].pass >= MIN[p], `${p}: ${counts[p].pass} < ${MIN[p]}`));
