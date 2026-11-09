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
