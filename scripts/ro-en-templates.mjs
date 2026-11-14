// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Hand-curated Romanian <-> English templates for the app's frequent request and question shapes (training/eval/ro-en-meaning, source `template`).
 * The Romanian is written by hand, with the morphology done by the small tables below (gender, plural, definite article, genitive, agreement of the
 * colour, number + noun), NOT by the repository's translators. Romanian words appear here only as DATA of the parallel corpus (AGENTS.md language rule).
 *
 *   import { templateRows } from './ro-en-templates.mjs';   // [{ family, tab, en, ro }]
 */

// ---- tables -------------------------------------------------------------------------------------------------------------------------------
// noun: [en, indef sg, def sg, gender, indef pl, def pl, genitive def sg]
const N = [
  ['house', 'o casă', 'casa', 'f', 'case', 'casele', 'casei'],
  ['tree', 'un copac', 'copacul', 'm', 'copaci', 'copacii', 'copacului'],
  ['cloud', 'un nor', 'norul', 'm', 'nori', 'norii', 'norului'],
  ['sun', 'un soare', 'soarele', 'm', 'sori', 'sorii', 'soarelui'],
  ['lake', 'un lac', 'lacul', 'm', 'lacuri', 'lacurile', 'lacului'],
  ['fish', 'un pește', 'peștele', 'm', 'pești', 'peștii', 'peștelui'],
  ['car', 'o mașină', 'mașina', 'f', 'mașini', 'mașinile', 'mașinii'],
  ['flower', 'o floare', 'floarea', 'f', 'flori', 'florile', 'florii'],
  ['duck', 'o rață', 'rața', 'f', 'rațe', 'rațele', 'rațe i'],
  ['cow', 'o vacă', 'vaca', 'f', 'vaci', 'vacile', 'vacii'],
  ['dog', 'un câine', 'câinele', 'm', 'câini', 'câinii', 'câinelui'],
  ['cat', 'o pisică', 'pisica', 'f', 'pisici', 'pisicile', 'pisicii'],
  ['boat', 'o barcă', 'barca', 'f', 'bărci', 'bărcile', 'bărcii'],
  ['ball', 'o minge', 'mingea', 'f', 'mingi', 'mingile', 'mingii'],
  ['circle', 'un cerc', 'cercul', 'm', 'cercuri', 'cercurile', 'cercului'],
  ['square', 'un pătrat', 'pătratul', 'm', 'pătrate', 'pătratele', 'pătratului'],
  ['triangle', 'un triunghi', 'triunghiul', 'm', 'triunghiuri', 'triunghiurile', 'triunghiului'],
  ['star', 'o stea', 'steaua', 'f', 'stele', 'stelele', 'stelei'],
  ['horse', 'un cal', 'calul', 'm', 'cai', 'caii', 'calului'],
  ['bird', 'o pasăre', 'pasărea', 'f', 'păsări', 'păsările', 'păsării'],
  ['table', 'o masă', 'masa', 'f', 'mese', 'mesele', 'mesei'],
  ['bridge', 'un pod', 'podul', 'm', 'poduri', 'podurile', 'podului'],
  ['tent', 'un cort', 'cortul', 'm', 'corturi', 'corturile', 'cortului'],
  ['train', 'un tren', 'trenul', 'm', 'trenuri', 'trenurile', 'trenului'],
];
N[8][6] = 'rației';
const NOUN = Object.fromEntries(N.map((r) => [r[0], { en: r[0], ind: r[1], def: r[2], g: r[3], pl: r[4], defpl: r[5], gen: r[6] }]));
const SCENE = ['house', 'tree', 'cloud', 'lake', 'fish', 'car', 'flower', 'duck', 'cow', 'dog', 'cat', 'boat', 'ball', 'circle', 'square', 'triangle', 'star', 'horse', 'bird', 'sun'];
const PLACEABLE = ['house', 'tree', 'lake', 'car', 'flower', 'boat', 'table', 'bridge'];
// colour: [en, masculine, feminine, plural masc, plural fem]
const C = [
  ['red', 'roșu', 'roșie', 'roșii', 'roșii'], ['blue', 'albastru', 'albastră', 'albaștri', 'albastre'], ['green', 'verde', 'verde', 'verzi', 'verzi'],
  ['yellow', 'galben', 'galbenă', 'galbeni', 'galbene'], ['black', 'negru', 'neagră', 'negri', 'negre'], ['white', 'alb', 'albă', 'albi', 'albe'],
  ['pink', 'roz', 'roz', 'roz', 'roz'], ['orange', 'portocaliu', 'portocalie', 'portocalii', 'portocalii'], ['purple', 'violet', 'violetă', 'violeți', 'violete'],
  ['brown', 'maro', 'maro', 'maro', 'maro'],
];
const COL = Object.fromEntries(C.map((r) => [r[0], { en: r[0], m: r[1], f: r[2], pm: r[3], pf: r[4] }]));
const COLOURS = C.map((r) => r[0]);
const colAgree = (c, g, pl = false) => (pl ? (g === 'f' ? COL[c].pf : COL[c].pm) : (g === 'f' ? COL[c].f : COL[c].m));
// definite colour NOUN forms used in "mix" questions (the colour as a mass noun: roșul, galbenul...)
const COLN = { red: ['roșu', 'roșul'], blue: ['albastru', 'albastrul'], yellow: ['galben', 'galbenul'], green: ['verde', 'verdele'], white: ['alb', 'albul'], black: ['negru', 'negrul'] };
const NUMW = { 2: ['doi', 'două'], 3: ['trei', 'trei'], 4: ['patru', 'patru'], 5: ['cinci', 'cinci'], 6: ['șase', 'șase'], 7: ['șapte', 'șapte'], 8: ['opt', 'opt'], 9: ['nouă', 'nouă'] };
const numWord = (n, g) => NUMW[n][g === 'f' ? 1 : 0];
const EN_NUM = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };

// relations: [en, ro preposition (with case note), needs genitive of definite noun]
const REL = [['next to', 'lângă', false], ['behind', 'în spatele', true], ['in front of', 'în fața', true], ['above', 'deasupra', true], ['under', 'sub', false], ['near', 'lângă', false]];
const placeRo = (rel, n) => (rel[2] ? `${rel[1]} ${NOUN[n].gen}` : `${rel[1]} ${NOUN[n].ind}`);
const placeEn = (rel, n) => `${rel[0]} a ${n}`;
const placeRoDef = (rel, n) => (rel[2] ? `${rel[1]} ${NOUN[n].gen}` : `${rel[1]} ${NOUN[n].def}`);
const DIRS = [['left', 'la stânga'], ['right', 'la dreapta'], ['up', 'sus'], ['down', 'jos']];

const COUNTRY = [['France', 'Franța', 'Franței'], ['Spain', 'Spania', 'Spaniei'], ['Italy', 'Italia', 'Italiei'], ['Germany', 'Germania', 'Germaniei'], ['Japan', 'Japonia', 'Japoniei'],
  ['Egypt', 'Egiptul', 'Egiptului'], ['Greece', 'Grecia', 'Greciei'], ['Portugal', 'Portugalia', 'Portugaliei'], ['Poland', 'Polonia', 'Poloniei'], ['Canada', 'Canada', 'Canadei'],
  ['Brazil', 'Brazilia', 'Braziliei'], ['India', 'India', 'Indiei'], ['Norway', 'Norvegia', 'Norvegiei'], ['Sweden', 'Suedia', 'Suediei'], ['Austria', 'Austria', 'Austriei'],
  ['Turkey', 'Turcia', 'Turciei'], ['Ireland', 'Irlanda', 'Irlandei'], ['Mexico', 'Mexicul', 'Mexicului'], ['China', 'China', 'Chinei'], ['Romania', 'România', 'României']];
const DAYS = [['Monday', 'luni'], ['Tuesday', 'marți'], ['Wednesday', 'miercuri'], ['Thursday', 'joi'], ['Friday', 'vineri'], ['Saturday', 'sâmbătă'], ['Sunday', 'duminică']];
const MONTHS = [['January', 'ianuarie'], ['February', 'februarie'], ['March', 'martie'], ['April', 'aprilie'], ['May', 'mai'], ['June', 'iunie'], ['July', 'iulie'], ['August', 'august'],
  ['September', 'septembrie'], ['October', 'octombrie'], ['November', 'noiembrie'], ['December', 'decembrie']];
const ANIMALS = [['cow', 'o vacă', 'vacă'], ['dog', 'un câine', 'câine'], ['cat', 'o pisică', 'pisică'], ['duck', 'o rață', 'rață'], ['horse', 'un cal', 'cal'], ['sheep', 'o oaie', 'oaie'],
  ['pig', 'un porc', 'porc'], ['frog', 'o broască', 'broască'], ['lion', 'un leu', 'leu'], ['owl', 'o bufniță', 'bufniță']];
const LEGGY = [['spider', 'un păianjen'], ['dog', 'un câine'], ['cat', 'o pisică'], ['horse', 'un cal'], ['ant', 'o furnică'], ['bird', 'o pasăre'], ['cow', 'o vacă'], ['bee', 'o albină'], ['frog', 'o broască']];
const SHAPES = [['triangle', 'un triunghi'], ['square', 'un pătrat'], ['hexagon', 'un hexagon'], ['pentagon', 'un pentagon'], ['rectangle', 'un dreptunghi']];
const NAMES = [['Ana', 'Anei'], ['Tom', 'lui Tom'], ['Leo', 'lui Leo'], ['Maria', 'Mariei'], ['Ben', 'lui Ben'], ['Zoe', 'lui Zoe'], ['Ema', 'Emei'], ['Dan', 'lui Dan']];
// items: [en singular, en plural, ro singular, ro plural, gender of the numeral/quantifier]
const ITEMS = [['pencil', 'pencils', 'creion', 'creioane', 'n'], ['apple', 'apples', 'măr', 'mere', 'n'], ['pear', 'pears', 'pară', 'pere', 'f'], ['marble', 'marbles', 'bilă', 'bile', 'f'],
  ['sticker', 'stickers', 'abțibild', 'abțibilduri', 'n'], ['cookie', 'cookies', 'biscuit', 'biscuiți', 'm'], ['balloon', 'balloons', 'balon', 'baloane', 'n'], ['candy', 'candies', 'bomboană', 'bomboane', 'f']];
const itemNum = (n, it) => (n === 1 ? `1 ${it[2]}` : `${n} ${it[3]}`);
const itemEn = (n, it) => (n === 1 ? `1 ${it[0]}` : `${n} ${it[1]}`);

// ---- a seeded generator ---------------------------------------------------------------------------------------------------------------------
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const pickOf = (rng) => (a) => a[Math.floor(rng() * a.length)];

export function templateRows(seed = 20261114) {
  const rng = rngOf(seed), pick = pickOf(rng);
  const rows = [], seen = new Set();
  const add = (family, tab, en, ro) => { const k = family + '|' + en + '|' + ro; if (seen.has(k)) return false; seen.add(k); rows.push({ family, tab, en, ro }); return true; };
  const many = (family, count, f) => { let tries = 0, made = 0; while (made < count && tries++ < count * 30) { const r = f(); if (r && add(family, r[0], r[1], r[2])) made++; } };

  // ---- drawing --------------------------------------------------------------------------------------------------------------------------
  many('draw.make', 70, () => { const n = NOUN[pick(SCENE)]; const v = pick([['draw', 'desenează'], ['make', 'fă'], ['add', 'adaugă'], ['put', 'pune']]);
    return ['draw', `${v[0]} a ${n.en}`, `${v[1]} ${n.ind}`]; });
  many('draw.make.colour', 90, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS); const v = pick([['draw', 'desenează'], ['make', 'fă'], ['draw', 'desenează-mi']]);
    return ['draw', `${v[0]} a ${c} ${n.en}`, `${v[1]} ${n.ind} ${colAgree(c, n.g)}`]; });
  many('draw.make.number', 50, () => { const n = NOUN[pick(SCENE)], k = 2 + Math.floor(rng() * 4);
    return ['draw', `draw ${EN_NUM[k]} ${n.en}s`.replace(/ys$/, 'ies').replace(/fishs$/, 'fish').replace(/sss$/, 'ss'), `desenează ${numWord(k, n.g)} ${n.pl}`]; });
  many('draw.make.number.colour', 40, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS), k = 2 + Math.floor(rng() * 4);
    return ['draw', `draw ${k} ${c} ${n.en}s`.replace(/fishs$/, 'fish').replace(/ys$/, 'ies'), `desenează ${k} ${n.pl} ${colAgree(c, n.g, true)}`]; });
  many('draw.make.place', 90, () => { const n = NOUN[pick(SCENE)], p = pick(PLACEABLE), r = pick(REL); if (n.en === p) return null;
    return ['draw', `draw a ${n.en} ${placeEn(r, p)}`, `desenează ${n.ind} ${placeRo(r, p)}`]; });
  many('draw.make.colour.place', 60, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS), p = pick(PLACEABLE), r = pick(REL); if (n.en === p) return null;
    return ['draw', `draw a ${c} ${n.en} ${placeEn(r, p)}`, `desenează ${n.ind} ${colAgree(c, n.g)} ${placeRo(r, p)}`]; });
  many('draw.two.things', 40, () => { const a = NOUN[pick(SCENE)], b = NOUN[pick(SCENE)]; if (a === b) return null;
    return ['draw', `draw a ${a.en} and a ${b.en}`, `desenează ${a.ind} și ${b.ind}`]; });
  many('draw.change.colour', 90, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS); const v = pick([['make', 'fă'], ['paint', 'vopsește'], ['colour', 'colorează']]);
    return ['draw', `${v[0]} the ${n.en} ${c}`, `${v[1]} ${n.def} ${colAgree(c, n.g)}`]; });
  many('draw.change.colour.pl', 30, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS);
    return ['draw', `make the ${n.en}s ${c}`.replace(/fishs/, 'fish').replace(/ys /, 'ies '), `fă ${n.defpl} ${colAgree(c, n.g, true)}`]; });
  many('draw.move.dir', 70, () => { const n = NOUN[pick(SCENE)], d = pick(DIRS); const mv = pick(['move', 'move']);
    return ['draw', `${mv} the ${n.en} to the ${d[0]}`.replace('to the up', 'up').replace('to the down', 'down'), `mută ${n.def} ${d[1]}`]; });
  many('draw.move.more', 40, () => { const n = NOUN[pick(SCENE)], d = pick([['higher', 'mai sus'], ['lower', 'mai jos']]);
    return ['draw', `move the ${n.en} ${d[0]}`, `mută ${n.def} ${d[1]}`]; });
  many('draw.move.place', 80, () => { const n = NOUN[pick(SCENE)], p = pick(PLACEABLE), r = pick(REL); if (n.en === p) return null;
    return ['draw', `move the ${n.en} ${r[0]} the ${p}`, `mută ${n.def} ${placeRoDef(r, p)}`]; });
  many('draw.remove', 60, () => { const n = NOUN[pick(SCENE)]; const v = pick([['delete', 'șterge'], ['remove', 'elimină'], ['erase', 'șterge']]);
    return ['draw', `${v[0]} the ${n.en}`, `${v[1]} ${n.def}`]; });
  many('draw.polite', 50, () => { const n = NOUN[pick(SCENE)], c = pick(COLOURS);
    const f = pick([[`can you draw a ${c} ${n.en}`, `poți să desenezi ${n.ind} ${colAgree(c, n.g)}`], [`please draw a ${n.en}`, `desenează ${n.ind}, te rog`],
      [`I want a ${c} ${n.en}`, `vreau ${n.ind} ${colAgree(c, n.g)}`], [`could you draw a ${n.en} for me`, `ai putea să-mi desenezi ${n.ind}`]]);
    return ['draw', f[0], f[1]]; });
  many('draw.size', 30, () => { const n = NOUN[pick(SCENE)], d = pick([['bigger', 'mai mare'], ['smaller', 'mai mic']]);
    return ['draw', `make the ${n.en} ${d[0]}`, `fă ${n.def} ${n.g === 'f' ? d[1] : d[1]}`]; });

  // ---- avatar ---------------------------------------------------------------------------------------------------------------------------
  many('avatar.colour', 25, () => { const c = pick(COLOURS), p = pick([['body', 'corpul', 'm'], ['eyes', 'ochii', 'm'], ['hair', 'părul', 'm'], ['mouth', 'gura', 'f'], ['nose', 'nasul', 'm']]);
    return ['robot', `make your ${p[0]} ${c}`, `fă-ți ${p[1]} ${colAgree(c, p[2] === 'f' ? 'f' : 'm', p[0] === 'eyes')}`]; });
  many('avatar.wear', 12, () => { const w = pick([['a hat', 'o pălărie'], ['glasses', 'ochelari'], ['a scarf', 'o eșarfă']]);
    return ['robot', `wear ${w[0]}`, `poartă ${w[1]}`]; });
  many('avatar.mood', 8, () => { const m = pick([['happy', 'vesel'], ['sad', 'trist'], ['angry', 'supărat'], ['sleepy', 'somnoros'], ['surprised', 'surprins']]);
    return ['robot', `be ${m[0]}`, `fii ${m[1]}`]; });
  add('avatar.ask', 'robot', 'what colour is your body', 'ce culoare are corpul tău');
  add('avatar.ask', 'robot', 'what colour are your eyes', 'ce culoare au ochii tăi');

  // ---- questions of the kids worlds -----------------------------------------------------------------------------------------------------
  many('geo.capital', 60, () => { const c = pick(COUNTRY);
    const f = pick([[`What is the capital of ${c[0]}?`, `Care este capitala ${c[2]}?`], [`what is the capital of ${c[0]}`, `care e capitala ${c[2]}`], [`Tell me the capital of ${c[0]}`, `Spune-mi capitala ${c[2]}.`],
      [`capital of ${c[0]}`, `capitala ${c[2]}`], [`What's the capital of ${c[0]}?`, `Ce capitală are ${c[1]}?`]]);
    return ['map', f[0], f[1]]; });
  many('geo.show', 30, () => { const c = pick(COUNTRY); const f = pick([[`show ${c[0]} on the map`, `arată ${c[1]} pe hartă`], [`where is ${c[0]}`, `unde este ${c[1]}`], [`highlight ${c[0]}`, `evidențiază ${c[1]}`]]);
    return ['map', f[0], f[1]]; });
  many('arith.compute', 90, () => { const a = 2 + Math.floor(rng() * 40), b = 2 + Math.floor(rng() * 9), op = pick([['plus', 'plus', '+'], ['minus', 'minus', '-'], ['times', 'ori', '*'], ['divided by', 'împărțit la', '/']]);
    const x = op[2] === '/' ? a * b : a, y = b;
    const f = pick([[`how much is ${x} ${op[0]} ${y}`, `cât face ${x} ${op[1]} ${y}`], [`what is ${x} ${op[0]} ${y}`, `cât este ${x} ${op[1]} ${y}`], [`what is ${x} ${op[0]} ${y}?`, `Cât face ${x} ${op[1]} ${y}?`]]);
    return [null, f[0], f[1]]; });
  many('arith.add.sub', 40, () => { const a = 2 + Math.floor(rng() * 30), b = 2 + Math.floor(rng() * 20);
    const f = pick([[`add ${a} and ${b}`, `adună ${a} cu ${b}`], [`add ${a} and ${b}`, `adună ${a} și ${b}`], [`subtract ${Math.min(a, b)} from ${Math.max(a, b) + 1}`, `scade ${Math.min(a, b)} din ${Math.max(a, b) + 1}`]]);
    return [null, f[0], f[1]]; });
  many('arith.story', 80, () => { const nm = pick(NAMES), it = pick(ITEMS), a = 2 + Math.floor(rng() * 12), b = 1 + Math.floor(rng() * 6), n2 = pick(NAMES); if (nm === n2) return null;
    const give = pick([true, false]);
    const en = give ? `${nm[0]} has ${itemEn(a, ITEMS[ITEMS.indexOf(it)])}. ${n2[0]} gives ${nm[0]} ${itemEn(b, it)}. How many ${it[1]} does ${nm[0]} have?`
      : `${nm[0]} has ${itemEn(a, it)}. ${nm[0]} buys ${b} more. How many ${it[1]} does ${nm[0]} have?`;
    const ro = give ? `${nm[0]} are ${itemNum(a, it)}. ${n2[0]} ${nm[1].startsWith('lui') ? 'îi dă ' + nm[1] : 'îi dă ' + nm[1]} ${itemNum(b, it)}. Câte ${it[3]} are ${nm[0]}?`
      : `${nm[0]} are ${itemNum(a, it)}. ${nm[0]} mai cumpără ${b}. Câte ${it[3]} are ${nm[0]}?`;
    return [null, en, ro]; });
  many('shop.cost', 40, () => { const it = pick(ITEMS), p = 1 + Math.floor(rng() * 9), k = 2 + Math.floor(rng() * 5);
    return [null, `A ${it[0]} costs ${p} lei. How much do ${k} ${it[1]} cost?`, `${it[4] === 'f' ? 'O' : 'Un'} ${it[2]} costă ${p} lei. Cât costă ${k} ${it[3]}?`]; });
  many('time.days', 40, () => { const d = pick(DAYS), f = pick([[`what day comes after ${d[0]}`, `ce zi vine după ${d[1]}`], [`what day comes before ${d[0]}`, `ce zi vine înainte de ${d[1]}`],
    [`what day is after ${d[0]}`, `ce zi e după ${d[1]}`], [`what is the day before ${d[0]}`, `care este ziua dinaintea zilei de ${d[1]}`]]); return [null, f[0], f[1]]; });
  many('time.months', 24, () => { const m = pick(MONTHS), f = pick([[`what month comes after ${m[0]}`, `ce lună vine după ${m[1]}`], [`what month comes before ${m[0]}`, `ce lună vine înainte de ${m[1]}`]]); return [null, f[0], f[1]]; });
  for (const [en, ro] of [['how many days are in a week', 'câte zile sunt într-o săptămână'], ['how many days are in a week', 'câte zile are o săptămână'], ['how many months are in a year', 'câte luni sunt într-un an'],
    ['how many months are in a year', 'câte luni are un an'], ['how many hours are in a day', 'câte ore are o zi'], ['how many minutes are in an hour', 'câte minute are o oră'], ['how many seconds are in a minute', 'câte secunde are un minut'],
    ['how many days are in a year', 'câte zile are un an']]) add('time.count', null, en + '?', ro + '?');
  many('animals.sound', 20, () => { const a = pick(ANIMALS), f = pick([[`what sound does a ${a[0]} make`, `ce sunet scoate ${a[1]}`], [`what sound does a ${a[0]} make`, `ce sunet face ${a[1]}`], [`what does a ${a[0]} say`, `ce spune ${a[1]}`]]); return [null, f[0] + '?', f[1] + '?']; });
  many('animals.legs', 20, () => { const a = pick(LEGGY); return [null, `how many legs does a ${a[0]} have?`, `câte picioare are ${a[1]}?`]; });
  many('animals.can-fly', 12, () => { const a = pick(['duck', 'cow', 'bird', 'dog', 'bee']); const r = { duck: ['rațele', 'o rață'], cow: ['vacile', 'o vacă'], bird: ['păsările', 'o pasăre'], dog: ['câinii', 'un câine'], bee: ['albinele', 'o albină'] }[a];
    const f = pick([[`can a ${a} fly`, `poate ${r[1]} să zboare`], [`can a ${a} fly`, `poate zbura ${r[1]}`]]); return [null, f[0] + '?', f[1] + '?']; });
  many('colours.mix', 30, () => { const [a, b] = pick([['red', 'yellow'], ['blue', 'yellow'], ['red', 'blue'], ['red', 'white'], ['blue', 'white'], ['yellow', 'blue']]);
    const f = pick([[`what do ${a} and ${b} make`, `ce fac ${COLN[a][1]} și ${COLN[b][1]}`], [`what do you get when you mix ${a} with ${b}`, `ce obții când amesteci ${COLN[a][0]} cu ${COLN[b][0]}`],
      [`what do ${a} and ${b} make`, `ce rezultă din ${COLN[a][0]} și ${COLN[b][0]}`]]); return [null, f[0] + '?', f[1] + '?']; });
  many('shapes.sides', 20, () => { const s = pick(SHAPES), f = pick([[`how many sides does a ${s[0]} have`, `câte laturi are ${s[1]}`], [`how many corners does a ${s[0]} have`, `câte colțuri are ${s[1]}`]]); return [null, f[0] + '?', f[1] + '?']; });

  // ---- music, documents, charts, games, shell -----------------------------------------------------------------------------------------
  many('music.scale', 12, () => { const n = pick(['C', 'D', 'E', 'F', 'G', 'A']); return ['music', `play the ${n} major scale`, `cântă scara ${n} major`]; });
  many('music.tempo', 12, () => { const t = pick([80, 90, 100, 120, 140, 160]); return ['music', `set the tempo to ${t}`, `setează tempoul la ${t}`]; });
  many('music.instrument', 10, () => { const i = pick([['flute', 'flaut'], ['piano', 'pian'], ['guitar', 'chitară'], ['violin', 'vioară'], ['trumpet', 'trompetă']]); return ['music', `switch to the ${i[0]}`, `treci la ${i[1] === 'chitară' || i[1] === 'vioară' || i[1] === 'trompetă' ? i[1] : i[1]}`]; });
  many('editor.format', 20, () => { const s = pick([['bold', 'bold'], ['italic', 'italic'], ['underlined', 'subliniat']]), t = pick([['paragraph', 'paragraful'], ['title', 'titlul'], ['last line', 'ultima linie']]);
    return ['editor', `make the ${t[0]} ${s[0]}`, `fă ${t[1]} ${s[1]}`]; });
  many('charts.type', 12, () => { const t = pick([['pie', 'circulară'], ['bar', 'cu bare'], ['line', 'cu linii']]); return ['charts', `make it a ${t[0]} chart`, `fă-o diagramă ${t[1]}`]; });
  add('charts.sort', 'charts', 'sort it', 'sortează-l');
  for (const [en, ro, tab] of [['new game', 'joc nou', 'tictactoe'], ['start a new game', 'începe un joc nou', 'tictactoe'], ['undo', 'anulează', 'draw'], ['undo that', 'anulează asta', 'draw'],
    ['zoom in', 'mărește', 'map'], ['zoom out', 'micșorează', 'map'], ['clear everything', 'șterge tot', 'draw'], ['start over', 'ia-o de la capăt', 'draw'], ['help', 'ajutor', 'robot'],
    ['go to the drawing tab', 'du-mă la fila de desen', 'robot'], ['what can you do', 'ce poți face', 'robot'], ['who are you', 'cine ești tu', 'robot'], ['hello', 'salut', 'robot'], ['thank you', 'mulțumesc', 'robot'],
    ['what time is it', 'cât este ceasul', 'robot'], ['my name is Andrei', 'mă numesc Andrei', 'robot']]) add('shell', tab, en, ro);
  return rows;
}
