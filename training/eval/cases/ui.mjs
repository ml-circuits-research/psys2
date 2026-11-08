// docs.editor (tab editor), docs.reader (tab documents), ui.shell (tab robot), ui.help (tab robot): text editing, document reading, navigation and help.
import { rng, chatty } from './lib.mjs';

export default function ui({ add }) {
  const r = rng(505);
  editor(add, r); reader(add, r); shell(add, r); help(add, r);
}

function editor(add, r) {
  const W = 'docs.editor', tab = 'editor';
  const S = (m, state, o = {}) => add(W, m, { state }, { tab, ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, ...o });
  const doc = ['Add a heading Shopping', 'Add a paragraph hello world', 'Add a list: milk, eggs, bread'];
  S('Add a heading Shopping', ['blocks.0.kind=heading', 'blocks.0.text=Shopping']);
  S('add a title Trip plan', ['blocks.0.kind=heading', 'blocks.0.text==Trip plan'], { fam: ['paraphrase'] });
  S('put a heading called Notes at the top', ['blocks.0.text==Notes'], { fam: ['paraphrase'] });
  S('add a paragraph hello world', ['blocks.0.kind=paragraph', 'blocks.0.text==hello world']);
  S('write a paragraph: the cat sat', ['blocks.0.text==the cat sat'], { fam: ['paraphrase'] });
  S('add a list: milk, eggs, bread', ['blocks.0.kind=list', 'blocks.0.items.length=3', 'blocks.0.items.0=milk']);
  S('add a list with milk and eggs', ['blocks.0.kind=list', 'blocks.0.items.length=2'], { fam: ['paraphrase'] });
  S('make a todo list: wash, cook', ['blocks.0.items.length=2'], { fam: ['paraphrase'], gap: true });
  S('hey add a heading Plans pls', ['blocks.0.text==Plans'], { fam: ['messy'] });
  S('add heading hello', ['blocks.0.text==hello'], { fam: ['messy'] });
  S('Delete the last list', ['blocks.length=2'], { setup: doc });
  S('delete the last sentence', ['blocks.length=2'], { setup: doc, gap: true, fam: ['probe'] });
  S('remove the heading', ['blocks.length=2'], { setup: doc, fam: ['paraphrase'] });
  S('Undo', ['blocks.length=2'], { setup: doc, fam: ['repeat-undo'] });
  S('undo that', ['blocks.length=2'], { setup: doc, fam: ['repeat-undo', 'messy'] });
  S('undo twice', ['blocks.length=1'], { setup: doc, fam: ['repeat-undo'] });
  S('Make the first paragraph bold', ['blocks.1.marks.0.type=bold'], { setup: doc });
  S('make the paragraph italic', ['blocks.1.marks.0.type=italic'], { setup: doc, fam: ['paraphrase'] });
  S('Turn the list into a numbered list', ['blocks.2.style=numbered'], { setup: doc });
  S('Move the first list to the end', ['blocks.2.kind=list'], { setup: ['Add a list: a, b', 'Add a heading Last', 'Add a paragraph body'] });
  S('add a heading Shopping and a paragraph hello world', ['blocks.0.text=Shopping', 'blocks.1.text==hello world'], { fam: ['multi'] });
  S('add a heading A, a heading B and a heading C', ['blocks.length=3'], { fam: ['multi', 'shared-arg'], gap: true });
  S('add a heading Shopping then undo', ['blocks.length=0'], { fam: ['repeat-undo', 'multi'] });
  S('add a heading Shopping, no, Groceries', ['blocks.0.text==Groceries', 'blocks.length=1'], { fam: ['self-correction'], gap: true });
  S('add a paragraph with 45.5 degrees', ['blocks.0.text==45.5 degrees'], { fam: ['decimal', 'probe'], gap: true, note: 'dictated payload must keep the decimal' });
  S('add a paragraph: we meet at 12:30', ['blocks.0.text==we meet at 12:30'], { fam: ['probe', 'coordinates'], gap: true });
  S('add a list and make it numbered', ['blocks.0.kind=list', 'blocks.0.style=numbered'], { fam: ['multi', 'reference'], gap: true });
  S('add a heading Shopping and make the first paragraph bold', ['blocks[kind=heading].text==Shopping', 'blocks[kind=paragraph].marks.0.type=bold'], { setup: ['Add a paragraph hello world'], fam: ['multi'] });
  S('add a heading Zeta', ['blocks.0.text==Zeta'], { fam: [] });
  S('Clear the selection', ['selection=null'], { setup: doc });
  Q('How many lists are there?', ['1 list'], { setup: doc });
  Q('how many paragraphs are there', ['1 paragraph'], { setup: doc });
  Q('how many headings do i have', ['1'], { setup: doc, fam: ['messy'] });
  Q('read para 1', ['hello world'], { setup: doc, fam: ['abbrev'], gap: true });
  add(W, 'add a heading Shopping and what is 2 plus 2', { answer: ['4'], state: ['blocks.0.text=Shopping'] }, { tab, fam: ['multi', 'world-switch'] });
  add(W, 'asdf qwer zxcv', { none: true }, { tab, fam: ['negative'] });
}

function reader(add, r) {
  const W = 'docs.reader', tab = 'documents';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab, ...o });
  Q('Which documents do I have?', ['Hansel and Gretel']);
  Q('list my docs pls', ['Hansel and Gretel'], { fam: ['messy', 'abbrev'] });
  Q('Open the fairy tale story.', ['is open'], { fam: ['paraphrase'] });
  Q('Describe the file.', ['685 words']);
  Q('how many words are in the story', ['685'], { fam: ['messy'] });
  Q('words in the story?', ['685'], { fam: ['messy'] });
  Q('Which places are mentioned?', ['house', 'forest']);
  Q('Who did the witch lock?', ['Hansel']);
  Q('who did the witch lock up in the cage', ['Hansel'], { fam: ['paraphrase'], gap: true });
  Q('Tell me about the stepmother.', ['stepmother']);
  Q('what happens first in the story', ['At the beginning']);
  Q('What happens in the middle?', ['In the middle']);
  Q('tell me about section 3', ['Section 3']);
  Q('who does the story follow', ['Hansel'], { fam: ['paraphrase'] });
  Q('how many sections does the story have', ['4'], { fam: ['probe'], gap: true });
  Q('count the witch', ['mentioned']);
  Q('how many times is the witch mentioned', ['mentioned'], { fam: ['paraphrase'] });
  Q('Show the first result.', ['Result 1'], { setup: ['count the witch'], gap: true });
  Q('what is the story about', ['Hansel'], { fam: ['probe'] });
  Q('who said nibble nibble little mouse', ['voice'], { fam: ['probe'], gap: true });
  Q('how many words are in the story and what is 2 plus 2', ['685', '4'], { fam: ['multi', 'world-switch'] });
  Q('who is the main character and how many words are there', ['Hansel', '685'], { fam: ['multi'], gap: true });
  Q('words in the story, no, sections', ['4'], { fam: ['self-correction'], gap: true });
  add(W, 'asdf qwer zxcv', { none: true }, { tab, fam: ['negative'] });
}

function shell(add, r) {
  const W = 'ui.shell';
  const S = (m, state, o = {}) => add(W, m, { state }, { tab: 'robot', ...o });
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab: 'robot', ...o });
  S('Open the editor.', ['activeTab=editor']);
  S('i want the editor', ['activeTab=editor', 'previousTab=robot'], { fam: ['messy'] });
  S('Show me the document', ['activeTab=editor'], { fam: ['paraphrase'] });
  S('show the map', ['activeTab=map']);
  S('open the music tab', ['activeTab=music']);
  S('go to the drawing board', ['activeTab=draw'], { fam: ['paraphrase'] });
  S('show me the charts', ['activeTab=charts'], { fam: ['paraphrase'] });
  S('open chess', ['activeTab=chess'], { fam: ['messy'] });
  S('open the documents tab', ['activeTab=documents']);
  S('back to the avatar', ['activeTab=robot'], { setup: ['Open the editor.'], fam: ['paraphrase'] });
  S('previous screen', ['activeTab=robot'], { setup: ['Open the editor.'], fam: ['paraphrase'] });
  S('go back', ['activeTab=robot'], { setup: ['Open the editor.'], fam: ['messy'] });
  S('I want to play hangman', ['activeTab=hangman'], { fam: [] });
  S('lets play hangman', ['activeTab=hangman'], { fam: ['messy'] });
  S('play tic tac toe', ['activeTab=tictactoe'], { fam: ['messy'] });
  S('I want to play twenty questions', ['activeTab=guess'], { fam: ['paraphrase'] });
  S('Speak slower.', ['rate=0.75']);
  S('Set the speech rate to 1.5.', ['rate=1.5'], { fam: ['decimal'] });
  S('make the speed one and a half', ['rate=1.5'], { fam: ['paraphrase', 'decimal'] });
  S('faster voice', ['rate=1.25'], { fam: ['messy'] });
  S('speech rate 0.5', ['rate=0.5'], { fam: ['decimal', 'messy'] });
  S('speak at 1.75', ['rate=1.75'], { fam: ['decimal'], gap: true });
  S('Speak English', ['language=en']);
  S('Stop listening.', ['listening=false']);
  S('open the editor and then the map', ['activeTab=map'], { fam: ['multi'] });
  S('open the map, no, the music', ['activeTab=music'], { fam: ['self-correction'], gap: true });
  S('open the editor then go back', ['activeTab=robot'], { fam: ['multi', 'repeat-undo'] });
  S('speak slower and open the map', ['rate=0.75', 'activeTab=map'], { fam: ['multi'] });
  S('open the editor and add a heading Shopping', ['activeTab=editor', 'docs.editor:blocks.0.text=Shopping'], { fam: ['multi', 'world-switch'] });
  S('open the map and show me Paris', ['activeTab=map', 'geo.map:focus.name=Paris'], { fam: ['multi', 'world-switch'] });
  S('go to the music tab and play middle C', ['activeTab=music', 'media.music:playing=true'], { fam: ['multi', 'world-switch'] });
  S('switch to the drawing and draw a red house', ['activeTab=draw', 'art.draw:objects[kind=house].color=red'], { fam: ['multi', 'world-switch'] });
  S('open the charts tab and make a chart: apples 5, pears 3', ['activeTab=charts', 'data.charts:charts.0.labels.length=2'], { fam: ['multi', 'world-switch'] });
  Q('Which tab am I on?', ['Avatar']);
  Q('what tab is this', ['Avatar'], { fam: ['messy'] });
  Q('show my phrase log', ['phrase log'], { fam: ['probe'] });
  add(W, 'asdf qwer zxcv', { none: true }, { tab: 'robot', fam: ['negative'] });
}

function help(add, r) {
  const W = 'ui.help';
  const Q = (m, answer, o = {}) => add(W, m, { answer }, { tab: 'robot', ...o });
  Q('What can I say here?', ['you can say']);
  Q('what else can i say', ['more']);
  Q('help', ['tab'], { fam: ['messy'] });
  Q('help me', ['tab']);
  Q('what can you do', ['chat'], { fam: ['paraphrase'] });
  Q('what commands do you recognise', ['I can'], { fam: ['paraphrase'] });
  Q('how do i play chess', ['knight to f3']);
  Q('how u play chess', ['knight to f3'], { fam: ['messy', 'abbrev'] });
  Q('how do i add a table', ['table'], { fam: ['probe'], gap: true });
  Q('what does this tab do', ['Avatar'], { fam: ['probe'] });
  Q('example pls', ['for example'], { fam: ['messy'] });
  Q('help i am lost', ['Avatar'], { fam: ['messy'] });
  Q('what can i say here', ['Editor'], { tab: 'editor' });
  Q('what can i say here', ['Hangman'], { tab: 'hangman' });
  Q('what does this tab do', ['Chess'], { tab: 'chess' });
  Q('what can I say here', ['Map'], { tab: 'map' });
  Q('Why didn\'t you understand?', ['did not understand'], { setup: ['Zorb flimbles quickly'], fam: ['probe'] });
  Q('why not', ['did not understand'], { setup: ['Zorb flimbles quickly'], fam: ['probe', 'reference'] });
  Q('help and what is 2 plus 2', ['4'], { fam: ['multi', 'world-switch'], gap: true });
  add(W, 'asdf qwer zxcv', { none: true }, { tab: 'robot', fam: ['negative'] });
}
