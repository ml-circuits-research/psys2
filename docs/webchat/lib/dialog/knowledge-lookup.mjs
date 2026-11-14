/**
 * Knowledge by lookup (spec 17). Browser-safe: no `node:*` imports. The host layer that uses the knowledge catalog (`src/knowledge/catalog.mjs`) after a message was read.
 *
 * The rule (owner, 2026-11-13): the FRAME decides the world, the catalog hit decides only WHICH KNOWLEDGE to load, and a hit alone never moves a message to another world.
 *   - `knowledgeAnswer`  a question frame ("what is a X", "how many legs does a X have") whose reading leaves the thing out (or no reading at all) is answered from the
 *                        shards of the thing, by the conversation; no hit: the plain "I don't know what a X is".
 *   - `preloadThings`    the things a reading needs but its world does not have (the open slot of an action, the words it left out) are looked up before the operations run,
 *                        so an operation reads them synchronously through `ctx.knowledge.peek(name)`.
 *   (no veto hook: an action on a referent that must exist in the world - delete, move, color, connect, select - is refused in the world's plain words whatever the catalog knows; a hit never replaces that refusal with a gloss)
 * The catalog is `engine.knowledge` (`createEngine({ options: { knowledge } })`); without it every function here does nothing and the dialog is as it was.
 */
import { leftOut, requestOf } from './world-aware.mjs?v=3487e394dc';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const wordsOf = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu)/i.test(n) ? 'an' : 'a'} ${n}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const firstClause = (g) => String(g).split(/;\s*/)[0].replace(/^\([^)]*\)\s*/, '').trim();


export const knowledgeOf = (dialog) => dialog?.engine?.knowledge ?? null;

/** The answer to a frame about a thing the catalog knows: `{ text, status }`; the plain "I don't know" when the thing says nothing about the question. */
export function answerFrom(frame, th, catalog) {
  const name = th.name, a = article(name), cs = th.commonsense;
  const sense = th.senses[0];
  const what = () => {
    if (sense) {
      const g = firstClause(sense.gloss);
      return /^(?:a|an|the)\s/i.test(g) ? `${cap(name)} is ${g}.` : `${cap(a)}: ${g}.`;
    }
    if (cs) return `${cap(a)} is ${cs.size?.[0] && cs.size[0] !== 'medium' ? `${cs.size[0]}, ` : ''}${cs.used_for?.[0] ? `used for ${cs.used_for[0]}` : 'a thing I know'}.`;
    const parts = th.objects[0]?.parts.map((p) => p.name.replace(/_/g, ' ')).filter((n) => !/^part\d+$/.test(n)) ?? [];
    return parts.length ? `I know what ${a} looks like. It has ${list(parts.slice(0, 6))}.` : `I know ${a}, but I cannot say more yet.`;
  };
  switch (frame.kind) {
    case 'define': {
      let t = what();
      if (cs?.can?.length) t += ` It can ${list(cs.can)}.`;
      return { text: t, status: 'supported' };
    }
    case 'count': {
      const c = catalog.countOf(th, frame.part);
      if (!c) return { text: `I know what ${a} is, but not how many ${frame.part} it has.`, status: 'missing' };
      return c.from === 'gloss' ? { text: `${cap(a)} has ${c.n} ${frame.part}.`, status: 'supported' } : { text: `My picture of ${a} has ${c.n} ${frame.part}.`, status: 'supported' };
    }
    case 'made': return cs?.made_of?.length ? { text: `${cap(a)} is made of ${list(cs.made_of)}.`, status: 'supported' } : { text: `I know what ${a} is, but not what it is made of.`, status: 'missing' };
    case 'where': return cs?.at?.length ? { text: `${cap(a)} is usually found at the ${list(cs.at)}.`, status: 'supported' } : { text: `I know what ${a} is, but not where to find it.`, status: 'missing' };
    case 'can': return cs?.can?.length ? { text: `${cap(a)} can ${list(cs.can)}.`, status: 'supported' } : { text: `I know what ${a} is, but not what it can do.`, status: 'missing' };
    default: return null;
  }
}

/**
 * Rule A (spec 17, section 6): a lookup is an addition after the reading, never a precondition. A catalog that rejects, or never answers, must leave the reading and
 * the turn exactly as they would be without a catalog: `within` settles with `TIMED_OUT` after `engine.knowledgeDeadlineMs` (default 6000, one network read) and counts it
 * in `engine.knowledgeStats.timeouts`; a rejection counts as `failures`. The caller then does what it does for "no hit" and keeps the reading.
 */
export const TIMED_OUT = Symbol('knowledge lookup timed out');
export const LOOKUP_DEADLINE_MS = 6000;
export const knowledgeStatsOf = (dialog) => (dialog.engine.knowledgeStats ??= { timeouts: 0, failures: 0 });
async function within(dialog, promise) {
  const st = knowledgeStatsOf(dialog);
  let timer;
  try {
    const r = await Promise.race([Promise.resolve(promise), new Promise((res) => { timer = setTimeout(() => res(TIMED_OUT), dialog.engine.knowledgeDeadlineMs ?? LOOKUP_DEADLINE_MS); })]);
    if (r === TIMED_OUT) st.timeouts++;
    return r;
  } catch { st.failures++; return TIMED_OUT; } finally { clearTimeout(timer); }
}

async function frameAnswer(dialog, frame) {
  const cat = knowledgeOf(dialog);
  const t0 = clock();
  const th = await within(dialog, cat.thing(frame.slot));
  if (th === TIMED_OUT) return null;   // the reading stands, the world answers as it would without a catalog
  if (!th && cat.unreachable?.()) { knowledgeStatsOf(dialog).failures++; return null; }   // an unreachable catalog is not "I don't know what a X is": nothing changes
  const ms = clock() - t0;
  if (!th) return { reply: `I don't know what ${article(frame.slot)} is.`, status: 'missing', info: { kind: 'knowledge', frame, hit: false, ms } };
  const ans = answerFrom(frame, th, cat);
  return { reply: ans.text, status: ans.status, info: { kind: 'knowledge', frame, hit: true, shards: th.loaded, ms } };
}

/**
 * A knowledge question the reading did not take (spec 17, section 2): one clause, a knowledge frame, and a reading that is none or leaves content words out
 * ("what is a comet" read by a world that never heard of comets, with "comet" left out). Returns `{ reply, status, info }` for the dialog to answer with, or null
 * (not a frame, or the reading took everything: the world answers). The frame decided the conversation; the catalog only supplies the words.
 */
export async function knowledgeAnswer(dialog, english, formal) {
  if (!knowledgeOf(dialog) || formal?.segments?.length !== 1) return null;
  const frame = dialog.engine.interp.lang.know?.(english);
  if (!frame) return null;
  const seg = formal.segments[0];
  const left = seg.unparsed || !seg.wires?.length ? ['*'] : leftOut(seg, !!dialog._waLang && dialog._waLang !== 'en');
  const slot = frame.slot.split(' ');
  const respelled = !left.length && (seg.corrections ?? []).some((c) => slot.includes(String(c.from).toLowerCase()));   // "candle" read as "handle": the reading is of another word
  return left.length || respelled ? frameAnswer(dialog, frame) : null;
}

/**
 * After the operations ran: a knowledge frame that the reading took completely, but whose world answered "missing" (the animals world has never heard of the thing)
 * is asked of the catalog. A hit replaces the "I don't know"; no hit keeps the world's own reply (it may offer to learn the thing).
 */
export async function knowledgeFallback(dialog, english, segments, statuses) {
  if (!knowledgeOf(dialog) || segments?.length !== 1 || statuses?.length !== 1 || statuses[0] !== 'missing' || segments[0].unparsed) return null;
  const frame = dialog.engine.interp.lang.know?.(english);
  if (!frame) return null;
  const r = await frameAnswer(dialog, frame);
  return r?.info.hit ? r : null;
}

/**
 * Look up the things the readings need but their worlds do not hold: the open-slot arguments of a request (`kt`, `thing`) and the content words a reading left out.
 * Fills the catalog's settled cache so that operations read it synchronously (`ctx.knowledge.peek`). Never throws. Returns what was looked up.
 */
/** How long a lookup may take before the user is told it is running (a cached shard answers sooner and says nothing). */
export const NOTICE_AFTER_MS = 350;
/**
 * A lookup of a thing to draw that is still running after NOTICE_AFTER_MS says so ("Looking up how a pineapple looks..."): `engine.onNotice(text)` gets the line in
 * the user's language (the translator's rules, one short sentence), and the drawing follows as the reply. Nothing is said when the host has no `onNotice`.
 */
async function noticeIfSlow(dialog, lookup, name) {
  const notice = dialog.engine?.onNotice;
  if (!notice) return;
  let timer;
  const slow = await Promise.race([lookup.then(() => false, () => false), new Promise((res) => { timer = setTimeout(() => res(true), NOTICE_AFTER_MS); })]);
  clearTimeout(timer);
  if (!slow) return;
  try {
    let text = `Looking up how ${article(name)} looks…`;
    const lang = dialog._waLang;
    if (lang && lang !== 'en' && lang !== 'unknown' && dialog.engine.translator) {
      const r = await (dialog.engine.translator.rules ?? dialog.engine.translator).translate(text, { from: 'en', to: lang });
      const t = typeof r === 'string' ? r : r?.text;
      if (t && !r?.unknown?.length) text = t;
    }
    notice(text);
  } catch { /* no notice */ }
}

export async function preloadThings(dialog, segments) {
  const cat = knowledgeOf(dialog);
  if (!cat) return [];
  const names = new Set(), drawNames = new Set(), needs = new Set(), lists = new Set();
  const foreign = !!dialog._waLang && dialog._waLang !== 'en';
  for (const seg of segments ?? []) {
    if (seg.unparsed) continue;
    try {
      const rq = requestOf(seg);
      // the reading's world says which slots of its action are open (a thing it has no picture of); `thing` is the generic argument of the same idea
      if (rq?.world) {
        const need = dialog.engine.interp.hook(dialog.isession, rq.world, 'needs', { action: rq.action, args: rq.args }, { state: dialog.isession.state[rq.world] ?? {} });   // catalog models the world reads synchronously (the avatar's faces); `wires:<type>`: every wire of a type (the map's cities)
        for (const n of Array.isArray(need) ? need : []) if (['faces', 'schema', 'series'].includes(n) || /^wires:[a-z][a-z0-9_.]*(?:@[a-z][a-z0-9_.]*)?$/i.test(n)) needs.add(n);
        const slots = dialog.engine.interp.hook(dialog.isession, rq.world, 'openSlots', { action: rq.action, args: rq.args }, { state: dialog.isession.state[rq.world] ?? {} });
        for (const n of Array.isArray(slots) ? slots : []) if (n && String(n).split(/\s+/).length <= 3) { names.add(String(n)); drawNames.add(String(n)); }
        // the words of the types whose wires the operation lists or looks up ("animals", "mix"): the catalog loads the wires of the types the schemas' words mean (`preloadWires`)
        const listWords = dialog.engine.interp.hook(dialog.isession, rq.world, 'listNeeds', { action: rq.action, args: rq.args }, { state: dialog.isession.state[rq.world] ?? {} });
        for (const n of Array.isArray(listWords) ? listWords : []) if (n && String(n).split(/\s+/).length <= 2) lists.add(String(n).toLowerCase());
        if (rq.args.thing) names.add(String(rq.args.thing).toLowerCase());
      }
      // a request that hands things to a VIEW (`things.show ... to=map`) is read by the store's world: the view's own `needs` (the map's places) are loaded before it adopts them
      if (rq?.args?.to) {
        const to = String(rq.args.to).toLowerCase();
        for (const w of dialog.engine.set.list()) {
          if (typeof w.ops?.needs !== 'function' || typeof w.ops?.view !== 'function' || w.id === rq.world) continue;
          const v = dialog.engine.interp.hook(dialog.isession, w.id, 'view', {}, { state: dialog.isession.state[w.id] ?? {} })?.value;
          if (!(v?.words ?? []).some((x) => to.includes(String(x).toLowerCase()))) continue;
          const need = dialog.engine.interp.hook(dialog.isession, w.id, 'needs', { action: 'view', args: {} }, { state: dialog.isession.state[w.id] ?? {} });
          for (const n of Array.isArray(need) ? need : []) if (['faces', 'schema', 'series'].includes(n) || /^wires:[a-z][a-z0-9_.]*(?:@[a-z][a-z0-9_.]*)?$/i.test(n)) needs.add(n);
        }
      }
      for (const w of leftOut(seg, foreign).slice(0, 3)) names.add(w);
    } catch { /* a reading that cannot be inspected needs nothing */ }
  }
  const done = [];
  const all = (async () => {
    for (const n of needs) { try { if (n.startsWith('wires:')) { const [t, w] = n.slice(6).split('@'); await cat.wires?.(t, w ? { world: w } : {}); } else await cat[n]?.(); } catch { /* no model is no change */ } }
    for (const n of [...lists].slice(0, 3)) { try { await cat.preloadWires?.(n); } catch { /* no list is no answer */ } }
    for (const n of [...names].slice(0, 6)) {
      try {
        const p = cat.thing(n);
        if (drawNames.has(n) && cat.peek?.(n) === undefined) await noticeIfSlow(dialog, p, n);
        const th = await p; done.push({ name: n, hit: !!th, shards: th?.loaded ?? [] });
      } catch { /* no knowledge is no hit */ }
    }
  })();
  await within(dialog, all);   // one bound for the whole preload: a catalog that hangs delays the turn once, by one read's bound, and changes nothing
  return done;
}

