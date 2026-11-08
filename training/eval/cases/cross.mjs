// Cross-world families: a question of one world asked from every tab (world switching), multi-command messages made of
// independent commands of different worlds, and value-preserving typo / abbreviation noise on canonical commands.
import { rng, chatty, pick } from './lib.mjs';

const TABS = ['robot', 'editor', 'draw', 'map', 'charts', 'music', 'documents', 'chess', 'tictactoe', 'hangman', 'guess'];

/** Independent single-clause questions with their answers (the kids worlds answer from anywhere). */
const QA = [
  ['what is 7 plus 5', 'kids.arith', ['12']],
  ['what is 9 times 3', 'kids.arith', ['27']],
  ['what is 20 minus 8', 'kids.arith', ['12']],
  ['how many legs does a spider have', 'kids.animals', ['8']],
  ['what sound does a cow make', 'kids.animals', ['moo']],
  ['can penguins fly', 'kids.animals', ['No']],
  ['how many sides does a hexagon have', 'kids.shapes', ['6']],
  ['what do red and yellow make', 'kids.shapes', ['orange']],
  ['what day comes after Monday', 'kids.time', ['Tuesday']],
  ['which season comes after winter', 'kids.time', ['spring']],
  ['how many days are in a week', 'kids.time', ['7']],
  ['what is the capital of Japan', 'geo.map', ['Tokyo']],
  ['is Egypt in Africa', 'geo.map', ['Yes']],
];

export default function cross({ add }) {
  const r = rng(606);
  // 1. world switching: each QA from 5 tabs (rotating), message as typed
  QA.forEach(([q, world, ans], i) => {
    for (let k = 0; k < 5; k++) {
      const tab = TABS[(i * 3 + k * 2) % TABS.length];
      const m = k === 0 ? q : chatty(q, r);
      add(world, m, { answer: ans }, { tab, fam: ['world-switch', ...(k ? ['messy'] : [])] });
    }
  });

  // 2. multi-command messages: two or three independent questions in one message (every answer must appear)
  const joiners = [' and ', ' and also ', ', ', ' then ', ' and then ', '. ', ' also '];
  const used = new Set();
  const multi = (n, count) => {
    for (let i = 0; i < count; i++) {
      const picked = [];
      while (picked.length < n) { const q = pick(r, QA); if (!picked.includes(q)) picked.push(q); }
      const key = picked.map((x) => x[0]).join('|');
      if (used.has(key)) continue;
      used.add(key);
      let msg = picked[0][0];
      for (let j = 1; j < n; j++) msg += pick(r, joiners) + picked[j][0];
      const k = r();
      if (k < 0.3) msg = `um ${msg}`; else if (k < 0.5) msg = `${msg} pls`; else if (k < 0.65) msg = msg[0].toUpperCase() + msg.slice(1) + '?';
      const tab = pick(r, [null, 'robot', 'map', 'music', 'draw']);
      add(picked[0][1], msg, { answer: picked.flatMap((x) => x[2]) }, { tab, fam: ['multi', ...(new Set(picked.map((x) => x[1])).size > 1 ? ['world-switch'] : []), ...(n > 2 ? ['triple'] : [])] });
    }
  };
  multi(2, 70);
  multi(3, 22);

  // 3. state-changing command + question in one message
  const act = [
    ['give yourself visor eyes', 'ui.avatar', ['robot.eyes=visor'], 'robot'],
    ['make your body green', 'ui.avatar', ['robot.colors.body=69db7c'], 'robot'],
    ['draw a red house', 'art.draw', ['objects[kind=house].color=red'], 'draw'],
    ['draw 2 trees', 'art.draw', ['objects.length=2'], 'draw'],
    ['set the tempo to 120', 'media.music', ['tempo=120'], 'music'],
    ['change the instrument to flute', 'media.music', ['instrument=flute'], 'music'],
    ['mark Berlin', 'geo.map', ['markers.0.name=Berlin'], 'map'],
    ['zoom to level 6', 'geo.map', ['zoom=6'], 'map'],
    ['make a chart: apples 5, pears 3', 'data.charts', ['charts.0.labels.length=2'], 'charts'],
    ['add milk to my shopping list', 'kids.tasks', [], null],
  ];
  const stateAnswer = (world, state) => (world === 'kids.tasks' ? { answer: ['milk'] } : { state });
  for (const [a, world, st, tab] of act) {
    for (const [q, qw, ans] of [pick(r, QA), pick(r, QA), pick(r, QA)]) {
      const e = stateAnswer(world, st);
      add(world, `${a}${pick(r, [' and ', ' and also ', ', also ', ' then '])}${q}`, { ...e, answer: [...(e.answer ?? []), ...ans] }, { tab, fam: ['multi', 'world-switch'] });
    }
  }

  // 4. typo / abbreviation noise on canonical commands (the value stays recoverable)
  const noisy = [
    ['mke ur eyes sqare', 'ui.avatar', ['robot.eyes=square'], 'robot', ['typo', 'abbrev']],
    ['giv yourself visor eyez', 'ui.avatar', ['robot.eyes=visor'], 'robot', ['typo']],
    ['make ur body grean', 'ui.avatar', ['robot.colors.body=69db7c'], 'robot', ['typo', 'abbrev']],
    ['pls make ur mouth a grill', 'ui.avatar', ['robot.mouth=grill'], 'robot', ['abbrev']],
    ['put a hart on ur chest', 'ui.avatar', ['robot.chest=heart'], 'robot', ['typo', 'abbrev']],
    ['sireen on top', 'ui.avatar', ['robot.top=siren'], 'robot', ['typo']],
    ['becom a persn', 'ui.avatar', ['character=person'], 'robot', ['typo']],
    ['wat is 7 pluss 5', 'kids.arith', null, null, ['typo', 'abbrev']],
    ['whats 9 tims 3', 'kids.arith', null, null, ['typo']],
    ['hw many legs does a spidr have', 'kids.animals', null, null, ['typo', 'abbrev']],
    ['wat sound does a cow mak', 'kids.animals', null, null, ['typo', 'abbrev']],
    ['how many sids does a hexagon have', 'kids.shapes', null, null, ['typo']],
    ['wat do red and yelow mak', 'kids.shapes', null, null, ['typo', 'abbrev']],
    ['wat day is after monday', 'kids.time', null, null, ['typo', 'abbrev']],
    ['drw a red hous', 'art.draw', ['objects[kind=house].color=red'], 'draw', ['typo']],
    ['draw a bleu car', 'art.draw', ['objects[kind=car].color=blue'], 'draw', ['typo']],
    ['mak the hous green', 'art.draw', ['objects[kind=house].color=green'], 'draw', ['typo'], ['Draw a red house.']],
    ['shw me Pariss', 'geo.map', ['focus.name=Paris'], 'map', ['typo']],
    ['zom in', 'geo.map', ['zoom>2'], 'map', ['typo']],
    ['mak a chart: apples 5, pears 3', 'data.charts', ['charts.0.labels.length=2'], 'charts', ['typo']],
    ['mak it a pie chrt', 'data.charts', ['charts.0.type=pie'], 'charts', ['typo'], ['make a chart: apples 5, pears 3, plums 8']],
    ['plai midle C', 'media.music', ['playing=true'], 'music', ['typo']],
    ['set the tempoo to 120', 'media.music', ['tempo=120'], 'music', ['typo']],
    ['chang the instrument to flut', 'media.music', ['instrument=flute'], 'music', ['typo']],
    ['stat a new tic tac toe game', 'games.tictactoe', ['user=X'], 'tictactoe', ['typo']],
    ['cener', 'games.tictactoe', ['board.4=X'], 'tictactoe', ['typo'], ['Start a new tic tac toe game.']],
    ['lets play hangmn', 'games.hangman', ['status=playing'], 'hangman', ['typo']],
    ['is ther an e', 'games.hangman', ['guessed.0=e'], 'hangman', ['typo'], ['Play hangman with the word lion.']],
    ['edd a heading Shopping', 'docs.editor', ['blocks.0.text==Shopping'], 'editor', ['typo']],
    ['add a paragrph hello world', 'docs.editor', ['blocks.0.text==hello world'], 'editor', ['typo']],
    ['opn the map', 'ui.shell', ['activeTab=map'], 'robot', ['typo']],
    ['speek slower', 'ui.shell', ['rate=0.75'], 'robot', ['typo']],
    ['add milk to my shoping list', 'kids.tasks', null, null, ['typo']],
    ['hi im Ben', 'kids.common', null, null, ['abbrev']],
    ['thx bye', 'kids.common', null, null, ['abbrev']],
  ];
  const noisyAnswer = { 'wat is 7 pluss 5': ['12'], 'whats 9 tims 3': ['27'], 'hw many legs does a spidr have': ['8'], 'wat sound does a cow mak': ['moo'], 'how many sids does a hexagon have': ['6'], 'wat do red and yelow mak': ['orange'], 'wat day is after monday': ['Tuesday'], 'add milk to my shoping list': ['milk'], 'hi im Ben': ['Ben'], 'thx bye': ['Goodbye'] };
  for (const [m, world, st, tab, fam, setup] of noisy) {
    add(world, m, st ? { state: st } : { answer: noisyAnswer[m] }, { tab, setup: setup ?? [], fam });
  }
}
