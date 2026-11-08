import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWordPieceTokenizerFromMap, createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';

const fx = JSON.parse(await readFile(new URL('./fixtures/wordpiece-distilbert.json', import.meta.url), 'utf8'));
const tk = createWordPieceTokenizerFromMap(fx.vocab);

test('wordpiece: token ids equal the Python (HF) tokenizer on the fixture', () => {
  assert.ok(fx.cases.length >= 190);
  const bad = [];
  for (const c of fx.cases) {
    const { ids } = tk.encode(c.text, { maxLength: fx.max_length });
    if (JSON.stringify(ids) !== JSON.stringify(c.ids)) bad.push({ text: c.text.slice(0, 60), got: ids.slice(0, 12), want: c.ids.slice(0, 12) });
  }
  assert.deepEqual(bad, []);
});

test('wordpiece: character offsets equal the Python offsets (text in the BMP)', () => {
  const bad = [];
  for (const c of fx.cases) {
    if ([...c.text].length !== c.text.length) continue;   // astral characters: UTF-16 offsets differ from code points
    const { offsets } = tk.encode(c.text, { maxLength: fx.max_length });
    if (JSON.stringify(offsets) !== JSON.stringify(c.offsets)) bad.push({ text: c.text.slice(0, 60), got: offsets.slice(0, 8), want: c.offsets.slice(0, 8) });
  }
  assert.deepEqual(bad, []);
});

test('wordpiece: vocab.txt parsing, truncation and unknown words', () => {
  const t = createWordPieceTokenizer(['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'un', '##affable', 'hello', ',', 'a'].join('\n') + '\n');
  assert.deepEqual(t.encode('Hello, unaffable').ids, [2, 6, 7, 4, 5, 3]);
  assert.deepEqual(t.encode('zzz hello').ids, [2, 1, 6, 3]);
  assert.deepEqual(t.encode('hello hello hello', { maxLength: 4 }).ids, [2, 6, 6, 3]);
  assert.deepEqual(t.encode('').ids, [2, 3]);
});
