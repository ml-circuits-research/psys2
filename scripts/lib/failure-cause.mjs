// SPDX-License-Identifier: AGPL-3.0-only
// The cause key of a failure-ledger row (shared by scripts/analyze-failures.mjs and scripts/eval-ablation.mjs).
const NOT_UNDERSTOOD = /did not understand|didn't understand|not sure how .* fits|could not find|can't find|I do not know what|I don't know/i;
/** One cause key per row: the first matching general signal (order = most specific first). */
export function causeOf(r) {
  const h = r.happened ?? '', cls = r.class ?? '', src = r.source ?? '', lang = r.language ?? 'en';
  if (/^\(no reply\)/.test(h) || h === '') return 'no reply';
  if (/^\(error\)/.test(h)) return 'crash / exception';
  if (cls.startsWith('robust:')) return `robustness: ${cls.slice(7).replace(':', ' / ')}`;   // scripts/ledger-robustness.mjs: robust:<set>:<cause key>
  if (cls === 'world-routing') return 'wrong world routing (confusion pair)';
  if (src.startsWith('round-trip')) return cls.endsWith('original-fails') ? 'roundtrip: English original not read' : cls.endsWith('reader-gap') ? 'roundtrip: translation kept meaning, reader gap' : cls.endsWith('judge-strict') ? 'roundtrip: answer wording only' : 'roundtrip: translation changed meaning';
  if (/mt-residue|mt-wrong-sense|typo-source/.test(cls)) return 'translation residue / wrong sense / source typo';
  if (lang !== 'en' && /I do not know what "[^"]+"|did not know the words|I did not understand "[^"]*[^\x00-\x7f]/.test(h) && !/^OK|^Done/.test(h)) return 'translation residue / wrong sense / source typo';
  if (/foreign-world|active-tab/.test(cls) || /new game|you play black|hangman|chess|spânzur/i.test(h)) return 'foreign-world reading';
  if (/list|fragment/.test(cls) || /not sure how .* fits what we were doing/.test(h)) return 'fragment / list split';
  if (/avatar-accessory/.test(cls)) return 'avatar part not an operation of the avatar world';
  if (/about-discussion/.test(cls)) return 'session as content (about the discussion)';
  if (/continuation|correction|repair|refine|complaint|why|keep|scene-question/.test(cls) || /^dialogue:(correction|ellipsis|reference|clarification|confirmation|feedback)/.test(cls)) return 'continuation / correction / why-question';
  if (/kind-of|referent-kind|catalog/.test(cls) || /don't know how to draw/.test(h)) return 'unknown kind (no drawing / stand-in)';
  if (/default-place/.test(cls) || /usually live in|not on the ground/i.test(h)) return 'default place';
  if (/region/.test(cls)) return 'region as a thing / ground replaced';
  if (/amount|space|distribute|place|relation|set-attribute|degree/.test(cls) || /^dialogue:degree/.test(cls)) return 'amount / relation / set distribution';
  if (/^coherence:/.test(cls)) return `coherence (${cls.split(':')[1]})`;
  if (/^minimal-pair:/.test(cls)) return `minimal pair (${cls.split(':')[1]})`;
  if (/^dialogue:/.test(cls)) return 'dialogue: other turn kinds';
  if (/wrong-action|variation|unlabelled/.test(cls)) return 'acted on a partly understood sentence';
  if (/^E-T|talk/i.test(src + (r.tab ?? ''))) return 'Talk: no fact in the catalog / frame not read';
  if (NOT_UNDERSOD(h)) return 'not understood (no cause key)';
  return 'other / wrong result';
}
function NOT_UNDERSOD(h) { return NOT_UNDERSTOOD.test(h); }

/**
 * The pipeline stage a cause group belongs to (the step ids of src/dialog/steps.mjs, plus `boundary` for the translation and typing layer in
 * front of the pipeline, and `host` for crashes). A heuristic by cause group, like `causeOf`: it says where to look first.
 */
export function stageOf(group) {
  const g = String(group ?? '');
  if (/^crash/.test(g)) return 'host';
  if (/^no reply/.test(g)) return 'reply';
  if (/translation|roundtrip|^robustness/.test(g)) return 'boundary';
  if (/routing|foreign-world/.test(g)) return 'world';
  if (/fragment|continuation|session as content|^dialogue/.test(g)) return 'kind';
  if (/avatar part|acted on a partly/.test(g)) return 'act';
  if (/unknown kind|Talk: no fact/.test(g)) return 'things';
  if (/default place|region/.test(g)) return 'missing';
  if (/amount|relation|set distribution/.test(g)) return 'apply';
  if (/^coherence|^minimal pair|not understood|other/.test(g)) return 'reply';
  return 'unknown';
}
