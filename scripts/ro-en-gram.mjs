// node scripts/ro-en-gram.mjs [--lib | --lib0] sentence...   (--lib: words from w.lang.ro via std.morph with the Q51 workaround; --lib0: the library as it is; default: the translator's lexicon)
import { grammarRoEn } from '../src/translate/grammar-ro.mjs';
import { openLangRo } from '../src/lang/ro.mjs';
const args = process.argv.slice(2);
const lib = args.includes('--lib') ? await openLangRo() : args.includes('--lib0') ? await openLangRo({ workaround: false }) : null;
for (const t of args.filter((a) => !a.startsWith('--'))) { const r = grammarRoEn(t, lib ? { lexicon: lib } : {}); console.log(JSON.stringify(t), '=>', JSON.stringify(r.text), r.ok ? '' : r.notes.join()); }
