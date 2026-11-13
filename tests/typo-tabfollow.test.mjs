// Typo tolerance of the rule formalizer (spec 03 section 1b), tab follow of the dialog layer (spec 07 section 6)
// and the avatar's confirmation / undo behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { classicAvatar } from './helpers.mjs';
import { editDistance, correctTokens, tokenize } from '../src/formalizer/rules/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

test('editDistance: Damerau-Levenshtein with early exit', () => {
  assert.equal(editDistance('surprised', 'surprised'), 0);
  assert.equal(editDistance('suprised', 'surprised'), 1);
  assert.equal(editDistance('yourself', 'tourself'), 1);
  assert.equal(editDistance('teh', 'the'), 1);
  assert.equal(editDistance('abcd', 'wxyz', 1), 2);
});

test('correctTokens: budget by length, numbers, quotes, names and known words are left alone', () => {
  const vocab = new Set(['surprised', 'yourself', 'monkey', 'zebra', 'zebras', 'black']);
  const run = (text) => correctTokens(tokenize(text, 0), text, vocab);
  assert.deepEqual(run('look suprised').corrections.map((c) => [c.from, c.to]), [['suprised', 'surprised']]);
  assert.deepEqual(run('tourself').corrections.map((c) => c.to), ['yourself']);
  assert.equal(run('blak').corrections.length, 1);              // 4 letters: distance 1
  assert.equal(run('bla').corrections.length, 0);               // under 4 letters: never
  assert.equal(run('look 12').corrections.length, 0);           // numbers
  assert.equal(run('call me "suprised"').corrections.length, 0); // quoted
  assert.equal(run('ask Suprised').corrections.length, 0);      // a capitalized name in the middle
  assert.equal(run('zebra').corrections.length, 0);             // known
  assert.equal(run('zebrz').corrections.length, 1);             // zebra is the unique closest word
});

test('correctTokens: a tie between two candidates is not corrected', () => {
  const vocab = new Set(['bark', 'bank']);
  const text = 'bamk';
  assert.equal(correctTokens(tokenize(text, 0), text, vocab).corrections.length, 0);
});

test('the formalizer retries once with corrected words and records them in the segment and the trace', async () => {
  const s = classicAvatar(engine.createSession());
  const r = await s.send('look suprised');
  assert.equal(s.state('ui.avatar').person.expression === 'awe' || s.state('ui.avatar').robot.mouth === 'speaker', true);
  assert.deepEqual(r.segments[0].corrections.map((c) => [c.from, c.to]), [['suprised', 'surprised']]);
  assert.deepEqual(r.trace.segments[0].corrections.map((c) => c.to), ['surprised']);
  assert.match(r.text, /\(I read "suprised" as "surprised"\)/);
  const t = await s.send('give tourself a random look');
  assert.match(t.text, /\(I read "tourself" as "yourself"\)/);
  assert.equal((await s.send('look surprised')).segments[0].corrections ?? undefined, undefined);   // no typo, no note
});

test('typo tolerance does not invent readings for nonsense', async () => {
  const s = engine.createSession();
  const r = await s.send('Flurbo zangle prum.');
  assert.equal(r.segments[0].unparsed, true);
  assert.doesNotMatch(r.text, /I read/);
});

test('avatar: no silent switch; an offer is answered by yes (repeats the command) or no', async () => {
  const s = engine.createSession();
  await s.send('I want a human as avatar');
  assert.equal(s.state('ui.avatar').character, 'person');
  const r = await s.send('use the cyclops eye');
  assert.match(r.text, /has no cyclops eyes, but the robot does\. Say "yes" to become the robot/);
  assert.equal(s.state('ui.avatar').character, 'person');
  const y = await s.send('yes');
  assert.equal(s.state('ui.avatar').character, 'robot');
  assert.equal(s.state('ui.avatar').robot.eyes, 'cyclops');
  assert.match(y.text, /Now I am a robot/);
  const why = await s.send('why you turned it in a robot, this ia wrong');
  assert.match(why.text, /sorry/i);
  assert.match(why.text, /become a person/);
  await s.send('undo');
  assert.equal(s.state('ui.avatar').character, 'person');
  await s.send('make blue eyes');
  assert.match((await s.send('no')).text, /stay a person/);
  assert.equal(s.state('ui.avatar').character, 'person');
  // anything else cancels the offer and is read normally
  await s.send('make blue eyes');
  await s.send('look happy');
  assert.equal((await s.send('yes')).segments.some((x) => x.match?.worldId === 'ui.avatar'), false);
  assert.equal(s.state('ui.avatar').character, 'person');
});

test('avatar: undo walks back through the changes, including a character change', async () => {
  const s = classicAvatar(engine.createSession());
  assert.match((await s.send('undo')).text, /nothing to undo/);
  await s.send('make your eyes round'); await s.send('become an emoji'); await s.send('go back to how you were');
  assert.equal(s.state('ui.avatar').character, 'robot');
  assert.match((await s.send('can you be a girl')).text, /person/);
  assert.equal(s.state('ui.avatar').character, 'person');
});

test('tab follow: a world with a tab answers while another tab is shown -> its tab opens (not for clarifications or tabless worlds)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'psys2-tab-'));
  try {
    const w = path.join(dir, 'test.tabby');
    await mkdir(w, { recursive: true });
    const f = (n, t) => writeFile(path.join(w, n), t);
    await f('world.sop', '@world.test.tabby core.world\n    namespace=test.tabby\n    legend=$legend.test.tabby\n    imports=world.core\n    formalization=rules\n    language=en\n    status=fixture\n    title="Tabby"\n    tab=tabby\n    tabTitle="Tabby"\n    tabKind=tool\n');
    await f('legend.sop', '@legend.test.tabby core.legend\n    namespace=test.tabby\n    imports=core\n');
    await f('patterns.sop', '@pat.test.tabby.ping core.pattern\n    match="ping the tabby"\n    emit="@{_} core.request action=tabby.ping"\n    kind=request\n    priority=12\n    example="Ping the tabby."\n\n@pat.test.tabby.pong core.pattern\n    match="pong the tabby"\n    emit="@{_} core.request action=tabby.pong"\n    kind=request\n    priority=12\n    example="Pong the tabby."\n\n@pat.test.tabby.nope core.pattern\n    match="nope the tabby"\n    emit="@{_} core.request action=tabby.nope"\n    kind=request\n    priority=12\n    example="Nope the tabby."\n');
    const op = (n) => `@op.test.tabby.${n} core.operation\n    impl=${n}\n    semantics=action\n    action=tabby.${n}\n\n`;
    await f('operations.sop', op('ping') + op('pong') + op('nope'));
    const tpl = (n) => `@tpl.test.tabby.${n} core.template\n    for=action.tabby.${n}\n    text="{value}"\n\n@tpl.test.tabby.${n}.u core.template\n    for=action.tabby.${n}\n    status=unsupported\n    text="{note}"\n\n@tpl.test.tabby.${n}.m core.template\n    for=action.tabby.${n}\n    status=missing\n    text="{note}"\n\n`;
    await f('templates.sop', tpl('ping') + tpl('pong') + tpl('nope'));
    await f('ops.mjs', "export const ping = () => ({ status: 'supported', value: 'Pong.' });\nexport const pong = () => ({ status: 'missing', note: 'Which one?' });\nexport const nope = () => ({ status: 'unsupported', note: 'I cannot.' });\n");
    const eng = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT, dir] }) });
    const s = eng.createSession();
    assert.equal(s.state('ui.shell').activeTab, 'robot');
    await s.send('Pong the tabby.');
    assert.equal(s.state('ui.shell').activeTab, 'robot', 'a clarification does not switch');
    await s.send('Nope the tabby.');
    assert.equal(s.state('ui.shell').activeTab, 'robot', 'an unsupported answer does not switch');
    await s.send('Ping the tabby.');
    assert.equal(s.state('ui.shell').activeTab, 'tabby');
    await s.send('Become a person.');   // the avatar brings its own tab forward
    assert.equal(s.state('ui.shell').activeTab, 'robot');
    await s.send('Open the editor.');   // ui.shell has no tab of its own: it does what it says
    assert.equal(s.state('ui.shell').activeTab, 'editor');
    assert.match((await s.send('Become a person.')).text, /already/);   // nothing changed, but the avatar answered: its tab follows
    assert.equal(s.state('ui.shell').activeTab, 'robot');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('tab follow on the real worlds: "Show me Bucharest" asked on the avatar tab opens the Map', async () => {
  const s = engine.createSession();
  await s.send('Become a person.');
  assert.equal(s.state('ui.shell').activeTab, 'robot');
  await s.send('Show me Bucharest');
  assert.equal(s.state('ui.shell').activeTab, 'map');
});
