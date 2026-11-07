#!/usr/bin/env node
/**
 * Export encoder training records from the rule formalizer (ADR-001, spec 03 §6, vision §6).
 *
 * For every world that uses formalization=rules, the inputs of its tests and the examples of its
 * patterns are formalized; every matched pattern yields one record with the text, the typed
 * mentions, the key spans (from slot spans), the references and the expected circuit.
 * Label status is always `rule-derived`. Splits are assigned per source group (the world and
 * pattern), so paraphrases of one pattern never straddle train and dev.
 *
 * Usage: node scripts/export-training.mjs [--out training/data/rules.jsonl] [--dev 0.1] [--root worlds]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse, serialize } from '../src/soplang/index.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const roots = args.flatMap((a, i) => (a === '--root' ? [resolve(args[i + 1])] : []));
const out = resolve(opt('--out', 'training/data/rules.jsonl'));
const devShare = Number(opt('--dev', '0.1'));

const engine = await createEngine({ loader: createFsLoader(roots.length ? { roots } : {}) });

/** Map key -> slot name from an emit template such as "@{_} t.holding owner={who} count={n}". */
function keySlots(emit) {
  const map = {};
  for (const m of String(emit).matchAll(/([A-Za-z_][\w.-]*)=\{(\w+)\}/g)) map[m[1]] = m[2];
  return map;
}

function split(group) {
  const h = createHash('sha256').update(group).digest();
  return h.readUInt32BE(0) / 0xffffffff < devShare ? 'dev' : 'train';
}

const records = [];
for (const w of engine.worlds()) {
  const world = engine.set.list().find((x) => x.id === w.id);
  const texts = new Set();
  // Inputs: test inputs and pattern examples of the world.
  const wires = world ? world.wires : [];
  for (const wire of wires) {
    for (const e of wire.entries) {
      if ((wire.type === 'core.test' && e.key.endsWith('input')) || (wire.type === 'core.pattern' && e.key.endsWith('example'))) {
        if (e.value.kind === 'string') texts.add(e.value.v);
      }
    }
  }
  if (!texts.size) continue;
  const patterns = new Map(wires.filter((x) => x.type === 'core.pattern').map((p) => [p.id, p]));
  for (const text of texts) {
    const session = engine.createSession({ language: 'en' });
    const reply = await session.send(text);
    for (const seg of reply.segments || []) {
      if (!seg.match) continue;
      const pat = patterns.get(seg.match.patternId);
      const emit = pat?.entries.find((e) => e.key.endsWith('emit'))?.value.v || '';
      const slotOf = keySlots(emit);
      const segWires = (seg.wires || []).filter((x) => x.type !== 'core.agent');
      const keys = [];
      const refs = [];
      for (const sw of segWires) {
        for (const [short, slot] of Object.entries(slotOf)) {
          const s = seg.match.slots[slot];
          if (!s) continue;
          const entry = sw.entries.find((e) => e.key === short || e.key.endsWith('.' + short));
          if (!entry) continue;
          keys.push({ wire: sw.id, key: entry.key, span: s.span, text: s.text, value: s.value });
          if (entry.value.kind === 'ref') refs.push({ wire: sw.id, key: entry.key, target: entry.value.v, span: s.span });
        }
      }
      const spans = keys.map((k) => k.span);
      const group = `${seg.match.worldId}/${seg.match.patternId}`;
      records.push({
        example_id: createHash('sha256').update(group + '\n' + text + '\n' + seg.span.join('-')).digest('hex').slice(0, 16),
        lineage: { kind: 'rule-derived', world: seg.match.worldId, pattern: seg.match.patternId },
        source_group: group,
        language: 'en',
        text: seg.text,
        context: text,
        segment_span: seg.span,
        mentions: segWires.map((x) => ({ wire: x.id, type: x.type, span: spans.length ? [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))] : seg.span })),
        keys,
        references: refs,
        kind: seg.match.kind,
        expected_circuit: serialize(segWires),
        label_status: 'rule-derived',
        split: split(group),
      });
    }
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
const dev = records.filter((r) => r.split === 'dev').length;
console.log(`wrote ${records.length} records (${records.length - dev} train, ${dev} dev) to ${out}`);
void parse;
