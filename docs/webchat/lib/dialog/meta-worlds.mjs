// SPDX-License-Identifier: AGPL-3.0-only
/**
 * meta.worlds, the host side (WORLD-OF-WORLDS, spec 20). Browser-safe: no `node:*` imports; the library is imported lazily.
 *
 * `worlds/meta.worlds/` is a shared module (not a tab, never a routing candidate): `kb.sop` holds one generated card per world, `matrix.sop` the routing rules
 * in SOP Lang. This file only (1) turns the message and the live state of the host into wires, (2) lets the library derive the votes and blocks of the rules in
 * a fork of the loaded module, (3) adds the points per world and says the reasons in plain words. A new world is added by its card alone.
 *
 *   const mw = await loadMetaWorlds(engine.set);
 *   const r = mw.route({ text, live, prior });   // { ranked: [{ world, score, reasons: [{ rule, via, points, say }] }], blocked, asked, why, ms }
 *
 * `live` (everything cheap from the state the host already has):
 *   { active: world|null, running: [world], asked: world|null, last: world|null, recent: [world], scene: { world: [thing] } }
 * `prior`: { world: probability } from the encoder (optional); its points are `round(p * priorWeight)`, one signal among the rules: it can add up to the
 * weight and never outvotes a block.
 */
import { GRAMMAR, PERSON } from './continuation.mjs?v=c651104054';
import { sceneThings } from './scene-referents.mjs?v=adc8f57abc';
import { budget } from './budget.mjs?v=123c3e1329';
import { editDistance } from '../formalizer/rules/normalize.mjs?v=5de885797a';

/** The singular, lowercase: ies -> y, es after s/x/ch/sh, a final s (not ss, us, is). */
export function lemma(w) {
  const x = String(w).toLowerCase();
  if (x.length <= 3) return x;
  if (/[^aeiou]ies$/.test(x)) return `${x.slice(0, -3)}y`;
  if (/(?:ss|us|is)$/.test(x)) return x;
  if (/(?:sses|xes|ches|shes|zes)$/.test(x)) return x.slice(0, -2);
  if (/[^s]s$/.test(x) && !/as$/.test(x)) return x.slice(0, -1);
  return x;
}

const MAX_TOKENS = 40;
/** Words that open a question or turn a clause into one: a message that has one is not a piece of a request. */
const QUESTION = new Set(['what', 'whats', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have']);
const atom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

/** The words of a message as the rules see them: each word and its lemma, then the pairs and triples of lemmas joined with _. */
export function messageWords(text) {
  const toks = (String(text ?? '').toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? []).slice(0, MAX_TOKENS).map((t) => t.replace(/'/g, '')).filter(Boolean);
  const lem = toks.map((t) => atom(lemma(t)));
  const words = new Set();
  toks.forEach((t, i) => { words.add(atom(t)); words.add(lem[i]); if (lem[i + 1]) words.add(`${lem[i]}_${lem[i + 1]}`); if (lem[i + 2]) words.add(`${lem[i]}_${lem[i + 1]}_${lem[i + 2]}`); });
  words.delete('');
  return { tokens: toks, words: [...words] };
}

const strip = (s) => String(s).replace(/^"|"$/g, '');
const attrs = (w, k) => (w.attrs?.[k] ?? []).map(strip);
const one = (w, k) => attrs(w, k)[0] ?? null;

export async function loadMetaWorlds(set, { lib = null, priorWeight = 30 } = {}) {
  const w = set.get('meta.worlds');
  if (!w?.raw?.legend || !w.raw.kb || !w.raw.matrix) return null;
  lib ??= await import('../vendor/sopworld/sopworld.mjs?v=77e11b6770');
  const base = new lib.World({});
  for (const [what, text] of [['legend', w.raw.legend], ['kb', w.raw.kb], ['matrix', w.raw.matrix]]) {
    const r = base.load(text);
    if (!r.ok) throw new Error(`meta.worlds ${what}: ${r.violations?.[0]?.kind ?? 'refused'} ${r.violations?.[0]?.why ?? r.violations?.[0]?.key ?? ''}`);
  }
  const cards = base.ofType('meta.worlds.card').map((c) => ({
    id: one(c, 'id'), tab: one(c, 'tab'), kind: one(c, 'kind'), run: one(c, 'run'), nav: one(c, 'nav') === 'yes', catalog: one(c, 'catalog') === 'yes',
    name: attrs(c, 'name'), navact: attrs(c, 'navact'), act: attrs(c, 'act'), actshared: attrs(c, 'actshared'), thing: attrs(c, 'thing'), thingshared: attrs(c, 'thingshared'), frame: attrs(c, 'frame'), frameshared: attrs(c, 'frameshared'),
  }));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const says = new Map(base.ofType('meta.worlds.say').map((s) => [one(s, 'rule'), one(s, 'text')]));
  const verbs = new Set(cards.flatMap((c) => [...c.act, ...c.actshared, ...c.frame]));   // (a shared frame, "what is", does not make a message a request)
  // a word that no card and no scene has can match nothing: it is not told to the rules (the module is smaller to derive, the answer is the same)
  const known = new Set([...cards.flatMap((c) => [...c.name, ...c.act, ...c.actshared, ...c.thing, ...c.thingshared, ...c.frame, ...c.frameshared, ...c.navact]), ...base.ofType('meta.worlds.start').map((x) => one(x, 'word'))]);
  const nameOf = (id) => { const c = byId.get(id); return (c?.name?.[0] ?? id.split('.').at(-1)).replace(/_/g, ' '); };
  const CAP = { act: 2, thing: 2, actshared: 1, thingshared: 1, referent: 2, named: 2, frame: 1, catalog: 1, actthing: 1 };   // a long message must not win on repetition

  // a word the message has wrong by a slip of the fingers ("paragrph", "Pariss") is read as the one word of the cards it is one or two edits from, when exactly one is
  const byLen = new Map();
  for (const x of known) if (/^[a-z]+$/.test(x) && x.length >= 5) (byLen.get(x.length) ?? byLen.set(x.length, []).get(x.length)).push(x);
  function nearWords(tokens, sceneAtoms, catalog) {
    const out = [];
    for (const t of tokens) {
      const w = atom(t);
      if (w.length < 6 || known.has(w) || known.has(atom(lemma(t))) || sceneAtoms.has(w) || catalog.has(w) || catalog.has(atom(lemma(t)))) continue;
      const reach = w.length >= 8 ? 2 : 1;
      let best = null, d0 = reach + 1, tie = false;
      for (let n = w.length - reach; n <= w.length + reach; n++) for (const k of byLen.get(n) ?? []) {
        budget.tick('meta.worlds.near');
        if (k[0] !== w[0] && k[1] !== w[1]) continue;
        const d = editDistance(w, k);
        if (d < d0) { d0 = d; best = k; tie = false; } else if (d === d0 && k !== best) tie = true;
      }
      if (best && !tie) out.push(best);
    }
    return out;
  }

  /**
   * Whether the message is a piece without a verb of its own: short, nobody speaking of themselves, not a question, no number, no word that any world takes
   * as an action, no question frame, and at least one word that a card or a scene knows (a thing: "the crocodiles", "the water"; garbage is not a piece).
   */
  function isFragment(text, tokens, words, sceneAtoms = new Set()) {
    if (!tokens.length || tokens.length > 5 || /\?\s*$/.test(String(text))) return false;
    if (tokens.some((t) => PERSON.has(t) || /\d/.test(t) || QUESTION.has(t))) return false;
    if (words.some((x) => verbs.has(x))) return false;
    return words.some((x) => (known.has(x) || sceneAtoms.has(x)) && !GRAMMAR.has(x));   // sceneAtoms here also holds the catalog words of the message
  }

  function route({ text, live = {}, prior = null, fragment = null, catalog = [], keep = null, weight = priorWeight }) {
    budget.tick('meta.worlds.route');
    const t0 = globalThis.performance?.now?.() ?? Date.now();
    const { tokens, words } = messageWords(text);
    const f = base.fork();
    const sceneAtoms = new Set(Object.entries(live.scene ?? {}).filter(([id]) => byId.has(id)).flatMap(([, things]) => [...things].flatMap((x) => [atom(x), atom(lemma(x))])));
    const catalogSet = new Set(catalog.flatMap((x) => [atom(x), atom(lemma(x))]));
    const frag = fragment ?? isFragment(text, tokens, words, new Set([...sceneAtoms, ...catalogSet]));
    const told = [...new Set([...words.filter((x) => known.has(x) || sceneAtoms.has(x)), ...nearWords(tokens, sceneAtoms, catalogSet)])];
    const lines = [`@m meta.worlds.msg ${told.map((x) => `word=${x}`).join(' ')} frag=${frag ? 'yes' : 'no'}${catalog.length ? ` ${catalog.map((x) => `catalog=${atom(x)}`).join(' ')}` : ''}`];
    const l = new Map();
    const flag = (id, k, v = 'yes') => { if (!id || !byId.has(id)) return; (l.get(id) ?? l.set(id, {}).get(id))[k] = v; };
    flag(live.active, 'active'); flag(live.asked, 'asked'); flag(live.last, 'last');
    for (const r of live.running ?? []) flag(r, 'running');
    for (const r of live.recent ?? []) flag(r, 'recent');
    for (const [id, o] of l) lines.push(`@l.${id} meta.worlds.live world=${id} ${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    if (!live.active) lines.push('@l.none meta.worlds.live notab=yes');
    let n = 0;
    for (const [id, things] of Object.entries(live.scene ?? {})) if (byId.has(id)) for (const th of new Set([...things].flatMap((x) => [atom(x), atom(lemma(x))]))) if (th) lines.push(`@s${n++} meta.worlds.scene world=${id} thing=${th}`);
    if (prior) for (const [id, p] of Object.entries(prior)) if (byId.has(id) && p > 0) lines.push(`@p.${id} meta.worlds.prior world=${id} pts=${Math.round(p * weight)}`);
    const res = f.tell(lines.join('\n'));
    if (!res.ok) throw new Error(`meta.worlds tell: ${res.violations?.[0]?.kind ?? 'refused'} ${res.violations?.[0]?.why ?? ''}`);
    const blocked = new Map();
    for (const b of f.ofType('meta.worlds.block')) { const id = one(b, 'world'); (blocked.get(id) ?? blocked.set(id, []).get(id)).push({ rule: one(b, 'rule'), say: sayRule(one(b, 'rule'), id, null) }); }
    const per = new Map();
    for (const v of f.ofType('meta.worlds.vote')) {
      const id = one(v, 'world'), rule = one(v, 'rule'), via = one(v, 'via'), points = Number(one(v, 'weight'));
      const e = per.get(id) ?? per.set(id, { world: id, score: 0, reasons: [], seen: new Map() }).get(id);
      const seen = e.seen.get(rule) ?? 0;
      if (seen >= (CAP[rule] ?? 1) || e.reasons.some((x) => x.rule === rule && x.via === via)) continue;
      e.seen.set(rule, seen + 1);
      e.reasons.push({ rule, via, points, say: sayRule(rule, id, via) });
      e.score += points;
    }
    function sayRule(rule, id, via) { return (says.get(rule) ?? rule).replace('{name}', nameOf(id)).replace('{via}', String(via ?? '').replace(/_/g, ' ')); }
    const allowed = (id) => !blocked.has(id) && (!keep || keep.has(id));
    const ranked = [...per.values()].filter((e) => allowed(e.world)).map(({ seen, ...e }) => ({ ...e, reasons: e.reasons.sort((a, b) => b.points - a.points) })).sort((a, b) => b.score - a.score || a.world.localeCompare(b.world));
    const ms = (globalThis.performance?.now?.() ?? Date.now()) - t0;
    return { ranked, blocked: Object.fromEntries(blocked), fragment: frag, ms };
  }

  /** `route` plus the decision: asked when no world has evidence (`minScore`) or the best two worlds are within `margin` points. */
  function decide(args, { minScore = 12, margin = 4 } = {}) {
    const r = route(args);
    const [a, b] = r.ranked;
    let asked = null;
    if (!a || a.score < minScore) asked = 'no world has a reason to take it';
    else if (b && a.score - b.score < margin) asked = `the ${nameOf(a.world)} and the ${nameOf(b.world)} are equally likely`;
    return { ...r, world: asked ? null : a.world, asked, top: a?.world ?? null };
  }

  return { cards, byId, route, decide, nameOf, worlds: cards.map((c) => c.id), isFragment, priorWeight };
}

/** The live facts of a dialog session's context (`dialog.context()`, plus what the discourse layer adds: `asked`, `lastAction`). */
export function liveFromContext(ctx, { sceneKeys } = {}) {
  const st = ctx?.states ?? {};
  const order = [ctx?.tabWorld, ...Object.keys(st)].filter((x, i, a) => x && x !== 'ui.shell' && a.indexOf(x) === i);
  const scene = {};
  for (const [world, things] of sceneThings(st, order, sceneKeys)) scene[world] = [...things];
  return {
    active: ctx?.tabWorld ?? null,
    running: [ctx?.gameWorld, ctx?.modalWorld].filter(Boolean),
    asked: ctx?.asked ?? null,
    last: ctx && 'lastAction' in ctx ? ctx.lastAction : ctx?.lastWorld ?? null,   // the world of the last request (the discourse frames), else the last world that answered
    recent: ctx?.recentWorlds ?? [],
    scene,
  };
}
