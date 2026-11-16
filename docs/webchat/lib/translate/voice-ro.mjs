// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Romanian GRAMMAR VOICE (questions.md Q13, reviewer 2026-11-15 08:15): a candidate the M4 choice (candidates.mjs) hears next to the translators. It reads the Romanian into a frame
 * (act + roles, src/translate/grammar-ro.mjs) with the words of the catalog's language world `w.lang.ro` (src/lang/ro.mjs, std.morph) and proposes the English the frame is realised as.
 * It ABSTAINS (null) outside the shapes it covers, so a sentence it does not know is read by the translators exactly as before; where it answers it comes first, and the world still decides:
 * chooseCandidate keeps it only if the reader understands it completely in the open tab.
 *
 * Browser-safe, lazy: nothing of Romanian (the language world, the library) loads until the first Romanian message while the voice is on (setting `roGrammar`, default off).
 * `lexicon` is optional: the translator's own lexicon when absent (tests, measurement).
 *
 *   const voice = createRoGrammarVoice();   await voice.propose('desenează o casă roșie', { from: 'ro', to: 'en' }) -> { text, frame, source: 'grammar' } | null
 */
export function createRoGrammarVoice({ loadLexicon = null, unimorph = false } = {}) {
  let ready = null;
  const load = () => (ready ??= (async () => {
    const [{ grammarRoEn }, lang] = await Promise.all([import('./grammar-ro.mjs?v=e92090b7e0'), loadLexicon ? Promise.resolve(null) : import('../lang/ro.mjs?v=4e1ba6e7a3')]);
    const lexicon = loadLexicon ? await loadLexicon() : await lang.openLangRo({ unimorph });
    return { grammarRoEn, lexicon };
  })());
  return {
    name: 'grammar',
    /** The English of a Romanian sentence by the frames, or null (the voice abstains). Never throws. */
    async propose(text, { from = 'ro', to = 'en' } = {}) {
      if (from !== 'ro' || to !== 'en') return null;
      try {
        const { grammarRoEn, lexicon } = await load();
        const g = grammarRoEn(String(text ?? ''), { lexicon });
        return g.ok ? { text: g.text, frame: g.frame, source: 'grammar' } : null;
      } catch { return null; }
    },
    /** The Romanian reply with the article for a frame the voice proposed (library `realise` over the catalog's templates), or null. */
    async reply(frame) { try { const { lexicon } = await load(); return lexicon?.replyRo?.(frame) ?? null; } catch { return null; } },
  };
}
