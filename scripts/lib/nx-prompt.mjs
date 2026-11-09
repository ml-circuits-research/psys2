/**
 * NX: labeler prompts. A world prompt (instructions + world description + 10 solved examples) is the cached system prompt;
 * a batch is 25 numbered sentences of one world; the output is a JSON array.
 */
import { describeWorld, formalizeIn, readSegments } from './nx-read.mjs';

export const SCHEMA = `OUTPUT: a JSON array with one object per input sentence, in order, nothing else (no prose, no markdown fence):
[{"i": <input number>, "op": "<one op id from the list, or null when no op of this world fits the sentence>",
  "slots": [{"key": "<key id from the op's key list>", "text": "<the exact words of the sentence that answer the key's question, copied verbatim, or null when the value is implied (default, constant, from context)>", "value": <canonical value>}]}]`;

export const RULES = `You label user sentences for a conversational system. Each sentence is typed or spoken by a user (it may contain typos, voice-recognition garble, a Romanian-to-English translation artifact, filler words, politeness). Decide which OPERATION of the world the sentence asks for and fill the operation's SLOTS.
- "op": exactly one id from OPERATIONS below, or null if none fits (abstain; do not guess).
- "slots": one entry for every key of the op that the sentence (or its context) determines; omit keys that are not determined. Add the op's constants (listed as "fixed") when they apply (they have text null).
- "text": a verbatim substring of the sentence (same letters, same case) that is the answer to the key's question; null if the value is implied.
- "value": canonical value. Numbers as JSON numbers (number words become digits: "three" -> 3). Words from a lexicon as the lexicon head in singular lowercase ("apples" -> "apple"). People and names lowercase without any prefix ("Tom" -> "tom"). Free text as the lowercase words. Fixed constants exactly as listed. For a question op ("?type") add a slot with key "seek" and value the thing sought (usually listed as fixed).
- A sentence marked CONTEXT lines (earlier messages of the same dialog) may only be used to resolve what the sentence leaves out; the label is for the LAST sentence only.
- Fix obvious typos in "value" but keep "text" verbatim.`;

function fmtOps(d) {
  return d.ops.map((o) => {
    const keys = o.keys.map((k) => `    - ${k.key}${k.ask ? ` : "${k.ask}"` : ''}`).join('\n');
    const fx = Object.entries(o.fixed).map(([k, v]) => `    - ${k} (fixed): ${v.join(' | ')}`).join('\n');
    return `* ${o.op}${o.doc ? ` - ${o.doc}` : ''}\n${keys}${fx ? '\n' + fx : ''}${o.examples.length ? `\n    e.g. ${o.examples.slice(0, 3).map((x) => `"${x}"`).join('; ')}` : ''}`;
  }).join('\n');
}

/** Ten solved examples: pattern examples read by the rules (one per op first), as the output the labeler must give. */
export function solvedExamples(set, worldId, d, n = 10) {
  const w = set.get(worldId);
  const tab = w.manifest?.entries?.find((e) => e.key === 'tab')?.value.v ?? worldId;
  const ctx = { activeTab: tab, tabWorld: worldId, recentWorlds: [worldId] };
  const out = []; const seenOp = new Set();
  const pats = [...w.patterns].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const pass of [0, 1]) for (const p of pats) {
    if (out.length >= n) break;
    for (const ex of (p.examples ?? []).slice(0, pass ? 3 : 1)) {
      if (out.length >= n || out.some((o) => o.text === ex)) continue;
      try {
        const segs = readSegments(set, formalizeIn(set, [ex], { tab: ctx }));
        const s = segs[0];
        if (segs.length !== 1 || s.nWires !== 1 || !s.op || s.worldId !== worldId) continue;
        if (!pass && seenOp.has(s.op)) continue;
        if (!d.ops.some((o) => o.op === s.op)) continue;
        seenOp.add(s.op);
        out.push({ text: ex, op: s.op, slots: s.slots.map((x) => ({ key: x.key, text: x.text, value: typeof x.value === 'string' ? x.value.replace(/^\$(e\.)?/, '').toLowerCase() : x.value })) });
      } catch { /* skip */ }
    }
  }
  return out.slice(0, n);
}

export function worldPrompt(set, worldId) {
  const d = describeWorld(set, worldId);
  const ex = solvedExamples(set, worldId, d);
  const lex = d.lexicons.filter((l) => l.n).map((l) => `- ${l.id} (${l.class ?? 'words'}, ${l.n}): ${l.words.join(', ')}${l.n > l.words.length ? ', ...' : ''}`).join('\n');
  return `${RULES}

${SCHEMA}

WORLD: ${worldId}

OPERATIONS (id - meaning; keys with the question each answers):
${fmtOps(d)}

LEXICONS (value heads):
${lex}

SOLVED EXAMPLES:
${ex.map((e) => `sentence: ${JSON.stringify(e.text)}\n=> ${JSON.stringify({ i: 1, op: e.op, slots: e.slots })}`).join('\n')}
`;
}

export function batchText(items) {
  return items.map((x, k) => `[${k + 1}]${x.context?.length ? ` CONTEXT: ${x.context.map((c) => JSON.stringify(c)).join(' / ')} ::` : ''} SENTENCE: ${JSON.stringify(x.text)}`).join('\n');
}
