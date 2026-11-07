// Operations of ui.avatar: the robot face (spec 07 section 3). Browser-safe: no imports.
//
// State (ctx.state):
//   { name, faceColor, faceShape: 'round'|'square'|'oval',
//     eyes: { size: 'small'|'medium'|'large', shape: 'round'|'square'|'oval'|'star', color },
//     mouth: 'smile'|'neutral'|'open'|'sad'|'surprised'|'grin', look: 'center'|'left'|'right'|'up'|'down',
//     antenna: { on, color }, hat: 'none'|'cap'|'crown'|'party'|'wizard', accessory: 'none'|'glasses'|'bowtie'|'mustache',
//     ears: bool, blink: bool }
// Colors are CSS color names from the lexicon lex.ui.avatar.colors.
// Effects: avatar.animate { name: wink|nod|dance|wave|shake|blink, eye? } (a moment, not stored state).
// Every command that changes the face brings the robot tab forward: ctx.request('ui.openTab', { tab: 'robot' }).

export function initialState() {
  return {
    name: 'PSys2', faceColor: 'turquoise', faceShape: 'round',
    eyes: { size: 'medium', shape: 'round', color: 'black' },
    mouth: 'smile', look: 'center', antenna: { on: true, color: 'red' },
    hat: 'none', accessory: 'none', ears: false, blink: true,
  };
}

const SIZES = ['small', 'medium', 'large'];
const SIZE_WORD = { small: 'small', medium: 'medium sized', large: 'big' };
const SIZE_OF = { big: 'large', large: 'large', huge: 'large', giant: 'large', enormous: 'large', biggest: 'large', small: 'small', tiny: 'small', little: 'small', smallest: 'small', medium: 'medium', normal: 'medium' };
const FACE_SHAPES = ['round', 'square', 'oval'];
const EYE_SHAPES = ['round', 'square', 'oval', 'star'];
const SHAPE_OF = { round: 'round', circle: 'round', square: 'square', oval: 'oval', star: 'star' };
const COLOR_OF = (c) => (c === 'grey' ? 'gray' : c);
const MOOD_OF = { smile: 'smile', smiley: 'smile', smiling: 'smile', happy: 'smile', glad: 'smile', grin: 'grin', sad: 'sad', frown: 'sad', unhappy: 'sad', surprised: 'surprised', shocked: 'surprised', neutral: 'neutral', serious: 'neutral', calm: 'neutral', open: 'open' };
const MOOD_SAY = { smile: 'smiling', grin: 'grinning', sad: 'sad', surprised: 'surprised', neutral: 'calm', open: 'showing my open mouth' };
const MOOD_SAY_NOW = { smile: "I'm smiling", grin: "I'm grinning", sad: "I'm sad", surprised: "I'm surprised", neutral: 'my face is calm', open: 'my mouth is open' };
const LOOK_SAY = { center: 'straight ahead', left: 'to the left', right: 'to the right', up: 'up', down: 'down' };
const LOOK_OF = { left: 'left', right: 'right', up: 'up', down: 'down', center: 'center', centre: 'center', straight: 'center', forward: 'center', ahead: 'center' };
const PART_OF = { face: 'face', head: 'face', skin: 'face', body: 'face', eye: 'eyes', antenna: 'antenna' };
const THING = {
  cap: { slot: 'hat', value: 'cap', say: 'a cap' }, crown: { slot: 'hat', value: 'crown', say: 'a crown' }, party_hat: { slot: 'hat', value: 'party', say: 'a party hat' },
  wizard_hat: { slot: 'hat', value: 'wizard', say: 'a wizard hat' }, hat: { slot: 'hat', value: 'cap', say: 'a hat' },
  glass: { slot: 'accessory', value: 'glasses', say: 'glasses' }, sunglass: { slot: 'accessory', value: 'glasses', say: 'glasses' },
  bowtie: { slot: 'accessory', value: 'bowtie', say: 'a bow tie' }, bow_tie: { slot: 'accessory', value: 'bowtie', say: 'a bow tie' },
  mustache: { slot: 'accessory', value: 'mustache', say: 'a mustache' }, moustache: { slot: 'accessory', value: 'mustache', say: 'a mustache' },
  ear: { slot: 'ears', value: true, say: 'ears' }, antenna: { slot: 'antenna', value: true, say: 'an antenna' },
};
const SAY_OF = { cap: 'a cap', crown: 'a crown', party: 'a party hat', wizard: 'a wizard hat', glasses: 'glasses', bowtie: 'a bow tie', mustache: 'a mustache' };
const OPENERS = ['Done!', 'Okay!', 'Sure!', 'Ta-da!', 'There you go!'];

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note) => ({ status: 'unsupported', note });
const hash = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0);
const opener = (key) => OPENERS[hash(key) % OPENERS.length];
const done = (ctx, key, sentence) => { ctx.request('ui.openTab', { tab: 'robot' }); return ok(`${opener(key)} ${sentence}`); };
const partName = (p) => PART_OF[p] ?? p;
const partWord = (p) => (p === 'eyes' ? 'My eyes are' : p === 'antenna' ? 'My antenna is' : 'My face is');

export function setColor(ctx, { part, color }) {
  const s = ctx.state, p = partName(part), c = COLOR_OF(color);
  if (p === 'eyes') s.eyes.color = c; else if (p === 'antenna') { s.antenna.color = c; s.antenna.on = true; } else s.faceColor = c;
  return done(ctx, p + c, `${partWord(p)} ${c} now.`);
}

export function setSize(ctx, { part, size }) {
  const s = ctx.state, p = partName(part);
  if (p !== 'eyes') return no('I can only change the size of my eyes.');
  const i = SIZES.indexOf(s.eyes.size);
  let next = SIZE_OF[size];
  if (size === 'bigger' || size === 'larger') {
    if (i === 2) return ok('My eyes are already as big as they can be.');
    next = SIZES[i + 1];
  } else if (size === 'smaller') {
    if (i === 0) return ok('My eyes are already as small as they can be.');
    next = SIZES[i - 1];
  }
  if (!next) return no(`I do not know what size ${size} is.`);
  if (next === s.eyes.size && SIZE_OF[size]) return ok(`My eyes are already ${SIZE_WORD[next]}.`);
  s.eyes.size = next;
  return done(ctx, 'size' + next, `My eyes are ${SIZE_WORD[next]} now.`);
}

export function setShape(ctx, { part, shape }) {
  const s = ctx.state, p = partName(part), sh = SHAPE_OF[shape];
  if (p === 'eyes') {
    if (!EYE_SHAPES.includes(sh)) return no('My eyes can be round, square, oval or star-shaped.');
    s.eyes.shape = sh;
  } else if (p === 'face') {
    if (!FACE_SHAPES.includes(sh)) return no('My face can be round, square or oval.');
    s.faceShape = sh;
  } else return no('I can only change the shape of my face and my eyes.');
  return done(ctx, p + sh, `${partWord(p)} ${sh}${sh === 'star' ? '-shaped' : ''} now.`);
}

export function setMood(ctx, { mood }) {
  const m = MOOD_OF[mood];
  if (!m) return no(`I do not know how to look ${mood}.`);
  ctx.state.mouth = m;
  return done(ctx, 'mood' + m, `${MOOD_SAY_NOW[m][0].toUpperCase()}${MOOD_SAY_NOW[m].slice(1)} now.`);
}

export function look(ctx, { dir }) {
  const d = LOOK_OF[dir];
  if (!d) return no(`I cannot look ${dir}.`);
  ctx.state.look = d;
  return done(ctx, 'look' + d, `I am looking ${LOOK_SAY[d]} now.`);
}

export function animate(ctx, { anim }) {
  const eye = anim === 'wink' ? 'left' : undefined;
  ctx.effect('avatar.animate', eye ? { name: anim, eye } : { name: anim });
  ctx.request('ui.openTab', { tab: 'robot' });
  const say = { wink: 'Wink wink!', nod: 'Yes, yes! I am nodding.', dance: 'Watch me dance!', wave: 'Hello there! I am waving at you.', shake: 'No, no! I am shaking my head.', blink: 'Blink blink!' };
  return ok(say[anim] ?? 'Here you go!');
}

export function blink(ctx, { on }) {
  ctx.state.blink = on === 'true';
  return done(ctx, 'blink' + on, ctx.state.blink ? 'I blink again.' : 'I do not blink any more.');
}

export function wear(ctx, { thing }) {
  const t = THING[thing], s = ctx.state;
  if (!t) return no(`I do not have ${thing}.`);
  if (t.slot === 'ears') {
    if (s.ears) return ok('I already have ears.');
    s.ears = true; return done(ctx, 'ears', 'I have ears now.');
  }
  if (t.slot === 'antenna') {
    if (s.antenna.on) return ok(`My antenna is already on, and it is ${s.antenna.color}.`);
    s.antenna.on = true; return done(ctx, 'antenna', 'My antenna is on now.');
  }
  if (s[t.slot] === t.value) return ok(`I am already wearing ${SAY_OF[t.value]}.`);
  const before = s[t.slot];
  s[t.slot] = t.value;
  const swap = before !== 'none' && t.slot === 'hat' ? ` I took off ${SAY_OF[before]} first.` : '';
  return done(ctx, 'wear' + t.value, `I am wearing ${SAY_OF[t.value]} now.${swap}`);
}

export function remove(ctx, { thing }) {
  const t = THING[thing], s = ctx.state;
  if (!t) return no(`I do not have ${thing}.`);
  if (t.slot === 'ears') {
    if (!s.ears) return ok('I do not have ears right now.');
    s.ears = false; return done(ctx, 'noears', 'My ears are gone.');
  }
  if (t.slot === 'antenna') {
    if (!s.antenna.on) return ok('My antenna is already off.');
    s.antenna.on = false; return done(ctx, 'noantenna', 'My antenna is off now.');
  }
  const generic = thing === 'hat';
  if (s[t.slot] === 'none') return ok(`I am not wearing ${generic ? 'a hat' : t.say} right now.`);
  if (!generic && s[t.slot] !== t.value) return ok(`I am not wearing ${t.say}. I am wearing ${SAY_OF[s[t.slot]]}.`);
  const was = s[t.slot];
  s[t.slot] = 'none';
  return done(ctx, 'off' + was, `I took off ${SAY_OF[was]}.`);
}

export function removeAll(ctx) {
  const s = ctx.state;
  if (s.hat === 'none' && s.accessory === 'none') return ok('I am not wearing anything to take off.');
  s.hat = 'none'; s.accessory = 'none';
  return done(ctx, 'alloff', 'I took off everything.');
}

export function setName(ctx, { name }) {
  const n = String(name ?? '').trim();
  if (!n) return no('What should my name be?');
  ctx.state.name = n;
  return ok(`Nice! From now on my name is ${n}.`);
}

export function reset(ctx) {
  const keep = ctx.state.name;
  for (const k of Object.keys(ctx.state)) delete ctx.state[k];
  Object.assign(ctx.state, initialState(), { name: keep });
  return done(ctx, 'reset', 'I am back to my normal face.');
}

export function askColor(ctx, { part }) {
  const s = ctx.state, p = partName(part);
  const c = p === 'eyes' ? s.eyes.color : p === 'antenna' ? s.antenna.color : s.faceColor;
  return ok(`${partWord(p)} ${c}.`);
}
export function askSize(ctx, { part }) {
  if (partName(part) !== 'eyes') return no('I can only tell you how big my eyes are.');
  return ok(`My eyes are ${SIZE_WORD[ctx.state.eyes.size]}.`);
}
export function askShape(ctx, { part }) {
  const s = ctx.state, p = partName(part);
  if (p === 'eyes') return ok(`My eyes are ${s.eyes.shape}.`);
  if (p === 'face') return ok(`My face is ${s.faceShape}.`);
  return no('I can only tell you the shape of my face and my eyes.');
}
export function askMood(ctx) { return ok(`I am ${MOOD_SAY[ctx.state.mouth]}.`.replace('I am showing my open mouth', 'My mouth is open')); }
export function checkMood(ctx, { mood }) {
  const m = MOOD_OF[mood];
  return m === ctx.state.mouth ? ok(`Yes, I am ${MOOD_SAY[m]}.`.replace('I am showing my open mouth', 'my mouth is open')) : ok(`No, ${ctx.state.mouth === 'smile' ? 'I am smiling' : `I am ${MOOD_SAY[ctx.state.mouth]}`}.`);
}
export function askLook(ctx) { return ok(`I am looking ${LOOK_SAY[ctx.state.look]}.`); }
export function askName(ctx) { return ok(`My name is ${ctx.state.name}.`); }

function wearing(s) {
  const out = [];
  if (s.hat !== 'none') out.push(SAY_OF[s.hat]);
  if (s.accessory !== 'none') out.push(SAY_OF[s.accessory]);
  return out;
}
const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
export function askWearing(ctx) {
  const w = wearing(ctx.state);
  return ok(w.length ? `I am wearing ${andList(w)}.` : 'I am not wearing anything special.');
}
export function hasThing(ctx, { thing }) {
  const t = THING[thing], s = ctx.state;
  if (!t) return no(`I do not know what ${thing} is.`);
  if (t.slot === 'ears') return ok(s.ears ? 'Yes, I have ears.' : 'No, I do not have ears.');
  if (t.slot === 'antenna') return ok(s.antenna.on ? `Yes, I have an antenna and it is ${s.antenna.color}.` : 'No, my antenna is off.');
  const have = thing === 'hat' ? s.hat !== 'none' : s[t.slot] === t.value;
  if (have) return ok(`Yes, I am wearing ${SAY_OF[s[t.slot]]}.`);
  return ok(`No, I am not wearing ${thing === 'hat' ? 'a hat' : t.say}.`);
}

export function describe(ctx) {
  const s = ctx.state;
  const parts = [`I am ${s.name}, a robot with ${s.faceShape === 'oval' ? 'an' : 'a'} ${s.faceShape} ${s.faceColor} face`];
  parts.push(`${SIZE_WORD[s.eyes.size]} ${s.eyes.shape} ${s.eyes.color} eyes`);
  const text = `${parts[0]} and ${parts[1]}. I am ${MOOD_SAY[s.mouth]} and looking ${LOOK_SAY[s.look]}.`;
  const extras = [];
  if (s.antenna.on) extras.push(`My antenna is ${s.antenna.color}.`);
  if (s.ears) extras.push('I have ears.');
  const w = wearing(s);
  if (w.length) extras.push(`I am wearing ${andList(w)}.`);
  return ok([text, ...extras].join(' '));
}
