#!/usr/bin/env node
// Checks that the JS dispatcher runtime (src/formalizer/dispatcher-runtime.mjs + wordpiece.mjs) reproduces the Python predictions.
//
//   node scripts/verify-dispatcher-js.mjs --export training/runs/export/dispatcher-distilbert --ort <path to an onnxruntime-node or onnxruntime-web module>
//        [--ref <export>/reference.jsonl] [--model model.int8.onnx] [--against int8|fp32|torch]
//
// The reference file comes from `python -m psys2_train.dump_dispatch_reference --ckpt <ckpt> --export <export>`.
// onnxruntime is NOT a dependency of the repository: install it in a scratch directory (`npm i onnxruntime-node`) and pass the path of its
// entry (for example /scratch/node_modules/onnxruntime-node/dist/index.js).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWordPieceTokenizer } from '../src/formalizer/wordpiece.mjs';
import { createDispatcherRuntime } from '../src/formalizer/dispatcher-runtime.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dir = path.resolve(arg('export', 'training/runs/export/dispatcher-distilbert'));
const modelFile = arg('model', 'model.int8.onnx');
const against = arg('against', modelFile.includes('int8') ? 'int8' : 'fp32');
const ortPath = arg('ort');
if (!ortPath) { console.error('--ort <path to onnxruntime-node/web entry> is required'); process.exit(2); }
const ortMod = await import(pathToFileURL(path.resolve(ortPath)).href);
const ort = ortMod.InferenceSession ? ortMod : ortMod.default;
const session = await ort.InferenceSession.create(path.join(dir, modelFile));
const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
const tokenizer = createWordPieceTokenizer(await readFile(path.join(dir, 'tokenizer/vocab.txt'), 'utf8'));
const rt = createDispatcherRuntime({ ort, session, tokenizer, worlds: meta.worlds, useContext: meta.context });
const ref = (await readFile(path.resolve(arg('ref', path.join(dir, 'reference.jsonl'))), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));

let n = 0, segSame = 0, topSame = 0, worldsSame = 0, worldsN = 0, maxScore = 0, maxP = 0;
const bad = [];
for (const r of ref) {
  const pred = await rt.predict(r.text, r.context);
  const want = r[against];
  n++;
  const spans = (x) => JSON.stringify(x.map((g) => g.segments.map((s) => [s.start, s.end])));
  const sameSegs = spans(pred.segmentations) === spans(want);
  segSame += sameSegs; topSame += JSON.stringify(pred.segmentations[0]?.segments.map((s) => [s.start, s.end])) === JSON.stringify(want[0].segments.map((s) => [s.start, s.end]));
  if (!sameSegs) bad.push({ text: r.text, js: spans(pred.segmentations), py: spans(want) });
  if (sameSegs) {
    pred.segmentations.forEach((g, gi) => {
      maxScore = Math.max(maxScore, Math.abs(g.score - want[gi].score));
      g.segments.forEach((s, si) => {
        const w = want[gi].segments[si].worlds;
        worldsN++; worldsSame += JSON.stringify(s.worlds.map((x) => x.world)) === JSON.stringify(w.map((x) => x.world));
        s.worlds.forEach((x, k) => { maxP = Math.max(maxP, Math.abs(x.score - w[k].score)); });
      });
    });
  }
}
const res = { model: modelFile, against, items: n, segmentationsIdentical: segSame / n, topSegmentationIdentical: topSame / n, worldTop3Identical: worldsN ? worldsSame / worldsN : null, maxAbsLogScoreDiff: maxScore, maxAbsWorldProbDiff: maxP, mismatches: bad.slice(0, 5) };
console.log(JSON.stringify(res, null, 1));
process.exit(segSame === n && worldsSame === worldsN ? 0 : 1);
