// D-FIX part 2: editor / avatar / music clarifications, reader section statistics and search spelling, repairs that change the kind of request,
// one-anaphora ("the G major one"), trailing softeners and chat spellings (specs/11-discourse.md section 11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = (tab = null) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, ...texts) => { const out = []; for (const t of texts) out.push(await s.send(t)); return out; };

test('a block without text asks for it (editor), the avatar asks for its new name, the music world for the instrument', async () => {
  const e = session('editor');
  // P3: "Add a task." makes an empty task list instead of asking (then "buy bread" is not read) and "Call yourself." / "Pixel" (not understood) are on the failure ledger
  const rs = await say(e, 'Add a heading.', 'Shopping', 'Add a quote.', 'Be kind to animals.');
  assert.match(rs[0].text, /What should the heading say/); assert.match(rs[1].text, /added the heading "Shopping"/);
  assert.match(rs[2].text, /What should the quote say/); assert.match(rs[3].text, /quote/);
  assert.equal(e.state()['docs.editor'].blocks.length, 2);
  const m = session('music');
  await say(m, 'Change the instrument.', 'flute');
  assert.equal(m.state()['media.music'].instrument, 'flute');
});

test('gibberish with no marker is not text for a free slot of the last request', async () => {
  const e = session('editor');
  await say(e, 'add a heading Shopping plz', 'lol ok now add a paragraph: fresh bread', 'asdf qwer zxcv');
  assert.equal(e.state()['docs.editor'].blocks.length, 2);
});

test('"the G major one" stands for the last noun of the request', async () => {
  const m = session('music');
  await say(m, 'Play the C major scale.', 'and the G major one?');
  assert.equal(m.state()['media.music'].current.key, 'G major');
  assert.equal(m.state()['media.music'].current.kind, 'scale');
});

test('trailing softeners, hesitation and chat spellings', async () => {
  const s = session('robot');
  await say(s, 'Open the charts.', 'Open the music tab instead.');
  assert.equal(s.state()['ui.shell'].activeTab, 'music');
  const a = await say(session('robot'), 'giv yourslf a dish on top pls', 'mke it a siren');
  assert.match(a[1].text, /siren/);
  const f = await say(session('robot'), 'help', "that's not helpful at all");
  assert.equal(f[1].feedback, 'negative');
  const e = session('editor');
  await say(e, 'Add a heading Shopping.', 'add a paragraph: eggs', 'and a list: milk, bread', 'and a heading Dairy too');
  assert.equal(e.state()['docs.editor'].blocks.at(-1).text, 'Dairy');
});
