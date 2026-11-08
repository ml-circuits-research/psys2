// PSys2 translation module: rule-based Romanian <-> English (browser-safe, no dependencies).
//
//   detectLanguage(text)                  -> { lang: 'en' | 'ro' | 'unknown', confidence }
//   translate(text, { from, to })         -> { text, alignment: [{src:[s,e], tgt:[s,e]}],
//                                              unknown: [{word, span}], notes: [string], confidence }
//   createTranslator()                    -> { detectLanguage, translate }   (the dialog engine's `translator`)
//
// A sentence whose negation or question word could not be mapped is not translated: it is omitted from
// `text` and reported in the extra field `untranslatable: [{span, reason}]` (confidence 0).
import { tokenize, foldKey } from './normalize.mjs';
import { analyze } from './morphology.ro.mjs';
import { translateRoEn } from './ro-en.mjs';
import { translateEnRo, isEnglishWord } from './en-ro.mjs';

// Romanian evidence, in points (a rough log-odds of "Romanian" against "English"), for words typed with OR without diacritics.
// Words that are also English words ("cat", "care", "la", "fa", "pune", "do"...) carry only a small weight by themselves;
// their weight comes from context (see contextEvidence). Tokens in AMBIGUOUS carry none.
const RO_W = new Map();
const addW = (w, words) => { for (const k of words.split(' ')) RO_W.set(k, w); };
addW(2, 'sau este sunt pentru din vreau unde cand daca foarte cum multumesc buna deseneaza arata sterge adauga spune ziua seara dimineata esti poti vrei iti imi avem '
  + 'aceasta acest asta dupa intre fara catre despre mereu doar toate toti mele mea meu mei tale tau tai nostru noastra cate cati cata cine revedere unei sunteti');
addW(1.5, 'si sa cu pe acum azi maine ieri');
addW(1.2, 'nu mai');
addW(1, 'ce da dar fa pune');
addW(0.7, 'care');
addW(0.5, 'cat de un una ca lui ta');
addW(0.3, 'la');
const AMBIGUOUS = new Set(['a', 'o', 'are', 'an', 'am', 'no', 'in', 'ok', 'okay', 'pa', 'mare', 'data', 'salut', 'ion', 'ana', 'maria', 'plus', 'minus', 'e', 'ai', 'te', 'mi', 'ma']);
const EN_STOP = new Set(['the', 'is', 'are', 'of', 'to', 'and', 'you', 'i', 'he', 'she', 'it', 'we', 'they', 'have', 'has', 'had', 'how', 'what',
  'who', 'where', 'when', 'why', 'does', 'do', 'did', 'not', 'my', 'your', 'in', 'on', 'with', 'that', 'this', 'there', 'many', 'much', 'yes',
  'hello', 'thanks', 'thank', 'please', 'been', 'was', 'were', 'will', 'can', 'don\'t', 'doesn\'t', 'it\'s', 'i\'m', 'o\'clock']);
const RO_NUM = new Set(['unu', 'doi', 'doua', 'trei', 'patru', 'cinci', 'sase', 'sapte', 'opt', 'noua', 'zece']);
const EN_BEFORE_ARE = new Set(['there', 'they', 'we', 'you', 'what', 'how', 'where', 'who', 'these', 'those', 'which', 'why', 'when', 'if', 'that']);
// Romanian-only word endings, for words with no lexicon entry (min. 5 letters): -eaza, -easca, -esti, -ește, -ției/-tie, -ul/-ului, -ilor/-elor, -area/-irea, -itate (diacritics folded)
const RO_SUFFIX = /(eaza|easca|easte|este|esti|tie|tia|tiei|tiile|ului|ilor|elor|area|irea|atul|itate|iune|iuni)$|(?<!f|l)ul$/;
const RO_STRONG_SUFFIX = /(.{4}este|.{4}esti|eaza|easca|ului|ilor|elor|itate|iune|iuni)$/;
const SOLFEGE = new Set(['do', 're', 'mi', 'fa', 'sol', 'la', 'si']);
const NUM_AFTER_ARE_STOP = new Set(['and', 'or', 'plus', 'minus', 'times', 'to', 'equals', 'equal']);

/** Context rules for words that exist in both languages ("cat face 3 plus 4", "are 3 mere"). */
function contextEvidence(ws) {
  let ro = 0;
  for (let i = 0; i < ws.length; i++) {
    const k = ws[i].key, nx = ws[i + 1], pv = ws[i - 1];
    const isNum = (t) => t && (t.kind === 'num' || RO_NUM.has(t.key));
    if (k === 'cat' && nx) {
      if (/^(costa|sunt|este|ai|mai|timp|de|are|au|avem|e)$/.test(nx.key)) ro += 2.5;
      else if (/^(face|fac)$/.test(nx.key) && isNum(ws[i + 2])) ro += 2.5;
    }
    if ((k === 'face' || k === 'fac') && pv && /^(ce|cate)$/.test(pv.key)) ro += 1;
    if (k === 'am' && !(pv && pv.key === 'i') && nx && nx.key !== 'i' && (nx.kind === 'num' || /^(o|un|mai|doi|doua|trei|nevoie|de)$/.test(nx.key) || (analyze(nx.key).length > 0 && !isEnglishWord(nx.key)))) ro += 1.5;   // "Am o pisica", "Am 20 de lei", "Am gasit 5 lei" (English "am" follows "I")
    if (k === 'de' && pv && pv.kind === 'num') ro += 1.5;   // "20 de lei"
    if (k === 'are') {
      const nextNum = nx && nx.kind === 'num' && !(ws[i + 2] && NUM_AFTER_ARE_STOP.has(ws[i + 2].key));
      const nextRo = nx && nx.kind === 'word' && (/^(un|o|mai|doi|doua)$/.test(nx.key) || (RO_NUM.has(nx.key)) || (analyze(nx.key).length > 0 && !isEnglishWord(nx.key)));
      if ((nextNum || nextRo) && !(pv && EN_BEFORE_ARE.has(pv.key))) ro += 1.5;
    }
  }
  return ro;
}

export function detectLanguage(text) {
  const toks = tokenize(String(text ?? '')).filter((t) => t.kind === 'word' || t.kind === 'num');
  const words = toks.filter((t) => t.kind === 'word');
  let ro = 0;
  let en = 0;
  const solfege = words.filter((t) => SOLFEGE.has(t.key)).length >= 3;   // "do re mi fa sol la si" is music, not Romanian
  for (const t of words) {
    const key = t.key;
    if (/[ăâîșț]/i.test(t.raw.normalize('NFC'))) ro += 2;
    if (/'/.test(key) && /^(don't|doesn't|didn't|isn't|aren't|it's|i'm|can't|won't|what's|that's)$/.test(key)) { en += 2; continue; }
    if (AMBIGUOUS.has(key)) continue;
    const w = RO_W.get(key);
    if (w) { if (!(solfege && SOLFEGE.has(key))) ro += w; continue; }
    const roHit = analyze(key).length > 0;
    const enHit = EN_STOP.has(key) || isEnglishWord(key);
    if (roHit && enHit) continue;
    const dash = /^(\p{L}{3,})-(mi|ti|te|ma|ne|va|le|l|o|si|imi|iti)$/u.exec(key);   // Romanian enclitics: "reseteaza-ti", "arata-mi", "uita-te"
    if (dash && !isEnglishWord(dash[1])) { ro += RO_SUFFIX.test(dash[1]) || analyze(dash[1]).length ? 2 : 1.5; continue; }
    if (roHit) ro += key.length >= 7 || (key.length >= 5 && RO_SUFFIX.test(key)) ? 2 : key.length >= 5 ? 1.5 : key.length >= 4 ? 1 : 0.5;   // a lexicon word that is not English: the longer, the less likely a coincidence
    else if (enHit) en += EN_STOP.has(key) ? 1 : 0.7;
    else if (key.length >= 5 && RO_SUFFIX.test(key)) ro += RO_STRONG_SUFFIX.test(key) ? 2 : 1.5;
  }
  ro += contextEvidence(toks);
  // Romanian is claimed on at least 2 points that beat the English evidence by 1: a diacritic, two function words, a function word and a Romanian-looking word or ending...
  // A single short or ambiguous token ("e", "da", "cat", "face", "la la la") stays below that: the caller then keeps its session language (default English).
  if (ro >= 2 && ro - en >= 1) {
    const total = ro + en;
    return { lang: 'ro', confidence: Math.round((ro / total) * (0.5 + 0.5 * Math.min(1, total / 2)) * 1000) / 1000 };
  }
  const total = ro + en;
  if (en < 0.7 || en - ro < 0.5 || total < 0.7) return { lang: 'unknown', confidence: 0 };
  return { lang: 'en', confidence: Math.round((en / total) * (0.5 + 0.5 * Math.min(1, total / 2)) * 1000) / 1000 };
}

export function translate(text, opts = {}) {
  const source = String(text ?? '');
  let from = opts.from;
  if (!from || from === 'auto') from = detectLanguage(source).lang;
  let to = opts.to || (from === 'ro' ? 'en' : 'ro');
  if (from === to && (from === 'ro' || from === 'en')) {
    return { text: source, alignment: source ? [{ src: [0, source.length], tgt: [0, source.length] }] : [], unknown: [], notes: ['source and target language are the same'], confidence: 1 };
  }
  if (from === 'ro' && to === 'en') return translateRoEn(source);
  if (from === 'en' && to === 'ro') return translateEnRo(source);
  return { text: '', alignment: [], unknown: [], notes: [`unsupported language pair ${from} -> ${to}`], confidence: 0, untranslatable: source ? [{ span: [0, source.length], reason: `unsupported language pair ${from} -> ${to}` }] : [] };
}

export function createTranslator() {
  return {
    detectLanguage: (text) => detectLanguage(text),
    translate: (text, opts) => translate(text, opts),
    supports: (from, to) => (from === 'ro' && to === 'en') || (from === 'en' && to === 'ro'),
  };
}

export { foldKey };
export { normalizeText } from './normalize.mjs';
export { lemmaOfNoun, analyzeVerbForm, stripAdjAgreement } from './morphology.ro.mjs';
export default { detectLanguage, translate, createTranslator };
