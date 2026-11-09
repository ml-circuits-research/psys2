#!/usr/bin/env node
/**
 * NX2: training/nx/gold/real-50.json = Sonnet's pilot labels of the 50 real phrases, each checked by hand against its
 * expectation line (training/eval/expectations-*), with the corrections below applied (the reviewer's check, 2026-11-09).
 *   node scripts/build-nx-real50.mjs     (needs the pilot outputs in training/dataset/nx/pilot/out/sonnet)
 */
import { readFileSync, writeFileSync } from 'node:fs';
const REPO = new URL('..', import.meta.url).pathname;
const D = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '') + 'training/dataset/nx/pilot';
const real = JSON.parse(readFileSync(REPO + 'training/nx/gold/real-50-candidates.json', 'utf8'));
const byId = new Map(real.map((r) => [r.id, r]));
const slot = (key, value, text = null) => ({ key, span: null, text, value });
// corrections after the hand check against the expectation lines: id -> { op, slots } (null = keep Sonnet's label)
const FIX = {
  'real#rp4-03': { op: 'diagram.create', slots: [slot('arg.text', 'add to the diagram a tree like shape')] },     // a tree template is created, not a new empty diagram
  'real#rp3-09': { op: 'doc.newBlank', slots: [slot('arg.kind', 'paragraph', 'paragraph')] },                      // voice garble add -> are
  'real#rp3-10': { op: 'doc.newBlank', slots: [slot('arg.kind', 'chapter', 'chapter')] },
  'real#rp3-11': { op: null, slots: [] },                                                                           // a sound-alike: the system asks, no confident op
  'real#rp3-17': { op: 'music.replay', slots: [] },                                                                 // plays the selected / last song, not "what should I play"
  'real#rp5-04': { op: 'avatar.setMood', slots: [slot('arg.mood', 'angry', 'Be nervos')] },                        // fii nervos = angry
  'real#rp5-10': { op: 'draw.add', slots: [slot('arg.kind', 'sun'), slot('arg.kt', 'sun')] },                       // 'salt' is a garbled 'sun'
  'real#rp5-12': { op: 'draw.add', slots: [slot('arg.kind', 'line'), slot('arg.kt', 'line')] },
  'real#rp5-14': { op: 'draw.move', slots: [slot('arg.phrase', 'the fish into the water')] },
};
const out = [];
for (const f of readdirSyncSafe()) {
  const arr = JSON.parse(readFileSync(`${D}/out/sonnet/${f}`, 'utf8'));
  const b = JSON.parse(readFileSync(D + '/batches-all.json', 'utf8')).find((x) => `${x.batch_id}.json` === f);
  b.ids.forEach((id, k) => {
    if (!id.startsWith('real#')) return;
    const r = byId.get(id); const o = arr[k];
    const fx = FIX[id];
    out.push({ id, subset: 'real', world: r.world, tab: r.tab, context: r.context, text: r.text, op: fx ? fx.op : o.op,
      slots: fx ? fx.slots : (o.slots ?? []).map((s) => ({ key: s.key.replace(/^core\.request\./, ''), span: null, text: s.text, value: s.value })),
      source: fx ? 'sonnet+hand-fix' : 'sonnet+hand-checked', expect: r.expect });
  });
}
function readdirSyncSafe() { return JSON.parse(readFileSync(D + '/batches-all.json', 'utf8')).map((b) => `${b.batch_id}.json`); }
writeFileSync(REPO + 'training/nx/gold/real-50.json', JSON.stringify(out, null, 1));
console.log(out.length, 'real items,', Object.keys(FIX).length, 'corrected');
