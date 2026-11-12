// The reader core over core.word facts (src/dialog/word-reader.mjs): frames per clause, split candidates that inherit the verb, score and veto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/vendor/sopworld/sopworld.mjs';
import { clausesOf, frameOf, readText, valueWords } from '../src/dialog/word-reader.mjs';

const shop = () => {
  const w = new World();
  w.load(`@k_item core.slot of=item key=name id=true
@k_line_item core.slot of=line key=item kind=ref to=item required=true
@k_line_qty core.slot of=line key=qty kind=integer min=1 default=1`);
  w.tell(`@pen item name=pen  @ink item name=ink
@w_buy core.word lang=en text=buy means=line
@w_two core.word lang=en text=two means=2 of=line.qty
@w_one core.word lang=en text=one means=1 of=line.qty`);
  w.tell(valueWords(['pen', 'ink'], 'item.name'));
  return w;
};

test('clauses: a message is split at the clause breaks', () => {
  assert.deepEqual(clausesOf('buy two pens, and one ink. Then a pad?'), [['buy', 'two', 'pens'], ['one', 'ink'], ['a', 'pad']]);
});

test('frames: the verb word, digits as numbers, function words dropped, a clause with no verb word gives loose words or arguments', () => {
  const w = shop();
  const words = w.words('en');
  assert.deepEqual(frameOf(['buy', 'the', '2', 'pens'], words), { lang: 'en', verb: 'buy', args: ['pens'], numbers: [2] });
  assert.deepEqual(frameOf(['pens', 'two'], words), { lang: 'en', words: ['pens', 'two'], numbers: [] });
  assert.deepEqual(frameOf(['one', 'ink'], words, 'en', { first: false }), { lang: 'en', args: ['one', 'ink'], numbers: [] });
});

test('the second clause takes the verb of the first (a split), the reading is scored and may be answered', () => {
  const w = shop();
  const r = readText(w, 'buy two pens and one ink');
  assert.ok(r.candidates.some((c) => c.parts?.length === 2), 'a split of two parts');
  assert.ok(r.top);
  assert.equal(r.veto.answer, true, r.veto.reasons?.map((x) => x.why).join('; '));
  assert.equal(w.has('new1'), false, 'nothing was told');
});

test('a message with a word nobody knows is not answered: the library says what it leaves out', () => {
  const w = shop();
  const r = readText(w, 'buy two pens and a sprocket');
  assert.equal(r.veto?.answer, false);
});
