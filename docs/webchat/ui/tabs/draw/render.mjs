// Drawing tab renderer (spec 07 section 3, art.draw). Pure drawing: turns the scene graph of the art.draw world into
// hand-drawn pictures with rough.js (canvas for the screen and PNG, SVG for the vector download). No DOM beyond the
// canvas / SVG element it is given, no stored state. The geometry (kinds, parts, colors) comes from the world's
// scene.mjs, so the tab and the language layer always agree.

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const OUTLINE = '#3a3040';
export const PAPER = '#fffaf0';

export function createRenderer(rough, scene) {
  const gen = rough.generator();
  const cache = new Map();   // object signature -> [{ drawable, alpha, tx, ty, rot }]

  const keyOf = (o) => `${o.kind}|${o.thing ?? ''}|${Math.round(o.size)}|${o.color}|${o.fill}|${JSON.stringify(o.parts ?? {})}|${JSON.stringify(o.hide ?? [])}|${JSON.stringify(o.extra ?? {})}|${o.id}`;

  /** Rough drawables of one object, in local pixel space (origin = object center). Cached per signature. */
  function drawablesOf(obj) {
    const key = keyOf(obj);
    let hit = cache.get(key);
    if (hit) return hit;
    const S = obj.size, out = [];
    const rough1 = clamp(S / 230, 0.45, 1.35);
    const baseW = clamp(S * 0.013, 1.5, 4.2);
    const fillMode = obj.fill === 'solid' || obj.fill === 'outline' ? obj.fill : 'crayon';
    const parts = scene.partsOf(obj);
    // parts of a merged group (cloud puffs, tree crown) share one silhouette: all outlines first, then the fills on top
    parts.forEach((p, i) => { if (p.mg && fillMode !== 'outline') drawPart(p, i, 'outline-pass'); });
    parts.forEach((p, i) => drawPart(p, i, p.mg ? 'fill-pass' : 'normal'));
    function drawPart(p, i, phase) {
      const seed = (hash(`${obj.id}:${p.n}:${i}`) % 2147483000) + 1;
      const common = { seed, roughness: rough1, bowing: 1.1, preserveVertices: false };
      const px = (v) => v * S;
      const shapeArgs = (o) => {
        switch (p.s) {
          case 'rect': return gen.rectangle(px(p.x - p.w / 2), px(p.y - p.h / 2), px(p.w), px(p.h), o);
          case 'ellipse': return gen.ellipse(px(p.x), px(p.y), px(p.w), px(p.h), o);
          case 'poly': return gen.polygon(p.pts.map(([x, y]) => [px(x), px(y)]), o);
          case 'line': return gen.linearPath(p.pts.map(([x, y]) => [px(x), px(y)]), o);
          case 'curve': return gen.curve(p.pts.map(([x, y]) => [px(x), px(y)]), o);
          case 'arc': return gen.arc(px(p.x), px(p.y), px(p.w), px(p.h), p.a0, p.a1, false, o);
          default: return null;
        }
      };
      const tx = p.s === 'ellipse' || p.s === 'rect' ? px(p.x) : 0, ty = p.s === 'ellipse' || p.s === 'rect' ? px(p.y) : 0;
      const rot = ((p.r ?? 0) * Math.PI) / 180;
      // a rotated ellipse/rect is generated around its own center (0,0) and moved by the transform
      const local = rot ? { ...p, x: 0, y: 0 } : null;
      const make = (o) => {
        if (!local) return shapeArgs(o);
        const q = p; // generate at origin
        const px0 = (v) => v * S;
        if (q.s === 'ellipse') return gen.ellipse(0, 0, px0(q.w), px0(q.h), o);
        if (q.s === 'rect') return gen.rectangle(px0(-q.w / 2), px0(-q.h / 2), px0(q.w), px0(q.h), o);
        return shapeArgs(o);
      };
      const place = rot ? { tx, ty, rot } : { tx: 0, ty: 0, rot: 0 };
      const push = (drawable, alpha = 1) => { if (drawable) out.push({ drawable, alpha, ...place }); };
      if (p.s === 'line' || p.s === 'curve' || p.s === 'arc') {
        const w = Math.max(p.t ? p.t * S : baseW, 2);
        push(make({ ...common, stroke: p.hex, strokeWidth: w, fill: undefined }));
        if (p.s === 'arc' && p.full) { /* thick colored band: second pass fattens it */ push(make({ ...common, seed: seed + 3, stroke: p.hex, strokeWidth: w * 0.8, roughness: rough1 * 0.6 })); }
        return;
      }
      const tiny = Math.min(p.w ? px(p.w) : S, p.h ? px(p.h) : S) < 26;
      const mode = p.f === 'solid' ? 'solid' : p.f === 'none' ? 'outline' : fillMode;
      const outline = { stroke: p.noOutline ? 'none' : OUTLINE, strokeWidth: baseW };
      if (phase === 'outline-pass') { push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW * 1.15, fill: undefined })); return; }
      const merged = phase === 'fill-pass';
      const edge = merged ? { stroke: 'none' } : outline;
      if (mode === 'outline') { if (!merged) push(make({ ...common, ...outline, fill: undefined })); return; }
      if (mode === 'solid' || tiny) { push(make({ ...common, ...edge, fill: p.hex, fillStyle: 'solid' })); return; }
      // crayon: a soft tinted base, then scribbled strokes of the color, then the outline
      push(make({ ...common, stroke: 'none', fill: scene.shadeHex(p.hex, 0.12, -0.05), fillStyle: 'solid' }), merged ? 1 : 0.9);
      push(make({ ...common, ...edge, fill: p.hex, fillStyle: 'hachure', fillWeight: clamp(S * 0.012, 1.1, 3.2), hachureGap: clamp(S * 0.03, 3.2, 8), hachureAngle: -38 + (seed % 25) }));
    }
    cache.set(key, out);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return out;
  }

  // ---- sky, ground, paper --------------------------------------------------------------------------------------
  const backCache = new Map();
  function bandDrawables(key, make) {
    if (!backCache.has(key)) backCache.set(key, make());
    if (backCache.size > 40) backCache.delete(backCache.keys().next().value);
    return backCache.get(key);
  }
  function skyDrawables(color) {
    const hex = scene.colorHex(color);
    return bandDrawables(`sky|${color}`, () => [
      { d: gen.rectangle(-6, -6, scene.W + 12, scene.HORIZON + 6, { stroke: 'none', fill: scene.shadeHex(hex, 0.06), fillStyle: 'solid', seed: 11 }), a: 1 },
      { d: gen.rectangle(-6, -6, scene.W + 12, scene.HORIZON + 6, { stroke: 'none', fill: hex, fillStyle: 'hachure', hachureGap: 11, fillWeight: 6, hachureAngle: -35, roughness: 1.4, seed: 12 }), a: 0.55 },
    ]);
  }
  function groundDrawables(kind, color) {
    const hex = scene.colorHex(color), top = scene.HORIZON;
    return bandDrawables(`ground|${kind}|${color}`, () => {
      const list = [
        { d: gen.rectangle(-6, top, scene.W + 12, scene.H - top + 6, { stroke: 'none', fill: scene.shadeHex(hex, 0.08), fillStyle: 'solid', seed: 21 }), a: 1 },
        { d: gen.rectangle(-6, top, scene.W + 12, scene.H - top + 6, { stroke: 'none', fill: hex, fillStyle: 'hachure', hachureGap: 10, fillWeight: 5, hachureAngle: kind === 'sea' ? -5 : 52, roughness: 1.6, seed: 22 }), a: 0.6 },
      ];
      const dark = scene.shadeHex(hex, -0.2);
      let t = 99;
      const rnd = () => { t = (Math.imul(t, 1664525) + 1013904223) >>> 0; return t / 4294967296; };
      if (kind === 'grass') {
        for (let x = -10; x < scene.W + 10; x += 15) {
          const y = top + rnd() * 6, h = 14 + rnd() * 16, lean = (rnd() - 0.5) * 14;
          list.push({ d: gen.curve([[x, y + 6], [x + lean * 0.5, y - h * 0.5], [x + lean, y - h]], { stroke: dark, strokeWidth: 2.6, roughness: 1, seed: 30 + x }), a: 1 });
          if (rnd() < 0.5) list.push({ d: gen.curve([[x + 6, y + 8], [x + 6 - lean * 0.4, y - h * 0.4], [x + 6 - lean, y - h * 0.8]], { stroke: scene.shadeHex(hex, -0.1), strokeWidth: 2.2, roughness: 1, seed: 90 + x }), a: 1 });
        }
        for (let i = 0; i < 10; i++) {
          const x = 30 + rnd() * (scene.W - 60), y = top + 90 + rnd() * (scene.H - top - 130);
          list.push({ d: gen.curve([[x - 8, y + 6], [x - 3, y - 8], [x, y + 3]], { stroke: dark, strokeWidth: 2, roughness: 0.8, seed: 300 + i }), a: 0.7 });
        }
      } else if (kind === 'sand') {
        for (let i = 0; i < 60; i++) list.push({ d: gen.circle(20 + rnd() * (scene.W - 40), top + 20 + rnd() * (scene.H - top - 40), 2 + rnd() * 2, { stroke: 'none', fill: dark, fillStyle: 'solid', seed: 400 + i }), a: 0.5 });
        list.push({ d: gen.curve(Array.from({ length: 9 }, (_, i) => [i * 125, top + 4 + (i % 2 ? 8 : -4)]), { stroke: dark, strokeWidth: 3, roughness: 1.2, seed: 500 }), a: 0.8 });
      } else if (kind === 'snow') {
        for (let i = 0; i < 8; i++) list.push({ d: gen.arc(i * 135 + 20, top + 6, 200, 40, Math.PI, Math.PI * 2, false, { stroke: scene.shadeHex(hex, -0.12), strokeWidth: 2.4, roughness: 1.2, seed: 520 + i }), a: 0.9 });
        for (let i = 0; i < 40; i++) list.push({ d: gen.circle(20 + rnd() * (scene.W - 40), top + 20 + rnd() * (scene.H - top - 40), 3 + rnd() * 3, { stroke: 'none', fill: '#ffffff', fillStyle: 'solid', seed: 600 + i }), a: 0.9 });
      } else { // sea: rows of waves
        for (let row = 0; row < 5; row++) for (let x = -30 + (row % 2) * 40; x < scene.W; x += 80) {
          const y = top + 12 + row * 48 + (rnd() * 6);
          list.push({ d: gen.curve([[x, y], [x + 20, y - 12], [x + 40, y], [x + 60, y - 12], [x + 80, y]], { stroke: scene.shadeHex(hex, row % 2 ? 0.25 : -0.18), strokeWidth: 3, roughness: 1, seed: 700 + row * 40 + x }), a: 0.9 });
        }
      }
      return list;
    });
  }

  // ---- drawing -------------------------------------------------------------------------------------------------
  /** Draw sky and ground. */
  function drawBackground(ctx, rc, scn) {
    ctx.save();
    ctx.fillStyle = !scn.background || scn.background === 'white' ? PAPER : scene.colorHex(scn.background);
    ctx.fillRect(0, 0, scene.W, scene.H);
    if (scn.sky) for (const { d, a } of skyDrawables(scn.sky)) { ctx.globalAlpha = a; rc.draw(d); }
    if (scn.ground) {
      const color = scn.groundColor ?? { grass: 'green', sand: 'yellow', snow: 'white', sea: 'blue' }[scn.ground] ?? 'green';
      for (const { d, a } of groundDrawables(scn.ground, color)) { ctx.globalAlpha = a; rc.draw(d); }
    }
    ctx.restore();
  }

  /** Draw one object with its animated pose { x, y, size, rotation, flipX (-1..1), scale, alpha }. */
  function drawObject(ctx, rc, obj, pose = {}) {
    const k = scene.KINDS[scene.kindKey(obj)];   // a thing of the catalog is kind 'composite' with its name in `thing`
    if (!k) return;
    const size = pose.size ?? obj.size, sc = pose.scale ?? 1;
    // drawables are built at the target size; scaling the canvas gives the size animation for free
    const shown = { ...obj, size: obj.size };
    const list = drawablesOf(shown);
    ctx.save();
    ctx.translate(pose.x ?? obj.x, pose.y ?? obj.y);
    ctx.rotate((((pose.rotation ?? obj.rotation) ?? 0) * Math.PI) / 180);
    const flipX = pose.flipX ?? (obj.flip ? -1 : 1);
    ctx.scale((size / obj.size) * sc * flipX, (size / obj.size) * sc);
    const baseAlpha = pose.alpha ?? 1;
    for (const item of list) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * item.alpha;
      if (item.tx || item.ty) ctx.translate(item.tx, item.ty);
      if (item.rot) ctx.rotate(item.rot);
      rc.draw(item.drawable);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Dashed pink frame (with a name tag) around the selected object. */
  function drawSelection(ctx, rc, obj, pose = {}, label = '') {
    const b = scene.bbox({ ...obj, x: pose.x ?? obj.x, y: pose.y ?? obj.y, size: pose.size ?? obj.size });
    const pad = 14;
    const d = gen.rectangle(b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2, { stroke: '#ff3d9a', strokeWidth: 3, roughness: 1.1, seed: 5, strokeLineDash: [10, 8], fill: undefined });
    ctx.save();
    ctx.globalAlpha = 0.95;
    rc.draw(d);
    for (const [x, y] of [[b.x0 - pad, b.y0 - pad], [b.x1 + pad, b.y0 - pad], [b.x0 - pad, b.y1 + pad], [b.x1 + pad, b.y1 + pad]]) {
      rc.draw(gen.circle(x, y, 9, { stroke: '#ff3d9a', strokeWidth: 2, fill: '#fff', fillStyle: 'solid', roughness: 0.6, seed: 8 }));
    }
    if (label) {
      ctx.font = '600 22px "Comic Sans MS", "Chalkboard SE", "Bradley Hand", "Segoe Print", cursive';
      const w = ctx.measureText(label).width + 22, x = clamp(b.x0 - pad, 6, scene.W - w - 6), y = Math.max(4, b.y0 - pad - 34);
      ctx.fillStyle = '#ff3d9a';
      ctx.beginPath(); ctx.roundRect?.(x, y, w, 30, 10); if (!ctx.roundRect) ctx.rect(x, y, w, 30); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 11, y + 16);
    }
    ctx.restore();
  }

  /** Whole scene on a canvas 2d context at 1000x700 logical units (the context is expected to be scaled already). */
  function drawScene(ctx, rc, scn, { selected = null, poses = null, labelOf = null } = {}) {
    drawBackground(ctx, rc, scn);
    const objs = [...(scn.objects ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const o of objs) drawObject(ctx, rc, o, poses?.get(o.id));
    if (selected) {
      const o = (scn.objects ?? []).find((x) => x.id === selected);
      if (o) drawSelection(ctx, rc, o, poses?.get(o.id), labelOf?.(o) ?? '');
    }
  }

  // ---- SVG export ----------------------------------------------------------------------------------------------
  /** Standalone SVG text of the scene (no selection frame). `doc` is the DOM document (the browser's). */
  function toSVG(scn, doc = document) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', `0 0 ${scene.W} ${scene.H}`);
    svg.setAttribute('width', scene.W); svg.setAttribute('height', scene.H);
    const rs = rough.svg(svg);
    const add = (node, attrs = {}) => { for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); svg.append(node); };
    const paper = doc.createElementNS(NS, 'rect');
    add(paper, { x: 0, y: 0, width: scene.W, height: scene.H, fill: scn.background === 'white' ? PAPER : scene.colorHex(scn.background) });
    const layer = (list) => { const g = doc.createElementNS(NS, 'g'); for (const { d, a } of list) { const n = rs.draw(d); n.setAttribute('opacity', a); g.append(n); } svg.append(g); };
    if (scn.sky) layer(skyDrawables(scn.sky));
    if (scn.ground) layer(groundDrawables(scn.ground, scn.groundColor ?? { grass: 'green', sand: 'yellow', snow: 'white', sea: 'blue' }[scn.ground] ?? 'green'));
    for (const o of [...(scn.objects ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
      const g = doc.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${o.x} ${o.y}) rotate(${o.rotation ?? 0}) scale(${o.flip ? -1 : 1} 1)`);
      g.setAttribute('data-id', o.id); g.setAttribute('data-kind', o.thing ?? o.kind);
      for (const item of drawablesOf(o)) {
        const n = rs.draw(item.drawable);
        const wrap = doc.createElementNS(NS, 'g');
        wrap.setAttribute('transform', `translate(${item.tx} ${item.ty}) rotate(${(item.rot * 180) / Math.PI})`);
        wrap.setAttribute('opacity', item.alpha);
        wrap.append(n); g.append(wrap);
      }
      svg.append(g);
    }
    return new (doc.defaultView?.XMLSerializer ?? XMLSerializer)().serializeToString(svg);
  }

  return { drawScene, drawBackground, drawObject, drawSelection, toSVG, drawablesOf, gen };
}
