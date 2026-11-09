// SPDX-License-Identifier: AGPL-3.0-only
// SURPRISE: the "try something" button. A pool of canonical examples (RD6) from every world except the games, validated in a fresh
// session (an example that is not answered with a supported status is dropped), and a picker with no immediate repeats that rotates
// across worlds. Browser-safe: no `node:*` imports; the engine is passed in.

/** Worlds whose examples depend on game state, and the shell world whose examples change host settings (language, microphone, settings, phrase log). */
export const SURPRISE_EXCLUDED_WORLDS = Object.freeze(['games.chess', 'games.tictactoe', 'games.hangman', 'games.guess', 'ui.shell']);
/** Examples that start a modal flow (the profile interview captures the next messages), switch the microphone, or destroy the person's data. */
const SKIPPED_TEXT = /dictat|interview|get to know|ask me about|stop the game|how far are we|for good|forget everything|delete my profile|export my profile/i;
/** Personal statements about the user (profile facts), feedback phrases, and meta commands that do nothing on a fresh state. */
const PERSONAL_OR_FEEDBACK = /\b(democrat|republican|religio|christian|muslim|jewish|atheist|politic|sick|ill\b|diagnos|married|my (mom|mother|dad|father|brother|sister|family))|^(thank|thanks|good job|well done|great|nice|that was|you are|you're)\b/i;
const NOOP_ON_FRESH = /^(zoom (all the way )?out|zoom out to see everything|wipe everything|clear the document|turn off the (loop|sound)|keep repeating)/i;
const QUESTION = /\?\s*$|^(what|which|who|whom|whose|where|when|why|how|does|do|did|is|are|am|can|could|will|would|should)\b/i;
const REQUEST = /^(please\b|draw|sketch|add|start|make|give|show|play|zoom|go|mark|pin|use|wipe|enlarge|clear|call|create|read|insert|open|load|search|turn|keep|compose|pick|look|help|surprise|explain|compare|count|teach|tell|set|change|continue|i want|i need|let's|can you|could you)\b/i;
/** True for a request or a question (not a statement, a greeting or feedback). */
export function isRequestOrQuestion(text) { return QUESTION.test(text) || REQUEST.test(text); }
const isQuestion = (text) => QUESTION.test(text);
/** Dropped after the reviewer's browser runs: "How many days has April?" answered "missing" once in a while in the 50-click test under load (never in node, in no
 * order of examples; the sentence is read by the loose "has" pattern, which a time-limited reading in a loaded browser can miss). Its siblings stay in the pool. */
const FLAKY_UNDER_LOAD = /^how many days has april\?$/i;
const ROMANIAN = /[ăâîșțşţ]/i;

/** The canonical examples of the loaded worlds, minus the excluded worlds: [{ text, world }], without duplicates. */
export function candidateExamples(engine, excluded = SURPRISE_EXCLUDED_WORLDS) {
  const seen = new Set(), out = [];
  for (const w of engine.set.list()) {
    if (excluded.includes(w.id)) continue;
    for (const p of w.patterns ?? []) for (const text of p.canonical ?? []) {
      const key = text.toLowerCase();
      if (seen.has(key) || ROMANIAN.test(text) || SKIPPED_TEXT.test(text)) continue;
      if (!isRequestOrQuestion(text) || PERSONAL_OR_FEEDBACK.test(text) || NOOP_ON_FRESH.test(text) || FLAKY_UNDER_LOAD.test(text)) continue;
      seen.add(key); out.push({ text, world: w.id });
    }
  }
  return out;
}

/** True when every segment of the reply was understood and answered with a supported status (the reading the phrase log makes of a reply). */
export function replySupported(reply) {
  const segments = reply?.segments ?? [], answers = reply?.answers ?? [];
  if (!segments.length || !reply.text) return false;
  return segments.every((s) => {
    if (s.unparsed) return false;
    const wires = new Set((s.wires ?? []).map((w) => w.id));
    const mine = answers.filter((a) => wires.has(a.to));
    const status = mine.find((a) => a.status && a.status !== 'supported')?.status ?? mine[0]?.status ?? (s.match ? 'supported' : 'unparsed');
    return status === 'supported';
  });
}

const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * Builds the pool in two phases. 1) Every candidate is sent in its own fresh session; unsupported ones are dropped and the tab the answer
 * opens is recorded. 2) Walks: sessions that follow the picker for `steps` clicks, as a person pressing the die would; an example that is
 * not supported there, or opens another tab than recorded, is dropped (examples that only work from a fresh state), until a round is clean.
 */
export async function buildSurprisePool(engine, { options = { language: 'en', formalizer: 'rules' }, excluded, walks = 40, steps = 60, maxRounds = 12 } = {}) {
  let pool = [];
  const dropped = [];
  for (const c of candidateExamples(engine, excluded)) {
    try {
      const session = engine.createSession({ language: 'en' });
      const before = JSON.stringify(session.state?.() ?? null);
      const reply = await session.send(c.text, options);
      if (!replySupported(reply)) { dropped.push(c); continue; }
      // a request must have a visible effect (the state changes) or be a request for information; a question is answered (reply text)
      if (!isQuestion(c.text) && JSON.stringify(session.state?.() ?? null) === before && !/^(show|tell|read|explain|teach|help|surprise|give me an? (example|command))/i.test(c.text)) { dropped.push(c); continue; }
      pool.push({ text: c.text, world: c.world, tab: session.state?.()['ui.shell']?.activeTab ?? null });
    } catch { dropped.push(c); }
  }
  for (let round = 0; round < maxRounds; round++) {
    const bad = new Set();
    for (let w = 0; w < walks; w++) {
      const picker = createSurprisePicker(pool, rng(1000 * round + w + 1));
      const session = engine.createSession({ language: 'en' });
      for (let i = 0; i < steps; i++) {
        const ex = picker.next();
        try {
          const reply = await session.send(ex.text, options);
          const tab = session.state?.()['ui.shell']?.activeTab ?? null;
          if (!replySupported(reply) || (ex.tab && ex.tab !== 'robot' && tab !== ex.tab)) bad.add(ex.text);
        } catch { bad.add(ex.text); }
      }
    }
    if (!bad.size) break;
    for (const p of pool) if (bad.has(p.text)) dropped.push(p);
    pool = pool.filter((p) => !bad.has(p.text));
  }
  return { pool, dropped };
}

/** Picks the next example: never the previous one, and a world other than the last two when the pool has more than two worlds. */
export function createSurprisePicker(pool, rand = Math.random) {
  const recent = [];   // worlds of the last picks
  let last = null;
  const worlds = new Set(pool.map((p) => p.world));
  return {
    size: pool.length,
    next() {
      if (!pool.length) return null;
      const avoid = worlds.size > 2 ? recent.slice(-2) : worlds.size > 1 ? recent.slice(-1) : [];
      let cands = pool.filter((p) => p.text !== last && !avoid.includes(p.world));
      if (!cands.length) cands = pool.filter((p) => p.text !== last);
      if (!cands.length) cands = pool;
      // uniform over worlds first, then over the examples of that world, so a big world does not dominate
      const ws = [...new Set(cands.map((p) => p.world))];
      const w = ws[Math.floor(rand() * ws.length) % ws.length];
      const mine = cands.filter((p) => p.world === w);
      const pick = mine[Math.floor(rand() * mine.length) % mine.length];
      last = pick.text; recent.push(pick.world);
      return pick;
    },
  };
}
