// SPDX-License-Identifier: AGPL-3.0-only
// NX5: the systems that are compared. A system name is `rules`, or `<model>-<mode>` with model A | Aplus | A3 | Aplus3 (export dir below) and
// mode only | first | hybrid:
//   rules          the rule formalizer in the shipped leniency settings (spellcheck, partial understanding, best effort), no model
//   X-only         the model's reading alone: a segment it cannot read is not understood (no rules retry, no rule-based leniency)
//   X-first        model first, the rules read what it could not (the engine's own retry, shipped leniency)
//   X-hybrid       D: the rules read first, the model reads only the segments the rules have no complete reading for; the validator checks both
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { createEngine } from '../../src/dialog/index.mjs';
import { createTranslator } from '../../src/translate/index.mjs';
import { settingsForMode } from '../../src/dialog/runtime-config.mjs';
import { loadNxModel, createNxFormalizer, wrapSessionHybrid } from './nx-formalizer.mjs';

export const EXPORTS = {
  A: '/home/salboaie/work/psys2/training/runs/export/nx-a-seed1',
  Aplus: '/home/salboaie/work/psys2/training/runs/export/nx-aplus-seed1',
  A3: '/home/salboaie/work/psys2/training/runs/export/nx-a-nx3',
  Aplus3: '/home/salboaie/work/psys2/training/runs/export/nx-aplus-nx3',
};

export async function buildSystem({ system, ortPath, threads = 1 }) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  if (system === 'rules') return { engine, settings: settingsForMode('rules'), stats: {} };
  const cut = system.lastIndexOf('-'); const which = system.slice(0, cut), mode = system.slice(cut + 1);
  const dir = EXPORTS[which] ?? which;
  if (!['only', 'first', 'hybrid'].includes(mode)) throw new Error(`system ${system}: mode must be only|first|hybrid`);
  const model = await loadNxModel({ ortPath, dir, threads });
  const stats = {};
  const rules = engine.formalizers.rules;
  const nx = createNxFormalizer({ model, mode: mode === 'hybrid' ? 'first' : mode, rules, stats });
  nx.attach(engine);
  engine.formalizers.encoder = nx;
  if (mode === 'hybrid') return { engine, settings: settingsForMode('rules'), stats, nx, wrap: (s) => wrapSessionHybrid(s, nx, stats) };
  let settings = { ...settingsForMode('encoder'), formalizer: 'encoder', normalizer: false };
  if (mode === 'only') {
    settings = { ...settings, spellcheck: false, partialUnderstanding: false, bestEffort: false };
    // the engine retries an unparsed segment with the rules (source = the message id); the probes of the pre-processing keep the rules
    engine.formalizers.rules = { ...rules, formalize: (t, o) => (o?.source === 'probe' || o?.source === 'dry' ? rules.formalize(t, o) : { segments: [{ text: t, span: [0, t.length], isQuestion: /\?\s*$/.test(t), worlds: [], routing: null, match: null, wires: [], unparsed: true, alternatives: [], errors: ['nx-only: no rules retry'] }], wires: [] }) };
  }
  return { engine, settings, stats, nx };
}
