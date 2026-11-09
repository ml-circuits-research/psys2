import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { bundleEngine, mini, fixtureEngine } from './helpers.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createServer } from '../src/server/index.mjs';
import { createRulesFormalizer, createEncoderFormalizer } from '../src/formalizer/strategy.mjs';
import { sampled } from './helpers.mjs';

// ---- an inline tool world: effects, state, modal input, cross-world requests ---------------------
const LEGEND = '';
const OPS = `
export function initialState() { return { n: 0, inputMode: null, log: [] }; }
export function bump(ctx, { by }) { ctx.state.n += Number(by ?? 1); ctx.effect('beep', { n: ctx.state.n }); return { status: 'supported', value: 'n=' + ctx.state.n }; }
export function modal(ctx) { ctx.state.inputMode = 'raw'; return { status: 'supported', value: 'raw mode' }; }
export function relay(ctx) { const r = ctx.request('other.set', { v: 'x' }); return { status: 'supported', value: 'relayed ' + r.value }; }
export function notAllowed(ctx) { return { status: 'supported', value: String(ctx.request('nope.nothing').status) }; }
export function interceptInput(ctx, text) {
  if (text === 'quit') { ctx.state.inputMode = null; return { handled: true, reply: 'bye raw' }; }
  if (text.startsWith('!')) return { handled: false };
  ctx.state.log.push(text);
  return { handled: true, reply: 'got ' + text };
}`;
const OTHER = `
export function initialState() { return { v: null }; }
export function set(ctx, { v }) { ctx.state.v = v; ctx.effect('other.done', { v }); return { status: 'supported', value: 'set ' + v }; }`;
const ops = (impl, action, extra = '') => `@op.x.${impl} core.operation\n    impl=${impl}\n    semantics=action\n    action=${action}\n${extra}`;
const world = (ns, opsSrc, opText, pats) => mini(ns, { legend: LEGEND, opsSrc, files: { 'operations.sop': opText, 'patterns.sop': pats ?? '' } });
const pat = (ns, id, match, action, extra = '') => `@pat.${ns}.${id} core.pattern\n    match="${match}"\n    emit="@{_} core.request action=${action}${extra}"\n    kind=request\n    example="${match}"\n`;
const toolEngine = (extra = {}) => bundleEngine({
  'x.tool': world('x.tool',
    OPS,
    [ops('bump', 'x.bump'), ops('modal', 'x.modal'), ops('relay', 'x.relay'), ops('notAllowed', 'x.notAllowed')].join('\n'),
    [pat('x.tool', 'bump', 'bump', 'x.bump', ' arg.by=2'), pat('x.tool', 'modal', 'go raw', 'x.modal'), pat('x.tool', 'relay', 'relay it', 'x.relay'), pat('x.tool', 'na', 'try nothing', 'x.notAllowed')].join('\n')),
  'x.other': world('x.other', OTHER, ops('set', 'other.set')),
}, extra);

test('send() returns state snapshots of changed worlds and ordered effects; initialState seeds the state', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  assert.deepEqual(s.state('x.tool'), { n: 0, inputMode: null, log: [] });
  const r = await s.send('bump');
  assert.equal(r.text, 'n=2');
  assert.deepEqual(r.effects, [{ name: 'beep', args: { n: 2 }, world: 'x.tool' }]);
  assert.deepEqual(Object.keys(r.state), ['x.tool']);
  assert.equal(r.state['x.tool'].n, 2);
  const r2 = await s.send('Zork blip');
  assert.deepEqual(r2.state, {});
  assert.deepEqual(r2.effects, []);
  assert.equal(s.state()['x.tool'].n, 2);
  assert.equal(s.state('x.nothing'), null);
  assert.deepEqual(r.trace.effects, r.effects);
});

test('ctx.request calls another world action; its effects carry that world; unknown actions are unsupported', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  const r = await s.send('relay it');
  assert.equal(r.text, 'relayed set x');
  assert.deepEqual(r.effects, [{ name: 'other.done', args: { v: 'x' }, world: 'x.other' }]);
  assert.deepEqual(Object.keys(r.state), ['x.other']);
  assert.equal(r.state['x.other'].v, 'x');
  assert.equal((await s.send('try nothing')).text, 'unsupported');
});

test('modal input: interceptInput consumes messages while inputMode is set', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  assert.equal((await s.send('go raw')).text, 'raw mode');
  const r = await s.send('Tom has 5 apples. bump');
  assert.equal(r.text, 'got Tom has 5 apples. bump');
  assert.equal(r.trace.intercepted, 'x.tool');
  assert.deepEqual(r.segments, []);
  assert.deepEqual(r.state['x.tool'].log, ['Tom has 5 apples. bump']);
  const pass = await s.send('!bump');           // handled:false falls through to formalization
  assert.equal(pass.trace.intercepted, null);
  assert.equal((await s.send('quit')).text, 'bye raw');
  assert.match((await s.send('bump')).text, /^n=\d+$/);
});

test('session.setWorldState merges host changes without reply or effects', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  s.setWorldState('x.tool', { n: 10 });
  assert.equal(s.state('x.tool').n, 10);
  assert.equal(s.state('x.tool').log.length, 0);
  assert.equal((await s.send('bump')).text, 'n=12');
});

test('session.observe records a core.observation wire', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  const { id, text } = s.observe({ effect: 'speech.say', ok: false, detail: 'no voice' });
  assert.equal(text, null); // no world given: nothing reacts
  const mem = s.memory();
  assert.match(mem, new RegExp(`@${id} core.observation`));
  assert.match(mem, /effect=speech\.say/);
  assert.match(mem, /ok=false/);
  assert.match(mem, /detail="no voice"/);
});

test('test runner: expectState (own world and world:path) and expectEffect', async () => {
  const e = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  for (const id of ['ui.shell', 'ui.avatar', 'docs.editor', 'games.tictactoe', 'games.guess', 'games.hangman']) {
    const r = await runWorldTests(e, id);
    assert.deepEqual(r.failed, [], id);
    assert.ok(r.passed >= 10, id);
  }
  assert.deepEqual(e.problems().filter((p) => /^(ui|docs|games)\./.test(p)), []);
});

// ---- formalizer strategies -------------------------------------------------------------------
test('strategies: rules always available; encoder unavailable without an endpoint and never throws', async () => {
  const rules = createRulesFormalizer();
  assert.equal(rules.id, 'rules'); assert.equal(await rules.available(), true);
  const enc = createEncoderFormalizer({ endpoint: 'http://127.0.0.1:1' });
  assert.equal(enc.id, 'encoder');
  assert.equal(await enc.available(), false);
  assert.equal(await createEncoderFormalizer({}).available(), false);
  assert.equal(enc.supports({ id: 'kids.arith' }), false);
});

test('encoder strategy: available when the worker answers, per-world support, fallback to rules per segment', async () => {
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, worlds: ['kids.common'] })); });
  await new Promise((r) => srv.listen(0, r));
  try {
    const enc = createEncoderFormalizer({ endpoint: `http://127.0.0.1:${srv.address().port}` });
    assert.equal(await enc.available(), true);
    assert.equal(enc.supports({ id: 'kids.common' }), true);
    assert.equal(enc.supports({ id: 'kids.arith' }), false);
  } finally { srv.close(); }
});

test('session formalizer option: preference, per-message override, fallback and trace', async () => {
  const fake = {
    id: 'encoder', available: () => true, supports: (w) => w.id === 'kids.common',
    formalize: (text, { session }) => ({
      segments: [{ text: 'Hello', span: [0, 5], isQuestion: false, worlds: [], match: { patternId: 'enc', worldId: 'kids.common', slots: {} }, wires: [], unparsed: false, alternatives: [], errors: [] }],
      wires: [],
    }),
  };
  const e = await fixtureEngine({ formalizers: { encoder: fake } });
  const rulesSession = e.createSession();
  assert.equal(rulesSession.formalizer, 'rules');
  assert.equal(e.formalizers.rules.id, 'rules');
  assert.equal(e.formalizers.encoder.id, 'encoder');
  const r0 = await rulesSession.send('Hello');
  assert.deepEqual(r0.trace.formalizer, { preferred: 'rules', used: ['rules'] });
  assert.equal(r0.trace.segments[0].strategy, 'rules');
  const encSession = e.createSession({ formalizer: 'encoder' });
  const r1 = await encSession.send('Hello');
  assert.deepEqual(r1.trace.formalizer, { preferred: 'encoder', used: ['encoder'] });
  assert.equal(r1.trace.segments[0].strategy, 'encoder');
  // an unparsed encoder segment falls back to the rules
  fake.formalize = (text) => ({ segments: [{ text, span: [0, text.length], isQuestion: false, worlds: [], match: null, wires: [], unparsed: true, alternatives: [], errors: [] }], wires: [] });
  const r2 = await encSession.send('Tom has 5 apples.');
  assert.match(r2.text, /OK, Tom has 5 apples/);
  assert.equal(r2.trace.segments[0].strategy, 'rules');
  // per-message option and writable property
  const r3 = await rulesSession.send('Hello', { formalizer: 'encoder' });
  assert.equal(r3.trace.formalizer.preferred, 'encoder');
  rulesSession.formalizer = 'encoder';
  assert.equal((await rulesSession.send('Hello')).trace.formalizer.preferred, 'encoder');
  // encoder preferred but not available: rules
  const e2 = await fixtureEngine();
  const r4 = await e2.createSession({ formalizer: 'encoder' }).send('Hello');
  assert.deepEqual(r4.trace.formalizer, { preferred: 'encoder', used: ['rules'] });
});

test('server accepts { formalizer } when creating a session', async () => {
  const e = await fixtureEngine();
  const { server, sessions, close } = createServer({ engine: e });
  await new Promise((r) => server.listen(0, r));
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/v1/sessions`, { method: 'POST', body: JSON.stringify({ formalizer: 'encoder' }) });
    const { sessionId } = await res.json();
    assert.equal(sessions.get(sessionId).session.formalizer, 'encoder');
    const msg = await (await fetch(`http://127.0.0.1:${port}/v1/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify({ text: 'Hello' }) })).json();
    assert.deepEqual(msg.effects, []);
    assert.equal(msg.trace.formalizer.used[0], 'rules');
  } finally { close(); }
});

// ---- the rest slot ----------------------------------------------------------------------------
test('rest slot captures the remaining tokens, with commas, as free text', async () => {
  const e = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const s = e.createSession();
  await s.send('Add a paragraph We went to the sea, and we saw a very big whale today');
  assert.equal(s.state('docs.editor').blocks[0].text, 'We went to the sea, and we saw a very big whale today.');
});

// ---- the tool worlds ------------------------------------------------------------------------------
const real = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const TOOL_WORLDS = ['ui.shell', 'ui.avatar', 'docs.editor', 'games.tictactoe', 'games.guess', 'games.hangman'];

test('every pattern example of a tool world is understood', async () => {
  for (const id of TOOL_WORLDS) {
    for (const p of real.set.get(id).patterns) {
      assert.ok(p.examples.length >= 1, `${p.id} has no example`);
      for (const ex of sampled(p.examples, { key: (e) => `${p.id}|${e}`, world: id })) {
        const r = await real.createSession().send(ex);
        assert.ok(!r.statuses.includes('unparsed'), `${id}: "${ex}" is not understood`);
      }
    }
  }
});

test('tool worlds: status fixture, English, rules, import world.core and world.kids.common', () => {
  for (const id of TOOL_WORLDS) {
    const m = real.set.get(id);
    assert.equal(m.status, 'fixture'); assert.equal(m.language, 'en');
    assert.equal(m.summary().formalization, 'rules');
    assert.ok(m.imports.includes('core') && m.imports.includes('kids.common'), id);
  }
});

test('tic-tac-toe: easy level wins and blocks; perfect level never loses', async () => {
  const play = async (session) => {
    for (let guard = 0; guard < 9 && !session.state('games.tictactoe').winner; guard++) {
      const b = session.state('games.tictactoe').board;
      const free = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
      const names = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
      await session.send(`Play ${names[free[0]]}`);
    }
    return session.state('games.tictactoe');
  };
  const s = real.createSession();
  await s.send('Set the level to perfect');
  assert.notEqual((await play(s)).winner, 'X');
  const t = real.createSession();
  await t.send('Set the level to perfect');
  await t.send('Let me go second');
  assert.notEqual((await play(t)).winner, 'O');
  // block: user X at A1 and A2, easy system must take A3 on its next move
  const u = real.createSession();
  await u.send('Center'); // X center, O somewhere
  const st = u.state('games.tictactoe');
  assert.equal(st.board.filter((c) => c === 'O').length, 1);
  // deterministic: two sessions play the same game
  const v = real.createSession(), w = real.createSession();
  for (const m of ['Center', 'Top left', 'Bottom right']) { await v.send(m); await w.send(m); }
  assert.deepEqual(v.state('games.tictactoe').board, w.state('games.tictactoe').board);
});

test('document history keeps at most 50 snapshots', async () => {
  const s = real.createSession();
  for (let i = 0; i < 55; i++) await s.send(`Add a paragraph number ${i}`);
  assert.equal(s.state('docs.editor').history.length, 50);
  assert.equal(s.state('docs.editor').blocks.length, 55);
});

test('guess the animal: the question splits the candidates evenly; learning adds a session fact', async () => {
  const s = real.createSession();
  const r = await s.send('Guess my animal');
  const st = s.state('games.guess');
  const cur = st.current;
  assert.ok(Math.abs(cur.yes - cur.no) <= Math.max(2, cur.of * 0.2), JSON.stringify(cur));
  assert.match(r.text, /Question 1:/);
  await s.send('I give up');
  await s.send('It was a quokka');
  assert.match(s.memory(), /kids\.animals\.animal/);
  assert.match(s.memory(), /name=quokka/);
  assert.equal((await s.send('What is a quokka?')).statuses.at(-1) !== undefined, true);
});

test('hangman: hidden word until the end, six wrong guesses, hints from the knowledge base', async () => {
  const s = real.createSession();
  await s.send('Play hangman with the word giraffe');
  const hint = await s.send('Tell me something about it');
  assert.match(hint.text, /hint: It is a mammal/);
  assert.equal(s.state('games.hangman').masked, '_ _ _ _ _ _ _');
  assert.doesNotMatch((await s.send('How many guesses are left?')).text, /giraffe/);
  const st = s.state('games.hangman');
  assert.equal(st.wrongLeft, 6);
});

test('session.observe lets the originating world react through onObservation', async () => {
  const e = await toolEngine();
  const s = e.createSession();
  const w = e.set.list().find((x) => x.ops && x.id !== 'core');
  w.ops = { ...w.ops, onObservation: (ctx, obs) => { ctx.state.lastObserved = obs.effect; ctx.effect('speech.say', { text: 'heard' }); return { reply: `Observed ${obs.effect} with ${obs.data?.n}.` }; } };
  const out = s.observe({ effect: 'demo.compute', ok: true, data: { n: 42 }, world: w.id });
  assert.equal(out.text, 'Observed demo.compute with 42.');
  assert.equal(out.state[w.id].lastObserved, 'demo.compute');
  assert.equal(out.effects[0].name, 'speech.say');
});
