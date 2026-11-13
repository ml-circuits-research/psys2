#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Builds training/eval/knowledge-lookup-2026-11-13.jsonl (spec 17, KNOWLEDGE-BY-LOOKUP): 120 cases (40 draw/diagram, 40 knowledge questions, 40 controls) and the
 * same draw and knowledge cases with invented nouns (80 more). EVAL ONLY: nothing here is training data (owner's rule: no training rows from the knowledge worlds).
 *   node scripts/build-knowledge-lookup-set.mjs
 * Controls are the first standalone message of 30 operational cases spread over the worlds, plus 10 hand-written known-thing messages; they must not change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const add = (r) => rows.push(r);

// ---- draw: things that no app world has (14 nouns x 2 phrasings on the Drawing tab), 8 diagram shapes, 4 "box shaped like" -----------------------------------------
const DRAW = ['comet', 'guitar', 'lion', 'monkey', 'dolphin', 'umbrella', 'volcano', 'telescope', 'snowflake', 'crown', 'anchor', 'bell', 'key', 'candle'];
const DRAW_T = [(n) => `draw a ${n}`, (n) => `can you sketch me a ${n} please`];
for (const n of DRAW) DRAW_T.forEach((t, i) => add({ id: `kl.draw.${n}.${i}`, group: 'draw', tab: 'art.draw', noun: n, message: t(n), world: 'art.draw', answer: '^(Ta-da|I drew)' }));
for (const n of ['castle', 'lighthouse', 'robot', 'snowman', 'apple', 'bicycle', 'train', 'umbrella']) add({ id: `kl.diagram.${n}`, group: 'draw', tab: 'diagram.sketch', noun: n, message: `a diagram shaped like a ${n}`, world: 'diagram.sketch', answer: '^I drew a diagram' });
for (const n of ['guitar', 'crown', 'key', 'bell']) add({ id: `kl.box.${n}`, group: 'draw', tab: 'diagram.sketch', noun: n, message: `add a box shaped like a ${n}`, world: 'diagram.sketch', answer: '(?!x)x', note: 'frame not read by diagram.sketch (DRAW-FROM-FACTS item 4 reads "a diagram shaped like"); expected gap' });

// ---- knowledge questions: no tab action; the conversation answers from the loaded shard ---------------------------------------------------------------------------
const Q = [
  ['define', 'what is a comet', 'comet', '(?:extraterrestrial|frozen)'], ['define', 'what is a volcano', 'volcano', 'mountain|vent|lava|molten'], ['define', 'what is a telescope', 'telescope', 'optical|instrument|magnif'],
  ['define', 'what is a guitar', 'guitar', 'stringed|strings'], ['define', 'what is a dolphin', 'dolphin', 'cetacean|mammal|porpoise'], ['define', 'tell me about the moon', 'moon', 'satellite|earth|rock'],
  ['define', 'what is an umbrella', 'umbrella', 'canopy|rain|sun'], ['define', 'who is a pirate', 'pirate', 'sea|ship|rob|plunder|words'], ['define', 'what is a planet', 'planet', 'celestial|orbit|sun'],
  ['define', 'what is a bridge', 'bridge', 'structure|span|river'], ['define', "what's a candle", 'candle', 'wax|wick|light'], ['define', 'what is an anchor', 'anchor', 'ship|boat|heavy|hold|vessel'],
  ['define', 'what is a castle', 'castle', 'fortif|large|building'], ['define', 'what is a crown', 'crown', 'headdress|royal|monarch|top'], ['define', 'define magnet', 'magnet', 'attract|iron|magnetic'],
  ['count', 'how many legs does a spider have', 'spider', '\\b8 legs'], ['count', 'how many legs does an octopus have', 'octopus', '\\b8 legs|eight'], ['count', 'how many legs does a table have', 'table', '\\bhas \\d+ legs'],
  ['count', 'how many legs do insects have', 'insect', '\\b6 legs|six'], ['count', 'how many wheels does a car have', 'car', '\\bhas \\d+ wheels'], ['count', 'how many legs does a centipede have', 'centipede', 'legs'],
  ['count', 'how many legs does a crab have', 'crab', '\\b\\d+ legs'], ['count', 'how many eyes does a spider have', 'spider', 'eyes'],
  ['made', 'what is a tree made of', 'tree', 'wood'], ['made', 'what is a house made of', 'house', 'brick|wood'], ['made', 'what is a boat made of', 'boat', 'wood'], ['made', 'what is a car made of', 'car', 'metal'], ['made', 'what is the sun made of', 'sun', 'gas'],
  ['where', 'where does a fish live', 'fish', 'water'], ['where', 'where can you find a cloud', 'cloud', 'sky'], ['where', 'where does a bird live', 'bird', 'sky|tree'], ['where', 'where can you find a plane', 'plane', 'sky|airport'], ['where', 'where do you find a flower', 'flower', 'garden|grass'], ['where', 'where does a cat live', 'cat', 'house|home'],
  ['can', 'what can a bird do', 'bird', 'fly'], ['can', 'what can a fish do', 'fish', 'swim'], ['can', 'what can a boat do', 'boat', 'float|sail'], ['can', 'what can a plane do', 'plane', 'fly'], ['can', 'what can a dog do', 'dog', 'run|bark|mammal'], ['can', 'what can a cloud do', 'cloud', 'rain'],
];
Q.forEach(([kind, message, noun, answer], i) => add({ id: `kl.know.${String(i + 1).padStart(2, '0')}`, group: 'know', tab: null, frame: kind, noun, message, world: 'conversation', answer }));

// ---- controls: must not change with the catalog on --------------------------------------------------------------------------------------------------------
const ops = readFileSync(resolve(REPO, 'training/eval/operational.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.setup?.length && !r.init);
const byWorld = {};
for (const r of ops) (byWorld[r.world] ??= []).push(r);
const worlds = Object.keys(byWorld).sort();
let k = 0;
for (let round = 0; k < 30; round++) for (const w of worlds) { const r = byWorld[w][round * 7 % byWorld[w].length]; if (r && k < 30 && !rows.some((x) => x.id === `kl.ctl.${r.id}`)) { add({ id: `kl.ctl.${r.id}`, group: 'control', tab: r.tab, message: r.message, world: r.world }); k++; } }
for (const m of ['what is a cat', 'how many legs does a spider have', 'tell me about spiders', 'what is the capital of France', 'draw a house', 'draw a red tree', 'how many legs does a dog have', 'what does a rabbit eat', 'hello', 'how many legs does a cat have']) add({ id: `kl.ctl.hand.${rows.length}`, group: 'control', tab: /^draw/.test(m) ? 'art.draw' : null, message: m, world: null });

// ---- the same draw and knowledge cases with invented nouns --------------------------------------------------------------------------------------------------
const INVENTED = ['blorp', 'zindle', 'quorbit', 'flambex', 'snarf', 'glimbus', 'vrootle', 'plimsy', 'kwazzle', 'drobnik', 'sfumble', 'yarnok', 'thwippet', 'norgle'];
const real = rows.filter((r) => r.group === 'draw' || r.group === 'know');
const nounsUsed = [...new Set(real.map((r) => r.noun))];
const swap = new Map(nounsUsed.map((n, i) => [n, INVENTED[i % INVENTED.length]]));
for (const r of real) {
  const inv = swap.get(r.noun);
  add({ ...r, id: `${r.id}.inv`, invented: true, noun: inv, message: r.message.replace(new RegExp(`\\b${r.noun}s?\\b`, 'i'), inv).replace(/\ban (?=[b-df-hj-np-tv-z])/i, 'a '), answer: "(?:don't know|do not know|cannot|can't)" });
}

const out = resolve(REPO, 'training/eval/knowledge-lookup-2026-11-13.jsonl');
writeFileSync(out, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
const n = (g, inv) => rows.filter((r) => r.group === g && !!r.invented === inv).length;
console.log(`${rows.length} rows -> ${out}: draw ${n('draw', false)}, know ${n('know', false)}, control ${n('control', false)}, invented draw ${n('draw', true)}, invented know ${n('know', true)}`);
