/**
 * Authoring helpers of the operational set (scripts/build-operational.mjs writes training/eval/operational.jsonl from training/eval/cases/*.mjs).
 * Every expectation is written by judgment of the correct outcome for the message in that world; nothing is recorded from system output.
 *
 *   add(world, message, expect, opts)
 *     expect  { state: ["[world:]path=value", ...], answer: ["substring", ...], answer_any: ["a","b"], effects: ["name"], status: "supported",
 *               forbid_state: [...], none: true }   (vocabulary: scripts/lib/operational-check.mjs)
 *     opts    { tab, setup: ["earlier message", ...], init: {world: statePatch}, fam: ["family", ...], gap: true, note }
 *   `world` is the world that owns the correct outcome (the group of the headline).
 */
export function makeBuilder() {
  const cases = [];
  const counters = {};
  const seen = new Set();
  const add = (world, message, expect, o = {}) => {
    const key = JSON.stringify([world, o.tab ?? null, o.setup ?? [], message]);
    if (seen.has(key)) return;   // generators may draw the same sentence twice
    seen.add(key);
    const n = (counters[world] = (counters[world] ?? 0) + 1);
    cases.push({
      id: `${world}#${String(n).padStart(3, '0')}`,
      world,
      tab: o.tab ?? null,
      setup: o.setup ?? [],
      ...(o.init ? { init: o.init } : {}),
      message,
      expect,
      families: o.fam ?? [],
      ...(o.gap ? { known_gap: true } : {}),
      ...(o.note ? { note: o.note } : {}),
    });
  };
  return { cases, add };
}

/** Deterministic PRNG (mulberry32) for the few generated families. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chat wrappers that keep every value of the message: politeness, fillers, casing, trailing "pls". `r` is a PRNG. */
export function chatty(msg, r, { question = false } = {}) {
  const pre = ['hey ', 'um ', 'ok ', 'so ', 'hi, ', 'hey could u tell me ', 'can you ', 'i want to know ', 'quick one: ', 'please '];
  const post = [' pls', ' please', ' thanks', ' for me', '?', ''];
  let m = msg;
  const k = r();
  if (k < 0.3) m = m.toLowerCase().replace(/[.?!]+$/, '');
  else if (k < 0.55) m = pre[Math.floor(r() * pre.length)] + m[0].toLowerCase() + m.slice(1).replace(/[.?!]+$/, '');
  else if (k < 0.75) m = m.replace(/[.?!]+$/, '') + post[Math.floor(r() * post.length)];
  return m;
}

export const pick = (r, a) => a[Math.floor(r() * a.length)];
export const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
