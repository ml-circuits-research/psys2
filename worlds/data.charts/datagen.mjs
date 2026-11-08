// Generator of training examples for data.charts (spec 08). Browser-safe, imports nothing.
// Chart types, colors, shades, palettes, positions and the sort words come from the world's own lexicons (`context.lexicons`),
// things to chart from kids.arith, kids.shop and kids.animals lexicons; small embedded lists are the fallback. The expected
// circuit of every text is known independently of the formalizer: one core.request with the action and arguments the matching
// pattern family emits (arguments in emit order, undefined values left out). Negatives are sentences of other worlds and
// near misses that this world must not take.
export const version = '1';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const q = (s) => JSON.stringify(String(s));
const sp = (w) => String(w).replace(/_/g, ' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const NUMW = 'zero one two three four five six seven eight nine ten'.split(' ');
const E = (action, args = {}) => `@x1 core.request action=chart.${action}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` arg.${k}=${v}`).join('')}`;
const art = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
const plural = (w) => { const x = sp(w); return /[^aeiou]y$/.test(x) ? `${x.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(x) ? `${x}es` : `${x}s`; };

const FB = {
  types: ['bar', 'line', 'pie', 'doughnut', 'donut', 'radar', 'polar_area', 'polar', 'scatter'],
  colors: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'teal', 'brown', 'gray', 'indigo', 'coral'],
  shades: ['light', 'dark', 'pale', 'bright', 'deep'],
  palettes: ['rainbow', 'pastel', 'ocean', 'forest', 'sunset', 'warm', 'cool', 'neon', 'earth'],
  ordinals: ['first', 'second', 'third', 'fourth', 'last'],
  big: ['biggest', 'largest', 'highest', 'greatest', 'most', 'tallest', 'maximum'],
  small: ['smallest', 'lowest', 'least', 'shortest', 'minimum', 'fewest'],
  items: ['apple', 'pear', 'marble', 'sticker', 'pencil', 'cookie', 'balloon'],
  shop: ['ball', 'pencil', 'pen', 'eraser', 'ruler', 'notebook', 'book', 'doll', 'kite', 'puzzle', 'apple', 'banana'],
  animals: ['dog', 'cat', 'spider', 'bee', 'cow', 'horse', 'bird', 'ant', 'snake', 'crab', 'octopus', 'eagle'],
  names: ['Tom', 'Ana', 'Mia', 'Ben', 'Lily', 'Sam'],
  groups: ['toys', 'fruit', 'school things', 'snacks', 'drinks'],
  habitats: ['sea', 'farm', 'forest', 'river', 'jungle', 'desert'],
  labels: ['apples', 'pears', 'plums', 'cats', 'dogs', 'fish', 'books', 'pens', 'cherries', 'bananas', 'kiwis', 'figs', 'mon', 'tue', 'wed'],
  lists: ['shopping', 'to-do', 'reminders'],
};

export function generate({ rng: r, count = 300, context } = {}) {
  const lx = (id, fb) => (context?.lexicons?.[id]?.length ? context.lexicons[id] : fb);
  const types = lx('lex.data.charts.types', FB.types);
  const colors = lx('lex.data.charts.colors', FB.colors);
  const shades = lx('lex.data.charts.shades', FB.shades);
  const palettes = lx('lex.data.charts.palettes', FB.palettes).filter((p) => !['default', 'original', 'standard', 'normal', 'sea', 'autumn', 'different'].includes(p));
  const ordinals = lx('lex.data.charts.ordinals', FB.ordinals);
  const extent = lx('lex.data.charts.extent', [...FB.big, ...FB.small]);
  const big = FB.big.filter((w) => extent.includes(w)), small = FB.small.filter((w) => extent.includes(w));
  const items = lx('lex.kids.arith.items', FB.items).filter((w) => !w.includes('_'));
  const shop = lx('lex.kids.shop.items', FB.shop).filter((w) => !w.includes('_'));
  const animals = lx('lex.kids.animals.names', FB.animals).filter((w) => !w.includes('_') && !/(fish|sheep|deer|mouse|goose|wolf|ant|ox)$/.test(w));
  const label = () => pick(r, FB.labels);
  const labels2 = () => { const a = label(); let b = label(); while (b === a) b = label(); return [a, b]; };
  const type = () => pick(r, types);
  const tword = (t) => sp(t);
  const noun = () => pick(r, ['chart', 'graph']);
  const data = (n = 3) => { const used = new Set(); const rows = []; while (rows.length < n) { const l = label(); if (used.has(l)) continue; used.add(l); const v = 1 + Math.floor(r() * 12); rows.push([l, v, chance(r, 0.2) && v <= 10 ? NUMW[v] : String(v)]); } return rows; };
  const dtext = (rows) => rows.map(([l, , t]) => `${l} ${t}`).join(', ');
  const T = [];
  const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });

  // ---- create from typed numbers ----
  add('chart.fromText', 'request', () => { const rows = data(2 + Math.floor(r() * 3)); const text = dtext(rows); const t = chance(r, 0.4) ? type() : undefined;
    return { text: `${pick(r, ['Make', 'Create', 'Draw', 'Build'])} ${t ? `${art(tword(t))} ${tword(t)}` : 'a'} ${t ? 'chart' : noun()}${pick(r, [':', ' of', ' with', ' for'])} ${text}.`.replace(/ :/, ':'), expect: E('fromText', { text: q(text), type: t }) }; });
  add('chart.fromText.short', 'request', () => { const rows = data(3); const text = dtext(rows);
    return { text: `${pick(r, ['Chart', 'Graph', 'Plot'])} ${text}.`, expect: E('fromText', { text: q(text) }) }; });
  add('chart.new', 'request', () => { const t = chance(r, 0.4) ? type() : undefined;
    return { text: `${pick(r, ['Start', 'Create', 'Make', 'Open', 'Draw'])} ${pick(r, ['a new', 'another', 'a blank', 'a fresh'])} ${t ? tword(t) + ' ' : ''}${noun()}.`, expect: E('new', { type: t }) }; });
  add('chart.new.named', 'request', () => { const n = cap(label());
    return { text: `${pick(r, ['Create', 'Make', 'Start'])} a new chart ${pick(r, ['called', 'named', 'titled'])} ${n}.`, expect: E('new', { title: q(n) }) }; });
  add('chart.refresh', 'request', () => ({ text: `${pick(r, ['Update', 'Refresh', 'Rebuild'])} ${pick(r, ['the', 'this', 'my'])} ${noun()}${pick(r, ['', ' again', ' now'])}.`, expect: E('refresh') }));
  add('chart.duplicate', 'request', () => ({ text: pick(r, [`Duplicate the ${noun()}.`, `Copy this ${noun()}.`, `Make a copy of the ${noun()}.`, `Clone my ${noun()}.`]), expect: E('duplicate') }));

  // ---- create from the conversation ----
  add('chart.fromHoldings', 'request', () => { const t = chance(r, 0.4) ? type() : undefined; const who = pick(r, ['everyone', 'everybody']);
    return { text: `${pick(r, ['Make', 'Create', 'Draw', 'Show me'])} ${t ? `${art(tword(t))} ${tword(t)}` : 'a'} ${noun()} of what ${who} has.`, expect: E('fromHoldings', { who: q(who), type: t }) }; });
  add('chart.fromHoldings.names', 'multi-entity', () => { const a = pick(r, FB.names); let b = pick(r, FB.names); while (b === a) b = pick(r, FB.names);
    return { text: pick(r, [`Chart what ${a} and ${b} have.`, `Graph what ${a} and ${b} have.`]), expect: E('fromHoldings', { who: q(`${a} and ${b}`) }) }; });
  add('chart.fromHoldings.item', 'request', () => { const it = pick(r, items); const t = chance(r, 0.3) ? type() : undefined;
    return { text: pick(r, [`Chart the ${plural(it)}.`, `Graph all the ${plural(it)}.`]), expect: E('fromHoldings', { who: q('everyone'), item: it }) }; });
  add('chart.fromPrices', 'request', () => { const g = pick(r, FB.groups);
    return { text: pick(r, [`Chart the prices of the ${g}.`, `Compare the prices of the ${g}.`, `Graph the prices of the ${g}.`, `Make a bar chart of the prices of the ${g}.`]).replace(/Make a bar chart/, 'Make a bar chart'), expect: E('fromPrices', { what: q(g), type: undefined }) }; }, { fix: (ex) => ex.text.startsWith('Make a bar') ? { ...ex, expect: ex.expect.replace(/$/, ' arg.type=bar') } : ex });
  add('chart.fromPrices.how', 'request', () => { const g = pick(r, FB.groups);
    return { text: `${pick(r, ['Chart', 'Graph', 'Compare'])} how much the ${g} cost.`, expect: E('fromPrices', { what: q(`the ${g}`) }) }; });
  add('chart.fromPrices.all', 'request', () => ({ text: pick(r, ['Chart all the prices.', 'Graph the prices.', 'Plot all the costs.']), expect: E('fromPrices', { what: q('everything') }) }));
  add('chart.fromLegs', 'request', () => { const h = pick(r, FB.habitats);
    return { text: pick(r, [`Compare the legs of the ${h} animals.`, `Chart the legs of the ${h} animals.`]), expect: E('fromLegs', { what: q(`${h} animals`) }) }; });
  add('chart.fromLegs.how', 'request', () => { const h = pick(r, FB.habitats);
    return { text: `${pick(r, ['Chart', 'Graph', 'Compare'])} how many legs the ${h} animals have.`, expect: E('fromLegs', { what: q(`${h} animals`) }) }; });
  add('chart.fromLegs.named', 'multi-entity', () => { const a = pick(r, animals); let b = pick(r, animals); while (b === a) b = pick(r, animals);
    const wa = `${art(a)} ${a}`, wb = `${art(b)} ${b}`;
    return { text: `Chart the legs of ${wa} and ${wb}.`, expect: E('fromLegs', { what: q(`${wa} and ${wb}`) }) }; });
  add('chart.fromList', 'request', () => { const l = pick(r, FB.lists);
    return { text: pick(r, [`Chart my ${l} list.`, `Graph the ${l} list.`]), expect: E('fromList', { list: q(l) }) }; });
  add('chart.fromList.as', 'request', () => { const l = pick(r, FB.lists);
    return { text: pick(r, [`Show my ${l} list as a chart.`, `Show my ${l} list as a graph.`]), expect: E('fromList', { list: q(l) }) }; });
  add('chart.fromList.all', 'request', () => ({ text: pick(r, ['Chart my lists.', 'Graph all my lists.']), expect: E('fromList', { list: q('') }) }));

  // ---- data ----
  add('chart.addPoint', 'request', () => { const [l, v, t] = data(1)[0]; return { text: `Include ${l} ${t}.`, expect: E('addPoint', { text: q(`${l} ${t}`) }) }; });
  add('chart.addPoint.chart', 'request', () => { const [l, v, t] = data(1)[0]; return { text: `Add ${t} ${l} to the chart.`, expect: E('addPoint', { text: q(`${t} ${l}`) }) }; });
  add('chart.removePoint', 'request', () => { const l = label(); return { text: pick(r, [`Remove ${l} from the chart.`, `Delete ${l} from the graph.`, `Take ${l} off the chart.`]), expect: E('removePoint', { l: q(l) }) }; });
  add('chart.setPoint', 'request', () => { const [l, v, t] = data(1)[0]; return { text: `${pick(r, ['Change', 'Set', 'Update'])} ${l} to ${t}.`, expect: E('setPoint', { l: q(l), n: v }) }; });
  add('chart.adjustPoint.up', 'request', () => { const l = label(), n = 1 + Math.floor(r() * 9); return { text: `${pick(r, ['Increase', 'Raise', 'Boost'])} ${l} by ${n}.`, expect: E('adjustPoint', { l: q(l), by: n, dir: 'up' }) }; });
  add('chart.adjustPoint.down', 'request', () => { const l = label(), n = 1 + Math.floor(r() * 9); return { text: `${pick(r, ['Decrease', 'Lower', 'Reduce'])} ${l} by ${n}.`, expect: E('adjustPoint', { l: q(l), by: n, dir: 'down' }) }; });
  add('chart.adjustPoint.factor', 'request', () => { const l = pick(r, FB.labels.slice(0, 12)); const [w, f] = pick(r, [['Triple', 3], ['Halve', 0.5]]); return { text: `${w} the ${l}.`, expect: E('adjustPoint', { l: q(l), factor: f }) }; });
  add('chart.renamePoint', 'multi-entity', () => { const [a, b] = labels2(); return { text: `Rename ${a} to ${b}.`, expect: E('renamePoint', { l: q(a), to: q(b) }) }; });
  add('chart.clearData', 'request', () => ({ text: `${pick(r, ['Clear', 'Empty', 'Wipe'])} the ${pick(r, ['chart', 'graph', 'data'])}.`, expect: E('clearData') }));

  // ---- type ----
  add('chart.setType', 'ellipsis', () => { const t = type(); return { text: pick(r, [`Make it ${art(tword(t))} ${tword(t)} chart.`, `Switch to ${art(tword(t))} ${tword(t)} chart.`, `Show it as ${art(tword(t))} ${tword(t)} graph.`]), expect: E('setType', { type: t }) }; });
  add('chart.setType.bare', 'ellipsis', () => { const t = type(); return { text: `${cap(tword(t))} ${noun()}.`, expect: E('setType', { type: t }) }; });
  add('chart.setType.stacked', 'request', () => { const t = pick(r, ['bar', 'line']); return { text: `Make it ${art('stacked')} stacked ${t} chart.`.replace('an stacked', 'a stacked'), expect: E('setType', { type: t, stacked: 'true' }) }; });
  add('chart.setStacked', 'request', () => pick(r, [{ text: 'Stack the bars.', expect: E('setStacked', { on: 'true' }) }, { text: 'Unstack the bars.', expect: E('setStacked', { on: 'false' }) }, { text: 'Put the bars side by side.', expect: E('setStacked', { on: 'false' }) }]));

  // ---- title ----
  add('chart.setTitle', 'request', () => { const n = cap(label()); return { text: pick(r, [`Call it ${n}.`, `Call the chart ${n}.`, `Title the graph ${n}.`]), expect: E('setTitle', { t: q(n) }) }; });
  add('chart.setTitle.change', 'request', () => { const n = cap(label()); return { text: pick(r, [`Change the chart title to ${n}.`, `Set the graph title to ${n}.`]), expect: E('setTitle', { t: q(n) }) }; });
  add('chart.removeTitle', 'request', () => ({ text: pick(r, ['Remove the chart title.', 'Hide the graph title.', 'Remove the title from the chart.']), expect: E('removeTitle') }));

  // ---- colors ----
  // chart.setColor needs the active chart (interceptInput) to beat art.draw, so it is covered by tests.sop only.
  // chart.setColor.label depends on the active chart (interceptInput), so it is covered by tests.sop only.
  add('chart.setPalette', 'request', () => { const p = pick(r, palettes); return { text: pick(r, [`Use ${p} colors.`, `Make it ${p} colors.`, `Try the ${p} palette.`]), expect: E('setPalette', { p }) }; });
  add('chart.setPalette.colorful', 'request', () => ({ text: pick(r, ['Make it colorful.', 'Make the bars colorful.']), expect: E('setPalette', { p: 'rainbow' }) }));
  add('chart.setPalette.each', 'request', () => ({ text: pick(r, ['Color each bar differently.', 'Paint every slice differently.']), expect: E('setPalette', { p: 'different' }) }));

  // ---- sort, orientation, values, legend ----
  add('chart.setSort', 'request', () => { const a = pick(r, big), b = pick(r, small); const down = chance(r, 0.5);
    return { text: `Sort from ${down ? a : b} to ${down ? b : a}.`, expect: E('setSort', { from: down ? a : b }) }; });
  add('chart.setSort.alpha', 'request', () => ({ text: pick(r, ['Sort alphabetically.', 'Order the bars by name.', 'Arrange the chart in alphabetical order.']), expect: E('setSort', { mode: 'alpha' }) }));
  add('chart.setSort.none', 'negation', () => pick(r, [{ text: 'Stop sorting.', expect: E('setSort', { mode: 'none' }) }, { text: 'Do not sort it.', expect: E('setSort', { mode: 'none' }) }, { text: 'Restore the original order.', expect: E('setSort', { mode: 'none' }) }]));
  add('chart.setOrientation', 'ellipsis', () => { const o = pick(r, ['horizontal', 'vertical']); return { text: pick(r, [`Make it ${o}.`, `Make the bars ${o}.`, `Make the chart ${o}.`]), expect: E('setOrientation', { o }) }; });
  add('chart.setValues', 'request', () => pick(r, [{ text: 'Show the values.', expect: E('setValues', { mode: 'on' }) }, { text: 'Show the numbers on the bars.', expect: E('setValues', { mode: 'on' }) }, { text: 'Hide the values.', expect: E('setValues', { mode: 'off' }) }, { text: 'Hide the numbers.', expect: E('setValues', { mode: 'off' }) }, { text: 'Show the percentages.', expect: E('setValues', { mode: 'percent' }) }]));
  add('chart.setLegend', 'request', () => pick(r, [{ text: 'Show the legend.', expect: E('setLegend', { on: 'true' }) }, { text: 'Hide the legend.', expect: E('setLegend', { on: 'false' }) }]));

  // ---- questions ----
  add('chart.extreme', 'question', () => { const w = pick(r, [...big, ...small]); return { text: pick(r, [`Which is the ${w}?`, `What is the ${w}?`]), expect: E('extreme', { w }) }; });
  add('chart.extreme.has', 'question', () => { const w = pick(r, ['most', 'least']); return { text: `Which has the ${w}?`, expect: E('extreme', { w }) }; });
  add('chart.total', 'question', () => ({ text: pick(r, ['What is the total?', 'What is the sum?', 'How much is the grand total?']), expect: E('total') }));
  add('chart.total.up', 'request', () => ({ text: pick(r, ['Add them up.', 'Sum everything up.', 'Total the bars up.']), expect: E('total') }));
  add('chart.average', 'question', () => ({ text: pick(r, ['What is the average?', 'What is the mean?', 'What is the average value?']), expect: E('average') }));
  add('chart.difference', 'multi-entity', () => { const [a, b] = labels2(); return { text: pick(r, [`How many more ${a} than ${b}?`, `How many fewer ${a} than ${b}?`]), expect: E('difference', { a: q(a), b: q(b) }) }; });
  add('chart.difference.between', 'multi-entity', () => { const [a, b] = labels2(); return { text: `What is the difference between ${a} and ${b}?`, expect: E('difference', { a: q(a), b: q(b) }) }; });
  add('chart.compare', 'multi-entity', () => { const [a, b] = labels2(); const w = pick(r, ['bigger', 'larger', 'higher', 'smaller', 'lower']); return { text: `Which is ${w}, ${a} or ${b}?`, expect: E('compare', { w, a: q(a), b: q(b) }) }; });
  add('chart.percent', 'question', () => { const l = label(); return { text: pick(r, [`What percentage are ${l}?`, `What percent is ${l}?`, `What share is ${l}?`]), expect: E('percent', { l: q(l) }) }; });
  add('chart.percent.much', 'question', () => { const l = label(); return { text: `How much of the chart is ${l}?`, expect: E('percent', { l: q(l) }) }; });
  add('chart.valueOf', 'question', () => { const l = label(); return { text: pick(r, [`What is the value of ${l}?`, `What is the amount of ${l}?`]), expect: E('valueOf', { l: q(l) }) }; });
  add('chart.countItems', 'question', () => ({ text: pick(r, ['How many bars are there?', 'How many slices are there?', 'How many points are in the chart?']), expect: E('countItems') }));
  add('chart.describe', 'request', () => ({ text: pick(r, ['Describe the chart.', 'Explain the graph.', 'Summarize this chart.', 'What does the chart show?']), expect: E('describe') }));
  add('chart.read', 'request', () => ({ text: pick(r, ['Read the chart aloud.', 'Read me the chart.', 'Read the graph out loud.']), expect: E('read') }));

  // ---- several charts ----
  add('chart.switchChart', 'request', () => { const o = pick(r, ordinals); return { text: pick(r, [`Go back to the ${o} chart.`, `Show the ${o} chart.`, `Open the ${o} graph.`]), expect: E('switchChart', { ord: o }) }; });
  add('chart.switchChart.number', 'request', () => { const n = 1 + Math.floor(r() * 5); return { text: `Go to chart ${n}.`, expect: E('switchChart', { n }) }; });
  add('chart.switchChart.dir', 'request', () => pick(r, [{ text: 'Show the next chart.', expect: E('switchChart', { dir: 'next' }) }, { text: 'Go to the previous chart.', expect: E('switchChart', { dir: 'prev' }) }]));
  add('chart.deleteChart', 'request', () => ({ text: pick(r, ['Delete this chart.', 'Remove the chart.', 'Discard the graph.']), expect: E('deleteChart') }));
  add('chart.deleteChart.ord', 'request', () => { const o = pick(r, ordinals); return { text: `Delete the ${o} chart.`, expect: E('deleteChart', { ord: o }) }; });
  add('chart.deleteChart.all', 'request', () => ({ text: pick(r, ['Delete all the charts.', 'Remove every chart.']), expect: E('deleteChart', { all: 'true' }) }));
  add('chart.listCharts', 'question', () => ({ text: pick(r, ['What charts do I have?', 'How many charts do I have?', 'List my charts.']), expect: E('listCharts') }));

  // ---- export ----
  add('chart.download', 'request', () => ({ text: pick(r, ['Download the chart as an image.', 'Save the chart as a picture.', 'Download the chart.', 'Take a picture of the chart.', 'Export the graph as a png.']), expect: E('download') }));
  add('chart.downloadData', 'request', () => ({ text: pick(r, ['Download the chart data as a spreadsheet.', 'Export the chart data as a csv.', 'Save the numbers as a file.'].map((x) => x.replace('Save the numbers as a file', 'Save the chart numbers as a file'))), expect: E('downloadData') }));
  add('chart.copyData', 'request', () => ({ text: pick(r, ['Copy the chart data.', 'Copy the numbers.']), expect: E('copyData') }));
  add('chart.toDocument', 'request', () => ({ text: pick(r, ['Put the chart in the document.', 'Insert the graph into the document.']), expect: E('toDocument') }));
  add('chart.toDocumentData', 'request', () => ({ text: pick(r, ['Put the chart data in the document.', 'Add the numbers to the document.']), expect: E('toDocumentData') }));

  // ---- negatives: other worlds and near misses ----
  const NEG = ['Tom has 5 apples.', 'Ana gives Tom 2 pears.', 'How many legs does a spider have?', 'What is the price of a ball?', 'Add milk to my shopping list.', 'Make a document from my shopping list.', 'Add a heading Shopping.',
    'Draw a red house.', 'Zoom in.', 'What is the capital of France?', 'Play tic tac toe.', 'Give yourself visor eyes.', 'Play C D E F G.', 'What time is it?', 'Say hello.', 'I need to buy bread.', 'What is half of 10?', 'Make me a sandwich.', 'Stop dictation.'];
  add('chart.negative', 'out-of-domain', () => ({ text: pick(r, NEG), expect: null, negative: true }), { noise: false });

  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const t = T[tries % T.length];
    let ex = t.make();
    if (!ex) continue;
    if (t.fix) ex = t.fix(ex);
    let text = ex.text;
    if (!ex.negative && chance(r, 0.15)) text = pick(r, ['Please, ', 'Okay, ', 'Well, ', 'Um, ']) + text.charAt(0).toLowerCase() + text.slice(1);
    if (!ex.negative && chance(r, 0.1)) text = text.replace(/[.]$/, pick(r, ['', '!']));
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph, ...(ex.negative ? { negative: true } : {}) });
  }
  return out;
}
