import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcherRuntime, candidateSegmentations, segmentsFromStarts, trimSegment, tokenInfo, routingText } from '../src/formalizer/dispatcher-runtime.mjs';
import { createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';

const VOCAB = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'add', 'milk', 'and', 'open', 'the', 'map', ',', 'tab', 'none', ';', ':', 'recent', 'a', 'b'];
const tk = createWordPieceTokenizer(VOCAB.join('\n') + '\n');
const WORLDS = ['kids.shop', 'geo.map', 'ui.shell'];

/** Fake onnxruntime: Tensor holds data; the session answers from scripted rules over the token ids. */
class Tensor { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } }
const ort = { Tensor };
const fakeSession = (segRule, worldRule) => ({
  calls: [],
  async run(feeds) {
    const ids = Array.from(feeds.input_ids.data, Number);
    this.calls.push(ids);
    const t = ids.length;
    const seg = new Float32Array(t * 2);
    for (let i = 0; i < t; i++) { const p = segRule(ids, i); seg[2 * i] = Math.log(1 - p); seg[2 * i + 1] = Math.log(p); }
    return { seg_logits: new Tensor('float32', seg, [1, t, 2]), world_logits: new Tensor('float32', Float32Array.from(worldRule(ids)), [1, WORLDS.length]) };
  },
});
const AND = VOCAB.indexOf('and'), OPEN = VOCAB.indexOf('open'), MAP = VOCAB.indexOf('map'), MILK = VOCAB.indexOf('milk');

test('trimSegment strips joiners and keeps a joiner-only segment', () => {
  assert.deepEqual(trimSegment('x and y', 1, 7), [6, 7]);
  assert.deepEqual(trimSegment('add milk, then', 0, 14), [0, 8]);
  assert.deepEqual(trimSegment('and', 0, 3), [0, 3]);
  assert.deepEqual(trimSegment('then, open', 0, 10), [6, 10]);
});

test('segmentsFromStarts trims blanks and joiners', () => {
  const t = 'add milk and open the map';
  assert.deepEqual(segmentsFromStarts(t, [0, 9]).map(([a, b]) => t.slice(a, b)), ['add milk', 'open the map']);
  assert.deepEqual(segmentsFromStarts(t, [0, 9, 9, 0]).length, 2);
});

test('candidateSegmentations: argmax first, flips of uncertain boundaries as alternatives, scores are log-probs', () => {
  const t = 'add milk and open the map';
  const enc = tk.encode(t);
  const probs = enc.ids.map((_, i) => (enc.tokens[i] === 'and' ? 0.9 : enc.tokens[i] === 'open' ? 0.4 : 0.01));
  const c = candidateSegmentations(t, enc.offsets, probs);
  assert.ok(c.length >= 2 && c.length <= 4);
  assert.deepEqual(c[0].segments.map(([a, b]) => t.slice(a, b)), ['add milk', 'open the map']); 
  assert.ok(c[0].score <= 0 && c[0].score >= c[1].score);
  assert.equal(new Set(c.map((x) => JSON.stringify(x.segments))).size, c.length);   // deduplicated
  assert.deepEqual(candidateSegmentations('', [[0, 0]], [0.5]).map((x) => x.segments), [[]]);
});

test('routingText mirrors data.routing_text', () => {
  assert.equal(routingText('hi', { tab: 'map', recent_worlds: ['a.b', 'c.d'] }), 'tab: map ; recent: a.b c.d ;; hi');
  assert.equal(routingText('hi', {}), 'tab: none ; recent: none ;; hi');
});

test('predict: segmentation beam + top-3 worlds as softmax probabilities, one world pass per distinct segment', async () => {
  const session = fakeSession(
    (ids, i) => (ids[i] === AND ? 0.95 : 0.02),
    (ids) => { const body = ids.slice(ids.indexOf(2) + 1); return body.includes(MAP) ? [0, 3, 0] : body.includes(MILK) ? [4, 0, 1] : [0, 1, 2]; });
  const rt = createDispatcherRuntime({ ort, session, tokenizer: tk, worlds: WORLDS });
  const text = 'add milk and open the map';
  const pred = await rt.predict(text, { tab: 'robot', recent_worlds: ['kids.shop'] });
  assert.equal(pred.text, text);
  assert.deepEqual(pred.context, { tab: 'robot', recent_worlds: ['kids.shop'], session: [] });
  const top = pred.segmentations[0];
  assert.deepEqual(top.segments.map((s) => s.text), ['add milk', 'open the map']);
  assert.ok(top.score <= 0 && Number.isFinite(top.score));
  assert.deepEqual(top.segments.map((s) => s.worlds[0].world), ['kids.shop', 'geo.map']);
  for (const s of top.segments) {
    assert.equal(s.worlds.length, 3);
    assert.ok(Math.abs(s.worlds.reduce((a, w) => a + w.score, 0) - 1) < 1e-6);
    assert.ok(s.worlds[0].score >= s.worlds[1].score && s.worlds[1].score >= s.worlds[2].score);
    assert.equal(text.slice(s.start, s.end), s.text);
  }
  assert.ok(pred.segmentations.length <= 4);
  assert.ok(pred.boundaries.some((b) => b.offset === 9 && b.p > 0.9));
  // world passes use the routing input with the context
  const worldCalls = session.calls.filter((ids) => ids.includes(VOCAB.indexOf('recent')));
  assert.ok(worldCalls.length >= 2);
  const before = session.calls.length;
  await rt.predict(text, { tab: 'robot', recent_worlds: ['kids.shop'] });
  assert.equal(session.calls.length - before, 1, 'second identical request: only the segmentation pass, world scores come from the cache');
});

test('createDispatcherRuntime validates its arguments', () => {
  assert.throws(() => createDispatcherRuntime({ ort, session: {}, tokenizer: tk, worlds: WORLDS }));
});
