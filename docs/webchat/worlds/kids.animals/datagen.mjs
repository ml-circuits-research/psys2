// ---------------------------------------------------------------------------------------------------------------
// Shared helper block. Generators must stay browser-safe and import nothing, so this block is duplicated verbatim in
// every worlds/<id>/datagen.mjs. Value lists: small lists are embedded below and in the world section; when the export
// script passes `context` ({ lexicons: { <lexicon id>: [words] }, names: { m: [], f: [] }, kb: [records] }) the world's
// own .sop vocabulary is used instead, so new vocabulary widens the data automatically.
// ---------------------------------------------------------------------------------------------------------------
const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sp = (w) => String(w).replace(/_/g, ' ');
const q = (s) => JSON.stringify(String(s));
const IRR = { mouse: 'mice', goose: 'geese', wolf: 'wolves', leaf: 'leaves', calf: 'calves', loaf: 'loaves', half: 'halves', sheep: 'sheep', fish: 'fish', deer: 'deer', goldfish: 'goldfish', jellyfish: 'jellyfish', starfish: 'starfish', child: 'children', man: 'men', woman: 'women', foot: 'feet', tooth: 'teeth', leu: 'lei' };
const plural = (w) => {
  const parts = sp(w).split(' ');
  const last = parts.pop();
  const p = IRR[last] ?? (/(s|x|ch|sh)$/.test(last) ? last + 'es' : /[^aeiou]y$/.test(last) ? last.slice(0, -1) + 'ies' : last + 's');
  return [...parts, p].join(' ');
};
const art = (w) => (/^(hour|honest|heir)/.test(w) || (/^[aeiou]/.test(w) && !/^(unicorn|university|uniform|one|european|user|ufo|eu)/.test(w)) ? 'an' : 'a');
const NUMW = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
/** A number as digits, or (with probability p) as a number word. */
const nt = (r, n, p = 0.15) => (Number.isInteger(n) && n >= 0 && n <= 20 && chance(r, p) ? NUMW[n] : String(n));
const NAMES_FB = { m: ['tom', 'ben', 'jack', 'sam', 'max', 'leo', 'dan', 'paul', 'peter', 'john', 'ion', 'mihai', 'andrei'], f: ['mia', 'emma', 'lily', 'zoe', 'amy', 'kate', 'lucy', 'jane', 'alice', 'mary', 'ana', 'maria', 'elena'] };
const BAD_NAMES = new Set(['mark', 'may', 'will']);
const mk = (c) => {
  const lexicons = c?.lexicons ?? {};
  const nm = c?.names?.m?.length && c?.names?.f?.length ? c.names : NAMES_FB;
  return {
    lex: (id, fb) => (lexicons[id]?.length ? lexicons[id] : fb),
    kb: c?.kb ?? [],
    /** A person { name, id, g } (g = m|f), optionally of gender `g` and different from the people in `not`. */
    person(r, g, not = []) {
      for (let k = 0; k < 50; k++) {
        const gg = g ?? (chance(r, 0.5) ? 'm' : 'f');
        const n = pick(r, nm[gg]);
        if (BAD_NAMES.has(n) || not.some((p) => p.id === 'e.' + n)) continue;
        return { name: cap(n), id: 'e.' + n, g: gg, ref: '$e.' + n };
      }
      return { name: 'Tom', id: 'e.tom', g: 'm', ref: '$e.tom' };
    },
  };
};
/** Expected circuit: E(w1, w2, ...) where w = [type, { key: value }]; ids are placeholders x1, x2, ... */
const E = (...ws) => ws.map(([type, kv], i) => `@x${i + 1} ${type} ${Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd()).join('\n');
const QW = new Set(['what', 'how', 'who', 'where', 'when', 'which', 'does', 'do', 'is', 'are', 'can', 'did', 'has', 'have', 'could', 'tell', 'add', 'show', 'open', 'put', 'name', 'multiply', 'divide', 'subtract', 'calculate', 'if', 'mix', 'remove', 'delete', 'clear', 'remind', 'write', 'take', 'mark', 'set', 'list']);
/** Light surface noise that the rule formalizer is specified to ignore (fillers, final punctuation, question mark). */
const noise = (r, text) => {
  let t = text;
  if (chance(r, 0.18)) {
    const first = t.split(/\s+/)[0].toLowerCase();
    const body = QW.has(first.replace(/[^a-z]/g, '')) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
    t = pick(r, ['Okay, ', 'Well, ', 'Please, ', 'So, ', 'Um, ']) + body;
  }
  if (chance(r, 0.15)) t = t.replace(/[.?!]+$/, (m) => (m === '?' ? '' : m === '.' ? pick(r, ['', '!']) : ''));
  return t;
};
/** Run the templates round-robin (every group is covered), `count` examples at most. */
const run = (T, r, count, x, { noisy = true } = {}) => {
  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const t = T[tries % T.length];
    const ex = t.make(r, x);
    if (!ex) continue;
    const text = noisy && !ex.negative && t.noise !== false && chance(r, 0.3) ? noise(r, ex.text) : ex.text;
    const key = JSON.stringify([ex.context ?? [], text]);
    if (seen.has(key)) continue;
    seen.add(key);
    const rec = { text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph };
    if (ex.context?.length) rec.context = ex.context;
    if (ex.negative) rec.negative = true;
    out.push(rec);
  }
  return out;
};
// ---------------------------------------------------------------------------------------------------------------
export const version = '1';
const T_ = 'kids.animals.';
// Animals and their facts come from the world KB (context.kb) so the statements are true; the fallback table keeps the
// generator usable without a context.
const FB = [
  { name: ['dog'], class: ['mammal'], legs: ['4'], diet: ['omnivore'], food: ['meat', 'bones'], habitat: ['home', 'farm'], covering: ['fur'], sound: ['woof'], baby: ['puppy'], can_swim: ['true'], can_fly: ['false'] },
  { name: ['cat'], class: ['mammal'], legs: ['4'], diet: ['carnivore'], food: ['fish', 'mice'], habitat: ['home'], covering: ['fur'], sound: ['meow'], baby: ['kitten'], can_fly: ['false'] },
  { name: ['rabbit'], class: ['mammal'], legs: ['4'], diet: ['herbivore'], food: ['carrots', 'grass'], habitat: ['forest'], covering: ['fur'], baby: ['bunny'] },
  { name: ['duck'], class: ['bird'], legs: ['2'], diet: ['omnivore'], food: ['plants', 'insects'], habitat: ['farm', 'river'], covering: ['feather'], sound: ['quack'], baby: ['duckling'], can_fly: ['true'], can_swim: ['true'] },
  { name: ['penguin'], class: ['bird'], legs: ['2'], diet: ['carnivore'], food: ['fish', 'squid'], habitat: ['polar'], covering: ['feather'], baby: ['chick'], can_fly: ['false'], can_swim: ['true'] },
  { name: ['spider'], class: ['arachnid'], legs: ['8'], diet: ['carnivore'], food: ['insects', 'flies'], habitat: ['garden'] },
  { name: ['bee'], class: ['insect'], legs: ['6'], diet: ['herbivore'], food: ['nectar', 'pollen'], habitat: ['garden'], sound: ['buzz'], baby: ['larva'], can_fly: ['true'] },
  { name: ['dolphin'], class: ['mammal'], legs: ['0'], diet: ['carnivore'], food: ['fish'], habitat: ['sea'], covering: ['skin'], sound: ['click'], baby: ['calf'], can_swim: ['true'] },
  { name: ['cow'], class: ['mammal'], legs: ['4'], diet: ['herbivore'], food: ['grass', 'hay'], habitat: ['farm'], covering: ['fur'], sound: ['moo'], baby: ['calf'] },
  { name: ['camel'], class: ['mammal'], legs: ['4'], diet: ['herbivore'], food: ['grass', 'leaves'], habitat: ['desert'], covering: ['fur'], baby: ['calf'] },
  { name: ['frog'], class: ['amphibian'], legs: ['4'], diet: ['carnivore'], food: ['insects', 'flies'], habitat: ['river'], covering: ['skin'], sound: ['croak'], baby: ['tadpole'], can_swim: ['true'] },
  { name: ['lion'], class: ['mammal'], legs: ['4'], diet: ['carnivore'], food: ['meat', 'zebras'], habitat: ['savanna'], covering: ['fur'], sound: ['roar'], baby: ['cub'] },
];
const ABS = ['fly', 'swim'];
const KINDS_FB = ['mammal', 'bird', 'fish', 'insect', 'reptile', 'amphibian', 'arachnid', 'crustacean', 'mollusc', 'invertebrate', 'herbivore', 'carnivore', 'omnivore'];
const CLASSES_FB = ['mammal', 'bird', 'fish', 'insect', 'reptile', 'amphibian', 'arachnid', 'crustacean', 'mollusc', 'invertebrate'];
const DIETS = ['herbivore', 'carnivore', 'omnivore'];
const COV_FB = ['fur', 'feather', 'scale', 'skin', 'shell', 'wool', 'spine'];
const PETS = ['Rex', 'Bella', 'Luna', 'Buddy', 'Coco', 'Milo', 'Fluffy', 'Spot', 'Rocky'];
const HABS = ['sea', 'jungle', 'farm', 'desert', 'forest', 'savanna', 'river', 'garden', 'mountain', 'grassland', 'home'];
const zoo = (x) => { const rows = x.kb.filter((k) => k.type === T_ + 'animal' && k.name); return rows.length ? rows : FB; };
const nm = (a) => a.name[0];
const Q = (seek, where, extra = {}) => ['core.question', { type: T_ + 'animal', seek, ...extra, ...Object.fromEntries(Object.entries(where).map(([k, v]) => ['where.' + k, v])) }];
const F = (name, kv) => [T_ + 'animal', { name, ...kv }];
/** Noun phrase of an animal: "a dog", "the dog" (singular) */
const NP = (r, a) => (chance(r, 0.8) ? `${art(sp(nm(a)))} ${sp(nm(a))}` : `the ${sp(nm(a))}`);
const A = (r, x, need) => { const z = zoo(x).filter((a) => !need || a[need]?.length); return z.length ? pick(r, z) : null; };
const ANIM = (x) => x.lex('lex.kids.animals.names', zoo(x).map(nm));
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const withA = (need, f) => (r, x) => { const a = A(r, x, need); return a ? f(r, x, a) : null; };

function N(r, hi) { return 1 + Math.floor(r() * hi); }
// statements that teach facts
add('animals.t.legs', 'statement', withA('legs', (r, x, a) => ({ text: `${chance(r, 0.5) ? NP(r, a).replace(/^./, (c) => c.toUpperCase()) + ' has' : cap(plural(nm(a))) + ' have'} ${a.legs[0]} legs.`, expect: E(F(nm(a), { legs: a.legs[0] })) })));
add('animals.t.food', 'statement', withA('food', (r, x, a) => { const f = pick(r, a.food);
  return { text: chance(r, 0.5) ? `${cap(plural(sp(nm(a))))} eat ${f}.` : `${cap(NP(r, a))} eats ${f}.`, expect: E(F(nm(a), { food: f })) }; }));
add('animals.t.food.two', 'multi-entity', withA('food', (r, x, a) => { if (a.food.length < 2) return null; const [f, g] = a.food;
  return { text: `${cap(plural(sp(nm(a))))} eat ${f} and ${g}.`, expect: E(F(nm(a), { food: f }), F(nm(a), { food: g })) }; }));
add('animals.t.class', 'statement', withA('class', (r, x, a) => ({ text: `${cap(NP(r, a))} is ${art(a.class[0])} ${a.class[0]}.`, expect: E(F(nm(a), { class: a.class[0] })) })));
add('animals.t.diet', 'statement', withA('diet', (r, x, a) => ({ text: `${cap(NP(r, a))} is ${art(a.diet[0])} ${a.diet[0]}.`, expect: E(F(nm(a), { diet: a.diet[0] })) })));
add('animals.t.habitat', 'statement', withA('habitat', (r, x, a) => { const h = pick(r, a.habitat);
  return { text: `${cap(plural(sp(nm(a))))} live ${pick(r, ['in', 'on', 'at', 'near'])} ${pick(r, ['the ', 'a ', ''])}${h}.`, expect: E(F(nm(a), { habitat: h })) }; }));
add('animals.t.ability', 'negation', (r, x) => { const a = A(r, x), ab = pick(r, ABS), neg = chance(r, 0.5);
  return { text: `${cap(NP(r, a))} ${neg ? pick(r, ['cannot', 'can not', "can't"]) : 'can'} ${ab}.`, expect: E(F(nm(a), { ['can_' + ab]: neg ? 'false' : 'true' })) }; });
add('animals.t.sound', 'statement', withA('sound', (r, x, a) => ({ text: `${cap(plural(sp(nm(a))))} ${pick(r, ['say', 'go', 'make'])} ${a.sound[0]}.`, expect: E(F(nm(a), { sound: a.sound[0] })) })));
add('animals.t.baby', 'statement', withA('baby', (r, x, a) => ({ text: `${pick(r, ['A', 'The'])} baby ${sp(nm(a))} is called ${art(a.baby[0])} ${a.baby[0]}.`, expect: E(F(nm(a), { baby: a.baby[0] })) })));
add('animals.t.covering', 'statement', withA('covering', (r, x, a) => { const c = a.covering[0];
  return { text: chance(r, 0.5) ? `${cap(plural(sp(nm(a))))} have ${plural(c)}.` : `${cap(NP(r, a))} is covered in ${c === 'wool' || c === 'fur' ? c : plural(c)}.`, expect: E(F(nm(a), { covering: c })) }; }));
const QP = (seek, where, extra = {}) => { const w = Q(seek, where, extra); w[1].type = T_ + 'pet'; return w; };
// pets
add('animals.pet.statement', 'statement', (r, x) => { const k = pick(r, ['dog', 'cat', 'rabbit', 'hamster', 'parrot', 'goldfish', 'tortoise']), n = pick(r, PETS);
  const t = pick(r, [`My ${k} is ${pick(r, ['called', 'named'])} ${n}.`, `I ${pick(r, ['have', 'got'])} ${art(k)} ${k} ${pick(r, ['called', 'named'])} ${n}.`, `My ${k}'s name is ${n}.`]);
  return { text: t, expect: E([T_ + 'pet', { owner: '$e.user', kind: k, called: '$e.' + n.toLowerCase() }]) }; });
add('animals.pet.question', 'question', (r, x) => { const k = pick(r, ['dog', 'cat', 'rabbit', 'hamster', 'parrot']), n = pick(r, PETS);
  const c = pick(r, [[`What is my ${k} called?`, QP('called', { owner: '$e.user', kind: k })], [`What is the name of my ${k}?`, QP('called', { owner: '$e.user', kind: k })], [`What is my ${k}'s name?`, QP('called', { owner: '$e.user', kind: k })],
    ['What is my pet called?', QP('called', { owner: '$e.user' })], [pick(r, ['What', 'Which']) + ' pets do I have?', QP('kind', { owner: '$e.user' }, { mode: 'list' })], [`Who is ${n}?`, QP('kind', { called: '$e.' + n.toLowerCase() })], [`Do I have ${pick(r, ['a ', 'any '])}${k}?`.replace('any ' + k, 'any ' + k), QP('kind', { owner: '$e.user', kind: k }, { mode: 'exists' })]]);
  return { text: c[0], expect: E(c[1]) }; });
add('animals.pet.context', 'context', (r) => { const k = pick(r, ['dog', 'cat', 'rabbit']), n = pick(r, PETS);
  return { context: [`My ${k} is called ${n}.`], text: `Who is ${n}?`, expect: E(QP('kind', { called: '$e.' + n.toLowerCase() })) }; });
// negation, near misses, out of domain
add('animals.neg', 'negation', (r, x) => { const a = A(r, x), n = 2 * N(r, 4);
  return { text: pick(r, [`${cap(NP(r, a))} does not have ${n} legs.`, `${cap(plural(nm(a)))} don't eat ${pick(r, ['pizza', 'grass'])}.`, `${cap(NP(r, a))} is not ${art('mammal')} mammal.`, `${cap(plural(nm(a)))} never live in the sea.`]), negative: true }; });
add('animals.near', 'near-miss', (r, x) => { const a = A(r, x);
  return { text: pick(r, [`What is a ${pick(r, ['unicorn', 'dragon', 'phoenix'])}?`, `Tell me about ${pick(r, ['unicorns', 'dragons'])}.`, `I like ${plural(nm(a))}.`, `Is ${NP(r, a)} big?`, `How many ears does ${NP(r, a)} have?`.replace('ears', 'ears'), `${cap(NP(r, a))} is sleeping.`, `Do ${plural(nm(a))} like me?`]), negative: true }; });
add('animals.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What is 7 plus 5?', 'How many sides does a hexagon have?', 'Add milk to my shopping list.', 'Open the editor.', 'Play hangman.', 'What color is the sky?', 'Hello!', 'Is a square a rectangle?', 'What do red and yellow make?']), negative: true }; });

// ---- rule sweep: realistic phrasing families (short noun-first forms, chat words, word orders), see worlds/kids.animals/coverage.md
add('animals.wording.pets', 'statement', (r) => { const k = pick(r, ['dog', 'cat', 'rabbit', 'hamster']), n = pick(r, ['Rex', 'Bella', 'Luna', 'Buddy']); return { text: pick(r, [`my ${k} is ${n}`, `${n} is my ${k}`, `the ${k} is named ${n}`, `my ${k}s name is ${n}`, `name of my ${k}: ${n}`, `${n} is the name of my ${k}`, `i named my ${k} ${n}`, `${n} is the ${k}`]), expect: E([T_ + 'pet', { owner: '$e.user', kind: k, called: '$e.' + n.toLowerCase() }]) }; });
add('animals.wording.pets.ask', 'question', (r) => ({ text: pick(r, ['whats my pets name', 'my pet name?', 'what did i call my pet', 'name of my pet?', 'how is my pet called', 'remind me my pets name', 'what is my pet named', 'can you tell me what my pet is called']), expect: E(QP('called', { owner: '$e.user' })) }));
add('animals.wording.teach', 'statement', withA('legs', (r, x, a) => ({ text: pick(r, [`remember ${NP(r, a)} has ${a.legs[0]} legs`, `fyi ${sp(nm(a))} ${a.legs[0]} legs`, `just so you know ${NP(r, a)} has ${a.legs[0]} legs`, `${NP(r, a)} got ${a.legs[0]} legs`]), expect: E(F(nm(a), { legs: a.legs[0] })) })));
export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
