// RP5 + MOBILE-VOICE items 4-5: Romanian voice failures from the phone session (training/eval/expectations-2026-11-09e.jsonl).
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

test('avatar expressions: fii bucuros / vesel / trist / nervos / supărat / speriat / surprins', async () => {
  for (const w of ['bucuros', 'vesel', 'trist', 'nervos', 'supărat', 'speriat', 'surprins']) {
    const { r, status } = await run('robot', [`fii ${w}`]);
    assert.deepEqual(status, ['supported'], w);
    assert.equal(r.lang, 'ro');
    assert.match(r.text, /^\S+! Acum arăt /, w);
  }
});

test('voice inflections: "becoming emoji", "fiind copil"', async () => {
  const en = await run('robot', ['becoming emoji'], { lang: 'en' });
  assert.deepEqual(en.status, ['supported']); assert.match(en.r.text, /emoji/);
  const ro = await run('robot', ['fiind copil']);
  assert.deepEqual(ro.status, ['supported']); assert.match(ro.r.text, /kid|copil/i);
});

test('"x și zero" names tic-tac-toe', async () => {
  for (const m of ['pornește x și zero', 'pornește x și 0']) assert.deepEqual((await run('tictactoe', [m])).status, ['supported'], m);
});

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

test('template interjections are Romanian in a Romanian session', async () => {
  for (const [en, ro] of [['Voila!', 'Poftim!'], ['Look at that!', 'Uite!']]) {
    const t = await rules.translate(en, { from: 'en', to: 'ro' });
    assert.equal(t.text, ro);
    assert.deepEqual(t.unknown ?? [], []);
  }
});

test('a translator that returns the Romanian text unchanged is retried through the rules translator', async () => {
  const lazy = { ...rules, rules, translate: async (text, o) => (o.from === 'ro' ? { text, alignment: [], unknown: [], confidence: 0 } : rules.translate(text, o)) };
  const eng = await createEngine({ loader: createFsLoader(), translator: lazy });
  const { status, r } = await run('draw', ['desenează trei pești în apă', 'șterge peștii'], { eng });
  assert.deepEqual(status, ['supported']); assert.match(r.text, /3 pești/);
});

test('avatar refusals are Romanian and "dreamy" eyes become sleepy', async () => {
  const s = engine.createSession({ language: 'ro' });
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  const a = await s.send('fa ochi cubici');
  assert.match(a.text, /^Nu cunosc niciun fel de ochi/);
  const b = await s.send('fa ochi visatori');
  assert.match(b.text, /somnoroși/);
});

// ---- RP5b ----
const english = /\b(the|you|your|with|could not|did not|Done|There you go|should|can say|numbers|Drew|I have|Now I am)\b/;

test('RP5b: "diagramă" is the diagram, "în diagramă" names the Diagram world, on any tab', async () => {
  assert.match((await rules.translate('diagramă', { from: 'ro', to: 'en' })).text, /diagram/i);
  assert.match((await rules.translate('un grafic', { from: 'ro', to: 'en' })).text, /chart/);
  for (const tab of ['draw', 'robot', 'diagram']) {
    const { r, s } = await run(tab, ['desenează trei cercuri în diagramă']);
    assert.equal(s.state()['ui.shell'].activeTab, 'diagram', tab);
    assert.equal(s.state()['diagram.sketch'].shapes.length, 3, tab);
    assert.equal(r.text, 'Am desenat c1, c2 și c3.', tab);
  }
  const en = await run('draw', ['draw three circles in the diagram'], { lang: 'en' });
  assert.equal(en.s.state()['ui.shell'].activeTab, 'diagram');
});

test('RP5b: every tab opens by its Romanian name and the voice variants, with a Romanian reply', async () => {
  const tabs = [['desen', 'draw'], ['desenat', 'draw'], ['diagramă', 'diagram'], ['diagrama', 'diagram'], ['grafic', 'charts'], ['grafice', 'charts'], ['hartă', 'map'], ['muzică', 'music'], ['editor', 'editor'],
    ['șah', 'chess'], ['spânzurătoarea', 'hangman'], ['x și zero', 'tictactoe'], ['ghicește animalul', 'guess'], ['documente', 'documents'], ['avatar', 'robot'], ['profil', 'profile']];
  for (const [name, id] of tabs) for (const form of [`deschide tabul ${name}`, `mergi la fila ${name}`]) {
    const start = id === 'robot' ? 'draw' : 'robot';
    const { r, s } = await run(start, [form]);
    assert.equal(s.state()['ui.shell'].activeTab, id, form);
    assert.match(r.text, /^Bine, iată fila \S/, form);
    assert.ok(!/Am înțeles asta|open the/.test(r.text), form);
  }
  const already = await run('robot', ['deschide tabul avatar']);
  assert.equal(already.r.text, 'Ești deja pe fila Avatar.');
});

test('RP5b: avatar become / describe / mouth-size refusal are Romanian', async () => {
  for (const [msg, re] of [['fii un carton', /^\S+! Acum sunt un desen animat\. Am .+\./], ['fiind copil', /^\S+! Acum sunt un copil\. Am .+\./]]) {
    const { r } = await run('robot', [msg]);
    assert.match(r.text, re, msg); assert.ok(!english.test(r.text.replace(/\(.*\)/, '')), r.text);
  }
  const mouth = await run('robot', ['Fă o gură mare']);
  assert.match(mouth.r.text, /^Nu pot schimba mărimea gurii, dar îi pot schimba stilul\. Gura mea poate fi .+\.$/);
  assert.equal(mouth.r.lang, 'ro');
  const grill = await run('robot', ['un grătar gură']);
  assert.match(grill.r.text, /o gură grătar/);
  for (const [en, ro] of [['collared clothes, attached ears and a curve nose', 'haine cu guler, urechi lipite și un nas curbat'], ['a moustache and goatee and a short beard', 'o mustață cu barbiță și o barbă scurtă'],
    ['cheery eyes, bangs and a teeth smile mouth', 'ochi veseli, breton și o gură cu zâmbet cu dinți'], ['hair style 4 and eyes style 5', 'părul stil 4 și ochi stil 5']]) {
    const t = await rules.translate(`I have ${en}.`, { from: 'en', to: 'ro' });
    assert.equal(t.text, `Am ${ro}.`); assert.deepEqual(t.unknown ?? [], []);
  }
});

test('RP5b: tic-tac-toe start, missing-place prompt and chart help are Romanian', async () => {
  const ttt = await run('tictactoe', ['pornește x și zero']);
  assert.match(ttt.r.text, /^Bine, hai să jucăm x și 0! Ești X și începi tu\. Joc la nivelul ușor\. Spune un loc/);
  const where = await run('draw', ['desenează pește', 'mută peștele']);
  assert.match(where.r.text, /^Unde ar trebui să meargă\? Poți spune, de exemplu, "mută copacul la stânga"/);
  const chart = await rules.translate('I could not find numbers in "x". Say it like this: "make a chart: apples 5, pears 3, plums 8".', { from: 'en', to: 'ro' });
  assert.equal(chart.text, 'Nu am găsit numere în "x". Spune-o așa: "fă un grafic: mere 5, pere 3, prune 8".');
});

test('RP5b: moving a thing into the water says "în apă" and adds the water when there is none', async () => {
  const { r, s } = await run('draw', ['desenează pește', 'mută peștele în apă']);
  assert.match(r.text, /Am mutat peștele în apă\./);
  assert.match(r.text, /Nu era apă, așa că am adăugat-o pe pământ\./);
  assert.equal(s.state()['art.draw'].ground, 'sea');
  const again = await run('draw', ['desenează apă', 'desenează pește', 'mută peștele în apă']);
  assert.doesNotMatch(again.r.text, /Nu era apă/);
  const en = await run('draw', ['draw a fish', 'move the fish into the water'], { lang: 'en' });
  assert.match(en.r.text, /I moved the fish into the water\. There was no water, so I added it to the ground\./);
});
