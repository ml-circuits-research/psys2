// Operations of media.music (spec 07 section 7: "Music"). Browser-safe: relative imports only.
//
// State (ctx.state):
//   { instrument: 'piano'|'organ'|'flute'|'strings'|'bells'|'bass'|'marimba', tempo (bpm), tempoLocked, volume (0..100), key: 'C major',
//     current: null | { kind: 'note'|'chord'|'scale'|'song'|'melody', title, abc, notes: [names], seq: [names], key, songId?, mine? },
//     score: ABC text shown as sheet music, playing, loop, melody: { items: [{ p: ['C4'], beats }], abc },
//     highlight: [note names lit on the keyboard when nothing plays], songIndex, plays }
// Effects (host = docs/webchat/ui/tabs/music.mjs, Tone.js and abcjs):
//   music.play { abc, events: [[t, d, [midi], from, to]], beats, notes, instrument, tempo, volume, loop, title, kind }
//   music.stop {}        music.loop { loop }
// Observation: onObservation turns a failed play (sound blocked) into a spoken hint and, when the host reports the end
// of playback ({ phase: 'ended' }), sets playing=false (a reply only when a loop ended).
import { Note, pcFromLex, spoken, list, scaleNotes as tScale, chordNotes as tChord, detectChord, qualityKey, CHORD_TYPES, SCALE_TYPES, INTERVALS,
  intervalName, between, keyInfo, relativeOf, keysWith, frequency as tFreq, enharmonic as tEnh, LETTERS } from './theory.mjs';
import { parseAbc, transposeAbc, buildAbc, parsePitchName, parseKeyField, shiftBetween, keyField } from './abc.mjs';

export const INSTRUMENTS = ['piano', 'organ', 'flute', 'strings', 'bells', 'bass', 'marimba'];
const INST_OF = {
  piano: 'piano', keyboard: 'piano', grand_piano: 'piano', electric_piano: 'piano', organ: 'organ', church_organ: 'organ',
  flute: 'flute', whistle: 'flute', recorder: 'flute', string: 'strings', violin: 'strings', cello: 'strings', fiddle: 'strings', orchestra: 'strings',
  bell: 'bells', glockenspiel: 'bells', chime: 'bells', celesta: 'bells', bass: 'bass', bass_guitar: 'bass', double_bass: 'bass',
  marimba: 'marimba', xylophone: 'marimba', vibraphone: 'marimba',
};
const UP = new Set(['up', 'upward', 'upwards', 'higher', 'above', 'over', 'up_from', 'higher_than', 'louder', 'faster']);
const MODE_OF_SCALE = { min: 'minor', maj: 'major', major: 'major', ionian: 'major', minor: 'minor', natural_minor: 'minor', aeolian: 'minor', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian' };

export function initialState() {
  return {
    instrument: 'piano', tempo: 100, tempoLocked: false, volume: 70, key: 'C major', current: null, score: '', playing: false, loop: false,
    melody: { items: [], abc: '' }, highlight: [], songIndex: 0, plays: 0,
  };
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const show = (ctx) => { try { ctx.request('ui.openTab', { tab: 'music' }); } catch { /* the shell is optional */ } };
const instName = (i) => ({ strings: 'strings', bells: 'bells', bass: 'bass' }[i] ?? i);
const withThe = (i) => `the ${i}`;
const an = (w) => (/^[AEFHILMNORSX]/.test(String(w)) ? 'an' : 'a');
const num = (v) => (v === undefined || v === '' ? undefined : Number(v));

// ---- library --------------------------------------------------------------------------------------
function songs(ctx) {
  return ctx.find('media.music.song').map((w) => ({
    id: String(w.id).replace(/^kb\.song\./, ''), title: ctx.val(w, 'title'), aka: ctx.vals(w, 'aka'), composer: ctx.val(w, 'composer'), key: ctx.val(w, 'key'),
    tempo: ctx.val(w, 'tempo'), meter: ctx.val(w, 'meter'), year: ctx.val(w, 'year'), blurb: ctx.val(w, 'blurb'), abc: ctx.val(w, 'abc'),
  })).sort((a, b) => a.id.localeCompare(b.id));
}
const LIBRARY_ORDER = ['twinkle', 'birthday', 'ode', 'jacques', 'mary', 'jingle', 'macdonald', 'london', 'row', 'brahms'];
const ordered = (ctx) => songs(ctx).sort((a, b) => (LIBRARY_ORDER.indexOf(a.id) + 99) % 99 - (LIBRARY_ORDER.indexOf(b.id) + 99) % 99);
const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]s\b/g, 's').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const SUFFIXES = [
  [/\b(on repeat|in a loop|over and over|forever|continuously)$/, { loop: true }], [/\b(slowly|slow)$/, { speed: 0.75 }], [/\b(quickly|fast)$/, { speed: 1.33 }],
  [/\b(please|for me|again|now|once more|one more time|once)$/, {}], [/\b(softly|quietly)$/, { vol: 40 }], [/\b(loudly)$/, { vol: 90 }],
];
function stripSuffixes(text) {
  let t = plain(text); const flags = {};
  for (let again = true; again;) {
    budget.tick('ops.stripSuffixes');
    again = false;
    for (const [re, f] of SUFFIXES) { const m = t.match(re); if (m) { t = t.slice(0, m.index).trim(); Object.assign(flags, f); again = true; } }
  }
  return { text: t, flags };
}
const CURRENT_WORDS = new Set(['it', 'this', 'that', 'this song', 'that song', 'song', 'tune', 'melody', 'the song', 'this tune', 'that tune', 'this melody', 'that one', 'this one', 'piece', 'this piece', 'the tune', 'the melody']);
function findSong(ctx, raw) {
  const { text, flags } = stripSuffixes(raw);
  if (CURRENT_WORDS.has(text) || !text) return { current: true, flags };
  const all = ordered(ctx);
  const t = text.replace(/^(the|a|an) /, '').replace(/ (song|tune|melody)$/, '').replace(/^(song|tune) /, '');
  const names = (s) => [plain(s.title), ...s.aka.map(plain)].map((x) => x.replace(/^(the|a) /, ''));
  let hit = all.find((s) => names(s).includes(t));
  if (!hit && t.length >= 3) hit = all.find((s) => names(s).some((n) => n.startsWith(t) || (t.length >= 6 && t.startsWith(n) && n.split(' ').length >= 2)));
  if (!hit && t.length >= 3) { const toks = t.split(' '); hit = all.find((s) => { const hay = names(s).join(' ').split(' '); return toks.length >= 1 && toks.every((w) => hay.includes(w)); }); }
  return { song: hit ?? null, flags, text: t };
}

// ---- sequences of note names ("C D E F# G", "C4 half D4", "G G A rest") -----------------------------
const DURATIONS = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25 };
const TRAILERS = /\s+(to my melody|to the melody|to my tune|to it|at the end|to the end|after that|next|please|now|and then|at the end of my melody|to my composition)\s*$/i;
export function parseSeq(text, { octave = 4 } = {}) {
  let t = String(text ?? '').replace(/[♯]/g, '#').replace(/[♭]/g, 'b').replace(/[.!?]+$/g, '').trim();
  while (TRAILERS.test(t)) { budget.tick('ops.parseSeq'); t = t.replace(TRAILERS, ''); }
  const tokens = t.split(/[\s,;:]+/).filter(Boolean).map((x) => x.toLowerCase());
  const items = [], bad = [];
  let last = null, dotted = false, reg = 0;
  const FILL = new Set(['and', 'then', 'next', 'also', 'the', 'notes', 'note', 'these', 'followed', 'by', 'plus', 'with', 'of']);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if ((w === 'a' || w === 'an') && !items.length && ['rest', 'pause', 'silence', 'break', 'note'].includes(tokens[i + 1])) continue;
    if (FILL.has(w)) continue;
    if (['rest', 'pause', 'silence', 'break'].includes(w)) { last = { p: [], beats: 1, rest: true }; items.push(last); continue; }
    if (w === 'high' || w === 'higher') { reg = 1; continue; }
    if (w === 'low' || w === 'lower') { reg = -1; continue; }
    if (w === 'middle') continue;
    if (w === 'dotted') { dotted = true; continue; }
    if (DURATIONS[w] !== undefined || w === '0.5') {
      if (!last) { bad.push(w); continue; }
      last.beats = (w === '0.5' ? 2 : DURATIONS[w]) * (dotted ? 1.5 : 1);
      dotted = false; continue;
    }
    if ((w === 'sharp' || w === 'flat') && last && !last.rest && last.acc === '') {
      const pc = Note.get(last.p[0]); last.acc = w === 'sharp' ? '#' : 'b';
      last.p = [`${pc.letter}${last.acc}${pc.oct}`]; continue;
    }
    if (/^\d$/.test(w) && last && !last.rest && !last.hasOct) {
      const pc = Note.get(last.p[0]); last.hasOct = true; last.p = [`${pc.pc}${Number(w)}`]; continue;
    }
    const m = w.match(/^([a-g])(#{1,2}|b{1,2})?(\d)?$/);
    if (m) {
      const acc = m[2] ?? '';
      const oct = m[3] !== undefined ? Number(m[3]) : clamp(octave + reg, 0, 8);
      reg = 0;
      last = { p: [`${m[1].toUpperCase()}${acc}${oct}`], beats: 1, acc, hasOct: m[3] !== undefined };
      items.push(last); continue;
    }
    bad.push(w);
  }
  return { items: items.map((x) => ({ p: x.p, beats: x.beats })), bad };
}
const pitches = (names) => names.map((n) => parsePitchName(n));
const itemsToAbc = (items, { title, key, tempo, composer }) => buildAbc({ title, key, tempo, composer, items: items.map((it) => ({ p: it.p.length ? pitches(it.p) : null, beats: it.beats })) });
const itemsFromAbc = (abc) => parseAbc(abc).events.map((e) => ({ p: e.n, beats: e.d }));

// ---- the player -----------------------------------------------------------------------------------
const withTempo = (abc, bpm) => (/^Q:.*$/m.test(abc) ? abc.replace(/^Q:.*$/m, `Q:1/4=${bpm}`) : abc);
function makeCurrent(kind, title, abc, extra = {}) {
  const p = parseAbc(abc);
  const seq = []; for (const e of p.events) for (const n of e.n) if (!seq.includes(n)) seq.push(n);
  return { kind, title, abc, notes: p.notes, seq, key: p.key.name, ...extra };
}
function stopIfPlaying(ctx) { if (ctx.state.playing) { ctx.effect('music.stop', {}); ctx.state.playing = false; } }
/** Make `cur` the current thing and show it (no sound). */
function display(ctx, cur) {
  const s = ctx.state;
  stopIfPlaying(ctx);
  s.current = cur; s.score = cur.abc; s.highlight = [...cur.notes];
  show(ctx);
}
/** Make `cur` the current thing and play it with the state's instrument, tempo, volume and loop. */
function startPlay(ctx, cur) {
  const s = ctx.state;
  cur = { ...cur, abc: withTempo(cur.abc, s.tempo) };
  const p = parseAbc(cur.abc);
  s.current = cur; s.score = cur.abc; s.highlight = [];
  s.playing = true; s.plays += 1;
  ctx.effect('music.play', {
    abc: cur.abc, events: p.events.filter((e) => !e.rest).map((e) => [e.t, e.d, e.m, e.a, e.b]), beats: p.beats, notes: cur.notes,
    instrument: s.instrument, tempo: s.tempo, volume: s.volume, loop: s.loop, title: cur.title, kind: cur.kind,
  });
  show(ctx);
  return p;
}
const bpmText = (s) => `${s.tempo} beats per minute`;
const onInst = (s) => `on ${withThe(s.instrument)}`;
const loopText = (s) => (s.loop ? ' in a loop' : '');
function setInstrument(ctx, inst) {
  const id = INST_OF[inst];
  if (inst === undefined) return null;
  if (!id) return no('unsupported', `I do not have an instrument called ${String(inst).replace(/_/g, ' ')}. I can play ${joinAnd(INSTRUMENTS)}.`);
  ctx.state.instrument = id;
  return id;
}
function setBpm(ctx, bpm) {
  const n = num(bpm);
  if (n === undefined) return null;
  if (!Number.isFinite(n) || n < 30 || n > 240) return no('unsupported', 'I can play between 30 and 240 beats per minute.');
  ctx.state.tempo = Math.round(n); ctx.state.tempoLocked = true;
  return n;
}
const pitchTitle = (name) => {
  const n = Note.get(name);
  return n.oct === 4 && n.letter === 'C' && !n.acc ? 'middle C' : spoken(name);
};

export function playNote(ctx, { note, oct, reg, inst, explicit, beats, secs }) {
  const s = ctx.state;
  const pc = pcFromLex(note);
  if (!pc) return no('unsupported', 'Which note should I play? Say a letter from A to G, for example "play C sharp".');
  const o = num(oct);
  // "Play B2" is also a tic-tac-toe move (column B, row 2): music wins only on the Music tab or with the word "note".
  if (!explicit && o !== undefined && !reg && !inst && ['A', 'B', 'C'].includes(pc) && Number.isInteger(o) && o >= 1 && o <= 3) {
    const where = ctx.request('ui.whichTab');
    if (where.status === 'supported' && !/music/i.test(String(where.value))) {
      const r = ctx.request('ttt.move', { col: pc.toLowerCase(), row: String(o) });
      return r.status === 'supported' ? ok(r.value) : no(r.status, r.note);
    }
  }
  const adj = reg === 'high' || reg === 'higher' ? 1 : reg === 'low' || reg === 'lower' ? -1 : 0;
  const octave = o !== undefined ? o : 4 + adj;
  if (!Number.isInteger(octave) || octave < 0 || octave > 8) return no('unsupported', 'I can play octaves 0 to 8.');
  const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
  const name = `${pc}${octave}`;
  // "play A4 for 2 beats" / "for 3 seconds": the length of the note (beats, or seconds at the current tempo)
  let len = 2;
  if (beats !== undefined || secs !== undefined) {
    len = beats !== undefined ? Number(beats) : Number(secs) * (s.tempo ?? 100) / 60;
    if (!Number.isFinite(len) || len <= 0) return no('unsupported', 'How long should the note last? For example "play A4 for 2 beats".');
    if (len > 16) return no('unsupported', 'A single note can last up to 16 beats.');
    len = Math.max(0.25, Math.round(len * 4) / 4);
  }
  const abc = itemsToAbc([{ p: [name], beats: len }], { title: pitchTitle(name), key: 'C major', tempo: s.tempo });
  startPlay(ctx, makeCurrent('note', pitchTitle(name), abc));
  const f = tFreq(name);
  const lasting = beats !== undefined || secs !== undefined ? ` for ${len} ${len === 1 ? 'beat' : 'beats'}` : '';
  return ok(`Playing ${pitchTitle(name)}${pitchTitle(name) === 'middle C' ? ' (C4)' : ''}${lasting}, ${Math.round(f * 10) / 10} Hz, ${onInst(s)}.`);
}

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
function stackUp(names) {
  const out = []; let prev = -Infinity;
  for (const n of names) {
    const x = Note.get(n);
    let m = x.midi, o = x.oct;
    while (m <= prev) { budget.tick('music.stack'); m += 12; o += 1; }
    out.push(`${x.pc}${o}`); prev = m;
  }
  return out;
}
export function playChord(ctx, { root, q, n, sym, inst, mode, seq }) {
  const s = ctx.state;
  const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
  let notes, name;
  if (seq !== undefined) {
    const p = parseSeq(seq);
    if (p.bad.length || !p.items.length) return no('unsupported', `I could not read "${p.bad[0] ?? seq}" as a note name.`);
    notes = stackUp(p.items.filter((i) => i.p.length).map((i) => i.p[0]));
    const det = detectChord(notes);
    name = det ? det.name : list(notes);
  } else {
    let rootPc, key;
    if (sym !== undefined) { rootPc = pcFromLex(sym[0]); key = qualityKey('minor', n); } else { rootPc = pcFromLex(root); key = qualityKey(q, n); }
    if (!rootPc) return no('unsupported', 'Which chord should I play? For example "play a C major chord".');
    if (!CHORD_TYPES[key]) return no('unsupported', `I do not know the chord quality "${String(key).replace(/_/g, ' ')}".`);
    const c = tChord(rootPc, key, 4);
    if (!c) return no('unsupported', 'I cannot spell that chord.');
    notes = c.notes; name = c.name;
  }
  let items;
  if (mode === 'arpeggio') {
    const up = [...notes, Note.transpose(notes[0], '8P')];
    items = up.map((x, i) => ({ p: [x], beats: i === up.length - 1 ? 2 : 0.5 }));
  } else items = [{ p: notes, beats: 2 }];
  const abc = itemsToAbc(items, { title: mode === 'arpeggio' ? `${name} arpeggio` : `${name} chord`, key: 'C major', tempo: s.tempo });
  startPlay(ctx, makeCurrent('chord', mode === 'arpeggio' ? `${name} arpeggio` : `${name} chord`, abc));
  return ok(`Playing ${mode === 'arpeggio' ? 'the ' + name + ' arpeggio' : an(name) + ' ' + name + ' chord'}: ${list(notes)}, ${onInst(s)}.`);
}

function buildScale(ctx, { root, st, st2, dir }) {
  const s = ctx.state;
  const kd = parseKeyField(s.key);
  const rootPc = root !== undefined ? pcFromLex(root) : kd.tonic;
  const type = st2 ?? st ?? (root === undefined && st === undefined ? (kd.mode === 'minor' ? 'minor' : 'major') : 'major');
  if (!rootPc) return no('unsupported', 'Which scale should I play? For example "play the D major scale".');
  if (!SCALE_TYPES[type]) return no('unsupported', `I do not know the ${String(type).replace(/_/g, ' ')} scale.`);
  const sc = tScale(rootPc, type, 4);
  if (!sc) return no('unsupported', 'I cannot spell that scale.');
  let notes = sc.notes;
  const d = dir ?? 'ascending';
  if (/^(descending|down|downwards|back_down)$/.test(d)) notes = [...notes].reverse();
  else if (/up_and_down|both_ways|down_and_up/.test(d)) notes = d === 'down_and_up' ? [...notes].reverse().concat([...notes].slice(1)) : notes.concat([...notes].reverse().slice(1));
  const mode = MODE_OF_SCALE[type];
  const key = mode ? `${rootPc} ${mode}` : 'C major';
  const title = `${sc.name} scale`;
  const items = notes.map((n, i) => ({ p: [n], beats: i === notes.length - 1 ? 2 : 1 }));
  return { sc, notes, abc: itemsToAbc(items, { title, key, tempo: s.tempo }), title, dir: d };
}
export function playScale(ctx, args) {
  const s = ctx.state;
  const r1 = setInstrument(ctx, args.inst); if (r1?.status) return r1;
  const r2 = setBpm(ctx, args.bpm); if (r2?.status) return r2;
  const b = buildScale(ctx, args); if (b.status) return b;
  startPlay(ctx, makeCurrent('scale', b.title, b.abc));
  return ok(`Playing the ${b.sc.name} scale ${/up_and_down|both|down_and_up/.test(b.dir) ? 'up and down' : /^(descending|down)/.test(b.dir) ? 'downwards' : 'upwards'}: ${list(b.notes.slice(0, 8))}${b.notes.length > 8 ? ' ...' : ''}, ${onInst(s)}.`);
}

function playSongNow(ctx, song, { inst, bpm, flags = {} }) {
  const s = ctx.state;
  const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
  const r2 = setBpm(ctx, bpm); if (r2?.status) return r2;
  if (bpm === undefined && !s.tempoLocked) s.tempo = song.tempo;
  if (flags.speed) s.tempo = clamp(Math.round(s.tempo * flags.speed), 30, 240);
  if (flags.vol) s.volume = flags.vol;
  if (flags.loop) s.loop = true;
  startPlay(ctx, makeCurrent('song', song.title, song.abc, { songId: song.id }));
  return ok(`Playing "${song.title}" ${onInst(s)} at ${bpmText(s)}${loopText(s)}. It is in ${song.key}.`);
}
export function playAny(ctx, { title, inst, bpm }) {
  const f = findSong(ctx, title);
  if (f.current) {
    if (!ctx.state.current) return no('missing', 'There is nothing to play yet. Try "play Ode to Joy" or "play a C major chord".');
    return replay(ctx, { inst });
  }
  if (f.song) return playSongNow(ctx, f.song, { inst, bpm, flags: f.flags });
  const seq = parseSeq(title);
  if (seq.items.length && !seq.bad.length) {
    const s = ctx.state;
    const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
    const r2 = setBpm(ctx, bpm); if (r2?.status) return r2;
    const abc = itemsToAbc(seq.items, { title: 'Your notes', key: 'C major', tempo: s.tempo });
    startPlay(ctx, makeCurrent('melody', 'Your notes', abc));
    return ok(`Playing the notes ${noteWords(seq.items)} ${onInst(s)}.`);
  }
  const names = ordered(ctx).map((x) => x.title);
  return no('missing', `I do not know a song called "${String(title).trim()}". I know ${joinAnd(names.slice(0, 5))} and ${names.length - 5} more. You can also say "play C D E F G".`);
}
export function random(ctx, { inst }) {
  const all = ordered(ctx);
  const s = ctx.state;
  // a random song, never the one that just played (RP3: "play a random song"); the index keeps a sequence for the tests' fixed seed
  const playing = s.current?.songId;
  const pool = all.filter((x) => x.id !== playing);
  const pick = (pool.length ? pool : all);
  const song = pick[Math.floor(Math.random() * pick.length)];
  s.songIndex = (s.songIndex + 1) % all.length;
  return playSongNow(ctx, song, { inst, flags: {} });
}
export function replay(ctx, { inst } = {}) {
  const s = ctx.state;
  if (!s.current) return no('missing', 'There is nothing to play again yet. Try "play a C major chord" or "play Ode to Joy".');
  const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
  startPlay(ctx, s.current);
  return ok(`Playing ${s.current.kind === 'song' ? '"' + s.current.title + '"' : s.current.title} again ${onInst(s)} at ${bpmText(s)}${loopText(s)}.`);
}
export function playMelody(ctx, { inst } = {}) {
  const s = ctx.state;
  if (!s.melody.items.length) return no('missing', 'You have not written a melody yet. Say "write a melody: C D E F G".');
  const r1 = setInstrument(ctx, inst); if (r1?.status) return r1;
  startPlay(ctx, makeCurrent('melody', 'My melody', melodyAbc(s), { mine: true }));
  return ok(`Playing your melody of ${plural(melodyCount(s), 'note')} ${onInst(s)} at ${bpmText(s)}.`);
}
export function stop(ctx) {
  const s = ctx.state;
  const was = s.playing;
  ctx.effect('music.stop', {});
  s.playing = false;
  if (!was) return ok('Nothing is playing right now.');
  return ok(s.loop ? 'Stopped. The loop is still on; say "stop looping" to turn it off.' : 'Stopped.');
}
export function loop(ctx, { on }) {
  const s = ctx.state;
  if (on === 'false') {
    const was = s.loop; s.loop = false;
    if (s.playing) { ctx.effect('music.loop', { loop: false }); return ok('OK, I will play it to the end and then stop.'); }
    return ok(was ? 'OK, looping is off.' : 'Looping was already off.');
  }
  s.loop = true;
  if (!s.current) return ok('OK, looping is on. It will repeat the next thing you play.');
  startPlay(ctx, s.current);
  return ok(`Looping ${s.current.kind === 'song' ? '"' + s.current.title + '"' : s.current.title} ${onInst(s)}. Say "stop" when you have heard enough.`);
}

// ---- tempo, volume, instrument ------------------------------------------------------------------
const SMALL = new Set(['a_bit', 'a_little', 'a_tad', 'just_a_bit', 'just_a_little', 'bit', 'little', 'slightly', 'somewhat', 'a_notch', 'a_touch', 'a_smidge', 'a_hair', 'a_tiny_bit', 'a_wee_bit', 'a_bit_more', 'a_little_more']);
const BIG = new Set(['a_lot', 'lot', 'much', 'way', 'much_more', 'way_more', 'a_lot_more', 'loads', 'heaps', 'tons', 'significantly', 'considerably', 'hugely', 'massively']);
const degree = (d) => (SMALL.has(d) ? 'small' : BIG.has(d) ? 'big' : 'normal');
function again(ctx, replayFlag) {
  const s = ctx.state;
  if (s.current && (replayFlag === 'true' || s.playing)) { startPlay(ctx, s.current); return true; }
  return false;
}
function _tempo(ctx, { dir, deg, bpm, f, replay: rp }) {
  const s = ctx.state;
  const before = s.tempo;
  if (dir === 'reset') {
    const song = s.current?.songId ? ordered(ctx).find((x) => x.id === s.current.songId) : null;
    s.tempoLocked = false; s.tempo = song?.tempo ?? 100;
    return ok(`OK, the tempo is back to ${bpmText(s)}.`);
  }
  if (bpm !== undefined) { const r = setBpm(ctx, bpm); if (r?.status) return r; }
  else if (f !== undefined) {
    const k = Number(f);
    if (!(k >= 0.25 && k <= 4)) return no('unsupported', 'I can play from a quarter of the speed to four times the speed.');
    s.tempo = clamp(Math.round(s.tempo * k), 30, 240); s.tempoLocked = true;
  } else {
    const d = degree(deg);
    const slower = dir === 'slower';
    const k = d === 'small' ? 0.9 : d === 'big' ? 0.6 : 0.8;
    s.tempo = clamp(Math.round(slower ? s.tempo * k : s.tempo / k), 30, 240); s.tempoLocked = true;
    if (s.tempo === before) return ok(`I am already at ${s.tempo === 30 ? 'the slowest' : 'the fastest'} tempo, ${bpmText(s)}.`);
  }
  const played = again(ctx, rp);
  return ok(`${played ? 'Playing again at' : 'OK, the tempo is now'} ${bpmText(s)}${before !== s.tempo ? ` (it was ${before})` : ''}.`);
}
function _volume(ctx, { dir, deg, v }) {
  const s = ctx.state;
  if (v !== undefined) {
    const n = Number(v);
    if (!Number.isFinite(n)) return no('unsupported', 'I need a number from 0 to 100 for the volume.');
    s.volume = clamp(Math.round(n), 0, 100);
  } else {
    const d = degree(deg);
    const step = d === 'small' ? 5 : d === 'big' ? 25 : 10;
    const next = clamp(s.volume + (dir === 'louder' ? step : -step), 0, 100);
    if (next === s.volume) return ok(`The volume is already ${s.volume === 100 ? 'at the maximum' : 'at the minimum'}, ${s.volume} percent.`);
    s.volume = next;
  }
  return ok(`OK, the volume is ${s.volume} percent.`);
}
function _instrument(ctx, { inst }) {
  const s = ctx.state;
  const r = setInstrument(ctx, inst); if (r?.status) return r;
  const played = s.playing && s.current ? (startPlay(ctx, s.current), true) : false;
  return ok(`OK, ${played ? 'now playing' : 'I will play'} ${onInst(s)}.`);
}

// ---- octave, transposition, key -----------------------------------------------------------------
function applyShift(ctx, semis, label, targetKey) {
  const s = ctx.state;
  const cur = s.current;
  if (!cur) return no('missing', 'There is nothing to transpose yet. Play something first, for example "play Ode to Joy".');
  const abc = transposeAbc(cur.abc, semis, targetKey);
  const next = makeCurrent(cur.kind, cur.title, abc, { songId: cur.songId, mine: cur.mine });
  if (cur.mine) s.melody = { items: itemsFromAbc(abc), abc };
  if (cur.kind === 'song' || cur.mine) s.key = next.key;
  startPlay(ctx, next);
  return ok(`${label}. It is now in ${next.key}. Playing it ${onInst(s)}.`);
}
export function octave(ctx, { n, dir, deg, hl }) {
  const up = UP.has(dir);
  let semis;
  if (hl === 'true') semis = degree(deg) === 'small' ? 2 : degree(deg) === 'big' ? 24 : 12;
  else semis = 12 * (n === undefined ? 1 : Math.max(1, Math.min(4, Math.round(Number(n)))));
  const oct = semis / 12;
  const word = Number.isInteger(oct) ? `${oct === 1 ? 'an octave' : oct + ' octaves'}` : `${semis / 2} steps`;
  return applyShift(ctx, up ? semis : -semis, `Moved ${up ? 'up' : 'down'} ${word}`);
}
export function transpose(ctx, { dir, n, unit }) {
  const iv = INTERVALS[unit];
  if (!iv) return no('unsupported', `I do not know the interval "${String(unit).replace(/_/g, ' ')}".`);
  const k = n === undefined ? 1 : Number(n);
  const semis = Math.round(iv[1] * k);
  if (!semis || Math.abs(semis) > 36) return no('unsupported', 'I can transpose by 1 to 36 semitones.');
  const up = UP.has(dir);
  const label = `Transposed ${up ? 'up' : 'down'} ${n !== undefined && Number(n) !== 1 ? n + ' ' : ''}${String(unit).replace(/_/g, ' ')}${n !== undefined && Number(n) !== 1 && !/s$/.test(unit) ? 's' : ''} (${plural(Math.abs(semis), 'semitone')})`;
  return applyShift(ctx, up ? semis : -semis, label);
}
export function transposeTo(ctx, { root, m }) {
  const s = ctx.state;
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which key? For example "transpose it to D major".');
  if (!s.current) return no('missing', 'There is nothing to transpose yet. Play something first, for example "play Ode to Joy".');
  const from = parseKeyField(s.current.key);
  const to = parseKeyField(`${pc}${(m ?? from.mode) === 'minor' ? 'm' : ''}`);
  const semis = shiftBetween(from, to);
  if (semis === 0) return ok(`It is already in ${to.name}.`);
  return applyShift(ctx, semis, `Transposed from ${from.name} to ${to.name}`, to);
}
export function key(ctx, { root, m }) {
  const s = ctx.state;
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which key? For example "set the key to D major".');
  const mode = m ?? 'major';
  const info = keyInfo(pc, mode);
  if (!info) return no('unsupported', `I do not know the key of ${pc} ${mode}.`);
  if (s.current && (s.current.kind === 'song' || s.current.mine)) return transposeTo(ctx, { root, m: mode });
  s.key = info.name;
  show(ctx);
  return ok(`OK, the key is ${info.name}: ${list(info.scale)}. ${sigText(info)}`);
}

// ---- composing ------------------------------------------------------------------------------------
const count = (items) => items.filter((i) => i.p.length).length;
const melodyCount = (s) => count(s.melody.items);
function melodyAbc(s) { return s.melody.abc || itemsToAbc(s.melody.items, { title: 'My melody', key: 'C major', tempo: s.tempo }); }
function storeMelody(ctx, items) {
  const s = ctx.state;
  s.lastChangeWasSetting = false;
  const abc = itemsToAbc(items, { title: 'My melody', key: 'C major', tempo: s.tempo });
  s.melody = { items, abc };
  display(ctx, makeCurrent('melody', 'My melody', abc, { mine: true }));
}
const readError = (p, text) => no('unsupported', p.bad.length ? `I could not read "${p.bad[0]}" as a note. Use the letters A to G, with sharp or flat, for example "C D E F sharp G".` : `I did not find any notes in "${String(text).trim()}".`);
const noteWords = (items) => items.map((i) => (i.p.length ? Note.get(i.p[0]).pc : 'rest')).join(' ');
export function melodySet(ctx, { notes }) {
  const p = parseSeq(notes);
  if (p.bad.length || !p.items.length) return readError(p, notes);
  if (p.items.length > 64) return no('unsupported', 'A melody can have up to 64 notes.');
  storeMelody(ctx, p.items);
  return ok(`Your melody has ${plural(count(p.items), 'note')}: ${noteWords(p.items)}. Say "play my melody" to hear it, or "add" more notes.`);
}
export function melodyAdd(ctx, { notes }) {
  const s = ctx.state;
  const p = parseSeq(notes);
  if (p.bad.length || !p.items.length) return readError(p, notes);
  const items = [...s.melody.items, ...p.items];
  if (items.length > 64) return no('unsupported', 'A melody can have up to 64 notes.');
  storeMelody(ctx, items);
  return ok(`Added ${noteWords(p.items)}. Your melody now has ${plural(count(items), 'note')}: ${noteWords(items)}.`);
}
export function melodyClear(ctx) {
  const s = ctx.state;
  s.melody = { items: [], abc: '' };
  if (s.current?.mine) { stopIfPlaying(ctx); s.current = null; s.score = ''; s.highlight = []; }
  show(ctx);
  return ok('OK, your melody is empty. Say "write a melody: C D E F G" to start a new one.');
}
export function melodyUndo(ctx) {
  const s = ctx.state;
  if (s.lastChangeWasSetting && s.settingHistory?.length) {
    const prev = s.settingHistory.pop();
    Object.assign(s, prev);
    if (!s.settingHistory.length) s.lastChangeWasSetting = false;
    return ok(`OK, I undid that: the tempo is ${s.tempo} beats per minute and I play ${onInst(s)}.`);
  }
  if (!s.melody.items.length) return no('missing', 'Your melody is empty.');
  const items = s.melody.items.slice(0, -1);
  const gone = s.melody.items.at(-1);
  if (!items.length) { melodyClear(ctx); return ok(`Removed ${gone.p.length ? Note.get(gone.p[0]).pc : 'the rest'}. Your melody is empty now.`); }
  storeMelody(ctx, items);
  return ok(`Removed ${gone.p.length ? Note.get(gone.p[0]).pc : 'the rest'}. Your melody is now: ${noteWords(items)}.`);
}
export function melodyShow(ctx, { count }) {
  const s = ctx.state;
  if (!s.melody.items.length) return no('missing', 'You have not written a melody yet. Say "write a melody: C D E F G".');
  const n = melodyCount(s);
  if (count !== 'true') display(ctx, makeCurrent('melody', 'My melody', melodyAbc(s), { mine: true }));
  else show(ctx);
  return ok(count === 'true' ? `Your melody has ${plural(n, 'note')}.` : `Your melody has ${plural(n, 'note')}: ${noteWords(s.melody.items)}.`);
}

// ---- showing -------------------------------------------------------------------------------------
export function showNotes(ctx) {
  const s = ctx.state;
  const cur = s.current;
  if (!cur) return no('missing', 'I have not played anything yet. Try "play a C major chord".');
  s.highlight = [...cur.notes];
  show(ctx);
  if (cur.kind === 'note') { const f = tFreq(cur.seq[0]); return ok(`That is ${spoken(cur.seq[0])}, ${Math.round(f * 10) / 10} Hz.`); }
  const pcs = []; for (const n of cur.seq) { const pc = Note.get(n).pc; if (!pcs.includes(pc)) pcs.push(pc); }
  return ok(`${cur.kind === 'song' ? `"${cur.title}" uses` : `${cur.title} has`} ${plural(pcs.length, 'different note')}: ${pcs.join(' ')}. They are lit on the keyboard.`);
}
export function showScore(ctx) {
  const s = ctx.state;
  if (!s.current) return no('missing', 'There is no music to show yet. Try "play Twinkle Twinkle".');
  show(ctx);
  return ok(`Here is the sheet music of ${s.current.kind === 'song' ? '"' + s.current.title + '"' : s.current.title}, in ${s.current.key}.`);
}
export function listSongs(ctx) {
  show(ctx);
  const all = ordered(ctx);
  return ok(`I know ${all.length} songs: ${joinAnd(all.map((x) => x.title))}. Say "play" and the name, for example "play ${all[2]?.title.split(',')[0] ?? 'Ode to Joy'}".`);
}
export function listInstruments(ctx) {
  return ok(`I can play ${joinAnd(INSTRUMENTS)}. I am using ${withThe(ctx.state.instrument)} now. Say "change the instrument to flute".`);
}
export function listTypes(ctx, { what }) {
  if (what === 'chord') return ok(`I know these chord types: ${joinAnd([...new Set(Object.values(CHORD_TYPES).map((x) => x[1]))])}. For example "play an A minor seventh chord".`);
  if (what === 'scale') return ok(`I know these scales: ${joinAnd([...new Set(Object.values(SCALE_TYPES).map((x) => x[1]))])}. For example "play the D dorian scale".`);
  if (what === 'interval') return ok(`I know these intervals: ${joinAnd(['semitone', 'whole step', 'minor third', 'major third', 'fourth', 'tritone', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave'])}.`);
  return ok('The major and minor keys, from C major to F sharp major. Ask "what chords are in the key of D major?".');
}

// ---- theory questions -----------------------------------------------------------------------------
const sigText = (info) => (info.count === 0 ? 'It has no sharps or flats.' : `It has ${plural(info.count, info.kind)}: ${info.accidentals.join(' ')}.`);
export function scaleNotesOp(ctx, { root, st: st1, st2 }) {
  const st = st2 ?? st1;
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which scale? For example "what notes are in C major?".');
  const type = st ?? 'major';
  if (!SCALE_TYPES[type]) return no('unsupported', `I do not know the ${String(type).replace(/_/g, ' ')} scale.`);
  const sc = tScale(pc, type, 4);
  if (!sc) return no('unsupported', 'I cannot spell that scale.');
  const pcs = sc.notes.slice(0, -1).map((n) => Note.get(n).pc);
  const b = buildScale(ctx, { root, st: type });
  if (b.status) return b;
  display(ctx, makeCurrent('scale', b.title, b.abc));
  const info = MODE_OF_SCALE[type] === 'major' || MODE_OF_SCALE[type] === 'minor' ? keyInfo(pc, MODE_OF_SCALE[type]) : null;
  return ok(`The ${sc.name} scale has ${plural(pcs.length, 'note')}: ${pcs.join(' ')}.${info ? ' ' + sigText(info) : ''}`);
}
export function chordNotesOp(ctx, { root, q, n, sym }) {
  const pc = pcFromLex(sym !== undefined ? sym[0] : root);
  const key = sym !== undefined ? qualityKey('minor', n) : qualityKey(q, n);
  if (!pc) return no('unsupported', 'Which chord? For example "what notes are in a C minor chord?".');
  if (!CHORD_TYPES[key]) return no('unsupported', `I do not know the chord quality "${String(key).replace(/_/g, ' ')}".`);
  const c = tChord(pc, key, 4);
  if (!c) return no('unsupported', 'I cannot spell that chord.');
  display(ctx, makeCurrent('chord', c.name, itemsToAbc([{ p: c.notes, beats: 2 }], { title: c.name, key: 'C major', tempo: ctx.state.tempo })));
  return ok(`The ${c.name} chord has the notes ${list(c.notes)}.`);
}
export function chordName(ctx, { notes }) {
  const p = parseSeq(notes);
  const names = p.items.filter((i) => i.p.length).map((i) => i.p[0]);
  if (p.bad.length || names.length < 2) return no('unsupported', names.length < 2 && !p.bad.length ? 'Give me at least two notes, for example "what chord is C E G?".' : `I could not read "${p.bad[0]}" as a note.`);
  const stacked = stackUp(names);
  display(ctx, makeCurrent('chord', list(stacked), itemsToAbc([{ p: stacked, beats: 2 }], { title: list(stacked), key: 'C major', tempo: ctx.state.tempo })));
  const pcs = [...new Set(names.map((n) => Note.get(n).pc))];
  const det = detectChord(pcs);
  if (!det) {
    if (pcs.length === 2) { const iv = between(pcs[0], pcs[1]); if (iv) return ok(`${pcs.join(' and ')} is not a chord, but two notes make an interval: from ${pcs[0]} to ${pcs[1]} is a ${iv.name}.`); }
    return no('missing', `I do not recognise ${pcs.join(' ')} as a chord. Try another combination.`);
  }
  return ok(`${pcs.join(' ')} is ${an(det.name)} ${det.name} chord.${det.others.length ? ` It can also be called ${joinAnd(det.others)}.` : ''}`.replace(' chord chord', ' chord'));
}
export function keySig(ctx, { acc, root, m }) {
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which key? For example "how many sharps does D major have?".');
  const info = keyInfo(pc, m ?? 'major');
  if (!info) return no('unsupported', `I do not know the key of ${pc} ${m ?? 'major'}.`);
  const b = buildScale(ctx, { root, st: m ?? 'major' });
  if (!b.status) display(ctx, makeCurrent('scale', b.title, b.abc));
  const asked = acc === 'sharp' || acc === 'flat' ? acc : null;
  if (info.count === 0) return ok(`${info.name} has no sharps or flats.`);
  if (asked && asked !== info.kind) return ok(`${info.name} has no ${asked}s; it has ${plural(info.count, info.kind)}: ${info.accidentals.join(' ')}.`);
  return ok(`${info.name} has ${plural(info.count, info.kind)}: ${info.accidentals.join(' ')}.`);
}
export function keyWith(ctx, { m, n, acc }) {
  const count = Number(n);
  const kind = acc === 'flat' ? 'flat' : 'sharp';
  const mode = m ?? 'major';
  const k = keysWith(count, kind, mode);
  if (!k || count > 7) return no('unsupported', 'Keys have between 0 and 7 sharps or flats.');
  const other = relativeOf(k.tonic, k.mode);
  return ok(`The ${mode} key with ${plural(count, kind)} is ${k.tonic} ${mode}${m === undefined && other ? ` (its relative minor is ${other.tonic} minor)` : ''}.`);
}
export function interval(ctx, { a, b, oa, ob, want }) {
  const x = pcFromLex(a), y = pcFromLex(b);
  if (!x || !y) return no('unsupported', 'Which notes? For example "what is the interval between C and G?".');
  const na = oa !== undefined ? `${x}${oa}` : x, nb = ob !== undefined ? `${y}${ob}` : y;
  const iv = between(na, nb);
  if (!iv) return no('unsupported', 'I cannot work out that interval.');
  const lo = `${x}4`, hi = Note.transpose(lo, iv.interval);
  display(ctx, makeCurrent('chord', `${x} and ${y}`, itemsToAbc([{ p: [lo], beats: 2 }, { p: [hi], beats: 2 }], { title: `${x} to ${y}`, key: 'C major', tempo: ctx.state.tempo })));
  if (want === 'semitones') return ok(`${spoken(na)} to ${spoken(nb)} is ${plural(iv.semitones, 'semitone')}, a ${iv.name}.`);
  return ok(`From ${spoken(na)} up to ${spoken(nb)} is ${/^[aeiou]/.test(iv.name) ? 'an' : 'a'} ${iv.name} (${plural(iv.semitones, 'semitone')}).`);
}
export function above(ctx, { iv, dir, note }) {
  const pc = pcFromLex(note);
  const def = INTERVALS[iv];
  if (!pc || !def) return no('unsupported', 'Which note and interval? For example "what note is a fifth above D?".');
  const up = UP.has(dir);
  const res = Note.transpose(pc, (up ? '' : '-') + def[0]);
  const name = intervalName(def[0]);
  const lo = up ? `${pc}4` : Note.transpose(`${pc}4`, '-' + def[0]);
  const hi = up ? Note.transpose(`${pc}4`, def[0]) : `${pc}4`;
  display(ctx, makeCurrent('chord', `${name} ${up ? 'above' : 'below'} ${pc}`, itemsToAbc([{ p: [lo], beats: 2 }, { p: [hi], beats: 2 }], { title: `${name} ${up ? 'above' : 'below'} ${pc}`, key: 'C major', tempo: ctx.state.tempo })));
  return ok(`${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} ${up ? 'above' : 'below'} ${spoken(pc)} is ${spoken(res)}.`);
}
export function relative(ctx, { kind, root, m }) {
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which key? For example "what is the relative minor of C major?".');
  const from = m ?? (kind === 'minor' ? 'major' : 'minor');
  if (from === kind) return ok(`${pc} ${from} is already ${kind}. Its relative ${kind === 'minor' ? 'major' : 'minor'} is ${relativeOf(pc, from).tonic} ${kind === 'minor' ? 'major' : 'minor'}.`);
  const r = relativeOf(pc, from);
  if (!r) return no('unsupported', `I do not know the key of ${pc} ${from}.`);
  return ok(`The relative ${kind} of ${pc} ${from} is ${r.tonic} ${r.mode}. They share the same notes and key signature.`);
}
export function keyChords(ctx, { root, m }) {
  const pc = pcFromLex(root);
  if (!pc) return no('unsupported', 'Which key? For example "what chords are in the key of C major?".');
  const info = keyInfo(pc, m ?? 'major');
  if (!info) return no('unsupported', `I do not know the key of ${pc} ${m ?? 'major'}.`);
  const b = buildScale(ctx, { root, st: m ?? 'major' });
  if (!b.status) display(ctx, makeCurrent('scale', b.title, b.abc));
  return ok(`In ${info.name} the chords are ${joinAnd(info.triads)}. The main three are ${info.triads[0]}, ${info.triads[3]} and ${info.triads[4]}.`);
}
export function frequencyOp(ctx, { note, reg, oct }) {
  const pc = pcFromLex(note);
  if (!pc) return no('unsupported', 'Which note? For example "what is the frequency of A 4?".');
  const o = oct !== undefined ? Number(oct) : 4 + (reg === 'high' || reg === 'higher' ? 1 : reg === 'low' || reg === 'lower' ? -1 : 0);
  const name = `${pc}${o}`;
  const f = tFreq(name);
  if (!f) return no('unsupported', 'I do not know that note.');
  return ok(`${pitchTitle(name) === 'middle C' ? 'Middle C (C4)' : name} is ${Math.round(f * 100) / 100} Hz. Its MIDI number is ${Note.midi(name)}.`);
}
export function enharmonicOp(ctx, { note }) {
  const pc = pcFromLex(note);
  if (!pc) return no('unsupported', 'Which note? For example "what is another name for C sharp?".');
  const ALT = { C: 'B sharp', F: 'E sharp', E: 'F flat', B: 'C flat' };
  const e = tEnh(pc);
  if (e && e !== pc) return ok(`${spoken(pc)} is also called ${spoken(e)}. They are the same key on the piano.`);
  if (ALT[pc]) return ok(`${pc} is also called ${ALT[pc]}, though that name is rare.`);
  return ok(`${pc} has no common second name.`);
}
export function status(ctx, { what }) {
  const s = ctx.state;
  switch (what) {
    case 'tempo': return ok(`The tempo is ${bpmText(s)}.`);
    case 'instrument': return ok(`I am playing ${withThe(s.instrument)}.`);
    case 'volume': return ok(`The volume is ${s.volume} percent.`);
    case 'key': return ok(`The key is ${s.key}.`);
    case 'loop': return ok(s.loop ? 'Yes, the loop is on.' : 'No, the loop is off.');
    case 'isplaying': return ok(s.playing ? `Yes, I am playing ${s.current?.title ?? 'something'}.` : 'No, nothing is playing right now.');
    case 'playing':
      if (s.playing && s.current) return ok(`I am playing ${s.current.kind === 'song' ? '"' + s.current.title + '"' : s.current.title} ${onInst(s)} at ${bpmText(s)}.`);
      if (s.current) return ok(`Nothing is playing now. The last thing was ${s.current.kind === 'song' ? '"' + s.current.title + '"' : s.current.title}.`);
      return no('missing', 'I have not played anything yet. Try "play Twinkle Twinkle".');
    default: return no('unsupported', 'I can tell the tempo, the instrument, the volume, the key and what is playing.');
  }
}
export function songInfo(ctx, { title, what }) {
  const f = findSong(ctx, title);
  let song = f.song;
  if (f.current) {
    const c = ctx.state.current;
    if (!c) return no('missing', 'I have not played anything yet. Ask about a song by name, for example "who wrote Ode to Joy?".');
    if (c.kind !== 'song') {
      if (what === 'key') return ok(`${c.title} is in ${c.key}.`);
      return no('missing', `${c.title} is not one of my songs, so I have no composer for it.`);
    }
    song = ordered(ctx).find((x) => x.id === c.songId);
    if (what === 'key') return ok(`"${song.title}" is now in ${c.key}${c.key === song.key ? `, in ${song.meter} time` : ` (it was written in ${song.key})`}.`);
    if (what === 'tempo') return ok(`"${song.title}" is playing at ${ctx.state.tempo} beats per minute${ctx.state.tempo === song.tempo ? '' : ` (usually ${song.tempo})`}.`);
  }
  if (!song) return no('missing', `I do not know a song called "${String(title).trim()}". Ask me "which songs do you know?".`);
  const beats = parseAbc(song.abc).beats;
  switch (what) {
    case 'composer': return ok(`"${song.title}": ${song.composer}.`);
    case 'key': return ok(`"${song.title}" is in ${song.key}, in ${song.meter} time.`);
    case 'tempo': return ok(`"${song.title}" is usually played at ${song.tempo} beats per minute.`);
    case 'length': return ok(`"${song.title}" lasts about ${Math.round((beats * 60) / song.tempo)} seconds at ${song.tempo} beats per minute.`);
    default: return ok(`"${song.title}" is ${song.blurb}. ${song.composer}. It is in ${song.key}, in ${song.meter} time, at ${song.tempo} beats per minute. Say "play ${song.title.split(',')[0]}" to hear it.`);
  }
}

// ---- observation ----------------------------------------------------------------------------------
export function onObservation(ctx, obs) {
  const s = ctx.state;
  if (obs.effect === 'music.play') {
    if (obs.ok === false) {
      s.playing = false;
      const blocked = /block|allow|gesture|suspend|context/i.test(String(obs.detail));
      return { reply: blocked ? 'Your browser keeps the sound locked until you click or press a key on the page. Do that once, then say it again.' : `I could not play the sound (${obs.detail || 'unknown error'}).` };
    }
    if (obs.data?.phase === 'ended') {
      s.playing = false;
      const rounds = Number(obs.data.rounds ?? 1);
      return rounds > 1 ? { reply: `Done: the loop played ${rounds} times.` } : null;
    }
    return null;
  }
  if (obs.effect === 'music.stop') { s.playing = false; return null; }
  return null;
}

export { scaleNotesOp as scaleNotes, chordNotesOp as chordNotes, frequencyOp as frequency, enharmonicOp as enharmonic };
export { LETTERS, keyField };

/** "Play" alone: ask what to play; the dialog layer keeps the question pending for the next utterance (spec 11). */
/** A bare "play" (RP3): on the Music tab it plays the last song again, or a random one when nothing played yet; elsewhere it asks what to play. */
export function askWhat(ctx) {
  let here = null;
  try { const w = ctx?.request?.('ui.whichTab'); here = w?.status === 'supported' ? String(w.value) : null; } catch { here = null; }
  if (ctx && here && /music/i.test(here)) return ctx.state.current ? replay(ctx, {}) : random(ctx, {});
  return { status: 'missing', note: 'What should I play? For example a note, a chord or a song.', pending: { key: 'what', type: 'music' } };
}
export const tempo = settingChange(_tempo);
export const volume = settingChange(_volume);
export const instrument = settingChange(_instrument);

// ---- undo of a setting ("make it faster, then undo") ---------------------------------------------------------
const SETTING_KEYS = ['tempo', 'tempoLocked', 'volume', 'instrument'];
/** Wraps tempo, volume and instrument: the settings before the change are kept, and "undo" takes them back while that was the last change. */
function settingChange(fn) {
  return (ctx, args) => {
    const s = ctx.state;
    const before = Object.fromEntries(SETTING_KEYS.map((k) => [k, s[k]]));
    const r = fn(ctx, args);
    if (r?.status === 'supported' && SETTING_KEYS.some((k) => s[k] !== before[k])) {
      (s.settingHistory ??= []).push(before);
      if (s.settingHistory.length > 20) s.settingHistory.shift();
      s.lastChangeWasSetting = true;
    }
    return r;
  };
}

/** Topic return (spec 11 section 7): what is going on in the music world. */
export function topicSummary(ctx) {
  const s = ctx.state, c = s.current;
  if (!c) return `Nothing has been played yet; the instrument is ${instName(s.instrument)}.`;
  return `${s.playing ? 'Now playing' : 'Last played'} ${c.title ?? c.kind} in ${c.key ?? s.key} on ${withThe(instName(s.instrument))}, at ${s.tempo} beats per minute.`;
}
