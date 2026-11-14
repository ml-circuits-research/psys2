// SPDX-License-Identifier: AGPL-3.0-only
// TEMPORARY motion for the avatar: a thin host scheduler and local motion rules. They stand in for the animation world of the knowledge repository (`k.motion`: the rules) and the
// library's `std.motion` (the scheduler), both asked for on 2026-11-14 and not published yet (sopworld 0.40, catalog b9f52e7). When they exist, `MOTION_RULES_TEMPORARY` is read from
// `k.motion`, `createMotion` becomes a thin call of `std.motion`, and this file is deleted. Asks to the knowledge repository (also in questions.md):
//   - the text -> mouth rule, in `k.motion` ONLY (owner, 2026-11-14: not in a language world, not in src/lang): one general rule that maps the letters of a text to the mouth classes
//     (open, wide, round, closed lips m b p, lip-teeth f v, rest) and the classes to the mouth shapes of the face; the table `graphemes` below is that rule, shaped like a k.motion fact;
//   - the motion rules themselves: events (typing, thinking, reply, idle) -> which variants of eyes, eyebrows and mouth, how long, and how they ease back;
//   - blink statistics (interval and closed time) for the character.
//
// What this does: the avatar's face changes over time from rules, not from code in the tab. The host emits events (`reply` with its text and outcome, `thinking`, `typing`, `speaking`,
// `idle` is the scheduler's own); `frame(t)` answers which variants of eyes, eyebrows and mouth to show over the face now (`over`, the shape `renderFace` takes). Deterministic:
// the only randomness is the blink interval, drawn from a seeded generator, and time is passed in, so a test replays an exact sequence. Pure and browser-safe: no `node:*`, no DOM.
//
//   const m = createMotion({ seed: 7, has: (slot, name) => bool });   m.emit('reply', { text, outcome: 'done' }, t);   m.frame(t) -> { over, talking }   m.nextChange(t) -> ms (or Infinity)

/** The outcome of a reply, for the face (also read by the conversation summary): done, already, refused, not-understood, answer, question-back. */
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

export const OUTCOME_NAMES = ['done', 'already', 'refused', 'not-understood', 'answer', 'question-back'];

export const MOTION_RULES_TEMPORARY = {
  thinkingAfterMs: 300,          // a turn that takes longer than this shows the thinking face
  idleAfterMs: 20000,            // nothing happened for this long: a sleepy moment
  talkMaxMs: 7000,               // the mouth stops after this even for a long reply (the text is read, not spoken, unless the voice speaks: then it goes on)
  blink: { minMs: 2400, maxMs: 6500, closedMs: 130, doubleChance: 0.15, doubleGapMs: 170 },
  // viseme class -> the variants of the mouth that can show it (the first one the face has); `rest` is the face's own mouth
  viseme: { open: ['open', 'talking'], wide: ['wide', 'big smile'], round: ['small'], closed: ['neutral', 'smile'], fv: ['smirk', 'smile'], rest: null },
  // text -> mouth class: letters of each class (the one general rule; asked of k.motion)
  graphemes: { open: 'aăâáàä', wide: 'eiyéèêîíï', round: 'ouwóôöúüù', closed: 'mbp', fv: 'fv' },
  visemeMs: { open: 110, wide: 100, round: 105, closed: 80, fv: 80, rest: 50, pause: 150 },
  // levels: shown while a condition holds
  levels: {
    thinking: { eyes: ['looking up'], eyebrows: ['raised'] },
    typing: { eyes: ['downcast'] },
    idle: { ms: 2600, over: { eyes: ['sleepy'] } },
  },
  // after a reply: steps, each held for `ms`, the last one the easing back to the base face (a smaller version of the expression), then nothing
  outcomes: {
    done: [{ ms: 1400, over: { mouth: ['big smile'], eyebrows: ['arched'] } }, { ms: 500, over: { mouth: ['smile'] } }],
    already: [{ ms: 900, over: { mouth: ['smirk', 'smile'] } }, { ms: 400, over: { mouth: ['smile'] } }],
    refused: [{ ms: 1500, over: { mouth: ['sad', 'frown'], eyebrows: ['sad'] } }, { ms: 500, over: { mouth: ['neutral'] } }],
    'not-understood': [{ ms: 1700, over: { eyebrows: ['raised'], mouth: ['small'], eyes: ['looking up'] } }, { ms: 500, over: { eyebrows: ['raised'] } }],
    answer: [],
    'question-back': [{ ms: 3500, over: { eyebrows: ['raised'], eyes: ['looking up'] } }, { ms: 600, over: { eyebrows: ['raised'] } }],
  },
  moods: { surprised: [{ ms: 1500, over: { mouth: ['open'], eyebrows: ['raised'], eyes: ['surprised'] } }, { ms: 500, over: { eyebrows: ['raised'] } }] },
};

/** The variants (by slot) this motion may ask the face for: the fallback face keeps their drawings (scripts/build-default-face.mjs). */
export function motionNeeds(rules = MOTION_RULES_TEMPORARY) {
  const out = {}, add = (slot, names) => { for (const n of names ?? []) (out[slot] ??= new Set()).add(n); };
  for (const names of Object.values(rules.viseme)) add('mouth', names);
  const over = (o) => { for (const [slot, names] of Object.entries(o ?? {})) add(slot, names); };
  for (const l of Object.values(rules.levels)) over(l.over ?? l);
  for (const steps of [...Object.values(rules.outcomes), ...Object.values(rules.moods)]) for (const s of steps) over(s.over);
  add('eyes', ['closed']);   // the blink
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

// ---- visemes of a text ------------------------------------------------------------------------------------------------------------------------------------------
// The letters of a class come from the rules (`graphemes`: k.motion's rule); any other character is a rest.
const classTable = (rules) => { const t = {}; for (const [cls, letters] of Object.entries(rules.graphemes)) for (const ch of letters) t[ch] = cls; return t; };
const PAUSE = /[.,;:!?\n…]/;

/** The viseme classes of a text, timed: [{ cls, ms }]. Runs of the same class merge; consonants that show no lip shape are one short rest; punctuation is a pause. */
export function visemesOf(text, rules = MOTION_RULES_TEMPORARY) {
  const out = [], ms = rules.visemeMs, CLASS_OF = classTable(rules);
  const push = (cls, d) => { const last = out.at(-1); if (last && last.cls === cls && cls !== 'open' && cls !== 'round' && cls !== 'wide') { last.ms = Math.max(last.ms, d); return; } out.push({ cls, ms: d }); };
  for (const ch of String(text ?? '').toLowerCase()) {
    if (PAUSE.test(ch)) push('rest', ms.pause);
    else if (CLASS_OF[ch]) push(CLASS_OF[ch], ms[CLASS_OF[ch]]);
    else if (/[a-zăâîșț]/.test(ch)) push('rest', ms.rest);
    else if (/\s/.test(ch)) { if (out.at(-1)?.cls !== 'rest') push('rest', ms.rest); }
  }
  return out;
}

/** The seeded generator of the blink interval (mulberry32): the same seed gives the same blinks. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The scheduler. `has(slot, name)` says whether the face has a variant (a rule lists alternatives; the first one the face has is used, none: the slot keeps the face's own).
 * `reduced`: honour prefers-reduced-motion: no blink, no mouth movement, no easing steps; an expression is shown still for its first step and goes.
 */
export function createMotion({ rules = MOTION_RULES_TEMPORARY, seed = 1, has = () => true, reduced = false, t0 = 0 } = {}) {
  const rand = rng(seed);
  const between = (a, b) => a + rand() * (b - a);
  let lastEvent = t0, typingUntil = -1, thinkingFrom = null, talk = null, speaking = false, pulse = null, pending = null, idleShown = null;
  let blinkAt = t0 + between(rules.blink.minMs, rules.blink.maxMs), blinkSegs = [];   // blinkSegs: [from, to) windows of closed eyes already drawn from the generator
  const pick = (slot, names) => (names ?? []).find((n) => has(slot, n)) ?? null;
  const resolve = (over) => { const o = {}; for (const [slot, names] of Object.entries(over ?? {})) { const n = pick(slot, names); if (n) o[slot] = n; } return o; };

  /** Draws the blinks up to time t (every call draws the same ones for the same seed, in the same order). */
  function advanceBlink(t) {
    while (blinkAt <= t) {
      budget.tick('motion.blink');
      const b = rules.blink, from = blinkAt;
      blinkSegs.push([from, from + b.closedMs]);
      if (rand() < b.doubleChance) { blinkSegs.push([from + b.closedMs + b.doubleGapMs, from + 2 * b.closedMs + b.doubleGapMs]); blinkAt = from + 2 * b.closedMs + b.doubleGapMs + between(b.minMs, b.maxMs); }
      else blinkAt = from + b.closedMs + between(b.minMs, b.maxMs);
    }
    if (blinkSegs.length > 8) blinkSegs = blinkSegs.slice(-4);
  }
  const talkEnd = () => (talk ? talk.from + talk.total : -1);
  function settle(t) {   // a pending outcome starts when the talking has ended
    if (pending && !(talk && (t < talkEnd() || speaking))) { pulse = { from: Math.max(pending.at, talk ? Math.min(t, talkEnd()) : pending.at), steps: pending.steps }; pending = null; }
    if (pulse && t >= pulse.from + pulse.steps.reduce((s, x) => s + x.ms, 0)) pulse = null;
    if (talk && !speaking && t >= talkEnd()) talk = null;
  }
  const stepsOf = (steps) => (reduced ? steps.slice(0, 1) : steps);

  /** A reply starts at t: its mouth timeline from the text, and the outcome's steps queued for when the talking ends. */
  function startReply(p, t) {
    thinkingFrom = null; typingUntil = -1; pulse = null;
    const segs = reduced ? [] : visemesOf(p.text, rules);
    let total = 0; const cut = [];
    for (const s of segs) { if (total >= rules.talkMaxMs) break; cut.push({ at: total, ms: s.ms, cls: s.cls }); total += s.ms; }
    talk = cut.length ? { from: t, segs: cut, total } : null;
    const steps = (p.mood && rules.moods[p.mood]) || rules.outcomes[p.outcome] || [];
    pending = steps.length ? { at: t + total, steps: stepsOf(steps) } : null;
  }

  return {
    /** Events: 'typing' (the person types), 'thinking' ({ on }), 'speaking' ({ on }: the voice), 'reply' ({ text, outcome, mood }), 'reset'. */
    emit(type, p = {}, t = 0) {
      if (type !== 'idle') { lastEvent = t; idleShown = null; }
      if (type === 'typing') typingUntil = t + 1500;
      else if (type === 'thinking') thinkingFrom = p.on === false ? null : t;
      else if (type === 'speaking') { speaking = !!p.on; if (speaking && !talk && p.text) startReply({ text: p.text }, t); }
      else if (type === 'reply') startReply(p, t);
      else if (type === 'reset') { talk = null; pulse = null; pending = null; thinkingFrom = null; typingUntil = -1; speaking = false; }
    },
    /** The variants over the face at time t: { over: { eyes?, eyebrows?, mouth? } | null, talking }. Calls must not go back in time. */
    frame(t) {
      advanceBlink(t); settle(t);
      const over = {};
      const lay = (o) => { for (const [k, v] of Object.entries(resolve(o))) over[k] = v; };
      if (!idleShown && t - lastEvent >= rules.idleAfterMs) idleShown = { from: t };
      if (idleShown && t - idleShown.from < rules.levels.idle.ms) lay(rules.levels.idle.over);   // shown once, until the next event
      if (t < typingUntil) lay(rules.levels.typing);
      if (thinkingFrom != null && t - thinkingFrom >= rules.thinkingAfterMs) lay(rules.levels.thinking);
      if (pulse) { let at = pulse.from; for (const s of pulse.steps) { if (t < at + s.ms) { lay(s.over); break; } at += s.ms; } }
      let talking = false;
      if (talk && !reduced) {
        let dt = t - talk.from;
        if (speaking && dt >= talk.total) dt %= talk.total;
        const seg = dt >= 0 && dt < talk.total ? talk.segs.findLast((s) => s.at <= dt) : null;
        if (seg) { talking = true; const n = pick('mouth', rules.viseme[seg.cls]); if (n) over.mouth = n; else delete over.mouth; }
      }
      if (!reduced && blinkSegs.some(([a, b]) => t >= a && t < b)) { const n = pick('eyes', ['closed']); if (n) over.eyes = n; }
      return { over: Object.keys(over).length ? over : null, talking };
    },
    /** Milliseconds until the frame can change (Infinity: only an event will change it); the host sets one timer. */
    nextChange(t) {
      advanceBlink(t); settle(t);
      const c = [];
      if (!reduced) { for (const [a, b] of blinkSegs) { if (a > t) c.push(a - t); else if (b > t) c.push(b - t); } c.push(blinkAt - t); }
      if (talk && !reduced) { const dt = t - talk.from, d = speaking && dt >= talk.total ? dt % talk.total : dt; const nx = talk.segs.find((s) => s.at > d); c.push(nx ? nx.at - d : Math.max(1, talk.total - d)); }
      if (pending) c.push(Math.max(1, pending.at - t));
      if (pulse) { let at = pulse.from; for (const s of pulse.steps) { at += s.ms; if (at > t) { c.push(at - t); break; } } }
      if (t < typingUntil) c.push(typingUntil - t);
      if (thinkingFrom != null && t - thinkingFrom < rules.thinkingAfterMs) c.push(rules.thinkingAfterMs - (t - thinkingFrom));
      if (!idleShown) c.push(Math.max(1, rules.idleAfterMs - (t - lastEvent))); else if (t - idleShown.from < rules.levels.idle.ms) c.push(rules.levels.idle.ms - (t - idleShown.from));
      const m = Math.min(...c.filter((x) => x > 0));
      return Number.isFinite(m) ? Math.max(16, Math.ceil(m)) : Infinity;
    },
  };
}
