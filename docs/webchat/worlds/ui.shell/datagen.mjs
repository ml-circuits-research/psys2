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
// Tabs and languages come from the world lexicons (context) with embedded fallbacks; tabs of other worlds ("chess board")
// are the `declared-tab` phenomenon and are embedded.
const TABS_FB = ['robot', 'face', 'avatar', 'editor', 'document', 'doc', 'tic_tac_toe', 'tictactoe', 'guess', 'guess_the_animal', 'hangman'];
const LANGS_FB = ['english', 'romanian'];
const tabs = (x) => x.lex('lex.ui.shell.tabs', TABS_FB).filter((t) => !/\d|question/.test(t));
const langs = (x) => x.lex('lex.ui.shell.langs', LANGS_FB);
const DECLARED = ['chess board', 'music player', 'map', 'drawing board', 'chart view', 'photo album'];
const R = (action, args = {}) => ['core.request', { action: 'ui.' + action, ...Object.fromEntries(Object.entries(args).map(([k, v]) => ['arg.' + k, v])) }];
const CAN = ['', '', '', 'Can you ', 'Could you ', 'Will you ', 'Would you ', 'Please can you '];
const LETS = ['', '', 'Let us ', "Let's ", 'I want to ', 'I would like to ', 'Can we ', 'Could we ', 'Shall we ', 'We could ', 'Can you ', 'Could you ', 'Will you ', 'I wanna ', 'Lets '];
const T = [];
const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
const fin = (r, t, qn) => { const s = cap(t.replace(/\s+/g, ' ').trim()); return /\?$|[.!]$/.test(s) ? s : s + (chance(r, 0.85) ? (qn ? '?' : '.') : ''); };
const tname = (t) => sp(t).replace(/^tictactoe$/, 'tictactoe');
const lists = (group, act, args, forms, para, ph = 'request', polite = false) => {
  add(group, ph, (r) => { const f = pick(r, forms); const p = polite && chance(r, 0.3) && !/^(I |you |too |let |no |what |how |who |which |hands-free|can |are |listen|slower$|faster$|mute$|unmute$|quit$|back$|be |do not|shut|turn .* (on|off)$)/i.test(f) ? pick(r, CAN.filter(Boolean)) : ''; return { text: fin(r, p + f, ph === 'question' || /^Can|^Could|^Will|^Would|^Please/.test(p)), expect: E(R(act, args)) }; });
  if (para?.length) add(`${group}.paraphrase`, 'paraphrase', (r) => ({ text: fin(r, pick(r, para), ph === 'question'), expect: E(R(act, args)) }));
};

add('shell.open', 'request', (r, x) => { const t = pick(r, tabs(x));
  return { text: fin(r, `${pick(r, CAN)}${pick(r, ['open', 'show', 'display', 'bring up', 'go to', 'switch to', 'take me to', 'jump to', 'select', 'view', 'show me', 'open up'])} ${pick(r, ['the ', 'my ', 'your ', ''])}${tname(t)}${pick(r, ['', '', ' tab', ' page', ' screen', ' panel', ' window'])}`), expect: E(R('openTab', { tab: t })) }; });
// Names the shell knows (declared by the worlds) can be said bare; any other name needs the word tab, page, screen,
// panel or window ("Open the photo album tab": refused politely, "Open your ears" is not a tab command).
const KNOWN_DECLARED = new Set(['chess board', 'map', 'drawing board']);
add('shell.open.declared', 'declared-tab', (r) => { const t = pick(r, DECLARED);
  return { text: fin(r, `${pick(r, ['Open', 'Show', 'Go to', 'Switch to'])} the ${t}${KNOWN_DECLARED.has(t) ? pick(r, ['', ' tab']) : pick(r, [' tab', ' page', ' screen'])}`), expect: E(R('openTab', { tab: q(t) })) }; });
add('shell.play', 'request', (r, x) => { const t = pick(r, tabs(x)).replace(/^(robot|face|avatar|editor|document|doc)$/, 'hangman');
  return { text: fin(r, `${pick(r, LETS)}${pick(r, ['play', 'start', 'begin', 'launch', 'have'])} ${pick(r, ['', 'a ', 'the ', 'some ', 'a game of ', 'a round of ', 'the game of ', 'another game of '])}${tname(t)}${pick(r, ['', ' game', ' again'])}`), expect: E(R('playGame', { tab: t })) }; });
add('shell.play.twenty', 'number-words', (r) => ({ text: fin(r, `${pick(r, LETS)}${pick(r, ['play', 'start', 'begin', 'have'])} ${pick(r, ['', 'a ', 'the ', 'a game of '])}twenty questions${pick(r, ['', ' game'])}`), expect: E(R('playGame', { tab: 'guess' })) }));
add('shell.open.twenty', 'number-words', (r) => ({ text: fin(r, `${pick(r, CAN)}${pick(r, ['open', 'show', 'go to', 'switch to', 'show me'])} ${pick(r, ['the ', ''])}twenty questions${pick(r, ['', ' tab'])}`), expect: E(R('openTab', { tab: 'guess' })) }));
add('shell.play.declared', 'declared-tab', (r) => { // ("play music" is the music world's, not a tab)
  const t = pick(r, ['chess', 'drawing', 'maps']);
  return { text: fin(r, `${pick(r, LETS)}play ${t}`), expect: E(R('playGame', { tab: q(t) })) }; });
add('shell.choose', 'request', (r) => ({ text: fin(r, `${pick(r, LETS.filter(Boolean))}${pick(r, ['play', 'play a game', 'play a game with you', 'play games'])}`), expect: E(R('chooseGame')) }));
lists('shell.back', 'back', {}, ['go back', 'back', 'previous tab', 'go to the previous tab', 'take me back', 'switch back', 'go back to the previous tab'], ['return to the last tab', 'go to the tab before'], 'request', true);
lists('shell.which', 'whichTab', {}, ['which tab am I on', 'what tab am I on', 'which tab are we on', 'what tab is this', 'which tab is open', 'where am I', 'what is open', 'what is on the screen'], ['which page is this', 'what am I looking at'], 'question');
lists('shell.speaker.on', 'speaker', { on: 'true' }, ['turn on the speaker', 'switch on the sound', 'enable the voice', 'activate the speech', 'unmute the audio', 'put on the speaker', 'turn the speaker on', 'turn your voice on', 'speak to me', 'talk to me', 'read aloud', 'read out loud', 'speak out loud', 'speak your answers', 'read your answers aloud', 'read the answers aloud', 'unmute'], ['please start talking', 'say your answers out loud', 'I want to hear you'], 'request', true);
lists('shell.speaker.off', 'speaker', { on: 'false' }, ['turn off the speaker', 'switch off the sound', 'disable the voice', 'deactivate the speech', 'mute the audio', 'turn the speaker off', 'turn the sound off', 'be quiet', 'stop talking', 'stop speaking', 'shut up', 'be silent', 'stop reading', 'stop reading aloud', 'do not speak', 'do not talk', 'mute'], ['please stay silent', 'I do not want to hear you', 'no more talking'], 'request', true);
lists('shell.listening.on', 'listening', { on: 'true' }, ['start listening', 'begin listening', 'keep listening', 'resume listening', 'continue listening', 'turn on the microphone', 'enable the mic', 'activate my microphone', 'switch on the mic', 'listen', 'listen to me', 'listen up', 'can you hear me', 'are you listening'], ['please listen now', 'open your ears'], 'request', true);
lists('shell.listening.off', 'listening', { on: 'false' }, ['stop listening', 'quit listening', 'pause listening', 'end listening', 'cease listening', 'turn off the microphone', 'switch off the mic', 'disable my microphone', 'deactivate the mic', 'mute the microphone'], ['please do not listen', 'close the microphone'], 'request', true);
lists('shell.handsfree.on', 'handsFree', { on: 'true' }, ['turn on hands-free mode', 'turn on hands-free', 'enable hands-free mode', 'start hands-free', 'switch on the hands-free mode', 'activate hands-free', 'go hands-free', 'be hands-free', 'use hands-free mode', 'hands-free mode on', 'hands-free on'], ['I want to talk without typing', 'let us use hands-free'], 'request', true);
lists('shell.handsfree.off', 'handsFree', { on: 'false' }, ['turn off hands-free mode', 'turn off hands-free', 'disable hands-free mode', 'stop hands-free', 'switch off the hands-free mode', 'deactivate hands-free', 'leave hands-free mode', 'exit hands-free mode', 'end hands-free', 'hands-free mode off', 'hands-free off'], ['no more hands-free', 'back to typing'], 'request', true);
lists('shell.rate.slower', 'rate', { dir: 'slower' }, ['speak slower', 'talk a bit slower', 'read a little slower', 'go slower', 'say it slower', 'answer a lot slower', 'speak more slowly', 'slow down', 'slower', 'too fast', 'you talk too fast'], ['could you go more slowly please', 'please use a slower voice'], 'request', true);
lists('shell.rate.faster', 'rate', { dir: 'faster' }, ['speak faster', 'talk a bit faster', 'read a little faster', 'go faster', 'say it faster', 'speak more quickly', 'speak quicker', 'speed up', 'faster', 'too slow', 'you talk too slow'], ['please use a quicker voice', 'could you hurry up'], 'request', true);
add('shell.rate.set', 'request', (r) => { const n = pick(r, ['0.5', '0.8', '1', '1.2', '1.5', '2', '1.75']);
  return { text: fin(r, `${pick(r, ['Set', 'Change', 'Make'])} the ${pick(r, ['speech ', 'speaking ', 'voice ', 'talking ', 'reading ', ''])}${pick(r, ['rate', 'speed'])} ${pick(r, ['to ', 'at ', ''])}${n}`), expect: E(R('rate', { value: n })) }; });
add('shell.rate.set.number-words', 'number-words', (r) => { const n = 1 + Math.floor(r() * 3);
  return { text: fin(r, `Set the speech rate to ${NUMW[n]}`), expect: E(R('rate', { value: n })) }; });
add('shell.rate.fixed', 'request', (r) => { const c = pick(r, [['normal speed', '1'], ['regular pace', '1'], ['the default rate', '1'], ['very slowly', '0.5'], ['really slowly', '0.5'], ['slowly', '0.5'], ['quickly', '1.75'], ['very fast', '1.75'], ['fast', '1.75']]);
  const verb = pick(r, ['speak', 'talk', 'read']);
  const text = /normal|regular|default/.test(c[0]) ? `${verb} at ${c[0].replace('the default rate', 'default rate')}` : `${verb} ${c[0]}`;
  return { text: fin(r, `${pick(r, CAN)}${text}`.replace('at default rate', 'at default speed')), expect: E(R('rate', { value: c[1] })) }; });
add('shell.language', 'request', (r, x) => { const l = pick(r, langs(x));
  return { text: fin(r, `${pick(r, CAN)}${pick(r, ['switch', 'change', 'go', 'talk', 'speak', 'answer', 'reply', 'respond', 'use'])} ${pick(r, ['to ', 'in ', 'into ', ''])}${cap(l)}`.replace(/(switch|change|go) (in|into) /, '$1 to ')), expect: E(R('language', { lang: l })) }; });
add('shell.language.bare', 'ellipsis', (r, x) => { const l = pick(r, langs(x));
  return { text: `${cap(l)}${pick(r, ['', '.', '!'])}`, expect: E(R('language', { lang: l })) }; });
lists('shell.new', 'newGame', {}, ['new game', 'play again', 'start over', 'restart', 'restart the game', 'play another game', 'another game', 'one more game', 'start a new game', 'begin a new game', 'new round', 'another round', 'play another round', 'play one more time', 'start again', 'try again', 'play a new game', 'play it again', 'reset the game', 'new word', 'another word'], ['I want to play once more', 'deal me a new game', 'let us begin again'], 'request', false);
lists('shell.giveup', 'giveUp', {}, ['I give up', 'give up', 'I quit', 'quit the game', 'I surrender', 'I resign', 'resign', 'surrender', 'I want to give up', 'I am giving up', 'quit'], ['I cannot go on', 'this is too hard for me', 'stop the game'], 'request', false);
add('shell.hint', 'request', (r) => ({ text: fin(r, `${pick(r, ['Give me', 'Tell me', 'Show me', 'Can I have', 'I need', 'I want', 'Can you give me', 'Could I have', 'May I have', 'Could you give me', 'I would like'])} ${pick(r, ['a', 'another', 'one more', 'the next'])} hint`), expect: E(R('hint')) }));
add('shell.hint.bare', 'ellipsis', (r) => ({ text: fin(r, cap(pick(r, ['hint', 'a hint', 'any hint', 'another hint', 'one more hint', 'any hints', 'a clue', 'give me a clue', 'another clue']))), expect: E(R('hint')) }));
// ---- rule sweep: chat forms (pls/u/can we), bare tab and game names, word orders, phrase log, rate words, stop-game forms
add('shell.open.chat', 'request', (r) => { const t = pick(r, ['chess board', 'map', 'chessboard']);
  return { text: pick(r, [`${t} tab pls`, `i want the ${t}`, `${t} please`, `open ${t} for me now`, `take me to the ${t}`, `i want to see the ${t} tab`, `could you bring up the ${t} tab`, `can u show me the ${t}`]), expect: E(R('openTab', { tab: q(t) })) }; });
add('shell.play.chat', 'request', (r) => { const t = pick(r, ['hangman', 'tic tac toe']); const tn = t.replace(/ /g, '_');
  return { text: fin(r, pick(r, [`${t} pls`, `${t} game please`, `can u play ${t} with me`, `play the ${t} game now`, `wanna play ${t}`, `i feel like playing ${t}`, `${t} time`]), false), expect: E(R('playGame', { tab: tn })) }; });
lists('shell.choose.chat', 'chooseGame', {}, ['what games can we play', 'pick a game', 'i want to play something', 'games', 'choose a game for me', 'show me the games', 'game time', 'which game', 'let me choose a game', 'what games do you have', 'list the games'], ['i am bored, pick a game'], 'request', false);
lists('shell.back.chat', 'back', {}, ['go back to the last one', 'previous screen', 'back one tab', 'return to where i was', 'back pls', 'take me back', 'go to the previous page'], [], 'request', true);
lists('shell.plog.count', 'phraseLog', { what: 'count' }, ['count my phrases', 'phrase count', 'how many things have i said so far', 'hw many phrases i said', 'number of phrases i said', 'tell me how many phrases i said', 'so how many phrases have i said till now', 'how many phrases have i said'], [], 'question');
lists('shell.plog.export', 'phraseLog', { what: 'export' }, ['i want a copy of my phrase log', 'phrase log download pls', 'get my phrase log as a file', 'export phrase log', 'download the phrases i said', 'phrase log to file please', 'save my phrase log', 'download my phrase log'], [], 'request', false);
add('shell.rate.set.chat', 'request', (r) => { const c = pick(r, [['1.5', 'speech rate 1.5'], ['1.5', 'voice speed 1.5 pls'], ['1.5', 'speak at 1.5'], ['1.5', 'rate 1.5 please'], ['1.5', 'could you set talking speed to 1.5'], ['1.5', 'make the speed 1.5'], ['1.5', 'set the rate to one point five'], ['1.5', 'i want speech rate one and a half'], ['2', 'speech rate 2'], ['0.5', 'speech rate half']]);
  return { text: fin(r, c[1], false), expect: E(R('rate', { value: c[0] })) }; });
lists('shell.rate.slower.chat', 'rate', { dir: 'slower' }, ['less fast please', 'slower voice', 'too fast, slow it', 'you talk too fast slow down'], [], 'request', false);
lists('shell.rate.faster.chat', 'rate', { dir: 'faster' }, ['faster voice', 'not so slow', 'too slow, speed it up'], [], 'request', false);
add('shell.language.chat', 'request', (r, x) => { const l = pick(r, langs(x));
  return { text: fin(r, pick(r, [`i want ${l}`, `back to ${l}`, `could you use ${l} from now on`, `${l} pls`, `can u speak ${l} now`, `in ${l} please`]), false), expect: E(R('language', { lang: l })) }; });
lists('shell.giveup.chat', 'giveUp', {}, ['stop game pls', 'can we stop the game', 'i want to stop the game now', 'stop it, game over', 'stop the game for now', 'game stop', 'could you stop the game', 'game over'], [], 'request', false);
// negation, near misses, out of domain
add('shell.neg', 'negation', (r, x) => { const t = pick(r, tabs(x));
  return { text: pick(r, [`Don't open the ${tname(t)}.`, `Do not turn on the speaker.`, `I don't want to play ${tname(t)}.`, `Never go back.`, `Do not stop listening.`, `I won't give up.`]), negative: true }; });
add('shell.near', 'near-miss', (r, x) => { const t = pick(r, tabs(x));
  return { text: pick(r, [`The ${tname(t)} is nice.`, 'Speak.', 'Turn on the lights.', 'Make the speaker bigger.', 'Set the volume to 5.', 'Translate this tab.', 'Open.', 'Go.', 'I like to talk fast.']), negative: true }; });
add('shell.ood', 'out-of-domain', (r, x) => { const p = x.person(r);
  return { text: pick(r, [`${p.name} has 5 apples.`, 'How much does a ball cost?', 'What day is tomorrow?', 'What does a rabbit eat?', 'What is 7 plus 5?', 'Add milk to my shopping list.', 'Center.', 'Is it elephant?', 'Yes.', 'Where does a camel live?', 'What color is the sky?', 'Is a whale a fish?']), negative: true }; });

export function generate({ rng, count = 2000, context } = {}) {
  return run(T, rng, count, mk(context));
}
