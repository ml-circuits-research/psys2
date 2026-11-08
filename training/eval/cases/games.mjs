// games.chess (tab chess), games.tictactoe (tab tictactoe), games.hangman (tab hangman), games.guess (tab guess).
import { rng, chatty } from './lib.mjs';

export default function games({ add }) {
  const r = rng(404);
  chess(add, r); ttt(add, r); hangman(add, r); guess(add, r);
}

function chess(add, r) {
  const W = 'games.chess', tab = 'chess', start = ["Let's play chess."];
  const S = (m, state, o = {}) => add(W, m, { state }, { tab, setup: start, ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, setup: start, ...o });
  add(W, "Let's play chess.", { state: ['status=playing', 'user=white', 'history.length=0'] }, { tab });
  add(W, 'new game', { state: ['status=playing', 'history.length=0'] }, { tab, setup: [...start, 'e2 to e4'], fam: ['repeat-undo'] });
  add(W, 'i want to play chess', { state: ['status=playing'] }, { tab, fam: ['messy'] });
  add(W, 'lets play a game of chess pls', { state: ['status=playing'] }, { tab, fam: ['messy'] });
  S('e2 to e4.', ['history.0=e4']);
  S('e4', ['history.0=e4'], { fam: ['messy'] });
  S('pawn to e4', ['history.0=e4'], { fam: ['paraphrase'] });
  S('move my e pawn two squares', ['history.0=e4'], { fam: ['paraphrase'], gap: true });
  S('play d4', ['history.0=d4'], { fam: ['messy'] });
  S('d2 to d4 please', ['history.0=d4'], { fam: ['messy'] });
  S('Knight to f3.', ['history.0=Nf3']);
  S('knight to c3', ['history.0=Nc3']);
  S('nf3', ['history.0=Nf3'], { fam: ['messy', 'abbrev'] });
  S('Set the level to expert.', ['level=7']);
  S('Set the level to 5.', ['level=5']);
  S('make the computer easier', ['level<3'], { fam: ['paraphrase'] });
  S('play at level 2', ['level=2'], { fam: ['messy'] });
  S('I concede.', ['status=resigned']);
  S('i resign', ['status=resigned'], { fam: ['messy'] });
  S('give up', ['status=resigned'], { fam: ['paraphrase'] });
  S('undo', ['history.length=0'], { setup: [...start, 'e2 to e4'], fam: ['repeat-undo'], gap: true, note: 'undo while the engine is moving' });
  S('e4 then undo', ['history.length=0'], { fam: ['repeat-undo', 'multi'], gap: true });
  S('e2 to e4 and set the level to 4', ['history.0=e4', 'level=4'], { fam: ['multi'] });
  S('set the level to 4 and play e4', ['history.0=e4', 'level=4'], { fam: ['multi'] });
  S('knight to f3, no, knight to c3', ['history.0=Nc3'], { fam: ['self-correction'] });
  S('e4 e5 nf3', ['history.0=e4'], { fam: ['multi', 'messy'], gap: true });
  S('castle kingside', ['history.length>0'], { setup: [...start, 'e2 to e4', 'g1 to f3', 'f1 to c4'], fam: ['probe'], gap: true });
  S('take the pawn on d5', ['history.length>1'], { setup: [...start, 'e2 to e4'], fam: ['probe'], gap: true });
  S('e2 to e9', ['history.length=0'], { fam: ['coordinates', 'negative'], gap: true, note: 'illegal square: nothing may be played' });
  Q('what is my colour', ['white'], { fam: ['messy'] });
  Q('which colour am i', ['white'], { fam: ['paraphrase'] });
  Q('what level are we at', ['3'], { fam: ['probe'] });
  Q('how do i play chess', ['knight to f3']);
  Q('where can the knight go', ['knight'], { fam: ['probe'], gap: true });
  Q('Which pieces did I lose?', ['not lost'], { fam: ['probe'] });
  Q('what is the best move', ['best'], { fam: ['probe'], gap: true });
  add(W, 'e2 to e4 and what is 2 plus 2', { answer: ['4'] }, { tab, setup: start, fam: ['multi', 'world-switch'] });
  add(W, 'the purple elephant dances at midnight', { none: true }, { tab, setup: start, fam: ['negative'] });
}

function ttt(add, r) {
  const W = 'games.tictactoe', tab = 'tictactoe', start = ['Start a new tic tac toe game.'];
  const S = (m, state, o = {}) => add(W, m, { state }, { tab, setup: start, ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, setup: start, ...o });
  add(W, 'Start a new tic tac toe game.', { state: ['winner=null', 'user=X'] }, { tab, setup: ['center'], fam: [] });
  add(W, "let's play tic tac toe", { state: ['user=X'] }, { tab, fam: ['paraphrase'] });
  const places = [['Center.', 4], ['top left', 0], ['top right', 2], ['bottom left', 6], ['bottom right', 8], ['top middle', 1], ['middle left', 3], ['middle right', 5], ['bottom middle', 7], ['the middle', 4], ['upper left corner', 0], ['lower right', 8]];
  places.forEach(([m, i], k) => S(chatty(m, r), [`board.${i}=X`], { fam: k > 7 ? ['paraphrase'] : [] }));
  S('Row 3 column 3', ['board.8=X'], { fam: ['coordinates'] });
  S('row 1 column 2', ['board.1=X'], { fam: ['coordinates'] });
  S('b2', ['board.4=X'], { fam: ['coordinates', 'messy'] });
  S('square c3 for me', ['board.8=X'], { fam: ['coordinates', 'messy'] });
  S('a1', ['board.0=X'], { fam: ['coordinates'] });
  S('bl pls', ['board.6=X'], { fam: ['abbrev', 'messy'] });
  S('tl', ['board.0=X'], { fam: ['abbrev'] });
  S('I will take the center', ['board.4=X'], { fam: ['paraphrase'] });
  S('put my x in the top left', ['board.0=X'], { fam: ['paraphrase'] });
  S('center and then top left', ['board.4=X', 'board.0=X'], { fam: ['multi'], gap: true, note: 'the second move comes after the computer replies, it may be taken' });
  S('top left, no, center', ['board.4=X', 'board.0!=X'], { fam: ['self-correction'], gap: true });
  S('I want a fresh game', ['winner=null'], { setup: [...start, 'center'], fam: ['messy'] });
  S('new game', ['board.4=null'], { setup: [...start, 'center'], fam: ['repeat-undo'], gap: true });
  S('I give up', ['winner=O'], { setup: [...start, 'center'] });
  S('undo', ['board.4=null'], { setup: [...start, 'center'], fam: ['repeat-undo'], gap: true });
  S('top left and bottom right', ['board.0=X'], { fam: ['multi', 'shared-arg'], gap: true });
  S('row 5 column 5', ['board.0=null'], { fam: ['coordinates', 'negative'], gap: true, note: 'off the board: nothing may be placed' });
  Q('who goes first', ['X'], { fam: ['messy'] });
  Q('whos up first', ['X'], { fam: ['messy'] });
  Q('what would you do in my place', ['How about'], { fam: ['paraphrase'] });
  Q('whats the last square you took', ['not played'], { fam: ['messy', 'probe'], gap: true });
  Q('Row 3 column 3', ['already taken'], { setup: [...start, 'center', 'top left'], fam: ['coordinates', 'probe'], gap: true, note: 'depends on the computer reply: the answer is only right if that square is taken' });
  add(W, 'center and what is 3 times 3', { answer: ['9'] }, { tab, setup: start, fam: ['multi', 'world-switch'] });
  add(W, 'asdf qwer zxcv', { none: true }, { tab, setup: start, fam: ['negative'] });
}

function hangman(add, r) {
  const W = 'games.hangman', tab = 'hangman', start = ['Play hangman with the word lion.'];
  const S = (m, state, o = {}) => add(W, m, { state }, { tab, setup: start, ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, setup: start, ...o });
  add(W, 'Play hangman with the word zebra.', { state: ['word=zebra', 'status=playing'] }, { tab });
  add(W, 'I want to play hangman', { state: ['status=playing'] }, { tab, fam: ['messy'] });
  add(W, 'lets play hangman pls', { state: ['status=playing'] }, { tab, fam: ['messy'] });
  add(W, 'start a hangman game with the word tiger', { state: ['word=tiger'] }, { tab, fam: ['paraphrase'] });
  S('Is there an E?', ['guessed.0=e', 'wrongLeft=5']);
  S('guess z', ['guessed.0=z'], { fam: ['messy'] });
  S('guessing z', ['guessed.0=z'], { fam: ['messy'] });
  S('Try S', ['guessed.0=s']);
  S('J', ['guessed.0=j']);
  S('is there an l', ['guessed.0=l', 'wrongLeft=6'], { fam: ['messy'] });
  S('do you have a q', ['guessed.0=q'], { fam: ['paraphrase'] });
  S('how about the letter o', ['guessed.0=o'], { fam: ['paraphrase'] });
  S('is there an i and an o', ['guessed.length=2'], { fam: ['multi', 'shared-arg'] });
  S('try e, a and t', ['guessed.length=3'], { fam: ['multi', 'shared-arg'], gap: true });
  S('e, no, z', ['guessed.0=z'], { fam: ['self-correction'], gap: true });
  S('Is it tiger?', ['wrong.0=tiger']);
  S('is it lion', ['status=won'], { fam: ['messy'] });
  S('the word is lion', ['status=won'], { fam: ['paraphrase'] });
  S('i give up', ['status=lost'], { fam: ['paraphrase'], gap: true });
  S('new game', ['guessed.length=0'], { setup: [...start, 'guess z'], fam: ['repeat-undo'], gap: true });
  Q('How many guesses are left?', ['6']);
  Q('how many guesses are left', ['5'], { setup: [...start, 'guess z'], fam: ['reference'] });
  Q('tell me a fact about it', ['lion'], { fam: ['probe'], gap: true });
  Q('how many letters does the word have', ['4'], { fam: ['probe'] });
  Q('which letters did i try', ['z'], { setup: [...start, 'guess z'], fam: ['reference', 'probe'] });
  add(W, 'is there an e and what is 3 plus 3', { answer: ['6'] }, { tab, setup: start, fam: ['multi', 'world-switch'] });
  add(W, 'the purple elephant dances at midnight', { none: true }, { tab, setup: start, fam: ['negative'] });
}

function guess(add, r) {
  const W = 'games.guess', tab = 'guess', start = ['I am thinking of an animal'];
  const S = (m, state, o = {}) => add(W, m, { state }, { tab, setup: start, ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, setup: start, ...o });
  add(W, 'I am thinking of an animal', { state: ['phase=asking'] }, { tab });
  add(W, "let's play twenty questions", { state: ['phase=asking'] }, { tab, fam: ['paraphrase'] });
  add(W, 'guess my animal', { state: ['phase=asking'] }, { tab });
  for (const [m, v] of [['yes', 'yes'], ['no', 'no'], ['maybe', 'maybe'], ['that is right', 'yes'], ['nope', 'no'], ['no, thats wrong', 'no'], ['i really dont know', 'dontknow'], ['dunno', 'dontknow'], ['sort of', 'maybe'], ['yep', 'yes'], ['yeah', 'yes'], ['i dont know', 'dontknow'], ['not really', 'no'], ['correct', 'yes']]) S(m, [`asked.0.answer=${v}`], { fam: ['messy'] });
  S('yes it does', ['asked.0.answer=yes'], { fam: ['messy'] });
  S('yes and then no', ['asked.0.answer=yes', 'asked.1.answer=no'], { fam: ['multi'], gap: true });
  S('yes, no, maybe', ['asked.0.answer=yes', 'asked.1.answer=no', 'asked.2.answer=maybe'], { fam: ['multi', 'ellipsis'], gap: true });
  S('yes, no wait, no', ['asked.0.answer=no'], { fam: ['self-correction'], gap: true });
  S('you can start asking now', ['phase=asking'], { fam: ['paraphrase'] });
  S('It was a penguin.', ['phase=done'], { setup: [...start, 'yes', 'no'], gap: true });
  Q('Which animals are left?', ['still'], { setup: [...start, 'yes'] });
  Q('possible ones now?', ['still'], { setup: [...start, 'yes'], fam: ['messy'] });
  Q('why is that question being asked', ['split'], { fam: ['probe'] });
  Q('what is 2 plus 2', ['4'], { fam: ['world-switch'] });
  add(W, 'yes and what is 2 plus 2', { answer: ['4'], state: ['asked.0.answer=yes'] }, { tab, setup: start, fam: ['multi', 'world-switch'] });
  add(W, 'asdf qwer zxcv', { none: true }, { tab, setup: start, fam: ['negative'] });
}
