// Phrase table and question frames, applied before word-by-word translation (browser-safe).
//
// Pattern syntax (space separated elements, literals are diacritic-insensitive):
//   word | a|b|c        literal token, or alternatives
//   {np} {num} {name} {w} {rest}    slots (noun phrase, number, name, any word, rest of the sentence)
// Output template: words with {slot} placeholders; {num:times} renders "twice" / "3 times".
// A frame may instead define `token`, which replaces the matched words by ONE lexical token
// (multi-word units that must still take part in the clause grammar: "de ce" -> wh why).
//   full:true   must cover the whole sentence       start:true   must begin the sentence

import { COMMAND_FRAMES } from './phrases.commands.ro-en.mjs';

const BASE_FRAMES = [
  // ---- greetings and chat
  { p: 'bună ziua', out: 'hello' },
  { p: 'bună dimineața', out: 'good morning' },
  { p: 'bună seara', out: 'good evening' },
  { p: 'noapte bună', out: 'good night' },
  { p: 'la revedere', out: 'goodbye' },
  { p: 'pe curând', out: 'see you soon' },
  { p: 'mulțumesc frumos|mult', out: 'thank you very much' },
  { p: 'vă|îți mulțumesc', out: 'thank you' },
  { p: 'te|vă rog', out: 'please' },
  { p: 'cu plăcere', out: 'you are welcome' },
  { p: 'îmi pare rău', out: 'I am sorry' },
  { p: 'scuză-mă|iartă-mă', out: 'excuse me' },
  { p: 'ce mai faci|faceți', out: 'how are you' },
  { p: 'cum ești', out: 'how are you' },
  { p: 'ce faci', out: 'what are you doing', full: true },
  { p: 'cum te|vă cheamă', out: 'what is your name' },
  { p: 'cum te numești', out: 'what is your name' },
  { p: 'cum mă cheamă', out: 'what is my name' },
  { p: 'mă cheamă {name}', out: 'my name is {name}' },
  { p: 'mă numesc {name}', out: 'my name is {name}' },
  { p: 'te cheamă {name}', out: 'your name is {name}' },
  { p: 'se numește|se cheamă {name}', out: 'is called {name}' },
  { p: 'cum se numește {np}', out: 'what is {np} called' },
  // ---- time
  { p: 'cât e|este ceasul', out: 'what time is it' },
  { p: 'cât e|este ora', out: 'what time is it' },
  { p: 'ce oră e|este', out: 'what time is it' },
  { p: 'nu se poate', out: 'it is not possible' },
  { p: 'se poate', out: 'it is possible' },
  { p: 'ce zi e|este azi|astăzi', out: 'what day is it today' },
  { p: 'ce zi e|este mâine', out: 'what day is it tomorrow' },
  { p: 'ora e|este {num}', out: 'it is {num} o\'clock', start: true },
  { p: 'ce formă are {np}', out: 'what shape is {np}' },
  { p: 'ce formă au {np}', out: 'what shape are {np}' },
  { p: 'e|este ora {num}', out: 'it is {num} o\'clock' },
  { p: 'la ora {num}', out: 'at {num} o\'clock' },
  { p: 'ora {num}', out: '{num} o\'clock' },
  { p: 'de {num} ori mai multe|mulți', out: '{num:times} as many' },
  { p: 'de {num} ori mai mult|multă', out: '{num:times} as much' },
  { p: 'de {num} ori', out: '{num:times}' },
  // ---- age, feelings, needs
  { p: 'câți ani ai', out: 'how old are you' },
  { p: 'câți ani are {name}', out: 'how old is {name}' },
  { p: 'am {num} ani', out: 'I am {num} years old' },
  { p: 'ai {num} ani', out: 'you are {num} years old' },
  { p: '{name} are {num} ani', out: '{name} is {num} years old' },
  { p: 'mi-e|ți-e foame', out: 'I am hungry', sub: { 'ți-e': 'you are hungry' } },
  { p: 'mi-e|ți-e sete', out: 'I am thirsty', sub: { 'ți-e': 'you are thirsty' } },
  { p: 'mi-e|ți-e frică', out: 'I am afraid', sub: { 'ți-e': 'you are afraid' } },
  { p: 'mi-e|ți-e somn', out: 'I am sleepy', sub: { 'ți-e': 'you are sleepy' } },
  { p: 'mi-e|ți-e frig', out: 'I am cold', sub: { 'ți-e': 'you are cold' } },
  { p: 'mi-e|ți-e cald', out: 'I am hot', sub: { 'ți-e': 'you are hot' } },
  { p: 'am|ai nevoie de {np}', out: 'I need {np}', sub: { ai: 'you need {np}' } },
  // ---- question frames
  { p: 'ce culoare are {np}', out: 'what color is {np}' },
  { p: 'ce culoare au {np}', out: 'what color are {np}' },
  { p: 'de ce culoare e|este {np}', out: 'what color is {np}' },
  { p: 'de ce culoare sunt {np}', out: 'what color are {np}' },
  { p: 'cât face|fac {rest}', out: 'what is {rest}', start: true },
  { p: 'cât e|este {num} {rest}', out: 'what is {num} {rest}', start: true },
  { p: 'ce am de făcut', out: 'what do I have to do' },
  { p: 'ce ai de făcut', out: 'what do you have to do' },
  { p: 'ce înseamnă {rest}', out: 'what does {rest} mean' },
  // ---- lists
  { p: 'de pe', token: { fpos: 'prep', en: 'from' } },
  { p: 'de la', token: { fpos: 'prep', en: 'from' } },
  { p: 'până la', token: { fpos: 'prep', en: 'until' } },
  { p: 'înainte de', token: { fpos: 'prep', en: 'before' } },
  { p: 'în loc de', token: { fpos: 'prep', en: 'instead of' } },
  // ---- multi-word lexical units
  { p: 'de ce', token: { fpos: 'wh', en: 'why', kind: 'why' } },
  { p: 'pentru că', token: { fpos: 'conj', en: 'because', flags: ['sub'] } },
  { p: 'în total', token: { fpos: 'adv', en: 'in total', flags: ['end'] } },
  { p: 'din nou', token: { fpos: 'adv', en: 'again', flags: ['end'] } },
  { p: 'cel puțin', token: { fpos: 'adv', en: 'at least' } },
  { p: 'la fel', token: { fpos: 'adv', en: 'the same' } },
  { p: 'de exemplu', token: { fpos: 'adv', en: 'for example', flags: ['lead'] } },
  { p: 'împărțit la|cu', token: { fpos: 'op', en: 'divided by' } },
  { p: 'înmulțit cu', token: { fpos: 'op', en: 'times' } },
  { p: 'adunat cu', token: { fpos: 'op', en: 'plus' } },
  { p: 'egal cu', token: { fpos: 'op', en: 'equals' } },
  { p: 'ca să', token: { fpos: 'sa', en: 'in order' } },
  { p: 'o să', token: { fpos: 'sa', en: '', flags: ['fut'] } },
  { p: 'mic dejun', token: { fpos: 'noun', en: 'breakfast', mass: true } },
  { p: 'micul dejun', token: { fpos: 'noun', en: 'breakfast', mass: true, def: true } },
  { p: 'zi de naștere', token: { fpos: 'noun', en: 'birthday' } },
  { p: 'ziua de naștere', token: { fpos: 'noun', en: 'birthday', def: true } },
  { p: 'gumă de mestecat', token: { fpos: 'noun', en: 'chewing gum', mass: true } },
  { p: 'broască țestoasă', token: { fpos: 'noun', en: 'turtle', anim: true } },
  { p: 'x și 0', token: { fpos: 'noun', en: 'tic tac toe', mass: true } },
  { p: '20 de întrebări', token: { fpos: 'noun', en: 'twenty questions', mass: true } },
  { p: 'modul fără mâini', token: { fpos: 'noun', en: 'hands-free mode', mass: true } },
  { p: 'pălărie de petrecere', token: { fpos: 'noun', en: 'party hat' } },
  { p: 'animale marine', token: { fpos: 'noun', en: 'sea animals', mass: true } },
  { p: 'animalele marine', token: { fpos: 'noun', en: 'sea animals', mass: true, def: true } },
  { p: 'animale de la fermă', token: { fpos: 'noun', en: 'farm animals', mass: true } },
  { p: 'animalele de la fermă', token: { fpos: 'noun', en: 'farm animals', mass: true, def: true } },
];

export const FRAMES = [...BASE_FRAMES, ...COMMAND_FRAMES];

export default FRAMES;
