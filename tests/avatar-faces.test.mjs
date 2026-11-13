// SPDX-License-Identifier: AGPL-3.0-only
// AVATAR-FROM-PARTS: the drawn face. The data (k.faces stub, loaded like k.objects), the renderer, the description of a face (60 seeded descriptions), single-element
// changes (30), expressions, presets and saved faces, undo, and the same sentences through both reasoners. No network: the catalog is a local directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { createFaces, FACES_PATH } from '../src/knowledge/faces.mjs';
import { parseFaces, getFaces, useFaces, FACES_STUB } from '../worlds/ui.avatar/facedata.mjs';
import { renderFace, variantSvg, variantFor } from '../worlds/ui.avatar/facedraw.mjs';
import * as F from '../worlds/ui.avatar/faceops.mjs';
import { faceOptionSay, FACE_EXPRESSIONS } from '../docs/webchat/ui/avatar.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const data = getFaces();
const slotNames = data.slots.map((s) => s.name);
const pick = (slot) => data.slots.find((s) => s.name === slot).variants.filter((v) => v.pick);
const newCtx = (preset = 'woman') => { const ctx = { state: {}, request() {} }; F.faceOf(ctx); F.facePreset(ctx, preset); return ctx; };
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('data: every slot has at least 3 variants to choose from, presets and expressions name variants that exist, colours resolve', () => {
  assert.deepEqual(slotNames, ['face', 'hair', 'eyes', 'eyebrows', 'nose', 'beard', 'mouth', 'glasses']);
  for (const s of data.slots) assert.ok(pick(s.name).length >= 3, `${s.name}: ${pick(s.name).length} variants`);
  const has = (slot, id) => data.slots.find((s) => s.name === slot).variants.some((v) => v.id === id);
  for (const p of Object.values(data.presets)) for (const [slot, id] of Object.entries(p.slots)) assert.ok(has(slot, id), `${p.name}: ${slot}=${id}`);
  for (const e of Object.values(data.expressions)) for (const [k, id] of [...Object.entries(e.over), ...Object.entries(e.alt)]) assert.ok(has(k.split('.')[0], id), `${e.name}: ${k}=${id}`);
  for (const w of ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'wink']) assert.ok(data.expressions[w], w);
  assert.ok(Object.keys(data.presets).length >= 4);
  for (const p of Object.values(data.presets)) for (const [role, name] of Object.entries(p.colours)) assert.ok(F.colourHex(data, role, name), `${p.name}: ${role}=${name}`);
});

test('data is read like k.objects: through the knowledge source, a local directory; no catalog or no network keeps the stub; a catalog replaces it', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kfaces-'));
  try {
    const empty = createFaces({ source: createKnowledgeSource(dir) });
    assert.equal(await empty.load(), 'stub');
    assert.ok(empty.data.slots.length >= 8);
    // a catalog with one more variant of the nose
    await mkdir(path.join(dir, path.dirname(FACES_PATH)), { recursive: true });
    const extra = `${FACES_STUB}@v.nose.hooked k.faces.variant of=nose name=hooked feature=hooked feature=crooked\n@p.nose.hooked.1 k.faces.shape of=nose.hooked shape=path n=1 d="M44 0 Q60 40 30 70 Q50 80 70 70" fill=none stroke=nose sw=7\n`;
    await writeFile(path.join(dir, FACES_PATH), extra);
    const real = createFaces({ source: createKnowledgeSource(dir) });
    assert.equal(await real.load(), 'catalog');
    assert.ok(getFaces().slots.find((s) => s.name === 'nose').variants.some((v) => v.id === 'hooked'));
    const ctx = newCtx();
    assert.match(F.faceDescribe(ctx, { words: 'a face with a hooked nose' }).value, /hooked nose/, 'the new variant is chosen by its features, no change to the code');
    assert.equal(ctx.state.face.slots.nose, 'hooked');
    assert.match(renderFace(ctx.state.face, {}, getFaces()), /<svg/);
  } finally { useFaces(null); await rm(dir, { recursive: true, force: true }); }
  assert.ok(!getFaces().slots.find((s) => s.name === 'nose').variants.some((v) => v.id === 'hooked'));
  assert.equal(parseFaces(FACES_STUB).slots.length, data.slots.length);
});

test('renderer: one slot after another, a mirrored pair, the palette; valid, finite, and different when a variant or a colour changes', () => {
  const ctx = newCtx('girl'), f = ctx.state.face;
  const svg = renderFace(f, { size: 200 });
  assert.match(svg, /^<svg [^>]*viewBox="0 0 100 120"/);
  assert.equal((svg.match(/matrix\(-1 0 0 1 100 0\)/g) ?? []).length, 2, 'the right eye and the right eyebrow are the left ones flipped');
  assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  assert.ok(svg.includes('#f1c9a5'), 'the skin of the palette');
  assert.ok(svg.includes(`#${f.colours.iris}`), 'the iris colour');
  const order = (s) => [...s.matchAll(/<g(?: transform="matrix[^"]*")?><g transform=/g)].length;
  assert.ok(order(svg) >= 8, 'a group per drawn slot');
  const other = renderFace({ ...f, slots: { ...f.slots, nose: 'wide' } }, { size: 200 });
  assert.notEqual(svg, other);
  const red = renderFace({ ...f, colours: { ...f.colours, hair: 'ff0000' } }, { size: 200 });
  assert.ok(red.includes('#ff0000') && !svg.includes('#ff0000'));
  // the back layers (hair behind the head, the shirt) come before the face, the glasses after the eyes
  const long = renderFace({ ...f, slots: { ...f.slots, hair: 'long' } }, {});
  assert.ok(long.indexOf('#5a3a22') < long.indexOf('#f1c9a5'), 'long hair is drawn behind the face');
  for (const s of slotNames) for (const v of data.slots.find((x) => x.name === s).variants) assert.match(variantSvg(f, s, v.id), /^<svg /, `${s}.${v.id}`);
  assert.equal(variantFor(f, 'eyes', 'left')?.id, f.slots.eyes);
});

test('browser files: no node: imports, no unguarded process, loops tick the budget', async () => {
  for (const file of ['facedata', 'facedraw', 'faceops']) {
    const src = await readFile(root(`worlds/ui.avatar/${file}.mjs`), 'utf8');
    assert.doesNotMatch(src, /from ['"]node:|require\(|\bprocess\b/, file);
  }
  const draw = await readFile(root('worlds/ui.avatar/facedraw.mjs'), 'utf8');
  assert.match(draw, /budget\.tick\('faces\.draw'\)/);
});

// ---- 60 descriptions seeded from the features of the data ----------------------------------------------------------------------------------------------------
const uniqueFeature = (slot, v) => v.features.find((f) => pick(slot).every((o) => o === v || !o.features.includes(f)));
test('60 descriptions: the variant per slot that the words name (seeded from the features); unnamed slots keep their variant; colours follow the slot', () => {
  const r = rng(20261113);
  const SLOTS = ['face', 'eyes', 'eyebrows', 'nose', 'mouth', 'hair'];
  const colour = { eyes: ['iris', ['blue', 'green', 'brown', 'grey']], hair: ['hair', ['red', 'black', 'blonde', 'grey', 'brown', 'white']] };
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const ctx = newCtx(['girl', 'boy', 'man', 'grandma'][i % 4]), before = structuredClone(ctx.state.face.slots);
    const chosen = SLOTS.filter(() => r() < 0.6);
    if (chosen.length < 2) chosen.push(SLOTS[i % 6], SLOTS[(i + 3) % 6]);
    const want = {}, wantColour = {}, parts = [];
    for (const slot of new Set(chosen)) {
      const v = pick(slot)[Math.floor(r() * pick(slot).length)], f = uniqueFeature(slot, v);
      assert.ok(f, `${slot}.${v.id} has a feature of its own`);
      want[slot] = v.id;
      const c = colour[slot] && r() < 0.7 ? colour[slot][1][Math.floor(r() * colour[slot][1].length)] : null;
      if (c) wantColour[colour[slot][0]] = c;
      parts.push({ face: `a ${f} face`, eyes: `${f} ${c ?? ''} eyes`, eyebrows: `${f} eyebrows`, nose: `a ${f} nose`, mouth: `a ${f} mouth`, hair: `${f} ${c ?? ''} hair` }[slot].replace(/ +/g, ' '));
    }
    const text = `${['a woman', 'a man', 'a face'][i % 3]} with ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts.at(-1)}`;
    const reply = F.faceDescribe(ctx, { words: text });
    assert.equal(reply.status, 'supported', `${text}: ${reply.note}`);
    const f = ctx.state.face;
    for (const [slot, id] of Object.entries(want)) assert.equal(f.slots[slot], id, `${text}: ${slot}`);
    for (const [role, name] of Object.entries(wantColour)) assert.equal(f.colours[role], F.colourHex(data, role, name), `${text}: ${role}`);
    if (!/a (?:woman|man)/.test(text)) for (const s of slotNames) if (!(s in want)) assert.equal(f.slots[s], before[s], `${text}: unnamed ${s} keeps its variant`);
    assert.doesNotMatch(reply.value, /could not match|I have no/, text);
    n++;
  }
  assert.equal(n, 60);
});

test('describing says what was chosen and what could not be matched', () => {
  const ctx = newCtx('girl');
  const r = F.faceDescribe(ctx, { words: 'a woman with a long face, small green eyes, thick eyebrows and curly red hair, with glasses and freckles' });
  assert.match(r.value, /I drew a woman with a long face, narrow green eyes, thick eyebrows, curly red hair and round glasses\./);
  assert.match(r.value, /I have no freckles yet\./);
  assert.equal(ctx.state.face.slots.glasses, 'round');
  const w = F.faceDescribe(ctx, { words: 'wobbly nose and a pink mouth' });
  assert.match(w.value, /I have no wobbly nose yet/);
  const none = F.faceDescribe(newCtx(), { words: 'a blue banana' });
  assert.equal(none.status, 'unsupported');
  assert.match(none.note, /could not find a part of a face/);
  const beard = newCtx('man');
  F.faceDescribe(beard, { words: 'a man without a beard and with sunglasses' });
  assert.equal(beard.state.face.slots.beard, 'none');
  assert.equal(beard.state.face.slots.glasses, 'sun');
});

// ---- 30 single-element changes ---------------------------------------------------------------------------------------------------------------------------------
const CHANGES = [
  ['another nose', (c) => F.faceStep(c, { part: 'nose', dir: 'different' }), (f, b) => assert.notEqual(f.slots.nose, b.slots.nose)],
  ['the next mouth', (c) => F.faceStep(c, { part: 'mouth', dir: 'next' }), (f, b) => assert.notEqual(f.slots.mouth, b.slots.mouth)],
  ['the previous mouth', (c) => F.faceStep(c, { part: 'mouth', dir: 'previous' }), (f, b) => assert.notEqual(f.slots.mouth, b.slots.mouth)],
  ['next eyes', (c) => F.faceStep(c, { part: 'eye', dir: 'next' }), (f, b) => assert.notEqual(f.slots.eyes, b.slots.eyes)],
  ['another hairstyle', (c) => F.faceStep(c, { part: 'hairstyle', dir: 'different' }), (f, b) => { assert.notEqual(f.slots.hair, b.slots.hair); assert.notEqual(f.slots.hair, 'none'); }],
  ['a bigger nose', (c) => F.faceResize(c, { part: 'nose', dir: 'bigger' }), (f) => assert.ok(f.adj.nose.s > 1)],
  ['smaller eyes', (c) => F.faceResize(c, { part: 'eye', dir: 'smaller' }), (f) => assert.ok(f.adj.eyes.s < 1)],
  ['a bigger mouth', (c) => F.faceResize(c, { part: 'mouth', dir: 'bigger' }), (f) => assert.ok(f.adj.mouth.s > 1)],
  ['eyes closer together', (c) => F.faceMove(c, { part: 'eye', words: 'closer together' }), (f) => assert.ok(f.adj.eyes.dx > 0)],
  ['eyes further apart', (c) => F.faceMove(c, { part: 'eye', words: 'further apart' }), (f) => assert.ok(f.adj.eyes.dx < 0)],
  ['raise the eyebrows', (c) => F.faceMove(c, { part: 'eyebrow', words: 'raise' }), (f) => assert.ok(f.adj.eyebrows.dy < 0)],
  ['lower the mouth a bit', (c) => F.faceMove(c, { part: 'mouth', words: 'lower a bit' }), (f) => assert.ok(f.adj.mouth.dy > 0 && f.adj.mouth.dy <= 3)],
  ['move the nose down', (c) => F.faceMove(c, { part: 'nose', words: 'down' }), (f) => assert.ok(f.adj.nose.dy > 0)],
  ['longer hair', (c) => F.faceAdjust(c, { part: 'hair', dir: 'longer' }), (f) => assert.equal(f.slots.hair, 'long')],
  ['shorter hair', (c) => { F.faceAdjust(c, { part: 'hair', dir: 'longer' }); return F.faceAdjust(c, { part: 'hair', dir: 'shorter' }); }, (f) => assert.equal(f.slots.hair, 'curly')],
  ['blue eyes', (c) => F.faceColour(c, { part: 'eye', color: 'blue' }), (f) => assert.equal(f.colours.iris, F.colourHex(data, 'iris', 'blue'))],
  ['green eyes', (c) => F.faceColour(c, { part: 'eye', color: 'green' }), (f) => assert.equal(f.colours.iris, F.colourHex(data, 'iris', 'green'))],
  ['blue hair', (c) => F.faceColour(c, { part: 'hair', color: 'blue' }), (f) => assert.equal(f.colours.hair, F.colourHex(data, 'hair', 'blue'))],
  ['red lips', (c) => F.faceColour(c, { part: 'lip', color: 'red' }), (f) => assert.equal(f.colours.lips, F.colourHex(data, 'lips', 'red'))],
  ['dark skin', (c) => F.faceColour(c, { part: 'skin', color: 'dark' }), (f) => assert.equal(f.colours.skin, F.colourHex(data, 'skin', 'dark'))],
  ['darker hair', (c) => F.faceShift(c, { part: 'hair', dir: 'darker' }), (f, b) => assert.notEqual(f.colours.hair, b.colours.hair)],
  ['no beard (already none)', (c) => F.faceRemove(c, { part: 'beard' }), (f) => assert.equal(f.slots.beard, 'none')],
  ['give yourself a beard', (c) => F.faceSetPart(c, { part: 'beard', value: 'beard' }), (f) => assert.notEqual(f.slots.beard, 'none')],
  ['no hair', (c) => F.faceRemove(c, { part: 'hair' }), (f) => assert.equal(f.slots.hair, 'none')],
  ['swap the glasses for round ones', (c) => F.faceSetPart(c, { part: 'glass', words: 'round ones' }), (f) => assert.equal(f.slots.glasses, 'round')],
  ['make the nose small', (c) => F.faceSetPart(c, { part: 'nose', words: 'small' }), (f) => assert.equal(f.slots.nose, 'small')],
  ['make the hair curly', (c) => F.faceSetPart(c, { part: 'hair', words: 'curly' }), (f) => assert.equal(f.slots.hair, 'curly')],
  ['sunglasses', (c) => F.faceSetPart(c, { value: 'sunglass' }), (f) => assert.equal(f.slots.glasses, 'sun')],
  ['eyebrows 3', (c) => F.faceSetPart(c, { part: 'eyebrow', n: '3' }), (f) => assert.equal(f.slots.eyebrows, 'arched')],
  ['take everything off', (c) => F.faceRemoveAll(c), (f) => assert.ok(f.slots.hair === 'none' && f.slots.beard === 'none' && f.slots.glasses === 'none')],
  ['reset the nose', (c) => { F.faceResize(c, { part: 'nose', dir: 'bigger' }); return F.faceReset(c, { part: 'nose' }); }, (f) => assert.equal(f.adj.nose, undefined)],
];
test(`${CHANGES.length} single-element changes: one part changes, the rest of the face stays, the reply is plain`, () => {
  assert.ok(CHANGES.length >= 30);
  for (const [name, run, check] of CHANGES) {
    const ctx = newCtx('woman'), before = structuredClone(ctx.state.face);
    const r = run(ctx);
    assert.equal(r.status, 'supported', `${name}: ${r.note ?? r.value}`);
    assert.match(r.value, /^[A-Z]/, name);
    assert.doesNotMatch(r.value, /undefined|NaN|\[object|k\.faces|slot/, `${name}: ${r.value}`);
    check(ctx.state.face, before);
    assert.match(renderFace(ctx.state.face, {}), /<svg/, name);
  }
});

test('size and place stay inside the face frame with limits; the SPACE module does the moving', () => {
  const ctx = newCtx(), f = ctx.state.face;
  for (let i = 0; i < 12; i++) F.faceMove(ctx, { part: 'eye', words: 'closer together a lot' });
  const eyes = data.slots.find((s) => s.name === 'eyes');
  assert.ok(eyes.x + f.adj.eyes.dx + eyes.w / 2 <= 49, 'the eyes never touch in the middle');
  for (let i = 0; i < 12; i++) F.faceMove(ctx, { part: 'eyebrow', words: 'up' });
  const brow = data.slots.find((s) => s.name === 'eyebrows');
  assert.ok(brow.y + f.adj.eyebrows.dy <= eyes.y + (f.adj.eyes.dy ?? 0) - 8, 'the eyebrows stay above the eyes');
  const again = F.faceMove(ctx, { part: 'eyebrow', words: 'up' });
  assert.match(again.value, /cannot go further/);
  for (let i = 0; i < 20; i++) F.faceResize(ctx, { part: 'nose', dir: 'bigger' });
  assert.ok(f.adj.nose.s <= 1.5);
  for (let i = 0; i < 20; i++) F.faceResize(ctx, { part: 'nose', dir: 'smaller' });
  assert.ok(f.adj.nose.s >= 0.6);
  assert.equal(F.faceMove(ctx, { part: 'face', words: 'left' }).status, 'unsupported');
  assert.equal(F.faceMove(ctx, { part: 'nose', words: 'sideways' }).status, 'unsupported');
  assert.match(renderFace(f, {}), /<svg/);
});

test('expressions: happy, sad, angry, surprised, sleepy, wink switch the variants of k.faces.expression; a changed part is the user\'s choice', () => {
  const ctx = newCtx(), f = ctx.state.face;
  const plain = renderFace(f, {});
  const seen = new Set([plain]);
  for (const e of ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'wink']) {
    const r = F.faceMood(ctx, { mood: e });
    assert.equal(r.status, 'supported', e);
    assert.equal(f.expression, e);
    const svg = renderFace(f, {});
    assert.ok(!seen.has(svg), `${e} looks different`); seen.add(svg);
  }
  assert.equal(variantFor(f, 'eyes', 'left')?.id, f.slots.eyes, 'a wink closes one eye only');
  assert.equal(variantFor(f, 'eyes', 'right')?.id, 'closed');
  F.faceMood(ctx, { mood: 'surprised' });
  assert.equal(variantFor(f, 'mouth', 'left').id, 'open');
  F.faceStep(ctx, { part: 'mouth', dir: 'next' });
  assert.notEqual(f.expression, 'surprised', 'choosing another mouth ends the expression, the other parts stay as drawn');
  assert.equal(f.slots.eyes, 'big');
  assert.equal(F.faceMood(ctx, { mood: 'cheerful' }).status, 'supported');
  assert.equal(f.expression, 'happy');
  assert.match(F.faceMood(ctx, { mood: 'grumpyish' }).note, /I can look happy, sad, angry, surprised, sleepy or wink/);
  assert.match(F.faceCheckMood(ctx, { mood: 'happy' }).value, /^Yes/);
  assert.match(F.faceCheckMood(ctx, { mood: 'sad' }).value, /^No/);
  // the talking mouth: the pair of the data
  const t = data.expressions.talking;
  const open = renderFace(f, { over: t.over }), flat = renderFace(f, { over: { ...t.over, ...t.alt } });
  assert.notEqual(open, flat);
  assert.equal(t.over.mouth, 'open'); assert.equal(t.alt.mouth, 'flat');
});

test('presets and saved faces: be a preset, save under a name, load it again, names are checked', () => {
  const ctx = newCtx('girl'), f = ctx.state.face;
  F.faceDescribe(ctx, { words: 'a face with a thick beard and green eyes' });
  const was = JSON.stringify([f.slots, f.colours]);
  assert.match(F.faceSave(ctx, { name: 'Grandma Ann' }).value, /saved this face as Grandma Ann/);
  F.facePreset(ctx, 'boy');
  assert.notEqual(JSON.stringify([f.slots, f.colours]), was);
  assert.match(F.faceLoad(ctx, { name: 'grandma ann' }).value, /I am Grandma Ann now/);
  assert.equal(JSON.stringify([f.slots, f.colours]), was, 'the same face comes back');
  assert.match(F.faceLoad(ctx, { name: 'grandpa' }).value, /I drew a grandpa/);
  assert.match(F.faceLoad(ctx, { name: 'zed' }).note, /I do not have a face called zed/);
  assert.match(F.faceSave(ctx, { name: 'girl' }).note, /one of my own faces/);
  assert.equal(F.faceSave(ctx, { name: '' }).status, 'unsupported');
  assert.match(F.faceList(ctx).value, /Your faces: Grandma Ann\. My own: girl, boy, woman, man, grandma and grandpa\./);
  assert.equal(F.faceLoad(ctx, { name: 'happy' }).status, 'supported', 'a mood word is an expression, not a face');
  assert.equal(f.expression, 'happy');
  assert.equal(F.presetList().length, Object.keys(data.presets).length);
});

test('the tappable variants: "what noses are there?" lists them for the host, a tap says a sentence the world reads', () => {
  const ctx = newCtx();
  const r = F.faceListOptions(ctx, { part: 'nose' });
  assert.match(r.value, /I can draw noses: small, long and wide\./);
  assert.deepEqual(ctx.state.face.options, { slot: 'nose', variants: ['small', 'long', 'wide'] });
  for (const id of ctx.state.face.options.variants) assert.match(variantSvg(ctx.state.face, 'nose', id), /^<svg/);
  F.faceStep(ctx, { part: 'nose', dir: 'next' });
  assert.equal(ctx.state.face.options, null, 'the next request clears them');
  assert.equal(faceOptionSay('nose', 'long'), 'make the nose long');
  assert.equal(faceOptionSay('beard', 'none'), 'no beard');
  assert.equal(faceOptionSay('glasses', 'sun'), 'swap the glasses for sun');
  assert.deepEqual(FACE_EXPRESSIONS.map((e) => e[0]), ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'wink']);
});

// ---- through the dialog engine, both reasoners ---------------------------------------------------------------------------------------------------------------
for (const reasoner of ['matrix', 'ops']) {
  test(`the same sentences, ${reasoner} reasoner: describe, change one element, expressions, save and load, undo one step per request`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    s.setWorldState('ui.shell', { activeTab: 'robot' });
    const face = () => s.state('ui.avatar')?.face;
    const say = async (t) => (await s.send(t, {})).text;
    assert.match(await say('draw a woman with a long face, small green eyes, thick eyebrows and curly red hair, with glasses'), /I drew a woman with a long face, narrow green eyes, thick eyebrows, curly red hair and round glasses/);
    assert.deepEqual(face().slots, { face: 'long', hair: 'curly', eyes: 'narrow', eyebrows: 'thick', nose: 'small', beard: 'none', mouth: 'full', glasses: 'round' });
    const nose = face().slots.nose;
    await say('another nose');
    assert.notEqual(face().slots.nose, nose);
    await say('undo');
    assert.equal(face().slots.nose, nose, 'one undo takes back one request');
    await say('a bigger nose');
    assert.ok(face().adj.nose.s > 1);
    await say('eyes closer together');
    assert.ok(face().adj.eyes.dx > 0);
    await say('raise the eyebrows');
    assert.ok(face().adj.eyebrows.dy < 0);
    await say('undo');
    assert.equal(face().adj.eyebrows, undefined, 'the move is undone, one step');
    assert.ok(face().adj.eyes.dx > 0, 'the earlier ones stay');
    assert.match(await say('blue eyes'), /blue eyes/);
    assert.equal(face().colours.iris, F.colourHex(data, 'iris', 'blue'));
    await say('no glasses');
    assert.equal(face().slots.glasses, 'none');
    await say('swap the glasses for sunglasses');
    assert.equal(face().slots.glasses, 'sun');
    await say('no beard');
    assert.match(await say('what noses are there?'), /small, long and wide/);
    assert.deepEqual(face().options.variants, ['small', 'long', 'wide']);
    assert.match(await say('make it happy'), /look happy/);
    assert.equal(face().expression, 'happy');
    await say('look surprised');
    assert.equal(face().expression, 'surprised');
    await say('wink');
    assert.equal(face().expression, 'wink');
    assert.match(await say('save this as Anna'), /saved this face as Anna/);
    await say('load the boy face');
    assert.equal(face().base, 'boy');
    assert.match(await say('be Anna'), /I am Anna now/);
    assert.equal(face().slots.hair, 'curly');
    await say('become a robot');
    assert.equal(face().active, false, 'a DiceBear character leaves the face');
    assert.equal(s.state('ui.avatar').character, 'robot');
    assert.match(await say('a bigger nose'), /nose/);   // no face: the DiceBear answer, not a crash
    assert.match(await say('raise the eyebrows'), /only my drawn face can do that/);
  });
}

test('presets of k.faces are listed next to the DiceBear characters (both stay selectable)', async () => {
  const avatar = await readFile(root('docs/webchat/ui/avatar.mjs'), 'utf8');
  assert.match(avatar, /CHARACTER_LIST = \['robot', 'person', 'emoji', 'portrait', 'cartoon', 'kid', 'pixel', 'pixelbot', 'funemoji'\]/, 'the DiceBear characters stay');
  assert.match(avatar, /presetList\(fm\.d\)/, 'the presets of k.faces are cards');
});
