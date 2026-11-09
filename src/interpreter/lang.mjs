/**
 * Shared dialogue vocabulary: yes/no/unsure/cancel, ordinals, colours, sizes, positions, degree words. Browser-safe, no imports.
 *
 * The words live in `worlds/lang.common` (phrase groups `lang.yes`, `lang.assent`, `lang.no`, `lang.decline`, `lang.unsure`, `lang.cancel`,
 * `lang.degree.*`, `lang.comparative`, `lang.shade`, `lang.size.*`, `lang.position.*`, `lang.ordinal.last`, `lang.lead.ask`, `lang.filler`, `lang.connective`, and the
 * lexicons `lex.lang.colour` and `lex.lang.ordinal`). `makeLang({ phrase, lexicon })` turns them into the function table that worlds
 * see as `ctx.lang` (spec 04) and that the discourse layer reads through `interp.lang` (spec 11). Nothing here holds a word list:
 * with an empty source every function answers "nothing".
 */

const plain = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ phrase: (id: string) => string[] | null | undefined, lexicon: (id: string) => string[] }} source
 *   `phrase('lang.yes')` gives the alternatives of that phrase group (words joined by a space), `lexicon(id)` the words of a lexicon.
 */
export function makeLang(source) {
  const phrase = (id) => (source.phrase(id) ?? []).map(plain).filter(Boolean);
  const set = (id) => new Set(phrase(id));

  // ---- yes / no / unsure / cancel ----------------------------------------------------------------------------------------
  const YES = new Set([...phrase('lang.yes'), ...phrase('lang.assent')]);
  const NO = new Set([...phrase('lang.no'), ...phrase('lang.decline'), ...phrase('lang.cancel')]);
  const UNSURE = set('lang.unsure');
  /** 'yes' | 'no' | null for a short reply ("sure thing" -> yes; "nah", "not now", "never mind" -> no). */
  const yesNo = (text) => { const t = plain(text); return YES.has(t) ? 'yes' : NO.has(t) ? 'no' : null; };
  /** True for "i do not know", "no idea", "idk" ... */
  const unsure = (text) => UNSURE.has(plain(text));
  const cancelAlts = [...new Set(phrase('lang.cancel'))].sort((a, b) => b.length - a.length).map((a) => esc(a).replace(/ /g, ' ?'));
  const CANCEL = cancelAlts.length ? new RegExp(`^(?:(?:oh|ok|okay|no|well) )?(?:${cancelAlts.join('|')})(?: please| pls| thanks)?$`) : null;
  /** A cancellation ("never mind", "forget it", "cancel that"). */
  const cancel = (text) => !!CANCEL && CANCEL.test(plain(text));
  const askAlts = [...new Set(phrase('lang.lead.ask'))].sort((a, b) => b.length - a.length);
  const LEAD = askAlts.length ? new RegExp(`^(?:(?:${askAlts.map(esc).join('|')}) )+`) : null;
  /** Drop leading asking words ("please", "can you", "tell me", "i want to know"). */
  const stripLead = (text) => (LEAD ? String(text ?? '').replace(LEAD, '') : String(text ?? ''));

  const fillerAlts = [...new Set(phrase('lang.filler'))].sort((a, b) => b.length - a.length);
  const FILLER = fillerAlts.length ? new RegExp(`^(?:(?:${fillerAlts.map(esc).join('|')})[\\s,.!?-]+)+(?=\\S)`, 'i') : null;
  /** Drop leading hesitation and backchannel words ("lol ok", "uhh", "hmm,") when something else follows; a message of fillers only stays as it is. */
  const stripFiller = (text) => (FILLER ? String(text ?? '').replace(FILLER, '') : String(text ?? ''));

  const connAlts = [...new Set(phrase('lang.connective'))].sort((a, b) => b.length - a.length);
  const CONNECTIVE = connAlts.length ? new RegExp(`^(?:${connAlts.map(esc).join('|')})[\\s,]+(?=\\S)`, 'i') : null;
  /** Drop a leading connective ("and", "also", "but", "so") that joins nothing; the caller decides when the rest stands on its own. */
  const stripConnective = (text) => (CONNECTIVE ? String(text ?? '').replace(CONNECTIVE, '') : String(text ?? ''));

  // ---- ordinals: the order of lex.lang.ordinal is the value (first = 1 ... tenth = 10); "last" and its synonyms are -1 ---------
  const ORDINAL_WORDS = ['', ...source.lexicon('lex.lang.ordinal').map((w) => String(w).toLowerCase()).filter((w) => w !== 'last')];
  const LAST = new Set(['last', ...phrase('lang.ordinal.last')]);
  /** 1..10 for first..tenth (and 1st, 2nd ...), -1 for last, null otherwise. */
  const ordinal = (word) => {
    const w = String(word ?? '').toLowerCase();
    if (LAST.has(w)) return -1;
    const i = ORDINAL_WORDS.indexOf(w);
    if (i > 0) return i;
    const m = w.match(/^(\d+)(?:st|nd|rd|th)$/);
    return m && +m[1] > 0 ? +m[1] : null;
  };
  const ordinalWord = (n) => (n === -1 ? 'last' : ORDINAL_WORDS[n] || null);

  // ---- colours ----------------------------------------------------------------------------------------------------------
  const COLOURS = source.lexicon('lex.lang.colour').map((w) => String(w).toLowerCase());
  const SHADES = phrase('lang.shade');
  /** The colour named by a list of words ("dark blue"), or null. */
  const colour = (words) => {
    const ws = [].concat(words).flatMap((w) => String(w).toLowerCase().split(/\s+/)).filter(Boolean);
    const c = ws.find((w) => COLOURS.includes(w));
    if (!c) return null;
    const sh = ws.find((w) => SHADES.includes(w));
    return sh ? `${sh} ${c}` : c;
  };

  // ---- sizes and positions ----------------------------------------------------------------------------------------------
  const BIG = set('lang.size.big'), SMALL = set('lang.size.small');
  /** 'big' | 'small' | null. */
  const size = (word) => { const w = String(word ?? '').toLowerCase(); return BIG.has(w) ? 'big' : SMALL.has(w) ? 'small' : null; };
  const POSITIONS = {};
  for (const d of ['left', 'right', 'top', 'bottom']) for (const w of phrase(`lang.position.${d}`)) POSITIONS[w] = d;
  /** 'left' | 'right' | 'top' | 'bottom' | null. */
  const position = (word) => POSITIONS[String(word ?? '').toLowerCase()] ?? null;

  // ---- degree -----------------------------------------------------------------------------------------------------------
  /** Degree adverbs (a bit ... way) with a strength: 1 small, 2 normal, 3 strong. */
  const DEGREE_ADVERBS = {};
  for (const [id, n] of [['slight', 1], ['even', 2], ['strong', 3]]) for (const w of phrase(`lang.degree.${id}`)) DEGREE_ADVERBS[w] = n;
  const COMPARATIVES = phrase('lang.comparative');
  const ADVERBS_LONGEST_FIRST = Object.keys(DEGREE_ADVERBS).sort((a, b) => b.length - a.length);
  /** Split a leading degree adverb off a phrase: { adv, strength, rest }. */
  const splitAdverb = (text) => {
    const t = plain(text);
    for (const a of ADVERBS_LONGEST_FIRST) if (t === a || t.startsWith(`${a} `)) return { adv: a, strength: DEGREE_ADVERBS[a], rest: t.slice(a.length).trim() };
    return { adv: null, strength: 2, rest: t };
  };
  /**
   * A degree fragment on the last frame: { type: 'more' | 'less' | 'comparative' | 'times' | 'same', adv, comparative?, factor?, ref? }, or null.
   *   "a bit more" / "much less"  -> more / less      "much bigger" / "even smaller" -> comparative
   *   "twice as big" / "half the size" -> times       "the same size as the house" -> same
   */
  const degree = (text) => {
    const t = plain(text);
    if (!t) return null;
    let m = t.match(/^(twice|double|triple|half|three times|four times|ten times) (?:as (\w+)(?: as (?:the )?(.+))?|the size|the size of (?:the )?(.+))$/);
    if (m) {
      const factor = { twice: 2, double: 2, triple: 3, half: 0.5, 'three times': 3, 'four times': 4, 'ten times': 10 }[m[1]];
      return { type: 'times', factor, adj: m[2] ?? 'size', ref: m[3] ?? m[4] ?? null, text: t };
    }
    m = t.match(/^(?:the )?same (size|colou?r|height|width|length) as (?:the )?(.+)$/) ?? t.match(/^as (big|large|small|tall|wide|long|short|high) as (?:the )?(.+)$/);
    if (m) return { type: 'same', what: /^colou?r$/.test(m[1]) ? 'colour' : 'size', ref: m[2], text: t };
    const { adv, strength, rest } = splitAdverb(t);
    if (rest === 'more' || (rest === 'again' && adv)) return { type: 'more', adv, strength };
    if (rest === 'less' || rest === 'fewer') return { type: 'less', adv, strength };
    if (COMPARATIVES.includes(rest)) return { type: 'comparative', adv, strength, comparative: rest };
    return null;
  };

  return { yesNo, unsure, cancel, stripLead, stripFiller, stripConnective, ordinal, ordinalWord, colour, size, position, degree, splitAdverb, COLOURS, SHADES, COMPARATIVES, DEGREE_ADVERBS };
}

export default makeLang;
