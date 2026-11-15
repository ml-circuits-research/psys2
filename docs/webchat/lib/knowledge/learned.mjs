// SPDX-License-Identifier: AGPL-3.0-only
/**
 * session.learned (spec 23): what the user teaches in any view ("a villa is a kind of house", "my dog is called Rex", "ducks float", "fish live in water") stored as wires of
 * the knowledge format (`@learned.N <type> key=value ... core.source="user"`) in the session, and read at the knowledge tier by every consumer: `withLearned(catalog, read)` returns the
 * catalog with those wires overlaid, with the same API (`peek`, `thing`, `wires`), so a view that reads the catalog reads the lesson with no code of its own.
 * Browser-safe: no `node:*`. The catalog is shared by all sessions; the learned wires belong to one session (the caller gives `read`, a function returning the wire lines).
 *
 * The wires written: a kind-of fact is a word sense (`k.words.sense ... is_a=`), an ability or a habitat is a commonsense fact (`k.commonsense.thing ... can= / cannot= / at= / made_of=`), a thing of
 * the user is `session.learned.own kind= name= owner=user`.
 */
import { parseFact, lemmaCandidates } from './facts.mjs?v=e6e977142f';
import { parseTeachTyped } from './teach-typed.mjs?v=00495dbd36';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
// TEMPORARY (until k.actions / k.commonsense carry the abilities of kinds): the verbs read as an ability when a bare plural says them ("ducks float"). Other forms need no list.
export const ABILITY_SEED = ['float', 'fly', 'swim', 'sink', 'run', 'climb', 'jump', 'glow', 'melt', 'burn', 'sing', 'dance', 'crawl', 'bark', 'roar', 'dig', 'hop', 'glide'];
const LEAD = /^(?:please |remember that |note that |i tell you that |you should know that |did you know that )/;
const clean = (s) => String(s ?? '').toLowerCase().replace(/[.!?]+$/, '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim().replace(LEAD, '');
const strip = (s) => clean(s).replace(/^(?:an?|the|some)\s+/, '');
const singular = (w) => { const c = lemmaCandidates(w); return c.length > 1 ? c[c.length - 1] : w; };
const q = (s) => JSON.stringify(String(s));
const lemmaOf = (w) => singular(strip(w).replace(/ /g, '_')).replace(/_/g, ' ');
const properName = (raw, lower) => { const i = String(raw).toLowerCase().lastIndexOf(lower); const n = i >= 0 ? String(raw).slice(i, i + lower.length) : lower; return n.charAt(0).toUpperCase() + n.slice(1); };

/**
 * Reads one taught sentence: `{ form, subject, object, line (a wire without its id), say }` or null when the sentence teaches nothing in the forms known.
 * Forms: "X is a kind of Y" / "a X is a Y"; "my X is called N" / "I have a X called N"; "X can / cannot V"; "X V" with V an ability (seed list); "X live in Y"; "X is made of Y".
 */
export function parseTeach(text, typing = null) {
  const raw = String(text ?? '').trim(), t = clean(raw);
  if (!t || t.length > 120 || /\?$/.test(raw)) return null;
  let m;
  if ((m = /^my (.+?) (?:is|was) (?:called|named) (.+)$/.exec(t)) || (m = /^i have an? (.+?) (?:called|named) (.+)$/.exec(t)) || (m = /^my (.+?)(?:'s| s)? name is (.+)$/.exec(t))) {
    const kind = lemmaOf(m[1]), name = properName(raw, m[2].trim());
    return { form: 'own', subject: kind, object: name, line: `session.learned.own kind=${q(kind)} name=${q(name)} owner=user`, say: `Nice! Your ${kind} is called ${name}. I will remember that.` };
  }
  // a statement read BY TYPE (src/knowledge/teach-typed.mjs): a wire of the catalog's own type, read by every reader of the catalog at the taught tier
  const typed = typing ? parseTeachTyped(raw, { ...typing, lemma: (w) => typing.lemma?.(w) ?? lemmaOf(w) }) : null;
  if (typed) return { ...typed, line: typed.lines[0] };
  if ((m = /^(.+?) (?:is|are) (?:a |an )?(?:kind|type|sort) of (.+)$/.exec(t)) || (m = /^an? (.+?) is an? (.+)$/.exec(t))) {
    const a = lemmaOf(m[1]), b = lemmaOf(m[2]);
    if (!a || !b || a === b || /\b(?:and|or)\b/.test(a + b)) return null;
    return { form: 'is_a', subject: a, object: b, line: `k.words.sense word=${q(a)} pos=noun n=0 gloss=${q(`a kind of ${b}`)} is_a=${q(b)}`, say: `OK, ${a === 'a' ? '' : 'a '}${a} is a kind of ${b}.` };
  }
  if ((m = /^(.+?) (?:can't|cant|cannot|can not) (\w+)$/.exec(t)) && !/^(?:what|who|which|how|where|when|why)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'cannot', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} cannot=${q(m[2])}`, say: `OK, ${m[1]} cannot ${m[2]}.` }; }
  if ((m = /^(.+?) can (\w+(?: \w+)?)$/.exec(t)) && !/^(?:what|who|which|how|where|when|why|you|i|we|can)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'can', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} can=${q(m[2])}`, say: `OK, ${m[1]} can ${m[2]}.` }; }
  if ((m = /^(.+?) (?:live|lives|stay|stays|sleep|sleeps|stand|stands|grow|grows|float|floats|swim|swims|fly|flies|drive|drives|run|runs) (?:in|on|at|under|near) (.+)$/.exec(t)) && !/^(?:where|who|what|which|how|do|does|i|we|you)\b/.test(m[1])) { const a = lemmaOf(m[1]), b = strip(m[2]); return { form: 'at', subject: a, object: b, line: `k.commonsense.thing name=${q(a)} at=${q(b)}`, say: `OK, ${m[0]}.` }; }
  // a count with no schema to type it (no catalog): kept as a commonsense fact of the thing, `has="4 legs"`, which the count reader of the overlay also reads
  if ((m = /^(?:an? |the )?([a-z]+(?: [a-z]+)?) (?:has|have|has got|have got) (\d+) ([a-z]+)$/.exec(t)) && !/^(?:i|you|we|they|he|she|it|my|your)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'count', subject: a, object: `${m[2]} ${m[3]}`, line: `k.commonsense.thing name=${q(a)} has=${q(`${m[2]} ${m[3]}`)}`, say: `OK, ${t}.`}; }
  if ((m = /^(.+?) (?:is|are) made (?:of|from|out of) (.+)$/.exec(t))) { const a = lemmaOf(m[1]), b = strip(m[2]); return { form: 'made_of', subject: a, object: b, line: `k.commonsense.thing name=${q(a)} made_of=${q(b)}`, say: `OK, ${m[1]} is made of ${b}.` }; }
  if ((m = new RegExp(`^(.+?s|\\w+) (${ABILITY_SEED.join('|')})s?$`).exec(t)) && !/[,;]|\b(?:it|he|she|they|is|are|eats?|has|have)\b/.test(m[1]) && !/^(?:i|you|we|they|it|he|she|what|who|do|does|can|please|let|lets)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'can', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} can=${q(m[2])}`, say: `OK, ${m[1]} ${m[2]}.` }; }
  return null;
}

const lineOf = (text, n) => `@learned.${n} ${text} core.source="user"`;
/** Appends the wire of a taught sentence to `lines` (the session's learned wires, text in the wire format); returns the wire line, or the existing one when the same fact is already there (null: nothing to learn). */
export function learn(lines, taught) {
  if (!taught?.line) return null;
  const bodies = taught.lines?.length ? taught.lines : [taught.line];
  const body = (l) => l.replace(/^@learned\.\d+ /, '').replace(/ core\.source="user"$/, '');
  const dups = bodies.map((b) => lines.find((l) => body(l) === b));
  if (dups.every(Boolean)) return { line: dups[0], existing: true };
  const n = (lines.map((l) => Number(/^@learned\.(\d+) /.exec(l)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)) + 1;
  const added = bodies.filter((b, i) => !dups[i]).map((b, i) => lineOf(b, n + i));
  lines.push(...added);
  return { line: added[0], lines: added, existing: false };
}

/** Takes back the newest lesson (its wires): returns the lines removed, or [] when nothing was taught. A lesson of several wires was written together and goes together. */
export function forgetLast(lines, count = 1) {
  if (!lines.length) return [];
  return lines.splice(lines.length - Math.max(1, count), Math.max(1, count));
}

/** The knowledge catalog with the learned wires of a session overlaid. `read()` returns the wire lines (text); the overlay is rebuilt only when they change. */
export function withLearned(base, read, readMem = null, memStore = null) {
  if (!base) return base;
  let seen = '', wires = [];
  const all = () => {
    const lines = read() ?? [];
    const key = `${lines.length}|${lines.at(-1) ?? ''}`;   // a lesson taken back and another taught keep the length: the newest line tells them apart
    if (key !== seen) { seen = key; wires = lines.map((l) => parseFact(l)).filter(Boolean); }
    return wires;
  };
  const one = (r, k) => r.f[k]?.[0];
  // What the worlds of the session were told in their own statements (the wires they keep: `kids.animals.animal name=duck can_swim=true`, a pet `kind=dog called=Rex`): every non-core wire of the
  // session memory that carries a name (name / word / called) is a record of that name for the overlay, in any world, with no table of types.
  const NAMEY = /^(?:name|word|called)$/;
  // THE INDEX of those records, built once per state of the memory (LEARNED-MEM-INDEX, spec 06 "Compute budgets"): every catalog lookup of a turn (each word of each
  // candidate reading, each translation candidate, each encoder pass) used to scan the whole session memory, which grows with the picture, so a long draw session ran
  // out of the step budget at `learned.mem`. `memStore()` returns the memory's store (src/interpreter/memory.mjs WireStore), whose `memo` keeps the index until the next
  // wire is added and shares it with the dry-run clones of the session: the index is built once per contents (one tick per wire), a lookup costs one tick per candidate
  // word. Without a store the index is built per lookup.
  const memIndex = () => { const st = memStore?.() ?? null; return typeof st?.memo === 'function' ? st.memo('learned.mem', buildMemIndex) : buildMemIndex(); };
  const buildMemIndex = () => {
    const all = readMem() ?? [];
    const byId = new Map(all.map((w) => [w.id, w]));
    const tail = (k) => String(k).split('.').at(-1);
    const recs = [], byName = new Map();
    for (const w of all) {
      budget.tick('learned.mem');
      if (/^(?:core|session|ui|meta)\./.test(w.type) || w.entries.some((e) => e.key === 'core.status' && e.value?.v === 'retracted')) continue;
      const f = {};
      for (const e of w.entries) { let v = String(e.value?.v ?? ''); if (byId.get(v.replace(/^\$/, ''))) { const r = byId.get(v.replace(/^\$/, '')); v = String(r.entries.find((x) => /(?:^|\.)name$/.test(x.key))?.value?.v ?? v); } (f[tail(e.key)] ??= []).push(v); }
      const rec = { i: recs.length, id: w.id, type: w.type, f };
      recs.push(rec);
      for (const [k, vs] of Object.entries(f)) if (NAMEY.test(k)) for (const v of vs) { const n = v.toLowerCase().replace(/_/g, ' '); const l = byName.get(n) ?? byName.set(n, []).get(n); if (l.at(-1) !== rec) l.push(rec); }
    }
    return { recs, byName };
  };
  const memWires = (cands) => {
    if (!readMem) return [];
    const { recs, byName } = memIndex();
    let pick = recs;
    if (cands) {
      const set = new Set();
      for (const c of cands) { budget.tick('learned.mem'); for (const r of byName.get(c) ?? []) set.add(r); }
      pick = [...set].sort((a, b) => a.i - b.i);   // memory order, as the scan gave it
    }
    const out = [];
    for (const r of pick) {
      const f = r.f;
      const hit = !cands ? [null, f.called ?? f.name ?? ['']] : Object.entries(f).find(([k, vs]) => NAMEY.test(k) && vs.some((v) => cands.includes(v.toLowerCase().replace(/_/g, ' '))));
      if (!hit) continue;
      out.push({ id: r.id, type: r.type, f: f.name ? { ...f } : { ...f, name: [hit[1][0]] }, shard: 'session.memory' });   // a copy: the index is shared by every lookup
    }
    return out;
  };
  const memWiresAll = () => memWires(null);
  const forWord = (word) => {
    const cands = lemmaCandidates(word).map((c) => c.replace(/_/g, ' '));
    const mine = all().filter((w) => (w.type === 'k.words.sense' && cands.includes(String(one(w, 'word')).toLowerCase())) || (w.type === 'k.commonsense.thing' && cands.includes(String(one(w, 'name')).toLowerCase())));
    // a statement taught by type (`k.animals.animal name="zebra" legs="4"`, `k.attributes.thing name="zebra" colour="black"`): a record of the thing at the TAUGHT tier, before the catalog's own
    const typed = all().filter((w) => /^k\./.test(w.type) && w.type !== 'k.words.sense' && w.type !== 'k.commonsense.thing' && cands.includes(String(one(w, 'name') ?? '').toLowerCase()));
    const own = all().filter((w) => w.type === 'session.learned.own' && cands.includes(String(one(w, 'name')).toLowerCase()));
    return { cands, mine, own, typed, mem: memWires(cands) };
  };
  /** The things the user told a world about by name (a wire with a `kind` and a `called`: a pet, a relative), whatever the world. */
  const ownFromMemory = () => memWiresAll().filter((w) => w.f.kind?.[0] && w.f.called?.[0]).map((w) => ({ kind: w.f.kind[0].toLowerCase().replace(/_/g, ' '), name: w.f.called[0] }));
  const merge = (word, th, parentOf) => {
    budget.tick('learned.merge');
    const { cands, mine, own, typed, mem } = forWord(word);
    if (!mine.length && !own.length && !mem.length && !typed.length) return th;
    const out = th ? { ...th, senses: [...(th.senses ?? [])], objects: [...(th.objects ?? [])] } : { name: cands[0], word, shards: [], loaded: [], objects: [], commonsense: null, senses: [], wires: [], learned: true };
    out.learned = true;
    // the TAUGHT tier: what the user taught in this session (newest first) and what the session's worlds were told come before the catalog's records, so a reader that takes the first
    // record with a slot (a count, a colour, a class) answers with the lesson: "a square has 5 sides" then "how many sides does a square have" says 5 in this session
    if (typed.length || mem.length) { out.wires = [...typed.slice().reverse().map((w) => ({ ...w, shard: 'session.learned', source: 'user' })), ...mem, ...(out.wires ?? [])]; out.fromSession = true; }
    for (const w of mem) for (const [k, vs] of Object.entries(w.f)) {   // an ability a world keeps as a flag (can_swim=true) is an ability of the kind
      const m = /^can_(.+)$/.exec(k);
      if (!m || !/^(?:true|false)$/.test(vs[0])) continue;
      const cs = out.commonsense = { ...(out.commonsense ?? {}), shard: out.commonsense?.shard ?? 'session.memory', name: out.commonsense?.name ?? [out.name] };
      const key = vs[0] === 'true' ? 'can' : 'cannot';
      cs[key] = [...new Set([...(cs[key] ?? []), m[1].replace(/_/g, ' ')])];
    }
    for (const w of mine) {
      if (w.type === 'k.words.sense') out.senses.unshift({ pos: 'noun', n: 0, gloss: one(w, 'gloss') ?? '', synonyms: [], isA: w.f.is_a ?? [], shard: 'session.learned' });
      else {
        const cs = out.commonsense = { ...(out.commonsense ?? {}), shard: out.commonsense?.shard ?? 'session.learned' };
        for (const k of ['can', 'cannot', 'at', 'made_of', 'has', 'used_for']) if (w.f[k]) cs[k] = [...new Set([...(cs[k] ?? []), ...w.f[k]])];
        cs.name ??= [out.name];
      }
    }
    for (const w of own) {   // a thing of the user: the thing of its kind, under the user's name
      const kind = one(w, 'kind');
      out.senses.unshift({ pos: 'noun', n: 0, gloss: `your ${kind}`, synonyms: [], isA: [kind], shard: 'session.learned' });
      out.name = cands[0]; out.owned = { kind, name: one(w, 'name') };
    }
    if (!out.objects.length) {   // a kind of X is drawn as X (the kinds above it in the is-a chain, learned or not, the first that has a picture)
      const seen = new Set(cands);
      let up = out.senses.flatMap((s) => s.isA ?? []);
      for (let i = 0; i < 6 && up.length && !out.objects.length; i++) {
        const next = [];
        for (const p of up) {
          if (seen.has(p)) continue; seen.add(p);
          const pt = parentOf(p);
          if (pt?.objects?.length) { out.objects = pt.objects; out.drawnAs = p; break; }
          next.push(...(pt?.senses ?? []).flatMap((s) => s.isA ?? []));
        }
        up = next;
      }
    }
    return out;
  };
  const o = Object.create(base);
  o.base = base;
  const any = (f) => f.mine.length || f.own.length || f.mem.length || f.typed.length;
  o.peek = (word) => { const th = base.peek(word); return any(forWord(word)) ? merge(word, th ?? null, (p) => o.peek(p)) : th; };
  o.thing = async (word) => {
    const th = await base.thing(word);
    const f = forWord(word);
    if (!any(f)) return th;
    for (const p of [...f.mine, ...f.own].flatMap((w) => w.f.is_a ?? (w.f.kind ?? []))) await base.thing(p).catch(() => null);
    return merge(word, th, (p) => o.peek(p));
  };
  const taughtOf = (type) => all().filter((w) => w.type === type).reverse().map((w) => ({ ...w, shard: 'session.learned', source: 'user' }));
  o.wires = async (type, opts) => [...taughtOf(type), ...await base.wires(type, opts)];   // the taught tier first (a mix the user taught answers before the catalog's)
  /** The loaded wires of a type with the session's lessons first (the taught tier); undefined when neither the catalog nor the session has any. */
  o.peekWires = (type) => { const mine = taughtOf(type), cat = base.peekWires?.(type); return mine.length ? [...mine, ...(cat ?? [])] : cat; };
  /** The things the user named, optionally of one kind: [{ kind, name }]. */
  o.own = (kindWord) => [...all().filter((w) => w.type === 'session.learned.own').map((w) => ({ kind: one(w, 'kind'), name: one(w, 'name') })), ...ownFromMemory()]
    .filter((x) => !kindWord || lemmaCandidates(kindWord).map((c) => c.replace(/_/g, ' ')).includes(x.kind));
  /** The kinds above a word in the is-a chain, learned first: ['house', 'building']. A synchronous read of what is settled. */
  o.ancestors = (word) => {
    const out = [], seen = new Set();
    let up = [word];
    for (let i = 0; i < 6 && up.length; i++) {
      const next = [];
      for (const w of up) {
        const th = o.peek(w);
        // the parents a word has: its senses' is-a, what the records of the catalog say it is (a role `is=girl`, a kind `is_a=child`) and, last, the figure it is drawn as
        // (`drawing=person`: a sister, a girl, a man are drawn as a person, so they are people), with no table of words
        const recs = (th?.wires ?? []).filter((x) => !/^(?:core|session|ui|meta)\./.test(x.type));
        const parents = [...(th?.senses ?? []).flatMap((s) => s.isA ?? []), ...recs.flatMap((x) => [...(x.f?.is ?? []), ...(x.f?.is_a ?? [])]), ...recs.flatMap((x) => x.f?.drawing ?? [])];
        for (const p of parents) { const k = String(p).replace(/_/g, ' '); if (!seen.has(k)) { seen.add(k); out.push(k); next.push(k); } }
      }
      up = next;
    }
    return out;
  };
  /**
   * How many `kind` a thing has: a numeric slot of its records named by the word (legs, sides), the taught records first (the taught tier), then what the catalog says (a sense's gloss, the
   * parts of its picture). `{ n, from }` or null.
   */
  o.countOf = (th, kind) => {
    const cands = new Set([kind, ...lemmaCandidates(kind)].map((c) => String(c).toLowerCase().replace(/ /g, '_')));
    for (const w of th?.wires ?? []) {
      if (!w?.type || /^core\./.test(w.type)) continue;
      for (const [k, vs] of Object.entries(w.f ?? {})) if ((cands.has(k) || cands.has(`${k}s`) || cands.has(k.replace(/s$/, ''))) && /^\d+(?:\.\d+)?$/.test(String(vs?.[0] ?? ''))) return { n: Number(vs[0]), from: 'gloss', taught: w.shard === 'session.learned' };
    }
    for (const h of th?.commonsense?.has ?? []) { const m = /^(\d+) (.+)$/.exec(String(h)); if (m && cands.has(m[2].replace(/ /g, '_'))) return { n: Number(m[1]), from: 'gloss', taught: true }; }   // a count taught with no schema
    return base.countOf ? base.countOf(th, kind) : null;
  };
  o.learnedCount = () => all().length;
  return o;
}
