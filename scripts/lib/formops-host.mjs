// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Host side of the typed form operators (spec 16 section 11): learn them from training/eval/form-pairs.jsonl with the vendored library (`learnFormOperators({ world })`, the pairs lifted
 * through the typed world) and give the admitted ones to an engine (`engine.setFormOperators`) for the step behind PSYS2_FORMOPS=on. Node only (reads files); the step itself is src/dialog.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../cousins.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** A third of the pairs, by a stable hash of the variant, is held out (never learnt from). */
export const isHeldOut = (variant) => parseInt(createHash('sha1').update(variant).digest('hex').slice(0, 6), 16) % 3 === 0;
export const TYPED_FACTS = 'k.animals';

export function loadPairs({ source = 'all' } = {}) {
  const f = join(REPO, 'training/eval/form-pairs.jsonl');
  return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.same_meaning && (source === 'all' || r.source === source));
}

/** The typed world the operators are learnt and applied through: the catalog's schemas and shards of `facts` as one library World. */
export function typedWorld(lib, { catalog = join(REPO, 'tests/fixtures/catalog'), facts = TYPED_FACTS } = {}) {
  return buildWorld(lib, { catalog: resolve(catalog), facts });
}

/** Learn on the pairs outside the held-out third (or on all of them with `all: true`), check on the held-out third. Returns the library result and the split. */
export function learn(lib, world, pairs, { all = false } = {}) {
  const train = all ? pairs : pairs.filter((p) => !isHeldOut(p.variant)), held = pairs.filter((p) => isHeldOut(p.variant));
  return { result: lib.learnFormOperators(train, { heldOut: held, world }), train, held };
}

/** The filler words the inverse operators drop (0.91 `canonicalise`): the deleted words of the `filler` family of the atomic edits learnt on the training pairs (`learnFormEdits`), edits seen at least `min` times. */
export function learnFillers(lib, world, pairs, { all = false, min = 5 } = {}) {
  const train = all ? pairs : pairs.filter((p) => !isHeldOut(p.variant));
  const edits = lib.learnFormEdits(train, { world });
  return lib.fillersFrom({ operators: edits.operators.filter((o) => o.count >= min) });
}

/**
 * The engine given the typed operators when PSYS2_FORMOPS=on and the filler words of the inverse operators when PSYS2_CANON=on: PSYS2_FORMOPS_FILE (a JSON written by scripts/learn-operators.mjs
 * --ops-out) or, without it, learnt now from the pairs (PSYS2_FORMOPS_ALL=1 learns on all of them). Does nothing when neither switch is on.
 */
export async function installFormOperators(engine) {
  const ops = process.env.PSYS2_FORMOPS === 'on', canon = process.env.PSYS2_CANON === 'on';
  if (!ops && !canon) return null;
  const lib = engine.sopworld ?? await import('../../src/vendor/sopworld/sopworld.mjs');
  const world = typedWorld(lib, { catalog: process.env.PSYS2_FORMOPS_CATALOG ?? join(REPO, 'tests/fixtures/catalog') });
  const all = process.env.PSYS2_FORMOPS_ALL === '1', pairs = loadPairs();
  let operators = [], fillers = [];
  if (ops) {
    const file = process.env.PSYS2_FORMOPS_FILE;
    operators = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).operators : learn(lib, world, pairs, { all }).result.operators.filter((o) => o.admitted);
  }
  if (canon) fillers = learnFillers(lib, world, pairs, { all });
  const fo = { lib, world, operators, fillers };
  engine.setFormOperators(fo);
  return fo;
}
