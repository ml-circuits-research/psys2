// The grammar-path prototype (src/translate/grammar-ro.mjs): Romanian is read into a frame (act + roles) and the English is realised from it. Behind a flag, not the default.
// Romanian appears here only as DATA of the parallel corpus (AGENTS.md language rule).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRo, grammarRoEn } from '../src/translate/grammar-ro.mjs';

const CASES = [
  ['Desenează o casă roșie lângă un copac', 'draw a red house next to a tree.', 'make'],
  ['fă casa roșie', 'make the house red.', 'change.colour'],
  ['mută casa la stânga', 'move the house to the left.', 'move'],
  ['șterge casa', 'delete the house.', 'remove'],
  ['Care este capitala Franței?', 'what is the capital of France?', 'ask.capital'],
  ['Cât face 3 plus 4?', 'how much is 3 plus 4?', 'ask.sum'],
  ['câte picioare are un păianjen', 'how many legs does a spider have?', 'ask.count.has'],
  ['ce zi vine după luni', 'what day comes after Monday?', 'ask.sequence'],
  ['Fă-ți ochii și corpul albastre', 'make your eyes and your body blue.', 'change.colour'],
  ['Ana are 8 creioane. Ben îi dă Anei 6 creioane. Câte creioane are Ana?', 'Ana has 8 pencils. Ben gives Ana 6 pencils. how many pencils does Ana have?', 'story.has'],
];
for (const [ro, en, act] of CASES) {
  test(`grammar-ro reads "${ro}"`, () => {
    const r = grammarRoEn(ro);
    assert.equal(r.ok, true);
    assert.equal(r.text, en);
    assert.equal((Array.isArray(r.frame) ? r.frame[0] : r.frame).act, act);
  });
}
test('grammar-ro abstains outside its shapes instead of guessing', () => {
  for (const ro of ['', 'Ce frumos e afară astăzi', 'desenează ceva extraordinar de frumos pentru mine acum']) assert.equal(grammarRoEn(ro).ok, false);
  assert.equal(parseRo('Ce frumos e afară astăzi').frame, null);
});
test('grammar-ro: typed without diacritics gives the same reading', () => {
  assert.equal(grammarRoEn('deseneaza o casa rosie langa un copac').text, 'draw a red house next to a tree.');
  assert.equal(grammarRoEn('muta casa mai jos').text, 'move the house lower.');
});
