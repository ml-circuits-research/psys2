// SPDX-License-Identifier: AGPL-3.0-only
// The data of a drawn face (AVATAR-FROM-PARTS): the `k.faces` knowledge world of sop-knowledge-worlds, read like `k.objects` (src/knowledge/catalog.mjs: SOP wires,
// one per line; src/loaders/knowledge-source.mjs reads the file). Until the real world lands, FACES_STUB is the same shape with 3 variants per slot, so that
// `useFaces(parseFaces(realText))` replaces it without a change anywhere else. Browser-safe: no imports.
//
//   @s.<slot> k.faces.slot name x y w h z pair=yes|no optional=yes|no word=...      the anchor box of a slot in the face frame (centre x y, size w h; a pair is the left one, the right is its mirror)
//   @v.<slot>.<id> k.faces.variant of=<slot> name feature=... pick=no (expression only) size=n    one variant of a slot, its plain features (round, long, thick, curly, ...)
//   @p.<slot>.<id>.<n> k.faces.shape of=<slot>.<id> shape=ellipse|rect|path x y w h d role stroke sw shade op rx layer=back   a part of the drawing in the slot's local frame (100 wide)
//   @pr.<name> k.faces.preset name <slot>=<id> colour.<role>=<name>                  @ex.<name> k.faces.expression name <slot>=<id> <slot>.left|right=<id> alt.<slot>=<id> word=...
//   @c.<role>.<name> k.faces.colour role name rgb     @y.<word> k.faces.synonym word means     @u.<word> k.faces.unsupported word   (a feature the catalog does not draw yet)

const unq = (t) => (t.startsWith('"') ? JSON.parse(t) : t);
export function parseLine(line) {
  const m = /^@(\S+)\s+(\S+)\s*(.*)$/.exec(line);
  if (!m) return null;
  const attrs = {};
  for (const t of m[3].matchAll(/([A-Za-z_.]+)=("(?:[^"\\]|\\.)*"|\S+)/g)) (attrs[t[1]] ??= []).push(unq(t[2]));
  return { id: m[1], type: m[2], attrs };
}
const one = (a, k, d) => a[k]?.[0] ?? d;
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

/** Reads the text of a k.faces shard into { frame, slots: [{ name, x, y, w, h, z, pair, optional, words, variants: [{ id, name, features, pick, size, shapes }] }], presets, expressions, colours, synonyms, unsupported }. */
export function parseFaces(text) {
  const out = { frame: { w: 100, h: 120 }, slots: [], presets: {}, expressions: {}, colours: {}, synonyms: {}, unsupported: [] };
  const slot = new Map(), variant = new Map();
  for (const line of String(text).split('\n')) {
    if (!line.startsWith('@')) continue;
    budget.tick('faces.parse');
    const w = parseLine(line);
    if (!w) continue;
    const a = w.attrs;
    if (w.type === 'k.faces.set') out.frame = { w: Number(one(a, 'frame_w', 100)), h: Number(one(a, 'frame_h', 120)) };
    else if (w.type === 'k.faces.slot') {
      const s = { name: a.name[0], x: Number(a.x[0]), y: Number(a.y[0]), w: Number(a.w[0]), h: Number(a.h[0]), z: Number(one(a, 'z', 10)), pair: one(a, 'pair') === 'yes', optional: one(a, 'optional') === 'yes', words: a.word ?? [], variants: [] };
      slot.set(s.name, s); out.slots.push(s);
    } else if (w.type === 'k.faces.variant') {
      const v = { id: a.name[0], slot: a.of[0], features: a.feature ?? [], pick: one(a, 'pick') !== 'no', size: Number(one(a, 'size', 0)), shapes: [] };
      variant.set(`${v.slot}.${v.id}`, v); slot.get(v.slot)?.variants.push(v);
    } else if (w.type === 'k.faces.shape') {
      const sh = { shape: a.shape[0] };
      for (const k of ['x', 'y', 'w', 'h', 'sw', 'op', 'shade', 'rx']) if (a[k]) sh[k] = Number(a[k][0]);
      for (const k of ['d', 'role', 'stroke', 'layer', 'fill']) if (a[k]) sh[k] = a[k][0];
      sh.n = Number(one(a, 'n', 0));
      variant.get(a.of[0])?.shapes.push(sh);
    } else if (w.type === 'k.faces.preset') {
      const p = { name: a.name[0], slots: {}, colours: {}, word: a.word ?? [] };
      for (const [k, v] of Object.entries(a)) { if (k.startsWith('colour.')) p.colours[k.slice(7)] = v[0]; else if (!['name', 'word'].includes(k)) p.slots[k] = v[0]; }
      out.presets[p.name] = p;
    } else if (w.type === 'k.faces.expression') {
      const e = { name: a.name[0], over: {}, alt: {}, words: a.word ?? [] };
      for (const [k, v] of Object.entries(a)) { if (k.startsWith('alt.')) e.alt[k.slice(4)] = v[0]; else if (!['name', 'word'].includes(k)) e.over[k] = v[0]; }
      out.expressions[e.name] = e;
    } else if (w.type === 'k.faces.colour') (out.colours[a.role[0]] ??= {})[a.name[0]] = a.rgb[0];
    else if (w.type === 'k.faces.synonym') out.synonyms[a.word[0]] = a.means[0];
    else if (w.type === 'k.faces.unsupported') out.unsupported.push(a.word[0]);
  }
  for (const s of out.slots) for (const v of s.variants) v.shapes.sort((p, q) => p.n - q.n);
  return out;
}

const P = (slot, id, shapes) => shapes.map((s, i) => {
  const { shape, ...r } = s;
  return `@p.${slot}.${id}.${i + 1} k.faces.shape of=${slot}.${id} shape=${shape} n=${i + 1} ${Object.entries(r).map(([k, v]) => `${k}=${typeof v === 'string' && /[\s"]/.test(v) ? JSON.stringify(v) : v}`).join(' ')}`;
}).join('\n');
const V = (slot, id, feats, shapes, extra = '') => `@v.${slot}.${id} k.faces.variant of=${slot} name=${id} ${feats.map((f) => `feature=${f}`).join(' ')} ${extra}\n${P(slot, id, shapes)}`.trimEnd();
const E = (x, y, w, h, role, more = {}) => ({ shape: 'ellipse', x, y, w, h, role, ...more });
const L = (d, stroke, sw, more = {}) => ({ shape: 'path', d, fill: 'none', stroke, sw, ...more });
const F = (d, role, more = {}) => ({ shape: 'path', d, role, ...more });
const EYE = (white, iris, pupil, hl) => [E(...white, 'white', { stroke: 'line', sw: 2.5 }), E(...iris, 'iris'), E(...pupil, 'pupil'), ...(hl ? [E(...hl, 'white')] : [])];

const SLOTS = [
  ['face', 50, 62, 64, 76, 10, 'no', 'no', ['face', 'head']],
  ['hair', 50, 46, 86, 80, 12, 'no', 'yes', ['hair', 'hairstyle', 'haircut']],
  ['eyes', 35, 58, 19, 13, 20, 'yes', 'no', ['eye', 'eyes']],
  ['eyebrows', 35, 44, 22, 7, 21, 'yes', 'no', ['eyebrow', 'eyebrows', 'brow', 'brows']],
  ['nose', 50, 74, 18, 16, 22, 'no', 'no', ['nose']],
  ['beard', 50, 90, 56, 50, 25, 'no', 'yes', ['beard', 'moustache', 'mustache', 'goatee']],
  ['mouth', 50, 90, 28, 14, 26, 'no', 'no', ['mouth', 'lips', 'lip', 'smile']],
  ['glasses', 50, 58, 72, 26, 30, 'no', 'yes', ['glasses', 'glass', 'spectacles', 'spectacle', 'sunglasses', 'sunglass', 'shades', 'shade']],
  ['earrings', 19, 73, 10, 18, 24, 'yes', 'yes', ['earring', 'earrings']],
  ['hat', 50, 24, 84, 50, 35, 'no', 'yes', ['hat', 'hats', 'cap', 'caps', 'beanie', 'beanies']],
];
const NECK = F('M30 98 L30 132 L70 132 L70 98 Z', 'skin', { shade: -0.15, layer: 'back' });
const SHIRT = F('M-40 160 Q-30 126 30 124 L70 124 Q130 126 140 160 L140 175 L-40 175 Z', 'shirt', { layer: 'back' });
const VARIANTS = [
  V('face', 'round', ['round', 'chubby', 'wide'], [NECK, SHIRT, E(0, 4, 100, 112, 'skin', { stroke: 'line', sw: 2 })]),
  V('face', 'long', ['long', 'thin', 'narrow', 'oval'], [NECK, SHIRT, F('M10 30 Q8 0 50 0 Q92 0 90 30 L87 82 Q80 118 50 126 Q20 118 13 82 Z', 'skin', { stroke: 'line', sw: 2 })]),
  V('face', 'square', ['square', 'strong', 'angular', 'boxy'], [NECK, SHIRT, F('M3 28 Q3 2 50 2 Q97 2 97 28 L98 84 Q97 112 74 118 L26 118 Q3 112 2 84 Z', 'skin', { stroke: 'line', sw: 2 })]),
  V('hair', 'short', ['short', 'neat', 'tidy', 'cropped', 'boyish'], [F('M5 64 Q1 12 50 10 Q99 12 95 64 Q89 38 68 34 Q50 44 30 32 Q12 40 5 64 Z', 'hair')], 'size=1'),
  V('hair', 'curly', ['curly', 'wavy', 'big', 'messy', 'afro'], [E(-4, 8, 42, 50, 'hair', { layer: 'back' }), E(26, -2, 48, 42, 'hair', { layer: 'back' }), E(62, 8, 42, 50, 'hair', { layer: 'back' }), E(-8, 38, 34, 54, 'hair', { layer: 'back' }), E(74, 38, 34, 54, 'hair', { layer: 'back' }), E(10, 14, 30, 26, 'hair'), E(34, 8, 32, 26, 'hair'), E(60, 14, 30, 26, 'hair')], 'size=2'),
  V('hair', 'long', ['long', 'straight', 'flowing', 'silky'], [F('M6 66 Q-2 4 50 5 Q102 4 94 66 L104 128 Q50 140 -4 128 Z', 'hair', { layer: 'back' }), F('M5 66 Q2 12 50 10 Q98 12 95 66 Q86 36 56 30 Q22 34 5 66 Z', 'hair')], 'size=3'),
  V('hair', 'none', ['bald', 'none', 'hairless'], [], 'pick=no'),
  V('eyes', 'round', ['round', 'normal', 'friendly'], EYE([6, 12, 88, 40], [30, 12, 40, 40], [40, 22, 20, 20], [52, 18, 8, 8])),
  V('eyes', 'narrow', ['narrow', 'small', 'thin', 'slim', 'almond'], EYE([4, 20, 92, 26], [36, 20, 28, 26], [43, 24, 14, 18], [50, 24, 6, 6])),
  V('eyes', 'big', ['big', 'large', 'wide', 'huge', 'cartoon'], EYE([0, 0, 100, 62], [24, 3, 52, 56], [37, 16, 26, 28], [52, 10, 12, 12])),
  V('eyes', 'closed', ['closed', 'shut'], [L('M4 34 Q50 58 96 34', 'line', 6)], 'pick=no'),
  V('eyes', 'sleepy', ['sleepy', 'tired', 'heavy'], [...EYE([6, 14, 88, 36], [32, 18, 36, 32], [41, 24, 18, 20]), F('M-2 6 L102 6 L102 33 Q50 42 -2 33 Z', 'skin'), L('M2 33 Q50 42 98 33', 'line', 5)], 'pick=no'),
  V('eyebrows', 'thin', ['thin', 'light', 'fine', 'narrow'], [L('M4 24 Q48 6 96 18', 'brow', 6)]),
  V('eyebrows', 'thick', ['thick', 'bushy', 'heavy', 'dark', 'strong'], [L('M4 26 Q48 6 96 18', 'brow', 15)]),
  V('eyebrows', 'arched', ['arched', 'curved', 'high', 'elegant'], [L('M4 30 Q40 -6 96 24', 'brow', 8)]),
  V('eyebrows', 'angry', ['angry', 'frowning'], [L('M4 6 L96 28', 'brow', 11)], 'pick=no'),
  V('eyebrows', 'sad', ['sad', 'worried'], [L('M4 28 L96 6', 'brow', 8)], 'pick=no'),
  V('eyebrows', 'raised', ['raised', 'surprised'], [L('M4 24 Q48 -14 96 14', 'brow', 8)], 'pick=no'),
  V('nose', 'small', ['small', 'short', 'button', 'little', 'cute'], [L('M44 8 Q40 50 34 62 Q50 74 66 62', 'nose', 6)]),
  V('nose', 'long', ['long', 'big', 'pointed', 'large', 'tall'], [L('M46 0 Q40 60 26 78 Q50 92 74 78', 'nose', 7)]),
  V('nose', 'wide', ['wide', 'broad', 'flat', 'round', 'big'], [L('M40 0 Q38 50 14 70 Q50 92 86 70', 'nose', 7), E(18, 62, 16, 10, 'nose'), E(66, 62, 16, 10, 'nose')]),
  V('mouth', 'smile', ['smile', 'smiling', 'happy', 'cheerful', 'friendly'], [L('M4 14 Q50 52 96 14', 'lips', 9)]),
  V('mouth', 'flat', ['flat', 'straight', 'serious', 'neutral', 'thin', 'closed'], [L('M10 26 L90 26', 'lips', 9)]),
  V('mouth', 'full', ['full', 'thick', 'big', 'lips', 'red'], [F('M0 26 Q20 4 50 14 Q80 4 100 26 Q50 58 0 26 Z', 'lips'), L('M2 26 Q50 34 98 26', 'line', 3)]),
  V('mouth', 'open', ['open', 'talking', 'shouting'], [E(22, 4, 56, 44, 'mouthin', { stroke: 'lips', sw: 6 }), E(34, 30, 32, 16, 'tongue')], 'pick=no'),
  V('mouth', 'frown', ['frown', 'frowning', 'sad', 'unhappy'], [L('M6 42 Q50 4 94 42', 'lips', 9)], 'pick=no'),
  V('mouth', 'grin', ['grin', 'grinning', 'laughing', 'teeth'], [F('M2 10 Q50 66 98 10 Z', 'white', { stroke: 'lips', sw: 6 })], 'pick=no'),
  V('beard', 'stubble', ['stubble', 'short', 'light', 'small'], [F('M0 10 Q4 56 50 68 Q96 56 100 10 Q76 38 50 38 Q24 38 0 10 Z', 'hair', { op: 0.35 })]),
  V('beard', 'moustache', ['moustache', 'mustache', 'thin'], [F('M12 22 Q30 12 50 24 Q70 12 88 22 Q70 40 50 34 Q30 40 12 22 Z', 'hair')]),
  V('beard', 'full', ['full', 'long', 'thick', 'big', 'bushy'], [F('M-2 10 Q2 74 50 86 Q98 74 102 10 Q84 42 50 38 Q16 42 -2 10 Z', 'hair')]),
  V('beard', 'none', ['none', 'shaved'], [], 'pick=no'),
  V('glasses', 'round', ['round', 'circle', 'circular', 'thin'], [E(11, 1, 38, 34, 'none', { stroke: 'glass', sw: 4 }), E(51, 1, 38, 34, 'none', { stroke: 'glass', sw: 4 }), L('M49 14 Q50 10 51 14', 'glass', 4), L('M11 12 L0 8', 'glass', 4), L('M89 12 L100 8', 'glass', 4)]),
  V('glasses', 'square', ['square', 'rectangular', 'boxy', 'strong'], [{ shape: 'rect', x: 10, y: 4, w: 40, h: 30, rx: 6, role: 'none', stroke: 'glass', sw: 4 }, { shape: 'rect', x: 50, y: 4, w: 40, h: 30, rx: 6, role: 'none', stroke: 'glass', sw: 4 }, L('M48 14 L52 14', 'glass', 4), L('M10 12 L0 8', 'glass', 4), L('M90 12 L100 8', 'glass', 4)]),
  V('glasses', 'sun', ['sun', 'dark', 'shades', 'sunglasses', 'black'], [{ shape: 'rect', x: 10, y: 4, w: 40, h: 30, rx: 8, role: 'glass', op: 0.88 }, { shape: 'rect', x: 50, y: 4, w: 40, h: 30, rx: 8, role: 'glass', op: 0.88 }, L('M48 14 L52 14', 'glass', 4), L('M10 12 L0 8', 'glass', 4), L('M90 12 L100 8', 'glass', 4)]),
  V('glasses', 'none', ['none'], [], 'pick=no'),
  // looks of a robot (screen face, glowing eyes, antenna, speaker mouth) and of an emoji (round face, dot eyes): variants only the presets pick (pick=no)
  V('face', 'robot', ['robot', 'metal'], [NECK, SHIRT, { shape: 'rect', x: 2, y: 4, w: 96, h: 112, rx: 16, role: 'skin', stroke: 'line', sw: 2 }, { shape: 'rect', x: 13, y: 14, w: 74, h: 74, rx: 9, role: 'screen', stroke: 'line', sw: 2 }], 'pick=no'),
  V('face', 'emoji', ['emoji', 'round', 'smiley'], [E(-14, -6, 128, 130, 'skin', { stroke: 'line', sw: 2 })], 'pick=no'),
  V('hair', 'antenna', ['antenna'], [L('M50 24 L50 8', 'line', 3), E(43, 0, 14, 14, 'iris', { stroke: 'line', sw: 2 })], 'pick=no'),
  V('eyes', 'led', ['led', 'glowing', 'robot'], [E(10, 6, 80, 50, 'iris', { stroke: 'line', sw: 2 }), E(30, 16, 30, 24, 'white', { op: 0.55 })], 'pick=no'),
  V('eyes', 'dot', ['dot', 'dots', 'emoji'], [E(22, 2, 56, 58, 'pupil')], 'pick=no'),
  V('eyebrows', 'none', ['none'], [], 'pick=no'),
  V('nose', 'none', ['none'], [], 'pick=no'),
  V('mouth', 'grille', ['grille', 'speaker', 'robot'], [{ shape: 'rect', x: 8, y: 0, w: 84, h: 44, rx: 8, role: 'none', stroke: 'line', sw: 5 }, L('M22 12 L78 12', 'line', 4), L('M22 22 L78 22', 'line', 4), L('M22 32 L78 32', 'line', 4)], 'pick=no'),
  V('hat', 'cap', ['cap', 'baseball', 'sports'], [F('M6 34 Q4 2 50 0 Q96 2 94 34 Z', 'hat', { stroke: 'line', sw: 2 }), F('M0 34 L100 34 Q108 42 98 44 L6 44 Q-6 42 0 34 Z', 'hat', { stroke: 'line', sw: 2, shade: -0.2 })]),
  V('hat', 'beanie', ['beanie', 'woolly', 'wool', 'warm', 'winter'], [F('M5 40 Q4 6 50 4 Q96 6 95 40 Z', 'hat', { stroke: 'line', sw: 2 }), F('M2 38 L98 38 L98 52 L2 52 Z', 'hat', { stroke: 'line', sw: 2, shade: -0.2 }), E(40, -10, 20, 20, 'hat', { stroke: 'line', sw: 2, shade: 0.2 })]),
  V('hat', 'tophat', ['tophat', 'top', 'tall', 'formal', 'fancy'], [F('M26 4 L74 4 L72 36 L28 36 Z', 'hat', { stroke: 'line', sw: 2 }), F('M26 28 L74 28 L73 36 L27 36 Z', 'line'), E(4, 32, 92, 16, 'hat', { stroke: 'line', sw: 2, shade: -0.2 })]),
  V('hat', 'none', ['none'], [], 'pick=no'),
  V('earrings', 'stud', ['stud', 'small', 'tiny', 'button'], [E(10, 0, 80, 56, 'jewel', { stroke: 'line', sw: 5 })]),
  V('earrings', 'hoop', ['hoop', 'ring', 'round', 'big', 'large'], [E(8, 0, 84, 120, 'none', { stroke: 'jewel', sw: 14 })]),
  V('earrings', 'drop', ['drop', 'dangling', 'long', 'hanging', 'pendant'], [L('M50 0 L50 50', 'jewel', 8), E(12, 46, 76, 120, 'jewel', { stroke: 'line', sw: 4 })]),
  V('earrings', 'none', ['none'], [], 'pick=no'),
];
const COL = {
  skin: { yellow: 'fcd34d', silver: 'b8c2cc', sky: '74c0fc', pale: 'f8dcc4', light: 'f1c9a5', tan: 'd9a066', brown: 'a8693f', dark: '6b4226' },
  hair: { black: '1d1a18', brown: '5a3a22', blonde: 'e0b95a', red: 'b5441c', grey: '9a9a9a', white: 'e8e8e8', blue: '3b6fd1', green: '3a9a5a', pink: 'e87bb0', purple: '8a4fc0', orange: 'e8872b' },
  iris: { cyan: '3bc9db', blue: '3b78d4', green: '3f9a56', brown: '6b4423', grey: '7a8a96', hazel: '8a6a2c', black: '1d1a18' },
  lips: { red: 'c0392b', pink: 'e07a8a', brown: '9a5a4a' },
  glass: { black: '22262b', red: 'c0392b', blue: '2f5fb3', gold: 'c8a24a', green: '2f7a4a' },
  background: { blue: 'b6e3f4', pink: 'f8c8dc', green: 'c8efd0', yellow: 'fbeeb0', purple: 'd9c8f0', orange: 'fbd6b0', grey: 'd8dde3', gray: 'd8dde3', white: 'ffffff', black: '23262b', red: 'f4b3b3', beige: 'efe3d0' },
  hat: { red: 'c0392b', blue: '3b6fd1', green: '3a9a5a', yellow: 'e8c85a', black: '2a2d31', white: 'f1f1f1', brown: '7a5230', purple: '8a4fc0', pink: 'e87bb0', orange: 'e8872b', grey: '9a9a9a' },
  jewel: { gold: 'd6a93a', silver: 'c3c9d0', red: 'c0392b', blue: '3b6fd1', green: '3a9a5a', pink: 'e87bb0', purple: '8a4fc0', black: '2a2d31', white: 'f1f1f1' },
  shirt: { blue: '5b8fd6', red: 'd65b5b', green: '5bb07a', yellow: 'e8c85a', pink: 'e88bb0', purple: '8a6ad0', orange: 'e8923a', white: 'f1f1f1', black: '33363b', grey: '9aa0a8' },
};
const GENERIC = { red: 'c0392b', green: '3a9a5a', blue: '3b6fd1', yellow: 'e8c85a', orange: 'e8872b', purple: '8a4fc0', pink: 'e87bb0', brown: '6b4423', black: '1d1a18', white: 'f1f1f1', grey: '9a9a9a', gold: 'c8a24a' };
const NOACC = { hat: 'none', earrings: 'none' };
const PRESETS = [
  ['girl', { face: 'round', hair: 'long', eyes: 'big', eyebrows: 'thin', nose: 'small', mouth: 'smile', beard: 'none', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'light', hair: 'brown', iris: 'green', shirt: 'pink' }],
  ['boy', { face: 'round', hair: 'short', eyes: 'round', eyebrows: 'thick', nose: 'small', mouth: 'smile', beard: 'none', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'light', hair: 'brown', iris: 'brown', shirt: 'blue' }],
  ['woman', { face: 'long', hair: 'curly', eyes: 'round', eyebrows: 'arched', nose: 'small', mouth: 'full', beard: 'none', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'tan', hair: 'red', iris: 'brown', shirt: 'purple' }],
  ['man', { face: 'square', hair: 'short', eyes: 'narrow', eyebrows: 'thick', nose: 'long', mouth: 'flat', beard: 'stubble', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'light', hair: 'black', iris: 'blue', shirt: 'green' }],
  ['grandma', { face: 'round', hair: 'curly', eyes: 'round', eyebrows: 'thin', nose: 'small', mouth: 'smile', beard: 'none', glasses: 'round', ...NOACC }, { background: 'blue', skin: 'pale', hair: 'grey', iris: 'blue', shirt: 'yellow' }],
  ['grandpa', { face: 'square', hair: 'none', eyes: 'narrow', eyebrows: 'thick', nose: 'wide', mouth: 'smile', beard: 'full', glasses: 'round', ...NOACC }, { background: 'blue', skin: 'tan', hair: 'white', iris: 'grey', shirt: 'blue' }],
];
PRESETS.push(
  ['robot', { face: 'robot', hair: 'antenna', eyes: 'led', eyebrows: 'none', nose: 'none', mouth: 'grille', beard: 'none', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'sky', iris: 'cyan', shirt: 'grey', lips: 'brown' }],
  ['emoji', { face: 'emoji', hair: 'none', eyes: 'dot', eyebrows: 'none', nose: 'none', mouth: 'smile', beard: 'none', glasses: 'none', ...NOACC }, { background: 'blue', skin: 'yellow', lips: 'brown' }],
);
const EXPR = [
  ['neutral', {}, '', ['normal', 'calm', 'plain']],
  ['happy', { mouth: 'grin', eyebrows: 'arched' }, '', ['smiling', 'cheerful', 'glad', 'laughing', 'joyful', 'grinning']],
  ['sad', { mouth: 'frown', eyebrows: 'sad' }, '', ['unhappy', 'upset', 'crying', 'gloomy']],
  ['angry', { mouth: 'frown', eyebrows: 'angry' }, '', ['mad', 'cross', 'furious', 'grumpy']],
  ['surprised', { mouth: 'open', eyes: 'big', eyebrows: 'raised' }, '', ['shocked', 'amazed', 'astonished']],
  ['sleepy', { eyes: 'sleepy', mouth: 'flat' }, '', ['tired', 'drowsy']],
  ['wink', { 'eyes.right': 'closed', mouth: 'smile' }, '', ['winking']],
  ['talking', { mouth: 'open' }, 'alt.mouth=flat', []],
];
export const FACES_STUB = [
  '@faces k.faces.set frame_w=100 frame_h=120',
  ...SLOTS.map(([n, x, y, w, h, z, pair, opt, words]) => `@s.${n} k.faces.slot name=${n} x=${x} y=${y} w=${w} h=${h} z=${z} pair=${pair} optional=${opt} ${words.map((q) => `word=${q}`).join(' ')}`),
  ...VARIANTS,
  ...PRESETS.map(([n, s, c]) => `@pr.${n} k.faces.preset name=${n} ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ')} ${Object.entries(c).map(([k, v]) => `colour.${k}=${v}`).join(' ')}`),
  ...EXPR.map(([n, o, alt, ws]) => `@ex.${n} k.faces.expression name=${n} ${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ')} ${alt} ${ws.map((x) => `word=${x}`).join(' ')}`.trimEnd()),
  ...Object.entries(COL).flatMap(([role, m]) => Object.entries(m).map(([n, rgb]) => `@c.${role}.${n} k.faces.colour role=${role} name=${n} rgb=${rgb}`)),
  ...Object.entries(GENERIC).map(([n, rgb]) => `@c.any.${n} k.faces.colour role=any name=${n} rgb=${rgb}`),
  ...Object.entries({ tiny: 'small', little: 'small', huge: 'big', large: 'big', enormous: 'big', wavy: 'curly', blond: 'blonde', ginger: 'red', gray: 'grey', spectacles: 'glasses', mustache: 'moustache', bearded: 'full' }).map(([w, m]) => `@y.${w} k.faces.synonym word=${w} means=${m}`),
  ...['freckles', 'scar', 'dimples', 'wrinkles', 'tattoo', 'piercing', 'ears', 'makeup', 'bow', 'headband', 'braces', 'necklace', 'scarf'].map((w) => `@u.${w} k.faces.unsupported word=${w}`),
].join('\n') + '\n';

let current = null;
/** The face data in use (the stub until the catalog's `k.faces` is loaded). */
export function getFaces() { return (current ??= parseFaces(FACES_STUB)); }
/** Replaces the data (the host loaded the real `k.faces`): `useFaces(parseFaces(text))`; `useFaces(null)` goes back to the stub. */
export function useFaces(data) { current = data; }
