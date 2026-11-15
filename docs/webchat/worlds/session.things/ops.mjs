// SPDX-License-Identifier: AGPL-3.0-only
// Operations of session.things (spec 23): learn (session.learned), sync (a view publishes its things), show (select things into a view), list. Browser-safe.
import { parseTeach, learn as learnWire, forgetLast } from '../../lib/knowledge/learned.mjs?v=874ba38f1f';
import { lemmaCandidates } from '../../lib/knowledge/facts.mjs?v=dcca10f7f2';
import { ASPECTS, aspectsOf, ensure, labelOf, select, sync as syncStore, viewByWords, whyNot } from './things.mjs?v=70f39208b3';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const ok = (value, extra = {}) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n) ? 'an' : 'a'} ${n}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export function initialState() { return { things: [], views: {}, learned: [], n: 0, person: null }; }   // person: the person of the session (w.person facts, src/dialog/person.mjs, spec 23 section 12)

/** The aspects of a stored thing, from what the session's knowledge says about its kind (the settled lookup, learned wires included). */
// The aspects depend on the kind, the name, which attributes it has (not their values), whether it has parts, what the view declares and what the knowledge says: they are kept
// under that key by the knowledge (`memo`, OVERLAY-MEMO, spec 06 "Compute budgets") while the knowledge answers the same, since every operation call syncs every object of the
// picture (a turn asked the aspects of each object, and a `peek` of each of its ancestors, again for every call). A copy is handed out (the thing keeps its own).
function aspectsFor(ctx) {
  const k = ctx.knowledge;
  const memo = typeof k?.memo === 'function' ? (name, key, build) => k.memo(name, key, build) : (_n, _k, build) => build();
  const lend = (p) => memo('things.lend', p, () => { const t = k?.peek?.(p); return t ? Object.keys(aspectsOf({ kind: p, th: t })).filter((a) => a !== 'textual' && a !== 'relational') : []; });
  return (t, it = {}) => {
    const kind = String(t.kind).toLowerCase().replace(/_/g, ' ');
    const key = JSON.stringify([kind, t.name ?? null, Object.keys(t.attrs ?? {}), !!t.parts?.length, it.declared ?? [], it.attrTypes ?? {}]);
    return { ...memo('things.aspects', key, () => aspectsOf({
      kind, attrs: t.attrs, parts: t.parts, th: k?.peek?.(t.name ? t.name : kind) ?? k?.peek?.(kind) ?? null, declared: it.declared ?? [], attrTypes: it.attrTypes ?? {},
      ancestors: k?.ancestors?.(kind) ?? [], lend,
    })) };
  };
}

/** The user teaches a fact (arg.text is the sentence): the wire is stored in the session, a thing of the user also enters the store. */
/** What the statement reader by type needs: the schemas of the catalog and the types of the records the catalog has for a word (settled lookups; the host loaded them, `openSlots`). */
function typingOf(ctx) {
  const k = ctx.knowledge, sc = k?.peekSchema?.();
  if (!sc) return null;
  const typesOf = (w) => [...new Set((k?.peek?.(w)?.wires ?? []).filter((x) => [...(x.f?.name ?? []), ...(x.f?.word ?? [])].some((n) => String(n).toLowerCase() === String(w).toLowerCase())).map((x) => x.type))];
  // the singular the catalog knows ("rhombus", not "rhombu"): the first lemma candidate with records, else the reader's own singular
  const lemma = (w) => { const s = String(w).toLowerCase().trim(); const c = lemmaCandidates(s.replace(/ /g, '_')).map((x) => x.replace(/_/g, ' ')); return [s, ...c].find((x) => typesOf(x).length) ?? (/(?:us|ss|is)$/.test(s) ? s : null); };
  return { sc, typesOf, lemma };
}

export function learn(ctx, { text } = {}) {
  const st = ensure(ctx.state);
  const taught = parseTeach(text ?? ctx.segment?.text, typingOf(ctx));
  if (!taught) return no('unsupported', 'I did not catch what to remember. You can say "a villa is a kind of house", "my dog is called Rex", "ducks can float" or "fish live in water".');
  const r = learnWire(st.learned, taught);
  if (r.existing) return ok(`I already know that. ${taught.say.replace(/^(?:OK|Nice!), /, '').replace(/ I will remember that\.$/, '')}`);
  (st.lessons ??= []).push({ n: r.lines?.length ?? 1, form: taught.form, subject: taught.subject, object: taught.object, own: taught.form === 'own' ? `th${st.n + 1}` : null, say: taught.say });
  const base = ctx.knowledge?.base ?? ctx.knowledge;
  for (const word of [taught.object, taught.subject]) { try { base?.thing?.(String(word).toLowerCase())?.catch?.(() => null); } catch { /* the catalog is optional */ } }   // fill the settled cache for the next turn
  if (taught.form === 'own') {
    const id = `th${++st.n}`;
    const t = { id, kind: taught.subject, name: taught.object, attrs: { owner: 'you' }, origin: 'learned', shown: ['learned'] };
    st.things.push(t);
    t.aspects = { ...aspectsFor(ctx)(t), social: 'schema' };
  }
  return ok(taught.say, { form: taught.form, wire: r.line });
}

/**
 * "Undo that" / "forget that" after a lesson: the newest lesson goes (its wires, and the thing of the user it made). The reply names what was forgotten.
 */
export function forget(ctx) {
  const st = ensure(ctx.state);
  const last = st.lessons?.pop();
  if (!last) return no('missing', 'There is nothing you taught me to take back yet.');
  forgetLast(st.learned, last.n);
  if (last.own) st.things = st.things.filter((t) => t.id !== last.own);
  if (last.form === 'own') return ok(`OK, I forgot your ${last.subject} ${last.object}.`);
  if (last.form === 'mix') return ok(`OK, I forgot that ${String(last.say ?? '').replace(/^OK, /, '').replace(/\.$/, '')}.`);
  const who = String(last.subject ?? '').replace(/_/g, ' ');
  return ok(`OK, I forgot what you taught me about ${/s$/.test(who) ? who : `${who}s`}.`);
}

/** The things of the user (what they named: "my dog is called Rex"), [{ kind, name }], newest last; from the lessons and from what the session's worlds were told. */
const ownOf = (ctx) => {
  const seen = new Set();
  const fromLessons = () => (ensure(ctx.state).learned ?? []).map((l) => /session\.learned\.own kind="([^"]*)" name="([^"]*)"/.exec(l)).filter(Boolean).map((m) => ({ kind: m[1], name: m[2] }));
  return (ctx.knowledge?.own ? ctx.knowledge.own() : fromLessons()).filter((x) => { const k = `${x.kind}|${x.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
};
/** A pet is a thing of the user whose kind the catalog keeps as an animal (a record of an animal type, or "animal" up its is-a chain); with no catalog every named thing counts. */
function isAnimal(ctx, kind) {
  const k = ctx.knowledge;
  if (!k?.peek) return true;
  const th = k.peek(kind);
  if ((th?.wires ?? []).some((w) => /\.animals?\./.test(w.type) || (w.f?.kind ?? []).includes('animal'))) return true;
  return (k.ancestors?.(kind) ?? []).some((a) => /^(?:animal|pet|mammal|bird|fish|reptile)$/.test(a));
}
const PET = /^(?:pet|pets|animal|animals)$/;
const kinds = (xs) => list(xs.map((x) => an(x.kind)));
/**
 * Questions about the things of the user: `seek` = called (what is my dog called), kind (who is Rex, what pet is Rex), list (what pets do I have), exists (do I have a dog, is Rex a dog).
 * `kind` may be a kind word (dog), or pet / animal (every animal of the user); `called` a name.
 */
export function own(ctx, { seek = 'called', kind = '', called = '' } = {}) {
  const k = String(kind ?? '').toLowerCase().trim().replace(/^(?:a|an|the|my|our)\s+/, ''), n = String(called ?? '').trim();
  const lemma = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
  const all = ownOf(ctx), pets = all.filter((x) => isAnimal(ctx, x.kind));
  const ofKind = !k ? pets : PET.test(k) ? pets : all.filter((x) => x.kind === k || x.kind === lemma(k));
  const word = !k || PET.test(k) ? 'pet' : lemma(k);
  if (seek === 'called') {
    if (!ofKind.length) return no('missing', word === 'pet' ? "I don't know your pet's name yet. You can tell me: My dog is called Rex." : `I don't know what your ${word} is called. You can tell me: My ${word} is called Rex.`);
    if (ofKind.length > 1 && word === 'pet') return { status: 'conflicting', alternatives: ofKind.map((x) => `${x.name} (your ${x.kind})`) };
    const x = ofKind.at(-1);
    return ok(`Your ${word} is called ${x.name}.`, { values: [x.name] });
  }
  if (seek === 'list') {
    if (!pets.length) return ok('You have not told me about any pets yet. You can say: I have a cat called Tom.', { values: [] });
    return ok(`You have ${kinds(pets)}.`, { values: pets.map((x) => x.kind) });
  }
  if (seek === 'kind') {
    const x = all.find((y) => y.name.toLowerCase() === n.toLowerCase());
    if (!x) return no('missing', `I don't know who ${n} is yet. You can tell me: My dog is called ${n || 'Rex'}.`);
    if (k && !PET.test(k)) return ok(x.kind === lemma(k) ? `Yes, ${x.name} is your ${x.kind}.` : `No, ${x.name} is your ${x.kind}.`, { values: [x.kind === lemma(k) ? 'yes' : 'no'] });
    return ok(`${x.name} is your ${x.kind}.`, { values: [x.kind] });
  }
  // exists
  if (ofKind.length) return ok(`Yes, you have ${an(word === 'pet' ? ofKind[0].kind : word)}.`, { values: ['yes'] });
  return no('missing', `I don't know whether you have ${an(word)}. You can tell me: I have ${an(word)} called Rex.`);
}

/** Host hook (spec 17): the words of a lesson the catalog should have loaded before `learn` reads it by type (the thing and the values it is said to have or be). */
export function openSlots(ctx, { action, args = {} } = {}) {
  if (action !== 'things.learn') return [];
  const t = String(args.text ?? '').toLowerCase().replace(/[.!?]+$/, '');
  const words = t.match(/[a-z]+/g) ?? [];
  const SKIP = /^(?:a|an|the|is|are|has|have|got|and|or|of|my|i|we|it|its|can|cannot|cant|not|make|makes|give|gives|called|named|remember|note|that|please|kind|type|sort|baby|covered|in|on|at|with)$/;
  const out = [];
  for (const w of words) if (!SKIP.test(w) && !/^\d+$/.test(w) && !out.includes(w)) out.push(w);
  return out.slice(0, 6);
}

/** A view publishes its things: `view` (its id) and `items` (the whole list). Returns { ids: { key: thingId } }. */
export function sync(ctx, { view, items } = {}) {
  const st = ensure(ctx.state);
  if (!view) return no('missing', 'No view named.');
  const aspects = aspectsFor(ctx);
  return ok(syncStore(st, view, items ?? [], aspects), { note: 'synced' });
}

/** The views the loaded worlds declare (their `view` operation), cached by the list of worlds. */
function viewsOf(ctx, st) {
  const worlds = ctx.worlds?.() ?? [];
  const key = worlds.map((w) => w.id).join('|');
  if (st.viewKey === key && Object.keys(st.views).length) return Object.values(st.views);
  const out = {};
  for (const w of worlds) {
    budget.tick('things.views');
    const r = ctx.request(`${w.id}.view`, {});
    if (r?.status === 'supported' && r.value && typeof r.value === 'object' && r.value.id) out[r.value.id] = r.value;
  }
  st.views = out; st.viewKey = key;
  return Object.values(out);
}

/**
 * The things of worlds that hold things without being views (the drawing board today): their referents, as the session offers them (`ctx.sessionFacts`), enter the store under the id of
 * the world, each keeping its identity. Returns the worlds as places things come from, [{ id, noun, words }].
 */
function bridge(ctx, st, views) {
  const f = ctx.sessionFacts?.();
  if (!f) return [];
  const own = new Set(views.map((v) => v.id)), by = new Map();
  for (const it of f.items ?? []) { budget.tick('things.bridge'); if (!own.has(it.world)) { if (!by.has(it.world)) by.set(it.world, []); by.get(it.world).push(it); } }
  for (const w of st.bridged ?? []) if (!by.has(w)) by.set(w, []);
  st.bridgeIds ??= {};
  const aspects = aspectsFor(ctx);
  for (const [world, items] of by) {
    const r = syncStore(st, world, items.map((i) => ({ key: i.id, thingId: st.bridgeIds[i.id], kind: i.kind, name: null, attrs: { ...(i.aspects ?? {}) } })), aspects);
    Object.assign(st.bridgeIds, r.ids);
  }
  st.bridged = [...by].filter(([, i]) => i.length).map(([w]) => w);
  const worlds = ctx.worlds?.() ?? [];
  return st.bridged.map((id) => {
    const w = worlds.find((x) => x.id === id);
    const title = String(w?.title ?? id.split('.').at(-1)).replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase();
    return { id, noun: title, words: [w?.tab, ...title.split(' ')].filter(Boolean) };
  });
}

const thingArg = (t, views) => ({ id: t.id, kind: t.kind, name: t.name, label: t.label, attrs: t.attrs, parts: t.parts, origin: t.origin, originNoun: views.find((v) => v.id === t.origin)?.noun, aspects: t.aspects });

/** Select things into a view. args: { ids | thing (words: a name, a kind, "what I drew", "the discussion"), to (the view's words), from (the view that sends) }. */
export function show(ctx, { ids, thing, to, from } = {}) {
  const st = ensure(ctx.state);
  const views = viewsOf(ctx, st);
  const view = viewByWords(views, to);
  if (!view) return no('unsupported', `I do not know a place called "${to}" to show things in. I can show things in ${list(views.map((v) => `the ${v.noun}`)) || 'no view yet'}.`);
  const holders = bridge(ctx, st, views);
  const sel = ids?.length ? { things: ids.map((id) => st.things.find((t) => t.id === id)).filter(Boolean), session: false, view: null } : select(st, thing, [...views, ...holders]);
  const things = sel.things;
  const facts = sel.session && view.facts ? ctx.sessionFacts?.() : null;
  const hasFacts = !!facts && !!(facts.topics?.length || facts.games?.length || facts.places?.length);
  if (!things.length && !hasFacts) return no('unsupported', `There is nothing to show in the ${view.noun}: no such thing in this session yet.`);
  const cells = [], lines = [], take = [];
  const about = sel.session ? 'the discussion' : sel.view ? sel.view.noun : null;
  for (const t of things) {
    budget.tick('things.show');
    const cell = { id: t.id, kind: t.kind, name: t.name, to: view.id };
    const why = whyNot(t, view);
    if (t.shown.includes(view.id)) { cell.status = 'already'; cell.note = `${labelOf(t) === t.kind ? `The ${t.kind}` : labelOf(t)} is already in the ${view.noun}.`; }
    else if (why) { cell.status = 'na'; cell.note = why; }
    else if (view.many) { take.push({ cell, t }); cells.push(cell); continue; }
    else {
      const r = ctx.request(`${view.id}.adopt`, { thing: thingArg(t, views) });
      if (r?.status === 'supported') { cell.status = 'ok'; cell.note = String(r.value ?? r.note); }
      else { cell.status = 'refused'; cell.note = String(r?.note ?? r?.value ?? `The ${view.noun} cannot take ${an(t.kind)}.`); }
    }
    cells.push(cell); lines.push(cell.note);
  }
  if (view.many && (take.length || hasFacts)) {   // one request for the whole selection: one step to undo, and a view that counts or writes sees the set
    const r = ctx.request(`${view.id}.adopt`, { things: take.map((x) => thingArg(x.t, views)), facts: hasFacts ? { topics: facts.topics, games: facts.games, places: facts.places } : null, about });
    for (const x of take) {
      if (r?.status === 'supported') { x.cell.status = 'ok'; x.cell.note = String(r.value ?? r.note); if (!x.t.shown.includes(view.id)) x.t.shown.push(view.id); }
      else { x.cell.status = 'refused'; x.cell.note = String(r?.note ?? r?.value ?? `The ${view.noun} cannot take ${an(x.t.kind)}.`); }
    }
    lines.push(String(r?.status === 'supported' ? r.value ?? r.note : r?.note ?? r?.value ?? `The ${view.noun} could not take them.`));
  }
  ctx.effect('things.shown', { to: view.id, cells });
  ctx.effect('things.shown.' + view.id, { n: cells.filter((c) => c.status === 'ok').length });
  return ok([...new Set(lines)].join(' '), { cells });
}

/** What the store holds, one line per thing with its aspects and the views that show it. */
export function list_(ctx) {
  const st = ensure(ctx.state);
  if (!st.things.length) return ok('No things yet in this session.');
  return ok(st.things.map((t) => `${labelOf(t)} (${t.kind}; ${Object.keys(t.aspects ?? {}).filter((a) => ASPECTS.includes(a)).join(', ')}; in ${t.shown.join(', ')})`).join('; ') + '.');
}
export { list_ as list };
