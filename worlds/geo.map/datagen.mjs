// Generator of training examples for geo.map (spec 08). Browser-safe, imports nothing.
// Place names, keys and facts come from the world's own knowledge base (`context.kb`) and lexicons (`context.lexicons`);
// small embedded lists are the fallback. The expected circuit of every text is known independently of the formalizer:
// one core.request with the action and arguments the matching pattern family emits.
export const version = '2';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const q = (s) => JSON.stringify(String(s));
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const usable = (n) => /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(fold(n)) && fold(n).split(' ').length <= 3 && !/'s\b/.test(n);
/** Expected circuit: one core.request with arguments in the given order (undefined values are left out). */
const E = (action, args = {}) => `@x1 core.request action=${action}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` arg.${k}=${v}`).join('')}`;

const FALLBACK = {
  country: [['France', 'france'], ['Japan', 'japan'], ['Brazil', 'brazil'], ['Canada', 'canada'], ['Hungary', 'hungary'], ['Peru', 'peru'], ['Egypt', 'egypt'], ['Spain', 'spain'], ['Italy', 'italy']],
  city: [['Paris', 'paris'], ['Rome', 'rome'], ['Tokyo', 'tokyo'], ['Cluj-Napoca', 'cluj-napoca'], ['Bucharest', 'bucharest'], ['Berlin', 'berlin'], ['Madrid', 'madrid']],
  region: [['Europe', 'europe'], ['Africa', 'africa'], ['Asia', 'asia'], ['South America', 'south_america']],
};

function mk(context) {
  const out = { country: [], city: [], region: [] };
  for (const w of context?.kb ?? []) {
    const kind = w.type === 'geo.map.country' ? 'country' : w.type === 'geo.map.city' ? 'city' : w.type === 'geo.map.region' ? 'region' : null;
    if (!kind || !w.name?.[0] || !w.key?.[0]) continue;
    if (kind === 'country' && w.ind?.[0] !== 'true') continue;
    if (kind === 'region' && !['continent', 'subregion'].includes(w.kind?.[0])) continue;
    const name = w.name[0];
    if (!usable(name) || (kind === 'city' && Number(w.pop?.[0] ?? 0) < 1e6)) continue;
    // the lexicon key is what the formalizer emits; a name whose key differs from its lemma form is skipped
    const key = w.key.find((k) => k === fold(name).toLowerCase().replace(/ /g, '_')) ?? (w.key[0] === fold(name).toLowerCase().replace(/ /g, '_') ? w.key[0] : null);
    if (key) out[kind].push([fold(name), key]);
  }
  for (const k of Object.keys(out)) if (out[k].length < 5) out[k] = FALLBACK[k];
  return out;
}
const the = (n) => (/^(United States|United Kingdom|Netherlands|Philippines|Bahamas|Gambia|United Arab Emirates|Czech Republic|Central African Republic|Dominican Republic)$/.test(n) ? `the ${n}` : n);

export function generate({ rng: r, count = 300, context } = {}) {
  const P = mk(context);
  const any = () => pick(r, [...P.country, ...P.city, ...P.city, ...P.region]);
  const ctry = () => pick(r, P.country);
  const city = () => pick(r, P.city);
  const region = () => pick(r, P.region);
  const two = (src) => { const a = src(); let b = src(); for (let i = 0; i < 20 && b[1] === a[1]; i++) b = src(); return b[1] === a[1] ? null : [a, b]; };
  const T = [
    { group: 'geo.show', ph: 'request', make: () => { const [n, k] = any(); return { text: pick(r, [`Show me ${n}.`, `Take me to ${n}.`, `Fly to ${n}.`, `Go to ${n}.`, `Zoom to ${n}.`, `Can you show me ${n}?`, `Center on ${n}.`, `Find ${n}.`]), expect: E('geo.show', { a: k }) }; } },
    { group: 'geo.show.multi', ph: 'multi-entity', make: () => { const p = two(any); return p && { text: pick(r, [`Show ${p[0][0]} and ${p[1][0]}.`, `Fly to ${p[0][0]} and ${p[1][0]}.`]), expect: E('geo.show', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.show.bare', ph: 'ellipsis', make: () => { const [n, k] = any(); return { text: `${n}.`, expect: E('geo.show', { a: k }) }; } },
    { group: 'geo.where', ph: 'question', make: () => { const [n, k] = any(); return { text: pick(r, [`Where is ${n}?`, `Where's ${n}?`, `Can you tell me where ${n} is?`.replace(/where (.+) is\?/, 'where is $1?')]), expect: E('geo.where', { p: k }) }; } },
    { group: 'geo.zoom', ph: 'request', make: () => pick(r, [
      { text: 'Zoom in.', expect: E('geo.zoom', { dir: 'in' }) }, { text: 'Zoom out.', expect: E('geo.zoom', { dir: 'out' }) },
      { text: 'Zoom in a lot.', expect: E('geo.zoom', { dir: 'in', amt: 'a_lot' }) }, { text: 'Zoom out a bit.', expect: E('geo.zoom', { dir: 'out', amt: 'a_bit' }) },
      { text: 'Zoom in a little.', expect: E('geo.zoom', { dir: 'in', amt: 'a_little' }) }, { text: 'Zoom out a lot.', expect: E('geo.zoom', { dir: 'out', amt: 'a_lot' }) },
    ]) },
    { group: 'geo.zoomTo', ph: 'request', make: () => { const n = 2 + Math.floor(r() * 12); return { text: pick(r, [`Zoom to level ${n}.`, `Set the zoom to ${n}.`]), expect: E('geo.zoomTo', { n }) }; } },
    { group: 'geo.pan', ph: 'request', make: () => { const d = pick(r, ['north', 'south', 'east', 'west']); return { text: pick(r, [`Go ${d}.`, `Move ${d}.`, `Pan ${d}.`, `Head to the ${d}.`]), expect: E('geo.pan', { d }) }; } },
    { group: 'geo.world', ph: 'request', make: () => ({ text: pick(r, ['Show the whole world.', 'Zoom out to the entire world.', 'Show me the full globe.']), expect: E('geo.world') }) },
    { group: 'geo.mark', ph: 'request', make: () => { const [n, k] = any(); return { text: pick(r, [`Put a marker on ${n}.`, `Mark ${n}.`, `Drop a pin on ${n}.`, `Add a marker for ${n}.`]), expect: E('geo.mark', { a: k }) }; } },
    { group: 'geo.mark.multi', ph: 'multi-entity', make: () => { const p = two(city); return p && { text: `Mark ${p[0][0]} and ${p[1][0]}.`, expect: E('geo.mark', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.markSet', ph: 'request', make: () => { const [n, k] = region(); return { text: pick(r, [`Mark the capitals of ${n}.`, `Put markers on all the capitals in ${n}.`]), expect: E('geo.markSet', { what: 'capitals', r: k }) }; } },
    { group: 'geo.clearMarkers', ph: 'request', make: () => pick(r, [{ text: 'Remove the markers.', expect: E('geo.clearMarkers') }, { text: 'Delete all markers.', expect: E('geo.clearMarkers') }, { text: 'Remove the last marker.', expect: E('geo.clearMarkers', { last: 'true' }) }]) },
    { group: 'geo.clearMarkers.one', ph: 'request', make: () => { const [n, k] = city(); return { text: `Remove the marker on ${n}.`, expect: E('geo.clearMarkers', { p: k }) }; } },
    { group: 'geo.highlight', ph: 'request', make: () => { const [n, k] = pick(r, [ctry, region])(); return { text: pick(r, [`Highlight ${n}.`, `Colour ${n}.`]), expect: E('geo.highlight', { a: k }) }; } },
    { group: 'geo.highlight.nb', ph: 'request', make: () => { const [n, k] = ctry(); return { text: `Highlight ${n} and its neighbours.`, expect: E('geo.highlight', { a: k, nb: 'true' }) }; } },
    { group: 'geo.clearHighlight', ph: 'request', make: () => ({ text: pick(r, ['Remove the highlights.', 'Clear the highlighting.']), expect: E('geo.clearHighlight') }) },
    { group: 'geo.layer', ph: 'request', make: () => pick(r, [{ text: 'Switch to the street map.', expect: E('geo.layer', { l: 'street' }) }, { text: 'Use the simple map.', expect: E('geo.layer', { l: 'simple' }) }, { text: 'Go back to the offline map.', expect: E('geo.layer', { l: 'offline' }) }]) },
    { group: 'geo.capital', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`What is the capital of ${n}?`, `What's the capital of ${n}?`, `Tell me the capital of ${n}.`]), expect: E('geo.capital', { c: k }) }; } },
    { group: 'geo.isCapital', ph: 'question', make: () => { const c = city(), k = ctry(); return { text: `Is ${c[0]} the capital of ${k[0]}?`, expect: E('geo.isCapital', { a: c[1], b: k[1] }) }; } },
    { group: 'geo.population', ph: 'question', make: () => { const [n, k] = any(); return { text: pick(r, [`How many people live in ${n}?`, `What is the population of ${n}?`, `How many inhabitants does ${n} have?`]), expect: E('geo.population', { p: k }) }; } },
    { group: 'geo.area', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`How big is ${n}?`, `What is the area of ${n}?`]), expect: E('geo.area', { p: k }) }; } },
    { group: 'geo.compare', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: `Which is bigger, ${p[0][0]} or ${p[1][0]}?`, expect: E('geo.compare', { a: p[0][1], b: p[1][1], m: 'bigger' }) }; } },
    { group: 'geo.compare.yn', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: `Is ${p[0][0]} bigger than ${p[1][0]}?`, expect: E('geo.compareYN', { a: p[0][1], b: p[1][1], m: 'bigger' }) }; } },
    { group: 'geo.borders', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`Which countries border ${n}?`, `What are the neighbours of ${n}?`, `Who borders ${n}?`]), expect: E('geo.borders', { p: k }) }; } },
    { group: 'geo.borderYN', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: `Does ${p[0][0]} border ${p[1][0]}?`, expect: E('geo.borderYN', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.continent', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`What continent is ${n} in?`, `Which continent does ${n} belong to?`]), expect: E('geo.continent', { p: k }) }; } },
    { group: 'geo.isIn', ph: 'question', make: () => { const a = ctry(), b = region(); return { text: `Is ${a[0]} in ${b[0]}?`, expect: E('geo.isIn', { p: a[1], q: b[1] }) }; } },
    { group: 'geo.country', ph: 'question', make: () => { const [n, k] = city(); return { text: `Which country is ${n} in?`, expect: E('geo.country', { p: k }) }; } },
    { group: 'geo.list', ph: 'question', make: () => { const [n, k] = region(); return { text: pick(r, [`List the countries in ${n}.`, `Which countries are in ${n}?`]), expect: E('geo.listOp', { k: 'countries', p: k }) }; } },
    { group: 'geo.count', ph: 'question', make: () => { const [n, k] = region(); return { text: `How many countries are in ${n}?`, expect: E('geo.count', { k: 'countries', p: k }) }; } },
    { group: 'geo.superlative', ph: 'question', make: () => { const [n, k] = ctry(); const m = pick(r, ['largest', 'biggest', 'smallest']); return { text: `Which is the ${m} city in ${n}?`, expect: E('geo.superlative', { m, k: 'city', p: k }) }; } },
    { group: 'geo.currency', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`What currency does ${n} use?`, `What is the currency of ${n}?`]), expect: E('geo.currency', { p: k }) }; } },
    { group: 'geo.languages', ph: 'question', make: () => { const [n, k] = ctry(); return { text: pick(r, [`What languages are spoken in ${n}?`, `What is the official language of ${n}?`]), expect: E('geo.languages', { p: k }) }; } },
    { group: 'geo.info', ph: 'question', make: () => { const [n, k] = any(); return { text: pick(r, [`Tell me about ${n}.`, `What do you know about ${n}?`]), expect: E('geo.info', { p: k }) }; } },
    { group: 'geo.distance', ph: 'multi-entity', make: () => { const p = two(city); return p && { text: pick(r, [`How far is ${p[0][0]} from ${p[1][0]}?`, `What is the distance between ${p[0][0]} and ${p[1][0]}?`, `Draw a line from ${p[0][0]} to ${p[1][0]}.`]), expect: E('geo.distance', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.locate', ph: 'request', make: () => ({ text: pick(r, ['Where am I?', 'Locate me.']), expect: E('geo.locate') }) },
    // ---- R2 wide families: chat style, fillers, word orders, synonyms (patterns pat.geo.map.w.*) ----
    { group: 'geo.show.wide', ph: 'chat-style', make: () => { const [n, k] = any(); return { text: pick(r, [`Pull up ${n} for me.`, `Lemme see ${n}.`, `I wanna see ${n}.`, `${n} on the map pls.`, `Zoom me over to ${n}.`, `Uh show me ${n} lol.`, `Hey could you bring up ${n}?`]), expect: E('geo.show', { a: k }) }; } },
    { group: 'geo.where.wide', ph: 'question', make: () => { const [n, k] = any(); return { text: pick(r, [`Do you know where ${n} is?`, `${n} location?`, `Where can I find ${n}?`, `I need to know where ${n} is on the map.`, `Could you tell me where ${n} is situated?`, `Yo where is ${n}.`]), expect: E('geo.where', { p: k }) }; } },
    { group: 'geo.zoom.wide', ph: 'chat-style', make: () => pick(r, [
      { text: 'Zoom in a whole lot.', expect: E('geo.zoom', { dir: 'in', amt: 'a_whole_lot' }) }, { text: 'Get closer.', expect: E('geo.zoom', { dir: 'in' }) },
      { text: 'Pull back a bit.', expect: E('geo.zoom', { dir: 'out', amt: 'a_bit' }) }, { text: 'Zoom in 3 clicks.', expect: E('geo.zoom', { dir: 'in', n: 3 }) },
      { text: 'Can you zoom out a lot please?', expect: E('geo.zoom', { dir: 'out', amt: 'a_lot' }) },
    ]) },
    { group: 'geo.zoomTo.wide', ph: 'chat-style', make: () => { const n = 2 + Math.floor(r() * 12); return { text: pick(r, [`Set zoom level ${n}.`, `Zoom lvl ${n}.`, `Level ${n} zoom pls.`, `Go to zoom ${n}.`, `Change the zoom to ${n}.`]), expect: E('geo.zoomTo', { n }) }; } },
    { group: 'geo.pan.wide', ph: 'chat-style', make: () => { const d = pick(r, ['north', 'south', 'east', 'west']); return pick(r, [{ text: `Slide the view ${d}.`, expect: E('geo.pan', { d }) }, { text: `Head ${d} for a bit.`, expect: E('geo.pan', { d }) }, { text: `Map ${d}.`, expect: E('geo.pan', { d }) }, { text: `${d.charAt(0).toUpperCase() + d.slice(1)} a little.`, expect: E('geo.pan', { d, amt2: 'a_little' }) }, { text: `Go up ${d} a bit.`, expect: E('geo.pan', { d, amt2: 'a_bit' }) }]); } },
    { group: 'geo.mark.wide', ph: 'chat-style', make: () => { const [n, k] = any(); return { text: pick(r, [`Marker on ${n} please.`, `${n} marker.`, `Pin ${n}.`, `Put ${n} on the map with a marker.`]), expect: E('geo.mark', { a: k }) }; } },
    { group: 'geo.markSet.wide', ph: 'word-order', make: () => { const [n, k] = region(); return { text: pick(r, [`Pin every capital in ${n}.`, `I want the capitals of ${n} marked.`, `Show the capital cities of ${n} with pins.`]), expect: E('geo.markSet', { what: 'capitals', r: k }) }; } },
    { group: 'geo.clearMarkers.wide', ph: 'synonym', make: () => pick(r, [{ text: 'Remove the most recent pin.', expect: E('geo.clearMarkers', { last: 'true' }) }, { text: 'Take the last pin away.', expect: E('geo.clearMarkers', { last: 'true' }) }, { text: 'Take all the pins off the map.', expect: E('geo.clearMarkers') }]) },
    { group: 'geo.highlight.wide', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: pick(r, [`Make ${p[0][0]} and ${p[1][0]} stand out.`, `${p[0][0]} and ${p[1][0]} highlighted.`, `Show ${p[0][0]} and ${p[1][0]} in color.`]), expect: E('geo.highlight', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.clearHighlight.wide', ph: 'synonym', make: () => ({ text: pick(r, ['Get rid of the coloured countries.', 'Take the highlights off.', 'Turn off all the highlighting on the map.']), expect: E('geo.clearHighlight') }) },
    { group: 'geo.capital.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`Capital of ${n}?`, `Whats the capital of ${n}?`, `Can u tell me the capital of ${n}?`, `${n} capital city?`]), expect: E('geo.capital', { c: k }) }; } },
    { group: 'geo.population.wide', ph: 'chat-style', make: () => { const [n, k] = any(); return { text: pick(r, [`How many ppl live in ${n}?`, `${n} population?`, `${n} has how many people?`, `Roughly how many people are in ${n}?`]), expect: E('geo.population', { p: k }) }; } },
    { group: 'geo.area.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} size?`, `How much land does ${n} cover?`, `How large is ${n} in size?`]), expect: E('geo.area', { p: k }) }; } },
    { group: 'geo.compare.wide', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: pick(r, [`${p[0][0]} vs ${p[1][0]}.`, `Compare ${p[0][0]} and ${p[1][0]}.`, `${p[0][0]} ${p[1][0]} comparison.`, `How do ${p[0][0]} and ${p[1][0]} stack up?`]), expect: E('geo.compare', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.compare.or', ph: 'multi-entity', make: () => { const p = two(ctry); const m = pick(r, ['bigger', 'larger', 'smaller']); return p && { text: pick(r, [`${p[0][0]} or ${p[1][0]}, which is ${m}?`, `Is ${p[0][0]} or ${p[1][0]} ${m}?`]), expect: E('geo.compare', { a: p[0][1], b: p[1][1], m }) }; } },
    { group: 'geo.borders.wide', ph: 'synonym', make: () => { const [n, k] = ctry(); return { text: pick(r, [`What borders ${n}?`, `Countries next to ${n}?`, `List countries touching ${n}.`, `${n} neighbours.`]), expect: E('geo.borders', { p: k }) }; } },
    { group: 'geo.neighbourCount.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`How many countries border ${n}?`, `${n} neighbour count.`, `Count the neighbours of ${n}.`, `${n} borders how many?`]), expect: E('geo.neighbourCount', { p: k }) }; } },
    { group: 'geo.borderYN.wide', ph: 'multi-entity', make: () => { const p = two(ctry); return p && { text: pick(r, [`Do ${p[0][0]} and ${p[1][0]} touch?`, `${p[0][0]} and ${p[1][0]} share a border?`, `Is ${p[0][0]} next door to ${p[1][0]}?`]), expect: E('geo.borderYN', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.landlocked.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} landlocked?`, `Does ${n} touch the sea?`, `${n} no coast?`, `${n} landlocked or not?`]), expect: E('geo.landlocked', { p: k }) }; } },
    { group: 'geo.continent.wide', ph: 'word-order', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} continent?`, `Which continent has ${n}?`, `${n} is in which continent?`, `Continent of ${n}?`]), expect: E('geo.continent', { p: k }) }; } },
    { group: 'geo.country.wide', ph: 'word-order', make: () => { const [n, k] = city(); return { text: pick(r, [`${n} country?`, `${n} is in what country?`, `Country of ${n}?`]), expect: E('geo.country', { p: k }) }; } },
    { group: 'geo.currency.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} currency?`, `What do they pay with in ${n}?`]), expect: E('geo.currency', { p: k }) }; } },
    { group: 'geo.languages.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} language?`, `What do people speak in ${n}?`]), expect: E('geo.languages', { p: k }) }; } },
    { group: 'geo.info.wide', ph: 'chat-style', make: () => { const [n, k] = ctry(); return { text: pick(r, [`${n} facts pls.`, `Give me info about ${n}.`, `${n} overview.`, `Brief me on ${n}.`]), expect: E('geo.info', { p: k }) }; } },
    { group: 'geo.distance.wide', ph: 'multi-entity', make: () => { const p = two(city); return p && { text: pick(r, [`${p[0][0]} to ${p[1][0]} distance.`, `Km between ${p[0][0]} and ${p[1][0]}?`, `How far apart r ${p[0][0]} and ${p[1][0]}?`, `Can you tell me how far ${p[0][0]} is from ${p[1][0]}?`]), expect: E('geo.distance', { a: p[0][1], b: p[1][1] }) }; } },
    { group: 'geo.locate.wide', ph: 'chat-style', make: () => ({ text: pick(r, ['Where r we?', 'My location please.', 'Can u find where i am?', 'Where am I on the map?']), expect: E('geo.locate') }) },
    { group: 'geo.here.wide', ph: 'chat-style', make: () => ({ text: pick(r, ['Whats here?', "What's at this spot?", 'What am I looking at right now?']), expect: E('geo.here') }) },
    { group: 'geo.markers.wide', ph: 'state', make: () => ({ text: pick(r, ['How many markers r there?', 'Markers count pls.', 'Count the pins on the map.']), expect: E('geo.markers') }) },
    { group: 'geo.highlights.wide', ph: 'state', make: () => ({ text: pick(r, ['Which ones are lit up on the map?', 'What is highlighted right now?', 'List the highlighted countries.']), expect: E('geo.highlights') }) },
    // negatives: sentences of other worlds that must not become map requests
    { group: 'geo.neg', ph: 'out-of-domain', make: () => ({ text: pick(r, ['Tom has 5 apples.', 'How many legs does a spider have?', 'Make your body blue.', 'Play the center.', 'Add a heading Shopping.', 'How many apples does Tom have?', 'Hello!', 'Open the editor.', 'What is your name?']), negative: true }) },
  ];
  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    const t = T[tries % T.length];
    const ex = t.make();
    if (!ex) continue;
    const text = !ex.negative && chance(r, 0.2) ? pick(r, ['Please ', 'Okay, ', 'Well, ']).concat(ex.text.charAt(0).toLowerCase() + ex.text.slice(1)) : ex.text;
    if (seen.has(text)) continue;
    seen.add(text);
    const rec = { text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph };
    if (ex.negative) rec.negative = true;
    out.push(rec);
  }
  return out;
}
