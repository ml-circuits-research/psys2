// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The request proposer in Node (Q48): loads the int8 ONNX export of training/psys2_train/request_proposer.py with onnxruntime-node and installs it on an engine
 * (`engine.proposer`), where the door uses it as one more candidate reading when PSYS2_PROPOSER=1 (src/dialog/proposer.mjs). The browser would pass onnxruntime-web
 * and fetched bytes to the same `createProposer`.
 *
 *   PSYS2_PROPOSER=1 [PSYS2_PROPOSER_DIR=<export dir>] [PSYS2_ORT=<onnxruntime-node entry>]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProposer } from '../../src/dialog/proposer.mjs';
import { createWordPieceTokenizer } from '../../src/formalizer/wordpiece.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_PROPOSER_DIR = resolve(REPO, 'training/runs/request-proposer/current');

export async function openProposer({ dir = process.env.PSYS2_PROPOSER_DIR ?? DEFAULT_PROPOSER_DIR, ortPath = process.env.PSYS2_ORT ?? null, threads = 1 } = {}) {
  if (!ortPath) throw new Error('the proposer needs onnxruntime-node: --ort <entry> or PSYS2_ORT');
  const model = resolve(dir, 'model.int8.onnx');
  if (!existsSync(model)) throw new Error(`no proposer model at ${model}`);
  const mod = await import(ortPath);
  const ort = mod.default ?? mod;
  const meta = { ...JSON.parse(readFileSync(resolve(dir, 'meta.json'), 'utf8')), threads };
  return createProposer({ ort, model, vocab: readFileSync(resolve(dir, 'vocab.txt'), 'utf8'), meta, tokenizer: createWordPieceTokenizer });
}

/** Installs the proposer on an engine when PSYS2_PROPOSER=1 (or `force`); returns it, or null. */
export async function installProposer(engine, opts = {}) {
  if (process.env.PSYS2_PROPOSER !== '1' && !opts.force) return null;
  const p = await openProposer(opts);
  engine.proposer = p;
  return p;
}
