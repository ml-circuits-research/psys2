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

const EN_STOP = new Set(['the', 'is', 'are', 'of', 'to', 'and', 'you', 'i', 'he', 'she', 'it', 'we', 'they', 'have', 'has', 'had', 'how', 'what',
  'who', 'where', 'when', 'why', 'does', 'do', 'did', 'not', 'my', 'your', 'in', 'on', 'with', 'that', 'this', 'there', 'many', 'much', 'yes',
  'hello', 'thanks', 'thank', 'please', 'many', 'been', 'was', 'were', 'will', 'can', 'don\'t', 'doesn\'t', 'it\'s', 'i\'m', 'o\'clock']);
const RO_STOP = new Set(['si', 'nu', 'ce', 'cum', 'cate', 'cati', 'cat', 'sunt', 'este', 'dar', 'pe', 'la', 'de', 'din', 'cu', 'pentru', 'lui', 'mai',
  'sau', 'unde', 'cand', 'daca', 'ca', 'ai', 'mi', 'imi', 'iti', 'te', 'sa', 'buna', 'multumesc', 'un', 'una', 'unei', 'fie', 'cine', 'care',
  'asta', 'acest', 'aceasta', 'mea', 'meu', 'tau', 'ta', 'foarte', 'acum', 'azi', 'maine', 'ieri', 'revedere', 'poti', 'esti', 'sunteti', 'avem']);
const AMBIGUOUS = new Set(['a', 'o', 'are', 'an', 'am', 'no', 'in', 'ok', 'okay', 'pa', 'mare', 'data', 'salut', 'ion', 'ana', 'maria', 'nu', 'plus', 'minus', 'sa']);

export function detectLanguage(text) {
  const toks = tokenize(String(text ?? '')).filter((t) => t.kind === 'word');
  let ro = 0;
  let en = 0;
  for (const t of toks) {
    const key = t.key;
    if (/[ăâîșț]/i.test(t.raw.normalize('NFC'))) ro += 2;
    if (/'/.test(key) && /^(don't|doesn't|didn't|isn't|aren't|it's|i'm|can't|won't|what's|that's)$/.test(key)) { en += 2; continue; }
    const roHit = RO_STOP.has(key) || analyze(key).length > 0;
    const enHit = EN_STOP.has(key) || isEnglishWord(key);
    if (AMBIGUOUS.has(key)) continue;
    if (roHit && enHit) continue;
    if (roHit) ro += RO_STOP.has(key) ? 1 : 0.7;
    else if (enHit) en += EN_STOP.has(key) ? 1 : 0.7;
  }
  const total = ro + en;
  if (total < 0.7 || Math.abs(ro - en) < 0.5) return { lang: 'unknown', confidence: 0 };
  const lang = ro > en ? 'ro' : 'en';
  const confidence = Math.round((Math.max(ro, en) / total) * (0.5 + 0.5 * Math.min(1, total / 2)) * 1000) / 1000;
  return { lang, confidence };
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
