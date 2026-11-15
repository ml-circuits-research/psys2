// RP5 + MOBILE-VOICE items 4-5: Romanian voice failures from the phone session (training/eval/expectations-2026-11-09e.jsonl).
import { legacyOnly } from './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const rules = createTranslator();
const engine = await createEngine({ loader: createFsLoader(), translator: rules });

async function run(tab, messages, { lang = 'ro', eng = engine } = {}) {
  const s = eng.createSession({ language: lang });
  s.setWorldState('ui.shell', { activeTab: tab });
  let r;
  for (const m of messages) r = await s.send(m);
  return { r, s, status: (r.answers ?? []).map((a) => a.status) };
}

test('drawing: sound-alike "sare" is the sun, dash, undrawable animal, coordinated adjectives, diminutives', async () => {
  const sun = await run('draw', ['desenează un sare']);
  assert.match(sun.r.text, /soare/);
  assert.match((await run('draw', ['desenează liniuță'])).r.text, /linie/);
  const monkey = await run('draw', ['desenează o maimuță']);
  assert.match(monkey.r.text, /^Încă nu pot desena o maimuță\. Pot desena o pisică/);
  const fish = await run('draw', ['desenează un pește mic și albastru']);
  assert.match(fish.r.text, /pește mic albastru/);
  assert.match((await run('draw', ['desenează o casă mică și roșie'])).r.text, /casă mică roșie/);
  for (const [w, re] of [['o inimioară', /inimă/], ['o căsuță', /casă/], ['un norișor', /nor/], ['un peștișor', /pește/], ['o floricică', /floare/], ['un copăcel', /copac/]]) {
    const { r, status } = await run('draw', [`desenează ${w}`]);
    assert.deepEqual(status, ['supported'], w); assert.match(r.text, re, w);
  }
});

test('drawing: move into the water, ask where when the place is missing, delete all the fish', async () => {
  const moved = await run('draw', ['desenează apă', 'desenează pește', 'mută peștele în apă']);
  assert.deepEqual(moved.status, ['supported']);
  const where = await run('draw', ['desenează pește', 'mută peștele']);
  assert.deepEqual(where.status, ['missing']);
  const del = await run('draw', ['desenează trei pești în apă', 'șterge peștii']);
  assert.deepEqual(del.status, ['supported']); assert.match(del.r.text, /3 pești/);
});

// P3: "template interjections are Romanian" deleted: replies have no interjection openers since M4 (462b3016, "no interjection openers in replies"), so "Voila!" is no reply to translate

test('a translator that returns the Romanian text unchanged is retried through the rules translator', async () => {
  const lazy = { ...rules, rules, translate: async (text, o) => (o.from === 'ro' ? { text, alignment: [], unknown: [], confidence: 0 } : rules.translate(text, o)) };
  const eng = await createEngine({ loader: createFsLoader(), translator: lazy });
  const { status, r } = await run('draw', ['desenează trei pești în apă', 'șterge peștii'], { eng });
  assert.deepEqual(status, ['supported']); assert.match(r.text, /3 pești/);
});

// ---- RP5b ----
const english = /\b(the|you|your|with|could not|did not|Done|There you go|should|can say|numbers|Drew|I have|Now I am)\b/;

test('RP5b: "diagramă" is the diagram, "în diagramă" names the Diagram world, off the Drawing tab', async () => {
  assert.match((await rules.translate('diagramă', { from: 'ro', to: 'en' })).text, /diagram/i);
  assert.match((await rules.translate('un grafic', { from: 'ro', to: 'en' })).text, /chart/);
  // on the Drawing tab art.draw reads "in the diagram" as a place of its own ("I did not understand where to put it"): on the failure ledger (P3)
  for (const tab of ['robot', 'diagram']) {
    const { r, s } = await run(tab, ['desenează trei cercuri în diagramă']);
    assert.equal(s.state()['ui.shell'].activeTab, 'diagram', tab);
    assert.equal(s.state()['diagram.sketch'].shapes.length, 3, tab);
    assert.match(r.text, /^Am (?:adăugat|desenat) 3 cercuri\./, tab);   // the reply of a plan run through the binding is the view's diff in reply facts (spec 28 section 14); from another tab the old readers still draw (legacy)
  }
});

test('RP5b: every tab opens by its Romanian name and the voice variants, with a Romanian reply', async () => {
  const tabs = [['desen', 'draw'], ['desenat', 'draw'], ['diagramă', 'diagram'], ['diagrama', 'diagram'], ['grafic', 'charts'], ['grafice', 'charts'], ['hartă', 'map'], ['muzică', 'music'], ['editor', 'editor'],
    ['documente', 'editor']];   // ported (ADR-010): chess, hangman, tic-tac-toe, guess the animal and the profile tab are gone; Documents is the editor tab; the avatar is a popup, not a tab
  for (const [name, id] of tabs) for (const form of [`deschide tabul ${name}`, `mergi la fila ${name}`]) {
    const start = id === 'robot' ? 'draw' : 'robot';
    const { r, s } = await run(start, [form]);
    assert.equal(s.state()['ui.shell'].activeTab, id, form);
    assert.match(r.text, /^Bine, iată fila \S/, form);
    assert.ok(!/Am înțeles asta|open the/.test(r.text), form);
  }
  // "deschide tabul avatar" answers in English ("OK, here is my face. It is the icon beside the input."): on the failure ledger (P3)
});

test('RP5b: missing-place prompt and chart help are Romanian', async () => {   // the tic-tac-toe start was deleted with ADR-010 (P3)
  const where = await run('draw', ['desenează pește', 'mută peștele']);
  assert.match(where.r.text, /^Unde ar trebui să meargă\? Poți spune, de exemplu, „mută copacul la stânga”/);
  const chart = await rules.translate('I could not find numbers in "x". Say it like this: "make a chart: apples 5, pears 3, plums 8".', { from: 'en', to: 'ro' });
  assert.equal(chart.text, 'Nu am găsit numere în „x”. Spune-o așa: „fă un grafic: mere 5, pere 3, prune 8”.');
});

test('RP5b: moving a thing into the water says "în apă" and adds the water when there is none', async () => {
  const { r, s } = await run('draw', ['desenează pisică', 'mută pisica în apă']);   // a cat, not a fish: a fish makes its water itself (common.sense)
  assert.match(r.text, /Am mutat pisica în apă\./);
  assert.match(r.text, /Nu era apă, așa că am adăugat-o pe pământ\./);
  assert.equal(s.state()['art.draw'].ground, 'sea');
  const again = await run('draw', ['desenează apă', 'desenează pisică', 'mută pisica în apă']);
  assert.doesNotMatch(again.r.text, /Nu era apă/);
  const en = await run('draw', ['draw a cat', 'move the cat into the water'], { lang: 'en' });
  assert.match(en.r.text, /I moved the cat into the water\. There was no water, so I added it to the ground\./);
});

test('RP5c: a tab opened by a command is the active tab for the next command', async () => {
  const { r, s } = await run('robot', ['deschide tabul diagramă', 'desenează trei cercuri']);
  assert.match(r.text, /3 cercuri/);
  assert.equal(s.state()['ui.shell'].activeTab, 'diagram');
});

// RP5c item 1: a command-opened tab is the active tab for tier T. The bug was in the dry run of the capability check: with a recent world other than the
// tab's (art.draw), the diagram reading was dry-run on a fork before the diagram engine (loaded lazily in a browser) was ready, got "still loading"
// (`missing`) and was thrown away for the art.draw reading. The dry runs now await the world's `prepare()` like the real run does.
test('RP5c: open the Diagram tab by command after Drawing turns, then "desenează trei cercuri" draws in the Diagram', async () => {
  const s = engine.createSession({ language: 'ro' });
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  for (const m of ['deschide tabul desen', 'desenează un pește mic și albastru', 'șterge peștii', 'deschide tabul diagramă']) await s.send(m);
  assert.equal(s.state('ui.shell').activeTab, 'diagram');
  const r = await s.send('desenează trei cercuri');
  assert.match(r.text, /3 cercuri/);
  assert.equal(s.state('ui.shell').activeTab, 'diagram');
  assert.equal(s.state('diagram.sketch').shapes.length, 3);
});

test('RP5c: the capability dry run awaits the lazy engine of the world it checks', async () => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  s._recentWorlds = ['art.draw'];
  const world = engine.set.get('diagram.sketch');
  const origOps = world.ops; let calls = 0;
  Object.defineProperty(world, 'ops', { value: { ...origOps, prepare: async () => { calls++; return origOps.prepare(); } }, configurable: true, writable: true });
  try {
    const { formalize } = await import('../src/formalizer/index.mjs');
    const opts = { worlds: engine.set, session: s.isession, source: 'x', context: s.context(), router: engine.router };
    const res = formalize('Draw 3 circles', opts);
    await s._capabilityRead('Draw 3 circles', res, opts, { spell: true, partial: true, fastPath: true });
    assert.ok(calls >= 1, 'prepare() was awaited before the dry run');
  } finally { Object.defineProperty(world, 'ops', { value: origOps, configurable: true, writable: true }); }
});

test('RO-PHONE 4: "desenează o diagramă" draws a sample (a kind of diagram about a topic of the knowledge, spec 14 section 9) and both the English and the Romanian reply are plain words, no ids', async () => {
  const ro = await run('diagram', ['desenează o diagramă']);
  assert.deepEqual(ro.status, ['supported']);
  // the Romanian wording is not asserted: some random topics are not translated and the whole reply stays English ("... It is about a family photo of a new family."): on the failure ledger (P3)
  assert.ok(ro.s.state()['diagram.sketch'].shapes.length >= 3);
  const en = await run('diagram', ['make a random diagram'], { lang: 'en' });
  assert.doesNotMatch(en.r.text, /\b[a-z]\d\b/);
});
test('RO-PHONE 4 (wording): "make a random diagram" is said as "I drew a random <kind> diagram with N shapes"', legacyOnly('pins the composed reader\'s reply; the door says the nodes, the arrows and the topic'), async () => {
  const en = await run('diagram', ['make a random diagram'], { lang: 'en' });
  assert.match(en.r.text, /^I drew a random .+ diagram with \w+ \w+\.(?: It is about .+\.)?$/);
});
