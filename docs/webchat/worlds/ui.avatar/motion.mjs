// SPDX-License-Identifier: AGPL-3.0-only
// The avatar's motion: a thin call of the library's `std.motion` (sopworld 0.54: `motionPlan`, pure and seeded, with priorities, cancel of the rest of an earlier event of the same rule
// and per-unit streams). What is still TEMPORARY is the rules: `MOTION_RULES_TEMPORARY` stands in for the animation world of the knowledge repository (`k.motion`, not published yet). When it
// is, the rules are read from `k.motion` (the facts below are what `rulesToFacts` writes from them) and `MOTION_RULES_TEMPORARY` is deleted. Asks to the knowledge repository (also in questions.md):
//   - the text -> mouth rule, in `k.motion` ONLY (owner, 2026-11-14: not in a language world, not in src/lang): one general rule that maps the letters of a text to the mouth classes
//     (open, wide, round, closed lips m b p, lip-teeth f v, rest) and the classes to the mouth shapes of the face; the table `graphemes` below is that rule, shaped like a k.motion fact;
//   - the motion rules themselves: events (typing, thinking, reply, idle) -> which variants of eyes, eyebrows and mouth, how long, and how they ease back;
//   - blink statistics (interval and closed time) for the character.
//
// What this does: the avatar's face changes over time from rules, not from code in the tab. The host emits events (`reply` with its text and outcome, `thinking`, `typing`, `speaking`;
// `idle` is the rules' own); `frame(t)` answers which variants of eyes, eyebrows and mouth to show over the face now (`over`, the shape `renderFace` takes). This file only keeps the log
// of the live events, turns the rules into `mo.*` facts, calls `motionPlan` (the library schedules) and reads the plan at the host's clock. Deterministic: the only randomness is the blink
// interval, drawn from the plan's seeded generator, and time is passed in, so a test replays an exact sequence. Pure and browser-safe: no `node:*`, no DOM; the library is passed in (`lib`:
// `{ World, motionPlan }`), because a world's file does not know where the page keeps it.
//
//   const m = createMotion({ lib, seed: 7, has: (slot, name) => bool });   m.emit('reply', { text, outcome: 'done' }, t);   m.frame(t) -> { over, talking }   m.nextChange(t) -> ms (or Infinity)

/** The outcome of a reply, for the face (also read by the conversation summary): done, already, refused, not-understood, answer, question-back. */
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

export const OUTCOME_NAMES = ['done', 'already', 'refused', 'not-understood', 'answer', 'question-back'];

export const MOTION_RULES_TEMPORARY = {
  thinkingAfterMs: 300,          // a turn that takes longer than this shows the thinking face
  idleAfterMs: 20000,            // nothing happened for this long: a sleepy moment
  talkMaxMs: 7000,               // the mouth stops after this even for a long reply (the text is read, not spoken, unless the voice speaks: then it goes on)
  talkUnitMs: 100,               // one mouth class (the plan's per-unit step has one duration)
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

// ---- the rules as std.motion facts -------------------------------------------------------------------------------------------------------------------------------
// A value is a state name; alternatives are written `a|b` (the first one the face has is shown), `none` is the face's own variant, `viseme:<class>` is a mouth class of the talking.
const NONE = 'none', VISEME = 'viseme:';
const q = (v) => `"${v}"`;
const alts = (names) => (names ?? []).join('|');
const SLOTS = ['eyes', 'eyebrows', 'mouth'];

/** The `mo.*` facts of the rules (the form `k.motion` will publish). `reduced`: no blink, no talking mouth, an expression only for its first step. */
export function rulesToFacts(rules = MOTION_RULES_TEMPORARY, { reduced = false } = {}) {
  const L = []; let n = 0;
  const id = () => `@m${++n}`;
  const rule = (name, attrs) => L.push(`${id()} mo.rule name=${q(name)} ${attrs}`);
  const step = (name, i, key, value, dur, extra = '') => L.push(`${id()} mo.step rule=${q(name)} n=${i} key=${key}${value ? ` value=${q(value)}` : ''} dur=${dur}${extra}`);
  for (const k of SLOTS) L.push(`${id()} mo.base key=${k} value=${NONE}`);
  if (!reduced) {
    const b = rules.blink;
    rule('blink', `repeat=${b.minMs}-${b.maxMs} priority=9`); step('blink', 1, 'eyes', 'closed', b.closedMs);
    // a double blink now and then (the chance of the old scheduler, as a second, rarer rule)
    rule('blink.double', `repeat=${Math.round(b.minMs / b.doubleChance / 2)}-${Math.round(b.maxMs / b.doubleChance / 2)} priority=9`);
    step('blink.double', 1, 'eyes', 'closed', b.closedMs); step('blink.double', 2, 'eyes', null, b.doubleGapMs); step('blink.double', 3, 'eyes', 'closed', b.closedMs);
    rule('talk', `on=talk priority=8 split=visemes else=${q(VISEME + 'rest')}`); step('talk', 1, 'mouth', null, rules.talkUnitMs, ' per=unit');
    for (const cls of Object.keys(rules.viseme)) L.push(`${id()} mo.class rule="talk" unit=${q(cls)} value=${q(VISEME + cls)}`);
  }
  // levels: while a condition holds. thinking/typing: a delay, then the variants for a long time (the host ends it by removing the event); idle: a quiet, then the sleepy moment once
  const level = (name, on, delay, ms, over, priority) => {
    for (const [slot, names] of Object.entries(over)) {
      const r = `${name}.${slot}`; rule(r, `on=${on} priority=${priority}`);
      let i = 0; if (delay) step(r, ++i, slot, null, delay);
      step(r, ++i, slot, alts(names), ms);
    }
  };
  level('idle', 'activity', rules.idleAfterMs, rules.levels.idle.ms, rules.levels.idle.over, 1);
  level('typing', 'typing', 0, 1500, rules.levels.typing, 2);
  level('thinking', 'thinking', rules.thinkingAfterMs, 3600000, rules.levels.thinking, 3);
  // outcomes and moods: steps, the last one the easing back to the base face; one rule per slot, the same steps
  for (const [name, all] of [...Object.entries(rules.outcomes), ...Object.entries(rules.moods)]) {
    const steps = reduced ? all.slice(0, 1) : all;
    for (const slot of SLOTS) {
      if (!steps.some((s) => s.over?.[slot])) continue;
      const r = `outcome.${name}.${slot}`; rule(r, `on=outcome when.outcome=${q(name)} priority=4`);
      steps.forEach((s, i) => step(r, i + 1, slot, s.over?.[slot] ? alts(s.over[slot]) : null, s.ms));
    }
  }
  return L.join('\n');
}

/** The mouth classes of a text, as the unit stream of the talk rule, cut to `talkMaxMs`. */
export const mouthUnits = (text, rules = MOTION_RULES_TEMPORARY) => visemesOf(text, rules).map((v) => v.cls).slice(0, Math.floor(rules.talkMaxMs / rules.talkUnitMs));

// ---- the scheduler: a log of live events, the library's plan, the plan read at the host's clock -----------------------------------------------------------------------
const HORIZON = 30000, REBASE = 120000, LOOP = 60000;

/**
 * `lib`: `{ World, motionPlan }` of sopworld (>= 0.54). `has(slot, name)`: whether the face has a variant (a rule lists alternatives; the first one the face has is used, none: the slot
 * keeps the face's own). `reduced`: honour prefers-reduced-motion. `seed`: the blink generator. Events: 'typing', 'thinking' ({ on }), 'speaking' ({ on, text }: the voice), 'reply'
 * ({ text, outcome, mood }), 'reset'. Calls to `frame` and `nextChange` must not go back in time.
 */
export function createMotion({ lib, rules = MOTION_RULES_TEMPORARY, seed = 1, has = () => true, reduced = false, t0 = 0 } = {}) {
  if (!lib?.motionPlan || !lib?.World) throw new Error('createMotion needs the sopworld library (>= 0.54: World, motionPlan)');
  const world = new lib.World(); world.tell(rulesToFacts(rules, { reduced }));
  const splitters = { visemes: (text) => mouthUnits(text, rules) };
  let origin = t0, events = [{ t: t0, type: 'activity' }], plan = null, planUntil = 0, speaking = false, talk = null, pendingOutcome = null;
  const drop = (...types) => { events = events.filter((e) => !types.includes(e.type)); plan = null; };
  const add = (e) => { events.push(e); plan = null; };
  const replan = (rt) => {
    budget.tick('motion.plan');
    planUntil = rt + HORIZON;
    plan = lib.motionPlan(world, events.map((e) => ({ ...e, t: e.t - origin })), { seed, until: planUntil, splitters });
  };
  const ensure = (t) => {
    if (t - origin > REBASE) {   // a long session: a fresh origin keeps the plan small; the newest thinking and activity stay in force, the rest that is old goes
      const newest = (ty) => events.findLast((e) => e.type === ty);
      events = events.filter((e) => ((e.type === 'thinking' || e.type === 'activity') && e === newest(e.type)) || t - e.t < 60000); origin = t; plan = null;
    }
    if (!plan || t - origin + HORIZON / 3 > planUntil) replan(t - origin);
  };
  const units = (text) => (reduced ? [] : mouthUnits(text, rules));
  const talkFrom = (at, text) => {   // the talk rule fires at `at`
    const total = units(text).length * rules.talkUnitMs;
    talk = total ? { text, total } : null;
    if (talk) add({ t: at, type: 'talk', stream: text });
    return total;
  };
  const queueOutcome = (at, key) => { if (key && (rules.outcomes[key] || rules.moods[key])) add({ t: at, type: 'outcome', fields: { outcome: key } }); };
  const loopTalk = (t) => {   // a voice that goes on: the talk rule fires again where it ended, for a minute ahead (the voice ending cancels the rest)
    let at = events.findLast((e) => e.type === 'talk').t + talk.total;
    if (at < t) at += Math.ceil((t - at) / talk.total) * talk.total;
    for (; at < t + LOOP; at += talk.total) { budget.tick('motion.loop'); add({ t: at, type: 'talk', stream: talk.text }); }
  };

  return {
    emit(type, p = {}, t = 0) {
      if (type !== 'idle') { drop('activity'); add({ t, type: 'activity' }); }
      if (type === 'typing') { drop('typing'); add({ t, type: 'typing' }); }
      else if (type === 'thinking') { drop('thinking'); if (p.on !== false) add({ t, type: 'thinking' }); }
      else if (type === 'reply') {
        drop('typing', 'thinking', 'talk', 'outcome'); talk = null; pendingOutcome = null;
        const total = talkFrom(t, String(p.text ?? ''));
        const key = p.mood && rules.moods[p.mood] ? p.mood : p.outcome;
        if (speaking) { pendingOutcome = key; if (talk) loopTalk(t); } else queueOutcome(t + total, key);
      } else if (type === 'speaking') {
        const on = !!p.on;
        if (on && !speaking && !talk && p.text) talkFrom(t, String(p.text));
        speaking = on;
        if (on && talk) { const waiting = events.findLast((e) => e.type === 'outcome'); if (waiting) { pendingOutcome ??= waiting.fields.outcome; drop('outcome'); } loopTalk(t); }
        if (!on) {   // the voice stopped: the talking ends now (an empty stream cancels the rest of the talk) and the outcome that waited for it starts
          events = events.filter((e) => e.type !== 'talk' || e.t <= t); add({ t, type: 'talk', stream: '' }); talk = null;
          if (pendingOutcome) { queueOutcome(t, pendingOutcome); pendingOutcome = null; }
        }
      } else if (type === 'reset') { events = [{ t, type: 'activity' }]; plan = null; talk = null; pendingOutcome = null; speaking = false; }
    },
    /** The variants over the face at time t: { over: { eyes?, eyebrows?, mouth? } | null, talking }. */
    frame(t) {
      ensure(t);
      const rt = t - origin, cur = {};
      for (const pt of plan) { if (pt.t > rt) break; cur[pt.key] = pt.value; }
      const over = {}; let talking = false;
      for (const [slot, v] of Object.entries(cur)) {
        if (v === NONE) continue;
        const names = v.startsWith(VISEME) ? (talking = true, rules.viseme[v.slice(VISEME.length)]) : v.split('|');
        const n = (names ?? []).find((x) => has(slot, x));
        if (n) over[slot] = n;
      }
      return { over: Object.keys(over).length ? over : null, talking };
    },
    /** Milliseconds until the frame can change (Infinity: only an event will change it); the host sets one timer. */
    nextChange(t) {
      ensure(t);
      const rt = t - origin, next = plan.find((pt) => pt.t > rt);
      return next ? Math.max(16, Math.ceil(next.t - rt)) : (reduced ? Infinity : HORIZON / 3);
    },
  };
}
