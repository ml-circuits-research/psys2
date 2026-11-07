// Operations of kids.common (browser-safe: no imports).
//
// Besides the spec 04 ctx API these operations use one extra facility:
//   ctx.worlds() -> [{ id, title, status, doc }]   read-only list of the loaded worlds.
// It is implemented by the interpreter (src/interpreter/index.mjs) from the WorldSet.

export function greet() { return { status: 'supported', value: 'Hello' }; }

/** Name of the assistant entity (e.assistant). */
export function assistantName(ctx) { return { status: 'supported', value: ctx.name('e.assistant') }; }

export function thanks() { return { status: 'supported', value: 'You are welcome' }; }

export function bye() { return { status: 'supported', value: 'Goodbye' }; }

const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1));

/**
 * A short spoken answer built from the `summary=` phrase of each world manifest (the title when a world has none;
 * an empty summary leaves the world out). Phrases that start with the same words are merged:
 * "talk about animals" + "talk about time" -> "talk about animals and time".
 */
export function capabilities(ctx) {
  const phrases = [];
  for (const w of ctx.worlds()) {
    if (w.id === 'core') continue;
    const p = String(w.summary ?? w.title ?? '').trim();
    if (p && !phrases.includes(p)) phrases.push(p);
  }
  const groups = [];
  for (const p of phrases) {
    const words = p.split(/\s+/);
    const g = groups.find((x) => x.first === words[0] && words.length > 1);
    if (g) g.items.push(words); else groups.push({ first: words[0], items: [words] });
  }
  const parts = groups.map((g) => {
    if (g.items.length === 1) return g.items[0].join(' ');
    let n = 0; // longest common word prefix, leaving at least one word to each phrase
    while (g.items.every((w) => w.length > n + 1 && w[n] === g.items[0][n])) n++;
    return g.items[0].slice(0, n).join(' ') + ' ' + joinAnd(g.items.map((w) => w.slice(n).join(' ')));
  });
  const value = parts.length > 2 ? parts.slice(0, -1).join(', ') + ', and ' + parts.at(-1) : joinAnd(parts);
  return { status: 'supported', value, values: phrases };
}
