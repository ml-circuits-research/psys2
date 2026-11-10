// SPDX-License-Identifier: AGPL-3.0-only
// The reasoner switch for command-line tools (spec 15): `--reasoner ops|matrix` (or `--reasoner=matrix`) sets PSYS2_REASONER, which
// createEngine reads (an explicit `options.reasoner` still wins). Without the flag the environment variable, then `ops`, applies.
// Call it before the engine is created. Worker threads inherit the environment, so sharded runs follow the switch too.
export function applyReasonerFlag(argv = process.argv) {
  const i = argv.indexOf('--reasoner');
  const v = i > 0 ? argv[i + 1] : argv.find((a) => a.startsWith('--reasoner='))?.slice('--reasoner='.length);
  if (v !== undefined) {
    if (v !== 'ops' && v !== 'matrix') throw new Error(`--reasoner expects ops or matrix, got "${v}"`);
    process.env.PSYS2_REASONER = v;
  }
  return process.env.PSYS2_REASONER === 'matrix' ? 'matrix' : 'ops';
}
