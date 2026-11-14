// SPDX-License-Identifier: AGPL-3.0-only
// READER-ROUTE (spec 16 section 7): the library's reader as a third source of readings. Off by default; every `means` of an English description word resolves in the
// reader world (no unknown-word warning); a reading becomes the same dialogue wires the rules emit; read-only; ambiguous readings are not taken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { normalizeReader, readerWorlds, readerSegments, readerCoverage, READER_POLICY } from '../src/dialog/reader-route.mjs';

const plain = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
globalThis.PSYS2_READER = 'choose';   // the descriptions are read when the reader is on (spec 16 section 7.3)
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
delete globalThis.PSYS2_READER;
const session = (opts = {}) => engine.createSession({ language: 'en', ...opts });
const lib = (s) => s.isession.rs.reasoner.lib;
const text = (segs) => segs.flatMap((x) => x.wires).map((w) => `${w.type} ${w.entries.filter((e) => !/^core\.(via|source|seq|in)$/.test(e.key)).map((e) => `${e.key}=${e.value.v}`).join(' ')}`);

test('option: default off, unknown values are off', async () => {
  assert.equal(normalizeReader(undefined), 'off');
  assert.equal(normalizeReader('nonsense'), 'off');
  for (const m of ['off', 'fill', 'choose']) assert.equal(normalizeReader(m), m);
  const s = plain.createSession({ language: 'en' });
  assert.equal(s.reader, 'off');
  assert.ok(plain.set.list().every((w) => w.descriptions.every((d) => d.words.size === 0)), 'a describe.sop with wording is not read with the reader off (an args-only one is: spec 16 section 8)');
  const r = await s.send('what is the capital of Japan');
  assert.ok(r.segments.every((x) => x.reader === undefined));
});

test('coverage: every word of an English description resolves in the reader world, with no unknown-word warning', () => {
  const s = session();
  const cov = readerCoverage(lib(s), engine.set, (id) => s.isession.rs.peek(id));
  const worlds = Object.keys(cov);
  assert.ok(worlds.length >= 1, 'at least one world has an English description');
  for (const w of worlds) {
    if (!cov[w].mapped) continue;   // a schema world that does not run on the matrix reasoner has no reader world to map its few descriptions into (docs.editor)
    assert.equal(cov[w].mapped.warnings, 0, `${w}: unknown-word warnings`);
    assert.equal(cov[w].mapped.unmapped, 0, `${w}: words no description uses`);
    assert.equal(cov[w].mapped.mapped, cov[w].words, `${w}: all words mapped`);
  }
});

test('a reading is the same dialogue wires the rules emit, read-only, and an ambiguous one is not taken', async () => {
  const s = session();
  const rws = readerWorlds(lib(s), engine.set);
  const before = JSON.stringify(s.isession.state);
  const stamp = s.isession.rs.peek('ui.shell').stamp;
  if (rws.has('geo.map')) {
    const r = readerSegments(s, { text: 'what is the capital of Japan', span: [0, 28] }, { worldOrder: ['geo.map'], allowed: ['geo.map'] });
    assert.ok(r.segments && !r.ambiguous);
    assert.deepEqual(text(r.segments), ['core.request core.request.action=geo.capital core.request.arg.c=japan']);
    const typo = readerSegments(s, { text: 'shw me Pariss', span: [0, 13] }, { worldOrder: ['geo.map'], allowed: ['geo.map'] });
    assert.match(text(typo.segments)[0], /core\.request\.action=geo\.show.*Paris|geo\.show.*paris/i);
    // a reading that needs a word the descriptions do not account for is not taken
    const left = readerSegments(s, { text: 'what is the capital of Japan quantum', span: [0, 36] }, { worldOrder: ['geo.map'], allowed: ['geo.map'] });
    assert.equal(left.segments, null);
    // the correction of a word farther than the policy allows is not taken
    assert.ok(READER_POLICY.maxAssume <= 1);
    const far = readerSegments(s, { text: 'bucharest moved', span: [0, 15] }, { worldOrder: ['geo.map'], allowed: ['geo.map'] });
    assert.equal(far.segments, null);
  }
  if (rws.has('kids.shop')) {
    const r = readerSegments(s, { text: 'how much do 2 pens cost', span: [0, 23] }, { worldOrder: ['kids.shop'], allowed: ['kids.shop'] });
    assert.ok(r.segments);
    assert.match(text(r.segments)[0], /core\.question core\.question\.type=kids\.shop\.total .*item=pen .*count=2/);
  }
  assert.equal(JSON.stringify(s.isession.state), before, 'the session state is unchanged');
  assert.equal(s.isession.rs.peek('ui.shell').stamp, stamp);
});

test('fill: a clause the rules did not read is read by the reader (an unambiguous reading of the world the user is in); choose leaves a read clause alone when the library ties', async () => {
  const rws = readerWorlds(lib(session()), engine.set);
  if (!rws.has('geo.map')) return;
  const s = session({ reader: 'fill' });
  s.setWorldState('ui.shell', { activeTab: 'map' });
  const r = await s.send('shw me Pariss');
  const seg = r.segments.find((x) => x.reader?.used);
  assert.ok(seg, 'the reader read it');
  assert.equal(seg.strategy, 'reader');
  assert.match(r.text, /Paris/);
  // the same message with the reader off is not understood by the rules alone
  const off = session();
  off.setWorldState('ui.shell', { activeTab: 'map' });
  const o = await off.send('shw me Pariss');
  assert.ok(o.segments.every((x) => x.reader === undefined));
  // the reader reads only the worlds the user is in: on another tab the same words are not read as the map's
  const other = session({ reader: 'fill' });
  other.setWorldState('ui.shell', { activeTab: 'robot' });
  const x = await other.send('shw me Pariss');
  assert.ok(!x.segments.some((y) => y.reader?.used));
});
