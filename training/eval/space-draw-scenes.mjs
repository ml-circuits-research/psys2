// SPDX-License-Identifier: AGPL-3.0-only
// SPACE-2 E-S1 / E-S2 on the drawing host: 30 scripted scenes of 7 turns through the real dialog engine (add, add, add, relation, move, relation, move); counts the turns that leave an
// unwanted overlap (more than 15 % of the smaller box, not a region, not a related pair when the build keeps relation facts) or an object outside the canvas, and the mean displacement of the
// objects a turn did not mention. Uses only the engine and art.draw's public exports, so it also runs on an older build (the baseline).
import * as draw from '../../worlds/art.draw/ops.mjs';
import { settingsForMode, sessionOptions } from '../../src/dialog/runtime-config.mjs';
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KIND_WORDS = ['house', 'tree', 'sun', 'cat', 'dog', 'car', 'flower', 'bird', 'boat', 'cloud'];
const drawState = (s) => s.state()['art.draw'];
/** Unwanted overlaps among the drawing's objects: more than 15 % of the smaller box, not a region, not a related pair (on / in / attached / in front / behind facts, when the build has them). */
function drawOverlaps(st) {
  const facts = st.rels?.facts ?? [], objs = st.objects.filter((o) => !draw.KINDS[o.kind === 'composite' ? 'composite' : o.kind]?.region);
  const bb = objs.map((o) => ({ o, b: draw.bbox(o) }));
  let n = 0;
  for (let i = 0; i < bb.length; i++) for (let j = i + 1; j < bb.length; j++) {
    const a = bb[i].b, b = bb[j].b, w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (w <= 0 || h <= 0 || (w * h) / Math.min(a.w * a.h, b.w * b.h) <= 0.15) continue;
    const idA = bb[i].o.id, idB = bb[j].o.id;
    if (facts.some((f) => ((f.a === idA && f.b === idB) || (f.a === idB && f.b === idA)) && ['on', 'in', 'attached_to', 'in_front_of', 'behind'].includes(f.rel))) continue;
    n++;
  }
  return n;
}
const drawEscapes = (st) => st.objects.filter((o) => { const b = draw.bbox(o); return b.x0 < -2 || b.y0 < -2 || b.x1 > draw.W + 2 || b.y1 > draw.H + 2; }).length;

export async function drawScenes({ engine, seed = 20261115, scenes = 30 }) {
  const R = rng(seed);
  let turns = 0, withOverlap = 0, withEscape = 0, dispSum = 0, dispN = 0, unchanged = 0;
  for (let sc = 0; sc < scenes; sc++) {
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: 'draw' }); const kinds = [...KIND_WORDS].sort(() => R() - 0.5).slice(0, 3);
    const script = [`draw a ${kinds[0]}`, `draw a ${kinds[1]}`, `draw a ${kinds[2]}`, `put the ${kinds[0]} next to the ${kinds[1]}`, `move the ${kinds[2]} ${['left', 'right', 'up', 'down'][Math.floor(R() * 4)]} a bit`, `put the ${kinds[2]} on the ${kinds[1]}`, `move the ${kinds[1]} to the ${['left', 'right'][Math.floor(R() * 2)]}`];
    for (const t of script) {
      const st0 = drawState(s), before = st0?.objects?.map((o) => ({ id: o.id, x: o.x, y: o.y })) ?? [], facts0 = st0?.rels?.facts ?? [];
      const reply = await s.send(t);
      const st = drawState(s); turns++;
      withOverlap += drawOverlaps(st) > 0 ? 1 : 0; withEscape += drawEscapes(st) > 0 ? 1 : 0;
      const target = (/the (\w+)/.exec(t) ?? [])[1];
      for (const b of before) { const o = st.objects.find((x) => x.id === b.id); if (!o || (target && o.kind === target)) continue;
        const tid = st0?.objects?.find((x) => x.kind === target)?.id;   // what rides on the moved thing (on / in / attached to it) is meant to travel with it: not a displacement of something unmentioned
        if (tid && facts0.some((f) => f.a === o.id && f.b === tid && ['on', 'in', 'attached_to'].includes(f.rel))) continue; dispSum += Math.hypot(o.x - b.x, o.y - b.y); dispN++; }
      if (!reply.text) unchanged++;
    }
  }
  return { s1: { turns, turnsWithUnwantedOverlap: withOverlap, turnsWithEscape: withEscape }, s2: { unmentionedObjectMoves: dispN, meanDisplacementPx: Number((dispSum / Math.max(1, dispN)).toFixed(2)) } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {   // run alone (also on an older checkout): node training/eval/space-draw-scenes.mjs
  const { createFsLoader, DEFAULT_ROOT } = await import('../../src/loaders/fs-loader.mjs');
  const { createEngine } = await import('../../src/dialog/index.mjs');
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  console.log(JSON.stringify(await drawScenes({ engine })));
}
