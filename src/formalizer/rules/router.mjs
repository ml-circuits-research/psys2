/** Router scoring (spec 03 section 5). Browser-safe. */

/**
 * Score every world for a token list.
 * +5 when one of its patterns matches, +1 per token whose lemma is in a lexicon (+2 for triggers).
 * @param {Set<string>} matchedWorlds worlds with a matching pattern
 * @returns {{id:string, score:number}[]} worlds with score > 0, best first (top 3)
 */
export function routeScores(tokens, set, lex, matchedWorlds) {
  const out = [];
  for (const w of set.list()) {
    let score = matchedWorlds.has(w.id) ? 5 : 0;
    const weights = lex.byWorld.get(w.id);
    if (weights) {
      for (const t of tokens) {
        if (t.kind !== 'word') continue;
        score += weights.get(lex.lemma(t.lower)) ?? weights.get(t.lower) ?? 0;
      }
    }
    if (score > 0) out.push({ id: w.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 3);
}
