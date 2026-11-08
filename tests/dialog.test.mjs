import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fixtureEngine, bundleEngine, mini } from './helpers.mjs';
import { runWorldTests } from '../src/dialog/index.mjs';
import { parseOrThrow } from '../src/soplang/index.mjs';
import { createServer } from '../src/server/index.mjs';
import { createBundleLoader } from '../src/loaders/bundle-loader.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';

const engine = await fixtureEngine();
const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('end to end: statements are acknowledged, questions answered from the session', async () => {
  const s = engine.createSession();
  const r = await s.send('Tom has 5 apples. Ana gives him 3 apples. How many apples does Tom have?');
  assert.equal(r.text, 'OK, Tom has 5 apples. OK, Ana gave Tom 3 apples. Tom has 8 apples.');
  assert.equal(r.lang, 'en');
  assert.equal(r.translation, null);
  assert.deepEqual(r.statuses, ['supported']);
  assert.equal(r.answers.length, 1);
  assert.equal(r.answers[0].value, 8);
  assert.equal(r.answers[0].text, 'Tom has 8 apples.');
  assert.equal(r.answers[0].kind, 'question');
  assert.equal(r.segments.length, 3);
  assert.ok(r.wires.some((w) => w.type === 'core.answer'));
  assert.deepEqual(r.trace.patterns, ['pat.test.counting.has', 'pat.test.counting.give', 'pat.test.counting.howmany']);
  assert.equal(r.trace.operations[0].op, 'op.test.counting.currentCount');
  assert.ok(r.trace.router[0].length > 0);
});

test('questions see only what was said before them in the same message', async () => {
  const s = engine.createSession();
  const r = await s.send('Tom has 5 apples. How many apples does Tom have? Tom gives Ana 2 apples. How many apples does Tom have?');
  assert.deepEqual(r.answers.map((a) => a.value), [5, 3]);
});

test('memory persists across messages; pronouns and conflicts work across turns', async () => {
  const s = engine.createSession();
  await s.send('Mia has 4 pears.');
  const r = await s.send('How many pears does she have?');
  assert.equal(r.text, 'Mia has 4 pears.');
  await s.send('A pear costs 9.');
  assert.equal((await s.send('How much does a pear cost?')).statuses[0], 'conflicting');
});

test('chat requests: greeting, name, who, thanks, goodbye, what can you do', async () => {
  const s = engine.createSession();
  assert.match((await s.send('Hi there!')).text, /^Hello!/);
  assert.equal((await s.send("What's your name?")).text, 'My name is PSys2.');
  assert.match((await s.send('Who are you?')).text, /^I am PSys2/);
  assert.match((await s.send('thanks')).text, /welcome/);
  assert.match((await s.send('bye')).text, /^Goodbye!/);
  const can = await s.send('What can you do?');
  assert.match(can.text, /^I can chat/);
  assert.match(can.text, /Counting \(test fixture\)/);
  assert.doesNotMatch(can.text, /Core types/);
  assert.equal(can.answers[0].kind, 'request');
});

test('e.user and e.assistant exist from session start', async () => {
  const s = engine.createSession();
  const wires = parseOrThrow(s.memory());
  assert.deepEqual(wires.map((w) => w.id), ['e.user', 'e.assistant']);
});

test('unparsed sentences are reported with up to two examples from the closest world', async () => {
  const s = engine.createSession();
  const r = await s.send('Zork blip. Tom has 2 pears.');
  assert.match(r.text, /^I did not understand "Zork blip"\. For example: "[^"]+" or "[^"]+"/);
  assert.match(r.text, /OK, Tom has 2 pears\.$/);
  assert.deepEqual(r.statuses, ['unparsed']);
  const closest = await s.send('Tom has some apples');
  assert.match(closest.text, /I did not understand "Tom has some apples"\. Did you mean "Tom has 5 apples\./); // ui.help: the closest example of test.counting (word overlap)
  assert.equal(closest.segments[0].unparsed, true);
});

test('session.memory() is valid SOP Lang with short keys and the whole dialog', async () => {
  const s = engine.createSession();
  await s.send('Tom has 5 apples. How many apples does Tom have?');
  const text = s.memory();
  const wires = parseOrThrow(text);
  assert.ok(wires.some((w) => w.type === 'test.counting.holding'));
  assert.ok(wires.some((w) => w.type === 'core.answer'));
  assert.match(text, /\n {4}owner=\$e\.tom\n/);
  assert.match(text, /core\.via=\$pat\.test\.counting\.has/);
});

test('sessions are independent', async () => {
  const a = engine.createSession(), b = engine.createSession();
  await a.send('Tom has 5 apples.');
  assert.equal((await b.send('How many apples does Tom have?')).statuses[0], 'missing');
});

test('ambiguity: equal-rank readings from different worlds are reported, not chosen silently', async () => {
  const mk = (ns, type) => mini(ns, {
    legend: `@${ns}.${type} core.type\n@${ns}.${type}.what core.key\n    value=atom\n    ask="what?"\n`,
    files: {
      'patterns.sop': `@pat.${ns}.x core.pattern\n    match="ping {w:word}"\n    emit="@{_} ${ns}.${type} what={w}"\n    kind=statement\n    priority=1\n    example="ping a"\n`,
      'templates.sop': `@tpl.${ns}.ack core.template\n    for=ack.${ns}.${type}\n    text="Got ${type}."\n`,
    },
  });
  const e = await bundleEngine({ 'w.one': mk('w.one', 'alpha'), 'w.two': mk('w.two', 'beta') });
  const r = await e.createSession().send('ping x');
  assert.equal(r.segments[0].alternatives.length, 1);
  assert.equal(r.segments[0].alternatives[0].worldId, 'w.two');
  assert.match(r.text, /Got alpha\./);
  assert.match(r.text, /could also be read in another way \(w\.two\)/);
});

test('translator hook: detect, translate in, translate the reply back', async () => {
  const seen = [];
  const translator = {
    detectLanguage: (t) => ({ lang: /^salut|cati/i.test(t) ? 'ro' : 'en', confidence: 1 }),
    translate: (t, { from, to }) => {
      seen.push([from, to, t]);
      if (from === 'ro') return { text: t.startsWith('Salut') ? 'Hello' : 'How many apples does Tom have?', alignment: [], unknown: [{ word: 'xyz', span: [0, 3] }], notes: [], confidence: 1 };
      return { text: `[ro] ${t}`, alignment: [], unknown: [], notes: [], confidence: 1 };
    },
  };
  const e = await fixtureEngine({ translator });
  const s = e.createSession({ language: 'auto' });
  const r = await s.send('Salut');
  assert.equal(r.lang, 'ro');
  assert.equal(r.translation.text, 'Hello');
  assert.equal(r.text, '[ro] Hello! What would you like to talk about?');
  assert.deepEqual(seen.map((x) => x.slice(0, 2)), [['ro', 'en'], ['en', 'ro']]);
  assert.equal(r.trace.original, 'Salut');
  assert.equal(r.trace.english, 'Hello');
  const en = await s.send('Hello');
  assert.equal(en.lang, 'en');
  assert.equal(en.translation, null);
  assert.match(en.text, /^Hello/);
  const forced = await e.createSession({ language: 'ro' }).send('cati mere are Tom');
  assert.equal(forced.lang, 'ro');
  assert.equal(forced.translation.unknown[0].word, 'xyz');
});

test('without a translator everything is treated as English', async () => {
  const r = await engine.createSession({ language: 'ro' }).send('Hello');
  assert.equal(r.lang, 'en');
  assert.match(r.text, /^Hello/);
});

test('engine.worlds() lists manifests', () => {
  const ids = engine.worlds().map((w) => w.id);
  assert.deepEqual(ids, ['core', 'lang.common', 'kids.common', 'ui.help', 'test.counting']);
  assert.equal(engine.worlds()[4].status, 'fixture');
});

// ---- world tests runner -----------------------------------------------------------------

test('runWorldTests: the shipped worlds pass; sessions group; expectations are checked', async () => {
  for (const id of ['kids.common', 'test.counting']) {
    const r = await runWorldTests(engine, id);
    assert.deepEqual(r.failed, [], id);
    assert.equal(r.passed, r.total);
    assert.ok(r.total >= 7);
  }
});

test('runWorldTests reports failures, skips language tests without a translator', async () => {
  const tests = `@t.a core.test\n    input="Hello"\n    expect="Goodbye"
@t.b core.test\n    input="Hello"\n    expectStatus=missing
@t.c core.test\n    input="Hello"
@t.d core.test\n    language=ro\n    input="Salut"\n    expect="Hello"
@t.e core.test\n    session=s\n    input="Mia has 4 pears."\n    expect="OK"
@t.f core.test\n    session=s\n    input="How many pears does Mia have?"\n    expect="Mia has 4 pears."
@t.g core.test\n    input="How many pears does Mia have?"\n    expectStatus=unparsed\n`;
  const e = await bundleEngine({
    'kids.common': { files: { 'world.sop': await readFile(path.join(ROOT, 'worlds/kids.common/world.sop'), 'utf8'), 'legend.sop': await readFile(path.join(ROOT, 'worlds/kids.common/legend.sop'), 'utf8'), 'patterns.sop': await readFile(path.join(ROOT, 'worlds/kids.common/patterns.sop'), 'utf8'), 'operations.sop': await readFile(path.join(ROOT, 'worlds/kids.common/operations.sop'), 'utf8'), 'templates.sop': await readFile(path.join(ROOT, 'worlds/kids.common/templates.sop'), 'utf8'), 'tests.sop': tests }, opsUrl: new URL('../worlds/kids.common/ops.mjs', import.meta.url).href },
  });
  const r = await runWorldTests(e, 'kids.common');
  assert.deepEqual(r.failed.map((f) => f.id).sort(), ['t.a', 't.b', 't.c', 't.e', 't.f']); // e,f: no counting world here
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].id, 't.d');
  assert.match(r.failed.find((f) => f.id === 't.c').message, /no expect/);
  assert.match(r.failed.find((f) => f.id === 't.a').message, /expected "Goodbye"/);
  assert.equal(r.passed, 1); // t.g
});

// ---- loaders, server, CLI, browser safety ------------------------------------------------

test('bundle loader and fs loader produce the same world set', async () => {
  const fsl = createFsLoader({ roots: [path.join(ROOT, 'worlds')] });
  const bundle = { worlds: {} };
  for (const id of await fsl.listWorlds()) {
    const files = {};
    for (const f of ['world.sop', 'legend.sop', 'lexicon.sop', 'patterns.sop', 'operations.sop', 'kb.sop', 'templates.sop', 'tests.sop']) {
      const t = await fsl.readFile(id, f);
      if (t != null) files[f] = t;
    }
    bundle.worlds[id] = { files, opsUrl: (await fsl.loadOps(id)) ? new URL(`../worlds/${id}/ops.mjs`, import.meta.url).href : undefined };
  }
  const e = await (await import('../src/dialog/index.mjs')).createEngine({ loader: createBundleLoader(bundle) });
  assert.deepEqual(e.worlds().map((w) => w.id).sort(), (await fsl.listWorlds()).sort());
  assert.match((await e.createSession().send('Hello')).text, /^Hello/);
  assert.deepEqual(e.problems(), []);
  assert.equal(await createBundleLoader(bundle).readFile('nope', 'world.sop'), null);
});

test('server: health, worlds, sessions, messages, memory, 501 for learning', async () => {
  const { server, close } = createServer({ engine, idleMs: 60_000 });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const call = (method, p, body) => new Promise((resolve, reject) => {
    const req = http.request({ port, method, path: p, headers: { 'content-type': 'application/json' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: d }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    const health = JSON.parse((await call('GET', '/v1/health')).body);
    assert.deepEqual([health.ok, health.worlds], [true, 5]);
    assert.equal(JSON.parse((await call('GET', '/v1/worlds')).body).length, 5);
    const w = JSON.parse((await call('GET', '/v1/worlds/test.counting')).body);
    assert.equal(w.manifest.id, 'test.counting');
    assert.ok(w.legend.types.length >= 4);
    assert.equal(w.tests.count, 10);
    assert.equal((await call('GET', '/v1/worlds/nope')).status, 404);
    const { sessionId } = JSON.parse((await call('POST', '/v1/sessions', { language: 'en' })).body);
    const m = await call('POST', `/v1/sessions/${sessionId}/messages`, { text: 'Tom has 5 apples. How many apples does Tom have?' });
    assert.equal(m.status, 200);
    assert.equal(JSON.parse(m.body).answers[0].value, 5);
    const mem = await call('GET', `/v1/sessions/${sessionId}/memory`);
    assert.match(mem.type, /text\/plain/);
    assert.match(mem.body, /@w1 test.counting.holding/);
    assert.equal((await call('POST', `/v1/sessions/${sessionId}/messages`, { nope: 1 })).status, 400);
    assert.equal((await call('POST', '/v1/sessions/unknown/messages', { text: 'x' })).status, 404);
    assert.equal((await call('POST', '/v1/learn/anything', {})).status, 501);
    assert.equal((await call('POST', '/v1/worlds/core/improvements', {})).status, 501);
    assert.equal((await call('GET', '/nope')).status, 404);
  } finally { close(); }
});

test('server: idle sessions expire', async () => {
  const { server, sessions, close } = createServer({ engine, idleMs: 30 });
  await new Promise((r) => server.listen(0, r));
  try {
    const port = server.address().port;
    const id = await new Promise((resolve) => {
      const req = http.request({ port, method: 'POST', path: '/v1/sessions' }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d).sessionId)); });
      req.end('{}');
    });
    assert.ok(sessions.has(id));
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(!sessions.has(id));
  } finally { close(); }
});

test('CLI: test-world all passes; parse reports errors; formalize prints wires', () => {
  const run = (...args) => execFileSync('node', [path.join(ROOT, 'src/cli.mjs'), ...args], { encoding: 'utf8' });
  assert.match(run('test-world', 'all'), /kids\.common: \d+\/\d+ passed/);
  assert.match(run('--root', path.join(ROOT, 'tests/fixtures/worlds'), 'test-world', 'test.counting'), /test\.counting: 10\/10 passed/);
  assert.match(run('--root', path.join(ROOT, 'tests/fixtures/worlds'), 'formalize', 'Tom has 5 apples'), /@w1 test\.counting\.holding/);
  assert.throws(() => run('test-world', 'nope'), (e) => /unknown world/.test(e.stdout));
  assert.throws(() => run('parse', path.join(ROOT, 'package.json')), (e) => /error/.test(e.stdout));
});

test('browser-safe modules never import node:*', async () => {
  const dirs = ['soplang', 'legends', 'worlds', 'formalizer', 'interpreter', 'dialog'];
  const files = [path.join(ROOT, 'src/loaders/bundle-loader.mjs')];
  const walk = async (d) => {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p); else if (p.endsWith('.mjs')) files.push(p);
    }
  };
  for (const d of dirs) await walk(path.join(ROOT, 'src', d));
  for (const f of files) assert.doesNotMatch(await readFile(f, 'utf8'), /from\s+['"]node:|import\(['"]node:|require\(/, f);
  for (const w of ['core', 'kids.common']) {
    const f = path.join(ROOT, 'worlds', w, 'ops.mjs');
    try { assert.doesNotMatch(await readFile(f, 'utf8'), /^\s*import\s/m, f); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
});

test('language auto: a short or ambiguous reply keeps the session language and is not translated to Romanian', async () => {
  const { createTranslator } = await import('../src/translate/index.mjs');
  const e = await fixtureEngine({ translator: createTranslator() });
  const s = e.createSession({ language: 'auto' });
  for (const t of ['e', 'e, no, z', 'ok', 'a']) {
    const r = await s.send(t);
    assert.equal(r.lang, 'en', t);
    assert.equal(r.translation, null, t);
    assert.doesNotMatch(r.text, /[ăâîșț]/, t);
  }
  const ro = await s.send('Câte mere are Ion?');   // strong Romanian evidence (diacritics): the session becomes Romanian
  assert.equal(ro.lang, 'ro');
  assert.equal((await s.send('e')).lang, 'ro');     // and an ambiguous token now keeps Romanian
  assert.equal((await s.send('Hello there')).lang, 'en');
});
