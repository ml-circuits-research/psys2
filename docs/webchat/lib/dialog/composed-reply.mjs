// SPDX-License-Identifier: AGPL-3.0-only
/**
 * COMPOSED REPLIES (spec 06 "Composed replies"; reviewer 2026-11-15 03:15 item 2). A reply the application composes is said in the user's language from the language world's templates,
 * not machine-translated: a world's result may carry `say: { act, roles }` next to its English `value`, and in a session of another language that frame is realised by the language
 * pack (Romanian: src/lang/ro.mjs `composeRo`, the templates of `w.lang.ro` and std.morph `realise`). The translators stay for free text and for replies with no frame or no template.
 * Browser-safe: the language pack is imported lazily, the first time a reply of that language has a frame. Never throws; null = not composed (the caller goes on as before).
 */
const packs = new Map();
const OPEN = { ro: () => import('../lang/ro.mjs?v=dc23ded13c').then((m) => m.openLangRo()) };

export async function composeReply(say, lang) {
  if (!say?.act || !OPEN[lang]) return null;
  try {
    if (!packs.has(lang)) packs.set(lang, OPEN[lang]());
    const pack = await packs.get(lang);
    return pack?.composeRo?.(say) ?? null;
  } catch { return null; }
}

/** The frame of a rendered reply: only when the text shown is the world's own value (nothing added around it), so the composed sentence says the same thing. */
export const sayOf = (envelope, rendered) => (envelope?.say?.act && typeof envelope.value === 'string' && (envelope.value === rendered || envelope.value.replace(/_/g, ' ') === rendered) ? envelope.say : null);   // the render says a name's underscores as spaces (work_done)
