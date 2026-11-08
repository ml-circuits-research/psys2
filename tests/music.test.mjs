import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { parseAbc, transposeAbc, buildAbc } from '../worlds/media.music/abc.mjs';
import { scaleNotes, chordNotes, detectChord, between, keyInfo } from '../worlds/media.music/theory.mjs';
import { generate } from '../worlds/media.music/datagen.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const talk = async (...lines) => {
  const s = engine.createSession({ language: 'en' });
  let r;
  for (const l of lines) r = await s.send(l);
  return { r, s };
};
const ABC = 'X:1\nT:T\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\nC D E F|G4|\n';
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('media.music: loads without problems and its 60+ tests pass', async () => {
  assert.deepEqual(engine.problems().filter((p) => p.startsWith('media.music:')), []);
  const r = await runWorldTests(engine, 'media.music');
  assert.ok(r.total >= 60, `only ${r.total} tests`);
  assert.deepEqual(r.failed, []);
});

test('media.music: every pattern has an example; the world is a fixture with rules', () => {
  const w = engine.set.get('media.music');
  assert.ok(w.patterns.length >= 100);
  for (const p of w.patterns) assert.ok(p.examples.length >= 1, `${p.id} has no example`);
});

test('abc: parse gives events with char spans, key, tempo', () => {
  const p = parseAbc(ABC);
  assert.equal(p.key.name, 'C major');
  assert.equal(p.tempo, 100);
  assert.deepEqual(p.events.map((e) => e.n[0]), ['C4', 'D4', 'E4', 'F4', 'G4']);
  assert.equal(p.events[4].d, 4);
  assert.equal(ABC.slice(p.events[1].a, p.events[1].b), 'D');
});

test('abc: transpose respells by the new key; build round-trips', () => {
  const t = transposeAbc(ABC, 2);
  assert.match(t, /K:D/);
  assert.deepEqual(parseAbc(t).events.map((e) => e.n[0]), ['D4', 'E4', 'F#4', 'G4', 'A4']);
  const b = buildAbc({ title: 'X', key: 'C major', items: [] });
  assert.match(b, /T:X/);
  assert.equal(parseAbc(b).key.name, 'C major');
});

test('theory: scales, chords, intervals, keys', () => {
  assert.deepEqual(scaleNotes('D', 'major').notes.slice(0, 3), ['D4', 'E4', 'F#4']);
  assert.deepEqual(chordNotes('C', 'major').notes, ['C4', 'E4', 'G4']);
  assert.equal(detectChord(['C4', 'E4', 'G4']).name, 'C major');
  assert.equal(between('C', 'G').name, 'perfect fifth');
  assert.equal(keyInfo('D', 'major').sharps, 2);
  assert.equal(keyInfo('F', 'major').accidentals[0], 'Bb');
});

test('ops: playing a note, a chord and a song changes the state and emits music.play', async () => {
  let { r, s } = await talk('Play middle C');
  assert.ok(r.effects.some((e) => e.name === 'music.play'));
  assert.equal(s.state('media.music').current.kind, 'note');
  ({ r, s } = await talk('Play a C major chord on the organ'));
  assert.equal(s.state('media.music').instrument, 'organ');
  assert.equal(s.state('media.music').current.kind, 'chord');
  ({ r, s } = await talk('Play Ode to Joy'));
  assert.equal(s.state('media.music').current.kind, 'song');
  assert.match(r.text, /Ode to Joy/);
});

test('ops: tempo, volume, stop and loop', async () => {
  const { r, s } = await talk('Play Jingle Bells', 'Slower', 'Louder', 'Loop it');
  const st = s.state('media.music');
  assert.ok(st.tempo < 200 && st.loop === true);
  assert.ok(r.effects.length >= 1);
  const e = await talk('Play happy birthday', 'Stop the music');
  assert.equal(e.s.state('media.music').playing, false);
  assert.ok(e.r.effects.some((x) => x.name === 'music.stop'));
});

test('ops: theory answers', async () => {
  assert.match((await talk('What chord is C E G?')).r.text, /C major/i);
  assert.match((await talk('What are the notes in the D major scale?')).r.text, /F sharp|F#/i);
});

test('songs: ten public-domain songs, each with a source, listed in the tab plugin', () => {
  const kb = readFileSync(new URL('../worlds/media.music/kb.sop', import.meta.url), 'utf8');
  const { wires, errors } = parse(kb);
  assert.deepEqual(errors, []);
  const songs = wires.filter((w) => w.type === 'media.music.song');
  assert.equal(songs.length, 10);
  assert.equal(kb.match(/core\.source="fixture:media\.music\/songs/g).length, 10);
  const plugin = readFileSync(new URL('../docs/webchat/ui/tabs/music.mjs', import.meta.url), 'utf8');
  for (const m of kb.matchAll(/^\s+title="([^"]+)"/gm)) {
    const title = m[1].replace(/ to You$/, '').replace(/ Had a Farm$/, '').replace(/ Is Falling Down$/, '');
    assert.ok(plugin.includes(title.replace(/'/g, "'")) || plugin.includes(title.replace(/'/g, '"')), `${m[1]} missing in the tab plugin`);
  }
});

test('vendor: bundles carry header and licence', () => {
  for (const f of ['tone', 'abcjs']) assert.match(readFileSync(new URL(`../docs/webchat/vendor/music/${f}.mjs`, import.meta.url), 'utf8').slice(0, 600), /MIT/);
  assert.match(readFileSync(new URL('../worlds/media.music/vendor/tonal.mjs', import.meta.url), 'utf8').slice(0, 600), /MIT/);
  assert.match(readFileSync(new URL('../docs/webchat/vendor/music/LICENSES.md', import.meta.url), 'utf8'), /MIT/);
});

test('datagen: deterministic, valid SOP, negatives, many groups', () => {
  const a = generate({ rng: mulberry(7), count: 300 });
  assert.deepEqual(a, generate({ rng: mulberry(7), count: 300 }));
  assert.ok(a.length >= 150);
  assert.ok(new Set(a.map((e) => e.group)).size >= 15);
  assert.ok(a.some((e) => e.negative && e.phenomenon === 'out-of-domain'));
  for (const ex of a) {
    if (ex.negative) { assert.equal(ex.expect, null); continue; }
    const { wires, errors } = parse(ex.expect);
    assert.deepEqual(errors, [], ex.text);
    assert.ok(wires.length >= 1);
  }
});

test('music tab: chess moves are not taken by the catch-all song pattern, songs and note sequences still are', async () => {
  const onMusic = async (text) => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'music' });
    const r = await s.send(text);
    return { r, winner: r.trace.routing[0]?.winner?.worldId };
  };
  for (const t of ['Play knight to f3', 'Can you play the knight to f3?', 'Play pawn to e4', 'Please play the queen to d5']) {
    const { r, winner } = await onMusic(t);
    assert.equal(winner, 'games.chess', t);
    assert.ok(!/do not know a song/i.test(r.reply), t);
  }
  for (const t of ['Play Ode to Joy', 'Play C D E F G', 'Could you play Jingle Bells on the organ?', 'Play Yesterday']) {
    assert.equal((await onMusic(t)).winner, 'media.music', t);
  }
});
