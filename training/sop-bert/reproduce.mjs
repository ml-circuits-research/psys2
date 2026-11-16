// Historical evaluation only: unchanged diagram reader, model, gold and pairing.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { outcomes } from './historical-outcomes.mjs';
import { nextContext } from './upstream/docs/js/vss-composer.js';

const [runtime, modelPath, dataPath, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node reproduce.mjs <transformers.node.mjs> <model-folder> <heldout.jsonl> <output-prefix>');
const manifest = JSON.parse(readFileSync(new URL('provenance.json', import.meta.url)));
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const record of manifest.files) {
  const data = readFileSync(new URL(`upstream/${record.path}`, import.meta.url));
  if (hash(data) !== record.sha256) throw new Error(`Modified original source: ${record.path}`);
}
for (const record of manifest.externalModel) {
  const path = resolve(modelPath, record.path.split('docs/model/neural/sop-bert/')[1]);
  if (hash(readFileSync(path)) !== record.sha256) throw new Error(`Wrong model artifact: ${record.path}`);
}
const split = JSON.parse(readFileSync(resolve(dirname(dataPath), 'split.json')));
const data = readFileSync(dataPath);
if (split.sourceCommit !== manifest.commit || hash(data) !== split.heldoutSHA256) throw new Error('Held-out provenance mismatch');
const rows = data.toString().trim().split('\n').map(JSON.parse);
if (rows.length !== 585 || rows.reduce((n, r) => n + r.wires.length, 0) !== 1711 || new Set(rows.map((r) => r.id)).size !== rows.length)
  throw new Error('Historical evaluation population mismatch');
const require = createRequire(import.meta.url);
const K = require('./upstream/docs/js/logic.js'); globalThis.SOPKit = K;
const NeuralKit = require('./upstream/docs/js/neural.js');
const T = await import(pathToFileURL(resolve(runtime)).href);
T.env.allowLocalModels = true; T.env.allowRemoteModels = false; T.env.useBrowserCache = false;
T.env.localModelPath = dirname(resolve(modelPath)) + '/';
const name = basename(resolve(modelPath));
const tokenizer = await T.AutoTokenizer.from_pretrained(name, { local_files_only: true });
const model = await T.AutoModel.from_pretrained(name, { device: 'cpu', dtype: 'q8', local_files_only: true, session_options: { intraOpNumThreads: 4 } });
const models = Object.assign({ device: 'cpu', dtype: 'q8', enumModel: name, qaModel: name }, NeuralKit.makeReader(T, tokenizer, model));
const neural = NeuralKit.create(K.createSystem().engine, () => { throw new Error('Unexpected Rules fallback'); });
neural.setModels(models); neural.setStrategy('finetuned');
const counts = { messages: 0, requested: 0, right: 0, wrong: 0, notDone: 0, extra: 0 };
writeFileSync(output + '.jsonl', '');
const start = performance.now();
try {
  for (const row of rows) {
    const context = { names: (row.names || []).slice(), last: [], spans: row.wires.every((w) => w.span) ? row.wires.map((w) => w.span) : null };
    const result = await neural.formalize(row.text, context, { update: nextContext });
    const sources = new Map(result.analyses.map((a) => [a.id, a.src]));
    for (const node of result.nodes) if (node.type !== 'mention' && sources.has(node.id)) Object.defineProperty(node, 'src', { value: sources.get(node.id), enumerable: false });
    const scored = outcomes(result.nodes, row);
    const one = { id: row.id, requested: row.wires.length, right: scored.res.filter((s) => s === 'right').length,
      wrong: scored.res.filter((s) => s === 'wrong').length, extra: scored.res.filter((s) => s === 'extra').length };
    one.notDone = one.requested - one.right - one.wrong;
    appendFileSync(output + '.jsonl', JSON.stringify({ ...one, outcomes: scored.res, readings: scored.mains.map((x) => ({ act: x.act, got: x.got })) }) + '\n');
    counts.messages++; for (const key of ['requested', 'right', 'wrong', 'notDone', 'extra']) counts[key] += one[key];
    if (counts.messages % 50 === 0) console.error(`${counts.messages}/${rows.length} messages`);
  }
} finally { await model.dispose(); }
const result = { sourceCommit: manifest.commit, modelSHA256: manifest.externalModel.find((r) => r.path.endsWith('.onnx')).sha256,
  heldoutSHA256: split.heldoutSHA256, node: process.version, architecture: process.arch, runtimeEntrySHA256: hash(readFileSync(runtime)),
  seconds: (performance.now() - start) / 1000, counts,
  rightPercent: counts.right / counts.requested * 100, wrongPercent: counts.wrong / counts.requested * 100,
  notDonePercent: counts.notDone / counts.requested * 100, extraPer100: counts.extra / counts.requested * 100,
  executionPrecision: counts.right / (counts.right + counts.wrong + counts.extra) * 100,
  historicalReportedRightPercent: 83.8, reproducedToReportedPrecision: (counts.right / counts.requested * 100).toFixed(1) === '83.8',
  threshold: null, scope: 'historical execute-all reproduction; no threshold fitting, no new-path acceptance' };
writeFileSync(output + '.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
