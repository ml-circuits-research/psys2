// kids.shop, kids.time, kids.shapes, kids.animals, kids.tasks, kids.common (no tab: the kids worlds answer in the chat).
import { rng, chatty, pick } from './lib.mjs';

export default function kids({ add }) {
  const r = rng(202);
  shop(add, r); time(add, r); shapes(add, r); animals(add, r); tasks(add, r); common(add, r);
}

function shop(add, r) {
  const W = 'kids.shop';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  const price = { ball: 5, pencil: 2, kite: 4, puzzle: 11, sandwich: 6, rocket: 9 };
  const pl = (it, n) => (n === 1 ? it : it === 'sandwich' ? 'sandwiches' : `${it}s`);
  const items = ['ball', 'pencil', 'kite', 'puzzle', 'sandwich'];
  for (let i = 0; i < 18; i++) {
    const it = items[i % 5], n = 2 + Math.floor(r() * 4), p = price[it];
    const say = `A ${it} costs ${p} lei.`;
    const forms = [`How much do ${n} ${pl(it, n)} cost?`, `how much for ${n} ${pl(it, n)}`, `what is the price of ${n} ${pl(it, n)}`, `${n} ${pl(it, n)} cost how much`];
    Q(`${say} ${pick(r, forms)}`, [`${n * p}`], { fam: ['word-problem'] });
  }
  for (let i = 0; i < 8; i++) {
    const it = items[i % 5], p = price[it], have = p * 3 + 2 + Math.floor(r() * 5), n = 1 + Math.floor(r() * 3);
    Q(`I have ${have} lei. A ${it} costs ${p} lei. How much money do I have left after I buy ${n} ${pl(it, n)}?`, [`${have - n * p}`], { fam: ['word-problem'], gap: true, note: 'buy clause inside the question' });
  }
  for (let i = 0; i < 6; i++) {
    const it = items[i % 5], p = price[it], pay = p + 5 + Math.floor(r() * 10);
    Q(`A ${it} costs ${p} lei. if i give ${pay} lei for a ${it} whats my change`, [`${pay - p}`], { fam: ['word-problem', 'messy'] });
  }
  Q('A kite costs 4 lei. A puzzle costs 11 lei. How much are 4 kites and a puzzle all together?', ['27'], { fam: ['word-problem', 'multi'] });
  Q('I have 8 lei. A puzzle costs 11 lei. Do I have enough money for the puzzle?', ['No'], { fam: ['word-problem'] });
  Q('I have 20 lei. A kite costs 4 lei. A puzzle costs 11 lei. puzzle + 2 kites, can i pay?', ['Yes'], { fam: ['word-problem', 'messy'] });
  Q('how much does a ball cost', ['5'], { fam: [] });
  add(W, 'how much does a rocket cost', { answer_any: ['not know', "don't know"] }, { gap: true, note: 'price not defined: the right answer is an honest I do not know' });
  Q('How much money do I have left?', ['9'], { setup: ['I have 30 lei.', 'I spent 5 lei.', 'I buy 2 sandwiches.'], fam: ['word-problem'], note: 'the shop list prices a sandwich at 8 lei: 30-5-16' });
  Q('hey how many lei do i have now', ['40'], { setup: ['I have 40 lei.'], fam: ['messy'] });
  Q('I have 30 lei. I spent 5 lei. what is my money after shopping', ['25'], { fam: ['word-problem'] });
  Q('A ball costs 5 lei and a pencil costs 2 lei. How much are 2 balls and 3 pencils?', ['16'], { fam: ['word-problem', 'ellipsis'], gap: true });
  Q('A pencil costs 2 lei. tell me what 3 pencils cost, no, 4 pencils', ['8'], { fam: ['self-correction', 'word-problem'], gap: true });
  add(W, 'what is the capital of Peru', { answer: ['Lima'] }, { fam: ['world-switch'] });
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function time(add, r) {
  const W = 'kids.time';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  for (let i = 0; i < 12; i++) {
    const d = Math.floor(r() * 7), n = 2 + Math.floor(r() * 4);
    const after = i % 2 === 0;
    const target = DAYS[(d + (after ? n : -n) + 70) % 7];
    Q(chatty(`what day is ${n} days ${after ? 'after' : 'before'} ${DAYS[d]}`, r), [target], { fam: ['messy'] });
  }
  for (let i = 0; i < 6; i++) {
    const d = Math.floor(r() * 7);
    Q(chatty(`what day comes after ${DAYS[d]}`, r), [DAYS[(d + 1) % 7]]);
    Q(chatty(`what day was the day before ${DAYS[d]}`, r), [DAYS[(d + 6) % 7]]);
  }
  for (let i = 0; i < 6; i++) {
    const m = Math.floor(r() * 12), n = 2 + Math.floor(r() * 5);
    Q(chatty(`what month is ${n} months after ${MONTHS[m]}`, r), [MONTHS[(m + n) % 12]]);
  }
  for (let i = 0; i < 5; i++) {
    const m = [0, 3, 5, 6, 8, 10][i];
    Q(chatty(`how many days are in ${MONTHS[m]}`, r), [`${MDAYS[m]}`], { fam: ['messy'] });
  }
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  for (let s = 0; s < 4; s++) Q(`what season comes after ${seasons[s]}`, [seasons[(s + 1) % 4]]);
  Q('Which season is July in?', ['summer']);
  Q('what season is december in', ['winter']);
  Q('If it is 3 o\'clock, what time will it be in 2 hours?', ['5 o\'clock']);
  Q('if its 5 oclock what time was it 2 hours ago', ['3 o\'clock'], { fam: ['messy'] });
  Q('how many hours does a day have', ['24'], { fam: [] });
  Q('how many minutes are in an hour', ['60']);
  Q('how many days are in 3 weeks', ['21']);
  Q('Today is Friday. tmrw is what day?', ['Saturday'], { fam: ['abbrev', 'messy'] });
  Q('how many days till sunday if its thursday pls', ['3'], { fam: ['messy'] });
  Q('what day is it tomorrow', ['Wednesday'], { setup: ['Today is Tuesday.'], fam: ['reference'] });
  Q('and the day after that', ['Thursday'], { setup: ['Today is Tuesday.', 'what day is it tomorrow'], fam: ['reference'], gap: true });
  Q('what day comes after Monday and what comes after July', ['Tuesday', 'August'], { fam: ['multi'], gap: true });
  Q('what is 3 plus 4 and what day comes after Sunday', ['7', 'Monday'], { fam: ['multi', 'world-switch'] });
  add(W, 'what time is it in London right now', { none: true }, { fam: ['negative'], note: 'no clock in the world: must not invent a time' });
}

function shapes(add, r) {
  const W = 'kids.shapes';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  const sides = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6, octagon: 8 };
  for (const [s, n] of Object.entries(sides)) Q(chatty(`how many sides does a ${s} have`, r), [`${n}`]);
  for (const s of ['triangle', 'hexagon', 'octagon']) Q(`which shape has ${sides[s]} sides`, [s], { fam: ['paraphrase'] });
  for (const [a, b, c] of [['blue', 'yellow', 'green'], ['red', 'blue', 'purple'], ['red', 'yellow', 'orange'], ['blue', 'white', 'light blue']]) {
    Q(chatty(`what do ${a} and ${b} make`, r), [c]);
    Q(`mixing ${b} and ${a} gives what colour`, [c], { fam: ['paraphrase'] });
  }
  Q('which colors are primary', ['red', 'yellow', 'blue']);
  Q('is green a secondary color', ['Yes']);
  Q('is red a secondary colour', ['No'], { fam: ['probe'] });
  Q('is a square a rectangle', ['Yes']);
  Q('is a rectangle a square', ['No'], { fam: ['probe'], gap: true });
  Q('what color is a banana', ['yellow'], { fam: [] });
  Q('banana color?', ['yellow'], { fam: ['messy'] });
  Q('what color is the sky', ['blue']);
  Q('is the sky green', ['No'], { fam: [] });
  Q('what color is grass', ['green']);
  Q('how many corners does a triangle have', ['3']);
  Q('how many corners has a hexagon', ['6'], { fam: ['messy'] });
  Q('what is a triangle', ['3 sides']);
  Q('is a circle round', ['Yes']);
  Q('name something that looks like a rectangle', ['door']);
  add(W, 'how many sides does a circle have', { answer_any: ['no sides', ' 0 sides'] }, { gap: true, fam: ['probe'] });
  Q('what shape is a ball', ['sphere'], { gap: true, fam: ['probe'] });
  Q('how do i make orange paint', ['red', 'yellow'], { fam: ['paraphrase'] });
  Q('which shape has 4 sides and is it a square or a rectangle', ['square', 'rectangle'], { gap: true, fam: ['multi'] });
  Q('how many sides does a hexagon have and what do red and yellow make', ['6', 'orange'], { fam: ['multi'] });
  Q('hey whats a pentagon pls', ['5'], { fam: ['messy'] });
}

function animals(add, r) {
  const W = 'kids.animals';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  const legs = { spider: 8, dog: 4, cow: 4, elephant: 4, penguin: 2, snake: 0 };
  for (const [a, n] of Object.entries(legs)) if (a !== 'snake') Q(chatty(`how many legs does a ${a} have`, r), [`${n}`]);
  Q('how many legs do spiders have', ['8'], { fam: ['paraphrase'] });
  Q('how many legs has a spider', ['8'], { fam: ['messy'] });
  Q('a spider, how many legs?', ['8'], { fam: ['messy'] });
  const sounds = { cow: 'moo', dog: 'woof', cat: 'meow', duck: 'quack', pig: 'oink', sheep: 'baa' };
  for (const [a, s] of Object.entries(sounds)) Q(chatty(`what sound does a ${a} make`, r), [s]);
  Q('what does the cow say', ['moo'], { fam: ['paraphrase'], gap: true });
  Q('Is a cow a herbivore?', ['Yes']);
  Q('is a cow a carnivore', ['No']);
  Q('is a whale a fish', ['No', 'mammal'], { fam: ['probe'] });
  Q('whale = fish?', ['No'], { fam: ['messy'] });
  Q('is a dolphin a mammal', ['Yes']);
  Q('is a shark a fish', ['Yes']);
  Q('can penguins fly', ['No']);
  Q('penguins fly or no', ['No'], { fam: ['messy'] });
  Q('can a duck fly', ['Yes']);
  Q('can a dolphin swim', ['Yes']);
  Q('where do penguins live', ['polar']);
  Q('where do camels live', ['desert']);
  Q('what does a rabbit eat', ['carrot']);
  Q('what do elephants eat', ['grass']);
  Q('what is a calf', ['baby']);
  Q('tell me about elephants', ['mammal']);
  Q('info on dolphins pls', ['mammal'], { fam: ['messy'] });
  Q('swimming bird please', ['duck', 'penguin'], { fam: ['messy'] });
  Q('What is my dog called?', ['Rex'], { setup: ['My dog is called Rex.'], fam: ['reference'] });
  Q('how is my pet called', ['Rex'], { setup: ['My dog is called Rex.'], fam: ['reference', 'messy'] });
  Q('what is my cat called', ['Tom'], { setup: ['I have a cat called Tom.'] });
  add(W, 'how many legs does a snake have', { answer_any: ['no legs', ' 0 legs'] }, { gap: true, fam: ['probe'] });
  Q('what sound does a cow make and what sound does a dog make', ['moo', 'woof'], { fam: ['multi'] });
  Q('how many legs does a spider have and how many sides does a hexagon have', ['8', '6'], { fam: ['multi', 'world-switch'] });
  Q('how many legs does a dog have, no, a spider', ['8'], { fam: ['self-correction'], gap: true });
  Q('what sound does a dog make and does a cat', ['woof', 'meow'], { fam: ['ellipsis', 'multi'], gap: true });
  add(W, 'i like turtles very much', { none: true }, { fam: ['negative'] });
}

function tasks(add, r) {
  const W = 'kids.tasks';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  Q('add milk to my shopping list', ['milk']);
  Q('hey put milk on the shopping list for me', ['milk'], { fam: ['messy'] });
  Q('add bread to my shopping', ['bread'], { fam: ['messy'] });
  Q('socks on the garden list', ['socks', 'garden'], { fam: ['messy'] });
  Q('what is on my shopping list', ['milk', 'eggs'], { setup: ['add milk to my shopping list', 'add eggs to my shopping list'] });
  Q('read my shopping list', ['milk'], { setup: ['add milk to my shopping list'] });
  Q('how many things are on my shopping list', ['2'], { setup: ['add milk to my shopping list', 'add eggs to my shopping list'] });
  Q('remove milk from my shopping list', ['removed milk'], { setup: ['add milk to my shopping list'] });
  Q('what is on my shopping list', ['empty'], { setup: ['add milk to my shopping list', 'cut milk from the shopping list'], fam: ['repeat-undo'] });
  Q('can u check if milk is on the shopping list', ['Yes'], { setup: ['add milk to my shopping list'], fam: ['messy'] });
  Q('is bread on my shopping list', ['No'], { setup: ['add milk to my shopping list'] });
  add(W, 'clear my shopping list', { answer_any: ['cleared', 'empty'] }, { setup: ['add milk to my shopping list', 'add eggs to my shopping list'] });
  Q('what is still on the shopping list', ['eggs'], { setup: ['add milk to my shopping list', 'add eggs to my shopping list', 'cross milk off my shopping list'], fam: ['reference'] });
  Q('add homework to my to-do list', ['homework']);
  Q('i finished my homework', ['homework'], { setup: ['add homework to my list'] });
  Q('Did I finish my homework?', ['Yes'], { setup: ['add homework to my list', 'homework done now'] });
  Q('Did I finish my homework?', ['Not yet'], { setup: ['add homework to my list'] });
  Q('how many things are left on my to-do list', ['1'], { setup: ['add homework to my list', 'add reading to my list', 'I finished my reading'] });
  Q('what do i got left todo', ['homework', 'reading'], { setup: ['add homework to my list', 'add reading to my list'], fam: ['messy'] });
  Q('Remind me to feed the cat', ['feed the cat']);
  Q('alarm me to feed the cat', ['feed the cat'], { fam: ['paraphrase'] });
  Q('any reminders for me?', ['feed the cat'], { setup: ['Remind me to feed the cat.'] });
  Q('what are my reminders', ['water the plants'], { setup: ['Set a reminder to water the plants.'] });
  Q('add milk and eggs to my shopping list', ['milk', 'eggs'], { fam: ['shared-arg', 'multi'], gap: true });
  Q('add milk to my shopping list and bread to my garden list', ['milk', 'bread'], { fam: ['multi'], gap: true });
  Q('add milk to my shopping list and what is 2 plus 2', ['milk', '4'], { fam: ['multi', 'world-switch'] });
  Q('add milk to my shopping list, no, eggs', ['eggs'], { fam: ['self-correction'], gap: true });
  Q('remove it', ['removed'], { setup: ['add milk to my shopping list'], fam: ['reference'], gap: true });
  Q('what is on my garden list', ['socks'], { setup: ['socks on the garden list'] });
  add(W, 'remove everything from the garden list', { answer_any: ['cleared', 'empty'] }, { setup: ['add socks to my garden list', 'add a hat to my garden list'] });
  add(W, 'the purple elephant dances at midnight', { none: true }, { fam: ['negative'] });
}

function common(add, r) {
  const W = 'kids.common';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, o);
  for (const m of ['Hello!', 'hi there', 'hey', 'yo whats up', 'good morning']) Q(m, ['Hello'], { fam: m.length < 8 ? [] : ['messy'] });
  for (const m of ['bye', 'see ya', 'ok bye now', 'alright i am leaving now', 'goodbye']) Q(m, ['Goodbye'], { fam: ['messy'] });
  for (const m of ['thanks', 'thx a ton', 'you helped a lot, thanks', 'ok thanks bot']) Q(m, ['welcome'], { fam: ['messy'] });
  for (const [m, n] of [['Hi, I\'m Ben.', 'Ben'], ['hi im Ben', 'Ben'], ['my name is Ana', 'Ana'], ['zed is my name pls', 'Zed'], ['you may call me lee', 'Lee'], ['I am called Mia', 'Mia']]) Q(m, [`Nice to meet you, ${n}`], { fam: ['messy'] });
  Q('what is my name', ['Ana'], { setup: ['my name is Ana'], fam: ['reference'] });
  Q('what did i say my name was', ['Ben'], { setup: ['hi im Ben'], fam: ['reference', 'messy'] });
  Q('my name is what again', ['Mia'], { setup: ['I am called Mia'], fam: ['messy'] });
  Q('what is your name', ['PSys2']);
  Q('who are you', ['PSys2']);
  Q('wat r u', ['PSys2'], { fam: ['abbrev', 'typo'] });
  Q('what are you named', ['PSys2'], { fam: ['paraphrase'] });
  add(W, 'how are you', { status: 'supported' }, { gap: true, fam: ['probe'], note: 'any friendly reply' });
  Q('hello and my name is Tom', ['Tom'], { fam: ['multi'] });
  Q('thanks, bye', ['Goodbye'], { fam: ['multi'] });
  Q('hi im Ben and what is 2 plus 3', ['Ben', '5'], { fam: ['multi', 'world-switch'] });
  Q('hi im Ben, no, Sam', ['Sam'], { fam: ['self-correction'], gap: true });
  add(W, 'asdf qwer zxcv', { none: true }, { fam: ['negative'] });
}
