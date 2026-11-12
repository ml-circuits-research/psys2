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

import { places as PLACE_LIST } from './places.ro-en.mjs?v=97dc087c2a';
import { CANONICAL_RO } from './canonical.en-ro.mjs?v=2b71c7e520';
import { avatarListRo, avatarOptionsRo, AVATAR_PARTS, AVATAR_CHARACTER_RO, AVATAR_CHARACTER_EN } from './avatar.en-ro.mjs?v=5b0048ab8d';
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

const exampleRo = (v) => (CANONICAL_RO[`${v}.`] ?? CANONICAL_RO[`${v}?`] ?? CANONICAL_RO[v])?.replace(/[.?!]$/, '') ?? null;   // the quoted example has no final stop
const ANIMAL_EXTRA = { tortoise: 'țestoasă', donkey: 'măgar', more: 'altele' };
function animalListRo(v, sub) {
  const items = v.split(/, | and /);
  const out = items.map((x) => ANIMAL_EXTRA[x] ?? sub(x));
  if (out.some((x) => !x)) return null;
  const more = items.at(-1) === 'more';
  const head = more ? out.slice(0, -1) : out;
  const last = head.pop();
  return head.length ? `${head.join(', ')} și ${last}${more ? ' și altele' : ''}` : `${last}${more ? ' și altele' : ''}`;
}

// slot type -> [regex source, converter(value, sub) -> string | null]
const TAB_RO = { Avatar: 'Avatar', Editor: 'Editor', 'Tic-tac-toe': 'X și 0', 'Guess the animal': 'Ghicește animalul', Hangman: 'Spânzurătoarea', Drawing: 'Desen', Diagram: 'Diagramă', Charts: 'Grafice', Map: 'Hartă', Music: 'Muzică', Chess: 'Șah', Documents: 'Documente', Profile: 'Profil' };
const SLOTS = {
  ids: ['([a-z]\\d+(?:, [a-z]\\d+)*(?: and [a-z]\\d+)?)', (v) => v.replace(' and ', ' și ')],   // diagram ids (c1, r2 and a3)
  tab: [`(${Object.keys(TAB_RO).join('|')})`, (v) => TAB_RO[v] ?? null],   // the title of a tab
  ...Object.fromEntries(AVATAR_PARTS.map(([, key], i) => [`opt${String.fromCharCode(97 + i)}`, ['(.+?)', (v) => avatarOptionsRo(key, v)]])),   // the options of one avatar part
  n: ['(-?\\d[\\d,.]*)', (v) => v, (v) => (Number(String(v).replace(/,/g, '')) >= 20 ? `${v} de` : v)],
  w: ["([\\p{L}\\d'’\\-]+)", (v) => v],
  lst: ['([a-z][a-z\\- ]*?)', (v) => ({ 'to-do': 'lucruri de făcut', shopping: 'cumpărături', homework: 'teme', reminders: 'memento-uri', school: 'școală', chores: 'treburi' })[v] ?? v],   // the name of a list as the tasks world keeps it
  names: ['([A-Z][\\p{L}\\-]*(?:(?:, | and )[A-Z][\\p{L}\\-]*)*)', (v) => v.replace(/ and /g, ' și ')],   // names of people, joined as the worlds say them ("Tom, Ana and Max")
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
  avl: ['(.+?)', (v) => avatarListRo(v)],   // the avatar's own part phrases (avatar.en-ro.mjs)
  chr: ['(a robot|a person|an emoji|a portrait|a cartoon|a kid|a pixel person|a pixel robot|a fun emoji)', (v) => AVATAR_CHARACTER_RO[AVATAR_CHARACTER_EN[v]] ?? null],
  nk: ['(\\d[\\d,]*(?:\\.\\d+)?)', (v) => v.replace(/,(?=\d{3}\b)/g, '.'), (v) => (Number(String(v).replace(/,/g, '')) >= 20 ? `${String(v).replace(/,(?=\d{3}\b)/g, '.')} de` : v)],   // a number with English thousands commas (1,106 km): Romanian dots
  tl: ['(.+?)', (v, sub) => { const r = sub(v); return r ? r.replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : r; }],   // free text translated by the grammar, lower case after a colon
  ex: ['([^"]+?)', (v) => exampleRo(v)],   // an example sentence in quotes, in its authored Romanian (canonical.en-ro.mjs), else the entry does not apply
  side: ['(white|black)', (v) => ({ white: 'albele', black: 'negrele' })[v]],   // the side of a chess player
  note: ['([A-G][#b]?)', (v) => v],   // a note name as the music world writes it
  plist: ['([A-Z][\\p{L}\\-]*(?:(?:, | and )[A-Z][\\p{L}\\-]*)*)', (v) => v.split(/, | and /).map((x) => placeRo(x)).join(', ').replace(/, ([^,]*)$/, ' și $1')],   // a list of places (Bulgaria, Hungary and Ukraine)
  anl: ['([a-z][a-z ,]*?)', (v, sub) => animalListRo(v, sub)],   // the animals the guessing game still thinks of ("dog, cat and donkey and more")
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
// refusals of the avatar world (ops.mjs: _setPart, _setPartUnknown): "I do not know eyes like "x". My eyes can be ..."
const LABEL_RO = { hairstyle: ['coafură', 'coafuri'], eyebrows: ['sprâncene', 'sprâncene'], nose: ['nas', 'nasuri'], beard: ['barbă', 'bărbi'], glasses: ['ochelari', 'ochelari'], eyes: ['ochi', 'ochi'], mouth: ['gură', 'guri'], hat: ['pălărie', 'pălării'], expression: ['expresie', 'expresii'] };
for (const [en, [sg, pl]] of Object.entries(LABEL_RO)) {
  CAP_ENTRIES.push([`I do not know ${en} like "{q}".`, `Nu cunosc niciun fel de ${sg} precum "{q}".`]);
  CAP_ENTRIES.push([`Ask me what ${en} I can have.`, `Întreabă-mă ce ${pl} pot avea.`]);
}
CAP_ENTRIES.push(['I cannot draw {np} yet.', 'Încă nu pot desena {np}.'], ['I can draw a cat, a dog, a fish or a bird.', 'Pot desena o pisică, un câine, un pește sau o pasăre.'], ['What would you like?', 'Ce ai vrea?']);
CAP_ENTRIES.push(['I do not have that part.', 'Nu am această parte.'], ['I do not know how to look like that.', 'Nu știu cum să arăt așa.']);
AVATAR_PARTS.forEach(([en, , gen, nom], i) => {
  CAP_ENTRIES.push([`I cannot change the size of my ${en}, but I can change its style.`, `Nu pot schimba mărimea ${gen}, dar îi pot schimba stilul.`]);
  CAP_ENTRIES.push([`My ${en} can be {opt${String.fromCharCode(97 + i)}}.`, `${nom} {opt${String.fromCharCode(97 + i)}}.`]);
});
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
  ['Say a place like "center" or "top left", or a coordinate like B2 (letter for the column, number for the row).', 'Spune un loc, de exemplu "centru" sau "sus în stânga", sau o coordonată ca B2 (litera pentru coloană, cifra pentru rând).'],
  ['You can say, for example, "move the tree to the left", "put the cat next to the house" or "move it to the top right corner".', 'Poți spune, de exemplu, "mută copacul la stânga", "pune pisica lângă casă" sau "mută-l în colțul din dreapta sus".'],
  ['Say it like this: "make a chart: apples 5, pears 3, plums 8".', 'Spune-o așa: "fă un grafic: mere 5, pere 3, prune 8".'],
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
  ['Voila!', 'Poftim!'], ['Look at that!', 'Uite!'], ['Look!', 'Uite!'], ['Ta-da!', 'Gata!'], ['Nice!', 'Frumos!'], ['Done!', 'Gata!'], ['Okay!', 'Bine!'], ['Sure!', 'Sigur!'], ['Good luck!', 'Mult noroc!'],
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
  ['OK, I switched to Romanian.', 'Bine, am trecut la română.'],
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
  ['Now I am {chr}.', 'Acum sunt {chr}.'], ['I have {avl}.', 'Am {avl}.'], ['I have {avl} now.', 'Acum am {avl}.'], ['I am wearing {avl}.', 'Port {avl}.'], ['I took off {avl}.', 'Mi-am scos {avl}.'],
  ['I am not wearing anything special.', 'Nu port nimic deosebit.'], ['I have nothing extra on me.', 'Nu am nimic în plus pe mine.'],
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
  ['You are X and you go first.', 'Ești X și începi tu.'], ['You are O and I go first: I took {pos}.', 'Ești O și încep eu: am luat {pos}.'], ['I play perfectly.', 'Joc perfect.'],
  ['OK, I am back on the {tab} tab.', 'Bine, am revenit pe fila {tab}.'], ['There is no {w} tab.', 'Nu există nicio filă „{w}”.'], ['There is no {w} game.', 'Nu există niciun joc „{w}”.'], ['I do not speak {w} yet.', 'Încă nu vorbesc {w}.'],
  ['OK, I speak English again.', 'Bine, vorbesc din nou engleza.'], ['OK, I speak Romanian again.', 'Bine, vorbesc din nou româna.'], ['OK, the speaker is on again.', 'Bine, difuzorul este din nou pornit.'], ['OK, the speaker is off again.', 'Bine, difuzorul este din nou oprit.'],
  ['OK, my speech rate is {n} again.', 'Bine, viteza mea de vorbire este din nou {n}.'], ['OK, I went back to how I was before.', 'Bine, m-am întors la cum eram înainte.'],
  ['OK, here is the {tab} tab.', 'Bine, iată fila {tab}.'], ['You are already on the {tab} tab.', 'Ești deja pe fila {tab}.'], ['There is no game open on the {tab} tab.', 'Nu este niciun joc deschis în fila {tab}.'],
  ['I moved {np} into the water.', 'Am mutat {np} în apă.'], ['I moved {np} onto the sand.', 'Am mutat {np} pe nisip.'], ['I moved {np} onto the snow.', 'Am mutat {np} pe zăpadă.'], ['I moved {np} onto the grass.', 'Am mutat {np} pe iarbă.'],
  ['There was no water, so I added it to the ground.', 'Nu era apă, așa că am adăugat-o pe pământ.'], ['There was no sand, so I added it to the ground.', 'Nu era nisip, așa că l-am adăugat pe pământ.'], ['There was no snow, so I added it to the ground.', 'Nu era zăpadă, așa că am adăugat-o pe pământ.'], ['There was no grass, so I added it to the ground.', 'Nu era iarbă, așa că am adăugat-o pe pământ.'],
  ['I drew {np} at the bottom.', 'Am desenat {np} în partea de jos.'],
  ['Drew {ids}.', 'Am desenat {ids}.'],
  ['Here is a fresh sheet of paper!', 'Iată o foaie nouă de hârtie!'], ['It is night now: a dark sky, a moon and lots of stars.', 'Acum este noapte: un cer întunecat, o lună și o mulțime de stele.'],
  ['New game of tic-tac-toe.', 'Joc nou de x și 0.'], ['"{q}" has {n} words.', '"{q}" are {n} cuvinte.'],
  ['Where should it go?', 'Unde ar trebui să meargă?'], 
  ['I can not find {np} in your picture.', 'Nu găsesc {np} în desen.'],
  ['I could not find numbers in "{q}".', 'Nu am găsit numere în "{q}".'],
  ['You took {pos}.', 'Ai luat {pos}.'], ['I took {pos}.', 'Am luat {pos}.'], ['Your move.', 'E rândul tău.'], ['It is your move again.', 'E din nou rândul tău.'],
  ['I need to know what day it is today.', 'Trebuie să știu ce zi este azi.'], ['Please tell me, for example: Today is Friday.', 'Spune-mi, de exemplu: Azi este vineri.'],
  // the engine's own moves and the dialogue around them (RO-TRANSLATE-FALLBACK: "I play pawn to e6. Your move." was shown in English)
  ['I play {piece} to {w}.', 'Joc cu {piece} la {w}.'], ['I play {piece} takes {piece2} on {w}.', 'Joc: {piece} ia {piece2} pe {w}.'], ['I play {piece} takes {piece2} on {w} en passant.', 'Joc: {piece} ia {piece2} pe {w}, en passant.'],
  ['I castle kingside.', 'Fac rocada mică.'], ['I castle queenside.', 'Fac rocada mare.'], ['Check!', 'Șah!'],
  ['It is my move.', 'E rândul meu.'], ['It is your move.', 'E rândul tău.'], ['We are back at the start.', 'Suntem din nou la început.'],
  ['You are white and you move first.', 'Ești cu albele și muți primul.'], ['You are black, so I move first.', 'Ești cu negrele, așa că încep eu.'], ['I am thinking about my opening move.', 'Mă gândesc la prima mea mutare.'],
  ['OK, I took back your last move.', 'Bine, am luat înapoi ultima ta mutare.'], ['OK, I took back your last move and my reply.', 'Bine, am luat înapoi ultima ta mutare și răspunsul meu.'], ['OK, I took back my last move.', 'Bine, am luat înapoi ultima mea mutare.'],
  ['OK, I took back your last {n} moves.', 'Bine, am luat înapoi ultimele tale {n} mutări.'], ['OK, I took back your last {n} moves and my reply.', 'Bine, am luat înapoi ultimele tale {n} mutări și răspunsul meu.'], ['OK, I took back the last {n} moves.', 'Bine, am luat înapoi ultimele {n} mutări.'],
  ['Checkmate! You win. Well played!', 'Șah mat! Ai câștigat. Bine jucat!'], ['Stalemate: nobody can move, so the game is a draw.', 'Pat: nimeni nu mai poate muta, deci partida este remiză.'],
  ['Checkmate! I win this time. Good game!', 'Șah mat! De data asta câștig eu. Joc frumos!'], ['Say "new game" to play again.', 'Spune „joc nou” ca să jucăm din nou.'],
  ['The game is a draw by {t}.', 'Partida este remiză prin {t}.'], ['You are playing {side}, and I play {side2}.', 'Tu joci cu {side}, iar eu cu {side2}.'],
  // the music world quotes the title of the song: a title stays as it is
  ['Playing "{q}" on the piano at {n} beats per minute.', 'Cânt „{q}” la pian cu {n:de} bătăi pe minut.'],
  ['To show places on a map, you can say, for example: "Show latitude 48.8 longitude 2.3", "Is Paris the capital of France" or "Zoom all the way out".', 'Ca să arăți locuri pe hartă, poți spune, de exemplu: „arată Parisul”, „este Paris capitala Franței” sau „micșorează harta”.'],
  ['OK, back to the {tab} tab.', 'Bine, înapoi la fila {tab}.'], ['There is no previous tab to go back to.', 'Nu există nicio filă anterioară la care să mă întorc.'],
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
  // ---- SOPWORLD-1b: refused statements, unknown amounts, ties, "why?", corrections (worlds kids.arith, kids.shop, kids.tasks; src/dialog/discourse.mjs)
  ['That does not add up.', 'Nu se potrivește.'],
  ['You have 1 leu left.', 'Ți-a rămas 1 leu.'],
  ['You have {n} lei left.', 'Ți-au rămas {n:de} lei.'],
  ['You have {n} {np} left.', 'Ți-au rămas {n:de} {np}.'],
  ['You have {n} lei now.', 'Acum ai {n:de} lei.'],
  ['{w} only had {n} {np}, so {w2} cannot eat {n2}.', '{w} a avut doar {n:de} {np}, deci {w2} nu poate mânca {n2:de}.'],
  ['{w} only had {n} {np}, so {w2} cannot give away {n2}.', '{w} a avut doar {n:de} {np}, deci {w2} nu poate da {n2:de}.'],
  ['{w} only had {n} {np}, so {w2} cannot lose {n2}.', '{w} a avut doar {n:de} {np}, deci {w2} nu poate pierde {n2:de}.'],
  ['{w} only had {n} {np}, so {w2} cannot break {n2}.', '{w} a avut doar {n:de} {np}, deci {w2} nu poate strica {n2:de}.'],
  ['You only had {n} {np}, so you cannot eat {n2}.', 'Ai avut doar {n:de} {np}, deci nu poți mânca {n2:de}.'],
  ['You only had {n} {np}, so you cannot give away {n2}.', 'Ai avut doar {n:de} {np}, deci nu poți da {n2:de}.'],
  ['You only had {n} lei, so you cannot spend {n2} lei.', 'Ai avut doar {n:de} lei, deci nu poți cheltui {n2:de} lei.'],
  ['{w} cannot have had a negative number of {np} at the start.', '{w} nu poate fi avut un număr negativ de {np} la început.'],
  ["I don't know how many {np} {w} had; {w2} got {n} from {names}.", 'Nu știu câte {np} a avut {w}; {w2} a primit {n:de} de la {names}.'],
  ["I don't know how many {np} {w} had; {w2} got {n}.", 'Nu știu câte {np} a avut {w}; {w2} a primit {n:de}.'],
  ['{w} has more than {n} {np}: I was only told that some more came, not how many.', '{w} are mai mult de {n:de} {np}: mi s-a spus doar că au mai venit câteva, nu câte.'],
  ['{w} has fewer than {n} {np}: I was only told that some were gone, not how many.', '{w} are mai puțin de {n:de} {np}: mi s-a spus doar că au plecat câteva, nu câte.'],
  ['{w} has more than {n} {np}: some more came and I was not told how many.', '{w} are mai mult de {n:de} {np}: au mai venit câteva și nu mi s-a spus câte.'],
  ['{w} has fewer than {n} {np}: some were gone and I was not told how many.', '{w} are mai puțin de {n:de} {np}: au plecat câteva și nu mi s-a spus câte.'],
  ['I do not know how many {np} {w} had; {w2} got {n} from {names}.', 'Nu știu câte {np} a avut {w}; {w2} a primit {n:de} de la {names}.'],
  ['I do not know yet how many {np} {w} has.', 'Încă nu știu câte {np} are {w}.'],
  ['{w} had {n} {np} at first.', '{w} a avut {n:de} {np} la început.'],
  ["I don't know how many {np} {w} had at first. Tell me, or tell me how many {w2} has now after something happened.", 'Nu știu câte {np} a avut {w} la început. Spune-mi sau spune-mi câte are {w2} acum, după ce s-a întâmplat ceva.'],
  ['They have the same ({names}): {n} {np} each.', 'Au la fel ({names}): câte {n:de} {np}.'],
  ['OK, {w} had some {np}.', 'Bine, {w} a avut niște {np}.'], ["I don't know how many yet.", 'Încă nu știu câte.'], ["I don't know how many.", 'Nu știu câte.'],
  ['OK, {w} gave {w2} some {np}.', 'Bine, {w} i-a dat lui {w2} niște {np}.'],
  ['OK, {w} got some {np}.', 'Bine, {w} a primit niște {np}.'],
  ['OK, {w} ate some {np}.', 'Bine, {w} a mâncat niște {np}.'],
  ['OK, I took that back.', 'Bine, am retras asta.'],
  // ---- the dialogue layer's own sentences: undo, bare yes/no, refusals (the user's own words arrive as quoted parts, never translated)
  ['OK, I took that back:', 'Am anulat:'], ['OK, I undid it:', 'Am anulat:'], ['OK, I undid it.', 'Am anulat.'],
  ['There is nothing to undo.', 'Nu am ce anula.'], ['There is nothing more to undo.', 'Nu mai am ce anula.'], ['There is nothing to undo yet.', 'Nu am ce anula.'],
  ['Yes to what?', 'Da, la ce?'], ['No to what?', 'Nu, la ce?'],
  ['You can ask me a question, give me a command, or say "help" to see what I can do.', 'Poți să-mi pui o întrebare, să-mi dai o comandă sau să spui "ajutor" ca să vezi ce pot face.'],
  ['OK, I will leave it as it is.', 'Bine, las așa cum este.'],
  ['That is not an hour on a clock: {n} o\'clock.', 'Asta nu este o oră de pe ceas: ora {n}.'],
  ['That is not an age: {n} years.', 'Asta nu este o vârstă: {n:de} ani.'],
  ['No one is {n} years old.', 'Nimeni nu are {n:de} ani.'], ['Did you mean another number?', 'Ai vrut să spui alt număr?'],
  ['You said you are {n} years old, but also that you have been working for {n2} years. Which one is right?', 'Ai spus că ai {n:de} ani, dar și că lucrezi de {n2:de} ani. Care este corect?'],
  ['That is a lot of children: {n}. Did you mean another number?', 'Sunt mulți copii: {n}. Ai vrut să spui alt număr?'],
  ['It is not your turn.', 'Nu este rândul tău.'], ['The game is over. Say "new game" to play again.', 'Jocul s-a terminat. Spune "joc nou" ca să joci din nou.'],
  ['{pos} is already taken by you. Please pick another place.', '{pos} este deja luat de tine. Alege alt loc, te rog.'],
  ['{pos} is already taken by me. Please pick another place.', '{pos} este deja luat de mine. Alege alt loc, te rog.'],
  ['We are not playing hangman. Say "play hangman" to start.', 'Nu jucăm spânzurătoarea. Spune "joacă spânzurătoarea" ca să începem.'],
  ['We are not playing twenty questions. Say "guess my animal" to start.', 'Nu jucăm douăzeci de întrebări. Spune "ghicește animalul meu" ca să începem.'],
  ['We are not in the middle of a game of twenty questions.', 'Nu suntem în mijlocul unui joc de douăzeci de întrebări.'],
  ['I am waiting to learn the animal. Tell me, for example: "it was a zebra".', 'Aștept să aflu animalul. Spune-mi, de exemplu: "a fost o zebră".'],
  ['That does not help right now.', 'Asta nu ajută acum.'],
  ['You already tried {w}.', 'Ai încercat deja {w}.'],
  ['that is not enough to pay for it', 'asta nu ajunge ca să plătești'], ['there is not enough money for it', 'nu sunt destui bani pentru asta'],
  ['What do you want to buy?', 'Ce vrei să cumperi?'],
  ['OK, that makes {n} {np}.', 'Bine, deci sunt {n} {np}.'],
  ['I have no purchase to change yet.', 'Încă nu am nicio achiziție de schimbat.'],
  ['You had {n} lei, you bought {t} ({n2} lei each, {n3} lei in all), so nothing is left.', 'Ai avut {n:de} lei, ai cumpărat {t} ({n2:de} lei bucata, {n3:de} lei în total), deci nu a rămas nimic.'],
  ['You had {n} lei, you bought {t} ({n2} lei each, {n3} lei in all), so {n4} lei are left.', 'Ai avut {n:de} lei, ai cumpărat {t} ({n2:de} lei bucata, {n3:de} lei în total), deci au rămas {n4:de} lei.'],
  ['You had {n} lei, you bought {t} ({n2} lei each, {n3} lei in all), so {n4} leu is left.', 'Ai avut {n:de} lei, ai cumpărat {t} ({n2:de} lei bucata, {n3:de} lei în total), deci a rămas {n4} leu.'],
  ['What shall I add to your {lst} list?', 'Ce să adaug pe lista ta de {lst}?'],
  ['What shall I add to your to-do list?', 'Ce să adaug pe lista ta de lucruri de făcut?'],
  ['I put {t} on your {lst} list.', 'Am pus {t} pe lista ta de {lst}.'], ['Done!', 'Gata!'], ['I added {t} to your {lst} list.', 'Am adăugat {t} pe lista ta de {lst}.'],
  ['You did not say which list, so I assumed your {lst} list.', 'Nu ai spus ce listă, așa că am presupus lista ta de {lst}.'],
  ['I assumed {t}.', 'Am presupus {t}.'],
  ['I have not put anything on a list yet.', 'Încă nu am pus nimic pe nicio listă.'],
  ['Because you marked {t} as done on your {lst} list.', 'Pentru că ai marcat {t} ca terminat pe lista ta de {lst}.'],
  ['I do not see that as done on any list.', 'Nu văd asta ca terminat pe nicio listă.'],
  ['You said', 'Ai spus'], ['What I answered:', 'Am răspuns:'],
  // "why?" about a fact of the user profile (user.profile `why`): the fact, the question it answered and the user's words (quoted, so they are separate runs)
  ['I think your {t} is {q} because you told me so.', 'Am notat {q} la „{t}”, pentru că mi-ai spus asta.'],
  ['I think your {t} is {q} because you answered', 'Am notat {q} la „{t}”, pentru că ai răspuns'],
  ['I think your {t} is {q} because I asked you', 'Am notat {q} la „{t}”, pentru că te-am întrebat'], ['and you answered', 'iar tu ai răspuns'],
  ['I only guessed that your {t} is {q}, from what you told me about your role. Tell me if that is wrong.', 'Am presupus doar că la „{t}” este {q}, din ce mi-ai spus despre rolul tău. Spune-mi dacă greșesc.'],
  [', so I answered it.', ', deci am răspuns.'], [', so I did it.', ', deci am făcut-o.'], ['so I answered it.', 'deci am răspuns.'], ['so I did it.', 'deci am făcut-o.'],
  ['I worked that out from what you told me:', 'Am aflat asta din ce mi-ai spus:'], ['I worked that out from the price list.', 'Am aflat asta din lista de prețuri.'],
  ['I worked that out from what I know.', 'Am aflat asta din ce știu.'], ['I worked that out from what I know about animals.', 'Am aflat asta din ce știu despre animale.'], ['I worked that out from what I know about shapes and colors.', 'Am aflat asta din ce știu despre forme și culori.'],
  ['and from what I know', 'și din ce știu'], ['and from what I know about animals', 'și din ce știu despre animale'], ['and from what I know about shapes and colors', 'și din ce știu despre forme și culori'],
  ['and from the price list', 'și din lista de prețuri'], ['and', 'și'],
  // ---- user.profile acknowledgements (worlds/user.profile/kb.sop ack= and ops.mjs): the value is what the user said, as stored
  ['{t}, noted.', '{t}, notat.'],
  ['{t}: noted.', '{t}: notat.'],
  ['Noted: {t}.', 'Notat: {t}.'],
  ['Nice, {t}!', 'Frumos, {t}!'],
  ['Got it: {t}.', 'Am înțeles: {t}.'],
  ['{t}: useful skills.', '{t}: abilități utile.'],
  ['{t}: that gives a solid base.', '{t}: asta dă o bază solidă.'],
  ['{t}: good taste.', '{t}: gust bun.'],
  ['{t}: good for the body and the mood.', '{t}: bun pentru corp și pentru dispoziție.'],
  ['{t}: ambitious, in a good way.', '{t}: ambițios, în sens bun.'],
  ['{t}: a solid toolbox.', '{t}: o trusă de unelte solidă.'],
  ['{t}: a great way to spend time.', '{t}: o modalitate grozavă de a-ți petrece timpul.'],
  ['{t}: a good thing to aim for.', '{t}: un lucru bun spre care să tinzi.'],
  ['{t}: a good rabbit hole.', '{t}: o pasiune în care merită să te adâncești.'],
  ['{t}: a clear direction.', '{t}: o direcție clară.'],
  ['{t}, that must have taught you something.', '{t}, asta trebuie să te fi învățat ceva.'],
  ['{t}, thanks.', '{t}, mulțumesc.'],
  ['{t}, nice.', '{t}, frumos.'],
  ['{t}, lovely to meet you.', '{t}, mă bucur să te cunosc.'],
  ['{t}, good to know.', '{t}, bine de știut.'],
  ['{t}, a good place to be based!', '{t}, un loc bun în care să locuiești!'],
  ['{t}, I like that.', '{t}, îmi place.'],
  ['{n} years: solid.', '{n:de} ani: solid.'],
  ['{n} years, that is real experience.', '{n:de} ani, asta este experiență adevărată.'],
  ['{n} years old, noted.', '{n:de} ani, notat.'],
  ['{t}: I will keep that in mind.', '{t}: o să țin minte.'],
  ['{t}, understood.', '{t}, am înțeles.'],
  ['{t}, noted.', '{t}, notat.'],
  ['{t}, a field with a lot going on.', '{t}, un domeniu în care se întâmplă multe.'],
  ['{t} it is.', '{t}, deci.'],
  ['{t} answers, understood.', '{t}, am înțeles.'],
  ['{t}: good to know.', '{t}: bine de știut.'],
  ['{t}, that sounds like interesting work.', '{t}, sună a muncă interesantă.'],
  ['{t}, nice!', '{t}, frumos!'],
  ['Understood: {t}.', 'Am înțeles: {t}.'],
  ['This year: {t}. Good luck!', 'Anul acesta: {t}. Noroc!'],
  ['Thanks, I will remember: children, {n}.', 'Mulțumesc, o să țin minte: copii, {n}.'],
  ['Thanks, I will remember that you are {n}.', 'Mulțumesc, o să țin minte că ai {n:de} ani.'],
  ['Studying {t}, I see.', 'Studiezi {t}, văd.'],
  ['So before that: {t}. Good to know.', 'Deci înainte: {t}. Bine de știut.'],
  ['Noted: children, {n}.', 'Notat: copii, {n}.'],
  ['Noted, {t}.', 'Notat, {t}.'],
  ['Nice, {t}.', 'Frumos, {t}.'],
  ['Nice to meet you, {t}!', 'Încântat să te cunosc, {t}!'],
  ['Nice pick: {t}.', 'Alegere bună: {t}.'],
  ['Learning {t}, I like it.', 'Înveți {t}, îmi place.'],
  ['Interesting path: {t}.', 'Drum interesant: {t}.'],
  ['I will keep {t} in mind.', 'O să țin minte {t}.'],
  ['I will keep it {t}.', 'O să păstrez {t}.'],
  ['Great, {t} it is.', 'Perfect, {t}, deci.'],
  ['Got it: {n} years old.', 'Am înțeles: {n:de} ani.'],
  ['Got it, children: {n}.', 'Am înțeles, copii: {n}.'],
  ['Got it, I will keep it {t}.', 'Am înțeles, o să păstrez {t}.'],
  ['Good, {n} years.', 'Bine, {n:de} ani.'],
  ['Good, {t} it is.', 'Bine, {t}, deci.'],
  ['Good skills, {t}.', 'Abilități bune, {t}.'],
  ['Curious about {t}, nice.', 'Curios despre {t}, frumos.'],
  ['Aiming for {t}, good.', 'Ținta este {t}, bine.'],
  ['Ah, {t}. Thanks!', 'Ah, {t}. Mulțumesc!'],
  ['Thanks, noted.', 'Mulțumesc, notat.'],
  ['OK, I will remember that. It stays in this browser, you can see it in the tab and delete it any time.', 'Bine, o să țin minte. Rămâne în acest browser, o poți vedea în filă și o poți șterge oricând.'],
  ['Great, thanks, I noted that.', 'Perfect, mulțumesc, am notat.'],
  ['You are {n} years old.', 'Ai {n:de} ani.'],
  ['I do not know your age yet. You can tell me, and I will remember it.', 'Încă nu știu câți ani ai. Mi-o poți spune și o țin minte.'],
  ['I do not know your name yet. You can tell me, and I will remember it.', 'Încă nu știu cum te cheamă. Mi-o poți spune și o țin minte.'],
  ['Your name is {t}.', 'Te numești {t}.'],
  ['{q}, noted.', '{q}, notat.'],
  ['{q}: noted.', '{q}: notat.'],
  ['Noted: {q}.', 'Notat: {q}.'],
  ['Nice, {q}!', 'Frumos, {q}!'],
  ['Got it: {q}.', 'Am înțeles: {q}.'],
  ['{q}: useful skills.', '{q}: abilități utile.'],
  ['{q}: that gives a solid base.', '{q}: asta dă o bază solidă.'],
  ['{q}: good taste.', '{q}: gust bun.'],
  ['{q}: good for the body and the mood.', '{q}: bun pentru corp și pentru dispoziție.'],
  ['{q}: ambitious, in a good way.', '{q}: ambițios, în sens bun.'],
  ['{q}: a solid toolbox.', '{q}: o trusă de unelte solidă.'],
  ['{q}: a great way to spend time.', '{q}: o modalitate grozavă de a-ți petrece timpul.'],
  ['{q}: a good thing to aim for.', '{q}: un lucru bun spre care să tinzi.'],
  ['{q}: a good rabbit hole.', '{q}: o pasiune în care merită să te adâncești.'],
  ['{q}: a clear direction.', '{q}: o direcție clară.'],
  ['{q}, that must have taught you something.', '{q}, asta trebuie să te fi învățat ceva.'],
  ['{q}, thanks.', '{q}, mulțumesc.'],
  ['{q}, nice.', '{q}, frumos.'],
  ['{q}, lovely to meet you.', '{q}, mă bucur să te cunosc.'],
  ['{q}, good to know.', '{q}, bine de știut.'],
  ['{q}, a good place to be based!', '{q}, un loc bun în care să locuiești!'],
  ['{q}, I like that.', '{q}, îmi place.'],
  ['{q}: I will keep that in mind.', '{q}: o să țin minte.'],
  ['{q}, understood.', '{q}, am înțeles.'],
  ['{q}, noted.', '{q}, notat.'],
  ['{q}, a field with a lot going on.', '{q}, un domeniu în care se întâmplă multe.'],
  ['{q} it is.', '{q}, deci.'],
  ['{q} answers, understood.', '{q}, am înțeles.'],
  ['{q}: good to know.', '{q}: bine de știut.'],
  ['{q}, that sounds like interesting work.', '{q}, sună a muncă interesantă.'],
  ['{q}, nice!', '{q}, frumos!'],
  ['Understood: {q}.', 'Am înțeles: {q}.'],
  ['This year: {q}. Good luck!', 'Anul acesta: {q}. Noroc!'],
  ['Studying {q}, I see.', 'Studiezi {q}, văd.'],
  ['So before that: {q}. Good to know.', 'Deci înainte: {q}. Bine de știut.'],
  ['Noted, {q}.', 'Notat, {q}.'],
  ['Nice, {q}.', 'Frumos, {q}.'],
  ['Nice to meet you, {q}!', 'Încântat să te cunosc, {q}!'],
  ['Nice pick: {q}.', 'Alegere bună: {q}.'],
  ['Learning {q}, I like it.', 'Înveți {q}, îmi place.'],
  ['Interesting path: {q}.', 'Drum interesant: {q}.'],
  ['I will keep {q} in mind.', 'O să țin minte {q}.'],
  ['I will keep it {q}.', 'O să păstrez {q}.'],
  ['Great, {q} it is.', 'Perfect, {q}, deci.'],
  ['Got it, I will keep it {q}.', 'Am înțeles, o să păstrez {q}.'],
  ['Good, {q} it is.', 'Bine, {q}, deci.'],
  ['Good skills, {q}.', 'Abilități bune, {q}.'],
  ['Curious about {q}, nice.', 'Curios despre {q}, frumos.'],
  ['Aiming for {q}, good.', 'Ținta este {q}, bine.'],
  ['Ah, {q}. Thanks!', 'Ah, {q}. Mulțumesc!'],
  ['Your name is {q}.', 'Te numești {q}.'],
  ['Your {lst} list is empty.', 'Lista ta de {lst} este goală.'], ['You can say: Add milk to my shopping list.', 'Poți spune: Adaugă lapte pe lista mea de cumpărături.'],
  ['I have not asked a question right now.', 'Nu am pus nicio întrebare acum.'], ['Nobody has moved yet.', 'Nimeni nu a mutat încă.'],
  ['You had {n} lei, so {n2} lei are left.', 'Ai avut {n:de} lei, deci au rămas {n2:de} lei.'], ['You had {n} lei, so {n2} leu is left.', 'Ai avut {n:de} lei, deci a rămas {n2} leu.'],
  ['You only had {n} lei, so you cannot spend {n2} lei.', 'Ai avut doar {n:de} lei, deci nu poți cheltui {n2:de} lei.'],
  ['You only had {n} leu, so you cannot spend {n2} lei.', 'Ai avut doar {n} leu, deci nu poți cheltui {n2:de} lei.'],
  ['I asked "{t}" because it splits the {n} animals I still think of into {n2} that would say yes and {n3} that would not, which is as even as I can get.', 'Am întrebat "{t}" pentru că împarte cele {n:de} animale la care încă mă gândesc în {n2} care ar spune da și {n3} care ar spune nu, cât se poate de egal.'],
  // the denies of the games, one entry per sentence (the translator splits a reply into sentences)
  ['The game is over.', 'Jocul s-a terminat.'], ['Say "new game" to play again.', 'Spune "joc nou" ca să joci din nou.'],
  ['We are not playing hangman.', 'Nu jucăm spânzurătoarea.'], ['Say "play hangman" to start.', 'Spune "joacă spânzurătoarea" ca să începem.'],
  ['We are not playing twenty questions.', 'Nu jucăm douăzeci de întrebări.'], ['Say "guess my animal" to start.', 'Spune "ghicește animalul meu" ca să începem.'],
  ['I am waiting to learn the animal.', 'Aștept să aflu animalul.'], ['Tell me, for example: "it was a zebra".', 'Spune-mi, de exemplu: "a fost o zebră".'],
  ['Please answer yes or no: is it {t}?', 'Răspunde cu da sau nu: este {t}?'],
  ['{pos} is already taken by you.', '{pos} este deja luat de tine.'], ['{pos} is already taken by me.', '{pos} este deja luat de mine.'], ['Please pick another place.', 'Alege alt loc, te rog.'],
  ["OK, let's play guess the animal!", 'Bine, hai să jucăm ghicește animalul!'], ['Think of an animal and I will try to guess it.', 'Gândește-te la un animal și voi încerca să-l ghicesc.'],
  ["Answer with yes, no, I don't know or maybe.", 'Răspunde cu da, nu, nu știu sau poate.'],
  // ---- lists
  ['Hello!', 'Bună!'],
  // ---- RO-LEFTOVERS: the most frequent replies of the Romanian operational set that ended as the fixed fallback line
  ['I do not know what "{q}" is.', 'Nu știu ce este „{q}”.'],
  ['You can say the house, the tree, the sun, it, or everything.', 'Poți spune casa, copacul, soarele, asta sau totul.'],
  ['You can say the car, the tree, the sky, the grass, or everything.', 'Poți spune mașina, copacul, cerul, iarba sau totul.'],
  ['I do not know what you mean by "{q}" yet.', 'Încă nu știu ce vrei să spui prin „{q}”.'],
  ['Draw something first, or say which thing you mean.', 'Desenează mai întâi ceva sau spune la ce te referi.'],
  ['I did not understand where to put it ("{q}").', 'Nu am înțeles unde să pun asta („{q}”).'],
  ['You can say, for example: "{ex}", "{ex2}" or "{ex3}".', 'Poți spune, de exemplu: „{ex}”, „{ex2}” sau „{ex3}”.'],
  ['You can say, for example: "{ex}" or "{ex2}".', 'Poți spune, de exemplu: „{ex}” sau „{ex2}”.'],
  ['{place} borders {n} countries: {plist}.', '{place} se învecinează cu {n:de} țări: {plist}.'], ['{place} borders {n} country: {plist}.', '{place} se învecinează cu {n} țară: {plist}.'],
  ['Chess: You play White against me.', 'Șah: joci cu albele împotriva mea.'],
  ['Say your moves in plain English ("{q}", "{q2}", "{q3}", "{q4}").', 'Spune-ți mutările simplu („calul la f3”, „e2 la e4”, „nebunul ia c6”, „rocadă mică”).'],
  ['I could not find "{q}" in the document.', 'Nu am găsit „{q}” în document.'],
  ['I am still thinking of {n} animals: {anl}.', 'Mă gândesc încă la {n:de} animale: {anl}.'], ['I am still thinking of {n} animal: {anl}.', 'Mă gândesc încă la {n} animal: {anl}.'],
  ['It is night now: a dark sky, a moon and lots of stars.', 'Acum este noapte: un cer întunecat, o lună și o mulțime de stele.'],
  ['{place} and {place2} are about {nk} km ({nk2} miles) apart, as the crow flies.', '{place} și {place2} sunt la aproximativ {nk:de} km ({nk2:de} mile) distanță, în linie dreaptă.'],
  ['{place} and {place2} are about {nk} km ({nk2} miles) apart, measured between their centres, as the crow flies.', '{place} și {place2} sunt la aproximativ {nk:de} km ({nk2:de} mile) distanță, măsurat între centrele lor, în linie dreaptă.'],
  ['You are about {nk} km ({nk2} miles) from {place}, as the crow flies.', 'Ești la aproximativ {nk:de} km ({nk2:de} mile) de {place}, în linie dreaptă.'],
  ['The major key with {n} sharps is {note} major (its relative minor is {note2} minor).', 'Tonalitatea majoră cu {n} diezi este {note} major (relativa ei minoră este {note2} minor).'],
  ['The major key with {n} flats is {note} major (its relative minor is {note2} minor).', 'Tonalitatea majoră cu {n} bemoli este {note} major (relativa ei minoră este {note2} minor).'],
  ['The major key with 1 sharp is {note} major (its relative minor is {note2} minor).', 'Tonalitatea majoră cu 1 diez este {note} major (relativa ei minoră este {note2} minor).'],
  ['The major key with 1 flat is {note} major (its relative minor is {note2} minor).', 'Tonalitatea majoră cu 1 bemol este {note} major (relativa ei minoră este {note2} minor).'],
  ['OK, I undid it: the list you added is gone.', 'Bine, am anulat: lista pe care ai adăugat-o a dispărut.'],
  ['{tl} is the biggest, with {n}.', 'Cel mai mare: {tl}, cu {n}.'], ['{tl} is the smallest, with {n}.', 'Cel mai mic: {tl}, cu {n}.'],
  ['{tl} are the biggest, with {n}.', 'Cei mai mari: {tl}, cu {n}.'], ['{tl} are the smallest, with {n}.', 'Cei mai mici: {tl}, cu {n}.'],
  ['I can chat, talk about shapes and colors, shopping, animals and time, draw pictures, charts and diagrams, do sums, keep your lists, edit documents, answer questions about your documents, play chess, guess the animal, hangman, tic-tac-toe and music, show places on a map, change my face, and get to know you and keep your profile.', 'Pot sta de vorbă, pot vorbi despre forme și culori, cumpărături, animale și timp, pot desena imagini, grafice și diagrame, pot face calcule, îți pot ține listele, pot edita documente, pot răspunde la întrebări despre documentele tale, pot juca șah, ghicește animalul, spânzurătoarea, x și 0 și muzică, pot arăta locuri pe hartă, îmi pot schimba fața și pot învăța despre tine și îți pot ține profilul.'],
  ['I can draw a house, a tree, a sun, a cloud, a car, a flower, a cat, a dog, a fish, a bird, a boat, a mountain, a rainbow, a person, a balloon, a rocket, a moon, and shapes like a circle, a square, a triangle, a star, a heart, a line or an arrow.', 'Pot desena o casă, un copac, un soare, un nor, o mașină, o floare, o pisică, un câine, un pește, o pasăre, o barcă, un munte, un curcubeu, o persoană, un balon, o rachetă, o lună și forme precum un cerc, un pătrat, un triunghi, o stea, o inimă, o linie sau o săgeată.'],

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
}).sort((a, b) => (b.keys.includes('avl') - a.keys.includes('avl')) || b.re.source.length - a.re.source.length);   // the avatar's authored part phrases first, then the most specific

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
