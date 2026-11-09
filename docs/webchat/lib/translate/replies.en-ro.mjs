// English -> Romanian reply templates (browser-safe, data and a tiny matcher, no node: imports).
//
// The assistant's replies are built from templates, so they are translated by a phrase table before the word-by-word grammar
// of en-ro.mjs is tried: one entry per English sentence (or sentence fragment: quoted user text splits a reply into runs),
// with typed slots.  A sentence is either translated whole by an entry or by the grammar; the dialog engine keeps the reply in
// English when any piece fails (RD5: never mixed).
//
// Slots (the same slot name in the Romanian side takes the same value; a repeated type is numbered: {n}, {n2}, {n3}):
//   {n}      number           {n:de} adds Romanian "de" before the noun from 20 on ("20 de bătăi")
//   {w}      one word or name copied as is      {place} place name (Japan -> Japonia)
//   {c}      colour phrase (light green -> verde deschis)         {day} weekday      {month} month
//   {pos}    board position (top left, the center)               {piece} chess piece   {lvl} game level name
//   {np}     noun phrase translated by the grammar ("a red house" -> "o casă roșie")   {t} free text translated by the grammar
// Entries are matched against the whole trimmed sentence; the order of the table does not matter (exact, most specific first).

import { places as PLACE_LIST } from './places.ro-en.mjs';
const COLOURS = { red: 'roșu', yellow: 'galben', blue: 'albastru', green: 'verde', orange: 'portocaliu', purple: 'mov', violet: 'violet', pink: 'roz', brown: 'maro', black: 'negru', white: 'alb', gray: 'gri', grey: 'gri', turquoise: 'turcoaz', coral: 'coral', beige: 'bej', gold: 'auriu', silver: 'argintiu', tan: 'bronzat' };
const DAYS = { Monday: 'luni', Tuesday: 'marți', Wednesday: 'miercuri', Thursday: 'joi', Friday: 'vineri', Saturday: 'sâmbătă', Sunday: 'duminică' };
const MONTHS = { January: 'ianuarie', February: 'februarie', March: 'martie', April: 'aprilie', May: 'mai', June: 'iunie', July: 'iulie', August: 'august', September: 'septembrie', October: 'octombrie', November: 'noiembrie', December: 'decembrie' };
const POS = { 'top left': 'sus în stânga', 'top middle': 'sus la mijloc', 'top right': 'sus în dreapta', 'middle left': 'la mijloc în stânga', 'middle right': 'la mijloc în dreapta', 'bottom left': 'jos în stânga', 'bottom middle': 'jos la mijloc', 'bottom right': 'jos în dreapta', 'the center': 'centrul', 'center': 'centrul', 'the middle': 'mijlocul' };
const PIECES = { pawn: 'pionul', knight: 'calul', bishop: 'nebunul', rook: 'turnul', queen: 'regina', king: 'regele' };
const LEVELS = { casual: 'relaxat', easy: 'ușor', intermediate: 'mediu', 'club player': 'jucător de club', expert: 'expert', beginner: 'începător', hard: 'greu' };
const PLACES = { Japan: 'Japonia', France: 'Franța', Italy: 'Italia', Spain: 'Spania', Germany: 'Germania', Romania: 'România', Egypt: 'Egipt', Peru: 'Peru', Rome: 'Roma', Africa: 'Africa', Europe: 'Europa', Asia: 'Asia', 'South America': 'America de Sud', Bulgaria: 'Bulgaria', Hungary: 'Ungaria', Moldova: 'Moldova', Serbia: 'Serbia', Ukraine: 'Ucraina', Canada: 'Canada', Kenya: 'Kenya' };

function colourRo(en) {
  const m = /^(light |dark |sky |deep )?([a-z]+)$/.exec(en);
  if (!m) return null;
  const base = COLOURS[m[2]];
  if (!base) return null;
  if (!m[1]) return base;
  const mod = m[1].trim();
  if (mod === 'light') return `${base} deschis`;
  if (mod === 'dark' || mod === 'deep') return `${base} închis`;
  if (mod === 'sky' && m[2] === 'blue') return 'albastru cer';
  return null;
}
const mapper = (table, { ci = false } = {}) => (v) => (ci ? table[v.toLowerCase()] : table[v]) ?? null;
const PL_NOM = new Map(PLACE_LIST.map((p) => [p.en, p.nom[0]]));
const PL_GEN = new Map(PLACE_LIST.map((p) => [p.en, p.gen[0] ?? p.nom[0]]));
const placeRo = (v) => PL_NOM.get(v) ?? PLACES[v] ?? (/^[A-Z]/.test(v) ? v : null);
const placeGen = (v) => PL_GEN.get(v) ?? PLACES[v] ?? (/^[A-Z]/.test(v) ? v : null);

// slot type -> [regex source, converter(value, sub) -> string | null]
const SLOTS = {
  n: ['(-?\\d[\\d,.]*)', (v) => v, (v) => (Number(String(v).replace(/,/g, '')) >= 20 ? `${v} de` : v)],
  w: ["([\\p{L}\\d'’\\-]+)", (v) => v],
  place: ['([A-Z][\\p{L}\\-]*(?: [A-Z][\\p{L}\\-]*)*)', placeRo],
  placeg: ['([A-Z][\\p{L}\\-]*(?: [A-Z][\\p{L}\\-]*)*)', placeGen],
  c: ['((?:light |dark |sky |deep )?[a-z]+)', colourRo],
  day: ['(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)', mapper(DAYS)],
  month: ['(January|February|March|April|May|June|July|August|September|October|November|December)', mapper(MONTHS)],
  pos: ['(top left|top middle|top right|middle left|middle right|bottom left|bottom middle|bottom right|the center|center|the middle)', mapper(POS)],
  piece: ['(pawn|knight|bishop|rook|queen|king)', mapper(PIECES)],
  lvl: ['(casual|easy|intermediate|club player|expert|beginner|hard)', mapper(LEVELS)],
  eyelist: ['([a-z]+(?:, [a-z]+)*(?: or [a-z]+)?)', (v) => { const w = v.split(/, | or /); const r = w.map((x) => EYE_STYLE_RO[x]); return r.every(Boolean) ? (r.length > 1 ? `${r.slice(0, -1).join(', ')} sau ${r.at(-1)}` : r[0]) : null; }],
  eye: ['([a-z]+)', (v) => EYE_STYLE_RO[v] ?? null],
  cmp: ['(bigger|smaller|wider|narrower)', (v) => ({ bigger: 'mai mari', smaller: 'mai mici', wider: 'mai mari', narrower: 'mai mici' })[v]],
  mood: ['([a-z]+(?: [a-z]+)?)', (v) => MOOD_RO[v] ?? null],
  np: ['((?:an? |the |\\d+ )?[a-z][a-z \\-\']*?)', (v, sub) => sub(v)],
  t: ['(.+?)', (v, sub) => sub(v)],
  q: ['(.+?)', (v) => v],   // the user's own words as stored, copied unchanged
};

// ---- avatar capability replies (worlds/ui.avatar/ops.mjs: CAPABILITY, EXPRESSION_SAY, MOODS, PERSON_PRESET) ----
const CAP_NOTES = { "A person's eyes follow the expression": 'Ochii unei persoane urmează expresia', "A person's mouth follows the expression": 'Gura unei persoane urmează expresia', 'A person shows a mood with the expression': 'O persoană arată o stare prin expresie' };
const CAP_SAY = { 'wide-eyed': 'cu ochii mari', 'sleepy-eyed': 'cu ochii somnoroși', smiling: 'zâmbitoare', beaming: 'radiantă', laughing: 'râzând', sad: 'tristă', 'calm and dreamy': 'liniștită și visătoare', 'closed-eyed': 'cu ochii închiși', angry: 'supărată', furious: 'furioasă', scared: 'speriată', worried: 'îngrijorată', cheeky: 'obraznică', sparkling: 'strălucitoare', suspicious: 'bănuitoare', 'wild-eyed': 'cu privirea sălbatică', serious: 'serioasă', blank: 'fără expresie', cute: 'drăguță', grinning: 'rânjind' };
const MOOD_RO = { happy: 'fericit', glad: 'bucuros', cheerful: 'vesel', joyful: 'vesel', excited: 'entuziasmat', delighted: 'încântat', smiling: 'zâmbitor', smiley: 'zâmbitor', laughing: 'râzând', sad: 'trist', unhappy: 'nefericit', upset: 'supărat', worried: 'îngrijorat', concerned: 'îngrijorat', surprised: 'surprins', shocked: 'șocat', amazed: 'uimit', astonished: 'uluit', scared: 'speriat', afraid: 'speriat', fearful: 'înfricoșat', terrified: 'îngrozit', frightened: 'speriat', angry: 'supărat', mad: 'furios', furious: 'furios', annoyed: 'iritat', calm: 'calm', relaxed: 'relaxat', peaceful: 'liniștit', serious: 'serios', neutral: 'neutru', cute: 'drăguț', sleepy: 'somnoros', tired: 'obosit', suspicious: 'bănuitor', cheeky: 'obraznic', bored: 'plictisit', blank: 'fără expresie', smug: 'mulțumit de sine', stressed: 'stresat', 'in love': 'îndrăgostit', loving: 'îndrăgostit' };
const PRESET_RO = { 'short neat hair and a short beard': 'păr scurt și îngrijit și o barbă scurtă', 'long hair and no beard': 'păr lung și fără barbă', 'twin buns and no beard': 'două coade împletite sus și fără barbă', 'short spiky hair and no beard': 'păr scurt zburlit și fără barbă' };
const GENDER_RO = { man: 'bărbat', woman: 'femeie', girl: 'fată', boy: 'băiat' };
const EYE_STYLE_RO = { round: 'rotunzi', square: 'pătrați', visor: 'cu vizieră', cyclops: 'de ciclop', happy: 'fericiți', sleepy: 'somnoroși', plus: 'în formă de plus' };
const CAP_ENTRIES = [];
for (const [n, nr] of Object.entries(CAP_NOTES)) for (const [x, xr] of Object.entries(CAP_SAY)) CAP_ENTRIES.push([`${n}, so I made it ${x}.`, `${nr}, așa că am făcut-o ${xr}.`]);
for (const who of [['A robot', 'Un robot', 'ochii și gura'], ['An emoji', 'Un emoji', 'ochii și gura']]) CAP_ENTRIES.push([`${who[0]} shows its expression with its eyes and mouth, so I set both to look {mood}.`, `${who[1]} își arată expresia prin ${who[2]}, așa că le-am făcut pe amândouă să arate {mood}.`]);
for (const g of Object.keys(GENDER_RO)) for (const [pe, pr] of Object.entries(PRESET_RO)) {
  const art = g === 'man' || g === 'boy' ? ['un', 'ca'] : ['o', 'ca'];
  CAP_ENTRIES.push([`A person shows being ${/^[aeiou]/.test(g) ? 'an' : 'a'} ${g} through hair, so I gave myself ${pe}.`, `O persoană arată că e ${art[0]} ${GENDER_RO[g]} prin păr, așa că mi-am dat ${pr}.`]);
  CAP_ENTRIES.push([`A person shows being ${/^[aeiou]/.test(g) ? 'an' : 'a'} ${g} through hair, so I gave myself ${pe} and look {mood}.`, `O persoană arată că e ${art[0]} ${GENDER_RO[g]} prin păr, așa că mi-am dat ${pr} și arăt {mood}.`]);
}
CAP_ENTRIES.push(['My eyes can be {eyelist}.', 'Ochii mei pot fi {eyelist}.']);
CAP_ENTRIES.push(['For {cmp} eyes try {eyelist}; say "make your eyes {eye}".', 'Pentru ochi {cmp} încearcă {eyelist}; spune "fă-ți ochii {eye}".']);
const EXAMPLE_ENTRIES = [
  ['You can say, for example, "in the top right corner", "next to the sun" or "under the tree".', 'Poți spune, de exemplu, "în colțul din dreapta sus", "lângă soare" sau "sub copac".'],
  ['Try "draw a red house".', 'Încearcă "desenează o casă roșie".'],
  ['Say "new game" to play again.', 'Spune "joc nou" ca să joci din nou.'], ['Say "new game" to start a fresh game.', 'Spune "joc nou" ca să începi un joc nou.'], ['Say "new game" to try again.', 'Spune "joc nou" ca să încerci din nou.'],
  ['Say "more examples" for others.', 'Spune "mai multe exemple" pentru altele.'],
  ['Say "play hangman" to start.', 'Spune "joacă spânzurătoarea" ca să începi.'],
  ['Say a move such as "knight to f3" or "e2 to e4", or ask "what can my knight do?".', 'Spune o mutare, de exemplu "calul la f3" sau "e2 la e4", sau întreabă "ce poate face calul meu?".'],
  ['Ask "what is the best move?" for a hint, "undo" to take a move back, or "resign" to give up.', 'Întreabă "care este cea mai bună mutare?" pentru un indiciu, spune "anulează" ca să retragi o mutare sau "renunț" ca să te dai bătut.'],
  ['Say, for example: "make a chart: apples 5, pears 3, plums 8".', 'Spune, de exemplu: "fă un grafic: mere 5, pere 3, prune 8".'],
  ['Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.', 'Întreabă "ce poți face?" pentru lista întreagă, "mai multe exemple" pentru altele sau "cum fac ...?" ca să găsești o comandă.'],
  ['Ask me "what can I say here?" for examples.', 'Întreabă-mă "ce pot spune aici?" pentru exemple.'],
  ['Your old picture is still there if you say "undo".', 'Desenul tău vechi este încă acolo dacă spui "anulează".'],
  ['Say "draw a red house", "put a big yellow sun in the top right corner" or "make it night".', 'Spune "desenează o casă roșie", "pune un soare galben mare în colțul din dreapta sus" sau "fă să fie noapte".'],
];
CAP_ENTRIES.push(...EXAMPLE_ENTRIES);
CAP_ENTRIES.push(['I cannot scale my eyes, but I can change their style.', 'Nu îmi pot schimba mărimea ochilor, dar le pot schimba stilul.']);
CAP_ENTRIES.push(['Now I look {mood}.', 'Acum arăt {mood}.'], ['Yes, I look {mood}.', 'Da, arăt {mood}.']);

// [English pattern, Romanian template]
const TABLE = [
  ...CAP_ENTRIES,
  // ---- openers and small talk
  ['Ta-da!', 'Gata!'], ['Nice!', 'Frumos!'], ['Done!', 'Gata!'], ['Okay!', 'Bine!'], ['Sure!', 'Sigur!'], ['Good luck!', 'Mult noroc!'],
  ['There you go!', 'Poftim!'], ['Here you go!', 'Poftim!'], ['There!', 'Gata!'], ['Good game!', 'Joc frumos!'], ['Good.', 'Bine.'],
  ['What would you like to talk about?', 'Despre ce ai vrea să vorbim?'],
  ['I am fine, thank you!', 'Sunt bine, mulțumesc!'], ['I am doing well, thanks for asking!', 'Sunt bine, mulțumesc că ai întrebat!'],
  ['Nice to meet you, {w}!', 'Mă bucur să te cunosc, {w}!'],
  ['Let us play chess!', 'Hai să jucăm șah!'], ["Let's play a game.", 'Hai să jucăm un joc.'],
  ["OK, let's play chess!", 'Bine, hai să jucăm șah!'], ["OK, let's play hangman!", 'Bine, hai să jucăm spânzurătoarea!'], ["OK, let's play tic-tac-toe!", 'Bine, hai să jucăm x și 0!'],
  ["OK, let's play guess the animal!", 'Bine, hai să jucăm ghicește animalul!'],
  ['No problem, I will ask something else.', 'Nicio problemă, o să întreb altceva.'],
  ['Hmm, then I will not count on that one.', 'Hmm, atunci nu mă voi baza pe asta.'],
  ['I am a robot, drawn by the DiceBear library.', 'Sunt un robot, desenat cu biblioteca DiceBear.'],
  ['I can also become a person or an emoji.', 'Pot deveni și o persoană sau un emoji.'],
  ['The Avatar tab lets you change my face.', 'Fila Avatar îți permite să îmi schimbi fața.'],
  // ---- understanding messages (fragments between quoted user text)
  ['I did not understand', 'Nu am înțeles'], ['Did you mean', 'Ai vrut să spui'], ['For example:', 'De exemplu:'], ['You can say:', 'Poți spune:'],
  ['I took that as:', 'Am înțeles asta:'], ['(I read', '(Am citit'], ['as', 'drept'],
  ['I understood only part of that: I did not use', 'Am înțeles doar o parte din asta: nu am folosit'],
  ['I do not know what you mean by', 'Nu știu ce vrei să spui prin'],
  ['I did not find anyone saying', 'Nu am găsit pe nimeni care să spună'],
  ['I skipped', 'Am sărit peste'], ['because I found no number.', 'pentru că nu am găsit niciun număr.'],
  ['Say', 'Spune'], ['to play again.', 'ca să joci din nou.'], ['to try again.', 'ca să încerci din nou.'], ['for others.', 'pentru altele.'],
  ['Say it like this:', 'Spune-o așa:'],
  ['There is no chart yet.', 'Încă nu există niciun grafic.'],
  ['Say, for example:', 'Spune, de exemplu:'],
  ['OK, I undid the last change.', 'Bine, am anulat ultima schimbare.'], ['OK, I undid the last change to the map.', 'Bine, am anulat ultima schimbare a hărții.'],
  ['OK, I undid the last change to the chart.', 'Bine, am anulat ultima schimbare a graficului.'],
  ['OK, I switched to English.', 'Bine, am trecut la engleză.'],
  // ---- arithmetic and calendar
  ['{n} divided by {n2} is {n3}.', '{n} împărțit la {n2} este {n3}.'],
  ['Double {n} is {n2}.', 'Dublul lui {n} este {n2}.'],
  ['{n} days after {day} is {day2}.', 'La {n} zile după {day} este {day2}.'],
  ['{n} days before {day} is {day2}.', 'Cu {n} zile înainte de {day} este {day2}.'],
  ['{n} months after {month} is {month2}.', 'La {n} luni după {month} este {month2}.'],
  ['From {day} to {day2} is {n} days.', 'De {day} până {day2} sunt {n} zile.'],
  ["It will be {n} o'clock.", 'Va fi ora {n}.'], ["It was {n} o'clock.", 'Era ora {n}.'],
  ['There are {n} {np} altogether.', 'Sunt {n} {np} în total.'],
  ['{n} {np} cost {n2} lei.', '{n} {np} costă {n2} lei.'],
  // ---- avatar
  ['I do not have {c} for that; {c2} is the closest.', 'Nu am {c} pentru asta; {c2} este cel mai apropiat.'],
  ['My body is {c} now.', 'Corpul meu este acum {c}.'], ['My glow is {c} now.', 'Strălucirea mea este acum {c}.'],
  ['My screen is {c} now.', 'Ecranul meu este acum {c}.'], ['My background is {c} now.', 'Fundalul meu este acum {c}.'],
  ['My eyes glow {c} now.', 'Ochii mei strălucesc acum {c}.'], ['The sky is {c} now.', 'Cerul este acum {c}.'],
  ['I have {np} now.', 'Acum am {np}.'], ['Now I am {np}.', 'Acum sunt {np}.'],
  ['I took off {np}.', 'Mi-am scos {np}.'], ['I took away {np}.', 'Am șters {np}.'],
  ['I am wearing {np}.', 'Port {np}.'],
  ['I turned the cat around.', 'Am întors pisica.'],
  ['I am back to my normal look as a robot.', 'Am revenit la înfățișarea mea normală de robot.'],
  ['I have a smile expression and short side-parted hair.', 'Am o expresie zâmbitoare și păr scurt, cu cărare pe o parte.'],
  ['I have a circle face, blush cheeks, round eyes with pupils and a smile mouth.', 'Am fața rotundă, obraji roșii, ochi rotunzi cu pupile și gură zâmbitoare.'],
  ['I have buttons on my chest, round eyes, a smile mouth and an antenna on top.', 'Am nasturi pe piept, ochi rotunzi, gură zâmbitoare și o antenă deasupra.'],
  ['From now on my name is {w}.', 'De acum încolo mă numesc {w}.'],
  ['My mouth can be grill, speaker, line, smile or zigzag.', 'Gura mea poate fi grătar, difuzor, linie, zâmbet sau zigzag.'],
  ['I have a zigzag mouth now.', 'Acum am gura în zigzag.'],
  // ---- games
  ['You took {pos}.', 'Ai luat {pos}.'], ['I took {pos}.', 'Am luat {pos}.'], ['Your move.', 'E rândul tău.'], ['It is your move again.', 'E din nou rândul tău.'],
  ['You play {piece} to {w}.', 'Joci cu {piece} la {w}.'],
  ['I play at level {n} ({lvl}).', 'Joc la nivelul {n} ({lvl}).'], ['OK, I now play at level {n} ({lvl}).', 'Bine, acum joc la nivelul {n} ({lvl}).'],
  ['I play at the {lvl} level.', 'Joc la nivelul {lvl}.'],
  ['I am playing at level {n} ({lvl}), out of {n2}.', 'Joc la nivelul {n} ({lvl}), din {n2}.'],
  ['I will go easier on you.', 'O să fiu mai blând cu tine.'],
  ['One moment, please.', 'Un moment, te rog.'], ['Let me think about your best move.', 'Lasă-mă să mă gândesc la cea mai bună mutare a ta.'],
  ['I am still thinking about my move.', 'Încă mă gândesc la mutarea mea.'],
  ['OK, you resign, so I win this one.', 'Bine, renunți, deci câștig eu de data asta.'], ['OK, you give up, so I win this one.', 'Bine, renunți, deci câștig eu de data asta.'],
  ['{n} wrong guesses left.', 'Au mai rămas {n} încercări greșite.'],
  ['Question {n}: {t}', 'Întrebarea {n}: {t}'],
  ['Letters tried: {w}.', 'Litere încercate: {w}.'],
  ['You have not lost any pieces yet.', 'Încă nu ai pierdut nicio piesă.'],
  // ---- music
  ['Playing {t} on the piano at {n} beats per minute.', 'Cânt {t} la pian cu {n:de} bătăi pe minut.'],
  ['OK, the tempo is now {n} beats per minute (it was {n2}).', 'Bine, tempoul este acum {n:de} bătăi pe minut (era {n2}).'],
  ['Playing again at {n} beats per minute (it was {n2}).', 'Cânt din nou cu {n:de} bătăi pe minut (era {n2}).'],
  ['OK, my speech rate is now {n}.', 'Bine, viteza mea de vorbire este acum {n}.'],
  ['OK, my speech rate is slower: {n}.', 'Bine, vorbesc mai rar: {n}.'], ['OK, my speech rate is faster: {n}.', 'Bine, vorbesc mai repede: {n}.'],
  ['They share the same notes and key signature.', 'Au aceleași note și aceeași armură.'],
  // ---- map and charts
  ['Here is {place}: capital of {placeg2} · {n} million people.', 'Iată {place}: capitala {placeg2} · {n} milioane de locuitori.'],
  ['Zoomed in to zoom {n}.', 'Am mărit la zoom {n}.'], ['Zoomed out to zoom {n}.', 'Am micșorat la zoom {n}.'],
  ['No, {place} is not in {place2}; it is in {place3}.', 'Nu, {place} nu este în {place2}; este în {place3}.'],
  ['The biggest is {np}.', 'Cel mai mare este {np}.'],
  // ---- animals, shapes, colours
  ['A dog goes woof.', 'Câinele face ham.'], ['A duck goes quack.', 'Rața face mac.'], ['A pig goes oink.', 'Porcul face groh.'], ['A sheep goes baa.', 'Oaia face mee.'],
  ['A cow goes moo.', 'Vaca face muu.'], ['A cat goes meow.', 'Pisica face miau.'],
  ['A banana is usually yellow.', 'O banană este de obicei galbenă.'], ['The sky is usually blue.', 'Cerul este de obicei albastru.'],
  ['It is usually blue.', 'De obicei este albastru.'], ['It is usually green.', 'De obicei este verde.'], ['Grass is usually green.', 'Iarba este de obicei verde.'],
  ['A ball is a sphere.', 'O minge este o sferă.'],
  ['Penguins live in the polar regions.', 'Pinguinii trăiesc în regiunile polare.'],
  // ---- document editor (docs.editor): structure and writing
  ['OK, new line.', 'Bine, rând nou.'], ['What goes on it?', 'Ce scriu pe el?'], ['OK, new paragraph.', 'Bine, paragraf nou.'], ['What goes in it?', 'Ce scriu în el?'],
  ['New line.', 'Rând nou.'], ['New paragraph.', 'Paragraf nou.'], ['Page break.', 'Pagină nouă.'], ['OK, I added a page break.', 'Bine, am adăugat o pagină nouă.'],
  ['OK, I wrote a new paragraph ({n} words).', 'Bine, am scris un paragraf nou ({n} cuvinte).'], ['OK, I wrote it ({n} words).', 'Bine, am scris ({n} cuvinte).'],
  ['OK, I continued the paragraph ({n} words).', 'Bine, am continuat paragraful ({n} cuvinte).'], ['OK, I wrote the paragraph ({n} words).', 'Bine, am scris paragraful ({n} cuvinte).'],
  ['OK, I added a paragraph ({n} words).', 'Bine, am adăugat un paragraf ({n} cuvinte).'],
  ['OK, I started chapter {n}.', 'Bine, am început capitolul {n}.'], ['OK, I started chapter {n}, "{q}".', 'Bine, am început capitolul {n}, "{q}".'],
  ['OK, I started section {n}.', 'Bine, am început secțiunea {n}.'], ['OK, I started section {n}, "{q}".', 'Bine, am început secțiunea {n}, "{q}".'],
  ['New chapter.', 'Capitol nou.'], ['New section.', 'Secțiune nouă.'], ['What is its title?', 'Care este titlul?'],
  ['New chapter: {q}.', 'Capitol nou: {q}.'], ['New section: {q}.', 'Secțiune nouă: {q}.'], ['Title: {q}.', 'Titlu: {q}.'],
  ['OK, I added the heading "{q}".', 'Bine, am adăugat titlul "{q}".'], ['OK, I added the heading "{q}"; it is the title of the document.', 'Bine, am adăugat titlul "{q}"; este titlul documentului.'],
  ['OK, the title is now "{q}".', 'Bine, titlul este acum "{q}".'],
  ['OK, dictation is off.', 'Bine, dictarea este oprită.'], ['Added.', 'Adăugat.'], ['Added. Dictation is off.', 'Adăugat. Dictarea este oprită.'],
  ['OK, I deleted the last chapter with everything in it.', 'Bine, am șters ultimul capitol cu tot ce era în el.'],
  ['OK, I moved the paragraph up.', 'Bine, am mutat paragraful mai sus.'], ['OK, I moved the paragraph down.', 'Bine, am mutat paragraful mai jos.'],
  ['OK, I deleted the last paragraph.', 'Bine, am șters ultimul paragraf.'], ['OK, I deleted the last sentence.', 'Bine, am șters ultima propoziție.'], ['OK, I deleted the last word.', 'Bine, am șters ultimul cuvânt.'],
  ['OK, the last sentence is now bold.', 'Bine, ultima propoziție este acum aldină.'], ['OK, the last sentence is now italic.', 'Bine, ultima propoziție este acum cursivă.'], ['OK, the last sentence is now underlined.', 'Bine, ultima propoziție este acum subliniată.'],
  ['OK, the last word is now bold.', 'Bine, ultimul cuvânt este acum aldin.'], ['OK, the last word is now italic.', 'Bine, ultimul cuvânt este acum cursiv.'], ['OK, the last word is now underlined.', 'Bine, ultimul cuvânt este acum subliniat.'],
  ['OK, the last paragraph is now bold.', 'Bine, ultimul paragraf este acum aldin.'], ['OK, the last paragraph is now italic.', 'Bine, ultimul paragraf este acum cursiv.'], ['OK, the last paragraph is now underlined.', 'Bine, ultimul paragraf este acum subliniat.'],
  ['OK, the selection is now bold.', 'Bine, selecția este acum aldină.'], ['OK, the selection is now italic.', 'Bine, selecția este acum cursivă.'], ['OK, the selection is now underlined.', 'Bine, selecția este acum subliniată.'],
  // ---- lists
  ['Hello!', 'Bună!'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMPILED = TABLE.map(([en, ro]) => {
  const keys = [];
  const counts = {};
  const src = en.split(/(\{[a-z0-9:]+\})/).map((part) => {
    const m = /^\{([a-z]+)(\d*)\}$/.exec(part);
    if (!m) return esc(part);
    const type = m[1];
    if (!SLOTS[type]) throw new Error(`reply table: unknown slot ${part}`);
    keys.push(m[1] + m[2]);
    return SLOTS[type][0];
  }).join('');
  return { re: new RegExp(`^${src}$`, 'u'), keys, ro, lit: !keys.length ? en : null };
}).sort((a, b) => b.re.source.length - a.re.source.length);

/**
 * Translate one English sentence (or fragment) by the table.  `sub(text)` translates a free-text slot by the grammar and returns a string or
 * null when it cannot.  Returns the Romanian text, or null when no entry matches or a slot cannot be converted.
 */
export function translateReplySentence(text, sub) {
  const s = String(text).trim();
  for (const e of COMPILED) {
    const m = e.re.exec(s);
    if (!m) continue;
    const vals = {};
    let ok = true;
    e.keys.forEach((k, i) => {
      if (!ok) return;
      const type = /^[a-z]+/.exec(k)[0];
      const v = SLOTS[type][1](m[i + 1], sub);
      if (v == null) ok = false; else vals[k] = { v, raw: m[i + 1] };
    });
    if (!ok) continue;
    return e.ro.replace(/\{([a-z]+\d*)(?::de)?\}/g, (all, k) => {
      const type = /^[a-z]+/.exec(k)[0];
      if (/:de\}$/.test(all) && SLOTS[type][2]) return SLOTS[type][2](vals[k].raw);
      return vals[k].v;
    });
  }
  return null;
}

export default TABLE;
