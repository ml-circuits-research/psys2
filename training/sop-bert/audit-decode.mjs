// Exact-label replay of the frozen reader. These are gold logits, never model predictions.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canon, canonWant } from './upstream/docs/js/bench-canon.js';
import { nextContext } from './upstream/docs/js/vss-composer.js';

const [runtime, modelPath, workPath, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node audit-decode.mjs <transformers.node.mjs> <original-model-folder> <prepared-audit-folder> <output-prefix>');
const work = resolve(workPath), manifest = JSON.parse(readFileSync(new URL('provenance.json', import.meta.url)));
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const entry of manifest.files) if (hash(readFileSync(new URL(`upstream/${entry.path}`, import.meta.url))) !== entry.sha256) throw new Error(`Modified original source: ${entry.path}`);
for (const entry of manifest.externalModel.filter((r) => !r.path.endsWith('.onnx'))) {
  if (hash(readFileSync(resolve(modelPath, entry.path.split('docs/model/neural/sop-bert/')[1]))) !== entry.sha256) throw new Error(`Wrong tokenizer/config: ${entry.path}`);
}
const metadata = JSON.parse(readFileSync(resolve(work, 'audit-input.json'))), input = readFileSync(resolve(work, 'audit-input.jsonl'));
if (metadata.sourceCommit !== manifest.commit || hash(input) !== metadata.inputSHA256) throw new Error('Audit input provenance mismatch');
const messages = input.toString().trim().split('\n').map(JSON.parse);
const readerData = readFileSync(resolve(work, 'rows/reader.json'));
if (hash(readerData) !== metadata.readerSHA256) throw new Error('Generated label layout provenance mismatch');
const R = JSON.parse(readerData); R.max_length ||= 128;
const require = createRequire(import.meta.url), K = require('./upstream/docs/js/logic.js'); globalThis.SOPKit = K;
const NeuralKit = require('./upstream/docs/js/neural.js');
const T = await import(pathToFileURL(resolve(runtime)).href);
T.env.allowRemoteModels = false; T.env.allowLocalModels = true; T.env.useBrowserCache = false; T.env.localModelPath = dirname(resolve(modelPath)) + '/';
const rawTokenizer = await T.AutoTokenizer.from_pretrained(basename(resolve(modelPath)), { local_files_only: true });
const memo = new Map(), tokenizer = { encode(text, options) {
  const key = `${options?.add_special_tokens === false ? '0' : '1'}${text}`;
  if (!memo.has(key)) memo.set(key, rawTokenizer.encode(text, options));
  return memo.get(key);
}, model: rawTokenizer.model, unk_token_id: rawTokenizer.unk_token_id };
const positions = (text, limit) => {
  const words = NeuralKit.wordsOf(text), first = new Map(); let n = 1;
  for (let i = 0; i < words.length && n < limit - 1; i++) {
    const pieces = tokenizer.encode(words[i].w, { add_special_tokens: false });
    for (let j = 0; j < pieces.length && n < limit - 1; j++, n++) if (j === 0) first.set(i, n);
  }
  return { words, first };
};
const nA = R.acts.length, nT = R.tags.length, offsets = [];
let nS = nA; for (const [, values] of R.classes) { offsets.push(nS); nS += values.length; }
class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
let mode, current, activeRows;
const goldModel = async ({ input_ids }) => {
  const [batch, length] = input_ids.dims;
  const token = new Float32Array(batch * length * nT), sequence = new Float32Array(batch * nS), cut = new Float32Array(batch * length * 3);
  if (mode === 'cut') {
    const { first } = positions(current.text, R.cut.max_length);
    current.cut.forEach((tag, i) => { const p = first.get(i); if (p != null) cut[p * 3 + ['O', 'B', 'I'].indexOf(tag)] = 20; });
  } else {
    if (batch !== activeRows.length) throw new Error('Gold batch shape mismatch');
    activeRows.forEach((row, b) => {
      const { first } = positions(row.text, R.max_length);
      sequence[b * nS + R.acts.indexOf(row.act)] = 20;
      row.targets.forEach((value, head) => { sequence[b * nS + offsets[head] + value] = 20; });
      row.tags.forEach((tag, i) => { const p = first.get(i); if (p != null) token[(b * length + p) * nT + R.tags.indexOf(tag)] = 20; });
    });
  }
  return { token_logits: new Tensor('float32', token, [batch, length, nT]), seq_logits: new Tensor('float32', sequence, [batch, nS]), cut_logits: new Tensor('float32', cut, [batch, length, 3]) };
};
goldModel.config = { reader: R };
const models = Object.assign({ dtype: 'gold', device: 'none' }, NeuralKit.makeReader({ Tensor }, tokenizer, goldModel));
const readMany = models.readMany, cut = models.cut;
models.readMany = async (texts) => {
  if (texts.length !== activeRows.length || texts.some((text, i) => text !== activeRows[i].text.trim())) throw new Error('No exact gold row for unit; nearest-row substitution is forbidden');
  mode = 'read'; return readMany(texts);
};
const neural = NeuralKit.create(K.createSystem().engine, () => { throw new Error('Unexpected Rules fallback'); });
neural.setModels(models); neural.setStrategy('finetuned');
const counts = {}, causes = {}, fieldLosses = {}, duplicateHits = {};
writeFileSync(output + '.jsonl', '');
for (const message of messages) {
  current = message;
  const tally = counts[message.split] ||= { messages: 0, requests: 0, labelExact: 0, changed: 0, unsupported: 0, extraKeys: 0, cutExact: 0, cutDifferent: 0, wordpieceTruncatedRows: 0 };
  tally.messages++; tally.requests += message.wires.length;
  const occupied = [], units = [], issues = new Map(); activeRows = [];
  for (const row of message.rows) {
    if (row.issue) { issues.set(row.wire, row.issue); continue; }
    let start = -1;
    while ((start = message.text.indexOf(row.text, start + 1)) >= 0 && occupied.some(([a, b]) => start < b && start + row.text.length > a)) {}
    if (start < 0) { issues.set(row.wire, 'overlapping_or_unlocatable_span'); continue; }
    const words = NeuralKit.wordsOf(row.text).map((w) => w.w);
    if (JSON.stringify(words) !== JSON.stringify(row.words)) { issues.set(row.wire, 'word_segmentation_mismatch'); continue; }
    const end = start + row.text.length; occupied.push([start, end]); units.push({ c0: start, c1: end }); activeRows.push(row);
    if (positions(row.text, R.max_length).first.size < row.words.length) tally.wordpieceTruncatedRows++;
    R.classes.forEach(([key, values], i) => {
      const value = row.classes[key];
      if (value !== undefined && values.filter((v) => v === value).length > 1) duplicateHits[key] = (duplicateHits[key] || 0) + 1;
    });
  }
  mode = 'cut'; const cutUnits = await cut(message.text);
  const expectedUnits = units.map(({ c0, c1 }) => [c0, c1]).sort((a, b) => a[0] - b[0]);
  const actualUnits = cutUnits.map(({ c0, c1 }) => [c0, c1]);
  const cutExact = issues.size === 0 && JSON.stringify(expectedUnits) === JSON.stringify(actualUnits);
  tally[cutExact ? 'cutExact' : 'cutDifferent']++;
  const result = await neural.formalize(message.text, { names: [...(message.names || [])], last: [] }, { units, update: nextContext });
  const mains = result.nodes.filter((n) => n.type !== 'mention'), rows = [];
  for (const row of message.rows) {
    if (issues.has(row.wire)) {
      const issue = issues.get(row.wire); tally.unsupported++; causes[issue] = (causes[issue] || 0) + 1;
      rows.push({ wire: row.wire, status: 'unsupported', issue }); continue;
    }
    const index = activeRows.indexOf(row), unit = units[index];
    const node = mains.find((n) => n.span?.[0] === unit.c0 && n.span?.[1] === unit.c1);
    const wire = message.wires[row.wire], want = canonWant(wire.type, wire.args), got = node ? canon(node, result.nodes) : {};
    const differences = Object.entries(want).filter(([key, value]) => got[key] !== value).map(([key, value]) => ({ key, want: value, got: got[key] ?? null }));
    const extraKeys = Object.keys(got).filter((key) => !(key in want));
    const exact = !!node && node.type === wire.type && differences.length === 0 && extraKeys.length === 0;
    tally[exact ? 'labelExact' : 'changed']++; if (extraKeys.length) tally.extraKeys++;
    for (const { key } of differences) fieldLosses[key] = (fieldLosses[key] || 0) + 1;
    rows.push({ wire: row.wire, status: exact ? 'exact' : 'changed', want, got, differences, extraKeys });
  }
  appendFileSync(output + '.jsonl', JSON.stringify({ id: message.id, split: message.split, cutExact, expectedUnits, actualUnits, rows }) + '\n');
}
const report = { sourceCommit: manifest.commit, inputSHA256: metadata.inputSHA256, readerSHA256: metadata.readerSHA256,
  runtimeEntrySHA256: hash(readFileSync(runtime)), mode: 'gold labels through original loss targets and browser decoder; no learned inference',
  coverage: 'original train, historical heldout and sample; given gold spans isolate label/decode loss; cut tags audited separately',
  counts, causes, fieldLosses, duplicateClassValues: metadata.duplicateClassValues, duplicateValueRows: duplicateHits, explicitValuesEncodedAsAbsent: metadata.explicitValuesEncodedAsAbsent,
  gate: Object.values(counts).every((c) => c.changed === 0 && c.unsupported === 0 && c.cutDifferent === 0) ? 'pass' : 'fail' };
writeFileSync(output + '.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--require-exact') && report.gate !== 'pass') process.exitCode = 2;
