// Generator of training examples for docs.reader (spec 08). Browser-safe, imports nothing.
// Entities, kin words, ordinals, verbs and document words come from the world's lexicons (`context.lexicons`) with small embedded fallbacks.
// The expected circuit of every text is known independently of the formalizer: one core.request with the action and the arguments the
// matching pattern family emits (in emit order). Negatives are sentences of other worlds and near misses that this world must not take.
export const version = '1';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const q = (s) => JSON.stringify(String(s).replace(/^the /, ''));
const sp = (w) => String(w).replace(/_/g, ' ');
const E = (action, args = {}) => `@x1 core.request action=docr.${action}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` arg.${k}=${v}`).join('')}`;

const FB = {
  docs: ['story', 'tale', 'file', 'text', 'book', 'article', 'document'],
  kin: ['sister', 'brother', 'mother', 'father', 'son', 'daughter', 'husband', 'wife', 'uncle', 'aunt'],
  units: ['sentence', 'word', 'paragraph', 'section', 'chapter'],
  ordinals: ['first', 'second', 'third', 'fourth', 'last'],
  parts: ['paragraph', 'sentence', 'section', 'chapter'],
  verbs: ['help', 'helped', 'save', 'saved', 'rescue', 'rescued', 'love', 'loved', 'hate', 'hated', 'kill', 'killed', 'eat', 'ate', 'lock', 'locked', 'follow', 'followed', 'push', 'pushed'],
  names: ['Hansel', 'Gretel', 'the witch', 'the father', 'the stepmother', 'the woodcutter'],
  things: ['the oven', 'the cage', 'the bread', 'the forest', 'the pebbles', 'the castle', 'the river', 'the key'],
  quotes: ['I do not know how', 'Come in dear children', 'Show me first', 'The witch is dead', 'I will find a way', 'Who is nibbling at my house', 'Good morning'],
  queries: ['witch', 'oven', 'bread', 'forest', 'golden key', 'old woman', 'moonlight', 'red hood'],
  sayverbs: ['said', 'asked', 'replied', 'cried', 'whispered', 'shouted'],
  talkverbs: ['say', 'ask', 'reply', 'answer', 'cry', 'shout', 'whisper'],
};

export function generate({ rng: r, count = 300, context } = {}) {
  const lx = (id, fb) => (context?.lexicons?.[id]?.length ? context.lexicons[id] : fb);
  const docs = lx('lex.docs.reader.docs', FB.docs).filter((w) => !w.includes('_') && !['doc', 'pdf', 'reading', 'chapter_file'].includes(w));
  const kin = lx('lex.docs.reader.kin', FB.kin).filter((w) => !['dad', 'mom', 'mum', 'child'].includes(w));
  const units = lx('lex.docs.reader.units', FB.units).filter((w) => w !== 'character');
  const ordinals = lx('lex.docs.reader.ordinals', FB.ordinals);
  const parts = lx('lex.docs.reader.parts', FB.parts);
  const verbs = lx('lex.docs.reader.verbs', FB.verbs);
  const names = FB.names, things = FB.things;
  const doc = () => pick(r, docs);
  const T = [];
  const add = (group, ph, make) => T.push({ group, ph, make });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  add('doc.describe', 'request', () => ({ text: pick(r, [`Describe the ${doc()}.`, `Analyze the ${doc()}.`, `Introduce this ${doc()}.`]), expect: E('describe') }));
  add('doc.summary', 'request', () => ({ text: pick(r, [`Summarize the ${doc()}.`, `Recap the ${doc()}.`, `Give me a short summary of the ${doc()}.`]), expect: E('summary') }));
  add('doc.summary', 'question', () => ({ text: `What is the ${doc()} about?`, expect: E('summary') }));
  add('doc.summary.k', 'request', () => { const k = 1 + Math.floor(r() * 5); return { text: `Summarize the ${doc()} in ${k} sentences.`, expect: E('summary', { k }) }; });
  add('doc.summary.section', 'request', () => { const n = 1 + Math.floor(r() * 6); return { text: `Summarize section ${n}.`, expect: E('summary', { n }) }; });
  add('doc.summary.section', 'request', () => { const o = pick(r, ordinals); return { text: `Summarize the ${o} section.`, expect: E('summary', { ord: o }) }; });
  add('doc.characters', 'question', () => ({ text: pick(r, ['Who are the characters?', 'Who are the main characters?', 'Which characters are there?', `Who is in the ${doc()}?`]), expect: E('characters') }));
  add('doc.main', 'question', () => ({ text: pick(r, ['Who is the main character?', 'Who is the protagonist?', 'Who is mentioned the most?']), expect: E('mainCharacter') }));
  add('doc.places', 'question', () => pick(r, [{ text: 'Which places are mentioned?', expect: E('places') }, { text: `Where does the ${doc()} take place?`, expect: E('places') }, { text: 'Which objects are mentioned?', expect: E('places', { kind: 'things' }) }]));
  add('doc.keywords', 'question', () => ({ text: pick(r, ['What are the key words?', 'What are the main topics?', 'Show me the keywords.']), expect: E('keywords') }));
  add('doc.outline', 'request', () => ({ text: pick(r, ['Show me the outline.', 'List the sections.', 'Show me the headings.', `How is the ${doc()} structured?`]), expect: E('outline') }));
  add('doc.stats', 'question', () => { const u = pick(r, units); return { text: pick(r, [`How many ${u}s are there in the ${doc()}?`, `How many ${u}s does the ${doc()} have?`]), expect: E('stats', { u }) }; });
  add('doc.who', 'question', () => { const n = pick(r, names); return { text: pick(r, [`Who is ${n}?`, `Tell me about ${n}.`]), expect: E('who', { x: q(n) }) }; });
  add('doc.did', 'question', () => { const n = pick(r, names); return { text: pick(r, [`What did ${n} do?`, `What has ${n} done?`, `Tell me what ${n} did.`]), expect: E('did', { x: q(n) }) }; });
  add('doc.happened', 'question', () => { const n = pick(r, names); return { text: pick(r, [`What happened to ${n}?`, `What became of ${n}?`]), expect: E('happened', { x: q(n) }) }; });
  add('doc.where', 'question', () => { const n = pick(r, names); return pick(r, [{ text: `Where does ${n} live?`, expect: E('where', { x: q(n), mode: 'live' }) }, { text: `Where did ${n} go?`, expect: E('where', { x: q(n), mode: 'go' }) }]); });
  add('doc.whoV', 'multi-entity', () => { const n = pick(r, names), v = pick(r, verbs); return { text: `Who ${v} ${n}?`, expect: E('whoV', { v, x: q(n) }) }; });
  add('doc.didV', 'multi-entity', () => { const n = pick(r, names), v = pick(r, verbs.filter((w) => !/(ed|ate|ought|aught|ed)$/.test(w))); return { text: `Who did ${n} ${v}?`, expect: E('didV', { x: q(n), v }) }; });
  add('doc.said', 'question', () => { const s = pick(r, FB.quotes); return { text: `Who ${pick(r, FB.sayverbs)} "${s}" in the ${doc()}?`, expect: E('said', { q: JSON.stringify(s) }) }; });
  add('doc.saying', 'question', () => { const n = pick(r, names.slice(0, 6)); return { text: `What did ${n} ${pick(r, FB.talkverbs)}?`, expect: E('saying', { x: q(n) }) }; });
  add('doc.part', 'question', () => pick(r, [{ text: pick(r, ['What happens at the beginning?', `How does the ${doc()} begin?`, 'How does it start?']), expect: E('part', { at: 'begin' }) }, { text: pick(r, ['What happens at the end?', `How does the ${doc()} end?`, 'How does it end?']), expect: E('part', { at: 'end' }) }, { text: 'What happens in the middle?', expect: E('part', { at: 'middle' }) }]));
  add('doc.part.section', 'question', () => pick(r, [{ n: 1 + Math.floor(r() * 6) }, { o: pick(r, ordinals) }]).constructor === Object ? (() => { const n = 1 + Math.floor(r() * 6); return { text: `What happens in section ${n}?`, expect: E('part', { n }) }; })() : null);
  add('doc.sentence', 'request', () => { const n = 1 + Math.floor(r() * 60); return { text: pick(r, [`Show me sentence ${n}.`, `What is sentence ${n}?`]), expect: E('sentence', { n }) }; });
  add('doc.count', 'question', () => { const n = pick(r, names); return { text: pick(r, [`How many times is ${n} mentioned?`, `How many times does ${n} appear?`, `How often is ${n} mentioned?`]), expect: E('count', { x: q(n) }) }; });
  add('doc.search', 'request', () => { const w = pick(r, FB.queries); return pick(r, [{ text: `Find ${w} in the ${doc()}.`, expect: E('search', { q: q(w) }) }, { text: `Search the ${doc()} for ${w}.`, expect: E('search', { q: q(w) }) }, { text: `Where does it mention ${w}?`, expect: E('search', { q: q(w) }) }]); });
  add('doc.step', 'request', () => pick(r, [['Next result.', 'next'], ['Show the next result.', 'next'], ['Previous result.', 'prev'], ['Show the first result.', 'first'], ['Show the last result.', 'last']]).slice(0, 2).length ? (() => { const [text, dir] = pick(r, [['Next result.', 'next'], ['Show the next result.', 'next'], ['Previous result.', 'prev'], ['Show the first result.', 'first'], ['Show the last result.', 'last']]); return { text, expect: E('searchStep', { dir }) }; })() : null);
  add('doc.clear', 'request', () => ({ text: pick(r, ['Clear the search.', 'Stop highlighting.', 'Remove the highlights.']), expect: E('clearSearch') }));
  add('doc.across', 'question', () => { const w = pick(r, FB.queries); return { text: `Which documents mention ${w}?`, expect: E('across', { q: q(w) }) }; });
  add('doc.relation', 'question', () => { const n = pick(r, names.slice(0, 6)), k = pick(r, kin); return pick(r, [{ text: `Who is ${n}'s ${k}?`, expect: E('relation', { x: q(n), r: k }) }, { text: `Who is the ${k} of ${n}?`, expect: E('relation', { x: q(n), r: k }) }]); });
  add('doc.related', 'multi-entity', () => { const a = pick(r, names.slice(0, 6)); let b = pick(r, names.slice(0, 6)); if (b === a) b = names[(names.indexOf(a) + 1) % 5]; return { text: `How are ${a} and ${b} related?`, expect: E('isRelated', { x: q(a), y: q(b) }) }; });
  add('doc.read', 'request', () => pick(r, [{ o: 1 }, { n: 1 }, { a: 1 }, { e: 1 }]).o ? (() => { const o = pick(r, ordinals), u = pick(r, parts); return { text: `Read the ${o} ${u}.`, expect: E('read', { ord: o, u }) }; })() : (() => { const u = pick(r, parts), n = 1 + Math.floor(r() * 5); return { text: `Read ${u} ${n} aloud.`, expect: E('read', { u, n }) }; })());
  add('doc.read.all', 'request', () => ({ text: `Read the ${doc()} aloud.`, expect: E('read', { all: 'true' }) }));
  add('doc.list', 'question', () => ({ text: pick(r, [`Which ${doc()}s do I have?`, 'List my documents.']), expect: E('list') }));
  add('doc.sample', 'request', () => ({ text: pick(r, ['Load the sample story.', 'Open the example document.', 'Use the demo text.']), expect: E('loadSample') }));
  add('doc.close', 'request', () => ({ text: `Close the ${doc()}.`, expect: E('close') }));

  // ---- rule sweep families (colloquial, fragmentary, voice-style phrasings) ----------------------------------------------------------
  const pls = () => pick(r, ['', '', ' pls', ' please', ' thx']);
  add('doc.part.sweep', 'question', () => pick(r, [
    { text: pick(r, ['What is the beginning like?', 'Start of the story?', `How does the ${doc()} open?`, 'What happens first in the story?', 'Tell me how it begins.']), expect: E('part', { at: 'begin' }) },
    { text: pick(r, ['What is the ending like?', 'End of the story?', `How did the ${doc()} finish?`, 'What happens last in the story?', 'Tell me how it ends.']), expect: E('part', { at: 'end' }) },
    { text: pick(r, ['What is the middle like?', 'Middle of the story?', 'What happens at the very middle of the story?']), expect: E('part', { at: 'middle' }) },
  ]));
  add('doc.summary.sweep', 'request', () => { const n = 1 + Math.floor(r() * 6); return { text: pick(r, [`Sum up section ${n}${pls()}`, `Section ${n} summary${pls()}`, `Short summary of section ${n}`, `tldr section ${n}`, `Give me a summary of chapter ${n}`, `What is section ${n} in short?`, `Tell me about section ${n}.`]).replace(/\s+$/, ''), expect: E('summary', { n }) }; });
  add('doc.summary.sweep', 'request', () => { const o = pick(r, ordinals); return { text: pick(r, [`Can u summarize the ${o} section${pls()}`, `Summary of the ${o} section`, `The ${o} section in short`, `Tell me about the ${o} chapter`]), expect: E('summary', { ord: o }) }; });
  add('doc.summary.sweep', 'request', () => ({ text: pick(r, ['Give me the gist.', `What's the plot of the ${doc()}?`, `Whats this about?`, `${cap(doc())} summary pls`]), expect: E('summary') }));
  add('doc.search.sweep', 'request', () => { const w = pick(r, FB.queries); return { text: pick(r, [`Look for ${w}`, `${w} search pls`, `Can u search for ${w}`, `Find the word ${w}`, `Search for the word ${w}.`, `Where does ${w} appear?`, `Can you look for ${w} in here?`]), expect: E('search', { q: q(w) }) }; });
  add('doc.step.sweep', 'request', () => { const [text, dir] = pick(r, [['Next one please', 'next'], ['Next result pls', 'next'], ['One more result', 'next'], ['nxt', 'next'], ['Skip to the next match', 'next'], ['Previous one', 'prev'], ['Go back one result', 'prev'], ['Jump to the first hit', 'first'], ['Go to the last match', 'last']]); return { text, expect: E('searchStep', { dir }) }; });
  add('doc.clear.sweep', 'request', () => ({ text: pick(r, ['Clear the search highlights.', 'Get rid of the highlighting', 'No more highlights', 'Turn off the search marks', 'Remove the yellow marks']), expect: E('clearSearch') }));
  add('doc.stats.sweep', 'question', () => { const u = pick(r, units.filter((w) => w !== 'heading')); return { text: pick(r, [`${cap(u)} count`, `How long is the ${doc()} in ${u}s?`, `${cap(u)}s in the ${doc()}?`, `Count the ${u}s.`, `Number of ${u}s in the ${doc()}?`]), expect: E('stats', { u }) }; });
  add('doc.sentence.sweep', 'request', () => { const n = 1 + Math.floor(r() * 60); return { text: pick(r, [`Sentence ${n}`, `Line ${n} please`, `Whats sentence ${n}`, `Sentence number ${n}`]), expect: E('sentence', { n }) }; });
  add('doc.who.sweep', 'question', () => { const n = pick(r, names); return { text: pick(r, [`Whos ${n}`, `Tell me who ${n} is.`, `Hey who is ${n}?`, `What is ${n} like?`]), expect: E('who', { x: q(n) }) }; });
  add('doc.count.sweep', 'question', () => { const n = pick(r, names); return { text: pick(r, [`Count ${n}`, `How many mentions of ${n}?`, `${n} mentions count`, `Hw many times is ${n} said?`, `How many times does the name ${n} appear?`]), expect: E('count', { x: q(n) }) }; });
  add('doc.list.sweep', 'question', () => ({ text: pick(r, ['List my docs pls', 'Documents list', 'What files do I have here?', 'How many files do I have?']), expect: E('list') }));
  add('doc.across.sweep', 'question', () => { const w = pick(r, names.slice(1)); return { text: pick(r, [`What files talk about ${w}?`, `Which of my files mention ${w}?`, `Docs that mention ${w}`]), expect: E('across', { q: JSON.stringify(w) }) }; });
  add('doc.read.sweep', 'request', () => pick(r, [{ text: 'Read the story to me.', expect: E('read', { all: 'true' }) }, { text: 'Narrate the story to me.', expect: E('read', { all: 'true' }) }, { text: 'Show me the third paragraph.', expect: E('read', { ord: 'third', u: 'paragraph' }) }, { text: 'Go to section 2.', expect: E('read', { u: 'section', n: 2 }) }]));
  add('doc.chars.sweep', 'question', () => ({ text: pick(r, ['Who appears in it?', 'Cast of the story', `Characters in the ${doc()}?`, 'Name all people in the file.']), expect: E('characters') }));
  add('doc.ind.sweep', 'request', () => pick(r, [{ text: 'Tell me what the story is about.', expect: E('summary') }, { text: 'I want to know how the story ends.', expect: E('part', { at: 'end' }) }, { text: 'Could you tell me who the witch is?', expect: E('who', { x: '"witch"' }) }]));
  
  const NEG = ['What command do you recognise?', 'Why did you turn into a robot?', 'Who is Tom?', 'Where is Paris?', 'Tell me more.', 'Go on.', 'Find the cat.','Tom has 5 apples.', 'How many legs does a spider have?', 'What is the capital of France?', 'Play tic tac toe.', 'Give yourself visor eyes.', 'Make a bar chart of what everyone has.', 'Add a heading Shopping.', 'Make the second paragraph bold.',
    'Zoom in.', 'What time is it?', 'Say hello.', 'Draw a red house.', 'Play C D E F G.', 'Stop dictation.', 'What is half of 10?', 'Is a whale a fish?', 'Show me the editor.'];
  add('doc.negative', 'out-of-domain', () => ({ text: pick(r, NEG), expect: null, negative: true }));

  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const t = T[tries % T.length];
    const ex = t.make();
    if (!ex) continue;
    let text = ex.text;
    if (!ex.negative && chance(r, 0.15)) text = pick(r, ['Please, ', 'Okay, ', 'Well, ', 'Um, ']) + text.charAt(0).toLowerCase() + text.slice(1);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph, ...(ex.negative ? { negative: true } : {}) });
  }
  return out;
}
