#!/usr/bin/env node
// P2 (spec 21, worker-tasks 19:35): a world from a schema alone. 60 natural requests to the seating plan (worlds/plan.seating, schema.sop only), written before the act grammar was read,
// varied by the verbs of the knowledge repo (`k.actions`, read through src/knowledge/facts.mjs wires(); a `{act}` placeholder takes a verb of that act, chosen by a seeded draw).
// Every request is sent in a session of its conversation; the reply and the state after it are written to a JSON-lines file for the HAND CHECK (reading the reply is not judging it).
//   node scripts/exp-seating.mjs [--catalog <dir of a catalog with k.actions>] [--seed 3] [--out file.jsonl] [--reasoner ops|matrix]
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
let seed = Number(arg('--seed', 3));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const IDS = ['core', 'lang.common', 'kids.common', 'ui.help', 'acts', 'plan.seating'];

// the verbs of an act, from the catalog (one-word verbs without a particle)
const CAT = arg('--catalog', null);
const verbs = {};
if (CAT) {
  const facts = createFacts({ source: { text: async (p) => { try { return readFileSync(`${CAT}/${p}`, 'utf8'); } catch { return null; } } } });
  for (const w of await facts.wires('k.actions.verb')) {
    const t = w.f.text?.[0], a = w.f.act?.[0];
    if (t && a && !/\s/.test(t) && !w.f.separable) (verbs[a] ??= []).push(t);
  }
}
const verb = (act, dflt) => { const xs = [...new Set(verbs[act] ?? [])].sort(); return xs.length ? xs[Math.floor(rnd() * xs.length)] : dflt; };

// 6 conversations of 10 requests, as a person would type them; {make} {remove} {change} {place} {ask} take a verb of that act from the catalog
const CONVERSATIONS = [
  ['please add three tables', 'put a guest named Maria at table 1', 'seat Tom at table 2', 'who sits at table 1?', 'how many guests are there?', 'make table 3 red', 'give table 1 six seats', 'what colour is table 3?', 'how many seats does table 1 have?', 'undo that'],
  ['I need two tables', 'add a guest called Ann', 'move Ann to table 2', 'can you paint table 1 green', 'which table is Ann at?', 'remove table 2', 'where is Ann now?', 'get rid of Ann', 'delete all the tables', 'what is in the plan?'],
  ['{make} 4 tables', '{make} a guest Bob at table 3', '{make} a guest Eve at table 3', 'who is sitting with Bob?', '{place} Eve at table 1', '{change} table 2 to blue', 'how many people are at table 1?', '{remove} Bob', 'table 4 should have 8 seats', 'show me table 4'],
  ['add a table', 'add a table', 'add a table', 'seat Zoe at the first table', 'seat Max at the last table', 'swap Zoe and Max', 'make them all yellow', 'remove the last table', 'how many tables are left?', 'what colour are the tables?'],
  ['create 2 tables', 'name a guest Lily', 'put her at table 2', 'and put Sam next to her', 'give her a bigger table', 'make it purple', 'does table 2 have enough seats?', 'who is at table 2', 'take Sam away', 'copy table 2'],
  ['hello', 'set up 5 tables please', 'add guests John, Kate and Liam', 'put John at table 5', 'move everyone to table 1', 'how many are at table 1?', 'make the tables pink', 'remove table 5', 'forget the guests', 'clear the plan'],
];
const flat = CONVERSATIONS.flatMap((c, ci) => c.map((text, i) => ({ conv: ci + 1, n: i + 1, text })));
if (flat.length !== 60) throw new Error(`${flat.length} requests`);
const fill = (t) => t.replace(/\{(make|remove|change|place|ask)\}/g, (_, a) => verb(a, { make: 'add', remove: 'remove', change: 'change', place: 'put', ask: 'show' }[a]));

const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
const list = loader.listWorlds.bind(loader);
if (process.argv.includes('--only')) loader.listWorlds = async () => (await list()).filter((id) => IDS.includes(id));   // --only: the seating plan alone; default: every world, the tab of the plan open
const engine = await createEngine({ loader, options: { reasoner: arg('--reasoner', 'matrix') } });

const rows = [];
for (let c = 1; c <= CONVERSATIONS.length; c++) {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'seating' });
  for (const q of flat.filter((x) => x.conv === c)) {
    const text = fill(q.text);
    const r = await s.send(text);
    const st = s.state('plan.seating') ?? {};
    rows.push({ conv: c, n: q.n, text, reply: r.text, pattern: r.trace?.segments?.[0]?.match?.patternId ?? r.segments?.[0]?.match?.patternId ?? null, statuses: r.statuses, items: (st.items ?? []).map((i) => `${i.kind}${i.n ?? ''}${i.name ? `:${i.name}` : ''}${i.place ? `@${i.place}` : ''}${i.attrs?.colour ? `/${i.attrs.colour}` : ''}${i.attrs?.seats ? `#${i.attrs.seats}` : ''}`) });
  }
}
const out = arg('--out', null);
if (out) writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
for (const r of rows) console.log(`${String(r.conv)}.${String(r.n).padStart(2)} ${r.text}\n      => ${r.reply.slice(0, 150)}\n      [${r.items.join(' ')}]`);
process.exit(0);
