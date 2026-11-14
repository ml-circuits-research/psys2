// SPDX-License-Identifier: AGPL-3.0-only
// What the conversation is about, from the turns that happened (no language model, no guessing): a record of each turn from the engine's reply (`turnRecord`), the outcome of a
// reply for the avatar's face and the summary (`outcomeOf`), and the live summary of the Talk tab (`summarize`): topics, worlds used and for what, what was taught, what failed or
// was asked back, open threads; one line per item, newest first. Pure and browser-safe: no `node:*`, no DOM.
// TEMPORARY: the turn kinds and the focus log come from the replies and the session things until sopworld's `std.dialogue` (0.47) exists; then `turnRecord` reads them from there.

/** done, already, refused, not-understood, answer, question-back: how a reply went (the avatar's face and the summary both read this). */
export function outcomeOf(reply) {
  const answers = reply?.answers ?? [], segs = reply?.segments ?? [];
  const text = String(reply?.text ?? '');
  const handled = segs.filter((s) => !s.unparsed);
  const supported = answers.filter((a) => a.status === 'supported');
  if (answers.some((a) => a.status === 'missing' && /\?\s*$/.test(String(a.text ?? '').trim()))) return 'question-back';
  if (!handled.length && !supported.length) return 'not-understood';
  if (!supported.length) return /\?\s*$/.test(text.trim()) ? 'question-back' : 'refused';
  if (supported.every((a) => /\balready\b/i.test(String(a.text ?? '')))) return 'already';
  const changed = Object.keys(reply?.state ?? {}).some((k) => k !== 'session.things' && k !== 'ui.help') || (reply?.effects ?? []).length > 0;
  if (!changed && segs.some((s) => s.isQuestion)) return 'answer';
  return 'done';
}

/** The compact record of one turn (what the summary needs, nothing more). */
export function turnRecord(n, text, reply, { tab = null } = {}) {
  const segs = reply?.segments ?? [];
  const worlds = [...new Set(segs.filter((s) => !s.unparsed).map((s) => s.routing?.winner?.worldId).filter(Boolean))];
  const answers = reply?.answers ?? [];
  const pending = reply?.trace?.discourse?.pending ?? null;
  return {
    n, text: String(text ?? '').slice(0, 200), tab, outcome: outcomeOf(reply), worlds,
    answer: String(reply?.text ?? '').replace(/\s+/g, ' ').slice(0, 200),
    asked: answers.filter((a) => a.status === 'missing' && /\?\s*$/.test(String(a.text ?? '').trim())).map((a) => String(a.text).trim().slice(0, 160)),
    pending: (pending?.type === 'fill' || pending?.type === 'confirm') && String(pending.text ?? '').trim() ? `${pending.type === 'confirm' ? 'waiting for a yes or no' : 'waiting for the missing part'} of "${String(pending.text ?? '').slice(0, 100)}"` : null,
  };
}

/** A wire of what the user taught (`@learned.1 k.words.sense word="villa" is_a="house" ...`) as a short sentence. */
export function taughtText(wire) {
  const m = /^@\S+\s+(\S+)\s*(.*)$/.exec(String(wire).trim());
  if (!m) return String(wire);
  const a = Object.fromEntries([...m[2].matchAll(/(\w[\w.]*)=(?:"([^"]*)"|(\S+))/g)].map((x) => [x[1], x[2] ?? x[3]]));
  if (m[1] === 'k.words.sense' && a.word && a.is_a) return `${a.word} is a kind of ${a.is_a}`;
  if (m[1] === 'session.learned.own' && a.kind && a.name) return `your ${a.kind} is called ${a.name}`;
  const skip = new Set(['pos', 'n', 'id', 'gloss']), name = a.name ?? a.word;
  const rest = Object.entries(a).filter(([k]) => !/^core\./.test(k) && k !== 'name' && k !== 'word' && !skip.has(k)).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`);
  return [name, ...rest].filter(Boolean).join(': ') || m[1];
}

const SHARED = { 'session.things': 'things of the session', 'ui.shell': 'the app (tabs, voice)', 'ui.help': 'help', 'kids.common': 'small talk' };
const LAST = (a, k = 6) => a.slice(-k).reverse();

/**
 * The summary. `turns`: turn records, oldest first; `states`: the world states (talk topics, session.things learned); `labelOf(id)`: a readable name of a world (optional).
 * Returns { sections: [{ id, title, lines: [{ text, n?, world? }] }], worlds: [ids], taught: [texts] }; every section's lines are newest first.
 */
export function summarize({ turns = [], states = {}, labelOf = (id) => SHARED[id] ?? id } = {}) {
  const label = (id) => { const l = labelOf(id) || SHARED[id]; return l && l !== id ? `${l} (${id})` : id; };
  // worlds used: one line each, the one used last first; what it was used for = the user's last words to it
  const byWorld = new Map();
  for (const t of turns) for (const w of t.worlds) { const e = byWorld.get(w) ?? { count: 0, last: null }; e.count++; e.last = t; byWorld.set(w, e); }
  const worldLines = [...byWorld].sort((a, b) => b[1].last.n - a[1].last.n).map(([w, e]) => ({ world: w, n: e.last.n, text: `${label(w)}: ${e.count} ${e.count === 1 ? 'turn' : 'turns'}, last "${e.last.text}"` }));
  const taught = (states['session.things']?.learned ?? []).map(taughtText);
  const taughtLines = taught.map((x, i) => ({ text: x, n: i })).reverse();
  // trouble: what could not be done, was not understood, or was asked back; the same words twice in a row count once
  const bad = turns.filter((t) => ['refused', 'not-understood', 'question-back'].includes(t.outcome));
  const troubleLines = []; let prev = '';
  for (const t of [...bad].reverse()) {
    const kind = { refused: 'could not', 'not-understood': 'not understood', 'question-back': 'asked back' }[t.outcome];
    const key = `${t.outcome}|${t.text}`;
    if (key === prev) continue; prev = key;
    troubleLines.push({ n: t.n, text: `${kind}: "${t.text}"${t.outcome === 'question-back' && t.asked[0] ? ` - ${t.asked[0]}` : ''}` });
  }
  const shownTrouble = troubleLines.slice(0, 8);
  if (troubleLines.length > 8) shownTrouble.push({ text: `and ${troubleLines.length - 8} earlier` });
  // open threads: the last turn is a question back, or the dialogue holds something pending
  const last = turns.at(-1), open = [];
  if (last?.outcome === 'question-back') open.push({ n: last.n, text: `waiting for your answer: ${last.asked[0] ?? last.answer}` });
  if (last?.pending) open.push({ n: last.n, text: last.pending });
  // topics: one node per thing, parent = where the user came from (world talk)
  const topics = states.talk?.topics ?? [];
  const nameOf = new Map(topics.map((t) => [t.id, t.name]));
  const topicLines = [...topics].reverse().map((t) => ({ text: t.parent && t.parent !== 'root' && nameOf.get(t.parent) ? `${t.name} (from ${nameOf.get(t.parent)})` : t.name }));
  const sections = [
    { id: 'topics', title: 'Topics', lines: topicLines },
    { id: 'worlds', title: 'Worlds used', lines: worldLines },
    { id: 'taught', title: 'What you taught me', lines: taughtLines },
    { id: 'trouble', title: 'Could not do or asked back', lines: shownTrouble },
    { id: 'open', title: 'Open', lines: open },
  ].filter((s) => s.lines.length);
  return { sections, worlds: [...byWorld.keys()], taught, turns: turns.length, last: LAST(turns, 1)[0]?.n ?? 0 };
}
