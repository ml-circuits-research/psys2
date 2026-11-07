import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureEngine, bundleEngine, mini } from './helpers.mjs';
import { parseOrThrow, atom } from '../src/soplang/index.mjs';
import { serialize } from '../src/soplang/index.mjs';

const engine = await fixtureEngine();
const C = 'test.counting';

/** Normalize SOP text and add it to the session; wires get increasing core.seq like formalized ones. */
function add(session, sop) {
  const out = parseOrThrow(sop).map((w) => {
    const { wire, errors } = engine.set.legends.normalizeWire(w);
    assert.deepEqual(errors, []);
    if (!wire.entries.some((e) => e.key === 'core.seq')) wire.entries.push({ key: 'core.seq', value: atom(session.form.nextSeq()) });
    return wire;
  });
  session.add(out);
  return out;
}
const ask = (session, sop) => {
  const [w] = add(session, sop);
  const r = engine.interp.resolve(session, w);
  return r;
};
const fresh = () => { const s = engine.createSession().isession; s.add(s.form.initDefaults()); return s; };
const people = `@e.tom core.agent name="Tom"\n@e.ana core.agent name="Ana"\n@e.bob core.agent name="Bob"\n`;

test('direct lookup: one distinct value is supported, with provenance', () => {
  const s = fresh();
  const r = ask(s, `@q1 core.question type=${C}.price seek=cost where.item=pear`);
  assert.equal(r.status, 'supported');
  assert.equal(r.envelope.value, 3);
  assert.deepEqual(r.envelope.from, ['kb.price.pear']);
  assert.equal(engine.interp.render(s, r), 'A pear costs 3.');
});

test('every answer is written to the session as core.answer', () => {
  const s = fresh();
  const r = ask(s, `@q1 core.question type=${C}.price seek=cost where.item=pear`);
  const a = s.memory.get(r.answer.id);
  assert.equal(a.type, 'core.answer');
  const get = (k) => a.entries.filter((e) => e.key === k).map((e) => e.value.v);
  assert.deepEqual(get('core.answer.to'), ['q1']);
  assert.deepEqual(get('core.answer.value'), ['3']);
  assert.deepEqual(get('core.status'), ['supported']);
  assert.deepEqual(get('core.from'), ['kb.price.pear']);
  assert.match(serialize([a]), /@a1 core.answer/);
});

test('conflicting: several distinct values are reported with alternatives', () => {
  const s = fresh();
  add(s, `@p1 ${C}.price item=pear cost=4`);
  const r = ask(s, `@q1 core.question type=${C}.price seek=cost where.item=pear`);
  assert.equal(r.status, 'conflicting');
  assert.deepEqual([...r.envelope.alternatives].sort(), [3, 4]);
  assert.match(engine.interp.render(s, r), /conflicting prices for pears: 3 and 4/);
  // the same value twice is not a conflict
  const s2 = fresh();
  add(s2, `@p1 ${C}.price item=pear cost=3`);
  assert.equal(ask(s2, `@q1 core.question type=${C}.price seek=cost where.item=pear`).status, 'supported');
});

test('missing: nothing applies; envelope names the key and the legend ask text', () => {
  const s = fresh();
  const r = ask(s, `@q1 core.question type=${C}.price seek=cost where.item=plum`);
  assert.equal(r.status, 'missing');
  assert.deepEqual(r.envelope.missing, [`${C}.price.cost`]);
  assert.equal(r.envelope.ask, 'How much does it cost?');
  assert.equal(engine.interp.render(s, r), "I don't know how much a plum costs.");
});

test('missing without a template falls back to "I don\'t know yet. <ask>"', () => {
  const s = fresh();
  const r = ask(s, `@q1 core.question type=${C}.give seek=count where.item=plum`);
  assert.equal(r.status, 'missing');
  assert.equal(engine.interp.render(s, r), "I don't know yet. How many are given?");
});

test('operation: currentCount applies holdings and gives in core.seq order', () => {
  const s = fresh();
  add(s, people);
  add(s, `@h1 ${C}.holding owner=$e.tom item=apple count=5`);
  add(s, `@g1 ${C}.give giver=$e.tom receiver=$e.ana item=apple count=2`);
  add(s, `@h2 ${C}.holding owner=$e.ana item=apple count=10`); // restatement after the give: absolute
  add(s, `@g2 ${C}.give giver=$e.ana receiver=$e.tom item=apple count=4`);
  const tom = ask(s, `@q1 core.question type=${C}.holding seek=count where.owner=$e.tom where.item=apple`);
  assert.equal(tom.status, 'supported');
  assert.equal(tom.envelope.value, 3 + 4);
  assert.equal(tom.envelope.via, `op.${C}.currentCount`);
  assert.deepEqual([...tom.envelope.from].sort(), ['g1', 'g2', 'h1']);
  const ana = ask(s, `@q2 core.question type=${C}.holding seek=count where.owner=$e.ana where.item=apple`);
  assert.equal(ana.envelope.value, 10 - 4);
  assert.equal(engine.interp.render(s, ana), 'Ana has 6 apples.');
  assert.equal(tom.ops[0].op, `op.${C}.currentCount`);
  assert.deepEqual(tom.ops[0].args.owner, 'e.tom');
});

test('operation ordering uses core.seq, not insertion order', () => {
  const s = fresh();
  add(s, people);
  add(s, `@g1 ${C}.give giver=$e.tom receiver=$e.ana item=apple count=2\n    core.seq=20`);
  add(s, `@h1 ${C}.holding owner=$e.tom item=apple count=5\n    core.seq=10`);
  const r = ask(s, `@q1 core.question type=${C}.holding seek=count where.owner=$e.tom where.item=apple`);
  assert.equal(r.envelope.value, 3);
});

test('operation: unknown starting count is missing, not guessed', () => {
  const s = fresh();
  add(s, people);
  add(s, `@g1 ${C}.give giver=$e.bob receiver=$e.ana item=apple count=2`);
  const r = ask(s, `@q1 core.question type=${C}.holding seek=count where.owner=$e.ana where.item=apple`);
  assert.equal(r.status, 'missing');
  assert.deepEqual(r.envelope.from, ['g1']);
  assert.match(engine.interp.render(s, r), /I don't know how many apples Ana has\./);
});

test('operation: negative result is conflicting', () => {
  const s = fresh();
  add(s, people);
  add(s, `@h1 ${C}.holding owner=$e.tom item=apple count=1`);
  add(s, `@g1 ${C}.give giver=$e.tom receiver=$e.ana item=apple count=3`);
  const r = ask(s, `@q1 core.question type=${C}.holding seek=count where.owner=$e.tom where.item=apple`);
  assert.equal(r.status, 'conflicting');
});

test('compute-first: a compute key uses the operation even when direct facts exist', () => {
  const s = fresh();
  add(s, people);
  add(s, `@h1 ${C}.holding owner=$e.tom item=apple count=5`);
  add(s, `@g1 ${C}.give giver=$e.tom receiver=$e.ana item=apple count=1`);
  const r = ask(s, `@q1 core.question type=${C}.holding seek=count where.owner=$e.tom where.item=apple`);
  assert.equal(r.envelope.value, 4); // direct lookup alone would have said 5
});

test('mode=exists: open world answers unknown (missing); a closed type answers no', () => {
  const s = fresh();
  add(s, people);
  const open = ask(s, `@q1 core.question type=${C}.holding seek=count mode=exists where.owner=$e.tom where.item=apple`);
  assert.equal(open.status, 'missing');
  assert.equal(open.envelope.value, 'unknown');
  add(s, `@h1 ${C}.holding owner=$e.tom item=apple count=5`);
  const yes = ask(s, `@q2 core.question type=${C}.holding seek=count mode=exists where.owner=$e.tom where.item=apple`);
  assert.equal(yes.status, 'supported');
  assert.equal(yes.envelope.value, 'yes');
  const closedYes = ask(s, `@q3 core.question type=${C}.fruit seek=name mode=exists where.name=pear`);
  assert.equal(closedYes.envelope.value, 'yes');
  assert.equal(engine.interp.render(s, closedYes), 'Yes.');
  const closedNo = ask(s, `@q4 core.question type=${C}.fruit seek=name mode=exists where.name=rock`);
  assert.equal(closedNo.status, 'supported');
  assert.equal(closedNo.envelope.value, 'no');
  assert.equal(engine.interp.render(s, closedNo), 'No.');
});

test('mode=list and mode=count', () => {
  const s = fresh();
  const list = ask(s, `@q1 core.question type=${C}.fruit seek=name mode=list`);
  assert.deepEqual([...list.envelope.values].sort(), ['apple', 'pear']);
  assert.equal(engine.interp.render(s, list), 'apple and pear.');
  const count = ask(s, `@q2 core.question type=${C}.fruit mode=count`);
  assert.equal(count.envelope.value, 2);
  const none = ask(s, `@q3 core.question type=${C}.price mode=count where.item=plum`);
  assert.equal(none.status, 'missing'); // open world: zero matches is not "zero"
  const sup = ask(s, `@q4 core.question type=${C}.fruit mode=count where.name=rock`);
  assert.equal(sup.envelope.value, 0); // closed type: zero is an answer
});

test('questions about a type include descendants; about=$id asks about one wire', () => {
  const s = fresh();
  const r = ask(s, `@q1 core.question type=core.state mode=count`);
  assert.equal(r.envelope.value, 3); // 2 fruits and 1 price, all descendants of core.state
  add(s, `@p1 ${C}.price item=plum cost=7`);
  const one = ask(s, `@q2 core.question type=${C}.price seek=cost about=$p1`);
  assert.equal(one.envelope.value, 7);
  assert.equal(ask(s, `@q3 core.question type=${C}.price seek=cost about=$nope`).status, 'missing');
});

test('bad questions are unsupported, never silently answered', () => {
  const s = fresh();
  assert.equal(ask(s, '@q1 core.question type=nope.type seek=x').status, 'unsupported');
  assert.equal(ask(s, `@q2 core.question type=${C}.price seek=bogus`).status, 'unsupported');
  assert.equal(ask(s, `@q3 core.question type=${C}.price seek=cost mode=weird`).status, 'unsupported');
  assert.equal(ask(s, `@q4 core.question type=${C}.price`).status, 'unsupported');
});

test('the renderer falls back to the plain value with its unit', () => {
  const r = engine.interp.renderer;
  assert.equal(r.fill('{a:plural}|{b:plural}', { a: { text: 'box', raw: 'box' }, b: { text: 'apple', raw: 'apple' } }, fresh().memory), 'boxes|apples');
});

// ---- inline world: actions, state, emit, ctx.ask depth, budgets, errors -----------------

const LEGEND = `@t.p.probe core.type
    extends=core.state
@t.p.probe.n core.key
    value=integer
    ask="n?"
@t.p.probe.depth core.key
    value=integer
    ask="How deep?"
    compute=true
@t.p.probe.boom core.key
    value=integer
    ask="boom?"
    compute=true
@t.p.probe.bad core.key
    value=integer
    ask="bad?"
    compute=true
@t.p.probe.slow core.key
    value=integer
    ask="slow?"
    compute=true
@t.p.probe.greedy core.key
    value=integer
    ask="greedy?"
    compute=true
@t.p.probe.sneaky core.key
    value=integer
    ask="sneaky?"
    compute=true
@t.p.probe.sum core.key
    value=integer
    ask="sum?"
    compute=true
@t.p.task core.type
    extends=core.state
@t.p.task.title core.key
    value=string
    ask="Which task?"
`;
const op = (id, key, impl, extra = '') => `@op.t.p.${id} core.operation\n    outputs=t.p.probe.${key}\n    inputs=t.p.probe.n\n    impl=${impl}\n    semantics=query\n${extra}`;
const OPS = `
export function depth(ctx, { n }) {
  ctx.state.maxN = Math.max(ctx.state.maxN ?? 0, Number(n));
  const r = ctx.ask({ type: 't.p.probe', seek: 'depth', where: { n: String(Number(n) + 1) } });
  return r.status === 'supported' ? { status: 'supported', value: r.value } : r;
}
export function boom() { throw new Error('kaboom'); }
export function bad() { return 42; }
export function slow(ctx) { for (;;) ctx.find('t.p.task'); }
export function greedy(ctx) { for (let i = 0; i < 100; i++) ctx.find('t.p.task'); return { status: 'supported', value: 1 }; }
export function sneaky(ctx) { ctx.emit('@{_} t.p.task title="x"'); return { status: 'supported', value: 1 }; }
export function sum(ctx) {
  const tasks = ctx.ordered('t.p.task');
  const w = ctx.get(tasks[0].id);
  return { status: 'supported', value: ctx.vals(w, 'title').length + (ctx.val(w, 'title') === 'one' ? 10 : 0), from: [w.id],
    assumptions: [ctx.ask_text('t.p.task.title'), ctx.name('e.assistant')] };
}
export function addTask(ctx, { title }) {
  ctx.state.added = (ctx.state.added ?? 0) + 1;
  ctx.emit('@{_} t.p.task title=' + JSON.stringify(title));
  return { status: 'supported', value: ctx.state.added };
}
`;
const OPERATIONS = [
  op('depth', 'depth', 'depth'), op('boom', 'boom', 'boom'), op('bad', 'bad', 'bad'), op('slow', 'slow', 'slow'),
  op('greedy', 'greedy', 'greedy'), op('sneaky', 'sneaky', 'sneaky'), op('sum', 'sum', 'sum'),
  `@op.t.p.add core.operation\n    impl=addTask\n    semantics=action\n    action=tasks.add\n`,
].join('\n');
const TEMPLATES = `@tpl.t.p.add core.template
    for=action.tasks.add
    text="Added {title}; that is task number {value:number}."
`;
const pEngine = await bundleEngine({
  't.p': mini('t.p', { legend: LEGEND, opsSrc: OPS, files: { 'operations.sop': OPERATIONS, 'templates.sop': TEMPLATES } }),
}, { options: { opTimeoutMs: 50, maxVisited: 300 } });
const pAdd = (s, sop) => { const w = pEngine.set.legends.normalizeWire(parseOrThrow(sop)[0]).wire; s.add([w]); return w; };
const pAsk = (s, key, n = 1) => pEngine.interp.resolve(s, pAdd(s, `@q${s.nextAnswerId()} core.question type=t.p.probe seek=${key} where.n=${n}`));
const pSession = () => pEngine.createSession().isession;

test('the test world has no static problems', () => {
  assert.deepEqual(pEngine.problems(), []);
  assert.deepEqual(engine.problems(), []);
});

test('ctx.ask recursion is depth limited (max 8) and reported as budget', () => {
  const s = pSession();
  const r = pAsk(s, 'depth', 1);
  assert.equal(r.status, 'budget');
  assert.match(r.envelope.note, /depth/);
  assert.equal(s.state['t.p'].maxN, 9); // n=1 runs at depth 0 ... n=9 at depth 8; the ask from depth 8 to 9 is refused
});

test('operation exceptions and malformed envelopes become error, never false', () => {
  const s = pSession();
  const boom = pAsk(s, 'boom');
  assert.equal(boom.status, 'error');
  assert.match(boom.envelope.note, /kaboom/);
  const bad = pAsk(s, 'bad');
  assert.equal(bad.status, 'error');
  assert.match(bad.envelope.note, /invalid result envelope/);
  assert.equal(pEngine.interp.render(s, boom), 'Something went wrong while I worked on that.');
});

test('time budget per operation call yields budget', () => {
  const r = pAsk(pSession(), 'slow');
  assert.equal(r.status, 'budget');
  assert.match(r.envelope.note, /ms/);
});

test('visited-wire budget yields budget', () => {
  const s = pSession();
  for (let i = 0; i < 5; i++) pAdd(s, `@t${i} t.p.task title="t${i}"`);
  const r = pAsk(s, 'greedy');
  assert.equal(r.status, 'budget');
  assert.match(r.envelope.note, /visited/);
});

test('ctx.emit is refused for non-action operations', () => {
  const r = pAsk(pSession(), 'sneaky');
  assert.equal(r.status, 'error');
  assert.match(r.envelope.note, /not an action/);
});

test('requests run action operations: emit, state and templates', () => {
  const s = pSession();
  const run = (title) => {
    const w = pAdd(s, `@r${s.nextAnswerId()} core.request action=tasks.add arg.title="${title}"`);
    return pEngine.interp.resolve(s, w);
  };
  const r1 = run('Buy milk');
  assert.equal(r1.status, 'supported');
  assert.equal(r1.envelope.value, 1);
  assert.equal(pEngine.interp.render(s, r1), 'Added Buy milk; that is task number 1.');
  const r2 = run('Walk');
  assert.equal(r2.envelope.value, 2);
  assert.equal(s.state['t.p'].added, 2); // ctx.state persists with the session, namespaced per world
  const tasks = s.memory.find('t.p.task');
  assert.deepEqual(tasks.map((t) => t.entries.find((e) => e.key === 't.p.task.title').value.v), ['Buy milk', 'Walk']);
  assert.ok(tasks[0].entries.some((e) => e.key === 'core.via' && e.value.v === 'op.t.p.add'));
  assert.ok(tasks[0].entries.some((e) => e.key === 'core.seq'));
  const other = pSession();
  assert.equal(other.state['t.p'], undefined); // sessions do not share state
});

test('requests for unknown actions are unsupported', () => {
  const s = pSession();
  const r = pEngine.interp.resolve(s, pAdd(s, '@r1 core.request action=nothing.here'));
  assert.equal(r.status, 'unsupported');
  assert.equal(pEngine.interp.render(s, r), "I can't do that yet.");
});

test('ctx helpers: ordered, get, val, vals, ask_text, name', () => {
  const s = pSession();
  pAdd(s, '@t1 t.p.task title=one');
  const r = pAsk(s, 'sum');
  assert.equal(r.status, 'supported');
  assert.equal(r.envelope.value, 11);
  assert.deepEqual(r.envelope.from, ['t1']);
  assert.deepEqual(r.envelope.assumptions, ['Which task?', 'PSys2']);
});

test('renderer filters: plural singular cap a list number and drilling', () => {
  const s = pSession();
  pAdd(s, '@e.tom core.agent name="Tom"');
  const R = pEngine.interp.renderer;
  const vars = {
    w: { text: 'child', raw: 'child' }, c: { text: 'berries', raw: 'berries' }, x: { text: 'apple', raw: 'apple' }, n: { text: '1234.5', raw: 1234.5 },
    items: { items: [{ text: 'a' }, { text: 'b' }, { text: 'c_d' }] }, o: { ref: 'e.tom', text: 'e.tom', raw: 'e.tom' },
  };
  const f = (t, v = vars) => R.fill(t, v, s.memory);
  assert.equal(f('{x:plural}'), 'apples');
  assert.equal(f('{c:singular}'), 'berry');
  assert.equal(f('{x:cap}'), 'Apple');
  assert.equal(f('{x:a}'), 'an apple');
  assert.equal(f('{w:a:cap}'), 'A child');
  assert.equal(f('{items:list}'), 'a, b and c d');
  assert.equal(f('{n:number}'), '1,234.5');
  assert.equal(f('{o}'), 'Tom');
  assert.equal(f('{o.name}'), 'Tom');
  assert.equal(f('{missing}'), null);
  assert.equal(f('{x:plural}', { ...vars, value: { text: '1', raw: 1 } }), 'apple'); // number-aware plural
  assert.equal(f('{x:plural}', { ...vars, value: { text: '2', raw: 2 } }), 'apples');
});
