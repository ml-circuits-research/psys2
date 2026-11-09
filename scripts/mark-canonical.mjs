#!/usr/bin/env node
// Marks canonical help examples in the worlds (RD6; src/worlds/canonical.mjs). For every operation (the action a pattern emits) of every world it picks up
// to two clean sentences from the examples the patterns already have, preferring a spread of sentence kinds, and writes them as `canonical="..."`
// lines into the pattern (or the request shape) that owns the example. Idempotent: existing marks are kept, nothing else in the world is changed.
//
//   node scripts/mark-canonical.mjs [--write] [--world <id>] [--report]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { isCanonicalSentence } from '../src/worlds/canonical.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const write = process.argv.includes('--write');
const onlyWorld = arg('world');

import { operationKey } from '../src/worlds/canonical.mjs';
const actionOf = operationKey;

// sentences the gate lets through that are still not clean (fragments, odd grammar, referents without a referent)
const BAD = /\b(it|its|them|that|those|one|ones|lol|x|q's)\b/i;
const FRAGMENT_OK = /\b(is|are|was|were|has|have|should|can|could|will|needs|says|looks)\b/i;
// operations that only exist as follow-ups to a question or as refusals: no canonical example is offered for them
export const FOLLOWUPS = new Set(['chat.ask', 'draw.askKind', 'docr.pick', 'chess.pick', 'music.askWhat', 'geo.askPlace', 'geo.unknown', 'avatar.setPartUnknown',
  'draw.open', 'ui.newGame', 'ui.hint']);   // the last three are owned by the shell or depend on the game that is open
const DENY = new Set(['Let me play alpha three.', 'Is pawn to e5 possible?', 'Add some snow to the ground.', 'My name is.', 'Name of mine you know?', 'Zed is fine by me.', 'Chart needs an update.', 'Take it out.', 'Tom has just eaten 2 more.', 'Let me play echo four.', 'Hungary has access to sea?',
  'Who has more pieces worth?', 'Word has an a?', 'Far is Madrid from Lisbon?', 'Tell me x.', 'How many Hansel mentions?', 'Who has the edge?', 'Am I beating you?', 'Remember a kite is 4 lei.',
  'The first row, left-most square.', 'The left of the top row.', 'Pears are 6 not 3.', 'Stick bananas on there with 4.', 'Put bananas in with 4.', 'Show everyones stuff as bars.', 'Show each kids fruit as slices.',
  'Do apples beat pears.', 'Is apples bigger than pears.', 'What number is plums.', 'What do they add up to.', 'How much is it all together.', 'The max, which is it.', 'I want 5 stars added.',
  'It should look like sunset.', 'I want sand under everything.', 'I want the house blue.', 'I want the house massive.', 'The ground should be sand.', 'The sun needs to go up.', 'Send the cloud behind the house.',
  'Is the house red?', 'What\'s the house painted?', 'What\'s the total count of things?', 'Lets call it a draw.', 'Lets do the animal game.', 'Try to read my mind.', 'You can start asking now.']);
const ok = (e) => isCanonicalSentence(e) && !DENY.has(e) && !BAD.test(e) && !/ i /.test(e) && (!/^(A|An|The) /.test(e) || FRAGMENT_OK.test(e)) && !/\b\d+(st|nd|rd|th)\b/.test(e) && !/\bsec\b|\byr\b|\bq\b|\bwks?\b|\bmins?\b|\bpls\b/i.test(e);

if (process.argv.includes('--strip')) {   // remove every canonical mark (to recompute them)
  const { readdirSync } = await import('node:fs');
  for (const d of readdirSync(DEFAULT_ROOT)) { const f = join(DEFAULT_ROOT, d, 'patterns.sop'); try { const t = readFileSync(f, 'utf8'); const u = t.replace(/^ {4}canonical=.*\n/gm, ''); if (u !== t) writeFileSync(f, u); } catch { /* no patterns */ } }
  console.log('stripped'); process.exit(0);
}
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
// hand-picked sentences that are clean but outside the quality gate (short social words, one-word commands), by pattern id
const MANUAL = [['kids.common', 'pat.kids.common.thanks', 'Thank you!'], ['kids.common', 'pat.kids.common.bye', 'Goodbye!'], ['kids.shapes', 'pat.kids.shapes.tmix', 'Black and red make brown.'],
  ['art.draw', 'pat.art.draw.remove.it', 'Delete it.'], ['data.charts', 'pat.data.charts.x2.undo', 'Undo that.'], ['data.charts', 'pat.data.charts.x2.redo', 'Redo.'], ['docs.editor', 'pat.docs.editor.redo', 'Redo.'],
  ['geo.map', 'pat.geo.map.x2.undo', 'Undo that.'], ['geo.map', 'pat.geo.map.x2.redo', 'Redo.'], ['games.guess', 'pat.games.guess.why', 'Why did you ask that?'], ['games.guess', 'pat.games.guess.giveup', 'Giving up.'],
  ['games.hangman', 'pat.games.hangman.x2.giveup.cant', 'I cannot guess it, I give up.'], ['media.music', 'pat.media.music.replay', 'Play it again.'], ['user.profile', 'pat.user.profile.confirm', 'Confirm my field.'],
  ['kids.shop', 'pat.kids.shop.la.n0', 'How much money do I have left after I buy 2 pencils?']];
const BUILTIN_TAB = { 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman', 'docs.editor': 'editor', 'ui.avatar': 'robot' };   // worlds whose tab the app declares itself
const works = async (w, e) => {   // the sentence must be understood by its own world on its own tab
  const s = engine.createSession({ language: 'en' });
  const tab = w.tab?.id ?? BUILTIN_TAB[w.id];
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  const r = await s.send(e, { language: 'en' });
  return r.segments.length > 0 && r.segments.every((x) => !x.unparsed && x.match?.worldId === w.id);
};
const pick = async (w, cands) => {
  const out = [], seen = new Set();
  const rank = (c) => (c.manual ? -9 : 0) + Math.abs(c.e.split(/\s+/).length - 5) + (c.kind === 'question' ? 0.2 : 0);
  for (const c of [...cands].sort((a, b) => rank(a) - rank(b))) {
    const sig = c.e.split(/\s+/)[0].toLowerCase() + c.e.split(/\s+/).length;
    if (seen.has(sig) || !(await works(w, c.e))) continue; seen.add(sig); out.push(c); if (out.length >= 2) break;
  }
  return out;
};

let marked = 0, missing = [];
for (const w of engine.set.list()) {
  if ((onlyWorld && w.id !== onlyWorld) || !w.patterns.length) continue;
  const byAct = new Map();
  for (const p of w.patterns) {
    const k = actionOf(p);
    const arr = byAct.get(k) ?? []; byAct.set(k, arr);
    for (const e of p.examples) if (ok(e)) arr.push({ e, p, kind: p.kind });
    for (const [mw, mid, me] of MANUAL) if (mw === w.id && mid === p.id) arr.push({ e: me, p, kind: p.kind, manual: true });
  }
  const file = join(DEFAULT_ROOT, w.id, 'patterns.sop');
  let src = readFileSync(file, 'utf8'), changed = false;
  for (const [act, arr] of byAct) {
    if ((w.patterns.filter((p) => actionOf(p) === act).some((p) => p.canonical?.length))) continue;   // already marked
    if (FOLLOWUPS.has(act)) continue;
    const chosen = await pick(w, arr);
    if (!chosen.length) { missing.push(`${w.id} :: ${act}`); continue; }
    for (const c of chosen) {
      const id = c.p.wire ? c.p.id : c.p.shape;   // an explicit pattern, or the request shape that generated it
      const type = c.p.wire ? 'core.pattern' : 'core.shape';
      const header = `@${id} ${type}\n`;
      const at = src.indexOf(header);
      if (at < 0) { missing.push(`${w.id} :: ${act} (no header ${id})`); continue; }
      const line = `    canonical=${JSON.stringify(c.e)}\n`;
      if (src.includes(line)) continue;
      src = src.slice(0, at + header.length) + line + src.slice(at + header.length); changed = true; marked++;
    }
  }
  if (changed && write) writeFileSync(file, src);
}
console.log(`${write ? 'wrote' : 'would write'} ${marked} canonical marks; operations without a clean candidate: ${missing.length}`);
for (const m of missing) console.log('  ' + m);
