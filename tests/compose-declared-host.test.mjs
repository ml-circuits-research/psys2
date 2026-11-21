// Composition from knowledge (worlds/app.project/compose-policy.sop, src/dialog/compose-execution.mjs): random,
// "surprise me", "another one", "simpler" and conversation-grounded drawings, diagrams and charts, composed by declared
// rules from the pinned catalog (k.scenes, k.procedures, k.time, k.diagrams, k.charts measures and categories) with
// the library's seeded sampling, executed through the areas' own operations as one undoable turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, str } from '../src/vendor/sopworld/sopworld.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { CATALOG_PIN } from '../src/knowledge/catalog-pin.mjs';
import { composeStart, composeRequest, executeCompose, composeCalls } from '../src/dialog/compose-execution.mjs';
import { routeNewEngine } from '../src/dialog/reader-routing.mjs';
import { emptyDrawingState } from '../worlds/art.draw/sop-drawing.mjs';
import { emptyDiagramState } from '../worlds/diagram.sketch/sop-diagram.mjs';
import { performGesture } from './fixtures/editor-gesture.mjs';

const webchat = new URL('../docs/webchat/', import.meta.url);
const knowledge = createFacts({ source: createKnowledgeSource(new URL('catalog/' + CATALOG_PIN.commit + '/', webchat).pathname) });
const deployment = JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json', webchat)));
const bindings = JSON.parse(readFileSync(new URL(deployment.artifactBase + deployment.bindingsArtifact.path, webchat)));
const session = (view) => ({ isession: { state: { 'ui.shell': { activeTab: view }, ...(view === 'draw' ? { 'art.draw': emptyDrawingState() } : { 'diagram.sketch': emptyDiagramState() }) } },
  engine: { knowledge, nativeBindings: bindings } });
const val = (w, key) => { const raw = w.attrs[key]?.[0]; return raw === undefined ? undefined : str(raw); };
const drawn = (s) => parse(s.isession.state['art.draw'].sop ?? '').filter((w) => w.type === 'w.drawing.object').map((w) => val(w, 'drawing'));
const rows = (s, type) => parse(s.isession.state['diagram.sketch'].sop ?? '').filter((w) => w.type === type);
const undo = '@s std.request.source text="undo" @r std.request act=undo mood=do source=$s';

test('a scene drawn from k.scenes is reproducible from its seed, undoable, and "another one" is the next seed', async () => {
  const a = session('draw'), b = session('draw');
  const request = { form: 'scene', source: 'random', seed: 3, subject: 'farm', variant: 'simpler' };
  const first = await executeCompose(a, request, { view: 'draw' });
  assert.deepEqual(first.statuses, ['supported'], JSON.stringify(first.trace));
  assert.match(first.text, /^I drew a farm scene, chosen at random .*\(seed 3\)/);
  await executeCompose(b, request, { view: 'draw' });
  assert.deepEqual(drawn(a), drawn(b), 'the same seed draws the same scene');
  const farm = new Set(parse(await knowledge.wireSource('k.scenes.has', { field: 'scene', keys: ['farm'] })).flatMap((w) => [val(w, 'thing'), val(w, 'drawing')]));
  assert.ok(drawn(a).length >= 3 && drawn(a).length <= 6, 'simpler: a landscape and at most five things ' + drawn(a));
  assert.ok(drawn(a).every((kind) => kind === 'landscape' || farm.has(kind)), 'every thing is one the farm has: ' + drawn(a));
  // "another one": the reader's make of a new drawn thing with no kind, right after a composition.
  const start = await composeStart(a, { area: 'drawing', act: 'make', mode: 'new', type: 'drawn' }, { knowledge });
  assert.deepEqual(start, { area: 'drawing', form: 'scene', subject: undefined, variant: 'another' });
  const next = composeRequest(a, start);
  assert.equal(next.seed, 4);
  assert.equal(next.subject, 'farm');
  const before = structuredClone(a.isession.state['art.draw']);
  const undone = await routeNewEngine(a, undo, { view: 'draw' });
  assert.deepEqual(undone.statuses, ['supported']);
  assert.deepEqual(drawn(a), [], 'undo takes the whole composition away');
  const redone = await routeNewEngine(a, '@s std.request.source text="redo" @r std.request act=redo mood=do source=$s', { view: 'draw' });
  assert.deepEqual(redone.statuses, ['supported']);
  assert.deepEqual(a.isession.state['art.draw'].sop, before.sop, 'redo restores it');
});

test('the declared rules keep a thing asked for, leave out what the catalog marks sensitive, and draw fewer things when simpler', async () => {
  const s = session('draw');
  for (const seed of [1, 2, 3, 4, 5]) {
    const withDog = await composeCalls(s, { form: 'scene', source: 'random', seed, with: 'dog' }, { view: 'draw', knowledge });
    assert.ok(withDog.calls.some((c) => c.thing === 'dog'), 'a scene with a dog has the dog (seed ' + seed + ')');
    const castle = await composeCalls(s, { form: 'scene', source: 'random', seed, subject: 'castle', variant: 'richer' }, { view: 'draw', knowledge });
    assert.ok(!castle.calls.some((c) => ['sword', 'cannon'].includes(c.thing)), 'no weapon unasked: ' + castle.calls.map((c) => c.thing));
    const rich = await composeCalls(s, { form: 'scene', source: 'random', seed, subject: 'farm' }, { view: 'draw', knowledge });
    const simple = await composeCalls(s, { form: 'scene', source: 'random', seed, subject: 'farm', variant: 'simpler' }, { view: 'draw', knowledge });
    assert.ok(simple.limit < rich.limit && simple.level === 'simple');
  }
});

test('a random flowchart is the ordered steps of a known procedure, joined and laid out; "keep it simple" is a standing preference', async () => {
  const s = session('diagram');
  const made = await executeCompose(s, { form: 'diagram', source: 'random', seed: 6, subject: 'flowchart', with: 'making tea' }, { view: 'diagram' });
  assert.deepEqual(made.statuses, ['supported'], JSON.stringify(made.trace));
  assert.match(made.text, /^I made a flowchart for "making tea"/);
  const labels = rows(s, 'w.diagram.node').map((w) => val(w, 'label'));
  assert.deepEqual(labels.slice(0, 3), ['Boil water', 'Put a tea bag in a cup', 'Pour the hot water into the cup']);
  assert.equal(rows(s, 'w.diagram.edge').length, labels.length - 1, 'the steps are joined in a chain');
  // A cycle closes.
  const c = session('diagram');
  await executeCompose(c, { form: 'diagram', source: 'random', seed: 4, subject: 'cycle' }, { view: 'diagram' });
  assert.equal(rows(c, 'w.diagram.edge').length, rows(c, 'w.diagram.node').length, 'a cycle joins its last stage to the first');
  // "keep it simple": stated once, it holds for later compositions.
  const p = session('diagram');
  const stated = await performGesture(p, { view: 'diagram', operation: 'diagram.preference.state', args: { key: 'compose.detail', value: 'simple', about: 'keep it simple' } });
  assert.ok(stated.ok, JSON.stringify(stated));
  const planned = await composeCalls(p, { form: 'diagram', source: 'random', seed: 6, subject: 'flowchart', with: 'making tea' }, { view: 'diagram', knowledge });
  assert.equal(planned.level, 'simple');
  assert.equal(planned.calls.filter((call) => call.phase === 'make').length, 4);
});

test('a chart with invented values takes a k.charts measure, its dimension\'s categories, values in the declared range, and says so', async () => {
  const s = session('diagram');
  const made = await executeCompose(s, { form: 'chart', source: 'random', seed: 5 }, { view: 'diagram' });
  assert.deepEqual(made.statuses, ['supported'], JSON.stringify(made.trace));
  assert.match(made.text, /The values are invented/);
  const [measure, dimension] = made.trace.compose.found.subject.split(' by ');
  const m = parse(await knowledge.wireSource('k.charts.measure', { field: 'name', keys: [measure] }))[0];
  const categories = parse(await knowledge.wireSource('k.charts.category', { field: 'dimension', keys: [dimension] })).map((w) => val(w, 'label'));
  const points = rows(s, 'w.diagram.node').filter((w) => val(w, 'value') !== undefined);
  assert.ok(points.length >= 3, 'one value per category');
  for (const point of points) {
    const v = Number(val(point, 'value'));
    assert.ok(v >= Number(val(m, 'min')) && v <= Number(val(m, 'max')), measure + ' value ' + v + ' in its plausible range');
    assert.ok(categories.includes(val(point, 'label')), 'label ' + val(point, 'label') + ' is a category of ' + dimension);
  }
  const again = session('diagram');
  await executeCompose(again, { form: 'chart', source: 'random', seed: 5 }, { view: 'diagram' });
  const byN = (list) => list.filter((w) => val(w, 'value') !== undefined).sort((a, b) => Number(val(a, 'n')) - Number(val(b, 'n'))).map((w) => val(w, 'value'));
  assert.deepEqual(byN(rows(again, 'w.diagram.node')), byN(points), 'the seed reproduces the values');
});

test('conversation-grounded content uses what earlier turns read; with nothing usable it says so and offers a random one', async () => {
  const d = session('draw');
  d.composeTurns = [{ area: 'draw', requests: [{ act: 'make', target: { mode: 'new', kind: 'dog', kind_span: 'dog' }, constraints: [] }] },
    { area: 'draw', requests: [{ act: 'make', target: { mode: 'new', kind: 'cat', kind_span: 'cat' }, constraints: [] }] }];
  const drew = await executeCompose(d, { form: 'scene', source: 'conversation', seed: 1 }, { view: 'draw' });
  assert.deepEqual(drew.statuses, ['supported'], JSON.stringify(drew.trace));
  assert.deepEqual(drawn(d).sort(), ['cat', 'dog']);
  const c = session('diagram');
  c.composeTurns = [{ area: 'diagram', requests: [{ act: 'make', target: { mode: 'new', kind: 'apple', kind_span: 'apples', count: 5 }, constraints: [] }] },
    { area: 'diagram', requests: [{ act: 'make', target: { mode: 'new', kind: 'pear', kind_span: 'pears', count: 8 }, constraints: [] }] }];
  const charted = await executeCompose(c, { form: 'chart', source: 'conversation', seed: 1 }, { view: 'diagram' });
  assert.deepEqual(charted.statuses, ['supported'], JSON.stringify(charted.trace));
  assert.deepEqual(rows(c, 'w.diagram.node').filter((w) => val(w, 'value') !== undefined).sort((a, b) => Number(val(a, 'n')) - Number(val(b, 'n'))).map((w) => [val(w, 'label'), Number(val(w, 'value'))]), [['apples', 5], ['pears', 8]]);
  const empty = session('diagram');
  const none = await executeCompose(empty, { form: 'diagram', source: 'conversation', seed: 1 }, { view: 'diagram' });
  assert.deepEqual(none.statuses, ['unsupported']);
  assert.match(none.text, /could not find anything to use .* random one/);
  assert.deepEqual(rows(empty, 'w.diagram.node'), []);
});

test('which readings start a composition is declared: a kindless drawing, an open word, a scene name, a diagram kind; not a kind the tab draws', async () => {
  const s = session('draw');
  const start = (reading) => composeStart(s, reading, { knowledge });
  assert.equal((await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn' }))?.form, 'scene');
  assert.equal((await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'something', bound: false }))?.form, 'scene');
  assert.deepEqual(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'farm', bound: false }), { area: 'drawing', form: 'scene', subject: 'farm', variant: undefined });
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'beach', bound: true, canonical: 'k.objects.beach' }), null, 'a kind the tab draws is drawn, not composed');
  assert.deepEqual(await start({ area: 'diagram', act: 'make', mode: 'new', type: 'node', word: 'flowchart', bound: false, words: ['make', 'a', 'random', 'flowchart'] }), { area: 'diagram', form: 'diagram', subject: 'flowchart', variant: undefined });
  // A reading that specifies what to build is built from the request (real-use run e1a9e8d5): a diagram of a named
  // process or a bare diagram, a text on a thing, a placed thing, one of several things the turn names.
  assert.equal(await start({ area: 'diagram', act: 'make', mode: 'new', type: 'diagram', word: 'diagram', canonical: 'k.diagrams.kind.flowchart', constraints: ['diagram.kind'], words: ['show', 'diagram', 'of', 'sap', 'atp', 'flow'] }), null);
  assert.equal(await start({ area: 'diagram', act: 'make', mode: 'new', type: 'node', word: 'flowchart', bound: false, words: ['make', 'a', 'flowchart'] }), null);
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', constraints: ['drawn.text'], words: ['add', 'the', 'word', 'open', 'on', 'the', 'fence'] }), null);
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'mountains', bound: false, constraints: ['drawn.at'] }), null);
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'pond', bound: false, parts: 3 }), null);
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'drawn', word: 'picture', bound: false, constraints: ['drawn.relation'] }), null);
  assert.equal((await start({ area: 'drawing', act: 'make', mode: 'new', type: 'page', words: ['draw', 'something', 'random'] }))?.form, 'scene', 'a new page asked for at random is a random scene');
  assert.equal(await start({ area: 'drawing', act: 'make', mode: 'new', type: 'page', words: ['new', 'page'] }), null);
  assert.equal(await start({ area: 'diagram', act: 'make', mode: 'new', type: 'node', word: 'box', bound: true, canonical: 'w.diagram.node' }), null);
  assert.equal(await start({ area: 'diagram', act: 'make', mode: 'new', type: 'node' }), null, 'a node with no kind is a plain node, not a composition');
});

// The reader's composition keys (spec 25; reader v12): simulated raw readings of a composition target, its source,
// variant and with, and a chart's values said as random. The declared rules read these names; no JS names them.
test('reader v12 composition keys: target type composition, composition.source / variant / with, chart.values random', async () => {
  const { composeReading } = await import('../src/dialog/compose-execution.mjs');
  const said = (key, value) => ({ key, value, value_span: value, operator: 'eq', phase: 'result', character: 'requirement', polarity: 'positive' });
  const read = (area, target, constraints = [], span = 'x') => ({ raw: { area, source: { text: span }, requests: [{ act: 'make', mood: 'do', span, target: { mode: 'new', determiner: 'indefinite', ...target }, constraints }] }, candidates: [], failures: [] });
  const start = async (view, proposal, s = session(view)) => composeStart(s, composeReading(proposal), { knowledge });
  // "surprise me with a drawing": a composition with no kind, source random.
  assert.deepEqual(await start('draw', read('drawing', { type: 'composition' }, [said('composition.source', 'random')])), { area: 'drawing', form: 'scene', subject: undefined, variant: undefined, source: 'random' });
  // "draw a random farm": the scene the knowledge has.
  assert.equal((await start('draw', read('drawing', { type: 'composition', kind: 'farm', kind_span: 'farm' }, [said('composition.source', 'random')]))).subject, 'farm');
  // "a random scene with a dog": with, the scene left open.
  const withDog = await start('draw', read('drawing', { type: 'composition' }, [said('composition.source', 'random'), said('composition.with', 'a dog')]));
  assert.equal(withDog.form, 'scene'); assert.equal(withDog.with, 'dog', 'the thing the phrase names (w.lang.en determiners, singular)');
  // "chart the numbers I mentioned": a chart from the conversation.
  assert.deepEqual(await start('diagram', read('diagram', { type: 'composition', kind: 'chart', kind_span: 'chart' }, [said('composition.source', 'conversation')])), { area: 'diagram', form: 'chart', subject: undefined, variant: undefined, source: 'conversation' });
  // "make a random flowchart": a diagram kind the knowledge can fill, no random word needed.
  assert.deepEqual(await start('diagram', read('diagram', { type: 'composition', kind: 'flowchart', kind_span: 'flowchart' }, [said('composition.source', 'random')])), { area: 'diagram', form: 'diagram', subject: 'flowchart', variant: undefined, source: 'random' });
  // "simpler": the variant of the last composition (same form, same subject, same seed).
  const s = session('draw'); s.composeLast = { drawing: { form: 'scene', seed: 5, subject: 'farm', source: 'random' } };
  const simpler = await start('draw', read('drawing', { type: 'composition' }, [said('composition.variant', 'simpler')]), s);
  assert.equal(simpler.variant, 'simpler');
  assert.deepEqual(composeRequest(s, simpler), { form: 'scene', source: 'random', seed: 5, subject: 'farm', with: undefined, variant: 'simpler' });
  // An undeclared value of a closed option gives no option.
  assert.equal((await start('draw', read('drawing', { type: 'composition' }, [said('composition.variant', 'bluer')]))).variant, undefined);
  // "a chart with random values": chart.values random leaves the content open and composes a chart; numbers do not.
  assert.equal((await start('diagram', read('diagram', { type: 'chart', kind: 'chart', kind_span: 'chart' }, [said('chart.values', 'random')])))?.form, 'chart');
  assert.equal(await start('diagram', read('diagram', { type: 'chart', kind: 'chart', kind_span: 'chart' }, [said('chart.values', '3, 5, 7')])), null);
  // A composition that specifies something else of the result (a text) is built from the request, not composed.
  assert.equal(await start('draw', read('drawing', { type: 'composition' }, [said('composition.source', 'random'), said('drawn.text', 'OPEN')])), null);
});

test('reader v12 preference key compose.detail: the stated detail preference is a declared key of diagram.preference.state', () => {
  const iface = readFileSync(new URL('../worlds/diagram.sketch/native-interface.sop', import.meta.url), 'utf8');
  const prefs = readFileSync(new URL('../worlds/diagram.sketch/preferences.sop', import.meta.url), 'utf8');
  assert.match(iface, /op\.diagram\.preference\.state\.param\.key[^\n]*enum="compose\.detail"/);
  assert.match(prefs, /w\.preferences\.default key=compose\.detail/);
});
