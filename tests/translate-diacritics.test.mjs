// Language detection without diacritics (task L-RO): Romanian typed without ă/â/î/ș/ț is still detected and translated,
// while short English input stays English (it is never detected as Romanian, so the session language is kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLanguage, translate } from '../src/translate/index.mjs';

// [diacritic-less Romanian, expected English translation]
const RO = [
  ['cat face 3 plus 4', 'What is 3 plus 4'],
  ['Cat face 2 ori 5?', 'What is 2 times 5'],
  ['cat fac 10 minus 3', 'What is 10 minus 3'],
  ['Cate mere are Ion?', 'How many apples does Ion have?'],
  ['Cum te cheama?', 'What is your name?'],
  ['Multumesc!', 'Thank you!'],
  ['Multumesc frumos', 'Thank you very much'],
  ['La revedere!', 'Goodbye!'],
  ['Buna ziua', 'Hello'],
  ['Ce poti face?', 'What can you do?'],
  ['Cine esti?', 'Who are you?'],
  ['Adauga lapte pe lista mea.', 'Add milk to my list.'],
  ['Pune paine pe lista mea.', 'Put bread on my list.'],
  ['Sterge laptele de pe lista mea.', 'Remove milk from my list.'],
  ['Arata-mi lista mea de cumparaturi.', 'Show me my shopping list.'],
  ['Ce este pe lista mea?', 'What is on my list?'],
  ['Este tema pe lista mea?', 'Is homework on my list?'],
  ['Am cumparat lapte.', 'I bought milk.'],
  ['Trebuie sa cumpar lapte.', 'I need to buy milk.'],
  ['Cate lucruri sunt pe lista mea?', 'How many things are on my list?'],
  ['Cate picioare are un paianjen?', 'How many legs does a spider have?'],
  ['Ce mananca un iepure?', 'What does a rabbit eat?'],
  ['Este balena un peste?', 'Is the whale a fish?'],
  ['Poate un pinguin sa zboare?', 'Can a penguin fly?'],
  ['Aduna 3 si 4.', 'Add 3 and 4.'],
  ['Sterge paragraful 2.', 'Delete paragraph 2.'],
  ['Goleste documentul.', 'Clear the document.'],
  ['Anuleaza.', 'Undo.'],
  ['Citeste documentul.', 'Read the document.'],
  ['Copiaza documentul.', 'Copy the document.'],
  ['Descarca documentul.', 'Download the document.'],
  ['Incepe dictarea.', 'Start dictation.'],
  ['Opreste dictarea.', 'Stop dictation.'],
  ['Nu stiu.', 'I do not know.'],
  ['Repeta intrebarea.', 'Repeat the question.'],
  ['Arata-mi cuvantul.', 'Show me the word.'],
  ['Golește tabla.'.normalize('NFD').replace(/\p{M}/gu, ''), 'Clear the board.'],
  ['Cumpar 3 creioane.', 'I buy 3 pencils.'],
  ['Am 20 de lei.', 'I have 20 lei.'],
  ['Vopseste-te roz.', 'Paint yourself pink.'],
  ['Arata surprins.', 'Look surprised.'],
  ['Inchide gura.', 'Close your mouth.'],
  ['Zambesti?', 'Are you smiling?'],
  ['Ce culoare au ochii tai?', 'What color are your eyes?'],
  ['Unde te uiti?', 'Where are you looking?'],
  ['Incepe sa clipesti.', 'Start blinking.'],
  ['De acum esti Robi.', 'From now on you are Robi.'],
  ['Porneste-ti antena.', 'Turn on your antenna.'],
  ['Resetează-ți fața.'.normalize('NFD').replace(/\p{M}/gu, ''), 'Reset your face.'],
  ['Resetează.'.normalize('NFD').replace(/\p{M}/gu, ''), 'Reset.'],
  ['Accelerează.'.normalize('NFD').replace(/\p{M}/gu, ''), 'Speed up.'],
  ['Incetineste.', 'Slow down.'],
];

test('Romanian without diacritics: detected as Romanian and translated correctly', () => {
  assert.ok(RO.length >= 40);
  const bad = [];
  for (const [ro, en] of RO) {
    const d = detectLanguage(ro).lang;
    const t = translate(ro, { from: 'ro', to: 'en' }).text;
    const norm = (s) => s.replace(/[.?!]+$/, '').toLowerCase();
    if (d !== 'ro' || norm(t) !== norm(en)) bad.push(`${ro} -> ${d} / ${t} (wanted ${en})`);
  }
  assert.deepEqual(bad, []);
});

test('Romanian equivalence set with the diacritics stripped: detection and translation hold', () => {
  const src = readFileSync(new URL('./translate-equivalence.test.mjs', import.meta.url), 'utf8');
  const a = src.indexOf('const TWINS = [');
  const twins = new Function(`return ${src.slice(a + 'const TWINS = '.length, src.indexOf('\n];', a) + 2)}`)();
  const strip = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
  let detected = 0, same = 0;
  for (const [, ro] of twins) {
    const s = strip(ro);
    if (detectLanguage(s).lang === 'ro') detected++;
    if (translate(s, { from: 'ro', to: 'en' }).text === translate(ro, { from: 'ro', to: 'en' }).text) same++;
  }
  console.log(`diacritics stripped: ${detected}/${twins.length} detected as Romanian, ${same}/${twins.length} translate exactly like the original`);
  assert.ok(twins.length >= 400);
  assert.ok(detected / twins.length >= 0.9, `detected ${detected}/${twins.length}`);
  assert.ok(same / twins.length >= 0.93, `same translation ${same}/${twins.length}`);
});

const EN = [
  'cat', 'cats', 'face', 'faces', 'make', 'do', 'it', 'do it', 'make it red', 'make it bigger', 'draw a cat', 'draw a cat face', 'a cat face',
  'are you there', 'are', 'are you ok', 'care for a game', 'care', 'la la la', 'la', 'do re mi fa sol la si', 'pune', 'no', 'yes', 'ok', 'okay', 'hello',
  'hi', 'thanks', 'thank you', 'a', 'an apple', 'an', 'the cat', 'my cat', 'the cat is on the mat', 'what is a cat', 'how are you', 'what can you do',
  'i am here', 'am i right', 'i am 7', 'what is 3 plus 4', 'plus', 'minus', 'show me a cat', 'play a game', 'let us play', 'new game', 'start over',
  'undo', 'redo', 'delete it', 'clear the board', 'draw a face', 'a face with a hat', 'give me a hint', 'quit', 'stop', 'go on', 'again', 'sorry',
  'cat face', 'face the cat', 'how much is a cat', 'the cat is cute', 'how many cats are there', 'there are 3 cats', 'we are 3', 'they are 3 and 4',
  'are 3 and 4 equal', 'what are 3 plus 4', 'tell me what the cats are doing', 'ce', 'do you care', 'take care', 'let me know', 'e', 'e, no, z', 'x',
  'to do list', 'face up', 'a la carte', 'made it', 'nu', 'da',
];

test('short English input is never detected as Romanian', () => {
  assert.ok(EN.length >= 60);
  const bad = EN.filter((s) => detectLanguage(s).lang === 'ro');
  assert.deepEqual(bad, []);
});

test('clear short English input is detected as English', () => {
  for (const s of ['are you there', 'how are you', 'what can you do', 'hello', 'the cat is on the mat', 'there are 3 cats', 'what is 3 plus 4']) {
    assert.equal(detectLanguage(s).lang, 'en', s);
  }
});

test('truly ambiguous one-word input keeps the session language (unknown)', () => {
  for (const s of ['nu', 'da', 'ce', 'e', 'la', 'cat', 'face', 'are', 'care', 'pune']) assert.notEqual(detectLanguage(s).lang, 'ro', s);
});
