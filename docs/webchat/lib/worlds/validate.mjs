/** Static validation of a loaded WorldSet (used by `test-world` and tests). Browser-safe. */
import { checkPattern } from '../formalizer/rules/index.mjs?v=d88531b8c2';

const STATUS = new Set(['supported', 'missing', 'conflicting', 'ambiguous', 'unsupported', 'budget', 'error']);
const MODES = new Set(['value', 'exists', 'list', 'count']);

/**
 * Check every world: parse/legend errors, wires against legends, patterns, operations,
 * templates and knowledge-base provenance.
 * @returns {string[]} human-readable problems (empty when the set is consistent)
 */
export function validateWorldSet(set) {
  const out = [];
  const L = set.legends;
  const loc = (e) => (e.source ? `${e.source}:${e.line ?? '?'}: ` : e.line ? `line ${e.line}: ` : '');
  for (const e of set.errors) out.push(e.message);
  for (const e of L.problems()) out.push(`legend: ${e.wireId ? e.wireId + ': ' : ''}${e.message}`);
  const all = new Map();
  for (const w of set.list()) for (const x of w.wires) all.set(x.id, x);
  const lookup = (id) => all.get(id);
  const ops = new Set(set.list().flatMap((w) => w.operations.map((o) => o.id)));
  const actions = new Set(set.list().flatMap((w) => w.operations.filter((o) => o.action).map((o) => o.action)));
  for (const w of set.list()) {
    for (const e of w.errors) out.push(`${w.id}: ${e.file ? e.file + ': ' : ''}${e.message}`);
    for (const x of w.wires) {
      for (const e of L.validateWire(x, { lookup })) out.push(`${w.id}: ${loc(e)}${x.id}: ${e.message}`);
    }
    for (const k of w.kbRaw) if (!k.entries.some((e) => e.key === 'core.source')) out.push(`${w.id}: kb wire '${k.id}' has no core.source`);
    for (const p of w.patterns) for (const m of checkPattern(p, set)) out.push(`${w.id}: ${m}`);
    for (const o of w.operations) {
      if (o.impl !== 'matrix' && typeof w.ops[o.impl] !== 'function') out.push(`${w.id}: operation ${o.id}: ops.mjs has no function '${o.impl}'`);
      if (!['query', 'compute', 'action'].includes(o.semantics)) out.push(`${w.id}: operation ${o.id}: unknown semantics '${o.semantics}'`);
      for (const k of [...o.outputs, ...o.inputs]) if (!L.keyInfo(k)) out.push(`${w.id}: operation ${o.id}: unknown key '${k}'`);
    }
    for (const t of w.templates) {
      if (!STATUS.has(t.status)) out.push(`${w.id}: template ${t.id}: unknown status '${t.status}'`);
      for (const c of t.when ?? []) if (!/^[A-Za-z_][\w.]*\s*(?:!=|>=|<=|=|>|<)\s*\S/.test(c)) out.push(`${w.id}: template ${t.id}: bad when '${c}'`);
      if (!MODES.has(t.mode)) out.push(`${w.id}: template ${t.id}: unknown mode '${t.mode}'`);
      const f = t.for ?? '';
      const known = f.startsWith('ack.') ? L.hasType(f.slice(4)) : f.startsWith('action.') ? actions.has(f.slice(7)) || ops.has(f.slice(7)) : !!L.keyInfo(f) || ops.has(f);
      if (!known) out.push(`${w.id}: template ${t.id}: 'for=${f}' matches no type, key, operation or action`);
      if ((t.text?.match(/\{/g) ?? []).length !== (t.text?.match(/\}/g) ?? []).length) out.push(`${w.id}: template ${t.id}: unbalanced braces`);
    }
  }
  return out;
}
