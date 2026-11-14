// SPDX-License-Identifier: AGPL-3.0-only
// The avatar's motion: a thin call of the library's `std.motion` (sopworld 0.56: `readMotion` and `planMotionFacts`, pure and seeded) over the knowledge world `k.motion` (the rules of a face
// over time: layers with priorities, blinks and glances, the text -> mouth rule, how a reply came out and how the face eases back). The rules are DATA: nothing of them is written here, no
// scheduler and no letter table; this file keeps only what the host owns:
//   - the log of the live events (the library plans from an event log and the host's clock is "now", so the log is replanned for a horizon ahead),
//   - the host's words for the outcomes (`not-understood` is the world's "not understood", `question-back` its "question"),
//   - which of the world's values the face has (`has`), and the features of a variant (`features`: a blink does not start on eyes that are already closed),
//   - reduced motion: only the expression layer, no blinking, glancing or talking mouth.
// The facts come from the catalog (`facts.motion()` reads the shards of `k.motion`), with a bundled subset generated from the catalog for the first paint and offline
// (worlds/ui.avatar/default-motion.mjs, scripts/build-default-face.mjs). Pure and browser-safe: no `node:*`, no DOM; the library is passed in (`lib`: `{ World, readMotion, planMotionFacts }`).
//
//   const motion = parseMotion(lib, shardText);
//   const m = createMotion({ lib, motion, seed: 7, has: (slot, name) => bool, features: (slot, name) => ({ feel: ['closed'] }) });
//   m.emit('reply', { text, outcome: 'done' }, t);   m.frame(t) -> { over, talking }   m.nextChange(t) -> ms (or Infinity)

/** The host's outcome words (also read by the conversation summary) and the world's: only these two differ. */
export const OUTCOME_NAMES = ['done', 'already', 'refused', 'not-understood', 'answer', 'question-back'];
const WORLD_OUTCOME = { 'not-understood': 'not understood', 'question-back': 'question' };
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

/** The motion of the `k.motion` facts (the text of its shards), read by the library. */
export function parseMotion(lib, text) {
  if (!lib?.readMotion || !lib?.planMotionFacts || !lib?.World) throw new Error('parseMotion needs the sopworld library (>= 0.56: World, readMotion, planMotionFacts)');
  const world = new lib.World(); world.tell(String(text ?? ''));
  const motion = lib.readMotion(world);
  if (!motion.rules.length) throw new Error('no k.motion rules in the facts');
  return motion;
}

const SLOT_OF_KEY = { one_eye: 'eyes' };
const slotOf = (key) => SLOT_OF_KEY[key] ?? key;

/** The variants (by slot) a motion may ask the face for: the fallback face keeps their drawings (scripts/build-default-face.mjs). */
export function motionNeeds(motion) {
  const out = {}, add = (slot, name) => { if (name && name !== 'none') (out[slot] ??= new Set()).add(name); };
  for (const r of motion.rules) for (const s of r.steps) for (const x of s.set) { add(slotOf(x.key), x.value); add(slotOf(x.key), x.via); }
  for (const mouth of motion.visemes.values()) add('mouth', mouth);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

// ---- the scheduler: a log of live events, the library's plan, the plan read at the host's clock -----------------------------------------------------------------------
const HORIZON = 30000, REBASE = 120000;
const TEXT_MAX = 110;       // characters of a reply the mouth says (about 7 s; the text is read, not spoken, unless the voice speaks)
const VOICE_MAX = 600;      // characters of a text the voice says: the mouth goes on for its length

/**
 * `lib`: sopworld >= 0.56. `motion`: `parseMotion` of the k.motion facts. `has(slot, name)`: whether the face has a variant (a value the face lacks keeps the face's own).
 * `features(slot, name)`: the k.faces features of a variant (`{ feel: ['closed'] }`). `reduced`: honour prefers-reduced-motion. `seed`: the generator of the plan.
 * Events: 'thinking' ({ on }), 'speaking' ({ on, text }: the voice), 'reply' ({ text, outcome }), 'reset'; 'typing' and the rest have no rule in k.motion and change nothing.
 * Calls to `frame` and `nextChange` must not go back in time.
 */
export function createMotion({ lib, motion, seed = 1, has = () => true, features = () => ({}), reduced = false, t0 = 0 } = {}) {
  if (!motion) throw new Error('createMotion needs the motion read from k.motion (parseMotion)');
  const used = reduced ? { ...motion, rules: motion.rules.filter((r) => r.layer === 'expression') } : motion;   // reduced: expressions only, no blinks, glances or talking
  const layerOf = new Map(motion.rules.map((r) => [r.name, r.layer]));
  let origin = t0, events = [], plan = null, planUntil = 0, outcome = 'answer';
  const add = (e) => { events.push(e); plan = null; };
  const replan = (rt) => {
    budget.tick('motion.plan');
    planUntil = rt + HORIZON;
    plan = lib.planMotionFacts(used, { events: events.map((e) => ({ t: e.t - origin, name: e.name, fields: e.fields })), seed, end: planUntil, features });
  };
  const ensure = (t) => {
    if (t - origin > REBASE) {   // a long session: a fresh origin keeps the plan small; what is younger than a minute and a thinking that still holds stay
      const hold = events.findLast((e) => e.thinking && !events.some((x) => x.name === 'reply' && !x.thinking && x.t >= e.t));
      events = events.filter((e) => e === hold || t - e.t < 60000); origin = t; plan = null;
    }
    if (!plan || t - origin + HORIZON / 3 > planUntil) replan(t - origin);
  };
  const say = (t, text, max, thinking = false) => {
    const fields = { outcome: thinking ? 'thinking' : (WORLD_OUTCOME[outcome] ?? outcome), text: reduced ? '' : String(text ?? '').slice(0, max) };
    add({ t, name: 'reply', fields, thinking });
    if (reduced) add({ t, name: 'spoken', fields });   // nobody says the text with a still mouth: it is said at once
  };

  return {
    emit(type, p = {}, t = 0) {
      if (type === 'thinking') {
        const live = events.filter((e) => e.thinking && !events.some((x) => x.name === 'reply' && !x.thinking && x.t >= e.t));
        if (p.on === false) { if (live.length) { events = events.filter((e) => !live.includes(e)); plan = null; } }
        else { events = events.filter((e) => !live.includes(e)); say(t, '', 0, true); }
      } else if (type === 'reply') {
        outcome = OUTCOME_NAMES.includes(p.outcome) ? p.outcome : 'answer';
        say(t, p.text, TEXT_MAX);
      } else if (type === 'speaking') {
        if (p.on && p.text) say(t, p.text, VOICE_MAX);   // the voice speaks: the mouth goes on for the length of what it says
        else if (!p.on) { ensure(t); const rt = t - origin; if (plan.emitted.some((e) => e.name === 'spoken' && e.t > rt)) say(t, '', 0); }   // the voice stopped before the mouth was done: it is done now
      } else if (type === 'reset') { events = []; plan = null; outcome = 'answer'; }
    },
    /** The variants over the face at time t: { over: { eyes?, eyebrows?, mouth? } | null, talking }. */
    frame(t) {
      ensure(t);
      const rt = t - origin, cur = {};
      for (const c of plan.changes) { if (c.t > rt) break; cur[c.key] = c; }
      const over = {}; let talking = false;
      for (const [key, c] of Object.entries(cur)) {
        if (c.value == null) continue;
        if (key === 'one_eye') continue;   // a wink is the state's own (the expression), the eyes key carries the same value for the whole face
        const slot = key;
        if (!has(slot, c.value)) continue;
        over[slot] = c.value;
        if (slot === 'mouth' && layerOf.get(c.rule) === 'talk') talking = true;
      }
      return { over: Object.keys(over).length ? over : null, talking };
    },
    /** Milliseconds until the frame can change (Infinity: only an event will change it); the host sets one timer. */
    nextChange(t) {
      ensure(t);
      const rt = t - origin, next = plan.changes.find((c) => c.t > rt);
      return next ? Math.max(16, Math.ceil(next.t - rt)) : (used.rules.some((r) => r.repeat) ? HORIZON / 3 : Infinity);
    },
  };
}
