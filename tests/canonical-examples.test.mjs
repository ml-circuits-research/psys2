// RD6: help, "what can I say here?" and "Did you mean" offer canonical example sentences only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { isCanonicalSentence, operationKey } from '../src/worlds/canonical.mjs';
import { sampled } from './helpers.mjs';
import { existsSync } from 'node:fs';

const engine = await createEngine({ loader: createFsLoader() });
const worlds = engine.set.list().filter((w) => w.patterns.length);
const TAB = { 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman', 'docs.editor': 'editor', 'ui.avatar': 'robot' };
const tabOf = (w) => w.tab?.id ?? TAB[w.id];
// operations that only exist as a follow-up, a refusal, or are owned by the shell / the open game (see scripts/mark-canonical.mjs), and one question that its twin covers
const EXEMPT = new Set(['chat.ask', 'shop.reviseLast', 'shop.revise', 'draw.askKind', 'docr.pickSection', 'chess.pick', 'music.askWhat', 'geo.askPlace', 'geo.unknown', 'avatar.setPartUnknown', 'draw.open', 'draw.keep', 'ui.newGame', 'ui.hint', 'ui.playGame', 'things.undo',   // ui.playGame: the inert game-tab rule for declared tabs (ADR-010); things.undo: only after a lesson (a follow-up)
  'core.question:kids.shapes.shape/sides',
  // generated worlds (Q23): redo and load only after an undo or a save (follow-ups: "There is nothing to redo."); music's transpose by an interval has only the fragment
  // "Up a whole tone." (transposing is offered by "Transpose it to D major."; "go up a whole tone" is misread as a song: a ledger row)
  'media.music.redo', 'plan.seating.redo', 'plan.timeline.redo', 'ui.avatar.load', 'music.transpose']);
const allCanonical = new Set(worlds.flatMap((w) => w.patterns.flatMap((p) => p.canonical ?? [])));
// The generated schema worlds (a schema.sop, spec 21) are covered again (Q23): scripts/build-schema-world.mjs writes their canonical examples from the world's own sample
// things and kinds (worlds/acts/acts.mjs exampleOf: sample=, sample.other=, sample.place=, sample.name=, sample.word=), offers no example with another world's nouns, and leaves
// out the forms a world does not read (canonical.not=, each a ledger row).
const generated = (w) => existsSync(new URL(`../worlds/${w.id}/schema.sop`, import.meta.url));

test('a generated world offers no example written about another world (no house in the charts, no guest Ann at the face)', () => {
  const foreign = /\b(?:house|houses|guest|guests|Ann|seats?)\b/;
  const own = { 'art.draw': /house/, 'plan.seating': /guest|Ann|seat/ };
  const bad = [];
  for (const w of worlds.filter(generated)) for (const c of new Set(w.patterns.flatMap((p) => p.canonical ?? []))) {
    const m = c.match(foreign);
    if (m && !(own[w.id] && own[w.id].test(m[0]))) bad.push(`${w.id}: ${c}`);
  }
  assert.deepEqual(bad, []);
});

test('canonical examples are clean sentences and also examples of their pattern', () => {
  assert.ok(allCanonical.size > 600, `only ${allCanonical.size} canonical examples`);
  for (const w of worlds) for (const p of w.patterns) for (const c of p.canonical ?? []) {
    assert.ok(isCanonicalSentence(c), `${w.id} ${p.id}: "${c}" is not a clean sentence`);
    assert.ok(p.examples.includes(c), `${p.id}: canonical "${c}" is not among its examples`);
  }
});

test('the sentences from the real dialogue are not canonical', () => {
  for (const bad of ['Hair colors list?', 'Hair color options?', 'Bolt is ur name.']) {
    assert.ok(!isCanonicalSentence(bad), bad);
    assert.ok(!allCanonical.has(bad), bad);
  }
});

test('every world has a canonical example for each of its main operations', () => {
  const lacking = [];
  for (const w of worlds) {
    const ops = new Map();
    for (const p of w.patterns) { const k = operationKey(p); ops.set(k, (ops.get(k) ?? 0) + (p.canonical?.length ?? 0)); }
    for (const [k, n] of ops) if (!n && !EXEMPT.has(k)) lacking.push(`${w.id} ${k}`);
    assert.ok([...ops.values()].some((n) => n > 0), `${w.id} has no canonical example at all`);
  }
  assert.deepEqual(lacking, []);
});

test('every canonical example is understood by its own world on its own tab', async () => {
  const bad = [];
  for (const w of worlds) {
    for (const c of sampled([...new Set(w.patterns.flatMap((p) => p.canonical ?? []))], { key: (x) => `${w.id}|${x}`, world: w.id })) {
      const s = engine.createSession({ language: 'en' });
      if (tabOf(w)) s.setWorldState('ui.shell', { activeTab: tabOf(w) });
      const r = await s.send(c, { language: 'en' });
      if (!r.segments.length || r.segments.some((x) => (x.unparsed && x.veto?.kind !== 'no-referent') || (!x.veto && x.match?.worldId !== w.id))) bad.push(`${w.id}: ${c}`);   // a veto for a name the world does not have ("connect Api to Db" on an empty canvas) is the world's answer, with an offer
    }
  }
  assert.deepEqual(bad, []);
});

test('help and "Did you mean" quote canonical examples only', async () => {
  const quoted = (text) => [...String(text).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const isCanon = (q) => [...allCanonical].some((c) => c.replace(/[.?!]$/, '') === q.replace(/[.?!]$/, ''));
  for (const tab of ['robot', 'chess', 'draw', 'charts', 'music', 'map', 'editor', 'tictactoe', 'hangman']) {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: tab });
    for (const m of ['help', 'what can I say here', 'more examples', 'more examples', 'zzq hair colour bolt list']) {
      const r = await s.send(m, { language: 'en' });
      for (const q of quoted(r.text)) {
        if (/^(what can you do|more examples|how do i \.\.\.|what can i say here|new game|help|show me my phrases)\??$/i.test(q) || q === 'zzq hair colour bolt list') continue;
        if (/^(play|new game|give me a hint|start)/i.test(q) && tab !== 'robot' && !isCanon(q)) continue;   // the game rules text quotes its own commands
        assert.ok(isCanon(q), `${tab} / "${m}": "${q}" is offered but is not canonical`);
      }
    }
  }
});
