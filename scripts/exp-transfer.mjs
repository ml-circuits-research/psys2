#!/usr/bin/env node
// TRANSFER (spec 23, worker-tasks 21:30): experiments T1 and T2 over the views of the session things: the pilot avatar (worlds-pilot/ui.avatar), the seating plan
// (worlds/plan.seating), Talk (worlds/talk), the chart (worlds/data.charts, numeric: a thing counts as one of its kind), the document (worlds/docs.editor, textual) and, as T6-lite, the
// timeline (worlds/plan.timeline, a view declared by a schema alone: things with a temporal aspect). The chart, the document and the timeline are columns of the matrix (they take things);
// they do not yet publish things of their own, so no row is made in them. No code per pair of views is involved: every transfer is the one operation things.show (the `send` act of a schema world or Talk's
// "send it to X"), judged against EXPECTATIONS written below by hand from common sense, not from the code.
//   node scripts/exp-transfer.mjs [--reasoner ops|matrix] [--catalog tests/fixtures/catalog] [--out file.jsonl] [--only t1|t2] [--verbose]
// T1: 30 things made in the three views (10 each) are shown in each of the other two views: 60 cells, each right / not applicable said plainly / wrong.
// T2: 20 taught facts, each taught in one view and used in the other two views (40 cells), same three outcomes.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
process.env.PSYS2_PILOT_ROOTS = process.env.PSYS2_T1_ROOTS ?? path.join(REPO, 'worlds-pilot');   // with --draw the drawing board (worlds-pilot/art.draw) is a fourth view   // the pilot avatar shadows worlds/ui.avatar until the executor switch lands
const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
const { createEngine } = await import('../src/dialog/index.mjs');
const { createFacts } = await import('../src/knowledge/facts.mjs');

const CAT = path.resolve(REPO, arg('--catalog', 'tests/fixtures/catalog'));
const reasoner = arg('--reasoner', 'matrix');
const only = arg('--only', null), verbose = process.argv.includes('--verbose');
const catalog = () => createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } });
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
engine.setKnowledge(catalog());
const WITH_DRAW = process.argv.includes('--draw');
const TAB = { avatar: 'robot', seating: 'seating', talk: 'talk', ...(WITH_DRAW ? { draw: 'draw' } : {}), chart: 'charts', doc: 'editor', time: 'talk' };
const WORLD = { avatar: 'ui.avatar', seating: 'plan.seating', talk: 'talk', draw: 'art.draw', chart: 'data.charts', doc: 'docs.editor', time: 'plan.timeline' };
const SEND = { avatar: (t, to) => `send the ${t} to the ${to}`, seating: (t, to) => `send ${t} to the ${to}`, talk: (t, to) => `send it to the ${to}`, draw: (t, to) => `send the ${t} to the ${to}` };
const TO = { avatar: 'avatar', seating: 'seating plan', talk: 'talk', draw: 'drawing', chart: 'chart', doc: 'document', time: 'timeline' };

async function session() {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'talk' });
  return s;
}
const open = (s, view) => s.setWorldState('ui.shell', { activeTab: TAB[view] });
const warm = async (words) => { for (const w of words) await engine.knowledge.thing(w); };

// ------------------------------------------------------------------------------------------------------------------------------------ T1: things
// Each thing: where it is made (view), the sentences that make it, how it is called when sent from its view, and what each other view should do: 'ok' (takes it), 'na' (cannot, said
// plainly), with `keep` the words the other view's answer or state must still hold (the colour, the name) so a thing that arrives changed is WRONG.
const THINGS = [
  // made on the avatar (10)
  { view: 'avatar', make: ['put on a red hat'], ref: 'hat', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['hat'] } },
  { view: 'avatar', make: ['put on glasses'], ref: 'glasses', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['glasses'] } },
  { view: 'avatar', make: ['give me a beard'], ref: 'beard', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['beard'] } },
  { view: 'avatar', make: ['put on earrings'], ref: 'earrings', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['earring'] } },
  { view: 'avatar', make: ['add a moustache'], ref: 'moustache', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['moustache'] } },
  { view: 'avatar', make: ['add freckles'], ref: 'cheeks', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['cheeks'] } },
  { view: 'avatar', make: ['add long hair'], ref: 'hair_back', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['hair'] } },
  { view: 'avatar', make: ['make my hair green'], ref: 'face', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['green'] } },
  { view: 'avatar', make: ['add a fringe'], ref: 'hair_front', expect: { seating: 'na', talk: 'ok' }, keep: { talk: ['hair'] } },
  { view: 'avatar', make: ['put on a hat'], ref: 'face', expect: { seating: 'na', talk: 'ok' }, keep: { talk: [] } },
  // made in the seating plan (10)
  { view: 'seating', make: ['add a table'], ref: 'table 1', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['table'] } },
  { view: 'seating', make: ['add a table', 'make table 1 blue'], ref: 'table 1', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['blue'] } },
  { view: 'seating', make: ['add a table', 'table 1 should have 6 seats'], ref: 'table 1', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['6'] } },
  { view: 'seating', make: ['add a table', 'add a guest called Ann at table 1'], ref: 'Ann', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['Ann'] } },
  { view: 'seating', make: ['add a table', 'add a guest called Max at table 1', 'make Max green'], ref: 'Max', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['Max', 'green'] } },
  { view: 'seating', make: ['add 2 tables', 'make table 2 red'], ref: 'table 2', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['red'] } },
  { view: 'seating', make: ['add a guest called Zoe'], ref: 'Zoe', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['Zoe'] } },
  { view: 'seating', make: ['add a table', 'add a guest called Bob at table 1'], ref: 'Bob', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['Bob', 'table'] } },
  { view: 'seating', make: ['add a table', 'table 1 should have 2 seats'], ref: 'table 1', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['2'] } },
  { view: 'seating', make: ['add a guest called Lily', 'make Lily pink'], ref: 'Lily', expect: { avatar: 'na', talk: 'ok' }, keep: { talk: ['Lily', 'pink'] } },
  // made in Talk (10): topics from knowledge
  { view: 'talk', make: ['What does a bicycle look like?'], ref: 'bicycle', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What does a spider look like?'], ref: 'spider', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What does a house look like?'], ref: 'house', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What is a comet?'], ref: 'comet', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['Tell me about the moon.'], ref: 'moon', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What is Paris?'], ref: 'Paris', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What is France?'], ref: 'France', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What is Japan?'], ref: 'Japan', expect: { avatar: 'na', seating: 'na' }, keep: {} },
  { view: 'talk', make: ['What does a hat look like?'], ref: 'hat', expect: { avatar: 'ok', seating: 'na' }, keep: { avatar: ['hat'] } },
  { view: 'talk', make: ['What does a table look like?'], ref: 'table', expect: { avatar: 'na', seating: 'ok' }, keep: { seating: ['table'] } },
];
// the drawing board as a fourth view (--draw): ten things made in it, and what each older thing should do when sent to it (written by hand from common sense: what can be drawn)
const DRAW_THINGS = [
  ['draw a red house', 'house', 'red'], ['draw a tree', 'tree', 'tree'], ['draw a big yellow sun', 'sun', 'yellow'], ['draw a cat', 'cat', 'cat'], ['draw a blue car', 'car', 'blue'],
  ['draw a boat', 'boat', 'boat'], ['draw a green balloon', 'balloon', 'green'], ['draw a star', 'star', 'star'], ['draw a purple flower', 'flower', 'purple'], ['draw a dog', 'dog', 'dog'],
].map(([m, ref, keep]) => ({ view: 'draw', make: [m], ref, expect: { avatar: 'na', seating: 'na', talk: 'ok' }, keep: { talk: [keep] } }));
const DRAWABLE = new Set(['hat', 'glasses', 'table', 'bicycle', 'spider', 'house', 'moon']);   // sent to the drawing: a kind of thing it can show
if (WITH_DRAW) { THINGS.push(...DRAW_THINGS); for (const th of THINGS) if (th.view !== 'draw') { th.expect.draw = DRAWABLE.has(th.ref) ? 'ok' : 'na'; th.keep = { ...(th.keep ?? {}), draw: [] }; } }
// temporal things (T6-lite): made in Talk from the calendar of the knowledge; the timeline takes them, the picture views cannot
const TIME_THINGS = ['What is Monday?|monday', 'What is winter?|winter', 'What is March?|march', 'What is Tuesday?|tuesday'].map((x) => x.split('|')).map(([m, ref]) => ({ view: 'talk', make: [m], ref, expect: { avatar: 'na', seating: 'na', ...(WITH_DRAW ? { draw: 'na' } : {}) }, keep: {} }));
THINGS.push(...TIME_THINGS);
for (const th of THINGS) { th.expect.chart = 'ok'; th.expect.doc = 'ok'; th.expect.time = TIME_THINGS.includes(th) ? 'ok' : 'na'; th.keep = { ...(th.keep ?? {}), doc: th.keep?.talk ?? [] }; if (th.view !== 'talk' || TIME_THINGS.includes(th)) th.expect.talk = th.expect.talk ?? 'ok'; }
const THING_WARM = ['monday', 'march', 'winter', 'tuesday', 'bicycle', 'spider', 'house', 'comet', 'moon', 'paris', 'france', 'japan', 'hat', 'table', 'glasses', 'beard'];

/** Reads what a view holds after a transfer: the text of its state, to look for the words that must survive. */
const heldBy = (s, view) => JSON.stringify(s.state(WORLD[view]) ?? {}).toLowerCase();
const classify = (cell, want, keep, held) => {
  const refusedPlain = cell.status === 'na' || cell.status === 'refused';
  if (want === 'ok') return cell.status === 'ok' && (keep ?? []).every((w) => held.includes(String(w).toLowerCase())) ? 'right' : cell.status === 'ok' ? 'wrong (changed on arrival)' : 'wrong (refused)';
  return refusedPlain && cell.note && !/undefined|\[object/.test(cell.note) ? 'na' : cell.status === 'ok' ? 'wrong (taken)' : 'wrong (silent)';
};

async function t1() {
  const rows = [];
  for (const th of THINGS) {
    const targets = Object.keys(TAB).filter((v) => v !== th.view);   // every view and every sink, from the view the thing was made in
    for (const to of targets) {
      const s = await session();
      await warm(THING_WARM);
      open(s, th.view);
      for (const m of th.make) await s.send(m);
      open(s, th.view);
      const text = SEND[th.view](th.ref, TO[to]);
      const r = await s.send(text);
      const shown = (r.effects ?? []).find((e) => e.name === 'things.shown');
      const cell = shown?.args?.cells?.[0] ?? { status: 'none', note: r.text };
      const held = heldBy(s, to);
      let verdict = classify(cell, th.expect[to], th.keep?.[to], held);
      if (to === 'chart' && verdict === 'right') { const c = s.state('data.charts').charts?.[0]; verdict = c && c.datasets[0].data.reduce((a, b) => a + b, 0) === 1 ? 'right' : 'wrong (changed on arrival)'; }
      rows.push({ exp: 'T1', thing: `${th.view}:${th.ref} (${th.make.join('; ')})`, from: th.view, to, text, expect: th.expect[to], got: cell.status, verdict, reply: r.text });
    }
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------------------------------------------ T2: taught facts
// A fact is taught in one view, then used in the two other views. `use` says what each view is asked and what a right answer holds (`has`), or that the view has no use for the fact
// (`na`: the answer must say so plainly rather than ignore it).
const FACTS = [
  { teach: 'a villa is a kind of house', in: 'talk', use: { talk: { ask: 'What kind of thing is a villa?', has: ['house'] }, seating: { ask: 'add a villa', na: true }, avatar: { ask: 'put on a villa', na: true } } },
  { teach: 'a waiter is a kind of person', in: 'seating', use: { seating: { ask: 'add a waiter called Sam', has: ['sam'], state: 'guest' }, talk: { ask: 'What kind of thing is a waiter?', has: ['person'] }, avatar: { ask: 'put on a waiter', na: true } } },
  { teach: 'a beret is a kind of hat', in: 'avatar', use: { avatar: { ask: 'put on a beret', has: ['hat'], state: '"hat"' }, talk: { ask: 'What kind of thing is a beret?', has: ['hat'] }, seating: { ask: 'add a beret', na: true } } },
  { teach: 'a cottage is a kind of house', in: 'talk', use: { talk: { ask: 'What does a cottage look like?', has: ['cottage'] }, seating: { ask: 'add a cottage', na: true }, avatar: { ask: 'put on a cottage', na: true } } },
  { teach: 'a cap is a kind of hat', in: 'talk', use: { avatar: { ask: 'put on a cap', has: ['hat'], state: '"hat"' }, talk: { ask: 'What kind of thing is a cap?', has: ['hat'] }, seating: { ask: 'add a cap', na: true } } },
  { teach: 'my dog is called Rex', in: 'talk', use: { talk: { ask: 'Tell me about Rex.', has: ['rex'] }, seating: { ask: 'add my dog', na: true }, avatar: { ask: 'put on my dog', na: true } } },
  { teach: 'my sister is called Ann', in: 'seating', use: { seating: { ask: 'add my sister', has: ['ann'], state: 'ann' }, talk: { ask: 'Tell me about Ann.', has: ['ann'] }, avatar: { ask: 'put on my sister', na: true } } },
  { teach: 'my brother is called Tom', in: 'avatar', use: { seating: { ask: 'add my brother', has: ['tom'], state: 'tom' }, talk: { ask: 'Tell me about Tom.', has: ['tom'] }, avatar: { ask: 'put on my brother', na: true } } },
  { teach: 'my cat is called Tiger', in: 'talk', use: { talk: { ask: 'Tell me about Tiger.', has: ['tiger'] }, seating: { ask: 'add my cat', na: true }, avatar: { ask: 'put on my cat', na: true } } },
  { teach: 'my friend is called Eva', in: 'talk', use: { seating: { ask: 'add my friend', has: ['eva'], state: 'eva' }, talk: { ask: 'Tell me about Eva.', has: ['eva'] }, avatar: { ask: 'put on my friend', na: true } } },
  { teach: 'ducks float', in: 'talk', use: { talk: { ask: 'Tell me about a duck.', has: ['float'] }, seating: { ask: 'seat the ducks', na: true }, avatar: { ask: 'put on ducks', na: true } } },
  { teach: 'penguins cannot fly', in: 'talk', use: { talk: { ask: 'Tell me about a penguin.', has: ['fly'] }, seating: { ask: 'seat the penguins', na: true }, avatar: { ask: 'put on penguins', na: true } } },
  { teach: 'fish live in water', in: 'talk', use: { talk: { ask: 'Tell me about a fish.', has: ['water'] }, seating: { ask: 'seat the fish', na: true }, avatar: { ask: 'put on fish', na: true } } },
  { teach: 'a boat is made of wood', in: 'talk', use: { talk: { ask: 'Tell me about a boat.', has: ['wood'] }, seating: { ask: 'add a boat', na: true }, avatar: { ask: 'put on a boat', na: true } } },
  { teach: 'dogs can bark', in: 'talk', use: { talk: { ask: 'Tell me about a dog.', has: ['bark'] }, seating: { ask: 'seat the dogs', na: true }, avatar: { ask: 'put on dogs', na: true } } },
  { teach: 'a king is a kind of person', in: 'seating', use: { seating: { ask: 'add a king called Leo', has: ['leo'], state: 'guest' }, talk: { ask: 'What kind of thing is a king?', has: ['person'] }, avatar: { ask: 'put on a king', na: true } } },
  { teach: 'a bonnet is a kind of hat', in: 'avatar', use: { avatar: { ask: 'put on a bonnet', has: ['hat'], state: '"hat"' }, talk: { ask: 'What kind of thing is a bonnet?', has: ['hat'] }, seating: { ask: 'add a bonnet', na: true } } },
  { teach: 'cats climb', in: 'talk', use: { talk: { ask: 'Tell me about a cat.', has: ['climb'] }, seating: { ask: 'seat the cats', na: true }, avatar: { ask: 'put on cats', na: true } } },
  { teach: 'a lighthouse is a kind of tower', in: 'talk', use: { talk: { ask: 'What kind of thing is a lighthouse?', has: ['tower'] }, seating: { ask: 'add a lighthouse', na: true }, avatar: { ask: 'put on a lighthouse', na: true } } },
  { teach: 'my uncle is called Bill', in: 'seating', use: { seating: { ask: 'add my uncle', has: ['bill'], state: 'bill' }, talk: { ask: 'Tell me about Bill.', has: ['bill'] }, avatar: { ask: 'put on my uncle', na: true } } },
];
const FACT_WARM = ['villa', 'house', 'person', 'waiter', 'beret', 'hat', 'cottage', 'cap', 'dog', 'rex', 'sister', 'brother', 'cat', 'friend', 'duck', 'penguin', 'fish', 'boat', 'king', 'bonnet', 'lighthouse', 'tower', 'uncle', 'ann', 'tom', 'eva', 'bill', 'tiger'];

async function t2() {
  const rows = [];
  for (const f of FACTS) {
    for (const [to, u] of Object.entries(f.use)) {
      if (to === f.in && false) continue;
      const s = await session();
      await warm(FACT_WARM);
      open(s, f.in);
      const taught = await s.send(f.teach);
      await warm(FACT_WARM);   // the session's knowledge now holds the lesson: its parents are in the cache
      open(s, to);
      const r = await s.send(u.ask);
      const text = String(r.text ?? '').toLowerCase();
      const held = heldBy(s, to);
      const used = (u.has ?? []).every((w) => text.includes(w) || held.includes(w)) && (!u.state || held.includes(u.state));
      const plainNo = /not something|cannot|can't|no .* to show|did not|do not know|there is no|is not|not on|already|nothing|have not/.test(text) && !/^i added|^i put|^i seated/.test(text);
      let verdict;
      if (u.na) verdict = plainNo && !/^(?:i added|i put|i seated|ok,)/.test(text) ? 'na' : 'wrong (used where it should not be)';
      else verdict = used ? 'right' : plainNo ? 'wrong (fact ignored, said so)' : 'wrong (fact ignored)';
      const stored = (s.state('session.things')?.learned ?? []).length > 0;   // false: another world read the sentence first and keeps the fact to itself
      rows.push({ exp: 'T2', stored, other: to !== f.in, fact: f.teach, taughtIn: f.in, taughtReply: taught.text, view: to, ask: u.ask, expect: u.na ? 'na' : 'used', verdict, reply: r.text });
    }
  }
  return rows;
}

const tally = (rows) => {
  const c = { right: 0, na: 0, wrong: 0 };
  for (const r of rows) c[r.verdict.startsWith('wrong') ? 'wrong' : r.verdict]++;
  return c;
};
const all = [];
if (only !== 't2') {
  const r = await t1(); all.push(...r); console.log(`T1 (${reasoner}): ${r.length} cells`, JSON.stringify(tally(r)));
  for (const to of [...new Set(r.map((x) => x.to))]) console.log(`   into ${to.padEnd(8)} ${JSON.stringify(tally(r.filter((x) => x.to === to)))}`);
}
if (only !== 't1') {
  const r = await t2(); all.push(...r);
  const other = r.filter((x) => x.other);
  console.log(`T2 (${reasoner}): ${other.length} cells in the other two views (${r.length} with the view it was taught in)`, JSON.stringify(tally(other)));
  console.log(`   asked again in the view where it was taught: ${JSON.stringify(tally(r.filter((x) => !x.other)))}`);
  console.log(`   facts the session store took: ${JSON.stringify(tally(other.filter((x) => x.stored)))}  facts another world kept to itself: ${JSON.stringify(tally(other.filter((x) => !x.stored)))}`);
}
if (verbose) for (const r of all.filter((x) => x.verdict.startsWith('wrong') || verbose)) console.log(`${r.exp} ${r.verdict}\t${r.thing ?? r.fact} -> ${r.to ?? r.view}\t${r.text ?? r.ask}\n      ${String(r.reply).slice(0, 180)}`);
const out = arg('--out', null);
if (out) writeFileSync(out, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
process.exit(0);
