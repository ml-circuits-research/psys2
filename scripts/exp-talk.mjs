#!/usr/bin/env node
// TALK experiments E-T1 (coverage), E-T3 (follow-up depth), E-T5 (cost) on the LOCAL fixture catalog (knowledge/k.objects: no network).
// Usage: node scripts/exp-talk.mjs [t1|t3|t5|all] [--seed 7] [--dump out.json]
// The local catalog only holds the picture catalog (things); animals, food, places, words, units and the commonsense facts are not local, so those domains
// measure what the tab answers from its built-in tables and show the GAPS the knowledge worlds must fill (spec 18, the experiments section).
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
let seed = Number(arg('--seed', 7));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const KN = new URL('../knowledge/', import.meta.url).pathname;
const source = { text: async (p) => { try { return readFileSync(p === 'vocab.json' ? `${KN}k.objects/vocab.json` : `${KN}${p}`, 'utf8'); } catch { return null; } } };

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
let facts;
const fresh = () => { facts = createFacts({ source }); engine.setKnowledge(facts); const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: 'talk' }); return s; };

const vocab = JSON.parse(readFileSync(`${KN}k.objects/vocab.json`, 'utf8'));
const lemmas = Object.keys(vocab).filter((w) => !/_|s$/.test(w));
const THINGS = ['bicycle', 'house', 'dog', 'cat', 'car', 'tree', 'boat', 'train', 'flower', 'clock', 'chair', 'table', 'bird', 'fish', 'rocket', 'castle', 'lighthouse', 'snowman', 'comet', 'ladder', 'umbrella', 'kite', 'robot', 'cup', 'lamp', 'door', 'bridge', 'tent', 'bus', 'plane'];
const ANIMALS = ['spider', 'elephant', 'horse', 'cow', 'frog', 'snake', 'ant', 'owl', 'penguin', 'whale', 'bee', 'rabbit', 'lion', 'duck', 'octopus', 'crocodile'];
const FOOD = ['apple', 'bread', 'cheese', 'banana', 'pizza', 'carrot', 'milk', 'egg', 'rice', 'soup', 'cake', 'tomato'];
const PLACES = ['France', 'Brazil', 'Egypt', 'Japan', 'Italy', 'Kenya', 'Canada', 'India', 'Paris', 'London', 'the Sahara', 'Mount Everest'];
const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const BODY = ['hand', 'foot', 'eye', 'heart', 'brain', 'tooth', 'arm', 'leg', 'ear', 'nose'];
const WORDS = ['happy', 'giant', 'tiny', 'journey', 'brave', 'castle', 'whisper', 'ancient'];
const MONTHS = ['January', 'March', 'May', 'July', 'September', 'November', 'December'];
const DAYS = ['Monday', 'Wednesday', 'Friday', 'Sunday'];
const UNITS = [['metre', 'centimetre'], ['kilometre', 'mile'], ['kilogram', 'gram'], ['litre', 'millilitre'], ['hour', 'minute']];

/** [domain, text, oracle] ; oracle: regex the right answer matches, or null (hand check only). */
function seeded() {
  const q = [];
  const add = (d, text, ok = null) => q.push({ d, text, ok, kind: 'seed' });
  for (let i = 0; i < 19; i++) {
    const t = pick(THINGS), u = pick(THINGS);
    add('things', pick([`What is a ${t}?`, `What does a ${t} look like?`, `Tell me about a ${t}.`]), new RegExp(`\\b${t}\\b`, 'i'));
    add('things', `What are the parts of a ${t}?`, /has/);
    add('things', `Which is bigger, a ${t} or a ${u}?`, /bigger|same size/);
  }
  add('things', 'How many wheels does a bicycle have?', /2 wheels/); add('things', 'How many legs does a spider have?', /8/);
  add('things', 'How many windows does a house have?', /\d+ windows/); add('things', 'How many wheels does a car have?', /\d+ wheels/);
  for (let i = 0; i < 20; i++) { const a = pick(ANIMALS), b = pick(ANIMALS); add('animals', pick([`How many legs does a ${a} have?`, `What is a ${a}?`, `Is a ${a} bigger than a ${b}?`, `Where does a ${a} live?`, `What does a ${a} eat?`])); }
  for (let i = 0; i < 20; i++) { const f = pick(FOOD); add('food', pick([`What is a ${f}?`, `What is ${f} made of?`, `Is a ${f} a fruit?`, `What colour is a ${f}?`])); }
  for (let i = 0; i < 20; i++) { const p = pick(PLACES); add('places', pick([`Where is ${p}?`, `What is the capital of ${p}?`, `What is next to ${p}?`, `Is ${p} big?`])); }
  for (let i = 0; i < 24; i++) {
    const a = pick(PLANETS), b = pick(PLANETS.filter((x) => x !== a));
    add('space', pick([`Is ${a} bigger than ${b}?`, `Which is bigger, ${a} or ${b}?`, `What comes after ${a}?`, `What comes before ${a}?`, `How many moons does ${a} have?`, `What is ${a}?`, `Which planet is the ${pick(['first', 'third', 'fifth', 'eighth'])} from the sun?`]), null);
  }
  for (let i = 0; i < 16; i++) { const b = pick(BODY); add('body', pick([`What are the parts of a ${b}?`, `What does a ${b} do?`, `How many fingers does a hand have?`, `What is a ${b}?`])); }
  for (let i = 0; i < 14; i++) { const w = pick(WORDS); add('words', pick([`What does ${w} mean?`, `What kind of thing is a ${w}?`, `What is a synonym of ${w}?`, `What is the opposite of ${w}?`])); }
  for (let i = 0; i < 14; i++) { const [x, y] = pick(UNITS); add('units', pick([`Which is longer, a ${x} or a ${y}?`, `How many ${y}s are in a ${x}?`, `What is a ${x}?`])); }
  for (let i = 0; i < 22; i++) { const m = pick(MONTHS), d = pick(DAYS); add('time', pick([`What comes after ${m}?`, `What comes before ${m}?`, `What are the seasons?`, `What is the ${pick(['third', 'fifth', 'seventh'])} month?`, `What comes after ${d}?`, `What are the days of the week?`, `How many days are in a week?`]), null); }
  return q;
}
const FREE = {
  things: ['What is a rocket made of?', 'Can you show me a castle?', 'What does a snowman look like?', 'Tell me about trains.', 'What has a roof and a door?', 'What is a lighthouse for?', 'Show me a robot.', 'What do boats do?', 'How is a bicycle built?', 'Is a bus bigger than a car?'],
  animals: ['Does a spider have a tail?', 'What do cows eat?', 'Where do penguins live?', 'Which animal is the biggest?', 'How many legs does an ant have?', 'Is a whale a fish?', 'What sound does a duck make?', 'Do snakes have legs?', 'Tell me about bees.', 'Which is faster, a horse or a cow?'],
  food: ['What is bread made of?', 'Is a tomato a fruit or a vegetable?', 'Where does milk come from?', 'What is the healthiest food?', 'What colour is a banana?', 'How do you make a cake?', 'Is cheese made from milk?', 'What do bees make?', 'Is rice a plant?', 'What is a vegetable?'],
  places: ['Where is Paris?', 'What is the capital of France?', 'Which country is next to Spain?', 'Where is the Sahara?', 'What is the biggest country?', 'Is Japan an island?', 'What is the longest river?', 'Where do penguins live, at the north pole?', 'How far is the moon?', 'What is the capital of Kenya?'],
  space: ['Which planet is the biggest?', 'How many planets are there?', 'What is the sun?', 'Is the moon a planet?', 'Which planet has rings?', 'What is a comet?', 'How many moons does Mars have?', 'Which planet is closest to the sun?', 'What is a star?', 'Why is Mars red?'],
  body: ['What are the parts of a hand?', 'How many bones are in the body?', 'What does the heart do?', 'How many teeth do I have?', 'What is the brain for?', 'Why do we sleep?', 'How many fingers does a hand have?', 'What are lungs for?', 'What is inside an eye?', 'Which is bigger, a hand or a foot?'],
  words: ['What does brave mean?', 'What is a synonym of big?', 'What is the opposite of hot?', 'What kind of word is run?', 'What is a noun?', 'What does ancient mean?', 'Is a dog an animal?', 'What kind of thing is a rose?', 'What is a verb?', 'Is a tulip a flower?'],
  units: ['How many centimetres are in a metre?', 'Which is longer, a mile or a kilometre?', 'What is a kilogram?', 'How many minutes are in an hour?', 'Which is heavier, a kilogram or a gram?', 'How many days are in a year?', 'What is a litre?', 'How many seconds are in a minute?', 'Is a mile longer than a metre?', 'What is a gram?'],
  time: ['What are the months?', 'What comes after Monday?', 'What season comes after winter?', 'How many months are in a year?', 'What day comes before Sunday?', 'What is the fifth month?', 'What are the seasons?', 'Which month comes before March?', 'What comes after December?', 'How many days are in a week?'],
};

const NEG = /don't know|can't reach|cannot talk|but not|have not|nothing to|not sure|no .* to change|There is no|only \d/i;
async function ask(s, text) {
  const t0 = performance.now();
  const r = await s.send(text);
  const ms = performance.now() - t0;
  const pid = r.trace?.segments?.[0]?.match?.patternId ?? r.segments?.[0]?.match?.patternId ?? '';
  const world = r.trace?.segments?.[0]?.match?.worldId ?? r.segments?.[0]?.match?.worldId ?? null;
  const other = !/^pat\.talk\./.test(pid) && !!world && world !== 'talk' && !/unknown|clarif|chat\.|ui\./.test(pid) && !/not understand|cannot talk about that/i.test(r.text);
  const frame = /^pat\.talk\./.test(pid) ? pid : null;
  const card = r.effects.some((e) => e.name === 'talk.card' && !e.args?.update);
  const st = s.state('talk');
  const last = card ? st.cards.at(-1)?.kind : null;
  return { text: r.text, frame, other, world, found: !!frame && !NEG.test(r.text), card: last, ms, r, st };
}

async function t1() {
  const qs = seeded();
  for (const [d, list] of Object.entries(FREE)) for (const t of list) qs.push({ d, text: t, ok: null, kind: 'free' });
  fresh();
  const rows = [];
  // one fresh session per question (the catalog stays warm): a refused or misrouted question must not leave pending state that spoils the next one
  for (const q of qs) { const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: 'talk' }); const a = await ask(s, q.text); rows.push({ ...q, frame: a.frame, other: a.other, world: a.world, found: a.found, card: a.card, ms: Math.round(a.ms), text2: a.text.slice(0, 140), right: q.ok ? q.ok.test(a.text) && a.found : null }); }
  const pct = (n, m) => `${n}/${m} (${m ? Math.round((100 * n) / m) : 0}%)`;
  console.log(`\nE-T1: ${rows.length} questions (${rows.filter((r) => r.kind === 'seed').length} seeded, ${rows.filter((r) => r.kind === 'free').length} free-form)`);
  console.log('domain      n   frame read   fact found   card chosen   answered by another world');
  for (const d of Object.keys(FREE)) {
    const x = rows.filter((r) => r.d === d);
    console.log(`${d.padEnd(10)} ${String(x.length).padStart(3)}  ${pct(x.filter((r) => r.frame).length, x.length).padEnd(13)}${pct(x.filter((r) => r.found).length, x.length).padEnd(13)}${pct(x.filter((r) => r.card).length, x.length).padEnd(14)}${x.filter((r) => r.other).length}`);
  }
  console.log(`ALL        ${rows.length}  ${pct(rows.filter((r) => r.frame).length, rows.length)}  ${pct(rows.filter((r) => r.found).length, rows.length)}  ${pct(rows.filter((r) => r.card).length, rows.length)}  other-world ${rows.filter((r) => r.other).length}`);
  const oracle = rows.filter((r) => r.right !== null);
  console.log(`oracle-checked (things templates with a known answer shape): ${pct(oracle.filter((r) => r.right).length, oracle.length)}`);
  const kinds = {}; for (const r of rows) if (r.card) kinds[r.card] = (kinds[r.card] ?? 0) + 1;
  console.log('cards by kind', JSON.stringify(kinds));
  const out = arg('--dump');
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
  return rows;
}

// ---------------------------------------------------------------- E-T3
// Each turn names the topic names the conversation may be on afterwards (any of them counts as "on the right node"); null = no node expected to change.
function scripts() {
  const known = ['dog', 'cat', 'house', 'bicycle', 'car', 'tree', 'boat', 'bus', 'train', 'robot', 'flower', 'bird'];
  const out = [];
  for (let i = 0; i < 30; i++) {
    const a = known[i % known.length], b = known[(i * 5 + 3) % known.length === i % known.length ? (i + 1) % known.length : (i * 5 + 3) % known.length], c = known[(i * 7 + 5) % known.length];
    const p = PLANETS[i % PLANETS.length], p2 = PLANETS[(i + 3) % PLANETS.length];
    const m = MONTHS[i % MONTHS.length];
    const kind = i % 3;
    if (kind === 0) out.push({ id: `things-${i}`, turns: [
      [`What is a ${a}?`, [a], 'plain'], [`and a ${b}?`, [b], 'and-X'], ['what are its parts?', [b], 'pronoun'], [`bigger than a ${c}?`, [b, c], 'fragment-compare'],
      [`no, the other one`, [b, c], 'correction'], ['how many wheels does it have?', [b, c, a], 'pronoun'] ] });
    else if (kind === 1) out.push({ id: `planets-${i}`, turns: [
      [`Is ${p} bigger than ${p2}?`, [p.toLowerCase(), p2.toLowerCase()], 'plain'], [`and Saturn?`, ['saturn'], 'and-X'], [`bigger than Earth?`, ['saturn', 'earth'], 'fragment-compare'],
      ['no, the other one', ['saturn', 'earth'], 'correction'], [`What comes after ${p}?`, ['planets'], 'plain'], ['and before it?', ['planets'], 'and-X'] ] });
    else out.push({ id: `time-${i}`, turns: [
      [`What comes after ${m}?`, ['months'], 'plain'], ['and before it?', ['months'], 'and-X'], ['and the seasons?', ['seasons'], 'and-X'],
      ['what did we talk about?', null, 'board'], [`What is a ${a}?`, [a], 'plain'], ['and its parts?', [a], 'pronoun'] ] });
  }
  return out;
}
async function t3() {
  const sc = scripts();
  const by = {}; let total = 0, right = 0, answered = 0;
  const fails = [];
  for (const c of sc) {
    const s = fresh();
    for (const [text, expect, kind] of c.turns) {
      const a = await ask(s, text);
      const cur = a.st.topics.find((t) => t.id === a.st.current)?.name ?? null;
      const onNode = expect === null ? true : !!cur && expect.includes(cur);
      const resp = a.found || /talked about/.test(a.text);
      (by[kind] ??= { n: 0, node: 0, answered: 0 }); by[kind].n++; if (onNode) by[kind].node++; if (resp) by[kind].answered++;
      total++; if (onNode) right++; if (resp) answered++;
      if ((!onNode || (process.argv.includes('--unanswered') && !resp)) && fails.length < 400) fails.push(`${c.id} "${text}" -> node ${cur} (wanted ${expect}) | ${a.text.slice(0, 80)}`);
    }
  }
  console.log(`\nE-T3: ${sc.length} conversations x 6 turns = ${total} turns; on the right node ${right}/${total} (${Math.round((100 * right) / total)}%), answered ${answered}/${total}`);
  for (const [k, v] of Object.entries(by)) console.log(`  ${k.padEnd(18)} n=${String(v.n).padStart(3)} node ${String(v.node).padStart(3)} (${Math.round((100 * v.node) / v.n)}%) answered ${v.answered}`);
  if (process.argv.includes('--fails')) console.log(fails.join('\n'));
}

// ---------------------------------------------------------------- E-T5
async function t5() {
  const turns = ['What is a bicycle?', 'What are the parts of a bicycle?', 'How many wheels does a bicycle have?', 'What is a house?', 'and a dog?', 'what are its parts?', 'Which is bigger, a dog or a house?', 'What are the planets in order?', 'What comes after Mars?', 'make it red', 'bigger', 'How do you know?', 'What is a cat?', 'and a car?', 'What is a tree?', 'What is a boat?', 'What is a train?', 'What is a bus?', 'What is a robot?', 'What is a flower?', 'What is a bird?', 'What are the seasons?', 'What is a comet?', 'What is a castle?', 'What is a lighthouse?', 'What is a snowman?', 'What is a ladder?', 'What is a rocket?', 'what did we talk about?', 'undo'];
  const s = fresh();
  const rows = [];
  for (const t of turns) { const a = await ask(s, t); rows.push({ t, ms: a.ms, steps: a.r.budget?.ticks ?? null, budget: a.r.budget, perf: a.r.perf }); }
  const first = rows[0], warm = rows.slice(1).map((r) => r.ms).sort((a, b) => a - b);
  const med = warm[Math.floor(warm.length / 2)];
  const st = facts.stats;
  const size = JSON.stringify(s.state('talk')).length;
  console.log(`\nE-T5: ${rows.length} turns (Node, this machine, local fixture catalog; NOT the phone profile)`);
  console.log(`first turn ${first.ms.toFixed(0)} ms, warm median ${med.toFixed(1)} ms, warm p90 ${warm[Math.floor(warm.length * 0.9)].toFixed(1)} ms, max ${warm.at(-1).toFixed(0)} ms`);
  const stp = rows.map((r) => r.steps).sort((a, b) => a - b); console.log(`steps (budget ticks) per turn: first ${rows[0].steps}, median ${stp[Math.floor(stp.length / 2)]}, max ${stp.at(-1)}`);
  console.log(`catalog cache: vocab ${st.vocabBytes} B, shards loaded ${st.shardsLoaded.length} (${[...new Set(st.shardsLoaded)].join(', ')}), shard bytes ${st.shardBytes}, lookups ${st.lookups}, hits ${st.hits}`);
  console.log(`talk state after ${rows.length} turns: ${size} bytes JSON, ${s.state('talk').cards.length} cards, ${s.state('talk').topics.length} topics`);
  console.log(`heap used ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`);
}

if (which === 't1' || which === 'all') await t1();
if (which === 't3' || which === 'all') await t3();
if (which === 't5' || which === 'all') await t5();
process.exit(0);
