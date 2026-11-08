import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wordsOf, applyEditTags, simplifiedText } from '../src/formalizer/edit-tags.mjs';
import { createDispatcherRuntime, wordTokens, decodeEditTags } from '../src/formalizer/dispatcher-runtime.mjs';
import { createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';
import { alignTags } from '../scripts/build-edit-tags.mjs';

test('wordsOf: letters and digits with inner apostrophes, every other character is a word', () => {
  assert.deepEqual(wordsOf("what's the tempo?").map((x) => x.w), ["what's", 'the', 'tempo', '?']);
  assert.deepEqual(wordsOf('e2e4, ok!').map((x) => [x.w, x.start, x.end]), [['e2e4', 0, 4], [',', 4, 5], ['ok', 6, 8], ['!', 8, 9]]);
});

test('applyEditTags: KEEP / DELETE / R / P / A, original spacing kept, punctuation glued on append', () => {
  const t = 'um whats the tempo';
  const w = wordsOf(t);
  assert.equal(applyEditTags(t, w, ['DELETE', 'R:what is', 'KEEP', 'A:?']), 'what is the tempo?');
  assert.equal(applyEditTags('tempo', wordsOf('tempo'), ['P:what is']), 'what is tempo');
  assert.equal(applyEditTags('five apples', wordsOf('five apples'), ['R:5', 'KEEP']), '5 apples');
  assert.equal(applyEditTags('a b', wordsOf('a b'), ['KEEP', 'A:the']), 'a b the');
  assert.equal(simplifiedText('hello', wordsOf('hello'), ['KEEP']), null);
  assert.equal(simplifiedText('um ok', wordsOf('um ok'), ['DELETE', 'DELETE']), null, 'deleting everything is not a rewrite');
  assert.equal(simplifiedText('  hello ', wordsOf('  hello '), ['KEEP']), null);
});

test('JS edit tags reproduce the Python implementation (fixture written by psys2_train/edit.py)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/edit-tags-python.json', import.meta.url), 'utf8'));
  assert.ok(fx.length > 30);
  for (const f of fx) {
    const w = wordsOf(f.text);
    assert.deepEqual(w.map((x) => [x.w, x.start, x.end]), f.words, f.text);
    assert.equal(applyEditTags(f.text, w, f.tags), f.rewrite, f.text);
    assert.equal(simplifiedText(f.text, w, f.tags), f.simplified, f.text);
  }
});

test('alignTags: deletions, insertions and replacements become tags', () => {
  const a = wordsOf('pls whats the tempo'), b = wordsOf('what is the tempo ?');
  const al = alignTags(a, b, (s, t) => s === 'whats' && t === 'what', (w) => w === 'is' || w === '?');
  assert.deepEqual(al.tags, ['DELETE', 'R:what is', 'KEEP', 'A:?']);
  assert.equal(applyEditTags('pls whats the tempo', a, al.tags), 'what is the tempo?');
});

// ---- runtime with a fake session ------------------------------------------------------------------------------------
const VOCAB = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'um', 'whats', 'the', 'tempo', '?', 'tab', 'none', ';', ':', 'recent', 'a', 'what', 'is'];
const tk = createWordPieceTokenizer(VOCAB.join('\n') + '\n');
const WORLDS = ['media.music', 'ui.shell'];
const EDIT_TAGS = ['KEEP', 'DELETE', 'R:what is', 'A:?'];
class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }
const ort = { Tensor };
/** Fake model: world 0 always; edit tags by token id: um -> DELETE, whats -> R:what is, tempo -> A:? (only inside the segment after ';;'). */
const session = {
  async run(feeds) {
    const ids = Array.from(feeds.input_ids.data, Number), t = ids.length, K = EDIT_TAGS.length;
    const seg = new Float32Array(t * 2).fill(0);
    for (let i = 0; i < t; i++) seg[2 * i] = 5;
    const edit = new Float32Array(t * K);
    for (let i = 0; i < t; i++) { edit[i * K] = 1; const id = ids[i]; if (id === 4) edit[i * K + 1] = 5; if (id === 5) edit[i * K + 2] = 5; if (id === 7) edit[i * K + 3] = 5; }
    return { seg_logits: new Tensor('float32', seg, [1, t, 2]), world_logits: new Tensor('float32', Float32Array.from([2, 0]), [1, 2]), edit_logits: new Tensor('float32', edit, [1, t, K]) };
  },
};

test('wordTokens: first token of each word of the piece (prefix skipped), null when truncated', () => {
  const text = 'um whats';
  const input = `tab: none ; recent: none ;; ${text}`;
  const enc = tk.encode(input);
  const wt = wordTokens(enc.offsets, input.length - text.length, wordsOf(text));
  assert.deepEqual(wt.map((i) => enc.tokens[i]), ['um', 'whats']);
  const cut = tk.encode(input, { maxLength: 12 });
  assert.equal(wordTokens(cut.offsets, input.length - text.length, wordsOf(text)).at(-1), null);
});

test('runtime: with editTags the segment carries `simplified` (only when it differs); without them nothing changes', async () => {
  const rt = createDispatcherRuntime({ ort, session, tokenizer: tk, worlds: WORLDS, editTags: EDIT_TAGS });
  const pred = await rt.predict('um whats the tempo', { tab: 'music' });
  assert.equal(pred.segmentations[0].segments[0].simplified, 'what is the tempo?');
  const clean = await rt.predict('the tempo', { tab: 'music' });
  assert.equal(clean.segmentations[0].segments[0].simplified, 'the tempo?');   // fake model appends "?" after tempo
  const noEdit = createDispatcherRuntime({ ort, session, tokenizer: tk, worlds: WORLDS });
  const p2 = await noEdit.predict('um whats the tempo', { tab: 'music' });
  assert.equal('simplified' in p2.segmentations[0].segments[0], false);
  const d = decodeEditTags('um whats', 'tab: none ; recent: none ;; '.length, tk.encode('tab: none ; recent: none ;; um whats').offsets, new Float32Array(0), 4, EDIT_TAGS);
  assert.deepEqual(d.tags, ['KEEP', 'KEEP'], 'without scores the first tag (KEEP) wins');
});
