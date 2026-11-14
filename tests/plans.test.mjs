import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { planHostOf } from '../src/plan/host.mjs';
import * as D from '../worlds/art.draw/engine.mjs';
import { goalOf, goalFromText, planFor, runPlan, canonGoal } from '../worlds/art.draw/plan.mjs';

// PLANS FROM KNOWLEDGE (specs/24): the host reads methods from a catalog (k.procedures), the library's planner makes the plan, the drawing board executes it as ONE request:
// one undo step, all or nothing. This test runs offline on a toy catalog (a method in the published format, one anchor); the 60-request set on the live catalog is scripts/eval-plans.mjs.

const sch = (type, keys) => keys.map((k, i) => `@${type}.${k} core.slot of=${type} key=${k}${i < 2 && type !== 'k.procedures.method' ? ' id=true' : ''}`).join('\n');
const ids = { method: ['name'], goal: ['method', 'role'], binding: ['method', 'name'], match: ['method', 'binding', 'key'], step: ['method', 'n'], arg: ['method', 'step', 'role'], condition: ['method', 'n'] };
const proceduresSchema = Object.entries(ids).flatMap(([t, keys]) => keys.map((k) => `@k.procedures.${t}.${k} core.slot of=k.procedures.${t} key=${k} id=true`)).join('\n');
const METHODS = `@m k.procedures.method name="on an anchor" about="Put a thing on the anchor of another thing that holds its kind: the other thing first if there is none." act=make
@g1 k.procedures.goal method="on an anchor" role=kind kind=thing
@g2 k.procedures.goal method="on an anchor" role=place from=k.layouts.anchor by=of
@b1 k.procedures.binding method="on an anchor" name=what goal=kind
@b2 k.procedures.binding method="on an anchor" name=on goal=place
@b3 k.procedures.binding method="on an anchor" name=there live=any
@x3 k.procedures.match method="on an anchor" binding=there key=kind equals=on
@b4 k.procedures.binding method="on an anchor" name=anchor from=k.layouts.anchor
@x4 k.procedures.match method="on an anchor" binding=anchor key=of equals=on
@b5 k.procedures.binding method="on an anchor" name=made step=1
@b6 k.procedures.binding method="on an anchor" name=seat together=there together=made
@b7 k.procedures.binding method="on an anchor" name=thing step=2
@c1 k.procedures.condition method="on an anchor" n=1 when=before step=1 fact=absent thing=there
@s1 k.procedures.step method="on an anchor" n=1 act=make
@a1 k.procedures.arg method="on an anchor" step=1 role=kind binding=on
@s2 k.procedures.step method="on an anchor" n=2 act=make after=1
@a2 k.procedures.arg method="on an anchor" step=2 role=kind binding=what
@s3 k.procedures.step method="on an anchor" n=3 act=place after=2
@a3 k.procedures.arg method="on an anchor" step=3 role=thing binding=thing
@a4 k.procedures.arg method="on an anchor" step=3 role=place binding=anchor key=name of=seat rel=on
@w core.word text="a pile" means="a pile" of=k.procedures.goal.value`;
const FILES = {
  'index.json': JSON.stringify({ worlds: [
    { id: 'k.procedures', schema: 'k.procedures/schema.sop', exports: Object.keys(ids).map((t) => `k.procedures.${t}`), shards: [{ id: 'k.procedures/shards/toy', path: 'k.procedures/shards/toy.sop', keys: ['on an anchor'] }] },
    { id: 'k.layouts', schema: 'k.layouts/schema.sop', exports: ['k.layouts.anchor'], shards: [{ id: 'k.layouts/shards/anchors', path: 'k.layouts/shards/anchors.sop', keys: ['house'] }] },
  ] }),
  'vocab.json': '{}',
  'k.procedures/schema.sop': proceduresSchema,
  'k.procedures/shards/toy.sop': METHODS,
  'k.layouts/schema.sop': '@s1 core.slot of=k.layouts.anchor key=of id=true\n@s2 core.slot of=k.layouts.anchor key=name id=true',
  'k.layouts/shards/anchors.sop': '@a k.layouts.anchor of=house name=roof kind=top x=10 y=0 w=80 h=0 holds=cat',
};
const cat = () => createFacts({ source: { text: async (p) => FILES[p] ?? null } });
const ctxOf = (knowledge) => ({ state: D.initialState(), knowledge, request: () => ({}), effect: () => {} });
const objects = (ctx) => ctx.state.objects.map((o) => o.kind);

test('the host loads the methods lazily from a catalog and plans a goal through the library planner', async () => {
  const k = cat(), host = planHostOf(k);
  assert.equal(host.ready(), false, 'nothing is loaded before the first goal');
  assert.equal(await host.load(['cat', 'house']), true);
  const p = host.plan({ act: 'make', roles: { kind: 'cat', place: { value: 'house', rel: 'on' } } }, []);
  assert.equal(p.method, 'on an anchor');
  assert.deepEqual(p.lines, ['make kind=house', 'make kind=cat', 'place thing=cat1 place=roof of=house1 rel=on']);
  assert.equal(host.canonical('a pile'), 'a pile');
  assert.deepEqual(host.plan({ act: 'make', roles: { kind: 'cat', place: { value: 'house', rel: 'on' } } }, [{ id: 'o7', kind: 'house' }]).lines, ['make kind=cat', 'place thing=cat1 place=roof of=o7 rel=on'], 'an existing house is used: step 1 is skipped');
  assert.equal(planHostOf(k), host, 'one host per catalog');
});

test('the board runs a plan as one request: made, put on the anchor, one undo step, and says what it did', async () => {
  const k = cat(), host = planHostOf(k);
  await host.load(['cat', 'house']);
  const ctx = ctxOf(k);
  const goal = goalOf('make', { kind: 'cat' }, { thing: 'cat', place: 'the house', rel: 'on' });
  assert.deepEqual(goal, { act: 'make', roles: { kind: 'cat', place: { value: 'house', rel: 'on' } } });
  const pl = planFor(ctx, goal);
  assert.ok(pl, 'a method fits');
  const r = runPlan(ctx, goal, pl, 'a cat on the house');
  assert.equal(r.status, 'supported', r.note);
  assert.match(r.value, /^I drew a cat on the house: a house and a cat\. I put the cat on the roof of the house\./);
  assert.deepEqual(objects(ctx).sort(), ['cat', 'house']);
  const [h, c] = [ctx.state.objects.find((o) => o.kind === 'house'), ctx.state.objects.find((o) => o.kind === 'cat')];
  assert.ok(D.bbox(c).y1 <= D.bbox(h).y0 + 2, 'the cat rests on the line the anchor states (the top of the house)');
  assert.equal(ctx.state.history.length, 1, 'ONE request is ONE undo step (specs/15), not one per act of the plan');
  const un = D.undo(ctx, {});
  assert.equal(un.status, 'supported');
  assert.equal(ctx.state.objects.length, 0, 'one undo takes the whole plan back');
});

test('all or nothing: a plan with nothing the board can do leaves the picture as it was and says why', async () => {
  const k = cat(), host = planHostOf(k);
  await host.load(['blorp', 'house']);
  const ctx = ctxOf(k);
  D.add(ctx, { kind: 'house', kt: 'house', where: '' });   // the house is there: the plan only has a blorp to make, which the board cannot draw
  const before = structuredClone(ctx.state.objects), hist = ctx.state.history.length;
  const goal = goalOf('make', { kind: 'blorp' }, { thing: 'blorp', place: 'house', rel: 'on' });
  const pl = planFor(ctx, goal);
  const r = runPlan(ctx, goal, pl, 'a blorp on the house');
  assert.notEqual(r.status, 'supported');
  assert.match(r.note, /^I could not do that: /);
  assert.deepEqual(ctx.state.objects, before, 'the picture is as it was');
  assert.equal(ctx.state.history.length, hist, 'no step is left behind');
});

test('goals are read from roles and from the sentence; a place with no relation is not a goal', () => {
  assert.deepEqual(goalOf('make', { kind: 'cow', n: '3' }, {}), { act: 'make', roles: { kind: 'cow', number: 3 } });
  assert.deepEqual(goalOf('make', { kind: 'table setting for four' }, {}), { act: 'make', roles: { kind: 'table setting', number: 4 } });
  assert.deepEqual(goalOf('make', { kind: 'house from parts' }, {}), { act: 'make', roles: { kind: 'house', material: 'parts' } });
  assert.equal(goalOf('make', { kind: 'cat' }, { thing: 'cat', place: 'the sun', rel: 'next to' }), null, 'a relation the plan has no word for: the board reads the place itself');
  assert.deepEqual(goalFromText('please set a table for four'), { act: 'make', roles: { kind: 'set a table', number: 4 } });
  assert.equal(goalOf('make', { kind: 'it' }, {}), null);
});

test('canonical goal words come from the core.word wires of the knowledge, not from a list here', async () => {
  const k = cat(), host = planHostOf(k);
  await host.load(['pile']);
  assert.deepEqual(canonGoal(ctxOf(k), { act: 'make', roles: { kind: 'a pile' } }).roles.kind, 'a pile');
});

const LIVE = process.env.PSYS2_KNOWLEDGE;
test('the 60 multi-step requests on the live catalog: the plan path is right on at least 45 (the hand path was 19, scripts/eval-plans.mjs --root <checkout before the plans>)', { skip: !LIVE || !existsSync(`${LIVE}/k.procedures`) && 'the knowledge catalog with k.procedures is not at hand (PSYS2_KNOWLEDGE)' }, async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'plans-')), file = join(dir, 'out.json');
  try {
    spawnSync(process.execPath, ['scripts/eval-plans.mjs', '--json', file], { encoding: 'utf8', env: process.env, maxBuffer: 1 << 26 });
    var json = JSON.parse(readFileSync(file, 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const right = json.rows.filter((r) => r.ok).length;
  assert.ok(right >= 45, `${right} of ${json.rows.length} right`);
});
