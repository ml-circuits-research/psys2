#!/usr/bin/env node
/**
 * Bind an exported normalizer (python -m psys2_train.export_normalizer) to what it was trained against and accepted by (worker-tasks G4):
 * sha256 of the training pairs (dataset), of the rules (every file under worlds/ and src/legends), and of the acceptance policy
 * (the policy numbers plus src/dialog/value-check.mjs). Writes `policy`, `binding` and `version.metrics` into <dir>/meta.json.
 *
 *   node scripts/bind-normalizer-meta.mjs <export dir> [--metrics '<json>'] [--beam 3] [--min-score -0.3] [--strictness strict]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(process.argv[2] ?? '');
const opt = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const walk = (d) => readdirSync(d).sort().flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const hashFiles = (files) => { const h = createHash('sha256'); for (const f of files) { h.update(relative(REPO, f)); h.update('\0'); h.update(readFileSync(f)); h.update('\0'); } return h.digest('hex'); };

const policy = { normalizerBeam: +opt('--beam', 3), normalizerMinScore: +opt('--min-score', -0.3), valueStrictness: opt('--strictness', 'strict') };
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
meta.policy = policy;
meta.binding = {
  dataset_sha256: hashFiles(['train.jsonl', 'dev.jsonl'].map((f) => join(REPO, 'training/dataset-normalizer', f))),
  rules_sha256: hashFiles([...walk(join(REPO, 'worlds')), ...walk(join(REPO, 'src/legends'))].filter((f) => /\.(sop|mjs)$/.test(f))),
  acceptance_policy_sha256: createHash('sha256').update(JSON.stringify(policy)).update(readFileSync(join(REPO, 'src/dialog/value-check.mjs'))).digest('hex'),
  note: 'dataset = training/dataset-normalizer train+dev; rules = worlds/**/*.sop|mjs + src/legends; acceptance policy = policy numbers + src/dialog/value-check.mjs',
};
if (opt('--metrics')) meta.version.metrics = JSON.parse(opt('--metrics'));
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(JSON.stringify(meta.binding, null, 1));
