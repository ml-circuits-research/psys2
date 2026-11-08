// Scene geometry of art.draw (spec 07 section 6): colors, regions and the composite objects, all built from a handful
// of primitive parts. Browser-safe, no imports. ops.mjs re-exports what the host needs; the Drawing tab imports this
// file (through the built copy of the world) to draw a scene graph, so geometry has one single source of truth.
//
// Local space of an object: x runs over -0.5 .. 0.5 (the object width = `size`), y runs over -aspect/2 .. aspect/2
// (downwards), both in units of `size`. A part is { n: name, s: shape, ... , c: default color, m: 1 = follows the
// object color, sh: lightness shift, f: fill override, t: stroke thickness in units, r: rotation in degrees }:
//   rect/ellipse {x,y,w,h}   poly/line/curve {pts:[[x,y]...]}   arc {x,y,w,h,a0,a1} (radians, top half = PI..2*PI)

export const W = 1000, H = 700;
export const HORIZON = 470;           // the sky ends and the ground begins here
export const GROUND_BASE = 590;       // default baseline of things standing on the ground

// ---- colors -------------------------------------------------------------------------------------------------------
export const BASE_COLORS = {
  red: '#e63946', orange: '#f68b1e', yellow: '#ffd43b', green: '#43b04a', blue: '#3a86e8', purple: '#9b51e0', pink: '#ff7eb6',
  brown: '#8d5a2e', black: '#2d2d34', white: '#ffffff', grey: '#9aa1a9', turquoise: '#20c5b5', gold: '#f2b705', silver: '#c4cad2',
  beige: '#e8d5b0', peach: '#ffb88c', skin: '#f3c69b', tan: '#d8a468', navy: '#1b2f6b', lime: '#a4d94a', magenta: '#e0338f',
  violet: '#8a5cf5', indigo: '#4b3fbf', cyan: '#2ec4e6', maroon: '#8a1c2b', cream: '#fff4d6', lilac: '#c9a7ee', coral: '#ff6f61', mint: '#8de3c0',
};
export const COLOR_ALIASES = { gray: 'grey', golden: 'gold', rose: 'pink', scarlet: 'red', aqua: 'turquoise', teal: 'turquoise', ginger: 'orange', lemon: 'yellow', 'light-blue': 'light blue', grn: 'green', blu: 'blue', bloo: 'blue', blk: 'black', org: 'orange', pnk: 'pink', gry: 'grey', prp: 'purple', ylw: 'yellow', wht: 'white', brn: 'brown' };
export const SHADES = {
  light: [0.2, -0.05], pale: [0.3, -0.25], soft: [0.14, -0.12], bright: [0.05, 0.25], dark: [-0.2, 0], deep: [-0.12, 0.1], dk: [-0.2, 0], lt: [0.2, -0.05],
};
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round(clamp(v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
/** Lighten (dl > 0) or darken (dl < 0) a hex color; ds changes the saturation. */
export function shadeHex(hex, dl = 0, ds = 0) {
  const [h, s, l] = hexToHsl(hex);
  // white and black can only move towards the middle
  return hslToHex(h, clamp(s + ds), clamp(l + dl, 0.04, 0.97));
}
/** Canonical color name from spoken words: ["dark", "blue"] -> "dark blue"; null when it is not a color. */
export function canonColor(words) {
  const ws = (Array.isArray(words) ? words : String(words ?? '').toLowerCase().split(/[\s_-]+/)).map((w) => String(w).toLowerCase()).filter(Boolean);
  if (!ws.length) return null;
  const base0 = ws.at(-1), base = COLOR_ALIASES[base0] ?? base0;
  if (!BASE_COLORS[base]) return null;
  const shades = ws.slice(0, -1).filter((w) => SHADES[w]);
  if (ws.slice(0, -1).some((w) => !SHADES[w])) return null;
  return [...shades.slice(-1), base].join(' ');
}
/** Hex of a canonical color name ("dark blue", "red"); a hex string passes through; unknown names give grey. */
export function colorHex(name) {
  if (typeof name === 'string' && /^#[0-9a-f]{6}$/i.test(name)) return name;
  const canon = canonColor(name);
  if (!canon) return BASE_COLORS.grey;
  const ws = canon.split(' '), base = BASE_COLORS[ws.at(-1)];
  if (ws.length === 1) return base;
  const [dl, ds] = SHADES[ws[0]];
  return shadeHex(base, dl, ds);
}
export const sameColor = (a, b) => canonColor(a) === canonColor(b);

// ---- small shape builders -----------------------------------------------------------------------------------------
const E = (n, x, y, w, h, c, o = {}) => ({ n, s: 'ellipse', x, y, w, h, c, ...o });
const R = (n, x, y, w, h, c, o = {}) => ({ n, s: 'rect', x, y, w, h, c, ...o });
const P = (n, pts, c, o = {}) => ({ n, s: 'poly', pts, c, ...o });
const L = (n, pts, c, o = {}) => ({ n, s: 'line', pts, c, f: 'none', ...o });
const K = (n, pts, c, o = {}) => ({ n, s: 'curve', pts, c, f: 'none', ...o });
const A = (n, x, y, w, h, a0, a1, c, o = {}) => ({ n, s: 'arc', x, y, w, h, a0, a1, c, f: 'none', ...o });
const dot = (n, x, y, r, c, o = {}) => E(n, x, y, r * 2, r * 2, c, { f: 'solid', ...o });
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);

/** Polygon points scaled to width 1 and centered on its bounding box: { pts, aspect }. */
function fit(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), k = 1 / (x1 - x0);
  return { pts: pts.map(([x, y]) => [(x - (x0 + x1) / 2) * k, (y - (y0 + y1) / 2) * k]), aspect: (y1 - y0) * k };
}
const starPts = (spikes = 5, outer = 0.5, inner = 0.21) => {
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / spikes, r = i % 2 ? inner : outer;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
};
const heartPts = () => {
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return pts;
};
const round = (v) => Math.round(v * 1000) / 1000;
const rpts = (pts) => pts.map(([x, y]) => [round(x), round(y)]);
/** A crescent: the outer circle minus a shifted inner circle. */
function crescentPts() {
  const R0 = 0.5, c2 = [0.2, -0.1], r2 = 0.4, N = 72;
  const outside = [], inside = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, p = [Math.cos(a) * R0, Math.sin(a) * R0];
    (Math.hypot(p[0] - c2[0], p[1] - c2[1]) > r2 ? outside : inside).push({ i, p });
  }
  // rotate the outer list so that it starts after a gap (contiguous arc)
  const idx = outside.map((o) => o.i);
  let start = 0;
  for (let k = 0; k < idx.length; k++) if ((idx[k] - idx[(k + idx.length - 1) % idx.length] + N) % N !== 1) { start = k; break; }
  const arc = [...outside.slice(start), ...outside.slice(0, start)].map((o) => o.p);
  const end = arc.at(-1);
  const inner = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, p = [c2[0] + Math.cos(a) * r2, c2[1] + Math.sin(a) * r2];
    if (Math.hypot(p[0], p[1]) < R0) inner.push({ i, p });
  }
  const ii = inner.map((o) => o.i);
  let s2 = 0;
  for (let k = 0; k < ii.length; k++) if ((ii[k] - ii[(k + ii.length - 1) % ii.length] + N) % N !== 1) { s2 = k; break; }
  let curve = [...inner.slice(s2), ...inner.slice(0, s2)].map((o) => o.p);
  const d0 = Math.hypot(curve[0][0] - end[0], curve[0][1] - end[1]), d1 = Math.hypot(curve.at(-1)[0] - end[0], curve.at(-1)[1] - end[1]);
  if (d1 < d0) curve = curve.reverse();
  return fit([...arc, ...curve]);
}

// ---- kinds --------------------------------------------------------------------------------------------------------
// size: default width in logical pixels; aspect: height / width; anchor: where it lives by default ('ground', 'sky', 'any');
// faces: 'right' when the picture looks to the right (flip mirrors it); names: part name -> spoken synonyms.
const tri = fit([[0, -0.5], [0.5, 0.4], [-0.5, 0.4]]);
const star = fit(starPts());
const heart = fit(heartPts());
const moon = crescentPts();

export const KINDS = {
  // ---- primitives
  circle: { prim: 1, size: 130, aspect: 1, anchor: 'any', color: 'red', build: () => [E('body', 0, 0, 1, 1, 'red', { m: 1 })] },
  oval: { prim: 1, size: 160, aspect: 0.6, anchor: 'any', color: 'purple', build: () => [E('body', 0, 0, 1, 0.6, 'purple', { m: 1 })] },
  square: { prim: 1, size: 130, aspect: 1, anchor: 'any', color: 'blue', build: () => [R('body', 0, 0, 1, 1, 'blue', { m: 1 })] },
  rectangle: { prim: 1, size: 180, aspect: 0.6, anchor: 'any', color: 'green', build: () => [R('body', 0, 0, 1, 0.6, 'green', { m: 1 })] },
  triangle: { prim: 1, size: 140, aspect: tri.aspect, anchor: 'any', color: 'orange', build: () => [P('body', tri.pts, 'orange', { m: 1 })] },
  star: { prim: 1, size: 110, aspect: star.aspect, anchor: 'sky', color: 'yellow', build: () => [P('body', star.pts, 'yellow', { m: 1 })] },
  heart: { prim: 1, size: 120, aspect: heart.aspect, anchor: 'any', color: 'red', build: () => [P('body', rpts(heart.pts), 'red', { m: 1 })] },
  line: { prim: 1, size: 260, aspect: 0.06, anchor: 'any', color: 'black', build: () => [L('body', [[-0.5, 0], [0.5, 0]], 'black', { m: 1, t: 0.02 })] },
  arrow: { prim: 1, size: 220, aspect: 0.3, anchor: 'any', color: 'black', build: () => [
    L('body', [[-0.5, 0], [0.38, 0]], 'black', { m: 1, t: 0.03 }), P('head', [[0.3, -0.1], [0.5, 0], [0.3, 0.1]], 'black', { m: 1, f: 'solid' })] },

  // ---- composites
  house: {
    size: 240, aspect: 0.82, anchor: 'ground', color: 'yellow',
    names: { walls: ['wall', 'walls', 'body', 'house'], roof: ['roof'], door: ['door'], windows: ['window', 'windows'], chimney: ['chimney'], knob: ['knob', 'handle', 'doorknob'] },
    build: () => [
      R('chimney', 0.24, -0.25, 0.1, 0.26, 'grey'),
      R('walls', 0, 0.185, 0.8, 0.45, 'yellow', { m: 1 }),
      P('roof', [[-0.5, 0.0], [0, -0.41], [0.5, 0.0]], 'red', { alt: 'brown' }),
      R('door', 0, 0.275, 0.16, 0.27, 'brown'), dot('knob', 0.045, 0.28, 0.012, 'gold'),
      R('windows', -0.26, 0.14, 0.16, 0.16, 'light blue'), R('windows', 0.26, 0.14, 0.16, 0.16, 'light blue'),
      L('frames', [[-0.26, 0.06], [-0.26, 0.22]], 'white', { t: 0.012 }), L('frames', [[-0.34, 0.14], [-0.18, 0.14]], 'white', { t: 0.012 }),
      L('frames', [[0.26, 0.06], [0.26, 0.22]], 'white', { t: 0.012 }), L('frames', [[0.18, 0.14], [0.34, 0.14]], 'white', { t: 0.012 }),
    ],
  },
  tree: {
    size: 170, aspect: 1.3, anchor: 'ground', color: 'green',
    names: { trunk: ['trunk', 'stem', 'wood'], crown: ['crown', 'leaves', 'leaf', 'top', 'foliage', 'branches'], apples: ['apples', 'apple', 'fruit'] },
    build: () => [
      R('trunk', 0, 0.38, 0.15, 0.55, 'brown'), L('bark', [[-0.02, 0.22], [-0.02, 0.4]], 'dark brown', { t: 0.01 }),
      E('crown', 0, -0.2, 0.92, 0.82, 'green', { m: 1, mg: 1 }), E('crown', -0.26, -0.02, 0.5, 0.44, 'green', { m: 1, mg: 1 }),
      E('crown', 0.27, -0.02, 0.5, 0.44, 'green', { m: 1, mg: 1 }), E('crown', 0, -0.46, 0.6, 0.45, 'green', { m: 1, mg: 1 }),
    ],
  },
  sun: {
    size: 140, aspect: 1, anchor: 'sky', color: 'yellow',
    names: { rays: ['ray', 'rays', 'beams'], disc: ['disc', 'body', 'sun', 'circle', 'face'], cheeks: ['cheek', 'cheeks'], eyes: ['eye', 'eyes'], smile: ['smile', 'mouth'] },
    build: () => {
      const rays = [];
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6, c = Math.cos(a), s = Math.sin(a);
        rays.push(L('rays', [[c * 0.36, s * 0.36], [c * 0.5, s * 0.5]], 'orange', { m: 1, t: 0.028 }));
      }
      return [...rays, E('disc', 0, 0, 0.64, 0.64, 'yellow', { m: 1 }),
        dot('eyes', -0.1, -0.05, 0.035, 'black'), dot('eyes', 0.1, -0.05, 0.035, 'black'),
        dot('cheeks', -0.2, 0.07, 0.045, 'pink', { f: 'solid' }), dot('cheeks', 0.2, 0.07, 0.045, 'pink', { f: 'solid' }),
        K('smile', [[-0.15, 0.07], [-0.08, 0.14], [0, 0.16], [0.08, 0.14], [0.15, 0.07]], 'brown', { t: 0.018 })];
    },
  },
  cloud: {
    size: 210, aspect: 0.55, anchor: 'sky', color: 'white', fill: 'solid',
    names: { puffs: ['puff', 'puffs', 'body', 'cloud'] },
    build: () => [E('puffs', -0.28, 0.1, 0.44, 0.34, 'white', { m: 1, mg: 1 }), E('puffs', 0.28, 0.1, 0.44, 0.34, 'white', { m: 1, mg: 1 }),
      E('puffs', -0.1, -0.08, 0.5, 0.46, 'white', { m: 1, mg: 1 }), E('puffs', 0.17, -0.02, 0.44, 0.4, 'white', { m: 1, mg: 1 }), E('puffs', 0, 0.12, 0.62, 0.36, 'white', { m: 1, mg: 1 })],
  },
  car: {
    size: 230, aspect: 0.58, anchor: 'ground', faces: 'right', color: 'red',
    names: { body: ['body', 'car'], windows: ['window', 'windows', 'windscreen'], wheels: ['wheel', 'wheels', 'tyre', 'tyres', 'tire', 'tires'], hubcaps: ['hubcap', 'hubcaps'], lights: ['light', 'lights', 'headlight', 'headlights'] },
    build: () => [
      P('body', [[-0.3, -0.04], [-0.2, -0.26], [0.16, -0.26], [0.3, -0.04]], 'red', { m: 1 }),
      R('body', 0, 0.07, 0.98, 0.26, 'red', { m: 1 }),
      P('windows', [[-0.25, -0.06], [-0.18, -0.2], [-0.02, -0.2], [-0.02, -0.06]], 'light blue'),
      P('windows', [[0.02, -0.06], [0.02, -0.2], [0.14, -0.2], [0.23, -0.06]], 'light blue'),
      R('lights', 0.45, 0.03, 0.06, 0.07, 'yellow'),
      E('wheels', -0.28, 0.2, 0.25, 0.25, 'black', { f: 'solid' }), E('wheels', 0.28, 0.2, 0.25, 0.25, 'black', { f: 'solid' }),
      dot('hubcaps', -0.28, 0.2, 0.05, 'light grey'), dot('hubcaps', 0.28, 0.2, 0.05, 'light grey'),
    ],
  },
  flower: {
    size: 100, aspect: 1.5, anchor: 'ground', color: 'pink',
    names: { petals: ['petal', 'petals', 'flower', 'blossom'], center: ['center', 'middle', 'centre'], stem: ['stem', 'stalk'], leaves: ['leaf', 'leaves'] },
    build: () => {
      const petals = [];
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7 - Math.PI / 2, cx = Math.cos(a) * 0.27, cy = -0.4 + Math.sin(a) * 0.27;
        petals.push(E('petals', cx, cy, 0.26, 0.38, 'pink', { m: 1, r: (a * 180) / Math.PI + 90 }));
      }
      return [K('stem', [[0, -0.15], [0.04, 0.15], [-0.03, 0.45], [0, 0.75]], 'green', { t: 0.035 }),
        E('leaves', -0.2, 0.38, 0.3, 0.14, 'green', { r: -25 }), E('leaves', 0.2, 0.2, 0.3, 0.14, 'green', { r: 25 }),
        ...petals, dot('center', 0, -0.4, 0.14, 'yellow', { f: 'solid' })];
    },
  },
  cat: {
    size: 130, aspect: 1.0, anchor: 'ground', color: 'orange',
    names: { body: ['body', 'fur', 'cat'], head: ['head', 'face'], ears: ['ear', 'ears'], eyes: ['eye', 'eyes'], nose: ['nose'], tail: ['tail'], whiskers: ['whisker', 'whiskers'], stripes: ['stripe', 'stripes'] },
    build: () => [
      K('tail', [[0.2, 0.35], [0.45, 0.3], [0.5, 0.1], [0.4, -0.05]], 'orange', { m: 1, t: 0.07 }),
      E('body', 0, 0.26, 0.58, 0.56, 'orange', { m: 1 }),
      P('ears', [[-0.3, -0.18], [-0.27, -0.46], [-0.08, -0.3]], 'orange', { m: 1 }), P('ears', [[0.3, -0.18], [0.27, -0.46], [0.08, -0.3]], 'orange', { m: 1 }),
      P('innerEars', [[-0.25, -0.24], [-0.24, -0.38], [-0.14, -0.29]], 'pink', { f: 'solid' }), P('innerEars', [[0.25, -0.24], [0.24, -0.38], [0.14, -0.29]], 'pink', { f: 'solid' }),
      E('head', 0, -0.12, 0.68, 0.52, 'orange', { m: 1 }),
      L('stripes', [[-0.08, -0.37], [-0.06, -0.28]], 'brown', { t: 0.015 }), L('stripes', [[0, -0.38], [0, -0.28]], 'brown', { t: 0.015 }), L('stripes', [[0.08, -0.37], [0.06, -0.28]], 'brown', { t: 0.015 }),
      E('eyes', -0.14, -0.15, 0.1, 0.13, 'green', { f: 'solid' }), E('eyes', 0.14, -0.15, 0.1, 0.13, 'green', { f: 'solid' }),
      dot('pupils', -0.14, -0.15, 0.018, 'black'), dot('pupils', 0.14, -0.15, 0.018, 'black'),
      P('nose', [[-0.03, -0.06], [0.03, -0.06], [0, -0.02]], 'pink', { f: 'solid' }),
      K('mouth', [[-0.07, 0.0], [-0.03, 0.02], [0, -0.02], [0.03, 0.02], [0.07, 0.0]], 'dark grey', { t: 0.01 }),
      L('whiskers', [[-0.14, -0.04], [-0.4, -0.08]], 'dark grey', { t: 0.008 }), L('whiskers', [[-0.14, 0.0], [-0.4, 0.02]], 'dark grey', { t: 0.008 }),
      L('whiskers', [[0.14, -0.04], [0.4, -0.08]], 'dark grey', { t: 0.008 }), L('whiskers', [[0.14, 0.0], [0.4, 0.02]], 'dark grey', { t: 0.008 }),
      E('paws', -0.13, 0.5, 0.17, 0.1, 'white', { f: 'solid' }), E('paws', 0.13, 0.5, 0.17, 0.1, 'white', { f: 'solid' }),
    ],
  },
  dog: {
    size: 160, aspect: 0.85, anchor: 'ground', faces: 'right', color: 'brown',
    names: { body: ['body', 'fur', 'dog'], head: ['head', 'face'], ears: ['ear', 'ears'], nose: ['nose'], tail: ['tail'], legs: ['leg', 'legs', 'paws'], collar: ['collar'], tongue: ['tongue'], snout: ['snout', 'muzzle'] },
    build: () => [
      K('tail', [[-0.33, -0.03], [-0.42, -0.14], [-0.48, -0.26]], 'brown', { m: 1, t: 0.06 }),
      R('legs', -0.25, 0.28, 0.09, 0.28, 'brown', { m: 1 }), R('legs', -0.1, 0.3, 0.09, 0.26, 'brown', { m: 1 }),
      R('legs', 0.1, 0.3, 0.09, 0.26, 'brown', { m: 1 }), R('legs', 0.25, 0.28, 0.09, 0.28, 'brown', { m: 1 }),
      E('body', -0.03, 0.08, 0.68, 0.4, 'brown', { m: 1 }),
      E('head', 0.3, -0.12, 0.38, 0.36, 'brown', { m: 1 }),
      E('snout', 0.46, -0.06, 0.22, 0.17, 'tan', { sh: 0.0 }), dot('nose', 0.55, -0.1, 0.03, 'black'),
      E('ears', 0.2, -0.12, 0.13, 0.3, 'dark brown', { r: 15 }),
      dot('eyes', 0.34, -0.18, 0.025, 'black'), K('mouth', [[0.4, -0.01], [0.46, 0.0], [0.52, -0.02]], 'black', { t: 0.01 }),
      E('tongue', 0.47, 0.03, 0.06, 0.09, 'pink', { f: 'solid' }),
      R('collar', 0.17, 0.0, 0.07, 0.2, 'red', { r: 25, f: 'solid' }),
    ],
  },
  fish: {
    size: 120, aspect: 0.6, anchor: 'any', faces: 'right', color: 'orange',
    names: { body: ['body', 'fish'], tail: ['tail'], fin: ['fin', 'fins'], eye: ['eye'], scales: ['scale', 'scales', 'stripes'] },
    build: () => [
      P('tail', [[-0.28, 0], [-0.5, -0.24], [-0.46, 0], [-0.5, 0.24]], 'orange', { m: 1 }),
      P('fin', [[-0.05, -0.2], [0.05, -0.38], [0.18, -0.2]], 'orange', { m: 1, sh: -0.1 }),
      P('fin', [[0.0, 0.2], [0.06, 0.32], [0.14, 0.2]], 'orange', { m: 1, sh: -0.1 }),
      E('body', -0.02, 0, 0.78, 0.5, 'orange', { m: 1 }),
      K('scales', [[0.08, -0.17], [0.13, 0], [0.08, 0.17]], 'dark orange', { t: 0.014 }), K('scales', [[-0.06, -0.19], [-0.01, 0], [-0.06, 0.19]], 'dark orange', { t: 0.014 }),
      dot('eyeWhite', 0.22, -0.06, 0.06, 'white'), dot('eye', 0.235, -0.06, 0.028, 'black'),
      K('mouth', [[0.34, 0.04], [0.37, 0.06], [0.4, 0.03]], 'dark grey', { t: 0.01 }),
    ],
  },
  bird: {
    size: 100, aspect: 0.78, anchor: 'sky', faces: 'right', color: 'blue',
    names: { body: ['body', 'bird', 'feathers'], head: ['head'], wing: ['wing', 'wings'], beak: ['beak', 'bill'], tail: ['tail'], eye: ['eye'], legs: ['leg', 'legs', 'feet'] },
    build: () => [
      P('tail', [[-0.28, 0.08], [-0.5, -0.05], [-0.5, 0.2], [-0.3, 0.18]], 'blue', { m: 1, sh: -0.1 }),
      L('legs', [[-0.04, 0.28], [-0.04, 0.4]], 'orange', { t: 0.02 }), L('legs', [[0.08, 0.28], [0.08, 0.4]], 'orange', { t: 0.02 }),
      E('body', -0.02, 0.06, 0.62, 0.46, 'blue', { m: 1 }), E('head', 0.28, -0.16, 0.34, 0.32, 'blue', { m: 1 }),
      P('beak', [[0.44, -0.2], [0.6, -0.14], [0.44, -0.1]], 'yellow', { f: 'solid' }),
      dot('eye', 0.34, -0.19, 0.03, 'black'), E('wing', -0.08, 0.06, 0.34, 0.22, 'blue', { m: 1, sh: -0.18, r: -20 }),
    ],
  },
  boat: {
    size: 230, aspect: 0.95, anchor: 'ground', faces: 'right', color: 'red',
    names: { hull: ['hull', 'body', 'boat', 'ship'], sail: ['sail', 'sails'], mast: ['mast', 'pole'], flag: ['flag'], waves: ['wave', 'waves', 'water', 'sea'], porthole: ['window', 'porthole'] },
    build: () => [
      L('mast', [[0, 0.12], [0, -0.46]], 'brown', { t: 0.02 }),
      P('sail', [[0.04, -0.44], [0.04, 0.06], [0.4, 0.06]], 'white'), P('sail', [[-0.04, -0.32], [-0.04, 0.06], [-0.3, 0.06]], 'light yellow'),
      P('flag', [[0, -0.46], [0.15, -0.41], [0, -0.36]], 'orange', { f: 'solid' }),
      P('hull', [[-0.5, 0.1], [0.5, 0.1], [0.36, 0.34], [-0.36, 0.34]], 'red', { m: 1 }),
      dot('porthole', -0.15, 0.2, 0.04, 'light blue'), dot('porthole', 0.05, 0.2, 0.04, 'light blue'), dot('porthole', 0.25, 0.2, 0.04, 'light blue'),
      K('waves', [[-0.5, 0.4], [-0.38, 0.34], [-0.26, 0.4], [-0.14, 0.34], [-0.02, 0.4], [0.1, 0.34], [0.22, 0.4], [0.34, 0.34], [0.5, 0.4]], 'blue', { t: 0.022 }),
      K('waves', [[-0.44, 0.46], [-0.32, 0.41], [-0.2, 0.46], [-0.08, 0.41], [0.04, 0.46], [0.16, 0.41], [0.28, 0.46], [0.4, 0.41]], 'light blue', { t: 0.018 }),
    ],
  },
  mountain: {
    size: 380, aspect: 0.75, anchor: 'horizon', color: 'grey',
    names: { rock: ['rock', 'rocks', 'body', 'mountain', 'stone'], snow: ['snow', 'cap', 'peak', 'top'] },
    build: () => [
      P('rock', [[-0.5, 0.375], [-0.27, -0.05], [0.02, 0.375]], 'grey', { m: 1, sh: -0.12 }),
      P('rock', [[-0.3, 0.375], [0.08, -0.375], [0.5, 0.375]], 'grey', { m: 1 }),
      P('snow', [[0.08, -0.375], [-0.04, -0.17], [0.03, -0.2], [0.08, -0.12], [0.14, -0.2], [0.2, -0.17]], 'white', { f: 'solid' }),
      P('snow', [[-0.27, -0.05], [-0.33, 0.06], [-0.28, 0.03], [-0.25, 0.08], [-0.21, 0.03], [-0.2, 0.05]], 'white', { f: 'solid' }),
    ],
  },
  rainbow: {
    size: 440, aspect: 0.56, anchor: 'sky', color: null,
    names: { bands: ['band', 'bands', 'stripe', 'stripes', 'colors', 'rainbow'], clouds: ['cloud', 'clouds'] },
    build: () => {
      const cols = ['red', 'orange', 'yellow', 'green', 'light blue', 'blue', 'purple'];
      const bands = cols.map((c, i) => A('bands', 0, 0.28, 1 - i * 0.075, (1 - i * 0.075) * 1.1, Math.PI, Math.PI * 2, c, { m: 1, sh: (i - 3) * 0.05, t: 0.06, full: 1 }));
      return [...bands, E('clouds', -0.45, 0.25, 0.22, 0.16, 'white', { f: 'solid' }), E('clouds', 0.45, 0.25, 0.22, 0.16, 'white', { f: 'solid' }),
        E('clouds', -0.36, 0.28, 0.2, 0.14, 'white', { f: 'solid' }), E('clouds', 0.36, 0.28, 0.2, 0.14, 'white', { f: 'solid' })];
    },
  },
  person: {
    size: 90, aspect: 2.2, anchor: 'ground', color: 'blue',
    names: { shirt: ['shirt', 'body', 'top', 'clothes', 'jumper', 'sweater', 'dress'], head: ['head', 'face', 'skin'], hair: ['hair'], pants: ['pants', 'trousers', 'legs', 'leg', 'jeans'], arms: ['arm', 'arms'], shoes: ['shoe', 'shoes', 'boots'], eyes: ['eye', 'eyes'], smile: ['smile', 'mouth'] },
    build: () => [
      L('arms', [[-0.28, -0.55], [-0.5, -0.1]], 'skin', { t: 0.08 }), L('arms', [[0.28, -0.55], [0.5, -0.1]], 'skin', { t: 0.08 }),
      R('pants', -0.12, 0.62, 0.2, 0.55, 'navy'), R('pants', 0.12, 0.62, 0.2, 0.55, 'navy'),
      E('shoes', -0.15, 0.95, 0.28, 0.12, 'black', { f: 'solid' }), E('shoes', 0.15, 0.95, 0.28, 0.12, 'black', { f: 'solid' }),
      R('shirt', 0, -0.2, 0.6, 0.8, 'blue', { m: 1 }),
      E('head', 0, -0.85, 0.56, 0.56, 'skin'), E('hair', 0, -1.0, 0.6, 0.28, 'brown', { f: 'solid' }),
      dot('eyes', -0.1, -0.86, 0.03, 'black'), dot('eyes', 0.1, -0.86, 0.03, 'black'),
      K('smile', [[-0.1, -0.72], [-0.04, -0.68], [0.04, -0.68], [0.1, -0.72]], 'red', { t: 0.015 }),
    ],
  },
  balloon: {
    size: 80, aspect: 1.45, anchor: 'sky', color: 'red',
    names: { balloon: ['balloon', 'body'], string: ['string', 'rope', 'ribbon'], knot: ['knot'], shine: ['shine', 'highlight'] },
    build: () => [
      K('string', [[0, 0.36], [-0.12, 0.5], [0.12, 0.6], [0, 0.72]], 'dark grey', { t: 0.012 }),
      E('balloon', 0, -0.2, 0.9, 1.0, 'red', { m: 1 }),
      P('knot', [[0, 0.3], [-0.06, 0.4], [0.06, 0.4]], 'red', { m: 1, sh: -0.1 }),
      E('shine', -0.2, -0.4, 0.16, 0.3, 'white', { f: 'solid', r: 25 }),
    ],
  },
  rocket: {
    size: 110, aspect: 2.2, anchor: 'sky', color: 'light grey',
    names: { body: ['body', 'rocket'], nose: ['nose', 'cone', 'top'], window: ['window', 'porthole'], fins: ['fin', 'fins', 'wings'], flame: ['flame', 'fire', 'flames'] },
    build: () => [
      P('flame', [[-0.2, 0.5], [0, 1.08], [0.2, 0.5]], 'orange', { f: 'solid' }), P('flame', [[-0.1, 0.5], [0, 0.82], [0.1, 0.5]], 'yellow', { f: 'solid' }),
      P('fins', [[-0.3, 0.1], [-0.58, 0.62], [-0.3, 0.5]], 'red'), P('fins', [[0.3, 0.1], [0.58, 0.62], [0.3, 0.5]], 'red'),
      P('body', [[-0.3, 0.52], [-0.3, -0.3], [-0.22, -0.65], [0, -1.0], [0.22, -0.65], [0.3, -0.3], [0.3, 0.52]], 'light grey', { m: 1 }),
      P('nose', [[-0.24, -0.6], [0, -1.0], [0.24, -0.6], [0.12, -0.56], [0, -0.52], [-0.12, -0.56]], 'red'),
      dot('window', 0, -0.2, 0.15, 'light blue'), R('stripe', 0, 0.38, 0.6, 0.07, 'red', { f: 'solid' }),
    ],
  },
  moon: {
    size: 110, aspect: moon.aspect, anchor: 'sky', color: 'light yellow',
    names: { moon: ['moon', 'body', 'crescent'] },
    build: () => [P('moon', rpts(moon.pts), 'light yellow', { m: 1 })],
  },
};
// aspect of kinds that were given by builders is fixed above; make sure each has one
for (const k of Object.values(KINDS)) k.aspect ??= 1;

/** Plural forms that are not formed with -s (lexicon plural= entries mirror these). */
export const PLURALS = { person: 'people', fish: 'fish' };
export const KIND_ORDER = ['house', 'tree', 'sun', 'cloud', 'car', 'flower', 'cat', 'dog', 'fish', 'bird', 'boat', 'mountain', 'rainbow', 'person', 'balloon', 'rocket', 'moon',
  'circle', 'square', 'rectangle', 'triangle', 'star', 'heart', 'line', 'arrow', 'oval'];
export const isKind = (k) => Object.hasOwn(KINDS, k);

/** Default color word of a kind (what the object is when nobody said a color). */
export const defaultColor = (kind) => KINDS[kind]?.color ?? null;

const partCache = new Map();
/** Local-space parts of a kind (cached, do not modify). */
export function kindParts(kind) {
  if (!partCache.has(kind)) partCache.set(kind, isKind(kind) ? KINDS[kind].build() : []);
  return partCache.get(kind);
}
/** Names of the colorable parts of a kind (distinct, in drawing order). */
export function partNames(kind) {
  return [...new Set(kindParts(kind).map((p) => p.n))].filter((n) => KINDS[kind].names && Object.hasOwn(KINDS[kind].names, n));
}
/** The part key a spoken word means on a kind (e.g. "wheel" -> "wheels"), or null. */
export function partOfWord(kind, word) {
  const names = KINDS[kind]?.names ?? {};
  const w = String(word).toLowerCase();
  for (const [key, syn] of Object.entries(names)) if (key === w || syn.includes(w)) return key;
  return null;
}
/** Spoken singular name of a part key ("windows" -> "window"). */
export const partLabel = (key) => ({ windows: 'windows', wheels: 'wheels', walls: 'walls', petals: 'petals', ears: 'ears', eyes: 'eyes', rays: 'rays', puffs: 'puffs', legs: 'legs', fins: 'fins', bands: 'stripes', clouds: 'clouds', pants: 'trousers', hubcaps: 'hubcaps', lights: 'lights', stripes: 'stripes', whiskers: 'whiskers', apples: 'apples', leaves: 'leaves', crown: 'leaves' }[key] ?? key);

/**
 * The drawable parts of an object, colors resolved: [{ n, s, x, y, w, h, pts, a0, a1, hex, color, f, t, r, noOutline }].
 * Color of a part: the object's own override (obj.parts[name]), else the object color for parts that follow it
 * (m), else the part default. `sh` shifts the lightness, `alt` replaces a default that would equal the object color.
 */
export function partsOf(obj) {
  const kind = obj?.kind;
  if (!isKind(kind)) return [];
  const override = obj.parts ?? {};
  return kindParts(kind).map((p) => {
    let color = p.c;
    if (Object.hasOwn(override, p.n)) color = override[p.n];
    else if (p.m && obj.color) color = obj.color;
    else if (p.alt && obj.color && sameColor(obj.color, p.c)) color = p.alt;
    let hex = colorHex(color);
    if (p.sh) hex = shadeHex(hex, p.sh);
    const { c, m, alt, sh, ...rest } = p;
    return { ...rest, color: canonColor(color) ?? String(color), hex };
  });
}

// ---- geometry of objects --------------------------------------------------------------------------------------------
/** Bounding box of an object in canvas pixels (rotation is taken into account for the box only). */
export function bbox(obj) {
  const k = KINDS[obj.kind];
  const w0 = obj.size, h0 = obj.size * (k?.aspect ?? 1);
  const a = ((obj.rotation ?? 0) * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = w0 * c + h0 * s, h = w0 * s + h0 * c;
  return { x0: obj.x - w / 2, y0: obj.y - h / 2, x1: obj.x + w / 2, y1: obj.y + h / 2, w, h, cx: obj.x, cy: obj.y };
}

// ---- regions ------------------------------------------------------------------------------------------------------
const M = 30; // margin to the canvas edge
/** Named places on the canvas: x0..x1, y0..y1 (the rectangle an object is placed in). */
export const REGIONS = {
  'top left': { x0: 0, y0: 0, x1: W / 3, y1: HORIZON / 2, hx: 'left', hy: 'top' },
  top: { x0: W / 3, y0: 0, x1: (2 * W) / 3, y1: HORIZON / 2, hx: 'center', hy: 'top' },
  'top right': { x0: (2 * W) / 3, y0: 0, x1: W, y1: HORIZON / 2, hx: 'right', hy: 'top' },
  left: { x0: 0, y0: HORIZON / 4, x1: W / 3, y1: H - HORIZON / 4, hx: 'left', hy: 'middle' },
  center: { x0: W / 3, y0: HORIZON / 4, x1: (2 * W) / 3, y1: H - HORIZON / 4, hx: 'center', hy: 'middle' },
  right: { x0: (2 * W) / 3, y0: HORIZON / 4, x1: W, y1: H - HORIZON / 4, hx: 'right', hy: 'middle' },
  'bottom left': { x0: 0, y0: H - 260, x1: W / 3, y1: H, hx: 'left', hy: 'bottom' },
  bottom: { x0: W / 3, y0: H - 260, x1: (2 * W) / 3, y1: H, hx: 'center', hy: 'bottom' },
  'bottom right': { x0: (2 * W) / 3, y0: H - 260, x1: W, y1: H, hx: 'right', hy: 'bottom' },
  sky: { x0: 0, y0: 0, x1: W, y1: HORIZON, hx: 'center', hy: 'middle' },
  ground: { x0: 0, y0: HORIZON, x1: W, y1: H, hx: 'center', hy: 'bottom' },
};
export const REGION_NAMES = Object.keys(REGIONS);

/** The region name that contains point (x, y), as spoken words ("top right", "center", ...). */
export function regionOf(x, y) {
  const col = x < W / 3 ? 'left' : x > (2 * W) / 3 ? 'right' : 'center';
  const row = y < H * 0.34 ? 'top' : y > H * 0.68 ? 'bottom' : 'middle';
  if (row === 'middle') return col === 'center' ? 'center' : col;
  return col === 'center' ? row : `${row} ${col}`;
}

/** Center for an object of size (w, h) placed in a named region, hugging the corner or edge it names. */
export function placeInRegion(name, w, h, anchor) {
  const r = REGIONS[name];
  if (!r) return null;
  let x = (r.x0 + r.x1) / 2, y = (r.y0 + r.y1) / 2;
  if (r.hx === 'left') x = r.x0 + M + w / 2; else if (r.hx === 'right') x = r.x1 - M - w / 2;
  if (name === 'sky' || name === 'ground') {
    // the whole band: x stays central, y is by default
    if (name === 'ground') y = Math.min(H - M, GROUND_BASE + 20) - h / 2;
    else y = Math.max(M + h / 2, Math.min(HORIZON * 0.45, HORIZON - h / 2 - 80));
    return { x, y };
  }
  if (r.hy === 'top') y = r.y0 + M + h / 2; else if (r.hy === 'bottom') y = r.y1 - M - h / 2;
  if (anchor === 'ground' && (r.hy === 'middle' || r.hy === 'bottom')) y = Math.min(y, H - M - h / 2);
  return { x, y };
}

// ---- stars for the night -------------------------------------------------------------------------------------------
/** Deterministic star field: n [x, y, size] triples in the sky. */
export function starField(n = 14, seed = 7) {
  let t = seed >>> 0;
  const rnd = () => { t = (Math.imul(t, 1664525) + 1013904223) >>> 0; return t / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i++) out.push([Math.round(40 + rnd() * (W - 80)), Math.round(30 + rnd() * (HORIZON - 120)), Math.round(22 + rnd() * 26)]);
  return out;
}
