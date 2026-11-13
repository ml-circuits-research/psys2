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
import { parseFact, lemmaCandidates } from './facts.mjs?v=2ace0ebd09';

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
export function parseTeach(text) {
  const raw = String(text ?? '').trim(), t = clean(raw);
  if (!t || t.length > 120 || /\?$/.test(raw)) return null;
  let m;
  if ((m = /^my (.+?) (?:is|was) (?:called|named) (.+)$/.exec(t)) || (m = /^i have an? (.+?) (?:called|named) (.+)$/.exec(t)) || (m = /^my (.+?)(?:'s| s)? name is (.+)$/.exec(t))) {
    const kind = lemmaOf(m[1]), name = properName(raw, m[2].trim());
    return { form: 'own', subject: kind, object: name, line: `session.learned.own kind=${q(kind)} name=${q(name)} owner=user`, say: `OK, I will remember that your ${kind} is called ${name}.` };
  }
  if ((m = /^(.+?) (?:is|are) (?:a |an )?(?:kind|type|sort) of (.+)$/.exec(t)) || (m = /^an? (.+?) is an? (.+)$/.exec(t))) {
    const a = lemmaOf(m[1]), b = lemmaOf(m[2]);
    if (!a || !b || a === b || /\b(?:and|or)\b/.test(a + b)) return null;
    return { form: 'is_a', subject: a, object: b, line: `k.words.sense word=${q(a)} pos=noun n=0 gloss=${q(`a kind of ${b}`)} is_a=${q(b)}`, say: `OK, ${a === 'a' ? '' : 'a '}${a} is a kind of ${b}.` };
  }
  if ((m = /^(.+?) (?:can't|cant|cannot|can not) (\w+)$/.exec(t))) { const a = lemmaOf(m[1]); return { form: 'cannot', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} cannot=${q(m[2])}`, say: `OK, ${m[1]} cannot ${m[2]}.` }; }
  if ((m = /^(.+?) can (\w+(?: \w+)?)$/.exec(t)) && !/^(?:what|who|which|how|where|when|why|you|i|we|can)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'can', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} can=${q(m[2])}`, say: `OK, ${m[1]} can ${m[2]}.` }; }
  if ((m = /^(.+?) (?:live|lives|stay|stays|sleep|sleeps|stand|stands|grow|grows|float|floats|swim|swims|fly|flies|drive|drives|run|runs) (?:in|on|at|under|near) (.+)$/.exec(t)) && !/^(?:where|who|what|which|how|do|does|i|we|you)\b/.test(m[1])) { const a = lemmaOf(m[1]), b = strip(m[2]); return { form: 'at', subject: a, object: b, line: `k.commonsense.thing name=${q(a)} at=${q(b)}`, say: `OK, ${m[0]}.` }; }
  if ((m = /^(.+?) (?:is|are) made (?:of|from|out of) (.+)$/.exec(t))) { const a = lemmaOf(m[1]), b = strip(m[2]); return { form: 'made_of', subject: a, object: b, line: `k.commonsense.thing name=${q(a)} made_of=${q(b)}`, say: `OK, ${m[1]} is made of ${b}.` }; }
  if ((m = new RegExp(`^(.+?s|\\w+) (${ABILITY_SEED.join('|')})s?$`).exec(t)) && !/^(?:i|you|we|they|it|he|she|what|who|do|does|can|please|let|lets)\b/.test(m[1])) { const a = lemmaOf(m[1]); return { form: 'can', subject: a, object: m[2], line: `k.commonsense.thing name=${q(a)} can=${q(m[2])}`, say: `OK, ${m[1]} ${m[2]}.` }; }
  return null;
}

const lineOf = (text, n) => `@learned.${n} ${text} core.source="user"`;
/** Appends the wire of a taught sentence to `lines` (the session's learned wires, text in the wire format); returns the wire line, or the existing one when the same fact is already there (null: nothing to learn). */
export function learn(lines, taught) {
  if (!taught?.line) return null;
  const body = taught.line;
  const dup = lines.find((l) => l.replace(/^@learned\.\d+ /, '').replace(/ core\.source="user"$/, '') === body);
  if (dup) return { line: dup, existing: true };
  const line = lineOf(body, lines.length + 1);
  lines.push(line);
  return { line, existing: false };
}

/** The knowledge catalog with the learned wires of a session overlaid. `read()` returns the wire lines (text); the overlay is rebuilt only when they change. */
export function withLearned(base, read, readMem = null) {
  if (!base) return base;
  let seen = -1, wires = [];
  const all = () => {
    const lines = read() ?? [];
    if (lines.length !== seen) { seen = lines.length; wires = lines.map((l) => parseFact(l)).filter(Boolean); }
    return wires;
  };
  const one = (r, k) => r.f[k]?.[0];
  // What the worlds of the session were told in their own statements (the wires they keep: `kids.animals.animal name=duck can_swim=true`, a pet `kind=dog called=Rex`): every non-core wire of the
  // session memory that carries a name (name / word / called) is a record of that name for the overlay, in any world, with no table of types.
  const NAMEY = /^(?:name|word|called)$/;
  const memWires = (cands) => {
    const all0 = !cands;
    if (!readMem) return [];
    const out = [], all = readMem() ?? [];
    const byId = new Map(all.map((w) => [w.id, w]));
    const tail = (k) => String(k).split('.').at(-1);
    for (const w of all) {
      budget.tick('learned.mem');
      if (/^(?:core|session|ui|meta)\./.test(w.type) || w.entries.some((e) => e.key === 'core.status' && e.value?.v === 'retracted')) continue;
      const f = {};
      for (const e of w.entries) { let v = String(e.value?.v ?? ''); if (byId.get(v.replace(/^\$/, ''))) { const r = byId.get(v.replace(/^\$/, '')); v = String(r.entries.find((x) => /(?:^|\.)name$/.test(x.key))?.value?.v ?? v); } (f[tail(e.key)] ??= []).push(v); }
      const hit = all0 ? [null, f.called ?? f.name ?? ['']] : Object.entries(f).find(([k, vs]) => NAMEY.test(k) && vs.some((v) => cands.includes(v.toLowerCase().replace(/_/g, ' '))));
      if (!hit) continue;
      if (!f.name) f.name = [hit[1][0]];
      out.push({ id: w.id, type: w.type, f, shard: 'session.memory' });
    }
    return out;
  };
  const memWiresAll = () => memWires(null);
  const forWord = (word) => {
    const cands = lemmaCandidates(word).map((c) => c.replace(/_/g, ' '));
    const mine = all().filter((w) => (w.type === 'k.words.sense' && cands.includes(String(one(w, 'word')).toLowerCase())) || (w.type === 'k.commonsense.thing' && cands.includes(String(one(w, 'name')).toLowerCase())));
    const own = all().filter((w) => w.type === 'session.learned.own' && cands.includes(String(one(w, 'name')).toLowerCase()));
    return { cands, mine, own, mem: memWires(cands) };
  };
  /** The things the user told a world about by name (a wire with a `kind` and a `called`: a pet, a relative), whatever the world. */
  const ownFromMemory = () => memWiresAll().filter((w) => w.f.kind?.[0] && w.f.called?.[0]).map((w) => ({ kind: w.f.kind[0].toLowerCase().replace(/_/g, ' '), name: w.f.called[0] }));
  const merge = (word, th, parentOf) => {
    budget.tick('learned.merge');
    const { cands, mine, own, mem } = forWord(word);
    if (!mine.length && !own.length && !mem.length) return th;
    const out = th ? { ...th, senses: [...(th.senses ?? [])], objects: [...(th.objects ?? [])] } : { name: cands[0], word, shards: [], loaded: [], objects: [], commonsense: null, senses: [], wires: [], learned: true };
    out.learned = true;
    if (mem.length) { out.wires = [...(out.wires ?? []), ...mem]; out.fromSession = true; }
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
  o.peek = (word) => { const th = base.peek(word); return (() => { const f = forWord(word); return f.mine.length || f.own.length || f.mem.length; })() ? merge(word, th ?? null, (p) => o.peek(p)) : th; };
  o.thing = async (word) => {
    const th = await base.thing(word);
    const f = forWord(word);
    if (!f.mine.length && !f.own.length && !f.mem.length) return th;
    for (const p of [...f.mine, ...f.own].flatMap((w) => w.f.is_a ?? (w.f.kind ?? []))) await base.thing(p).catch(() => null);
    return merge(word, th, (p) => o.peek(p));
  };
  o.wires = async (type, opts) => [...await base.wires(type, opts), ...all().filter((w) => w.type === type).map((w) => ({ ...w, shard: 'session.learned', source: 'user' }))];
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
        for (const p of (th?.senses ?? []).flatMap((s) => s.isA ?? [])) { const k = String(p).replace(/_/g, ' '); if (!seen.has(k)) { seen.add(k); out.push(k); next.push(k); } }
      }
      up = next;
    }
    return out;
  };
  o.learnedCount = () => all().length;
  return o;
}
