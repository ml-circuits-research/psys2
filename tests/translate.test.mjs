import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage, translate, createTranslator, normalizeText, foldKey, lemmaOfNoun, analyzeVerbForm, stripAdjAgreement,
} from '../src/translate/index.mjs';
import { lexiconSize, nouns, verbs, adjectives } from '../src/translate/lexicon.ro-en.mjs';
import { parseNumberAt } from '../src/translate/morphology.ro.mjs';
import { pluralEn, thirdPersonEn, pastEn, aAn, questionFrame, verbWords } from '../src/translate/inflect.en.mjs';

const ro = (s) => translate(s, { from: 'ro', to: 'en' });
const en = (s) => translate(s, { from: 'en', to: 'ro' });

// ----------------------------------------------------------------- required examples
const REQUIRED = [
  ['Ion are 5 mere.', 'Ion has 5 apples.'],
  ['Maria îi dă lui Ion 3 mere.', 'Maria gives Ion 3 apples.'],
  ['Câte mere are Ion?', 'How many apples does Ion have?'],
  ['Câte picioare are o pisică?', 'How many legs does a cat have?'],
  ['Ce mănâncă iepurele?', 'What does the rabbit eat?'],
  ['Pisica nu zboară.', 'The cat does not fly.'],
  ['Cât face 7 plus 5?', 'What is 7 plus 5?'],
  ['Cât costă o minge?', 'How much does a ball cost?'],
  ['Adaugă lapte pe listă.', 'Add milk to the list.'],
  ['Dacă plouă, iau umbrela.', 'If it rains, I take the umbrella.'],
  ['Cât e ceasul?', 'What time is it?'],
  ['Bună! Cum te cheamă?', 'Hello! What is your name?'],
];
for (const [src, want] of REQUIRED) {
  test(`required: ${src}`, () => assert.equal(ro(src).text, want));
}

// ----------------------------------------------------------------- domains (ro -> en)
const DOMAINS = {
  greetings: [
    ['Bună ziua!', 'Hello!'],
    ['Bună dimineața!', 'Good morning!'],
    ['Salut, Ion!', 'Hi, Ion!'],
    ['Mulțumesc!', 'Thank you!'],
    ['Mulțumesc, la revedere!', 'Thank you, goodbye!'],
    ['Cine ești?', 'Who are you?'],
    ['Cine ești tu?', 'Who are you?'],
    ['Ce poți face?', 'What can you do?'],
    ['Ce mai faci?', 'How are you?'],
    ['Mă cheamă Andrei.', 'My name is Andrei.'],
    ['Nu înțeleg întrebarea.', 'I do not understand the question.'],
    ['Nu știu.', 'I do not know.'],
    ['Da, am mere.', 'Yes, I have apples.'],
    ['Nu, nu am mere.', 'No, I do not have apples.'],
    ['Te rog, adaugă ouă pe listă.', 'Please, add eggs to the list.'],
    ['Pot să te ajut?', 'Can I help you?'],
  ],
  arithmetic: [
    ['Ion avea 5 mere.', 'Ion had 5 apples.'],
    ['Maria a dat 3 mere lui Ion.', 'Maria gave Ion 3 apples.'],
    ['Ion primește 4 mingi.', 'Ion receives 4 balls.'],
    ['Ion a primit două creioane.', 'Ion received 2 pencils.'],
    ['Ana mănâncă un măr.', 'Ana eats an apple.'],
    ['Copiii au mâncat merele.', 'The children ate the apples.'],
    ['Am cumpărat pâine.', 'I bought bread.'],
    ['Maria pierde 2 lei.', 'Maria loses 2 lei.'],
    ['Rămân 3 mere.', '3 apples are left.'],
    ['Câte mere rămân?', 'How many apples are left?'],
    ['Câte mere au în total?', 'How many apples do they have in total?'],
    ['Ion mănâncă 2 mere. Câte mere mai are Ion?', 'Ion eats 2 apples. How many apples does Ion have left?'],
    ['Ion are mai multe mere decât Maria.', 'Ion has more apples than Maria.'],
    ['Maria are de două ori mai multe mere decât Ion.', 'Maria has twice as many apples as Ion.'],
    ['Cât face 10 împărțit la 2?', 'What is 10 divided by 2?'],
    ['Cât face 3 ori 4?', 'What is 3 times 4?'],
    ['Cât face 9 minus 4?', 'What is 9 minus 4?'],
    ['Cât e 3 plus 4?', 'What is 3 plus 4?'],
    ['Ion pierde 3 mingi și găsește 1 minge.', 'Ion loses 3 balls and Ion finds 1 ball.'],
    ['Ion are cinci mere și Maria are trei pere.', 'Ion has 5 apples and Maria has 3 pears.'],
    ['Maria are 20 de mere.', 'Maria has 20 apples.'],
    ['Ion îi dă Mariei un măr.', 'Ion gives Maria an apple.'],
    ['Ion a mâncat 2 mere și a dat 3 mere Mariei.', 'Ion ate 2 apples and Ion gave Maria 3 apples.'],
    ['Maria dă mere copiilor.', 'Maria gives the children apples.'],
    ['Nu știu câte pere are Ana.', 'I do not know how many pears Ana has.'],
    ['Dacă Ion are 5 mere, Maria are 3.', 'If Ion has 5 apples, Maria has 3.'],
  ],
  money: [
    ['Cât costă mingea?', 'How much does the ball cost?'],
    ['Mingea costă 5 lei.', 'The ball costs 5 lei.'],
    ['Câți lei are Ion?', 'How many lei does Ion have?'],
    ['Câți bani are Maria?', 'How much money does Maria have?'],
    ['Câți lei costă 3 creioane?', 'How many lei do 3 pencils cost?'],
    ['Un pix costă 3 lei.', 'A pen costs 3 lei.'],
    ['Cât rest primește Maria?', 'How much change does Maria receive?'],
    ['Ion are o sută de lei.', 'Ion has 100 lei.'],
  ],
  time: [
    ['Ce oră este?', 'What time is it?'],
    ['Este ora 3.', 'It is 3 o\'clock.'],
    ['Ce zi este azi?', 'What day is it today?'],
    ['Azi este luni.', 'Today it is Monday.'],
    ['Luni merg la școală.', 'On Monday I go to school.'],
    ['Seara citesc o carte.', 'In the evening I read a book.'],
    ['Dimineața Ion mănâncă un măr.', 'In the morning Ion eats an apple.'],
    ['Săptămâna are șapte zile.', 'The week has 7 days.'],
    ['Anul are 12 luni.', 'The year has 12 months.'],
    ['În septembrie începe școala.', 'In September the school begins.'],
    ['Ieri a fost duminică.', 'Yesterday it was Sunday.'],
    ['Va ploua mâine.', 'It will rain tomorrow.'],
  ],
  animals: [
    ['Un păianjen are opt picioare.', 'A spider has 8 legs.'],
    ['Câte aripi are o pasăre?', 'How many wings does a bird have?'],
    ['Câte picioare au păsările?', 'How many legs do the birds have?'],
    ['Pasărea zboară.', 'The bird flies.'],
    ['Peștele înoată.', 'The fish swims.'],
    ['Peștele nu zboară.', 'The fish does not fly.'],
    ['Câinele are blană.', 'The dog has fur.'],
    ['Elefantul este un mamifer.', 'The elephant is a mammal.'],
    ['Ce este un mamifer?', 'What is a mammal?'],
    ['Unde trăiește pinguinul?', 'Where does the penguin live?'],
    ['Iepurele trăiește în pădure.', 'The rabbit lives in the forest.'],
    ['Care animal are aripi?', 'Which animal has wings?'],
    ['Câți copii au mere?', 'How many children have apples?'],
    ['Cine zboară?', 'Who flies?'],
    ['Ce mănâncă pisicile?', 'What do the cats eat?'],
    ['Delfinul este un mamifer, nu un pește.', 'The dolphin is a mammal, not a fish.'],
  ],
  colorsShapesFamily: [
    ['Ce culoare are mărul?', 'What color is the apple?'],
    ['Ce culoare au merele?', 'What color are the apples?'],
    ['Mărul este roșu.', 'The apple is red.'],
    ['Ion cumpără o minge roșie.', 'Ion buys a red ball.'],
    ['Ana are 3 creioane roșii și 2 creioane albastre.', 'Ana has 3 red pencils and 2 blue pencils.'],
    ['Cerul este albastru.', 'The sky is blue.'],
    ['Cercul este rotund.', 'The circle is round.'],
    ['Pătratul are patru laturi.', 'The square has 4 sides.'],
    ['Ce formă are mingea?', 'What shape is the ball?'],
    ['Mama lui Ion are o pisică neagră.', 'Ion\'s mother has a black cat.'],
    ['Bunica Mariei are o pisică.', 'Maria\'s grandmother has a cat.'],
    ['Ion are doi frați.', 'Ion has 2 brothers.'],
    ['Ion are un frate și o soră.', 'Ion has a brother and a sister.'],
    ['Câinele este mai mare decât pisica.', 'The dog is bigger than the cat.'],
    ['Elefantul este cel mai mare animal.', 'The elephant is the biggest animal.'],
    ['Cât de mare este elefantul?', 'How big is the elephant?'],
  ],
  tasks: [
    ['Adaugă pâine și lapte pe listă.', 'Add bread and milk to the list.'],
    ['Adaugă 3 mere pe listă.', 'Add 3 apples to the list.'],
    ['Șterge laptele de pe listă.', 'Delete the milk from the list.'],
    ['Ce am pe listă?', 'What do I have on the list?'],
    ['Ce este pe listă?', 'What is on the list?'],
    ['Arată-mi lista.', 'Show me the list.'],
    ['Amintește-mi să cumpăr pâine.', 'Remind me to buy bread.'],
    ['Fă o listă.', 'Make a list.'],
    ['Termină tema.', 'Finish the homework.'],
    ['Nu șterge lista!', 'Do not delete the list!'],
  ],
  grammar: [
    ['Vreau să mănânc o prăjitură.', 'I want to eat a pastry.'],
    ['Pot să înot.', 'I can swim.'],
    ['Nu pot zbura.', 'I can not fly.'],
    ['Ion va mânca două mere.', 'Ion will eat 2 apples.'],
    ['Maria o să cumpere pâine.', 'Maria will buy bread.'],
    ['Aș mânca o prăjitură.', 'I would eat a pastry.'],
    ['Tu ai mere?', 'Do you have apples?'],
    ['Are Ion mere?', 'Does Ion have apples?'],
    ['Ion are mere?', 'Does Ion have apples?'],
    ['Ion și Maria au mere.', 'Ion and Maria have apples.'],
    ['Ion o ajută pe Ana.', 'Ion helps Ana.'],
    ['Când plouă, pisica doarme.', 'When it rains, the cat sleeps.'],
    ['Știu că Ion are 5 mere.', 'I know that Ion has 5 apples.'],
    ['Pe masă sunt 3 mere.', 'On the table there are 3 apples.'],
    ['Cine a mâncat merele?', 'Who ate the apples?'],
    ['Unde locuiește pisica?', 'Where does the cat live?'],
    ['De ce plânge Maria?', 'Why does Maria cry?'],
    ['Ion are o pisică care mănâncă pește.', 'Ion has a cat that eats fish.'],
  ],
};
for (const [domain, cases] of Object.entries(DOMAINS)) {
  for (const [src, want] of cases) {
    test(`${domain}: ${src}`, () => assert.equal(ro(src).text, want));
  }
}

// ----------------------------------------------------------------- numbers in words
test('number words 0-1000 become digits', () => {
  const cases = [
    ['Ion are zero mere.', '0'], ['Ion are unu măr.', '1'], ['Ion are două mere.', '2'], ['Ion are doi frați.', '2'],
    ['Ion are unsprezece mere.', '11'], ['Ion are douăzeci și unu de mere.', '21'], ['Ion are patruzeci și cinci de mere.', '45'],
    ['Ion are o sută de lei.', '100'], ['Ion are două sute cincizeci de lei.', '250'], ['Ion are o sută douăzeci și trei de mere.', '123'],
    ['Ion are nouă sute nouăzeci și nouă de mere.', '999'], ['Maria are o mie de lei.', '1000'], ['Ion are 7 mere.', '7'],
  ];
  for (const [src, digits] of cases) {
    const out = ro(src).text;
    assert.ok(new RegExp(`\\b${digits}\\b`).test(out), `${src} -> ${out}`);
  }
  assert.deepEqual(parseNumberAt(['doua', 'sute', 'cincizeci', 'si', 'trei'], 0), { value: 253, len: 5 });
  assert.deepEqual(parseNumberAt(['o', 'suta'], 0), { value: 100, len: 2 });
  assert.equal(parseNumberAt(['o', 'minge'], 0), null);
});

// ----------------------------------------------------------------- diacritic-less input
test('diacritic-less input is accepted', () => {
  const cases = [
    ['cate mere are Ion', 'How many apples does Ion have?'],
    ['Cate picioare are o pisica?', 'How many legs does a cat have?'],
    ['Ce mananca iepurele?', 'What does the rabbit eat?'],
    ['Pisica nu zboara.', 'The cat does not fly.'],
    ['Cat face 7 plus 5?', 'What is 7 plus 5?'],
    ['Cat costa o minge?', 'How much does a ball cost?'],
    ['Adauga lapte pe lista.', 'Add milk to the list.'],
    ['Daca ploua, iau umbrela.', 'If it rains, I take the umbrella.'],
    ['Cat e ceasul?', 'What time is it?'],
    ['Buna! Cum te cheama?', 'Hello! What is your name?'],
    ['Maria ii da lui Ion 3 mere.', 'Maria gives Ion 3 apples.'],
    ['Ion a mancat doua mere.', 'Ion ate 2 apples.'],
    ['Ion are douazeci si unu de mere.', 'Ion has 21 apples.'],
  ];
  for (const [src, want] of cases) assert.equal(ro(src).text, want, src);
});

test('cedilla and comma-below forms are unified', () => {
  assert.equal(normalizeText('şţ ŞŢ'), 'șț ȘȚ');
  assert.equal(foldKey('Mulţumesc'), 'multumesc');
  assert.equal(foldKey('Mulțumesc'), foldKey('Mulţumesc'));
  assert.equal(foldKey('mănâncă'), 'mananca');
  assert.equal(ro('Mulţumesc, ţi-am dat un măr.').text, 'Thank you, I gave you an apple.');
  assert.equal(ro('Mulțumesc!').text, ro('Mulţumesc!').text);
});

// ----------------------------------------------------------------- morphology
test('noun lemma from definite, plural and case forms', () => {
  for (const w of ['mărul', 'merele', 'merelor', 'mere', 'mărului', 'măr']) assert.equal(lemmaOfNoun(w).lemma, 'măr', w);
  for (const w of ['pisica', 'pisicile', 'pisicilor', 'pisici', 'pisicii', 'pisică']) assert.equal(lemmaOfNoun(w).lemma, 'pisică', w);
  assert.equal(lemmaOfNoun('iepurele').lemma, 'iepure');
  assert.equal(lemmaOfNoun('băieții').lemma, 'băiat');
  assert.equal(lemmaOfNoun('copiilor').lemma, 'copil');
  assert.equal(lemmaOfNoun('tatăl').lemma, 'tată');
  assert.equal(lemmaOfNoun('merele').number, 'pl');
  assert.equal(lemmaOfNoun('mărul').def, true);
  assert.equal(lemmaOfNoun('zzzz'), null);
});

test('adjective agreement stripping', () => {
  assert.equal(stripAdjAgreement('frumoasă'), 'frumos');
  assert.equal(stripAdjAgreement('roșii'), 'roșu');
  assert.equal(stripAdjAgreement('neagră'), 'negru');
  assert.equal(stripAdjAgreement('mici'), 'mic');
});

test('verb forms: lemma, person, tense', () => {
  const has = (w, lemma, tense, person, number) =>
    analyzeVerbForm(w).some((a) => a.lemma === lemma && a.tense === tense && (person === undefined || (a.person === person && a.number === number)));
  assert.ok(has('are', 'avea', 'pres', 3, 'sg'));
  assert.ok(has('au', 'avea', 'pres', 3, 'pl'));
  assert.ok(has('avea', 'avea', 'impf', 3, 'sg'));
  assert.ok(has('dă', 'da', 'pres', 3, 'sg'));
  assert.ok(has('dat', 'da', 'part'));
  assert.ok(has('mâncat', 'mânca', 'part'));
  assert.ok(has('cumpărat', 'cumpăra', 'part'));
  assert.ok(has('primește', 'primi', 'pres', 3, 'sg'));
  assert.ok(has('mănâncă', 'mânca', 'pres', 3, 'sg'));
  assert.ok(has('cumpără', 'cumpăra', 'pres', 3, 'sg'));
  assert.ok(has('iau', 'lua', 'pres', 1, 'sg'));
  assert.ok(has('zboară', 'zbura', 'pres', 3, 'sg'));
});

test('perfect compus is rendered as English past', () => {
  assert.equal(ro('Ion a dat un măr.').text, 'Ion gave an apple.');
  assert.equal(ro('Ei au mâncat mere.').text, 'They ate apples.');
  assert.equal(ro('Am cumpărat o carte.').text, 'I bought a book.');
  assert.equal(ro('Maria nu a dat nimic.').text, 'Maria did not give anything.');
});

// ----------------------------------------------------------------- lexicon
test('lexicon has at least 600 entries and covers the demo domains', () => {
  assert.ok(lexiconSize >= 600, `size ${lexiconSize}`);
  assert.ok(nouns.length >= 300);
  assert.ok(verbs.length >= 100);
  assert.ok(adjectives.length >= 60);
  const animals = nouns.filter((n) => n.flags.has('anim') && !n.flags.has('kin'));
  assert.ok(animals.length >= 60, `animals ${animals.length}`);
  for (const w of ['măr', 'minge', 'creion', 'bomboană', 'leu', 'ceas', 'săptămână', 'picior', 'aripă', 'blană', 'mamă', 'tată', 'listă']) {
    assert.ok(nouns.some((n) => n.ro === w), w);
  }
});

// ----------------------------------------------------------------- English helpers
test('English inflection helpers', () => {
  assert.equal(pluralEn('apple'), 'apples');
  assert.equal(pluralEn('berry'), 'berries');
  assert.equal(pluralEn('box'), 'boxes');
  assert.equal(pluralEn('child'), 'children');
  assert.equal(thirdPersonEn('have'), 'has');
  assert.equal(thirdPersonEn('fly'), 'flies');
  assert.equal(thirdPersonEn('go'), 'goes');
  assert.equal(pastEn('walk'), 'walked');
  assert.equal(pastEn('add'), 'added');
  assert.equal(aAn('apple'), 'an');
  assert.equal(aAn('ball'), 'a');
  assert.equal(aAn('hour'), 'an');
  assert.equal(aAn('university'), 'a');
  assert.equal(questionFrame({ wh: 'how many apples', subject: 'Ion', verb: { base: 'have' } }), 'how many apples does Ion have');
  assert.equal(verbWords({ base: 'fly' }, { tense: 'pres', person: 3, number: 'sg', neg: true }).map((x) => x.w).join(' '), 'does not fly');
  assert.equal(verbWords({ base: 'eat', past: 'ate' }, { tense: 'past', person: 3, number: 'sg' }).map((x) => x.w).join(' '), 'ate');
});

// ----------------------------------------------------------------- result shape
test('translate returns the shape of spec 05', () => {
  const r = ro('Ion are 5 mere.');
  assert.deepEqual(Object.keys(r).sort(), ['alignment', 'confidence', 'notes', 'text', 'unknown']);
  assert.equal(typeof r.text, 'string');
  assert.ok(Array.isArray(r.alignment));
  assert.ok(Array.isArray(r.unknown));
  assert.ok(Array.isArray(r.notes));
  assert.equal(typeof r.confidence, 'number');
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  assert.equal(r.confidence, 1);
});

test('createTranslator exposes detectLanguage and translate', () => {
  const t = createTranslator();
  assert.equal(typeof t.detectLanguage, 'function');
  assert.equal(typeof t.translate, 'function');
  assert.equal(t.translate('Ion are 5 mere.', { from: 'ro', to: 'en' }).text, 'Ion has 5 apples.');
  assert.equal(t.detectLanguage('Ion are 5 mere.').lang, 'ro');
  assert.equal(t.translate('Ion are 5 mere.').text, 'Ion has 5 apples.');
});

test('same-language and unsupported pairs do not throw', () => {
  assert.equal(translate('Ion has 5 apples.', { from: 'en', to: 'en' }).text, 'Ion has 5 apples.');
  const r = translate('hallo', { from: 'de', to: 'en' });
  assert.equal(r.text, '');
  assert.equal(r.confidence, 0);
  assert.equal(ro('').text, '');
  assert.equal(ro('   ').text, '');
  assert.equal(ro('???').text, '???');
});

// ----------------------------------------------------------------- language detection
test('detectLanguage', () => {
  for (const s of ['Ion are 5 mere.', 'Câte mere are Ion?', 'cate mere are Ion', 'Pisica nu zboară.', 'Bună! Cum te cheamă?', 'Mulțumesc frumos', 'Adaugă lapte pe listă']) {
    assert.equal(detectLanguage(s).lang, 'ro', s);
  }
  for (const s of ['Ion has 5 apples.', 'How many apples does Ion have?', 'The cat does not fly.', 'Hello! What is your name?', 'I do not know how many pears Ana has.', 'It is 3 o\'clock.']) {
    assert.equal(detectLanguage(s).lang, 'en', s);
  }
  assert.equal(detectLanguage('').lang, 'unknown');
  assert.equal(detectLanguage('xyzzy plugh').lang, 'unknown');
  const d = detectLanguage('Câte mere are Ion?');
  assert.ok(d.confidence > 0.5 && d.confidence <= 1);
});

// ----------------------------------------------------------------- unknown words
test('unknown words are passed through and reported with spans', () => {
  const src = 'Ion are 3 xyzs.';
  const r = ro(src);
  assert.equal(r.text, 'Ion has 3 xyzs.');
  assert.equal(r.unknown.length, 1);
  assert.equal(r.unknown[0].word, 'xyzs');
  assert.equal(src.slice(...r.unknown[0].span), 'xyzs');
  assert.ok(r.confidence < 1);

  const r2 = ro('Pisica are un blorptz.');
  assert.ok(r2.unknown.some((u) => u.word === 'blorptz'));
  assert.ok(r2.text.includes('blorptz'), 'unknown words are not dropped');

  const r3 = ro('Ana desenează un cerc.');
  assert.deepEqual(r3.unknown, []);
});

test('names pass through unchanged and are not reported as unknown', () => {
  const r = ro('Andrei are 4 mere.');
  assert.equal(r.text, 'Andrei has 4 apples.');
  assert.deepEqual(r.unknown, []);
  const r2 = ro('Xyzzy are mere.');
  assert.equal(r2.text, 'Xyzzy has apples.');
  assert.deepEqual(r2.unknown, []);
  assert.equal(ro('Maria îi dă Mariei 3 mere.').text, 'Maria gives Maria 3 apples.');
  assert.equal(ro('Ion îi dă Andreei 2 mingi.').text, 'Ion gives Andreea 2 balls.');
});

// ----------------------------------------------------------------- alignment
test('alignment spans point to the right source substrings', () => {
  const src = 'Ion are 5 mere.';
  const r = ro(src);
  const sliceOf = (a) => src.slice(a.src[0], a.src[1]);
  const tgtOf = (a) => r.text.slice(a.tgt[0], a.tgt[1]);
  const pairs = r.alignment.map((a) => [sliceOf(a), tgtOf(a)]);
  assert.deepEqual(pairs, [['Ion', 'Ion'], ['are', 'has'], ['5', '5'], ['mere', 'apples'], ['.', '.']]);
});

test('alignment of a question and of a dative construction', () => {
  const src = 'Câte mere are Ion?';
  const r = ro(src);
  const m = new Map(r.alignment.map((a) => [r.text.slice(a.tgt[0], a.tgt[1]), src.slice(a.src[0], a.src[1])]));
  assert.equal(m.get('apples'), 'mere');
  assert.equal(m.get('have'), 'are');
  assert.equal(m.get('Ion'), 'Ion');
  assert.equal(m.get('How many'), 'Câte');
  const src2 = 'Maria îi dă lui Ion 3 mere.';
  const r2 = ro(src2);
  const m2 = new Map(r2.alignment.map((a) => [r2.text.slice(a.tgt[0], a.tgt[1]), src2.slice(a.src[0], a.src[1])]));
  assert.equal(m2.get('gives'), 'dă');
  assert.equal(m2.get('apples'), 'mere');
  assert.equal(m2.get('Maria'), 'Maria');
});

test('all alignment spans are valid in both directions', () => {
  const inputs = ['Ion a dat 3 mere Mariei.', 'Dacă plouă, iau umbrela.', 'Bună! Cum te cheamă?', 'Cât e ceasul?', 'Nu știu câte pere are Ana.', 'Ion nu a mâncat nimic.'];
  for (const src of inputs) {
    const r = ro(src);
    for (const a of r.alignment) {
      assert.ok(a.src[0] >= 0 && a.src[1] <= src.length && a.src[0] < a.src[1], `${src} ${JSON.stringify(a)}`);
      assert.ok(a.tgt[0] >= 0 && a.tgt[1] <= r.text.length && a.tgt[0] < a.tgt[1], `${src} ${JSON.stringify(a)}`);
    }
  }
  // original (not normalized) text offsets are used, also with cedilla input
  const src = 'Ion are ţinte.';
  const r = ro(src);
  assert.ok(r.alignment.every((a) => a.src[1] <= src.length));
});

// ----------------------------------------------------------------- negation
test('negation is never lost', () => {
  const sentences = [
    'Ion nu are mere.', 'Pisica nu zboară.', 'Nu am mere.', 'Maria nu a mâncat nimic.', 'Nimeni nu are mere.', 'Nu pot zbura.',
    'Peștele nu zboară.', 'Ion nu va veni.', 'Ion nu are nicio minge.', 'Maria nu mănâncă niciodată pește.', 'Nu știu.', 'Nu șterge lista!',
    'Dacă nu plouă, merg în parc.', 'Ei nu mănâncă pește.', 'Cine nu are mere?', 'Ce nu mănâncă pisica?', 'Fără mere nu se poate.',
    'Ion și Maria nu au mere.', 'Nu înțeleg.', 'Nu, mulțumesc.',
  ];
  for (const s of sentences) {
    const out = ro(s).text;
    assert.ok(/\b(not|no|never|nothing|nobody|without|nor|neither)\b/i.test(out), `${s} -> ${out}`);
  }
});

test('negated and affirmative sentences differ only by negation', () => {
  assert.equal(ro('Ion are mere.').text, 'Ion has apples.');
  assert.equal(ro('Ion nu are mere.').text, 'Ion does not have apples.');
  assert.equal(ro('Ion a mâncat mere.').text, 'Ion ate apples.');
  assert.equal(ro('Ion nu a mâncat mere.').text, 'Ion did not eat apples.');
  assert.equal(ro('Ion va mânca mere.').text, 'Ion will eat apples.');
  assert.equal(ro('Ion nu va mânca mere.').text, 'Ion will not eat apples.');
});

test('questions keep their question word', () => {
  for (const [s, w] of [['Cine are mere?', 'who'], ['Ce are Ion?', 'what'], ['Unde este mingea?', 'where'], ['Când vine Maria?', 'when'],
    ['Cum se numește câinele?', 'what'], ['De ce plânge Maria?', 'why'], ['Care animal are aripi?', 'which'], ['Câți copii au mere?', 'how many']]) {
    const out = ro(s).text.toLowerCase();
    assert.ok(out.includes(w), `${s} -> ${out}`);
    assert.ok(out.endsWith('?'), out);
  }
});

test('sentences mapped without negation are reported as untranslatable, not translated', () => {
  // all negation words of the lexicon are mapped, so a normal sentence never reports this
  const r = ro('Ion nu are mere.');
  assert.equal(r.untranslatable, undefined);
});

test('wh-questions without a question mark get one', () => {
  assert.equal(ro('cate mere are Ion').text, 'How many apples does Ion have?');
});

test('dropped subjects are noted', () => {
  const r = ro('Nu zboară.');
  assert.equal(r.text, 'He does not fly.');
  assert.ok(r.notes.length >= 1);
});

// ----------------------------------------------------------------- en -> ro
const EN_RO = [
  ['Ion has 8 apples.', 'Ion are 8 mere.'],
  ['A cat has 4 legs.', 'O pisică are 4 picioare.'],
  ['I don\'t know how many pears Ana has.', 'Nu știu câte pere are Ana.'],
  ['OK, I added milk to your list.', 'OK, am adăugat lapte pe lista ta.'],
  ['It is 3 o\'clock.', 'Este ora 3.'],
  ['Ion has 1 apple.', 'Ion are 1 măr.'],
  ['Ion has 2 apples.', 'Ion are 2 mere.'],
  ['Ion has 19 apples.', 'Ion are 19 mere.'],
  ['Ion has 20 apples.', 'Ion are 20 de mere.'],
  ['Maria has 25 pears.', 'Maria are 25 de pere.'],
  ['Maria has 3 pears and Ion has 5 apples.', 'Maria are 3 pere și Ion are 5 mere.'],
  ['Ion has 8 apples now.', 'Ion are 8 mere acum.'],
  ['Maria gave Ion 3 apples.', 'Maria i-a dat lui Ion 3 mere.'],
  ['Maria gives Ion 3 apples.', 'Maria îi dă lui Ion 3 mere.'],
  ['Ion gave Maria an apple.', 'Ion i-a dat Mariei un măr.'],
  ['Ion ate the apples.', 'Ion a mâncat merele.'],
  ['The rabbit eats carrots.', 'Iepurele mănâncă morcovi.'],
  ['The cat does not fly.', 'Pisica nu zboară.'],
  ['The cat can not fly.', 'Pisica nu poate zbura.'],
  ['Maria has no apples.', 'Maria nu are mere.'],
  ['A fish does not have legs.', 'Un pește nu are picioare.'],
  ['How many apples does Ion have?', 'Câte mere are Ion?'],
  ['How many legs does a cat have?', 'Câte picioare are o pisică?'],
  ['What does the rabbit eat?', 'Ce mănâncă iepurele?'],
  ['Who has apples?', 'Cine are mere?'],
  ['How much does a ball cost?', 'Cât costă o minge?'],
  ['What color is the apple?', 'Ce culoare are mărul?'],
  ['Where does the cat live?', 'Unde trăiește pisica?'],
  ['The apple is red.', 'Mărul este roșu.'],
  ['The red ball costs 5 lei.', 'Mingea roșie costă 5 lei.'],
  ['Your list is empty.', 'Lista ta este goală.'],
  ['Milk is on your list.', 'Laptele este pe lista ta.'],
  ['There is milk on the list.', 'Este lapte pe listă.'],
  ['Add milk to the list.', 'Adaugă lapte pe listă.'],
  ['I deleted the milk from your list.', 'Am șters laptele din lista ta.'],
  ['Hello! What is your name?', 'Bună! Cum te cheamă?'],
  ['My name is Ion.', 'Mă cheamă Ion.'],
  ['Thank you.', 'Mulțumesc.'],
  ['Sorry, I don\'t know.', 'Scuze, nu știu.'],
  ['I do not understand.', 'Nu înțeleg.'],
  ['Yes, Ion has apples.', 'Da, Ion are mere.'],
  ['No, Maria does not have apples.', 'Nu, Maria nu are mere.'],
  ['Today is Monday.', 'Azi este luni.'],
  ['Tomorrow it will rain.', 'Mâine va ploua.'],
  ['7 plus 5 is 12.', '7 plus 5 face 12.'],
  ['Ion has 2 big dogs.', 'Ion are 2 câini mari.'],
  ['Maria will buy a ball.', 'Maria va cumpăra o minge.'],
  ['Ion goes to school.', 'Ion merge la școală.'],
  ['Birds can fly.', 'Păsările pot zbura.'],
];
for (const [src, want] of EN_RO) {
  test(`en->ro: ${src}`, () => assert.equal(en(src).text, want));
}

test('en->ro reports unknown words and keeps names', () => {
  const r = en('I did not find the word xyzzy.');
  assert.equal(r.text, 'Nu am găsit cuvântul xyzzy.');
  assert.deepEqual(r.unknown.map((u) => u.word), ['xyzzy']);
  assert.deepEqual(en('Andrei has 4 apples.').unknown, []);
  assert.equal(en('Andrei has 4 apples.').text, 'Andrei are 4 mere.');
});

test('en->ro number agreement: 1 măr / 2 mere / 20 de mere', () => {
  const t = (n) => en(`Ion has ${n} apples.`).text;
  assert.equal(en('Ion has 1 apple.').text, 'Ion are 1 măr.');
  assert.equal(t(2), 'Ion are 2 mere.');
  assert.equal(t(10), 'Ion are 10 mere.');
  assert.equal(t(19), 'Ion are 19 mere.');
  assert.equal(t(20), 'Ion are 20 de mere.');
  assert.equal(t(100), 'Ion are 100 de mere.');
});

test('en->ro alignment spans index the English source', () => {
  const src = 'Ion has 8 apples.';
  const r = en(src);
  const pairs = r.alignment.map((a) => [src.slice(a.src[0], a.src[1]), r.text.slice(a.tgt[0], a.tgt[1])]);
  assert.deepEqual(pairs, [['Ion', 'Ion'], ['has', 'are'], ['8', '8'], ['apples', 'mere'], ['.', '.']]);
});

test('en->ro negation is kept', () => {
  for (const s of ['The cat does not fly.', 'I don\'t know.', 'Maria has no apples.', 'Ion did not eat the apple.', 'I can not find the word.']) {
    assert.ok(/\bnu\b/i.test(en(s).text), `${s} -> ${en(s).text}`);
  }
});

test('round trip: Romanian -> English -> Romanian keeps the meaning of short statements', () => {
  for (const s of ['Ion are 8 mere.', 'Câte mere are Ion?', 'Pisica nu zboară.', 'Ce mănâncă iepurele?', 'Cât costă o minge?']) {
    const e = ro(s).text;
    assert.equal(en(e).text, s, `${s} -> ${e}`);
  }
});
