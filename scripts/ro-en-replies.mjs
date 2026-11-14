// Romanian replies with the article where the grammar path answers (src/lang/ro.mjs replyRo), and the size of what a message loads from w.lang.ro.
//   node scripts/ro-en-replies.mjs
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { openLangRo } from '../src/lang/ro.mjs';
import { grammarRoEn } from '../src/translate/grammar-ro.mjs';
import { LANG_RO_FACTS } from '../src/lang/ro.facts.generated.mjs';
import { LANG_RO_UNIMORPH } from '../src/lang/ro.unimorph.generated.mjs';
import { tokenize, foldKey } from '../src/translate/normalize.mjs';

const ro = await openLangRo();
const rows = readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => ['authored', 'hand', 'owner'].includes(r.ro_by));
const byAct = {}, samples = {};
let answered = 0, replied = 0;
for (const r of rows) {
  const g = grammarRoEn(r.ro, { lexicon: ro });
  if (!g.ok) continue;
  answered++;
  const f = Array.isArray(g.frame) ? (g.frame.length === 1 ? g.frame[0] : null) : g.frame;
  const act = f?.act ?? 'multi';
  const t = (byAct[act] ??= { answered: 0, replied: 0 });
  t.answered++;
  const reply = ro.replyRo(g.frame);
  if (reply) { replied++; t.replied++; (samples[act] ??= []).length < 3 && samples[act].push(`${r.ro}  ->  ${reply}`); }
}
console.log(`hand-written rows ${rows.length}; the grammar answers ${answered}; a reply by the library from the catalog templates for ${replied}`);
for (const [a, t] of Object.entries(byAct)) console.log(a.padEnd(14), `answered ${String(t.answered).padStart(4)}  replied ${String(t.replied).padStart(4)}`, (samples[a] ?? []).join(' | '));
// what a message loads: the wires once, then per message the dictionary files of the first letters of its words (hand file + derived file)
const size = (o) => Object.values(o).reduce((a, s) => a + s.length, 0);
const wires = LANG_RO_FACTS.wires.length;
console.log(`wires (once): ${wires} B, gzip ${gzipSync(LANG_RO_FACTS.wires).length}; hand dictionary ${size(LANG_RO_FACTS.dictionary)} B; UniMorph dictionary ${size(LANG_RO_UNIMORPH)} B (own module, CC BY-SA 3.0)`);
let n = 0, hand = 0, both = 0, files = 0;
for (const r of rows) {
  const letters = new Set();
  for (const t of tokenize(r.ro)) if (t.kind === 'word') letters.add(foldKey(t.raw)[0]);
  n++; files += letters.size;
  for (const l of letters) { hand += (LANG_RO_FACTS.dictionary[l] ?? '').length; both += (LANG_RO_FACTS.dictionary[l] ?? '').length + (LANG_RO_UNIMORPH[l] ?? '').length; }
}
console.log(`per message (a letter file per word's first letter, upper bound): ${(files / n).toFixed(1)} files, hand dictionary ${(hand / n / 1024).toFixed(1)} KB, with UniMorph ${(both / n / 1024).toFixed(1)} KB`);
