// RO-LEFTOVERS: English words that leak into a Romanian reply are caught (both ways: leaks are found, Romanian text is not flagged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTranslator } from '../src/translate/index.mjs';
import { CANONICAL_RO } from '../src/translate/canonical.en-ro.mjs';

const tr = createTranslator();
const left = (s) => tr.leftovers(s, 'ro');

test('single English words inside a Romanian sentence are leftovers', () => {
  assert.deepEqual(left('Perele sunt biggest, cu 5.'), ['biggest']);
  assert.deepEqual(left('Merele sunt smallest, cu 3.'), ['smallest']);
  assert.ok(left('Am desenat o casă bigger.').includes('bigger'));
  assert.ok(left('Eu sunt running acum.').includes('running'));
});

test('names, numbers, quoted words and Romanian words are not leftovers', () => {
  assert.deepEqual(left('Perele sunt cele mai mari, cu 5.'), []);
  assert.deepEqual(left('Ai spus „biggest” și „the tree”.'), []);
  assert.deepEqual(left('Am găsit melodia „Let it be”.'), []);
  assert.deepEqual(left('Mă bucur să te cunosc, Walker!'), []);
  assert.deepEqual(left('Sunt 12 pomi și 3 case.'), []);
});

test('no authored Romanian sentence (canonical examples) is flagged', () => {
  // The few words that are the same in both languages or are titles ("link", "stop", "Happy Birthday") are the known exceptions.
  const flagged = new Set(Object.values(CANONICAL_RO).flatMap((s) => left(s)).map((w) => w.toLowerCase()));
  const known = new Set(['link', 'example', 'show', 'first', 'state', 'stop', 'happy']);
  assert.deepEqual([...flagged].filter((w) => !known.has(w)), []);
});

test('no Romanian user message of the operational set is flagged', () => {
  const rows = readFileSync(new URL('../training/eval/operational-ro.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const flagged = new Set();
  for (const r of rows) for (const w of left(r.message.replace(/"[^"]*"|„[^”]*”/g, ' '))) flagged.add(w.toLowerCase());
  // Words the set uses on purpose are quoted terms of the games (hangman letters, chess notation, ...); the list must stay tiny.
  assert.ok(flagged.size <= 12, `too many Romanian words flagged: ${[...flagged].join(', ')}`);
});

// ---- templates and compounds (items 2 and 4 and the most frequent replies that ended as the fixed fallback line)
const ro = (s) => tr.translate(s, { from: 'en', to: 'ro' });
const CASES = [
  ['a bar chart', 'Un grafic cu bare'],
  ['Here is a bar chart.', 'Aici este un grafic cu bare.'],
  ['the line chart', 'Graficul cu linii'],
  ['bar charts', 'Grafice cu bare'],
  ['Madrid and Rome are about 1,365 km (848 miles) apart, as the crow flies.', 'Madrid și Roma sunt la aproximativ 1.365 de km (848 de mile) distanță, în linie dreaptă.'],
  ['Paris and Rome are about 1,106 km (687 miles) apart, measured between their centres, as the crow flies.', 'Paris și Roma sunt la aproximativ 1.106 de km (687 de mile) distanță, măsurat între centrele lor, în linie dreaptă.'],
  ['There is no previous tab to go back to.', 'Nu există nicio filă anterioară la care să mă întorc.'],
  ['Plums is the biggest, with 8.', 'Cel mai mare: prune, cu 8.'],
  ['You are playing white, and I play black.', 'Tu joci cu albele, iar eu cu negrele.'],
  ['Romania borders 5 countries: Bulgaria, Hungary, Moldova, Serbia and Ukraine.', 'România se învecinează cu 5 țări: Bulgaria, Ungaria, Moldova, Serbia și Ucraina.'],
  ['I could not find "x y" in the document.', 'Nu am găsit „x y” în document.'],
  ['The major key with 4 sharps is E major (its relative minor is C# minor).', 'Tonalitatea majoră cu 4 diezi este E major (relativa ei minoră este C# minor).'],
  ['OK, I undid it: the list you added is gone.', 'Bine, am anulat: lista pe care ai adăugat-o a dispărut.'],
  ['You can say, for example: "Try the next mouth" or "Make your body lighter".', 'Poți spune, de exemplu: „Încearcă gura următoare” sau „Fă-ți corpul mai deschis la culoare”.'],
];
for (const [en, expected] of CASES) {
  test(`en->ro template: ${en.slice(0, 50)}`, async () => {
    const r = await ro(en);
    assert.equal(r.text, expected);
    assert.deepEqual(r.unknown, []);
  });
}

test('"înapoi" with no previous tab: a Romanian sentence, not word by word', async () => {
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../src/dialog/index.mjs');
  const { settingsForMode, sessionOptions } = await import('../src/dialog/runtime-config.mjs');
  for (const reasoner of ['matrix', 'ops']) {
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: tr, reasoner });
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'ro' }));
    const r = await s.send('înapoi', { language: 'ro' });
    assert.equal(r.text, 'Nu există nicio filă anterioară la care să mă întorc.', reasoner);
  }
});
