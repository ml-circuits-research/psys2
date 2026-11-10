/** Convert a pipeline record (nx-gen / nx-pipeline) to the NX1 record format (training/nx/README.md). */
import { createHash } from 'node:crypto';
import { askOf } from './nx-read.mjs';
import { statusOf, validateRecord } from './nx-format.mjs';

const STATUS_CONST_OK = (s) => s.span != null || s.key === 'seek';

export function toNx1(set, rec, { labeler, judge = null, split }) {
  const isQ = rec.op.startsWith('?');
  const type = isQ ? rec.op.slice(1) : null;
  const seek = isQ ? rec.slots.find((s) => s.key === 'seek')?.value : null;
  const op = isQ ? `question:${type}:${seek ?? 'value'}` : rec.op.includes('.') && !set.legends.types.has(rec.op) ? `request:${rec.op}` : rec.op;
  const slots = [];
  for (const s of rec.slots) {
    if (isQ && s.key === 'seek') continue;
    let key = s.key, ask = null, ask_source;
    if (s.key.startsWith('arg.')) { key = 'core.request.' + s.key; ask = `What is the ${s.key.slice(4)} of the ${rec.op} request?`; ask_source = 'synthesized'; }
    else if (isQ && s.key.startsWith(type + '.')) { key = 'core.question.where.' + s.key.slice(type.length + 1); ask = askOf(set, s.key); }
    else ask = askOf(set, s.key);
    const tag = key.startsWith('core.') ? `${rec.world}|${key}` : key;
    slots.push({ key, tag, ask, ...(ask_source ? { ask_source } : {}), span: s.span ?? null, text: s.text ?? null, value: s.value, span_source: s.span ? 'aligned' : 'none' });
  }
  // overlapping spans: the later one loses its span (the value stays, the BIO loss is masked for the record)
  const used = [];
  for (const s of slots) { if (!s.span) continue; if (used.some((u) => s.span[0] < u[1] && s.span[1] > u[0])) { s.span = null; s.text = null; s.span_source = 'none'; } else used.push(s.span); }
  const out = {
    id: 'nx-' + createHash('sha256').update(`${rec.world}\n${(rec.context ?? []).join('\n')}\n${rec.text}`).digest('hex').slice(0, 16),
    group: rec.group, split, world: rec.world, tab: rec.tab ?? null,
    context: { tab: rec.tab ?? null, recent: [rec.world], prev: rec.context ?? [] },
    message: rec.text, seg: [0, rec.text.length], text: rec.text, lang: rec.lang ?? 'en',
    ...(rec.orig ? { source_text: rec.orig } : {}),
    op, ops: [op], slots,
    label_source: 'llm', labeler, judge, status: 'complete', negative: false,
  };
  out.status = statusOf(out);
  out.problems = validateRecord(out);
  return out;
}
