// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A fake on-device Translator and LanguageDetector for the browser test harness (COMPUTE-BUDGET F, spec 06 "Compute budgets").
 *
 * The code that handles the browser's own translation (docs/webchat/ui/translation.mjs: the page-side backend, the bridge into the engine worker with its
 * 700 ms deadline, the checker of numbers, names, negation and question form) only runs in a real Chrome that has the APIs, so headless tests never
 * reached it and an endless loop in the checker froze real users' pages on every Romanian message. The harness (`openChat`) installs these fakes by
 * default; a test flips the mode at any time with `fake.set({ mode })`.
 *
 * Modes (window.__psys2Fake.mode):
 *   success  the English translation of the rules translator (src/translate, run in node and exposed to the page) and the rules language detection
 *   slow     the same answer after `slowMs` (1500 ms), later than the 700 ms bridge deadline: the turn must fall back to the rules
 *   hang     a promise that never settles
 *   wrong    a wrong translation, `wrong` picks how: empty | garbage (a statement for a question) | numbers (digits changed) | names (capitalised
 *            names dropped) | negation (the "not" dropped) | punct (starts with punctuation, the shape that triggered the old regex loop)
 * Shapes: 'current' (window.Translator / window.LanguageDetector), 'ai' (the older window.ai.translator / window.ai.languageDetector), 'both'.
 * Pairs: ro -> en and en -> ro (RO-TRANSLATE-FALLBACK). Both answer from a small deterministic table (FAKE_RO_EN, FAKE_EN_RO: the sentences the fallback tests need), then from
 * the rules translator. `pairs: ['ro>en']` makes en -> ro 'unavailable' again (a Chrome with only one model).
 * The page records every call in `window.__psys2Fake.calls` ({ op, text, mode }).
 */
import { createTranslator } from '../../src/translate/index.mjs';

const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** What a small on-device model would say for the sentences of the fallback tests (keys are compared without case, accents and punctuation). */
export const FAKE_RO_EN = {
  'câți ani am?': 'How old am I?', 'cum mă numesc?': 'What is my name?', 'deschide magazinul': 'Open the shopping list.', 'deschide jocul de ghicit': 'Open the guess the animal tab.',
  'e ora 25': 'It is 25 o\'clock.', 'câte zile are iunie?': 'How many days does June have?', 'mi-ar plăcea tare mult să știu câte zile are iunie': 'How many days does June have?', 'cât face 3 plus 4?': 'What is 3 plus 4?', 'desenează o pisică verde': 'Draw a green cat.',
};
export const FAKE_EN_RO = {
  'Your shopping list is empty.': 'Lista ta de cumpărături este goală.', 'I do not know your age yet.': 'Încă nu știu câți ani ai.', 'You can tell me, and I will remember it.': 'Poți să-mi spui și o să țin minte.',
  'Hello there, how are you today?': 'Salut, ce mai faci azi?', 'The sun is a star.': 'Soarele este o stea.',
};

/**
 * The translation the fake backend gives: the table first (key: folded text; `extra` is a Map folded text -> English, for a measuring run that has an oracle), then
 * the rules translator. Returns null when nothing is known and the rules output is the text itself (a real model would still answer; the checker decides).
 */
export function createFakeTranslation({ roEn = FAKE_RO_EN, enRo = FAKE_EN_RO, extra = null, rules = createTranslator() } = {}) {
  const tables = { 'ro>en': new Map(Object.entries(roEn).map(([k, v]) => [fold(k), v])), 'en>ro': new Map(Object.entries(enRo).map(([k, v]) => [fold(k), v])) };
  if (extra) for (const [k, v] of extra) tables['ro>en'].set(fold(k), v);
  return {
    translate(text, from = 'ro', to = 'en') {
      const hit = tables[`${from}>${to}`]?.get(fold(text));
      if (hit) return hit;
      if (from === 'en' && to === 'ro') {   // sentence by sentence: a table sentence inside a longer reply is translated, the rest by the rules
        const parts = String(text).split(/(?<=[.!?])\s+/);
        if (parts.length > 1 && parts.some((x) => tables['en>ro'].has(fold(x)))) return parts.map((x) => tables['en>ro'].get(fold(x)) ?? String(rules.translate(x, { from, to })?.text ?? '')).join(' ');
      }
      return String(rules.translate(String(text), { from, to })?.text ?? '');
    },
  };
}

/** Page-side script (a string for evaluateOnNewDocument). */
export const fakeScript = (opts) => `(() => {
  const st = window.__psys2Fake = Object.assign({ mode: 'success', wrong: 'garbage', slowMs: 1500, pairs: ['ro>en', 'en>ro'], calls: [] }, ${JSON.stringify(opts)});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ro = (op, text, from, to) => window.__psys2FakeRules(op, text, from, to);
  const wrongOf = (good, src) => {
    switch (st.wrong) {
      case 'empty': return '';
      case 'garbage': return 'the weather is nice today';
      case 'numbers': return good.replace(/\\d+/g, (d) => String(Number(d) + 4));
      case 'names': return good.replace(/\\p{Lu}\\p{L}+/gu, '').replace(/\\s+/g, ' ').trim() || 'someone';
      case 'negation': return good.replace(/\\b(?:not|no|never|don't|do not|cannot|can't)\\b/gi, '').replace(/\\s+/g, ' ').trim();
      case 'punct': return '. ' + good;
      default: return 'asdf qwer zxcv';
    }
  };
  async function translate(text, from, to) {
    st.calls.push({ op: 'translate', text, mode: st.mode });
    if (st.mode === 'hang') return new Promise(() => {});
    if (st.mode === 'slow') await sleep(st.slowMs);
    const good = await ro('translate', text, from, to);
    return st.mode === 'wrong' ? wrongOf(good, text) : good;
  }
  async function detect(text) {
    st.calls.push({ op: 'detect', text, mode: st.mode });
    if (st.mode === 'hang') return new Promise(() => {});
    if (st.mode === 'slow') await sleep(st.slowMs);
    const r = await ro('detect', text);
    return [{ detectedLanguage: r?.lang && r.lang !== 'unknown' ? r.lang : 'und', confidence: r?.lang && r.lang !== 'unknown' ? 0.97 : 0.2 }];
  }
  const pairOk = (o) => st.pairs.includes(o?.sourceLanguage + '>' + o?.targetLanguage);
  const makeTranslator = (o) => ({ translate: (t) => translate(t, o.sourceLanguage, o.targetLanguage), destroy() {} });
  const makeDetector = () => ({ detect, destroy() {} });
  // defineProperty: this Chrome has a native Translator and LanguageDetector (and may have a read-only ai object); plain assignment keeps them, the older shape must hide them
  const put = (name, value) => Object.defineProperty(window, name, { configurable: true, writable: true, value });
  if (st.shape === 'current' || st.shape === 'both') {
    put('Translator', { availability: async (o) => (pairOk(o) ? 'available' : 'unavailable'), create: async (o) => makeTranslator(o) });
    put('LanguageDetector', { availability: async () => 'available', create: async () => makeDetector() });
  } else { put('Translator', undefined); put('LanguageDetector', undefined); }
  if (st.shape === 'ai' || st.shape === 'both') {
    put('ai', {
      translator: { canTranslate: async (o) => (pairOk(o) ? 'readily' : 'no'), create: async (o) => makeTranslator(o) },
      languageDetector: { capabilities: async () => ({ available: 'readily' }), create: async () => makeDetector() },
    });
  }
})();`;

/** Installs the fakes on a puppeteer page (before navigation). Returns { set(patch), calls(), st() }. */
export async function installFakeBrowserApis(pg, { mode = 'success', wrong = 'garbage', shape = 'current', slowMs = 1500, pairs = ['ro>en', 'en>ro'] } = {}) {
  const rules = createTranslator();
  const fake = createFakeTranslation({ rules });
  await pg.exposeFunction('__psys2FakeRules', (op, text, from = 'ro', to = 'en') => {
    if (op === 'detect') return rules.detectLanguage(String(text));
    return fake.translate(String(text), from, to);
  });
  await pg.evaluateOnNewDocument(fakeScript({ mode, wrong, shape, slowMs, pairs }));
  return {
    set: (patch) => pg.evaluate((p) => Object.assign(window.__psys2Fake, p), patch),
    calls: () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__psys2Fake?.calls ?? []))),
  };
}
