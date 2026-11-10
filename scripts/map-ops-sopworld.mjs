#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SOPWORLD-1 item 9: what the sopworld library can and cannot replace, per world (the map for stage 2).
 *
 *   node scripts/map-ops-sopworld.mjs [--md] [--no-write]
 *
 * Every non-blank, non-comment line of every world's ops.mjs (and of the helper modules of the engine-heavy worlds) is assigned to the function it
 * belongs to, and every function to one of five classes by its name and body (the rules are the tables below; they are a first classification, read
 * and corrected by hand where a class looked wrong, see OVERRIDES). Lines outside any function (tables, constants, imports, glue) are `glue`.
 *   state       state and rules       replaceable by a matrix: states, fluents, events, actions, retract
 *   query       queries, aggregates   replaceable: queries with a status, aggregates, rules over facts
 *   text        text handling         stays code (splitting, cleaning, parsing words); an action or a function of the matrix
 *   engine      engine, geometry, search   stays code (layout, search, chess, maps, drawing); moves state and validation only
 *   wording     reply wording         stays ours (templates, notes): `voice` in the matrix worlds
 * Writes docs/sopworld-map.html and prints a Markdown table (--md prints only it).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORLDS = join(REPO, 'worlds');
const CLASSES = ['state', 'query', 'text', 'engine', 'wording', 'glue'];
const LABEL = { state: 'state and rules', query: 'queries and aggregates', text: 'text handling', engine: 'engine, geometry, search', wording: 'reply wording', glue: 'tables, glue' };

const NAME = {
  wording: /^(cap1?|joinAnd|joinOr|plural|pluralOf\w*|article|an|a_?|andList|orList|show\w*|say\w*|describe\w*|phrase\w*|sentence\w*|\w*Text|\w*Phrase|\w*Note|quote|lowerFirst|unit|money|fmt|human|opener|hairPhrase|moodWord|reply\w*|explain\w*|summary|topicSummary|name|nameOf|asName|leiWord|ordinalWord|colorName|sqName|letter|ucol|sp|word|moveText|speak\w*|ask\w*Text|help\w*|capabilities|exampleList|nextExamples|tabInfo|greet|thanks|bye|howAreYou|meet)$/,
  text: /^(norm\w*|clean\w*|toks?|split\w*|parse\w*|slug|stem|strip\w*|words|uniq|idsOf|readName|properName|kindOfWord|isColorWord|lemma\w*|trim\w*|number\w*|colou?r\w*From\w*|resolvePhrase|match\w*|readAnimals|wordList|myName|writeName|lastOf|toNum|key|id|slugOf|tokens?|lex\w*|cleanItem|listName|containsWords)$/,
  state: /^(initialState|ensure|st|store|set\w*|put|add\w*|remove\w*|clear|reset|update\w*|apply\w*|replay|undo|redo|new\w*|begin|play\w*|commit|sync|open\w*|close|mirror|record|learn\w*|withDocument|patch\w*|next\w*|touch|current|need|refresh|choose\w*|back|gameNew|give\w*|start\w*|finish\w*|move\w*Piece|make\w*|create\w*|delete\w*|rename|toggle|edit\w*|insert\w*|append\w*|select\w*|focus\w*|undoLast|wrongGuess|guess\w*)$/,
  engine: /^(minimax|best\w*|choose(Easy|Move)|layout\w*|route\w*|place\w*|solve\w*|search\w*|legal\w*|attack\w*|mate|fen\w*|geo\w*|dist\w*|bearing|project\w*|zoom|pan|nearest|find(Path|Win)|haversine|clamp|deg|rad|hash|rng|scene\w*|render\w*|draw\w*|paint\w*|shape\w*|anchor\w*|bbox|overlap|collide|moves|empties|winnerOf|loadEngine|engineReady|prepare|stockfish\w*|engineMove|simulate|score\w*|analy[sz]e\w*|chart\w*|axis|scale|tick\w*|svg\w*|path\w*|coord\w*|snap|crowd\w*|free\w*|arrow\w*)$/,
  query: /^(ok|no)$/,
};
const BODY = {
  engine: /Math\.(sin|cos|tan|atan2?|sqrt|hypot|PI)\b|minimax|alpha|haversine|\bgrid\b|bfs|dfs|queue\.shift|\bsvg\b|polygon|stockfish|\bfen\b|bbox|collid|overlap|\.sort\(\(\w+, \w+\) => [^)]*\.(x|y)\b/i,
  wording: /(note|text|reply):\s*[`'"]/,
  state: /ctx\.state\.[\w.\[\]'"]+\s*(=|\+=|\+\+)|ctx\.state\[[^\]]+\]\s*=|ctx\.emit\(|ctx\.effect\(|ctx\.retract\(|\.push\(|\.splice\(|delete\s+\w+\./,
  query: /ctx\.(find|ordered|ask|val|vals|peek|get)\(|\.reduce\(|Math\.(max|min)\(|\.filter\(|\.length\b/,
  text: /\.replace\(\/|\.split\(\/|\.match\(\/|new RegExp|\.test\(/,
};
/** Hand corrections: `world:function` -> class, where the first classification misread the function. */
const OVERRIDES = {
  'kids.arith:replay': 'state', 'kids.arith:currentCount': 'query', 'kids.arith:totalCount': 'query', 'kids.arith:leader': 'query', 'kids.arith:gap': 'query', 'kids.arith:verdict': 'query', 'kids.arith:hasAny': 'query', 'kids.arith:counts': 'query', 'kids.arith:calc': 'query', 'kids.arith:calc2': 'query', 'kids.arith:terminates': 'query', 'kids.arith:half': 'query', 'kids.arith:double': 'query',
  'kids.shop:wallet': 'state', 'kids.shop:priceWire': 'state', 'kids.shop:cost': 'query', 'kids.shop:balance': 'query', 'kids.shop:affordable': 'query', 'kids.shop:changeFor': 'query', 'kids.shop:leftAfter': 'query', 'kids.shop:basketTotal': 'query', 'kids.shop:priceOf': 'query', 'kids.shop:unknownPrice': 'wording', 'kids.shop:words': 'wording',
  'kids.tasks:addTo': 'state', 'kids.tasks:removeItem': 'state', 'kids.tasks:finishItem': 'state', 'kids.tasks:clearList': 'state', 'kids.tasks:mirror': 'state', 'kids.tasks:showList': 'query', 'kids.tasks:pendingItems': 'query', 'kids.tasks:countItems': 'query', 'kids.tasks:countPending': 'query', 'kids.tasks:hasItem': 'query', 'kids.tasks:checkItem': 'query', 'kids.tasks:showLists': 'query', 'kids.tasks:summary': 'wording', 'kids.tasks:notDone': 'wording', 'kids.tasks:matchIn': 'text', 'kids.tasks:candidates': 'text',
  'kids.time:shift': 'query', 'kids.time:daysBetween': 'query', 'kids.time:hoursBetween': 'query', 'kids.time:monthDays': 'query', 'kids.time:ordered': 'query', 'kids.time:told': 'query', 'kids.time:mod': 'query',
  'games.tictactoe:minimax': 'engine', 'games.tictactoe:bestMove': 'engine', 'games.tictactoe:winnerOf': 'state', 'games.tictactoe:empties': 'state', 'games.tictactoe:moves': 'state', 'games.tictactoe:findWin': 'engine', 'games.tictactoe:chooseEasy': 'engine',
  'user.profile:planOf': 'state', 'user.profile:sectionsOf': 'query', 'user.profile:envOf': 'query', 'user.profile:reactionFor': 'wording', 'user.profile:known': 'query',
};

function functionsOf(lines) {
  const starts = [];
  lines.forEach((l, i) => {
    const m = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function/.exec(l);
    if (m) starts.push({ name: m[1] ?? m[2] ?? m[3], from: i });
  });
  // a function ends at the line before the next top-level `}` closing it; approximate by brace depth from its first line
  const out = [];
  for (const s of starts) {
    let depth = 0, started = false, end = s.from;
    for (let j = s.from; j < lines.length; j++) {
      const code = lines[j].replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
      for (const ch of code) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
      end = j;
      if (started && depth <= 0) break;
      if (!started && /;\s*$/.test(code)) break;
    }
    out.push({ name: s.name, from: s.from, to: end });
  }
  return out;
}
const code = (l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l);

function classify(world, fn, body) {
  const key = `${world}:${fn}`;
  if (OVERRIDES[key]) return OVERRIDES[key];
  for (const c of ['wording', 'text', 'engine', 'state']) if (NAME[c].test(fn)) return c;
  if (NAME.query.test(fn)) return 'glue';
  if (BODY.engine.test(body)) return 'engine';
  if (BODY.state.test(body) && /ctx\.state|ctx\.emit|ctx\.effect|ctx\.retract/.test(body)) return 'state';
  if (BODY.wording.test(body) && !/ctx\.state/.test(body)) return 'wording';
  if (BODY.query.test(body)) return 'query';
  if (BODY.text.test(body)) return 'text';
  return 'glue';
}

export function mapWorld(id) {
  const dir = join(WORLDS, id);
  const files = [];
  const walk = (d, base = '') => { for (const e of readdirSync(d).sort()) { const f = join(d, e); if (statSync(f).isDirectory()) { if (!['vendor'].includes(e)) walk(f, `${base}${e}/`); } else if (e.endsWith('.mjs') && e !== 'datagen.mjs' && e !== 'fns.mjs') files.push(`${base}${e}`); } };
  walk(dir);
  const mods = files.filter((f) => f === 'ops.mjs' || /^(scene|arrows)\.mjs$/.test(f) || f.startsWith('engine/'));
  if (!existsSync(join(dir, 'ops.mjs'))) return null;
  const total = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  const biggest = [];
  let raw = 0;
  for (const f of mods) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    const fns = functionsOf(lines);
    const owner = new Array(lines.length).fill(null);
    for (const fn of fns) for (let j = fn.from; j <= fn.to; j++) owner[j] = fn;   // an inner function stays with the outer one
    const engineFile = f.startsWith('engine/') || /^(scene|arrows)\.mjs$/.test(f);
    for (let j = 0; j < lines.length; j++) {
      if (!code(lines[j])) continue;
      raw++;
      const fn = owner[j];
      const c = !fn ? (engineFile ? 'engine' : 'glue') : (engineFile && !OVERRIDES[`${id}:${fn.name}`] ? 'engine' : classify(id, fn.name, lines.slice(fn.from, fn.to + 1).join('\n')));
      total[c]++;
    }
    for (const fn of fns) biggest.push({ name: fn.name, lines: lines.slice(fn.from, fn.to + 1).filter(code).length, cls: engineFile ? 'engine' : classify(id, fn.name, lines.slice(fn.from, fn.to + 1).join('\n')) });
  }
  biggest.sort((a, b) => b.lines - a.lines);
  return { id, files: mods, lines: raw, byClass: total, biggest: biggest.slice(0, 4) };
}

const NOTES = {
  'kids.shop': 'Done in stage 1 (matrix + reply words): prices, wallet, change, affordability.',
  'kids.arith': 'Done in stage 1: holdings as states, leader/gap/verdict as queries; the calculator stays small code.',
  'kids.tasks': 'Done in stage 1: entries as wires, actions on them; list-name and item-splitting text handling stays code.',
  'kids.time': 'Date arithmetic is `time_add`, `time_diff`, `weekday` in the library: most of it is replaceable; calendar facts as wires.',
  'kids.animals': 'A knowledge base and yes/no abilities: facts and rules (stage 2).',
  'kids.shapes': 'A knowledge base and checks over it: facts and rules (stage 2).',
  'kids.common': 'Greetings and the user\'s name: wording and one fact; little to move.',
  'user.profile': 'What is known about the user: facts, sections as aggregates; the questionnaire plan is rules over facts.',
  'games.tictactoe': 'Board state and win rule are rules over wires (and a denies for illegal moves); the minimax search stays code.',
  'games.hangman': 'State and rules (word, guesses, wrong count) fit a matrix; the display mask is wording.',
  'games.guess': 'Question/answer knowledge base: facts and rules; the question picker is a small search.',
  'games.chess': 'Legal moves, check and search stay code (and Stockfish); move history, undo and the position as state could move.',
  'geo.map': 'Distances, projection and view are geometry; the places are facts; the view state could move.',
  'data.charts': 'The chart data model is facts and aggregates; the layout and drawing stay code.',
  'docs.editor': 'The document is a tree of wires with edits as actions and undo as retract (state and rules); text editing helpers stay code.',
  'docs.reader': 'Document structure and questions are facts and queries; the analysis (sentences, entities) is text handling.',
  'media.music': 'Playback state and song list are state; the instrument and note engine stay code.',
  'art.draw': 'The scene is wires with placement search and geometry in code; the scene state and undo could move.',
  'diagram.sketch': 'Nodes and arrows are wires; auto-layout and routing stay code (the engine).',
  'ui.avatar': 'The avatar\'s look and mood are state with rules; the phrases are wording; the drawing stays code.',
  'ui.help': 'Help text and tab descriptions: wording and a lookup over the worlds (a query over their declarations).',
  'ui.shell': 'Tabs and games chosen: state and a few rules; the navigation words are wording.',
};

function build() {
  const rows = readdirSync(WORLDS).sort().map((id) => (existsSync(join(WORLDS, id, 'ops.mjs')) ? mapWorld(id) : { id, none: true }));
  return rows;
}
const rows = build();
const sum = (r, cs) => cs.reduce((a, c) => a + r.byClass[c], 0);
const md = [
  '| World | ops lines | state and rules | queries and aggregates | text handling | engine, geometry, search | reply wording | tables, glue | replaceable (state + queries) |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map((r) => (r.none ? `| ${r.id} | no ops.mjs | | | | | | | none (legend, patterns and templates only) |` : `| ${r.id} | ${r.lines} | ${r.byClass.state} | ${r.byClass.query} | ${r.byClass.text} | ${r.byClass.engine} | ${r.byClass.wording} | ${r.byClass.glue} | ${sum(r, ['state', 'query'])} (${Math.round((100 * sum(r, ['state', 'query'])) / r.lines)}%) |`)),
];
const have = rows.filter((r) => !r.none);
const tot = Object.fromEntries(CLASSES.map((c) => [c, have.reduce((a, r) => a + r.byClass[c], 0)]));
const totLines = have.reduce((a, r) => a + r.lines, 0);
md.push(`| **all ${have.length} ops.mjs** | **${totLines}** | **${tot.state}** | **${tot.query}** | **${tot.text}** | **${tot.engine}** | **${tot.wording}** | **${tot.glue}** | **${tot.state + tot.query} (${Math.round((100 * (tot.state + tot.query)) / totLines)}%)** |`);
if (process.argv.includes('--md')) { console.log(md.join('\n')); process.exit(0); }
console.log(md.join('\n'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>What sopworld can replace, per world</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:70rem;margin:0 auto;padding:1rem 16px;color:#1d2330;background:#fff}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #c9ced8;padding:.3rem .5rem;text-align:left;vertical-align:top}td.n{text-align:right}th{background:#eef1f6}code{background:#eef1f6;padding:0 .25em}@media(prefers-color-scheme:dark){body{background:#12151c;color:#e6e9f0}th{background:#1c2230}th,td{border-color:#39414f}code{background:#1c2230}}@media(max-width:700px){.wide{overflow-x:auto}}</style></head>
<body><h1>What sopworld can and cannot replace, world by world</h1>
<p>Map for stage 2 of SOPWORLD-1 (spec 15). Every code line of each world's <code>ops.mjs</code> (and of the helper modules of the engine-heavy worlds: <code>scene.mjs</code>, <code>arrows.mjs</code>, <code>engine/</code>) is assigned to its function, and each function to one of five classes. Generated by <code>node scripts/map-ops-sopworld.mjs</code> (first classification by function name and body, corrected by hand where it was wrong; see <code>OVERRIDES</code> in the script). Two worlds, <code>core</code> and <code>lang.common</code>, have no <code>ops.mjs</code>.</p>
<ul><li><b>State and rules</b>: states, events, actions, undo. Replaceable by a matrix (fluents, effects, <code>core.action</code>, <code>retract</code>).</li>
<li><b>Queries and aggregates</b>: answers computed from facts. Replaceable (queries with a status, aggregates, rules, <code>core.calc</code>).</li>
<li><b>Text handling</b>: splitting, cleaning, parsing words. Stays code; the matrix calls it as an action or a function.</li>
<li><b>Engine, geometry, search</b>: layout, chess, maps, drawing, minimax. Stays code; only its state and its validation move.</li>
<li><b>Reply wording</b>: sentences, plurals, notes. Stays ours (templates; <code>voice</code> in the matrix worlds).</li></ul>
<div class="wide"><table><thead><tr><th>World</th><th>ops lines</th><th>state and rules</th><th>queries, aggregates</th><th>text handling</th><th>engine, geometry, search</th><th>reply wording</th><th>tables, glue</th><th>replaceable</th><th>Reading</th></tr></thead><tbody>
${rows.map((r) => (r.none ? `<tr><td>${r.id}</td><td colspan="8">no <code>ops.mjs</code> (legend, patterns, templates only)</td><td>The shared legends and phrases: they are what the library reads through <code>mapping.sop</code>.</td></tr>` : `<tr><td>${r.id}</td><td class="n">${r.lines}</td><td class="n">${r.byClass.state}</td><td class="n">${r.byClass.query}</td><td class="n">${r.byClass.text}</td><td class="n">${r.byClass.engine}</td><td class="n">${r.byClass.wording}</td><td class="n">${r.byClass.glue}</td><td class="n">${sum(r, ['state', 'query'])} (${Math.round((100 * sum(r, ['state', 'query'])) / r.lines)}%)</td><td>${esc(NOTES[r.id] ?? '')} <small>Largest: ${r.biggest.map((b) => `${esc(b.name)} ${b.lines} (${b.cls})`).join(', ')}.</small></td></tr>`)).join('\n')}
<tr><th>all ${have.length}</th><th class="n">${totLines}</th><th class="n">${tot.state}</th><th class="n">${tot.query}</th><th class="n">${tot.text}</th><th class="n">${tot.engine}</th><th class="n">${tot.wording}</th><th class="n">${tot.glue}</th><th class="n">${tot.state + tot.query} (${Math.round((100 * (tot.state + tot.query)) / totLines)}%)</th><th></th></tr>
</tbody></table></div>
<p>Reading the table: the three stage 1 worlds moved their state and queries to matrices and kept their wording and text handling in <code>fns.mjs</code>. The worlds with a large <i>engine</i> column (<code>art.draw</code>, <code>diagram.sketch</code>, <code>games.chess</code>, <code>geo.map</code>, <code>media.music</code>, <code>ui.avatar</code>, <code>data.charts</code>) keep their engines; stage 2 moves only their state (scene, document, history) and validation.</p>
</body></html>
`;
if (!process.argv.includes('--no-write')) { writeFileSync(join(REPO, 'docs/sopworld-map.html'), html); console.log('\nwrote docs/sopworld-map.html'); }
