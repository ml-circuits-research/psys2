// Generator of training examples for media.music (spec 08). Browser-safe, imports nothing.
// Notes, registers, qualities, scale types and instruments come from the world's own lexicons (`context.lexicons`),
// small embedded lists are the fallback. The expected circuit of every text is one core.request with the action and the
// arguments the matching pattern family emits (arguments in emit order, undefined values left out). Negatives are
// sentences of other worlds and near misses (food, chess, weather) that this world must not take.
export const version = '1';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const q = (s) => JSON.stringify(String(s));
const sp = (w) => String(w).replace(/[_-]/g, ' ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const E = (action, args = {}) => `@x1 core.request action=music.${action}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` arg.${k}=${v}`).join('')}`;

const FB = {
  notes: ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c_sharp', 'd_flat', 'f_sharp', 'b_flat', 'e_flat', 'g_sharp', 'a_flat'],
  regs: ['high', 'low', 'middle'],
  quals: ['major', 'minor', 'diminished', 'augmented'],
  scales: ['major', 'minor', 'dorian', 'mixolydian', 'pentatonic', 'blue'],
  insts: ['piano', 'organ', 'flute', 'bells', 'bass', 'marimba', 'violin'],
  songs: ['twinkle twinkle little star', 'happy birthday', 'ode to joy', 'frere jacques', 'mary had a little lamb', 'jingle bells', 'old macdonald', 'london bridge', 'row row row your boat', 'brahms lullaby'],
  degs: ['a little', 'a bit', 'much', 'a lot'],
};
const NEG = [
  'What is the weather like today?', 'Add milk to my shopping list.', 'Play knight to f3.', 'Draw a red circle.',
  'How much is two plus three?', 'What is the capital of France?', 'Turn the page.', 'I want to play tic tac toe.',
  'Make a bar chart of apples and pears.', 'What time is it?', 'Show me a picture of a dog.', 'Delete the last chart.',
  'Tell me a joke.', 'Who is the president?', 'Open the map of Spain.', 'I like to play football.',
];

export function generate({ rng: r, count = 300, context } = {}) {
  const lx = (id, fb) => (context?.lexicons?.[id]?.length ? context.lexicons[id] : fb);
  const notes = FB.notes.filter((n) => lx('lex.media.music.notes', FB.notes).includes(n));
  const regs = lx('lex.media.music.registers', FB.regs).filter((w) => FB.regs.includes(w));
  const quals = lx('lex.media.music.qualities', FB.quals).filter((w) => FB.quals.includes(w));
  const scales = FB.scales.filter((s) => lx('lex.media.music.scaletypes', FB.scales).includes(s));
  const insts = FB.insts.filter((s) => lx('lex.media.music.instruments', FB.insts).includes(s));
  const note = () => pick(r, notes), inst = () => pick(r, insts), scale = () => pick(r, scales), qual = () => pick(r, quals);
  const nw = (n) => sp(n);
  const T = [];
  const add = (group, ph, make, extra = {}) => T.push({ group, ph, make, ...extra });
  const onI = (i) => (i ? ` on the ${i}` : '');
  const maybeInst = () => (chance(r, 0.35) ? inst() : undefined);

  // ---- single notes ----
  add('music.note', 'request', () => { const n = note(), i = maybeInst(); return { text: `${pick(r, ['Play', 'Please play', 'Can you play', 'Could you play'])} ${pick(r, ['a ', 'the ', ''])}${nw(n)}${onI(i)}.`.replace('Play a b', 'Play b'), expect: E('playNote', { note: n, inst: i }) }; });
  add('music.note.reg', 'request', () => { const n = pick(r, ['c', 'g', 'a', 'e', 'd']), g = pick(r, regs); return { text: `Play ${g === 'middle' ? 'middle' : `a ${g}`} ${nw(n)}.`, expect: E('playNote', { reg: g, note: n }) }; });
  add('music.note.sounds', 'question', () => { const n = pick(r, ['c', 'g', 'e', 'd', 'f']); return { text: pick(r, [`How does a ${nw(n)} sound?`, `What does ${nw(n)} sound like?`]), expect: E('playNote', { note: n }) }; });

  // ---- chords ----
  add('music.chord', 'request', () => { const n = pick(r, ['c', 'd', 'e', 'f', 'g', 'a']), ql = qual(), i = maybeInst(); return { text: `Play ${pick(r, ['a ', 'the ', ''])}${nw(n)} ${ql} chord${onI(i)}.`, expect: E('playChord', { root: n, q: ql, inst: i }) }; });
  add('music.chord.bare', 'ellipsis', () => { const n = pick(r, ['c', 'd', 'e', 'f', 'g', 'a']); return { text: `${cap(nw(n))} chord.`, expect: E('playChord', { root: n }) }; });

  // ---- scales ----
  add('music.scale', 'request', () => { const n = pick(r, ['c', 'd', 'e', 'f', 'g', 'a']), s = scale(), i = maybeInst(); return { text: `Play the ${nw(n)} ${sp(s)} scale${onI(i)}.`, expect: E('playScale', { root: n, st: s, inst: i }) }; });

  // ---- songs ----
  add('music.song', 'request', () => { const s = pick(r, FB.songs); return { text: pick(r, [`Play ${s}.`, `Play the song ${s}.`, `Sing ${s}.`]), expect: E('playAny', { title: q(s) }), tolerant: true }; });
  add('music.random', 'request', () => ({ text: pick(r, ['Play a song.', 'Play me a song.', 'Play something.']), expect: E('random') }));

  // ---- transport ----
  add('music.stop', 'request', () => ({ text: pick(r, ['Stop the music.', 'Stop playing.', 'Be quiet.', 'Stop.']), expect: E('stop') }));
  add('music.loop', 'request', () => ({ text: pick(r, ['Loop it.', 'Play it on repeat.', 'Keep playing.']), expect: E('loop', { on: 'true' }) }), { tolerant: true });
  add('music.replay', 'request', () => ({ text: pick(r, ['Play it again.', 'Again.', 'Once more.', 'Play that again.']), expect: E('replay') }), { tolerant: true });

  // ---- tempo / volume / instrument ----
  add('music.tempo.slower', 'request', () => { const t = pick(r, ['Slower.', 'Play it slower.', 'Slow down.']); return { text: t, expect: E('tempo', /^play/i.test(t) ? { dir: 'slower', replay: 'true' } : { dir: 'slower' }) }; }, { tolerant: true });
  add('music.tempo.faster', 'request', () => { const t = pick(r, ['Faster.', 'Play it faster.', 'Speed up.']); return { text: t, expect: E('tempo', /^play/i.test(t) ? { dir: 'faster', replay: 'true' } : { dir: 'faster' }) }; }, { tolerant: true });
  add('music.tempo.bpm', 'request', () => { const b = 60 + 10 * Math.floor(r() * 12); return { text: `Set the tempo to ${b} bpm.`, expect: E('tempo', { bpm: b }) }; }, { tolerant: true });
  add('music.volume.louder', 'request', () => ({ text: pick(r, ['Louder.', 'Turn it up.', 'Make it louder.']), expect: E('volume', { dir: 'louder' }) }), { tolerant: true });
  add('music.volume.quieter', 'request', () => ({ text: pick(r, ['Quieter.', 'Turn it down.', 'Make it quieter.']), expect: E('volume', { dir: 'quieter' }) }), { tolerant: true });
  add('music.instrument', 'request', () => { const i = inst(); return { text: pick(r, [`Use the ${i}.`, `Switch to the ${i}.`, `Change the instrument to ${i}.`]), expect: E('instrument', { inst: i }) }; }, { tolerant: true });

  // ---- R2 families: the shapes of coverage.md (fillers, abbreviations, word order, indirect, wishes, units) ----
  add('music.note.single', 'request', () => { const n = note(); return { text: pick(r, [`Just one ${cap(nw(n))} note.`, `${cap(nw(n))} note pls.`, `Play a single ${cap(nw(n))}.`, `Note ${cap(nw(n))}.`]), expect: E('playNote', { note: n, explicit: 'true' }) }; });
  add('music.chord.arp', 'request', () => { const n = pick(r, ['c', 'd', 'e', 'f', 'g', 'a']); return { text: pick(r, [`Spread the ${cap(nw(n))} chord out.`, `Play the ${cap(nw(n))} chord one note at a time.`]), expect: E('playChord', { root: n, mode: 'arpeggio' }) }; });
  add('music.scale.bare', 'ellipsis', () => { const n = pick(r, ['c', 'd', 'e', 'f', 'g']); return { text: `${cap(nw(n))} major scale pls.`, expect: E('playScale', { root: n, st: 'major' }) }; });
  add('music.loop.wish', 'request', () => ({ text: pick(r, ['I want it to loop.', 'Keep looping that.', 'Turn on looping.', 'Put it on repeat.']), expect: E('loop', { on: 'true' }) }), { tolerant: true });
  add('music.loop.off', 'request', () => ({ text: pick(r, ['Dont loop it.', 'Play it just once.', 'Stop looping.', 'Turn off the loop.']), expect: E('loop', { on: 'false' }) }), { tolerant: true });
  add('music.stop.voice', 'request', () => ({ text: pick(r, ['Cut it out.', 'Stop that noise.', 'I want it to stop.', 'Enough.']), expect: E('stop') }));
  add('music.replay.voice', 'request', () => ({ text: pick(r, ['One more go.', 'Run it back.', 'Can you run that once more?']), expect: E('replay') }), { tolerant: true });
  add('music.tempo.indirect', 'indirect', () => { const slow = chance(r, 0.5); return { text: slow ? pick(r, ['Not so fast.', 'Its too fast.', 'Take it easy.']) : pick(r, ['Too slow.', 'More speed.', 'The tempo is too slow.']), expect: E('tempo', { dir: slow ? 'slower' : 'faster' }) }; }, { tolerant: true });
  add('music.tempo.bpm2', 'request', () => { const b = 60 + 10 * Math.floor(r() * 12); return { text: pick(r, [`${b} bpm please.`, `Tempo ${b}.`, `Make it ${b} beats per minute.`]), expect: E('tempo', { bpm: b }) }; }, { tolerant: true });
  add('music.volume.indirect', 'indirect', () => { const lo = chance(r, 0.5); return { text: lo ? pick(r, ['Too loud.', 'Not so loud.', 'The volume is too high.']) : pick(r, ['Too quiet.', 'I cant hear anything.', 'The volume is too low.']), expect: E('volume', { dir: lo ? 'quieter' : 'louder' }) }; }, { tolerant: true });
  add('music.volume.num', 'request', () => { const v = 10 * (1 + Math.floor(r() * 9)); return { text: pick(r, [`Volume ${v}.`, `Set the volume to ${v}.`, `Volume at ${v} percent.`]), expect: E('volume', { v }) }; }, { tolerant: true });
  add('music.volume.max', 'request', () => ({ text: pick(r, ['Volume to max.', 'Full volume.', 'All the way up please.', 'Turn it all the way up.']), expect: E('volume', { v: 100 }) }), { tolerant: true });
  add('music.instrument.wish', 'request', () => { const i = inst(); return { text: pick(r, [`I prefer the ${i}.`, `I want the ${i}.`, `Go back to the ${i}.`]), expect: E('instrument', { inst: i }) }; }, { tolerant: true });
  add('music.status.playing', 'question', () => ({ text: pick(r, ['Whats playing now?', 'Which song is on?', 'What is this tune called?']), expect: E('status', { what: 'playing' }) }));
  add('music.songinfo.who', 'question', () => { const s = pick(r, FB.songs); return { text: pick(r, [`Whos behind ${s}?`, `Tell me who wrote ${s}.`, `Whos the composer of ${s}?`]), expect: E('songInfo', { title: q(s), what: 'composer' }) }; }, { tolerant: true });
  add('music.melody.bare', 'ellipsis', () => { const ns = [0, 1, 2, 3].map(() => cap(nw(pick(r, ['c', 'd', 'e', 'f', 'g', 'a'])))); return { text: pick(r, [`Melody: ${ns.join(' ')}.`, `Here is my tune: ${ns.join(' ')}.`]), expect: E('melodySet', { notes: q(ns.join(' ')) }) }; });
  add('music.keysig.which', 'question', () => { const n = pick(r, ['d', 'e', 'a', 'g']); return { text: `Which sharps are in ${cap(nw(n))} major?`, expect: E('keySig', { acc: 'sharp', root: n, m: 'major' }) }; });

  // ---- negatives ----
  add('music.negative', 'out-of-domain', () => ({ text: pick(r, NEG), expect: null, negative: true }), { noise: false });

  const out = [], seen = new Set();
  let tries = 0;
  while (out.length < count && tries < count * 20) {
    const t = T[tries % T.length]; tries++;
    const ex = t.make();
    let text = ex.text.replace(/\s+/g, ' ').replace(/\s+([.?!,])/g, '$1').replace(/^(\w)/, (c) => c.toUpperCase());
    if (!ex.negative && t.noise !== false && chance(r, 0.15)) text = pick(r, ['Please, ', 'Okay, ', 'Um, ']) + text.charAt(0).toLowerCase() + text.slice(1);
    if (!ex.negative && t.noise !== false && chance(r, 0.1)) text = text.replace(/[.]$/, '!');
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph, ...(ex.negative ? { negative: true } : {}) });
  }
  return out;
}
