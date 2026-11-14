// SPDX-License-Identifier: AGPL-3.0-only
// media.music (spec 21): the hooks of the schema world. The acts (make, remove, change, pick, ask, undo, redo) are read by the generated grammar; what an act DOES to the player is music.mjs (the
// state, the synth events the tab plays, the sheet music, the melody). The roles are mapped onto those operations here; the notes themselves are the music's own text, read by reader.mjs
// (a note, a chord, a scale, a transposition). Nothing here names a verb.
import * as M from './music.mjs?v=6960887c40';
import * as R from './reader.mjs?v=87c76bdfe1';
import { knownSong } from './songs.mjs?v=7b859b75b4';

const no = (note, status = 'unsupported') => ({ status, note });
const ctxFind = (ctx) => (t) => M.findSong(ctx, t);
const PRONOUN = /^(?:it|that|this|them|those|these|one|this one|that one)$/i;
const FULL = /^(?:full|max|maximum|top|the max|the maximum|everything|all the way|100)$/i, MUTE = /^(?:mute|muted|off|silent|silence|nothing|zero|0)$/i;
const NORMAL = /^(?:normal|default|usual|original|regular|standard|the usual|the original|back to normal)$/i;
const FACTORS = { twice: 2, double: 2, triple: 3, thrice: 3, half: 0.5, 'two times': 2, 'three times': 3, 'four times': 4 };
const num = (v) => { const m = String(v ?? '').match(/-?\d+(?:\.\d+)?/); return m ? m[0] : undefined; };
const schemaOf = () => globalThis.__musicSchema;
const attrOfCmp = (v) => { const w = String(v ?? '').toLowerCase().replace(/\s+/g, '_'); return { faster: 'tempo', quicker: 'tempo', slower: 'tempo', louder: 'volume', quieter: 'volume', softer: 'volume', higher: 'pitch', lower: 'pitch', longer: 'duration', shorter: 'duration' }[w]; };
const dirOf = (v, mode) => (mode === 'less' ? 'less' : mode === 'more' ? 'more' : null) ?? null;
const deg = (r) => String(r.amount ?? r.amount2 ?? '').replace(/\s+/g, '_') || undefined;

/** A setting said about "it" ("play it slower", "a bit louder", "at half speed", "just once", "in G"). */
function setting(ctx, s) {
  switch (s.what) {
    case 'tempo': return M.tempo(ctx, s.args);
    case 'volume': return M.volume(ctx, { dir: s.args.dir === 'louder' ? 'louder' : 'quieter', deg: s.args.deg });
    case 'pitch': return M.octave(ctx, { hl: 'true', dir: s.args.dir, deg: s.args.deg });
    case 'loop': return M.loop(ctx, s.args);
    default: return M.transposeTo(ctx, s.args);
  }
}
/** Plays what a thing phrase says (a note, a chord, a scale, a song, notes, the melody, the current thing). */
function play(ctx, thing, text) {
  thing = R.unDet(thing, text);
  const kind = ctx.state?.current?.kind;
  if (/\s+ones?$/i.test(thing) && ['scale', 'chord'].includes(kind)) thing = thing.replace(/\s+ones?$/i, ` ${kind}`);   // "and the G major one?": one stands for the kind of what played last
  const st = R.readSetting(thing);
  if (st) return setting(ctx, st);
  const rd = R.readPlayable(thing, { findSong: ctxFind(ctx), parseSeq: M.parseSeq, hint: text });
  const a = rd.args;
  switch (rd.type) {
    case 'none': return M.askWhat(ctx);
    case 'current': return a.bpm ? M.tempo(ctx, { bpm: a.bpm, replay: 'true' }) : M.replay(ctx, { inst: a.inst });
    case 'melody': return M.playMelody(ctx, { inst: a.inst });
    case 'random': return M.random(ctx, { inst: a.inst });
    case 'instrument': return M.instrument(ctx, { inst: a.inst });
    case 'note': return M.playNote(ctx, a);
    case 'chord': return M.playChord(ctx, a);
    case 'scale': return M.playScale(ctx, a);
    case 'song': return M.playAny(ctx, { title: a.song.title, inst: a.inst, bpm: a.bpm });
    case 'seq': return M.playAny(ctx, { title: a.text, inst: a.inst, bpm: a.bpm });
    default: { const sh = R.readShift(thing); return sh && (sh.unit || sh.root) ? shift(ctx, thing) : M.playAny(ctx, { title: a.text, inst: a.inst, bpm: a.bpm }); }
  }
}
/** A transposition said in words: by octaves or an interval, or into a key. */
function shift(ctx, text) {
  const s = R.readShift(text);
  if (!s) return no('Which way: up or down, by an octave or an interval, or to a key? For example "transpose it up a fifth".');
  if (s.root) return M.transposeTo(ctx, { root: s.root, m: s.m });
  if (s.hl) return M.octave(ctx, { hl: 'true', dir: s.dir, deg: s.amount });
  if (s.unit === 'octave') return M.octave(ctx, { n: s.n === undefined ? undefined : String(s.n), dir: s.dir });
  return M.transpose(ctx, { dir: s.dir, n: s.n === undefined ? undefined : String(s.n), unit: s.unit });
}
function setKey(ctx, v, text) {
  const tk = R.words(R.unDet(String(v ?? ''), text).replace(/\bkey\b|\bof\b/gi, ' '));
  const n = R.noteAt(tk, 0);
  if (!n) return no('Which key? For example "set the key to D major".');
  const mode = tk[n.n] === 'minor' || tk[n.n] === 'min' ? 'minor' : 'major';
  return M.key(ctx, { root: n.entry, m: mode });
}

const domain = {
  pick: (ctx, r) => {
    if (r.mode === 'stop') return M.stop(ctx);
    if (r.mode === 'again') return M.replay(ctx, {});
    if (r.mode === 'none') return no('Nothing is selected in the music.');
    // a pick of a song without a title ("pick a song for me") is a random song
    const t = [r.thing, r.kind, r.value].filter(Boolean).join(' ').trim();
    if (!t) return M.askWhat(ctx);
    return play(ctx, t, r.text);
  },
  make: (ctx, r) => {
    const val = r.value == null ? '' : String(r.value);
    if (r.mode === 'blank') return M.melodyClear(ctx);
    if (r.mode === 'add') return M.melodyAdd(ctx, { notes: val });
    if (r.mode === 'compose') return val.trim() ? M.melodySet(ctx, { notes: val }) : M.melodyClear(ctx);
    // "make"/"put on"/"add" of a song, a chord, a scale or a note: it is produced, so it sounds
    return play(ctx, [r.thing, r.kind, val].filter(Boolean).join(' '), r.text);
  },
  remove: (ctx, r) => {
    const t = String(r.thing ?? '').toLowerCase();
    if (/\bnote\b|\blast\b|\bpause\b|\brest\b/.test(t) && !/\bnotes\b/.test(t)) return M.melodyUndo(ctx);
    if (r.mode === 'all' || /melody|tune|song|composition|notes|everything/.test(t) || !t) return M.melodyClear(ctx);
    return M.melodyUndo(ctx);
  },
  change: (ctx, r) => {
    const attr0 = r.attribute ? String(r.attribute).toLowerCase() : null;
    const value = r.value == null ? null : String(r.value).trim();
    const ATTRWORDS = { tempo: 'tempo', speed: 'tempo', bpm: 'tempo', volume: 'volume', loudness: 'volume', instrument: 'instrument', key: 'key', loop: 'loop', looping: 'loop', pitch: 'pitch', octave: 'pitch' };
    const inThing = !attr0 ? R.words(r.thing ?? '').map((w) => ATTRWORDS[w]).find(Boolean) : null;   // "can the volume be 40": the attribute is in the words of the thing
    const attr = attr0 ?? inThing ?? ((r.mode === 'more' || r.mode === 'less') ? attrOfCmp(value) : null)
      ?? (value && R.instrumentOf(value) ? 'instrument' : null) ?? (value && /^(?:full|max|maximum|mute|muted)$/i.test(value) ? 'volume' : null) ?? (value && FACTORS[value.toLowerCase()] ? 'tempo' : null) ?? (value && NORMAL.test(value) ? 'tempo' : null);
    const tooBy = (a, v) => (a === 'volume' ? (/^too (?:low|quiet|soft|quietly|silent)$/.test(v) ? 'more' : /^too (?:loud|high|noisy|much)$/.test(v) ? 'less' : null) : a === 'tempo' ? (/^too (?:slow|low|sluggish)$/.test(v) ? 'more' : /^too (?:fast|quick|high|rushed)$/.test(v) ? 'less' : null) : a === 'pitch' ? (/^too (?:low|deep)$/.test(v) ? 'more' : /^too (?:high|squeaky)$/.test(v) ? 'less' : null) : null);
    const name = { speed: 'tempo', bpm: 'tempo', pace: 'tempo', loudness: 'volume', sound: 'instrument', repeat: 'loop', repeating: 'loop', looping: 'loop', loops: 'loop', octave: 'pitch', length: 'duration', sound_level: 'volume' }[attr] ?? attr;
    if (r.mode === 'shift') return shift(ctx, r.text ?? value ?? '');
    const tooMode = !(r.mode === 'more' || r.mode === 'less') && value ? tooBy(name, value.toLowerCase()) : null;   // "the volume is too low" asks for more
    if (tooMode) r = { ...r, mode: tooMode };
    const cmp = r.mode === 'more' || r.mode === 'less';
    // "turn the music off" is a stop; "turn it up / down" and "crank it up" are the volume
    if (!name && !value) { const s = R.readSetting(r.thing); if (s) return setting(ctx, s); }
    if (!name && /^(?:off|stopped)$/i.test(value ?? '') && /music|song|sound|it|tune/i.test(String(r.thing ?? ''))) return M.stop(ctx);
    if (!name && /^(?:up|down)$/i.test(value ?? '')) return M.volume(ctx, { dir: /up/i.test(value) ? 'louder' : 'quieter', deg: deg(r) });
    if (name === 'pitch') { const s = R.readShift(r.text ?? ''); if (s && (s.unit || s.root)) return shift(ctx, r.text); }
    switch (name) {
      case 'tempo': {
        if (cmp) return M.tempo(ctx, { dir: r.mode === 'less' ? 'slower' : 'faster', deg: deg(r) });
        if (value && NORMAL.test(value)) return M.tempo(ctx, { dir: 'reset' });
        if (value && FACTORS[value.toLowerCase()]) return M.tempo(ctx, { f: String(FACTORS[value.toLowerCase()]) });
        return M.tempo(ctx, { bpm: num(value) });
      }
      case 'volume': {
        if (cmp) return M.volume(ctx, { dir: r.mode === 'less' ? 'quieter' : 'louder', deg: deg(r) });
        if (value && FULL.test(value)) return M.volume(ctx, { v: '100' });
        if (value && MUTE.test(value)) return M.volume(ctx, { v: '0' });
        return M.volume(ctx, { v: num(value) });
      }
      case 'instrument': {
        const i = R.instrumentOf(value);
        return i ? M.instrument(ctx, { inst: i }) : no(`I do not have an instrument called ${String(value ?? '').replace(/_/g, ' ')}. I can play ${R.INSTRUMENTS.join(', ')}.`);
      }
      case 'loop': return M.loop(ctx, { on: /^(?:off|false|no|stop)$/i.test(value ?? '') ? 'false' : 'true' });
      case 'key': return setKey(ctx, value, r.text);
      case 'pitch': return cmp ? M.octave(ctx, { hl: 'true', dir: r.mode === 'less' ? 'lower' : 'higher', deg: deg(r) }) : shift(ctx, value ?? '');
      case 'duration': return no('I can set the length of a note when I play it: for example "play A4 for 2 beats".');
      default: return no(`What should I change about the music? I can change the tempo, the volume, the instrument, the key, the loop or the pitch.`, 'missing');
    }
  },
  ask: (ctx, r) => {
    if (['why', 'last'].includes(r.mode)) return undefined;
    const t = String(r.thing ?? '').toLowerCase();
    const a = String(r.attribute ?? '').toLowerCase();
    if (r.mode === 'count') return M.melodyShow(ctx, { count: 'true' });
    const what = { tempo: 'tempo', speed: 'tempo', bpm: 'tempo', pace: 'tempo', volume: 'volume', loudness: 'volume', instrument: 'instrument', sound: 'instrument', loop: 'loop', repeat: 'loop', looping: 'loop', key: 'key' }[a];
    if (what) return M.status(ctx, { what });
    if (r.mode === 'options') return /instrument/.test(t) ? M.listInstruments(ctx) : /chord|scale/.test(t) ? M.listTypes(ctx, { what: /chord/.test(t) ? 'chord' : 'scale' }) : M.listSongs(ctx);
    if (r.mode === 'describe' || r.mode === 'state') return M.status(ctx, { what: 'playing' });
    return undefined;
  },
  undo: (ctx) => M.melodyUndo(ctx),
  redo: () => no('There is nothing to redo in the music.', 'missing'),
};

const MUSICAL_NOUN = /\b(?:music|song|songs|melody|melodies|tune|tunes|chord|chords|scale|scales|note|notes|tempo|volume|instrument|piano|organ|flute|violin|cello|loop|looping|octave|octaves|semitone|semitones|key|bpm|beats?)\b/i;
const MUSICAL = /\b(?:music|song|songs|melody|melodies|tune|tunes|chord|chords|scale|scales|note|notes|tempo|volume|instrument|piano|organ|flute|violin|cello|loop|looping|octave|octaves|semitone|semitones|key|bpm|faster|slower|louder|quieter|beats?)\b/i;

/** DECLINE (spec 21): a sentence is the music's when its tab is open, when it plays something that reads as music (a note, a chord, a scale, a song of the library, notes) or names a musical thing. */
function accepts(info) {
  const v = decline(info);
  // the open music tab holds the focus: a reading it owns does not yield to a pattern of another world that has no free words ("Play B3" is a note here and a move on the game's tab)
  return v === true && info.tab === 'media.music' && ['pick', 'make', 'change'].includes(String(info.action ?? '').split('.').pop()) ? 'focus' : v;
}
function decline({ action, mode, roles = {}, tab, text, state }) {
  const act = String(action ?? '').split('.').pop();
  if (!Object.hasOwn(domain, act)) return true;   // the operations that are not acts (theory questions, lists, status) are read by patterns that name the music's own frames
  const on = tab === 'media.music';
  if (['undo', 'redo'].includes(act)) return on;
  const said = [roles.thing, roles.value].filter(Boolean).join(' ').trim();
  const hasMelody = (state?.melody?.items?.length ?? 0) > 0;
  if (mode === 'compose') {
    const melodic = /^(?:melody|melodies|tune|tunes|composition|compositions|song|songs)$/i.test(String(roles.thing ?? '').trim().split(/\s+/).at(-1) ?? '');
    const p = M.parseSeq(String(roles.value ?? '')), clean = p.items.length > 0 && !p.bad.length;
    const verb = /^(?:please\s+|can you\s+|could you\s+|let's\s+|let us\s+)?(?:write|compose|create|make|start|enter|record|type|come up with|put down|jot down|make up|invent|new)\b/i.test(String(text ?? '').trim());
    return melodic && (verb && /\b(?:melody|melodies|tune|composition)\b/i.test(String(roles.thing ?? '')) || clean && (on || /\b(?:melody|tune|composition)\b/i.test(String(roles.thing ?? ''))));
  }
  if (mode === 'blank') return on || /\b(?:melody|tune|composition)\b/i.test(`${said} ${text ?? ''}`);
  if (mode === 'add') { const p = M.parseSeq(String(roles.value ?? '')); return p.items.length > 0 && !p.bad.length && (on || hasMelody || p.items.length > 1 || /\bnotes?\b/i.test(String(text ?? ''))); }
  if (['stop', 'again'].includes(mode)) return on || !!state?.current || !!state?.playing ? (on ? true : 'focus') : false;
  if (act === 'pick' || act === 'make') {
    if (!said) return on || mode === 'play';
    if (/\b(?:list|types?|kinds?)\b/i.test(said)) return false;
    if (/\s(?:and|then)\s+(?:draw|add|make|show|open|put|set|remove|delete|move|create|tell|what|how|play)\b/i.test(` ${said} `)) return false;   // a second command of another world is its own clause
    if (mode !== 'play' && /\btabs?\b/i.test(`${said} ${text ?? ''}`)) return false;   // "open the music tab" is the shell's
    if (/^(?:it|that|this|them)$/i.test(said)) return on ? true : (state?.current && mode === 'play' ? 'focus' : false);
    const rd = R.readPlayable(said, { findSong: (t) => (knownSong(t) ? { song: { title: t } } : {}), parseSeq: M.parseSeq });
    if (mode !== 'play' && !['song', 'chord', 'scale', 'note', 'melody', 'seq', 'current', 'random', 'instrument'].includes(rd.type) && !R.readSetting(said)) return false;   // a verb of selection ("open the music tab", "pick a table") is the music's only for a thing it can play
    const ok = !['unknown', 'none'].includes(rd.type) && rd.type !== 'seq';
    if (rd.type === 'seq') return on || rd.args.text.split(/\s+/).length > 1;
    if (rd.type === 'song' || rd.type === 'chord' || rd.type === 'scale') return true;
    if (rd.type === 'note') return 'focus';   // ("Play B3" is also a move of tic-tac-toe: the playNote operation hands it over when the music tab is not open; the routing decides)
    if (ok) return on || MUSICAL.test(String(text ?? ''));
    // an unknown title on the music tab is a song the library does not have ("play Yesterday"), unless it is a move of the board ("play the queen to d5": the pieces and squares are another world's words)
    if (on && !/\b(?:king|queen|rook|bishop|knight|pawn|castle)\b|\b[a-h][1-8]\b/i.test(said)) return true;
    return MUSICAL.test(String(roles.thing ?? ''));   // off the tab only the thing role counts: the value of "put a heading called Notes" is the document's words
  }
  if (act === 'change') {
    // a change is the player's when an attribute of the player is said, or a comparison / a transposition / an instrument / a number is the value; on the music tab nothing else ("play the queen to d5" is a move of the board)
    const attrWord = /\b(?:tempo|speed|bpm|pace|volume|loudness|instrument|sound|key|loop|looping|repeat|pitch|octave|duration|length)\b/i.test(`${roles.attribute ?? ''} ${roles.thing ?? ''}`);
    const v = String(roles.value ?? '').trim();
    const valueish = !!R.instrumentOf(v) || /^(?:up|down|off|on|full|max|maximum|mute|muted|normal|default|\d+(?:\.\d+)?\s*(?:bpm|percent|%)|too\s+\w+|half|double|twice|triple)$/i.test(v) || mode === 'more' || mode === 'less' || mode === 'shift' || !!R.readSetting(roles.thing ?? '');
    const thingOk = !/\b(?:speak|talk|talking|say|speech|voice|rate|queen|king|rook|bishop|knight|pawn)\b/i.test(`${roles.thing ?? ''} ${text ?? ''}`);   // words of other worlds' frames (the speech rate, the pieces of the board)
    if (on) return attrWord || (valueish && thingOk);
    return MUSICAL_NOUN.test(`${said} ${roles.attribute ?? ''}`) || attrWord || ((mode === 'more' || mode === 'less' || mode === 'shift') && !!state?.current && /\b(?:faster|slower|louder|quieter|softer|higher|lower)\b/i.test(String(text ?? '')));
  }
  if (act === 'remove') return on ? true : /\b(?:melody|tune|composition|last note)\b/i.test(said);
  if (act === 'ask') return ['count', 'options', 'describe', 'state'].includes(mode) || /^(?:tempo|speed|bpm|pace|volume|loudness|instrument|sound|loop|repeat|looping|key)$/i.test(String(roles.attribute ?? '')) ? (on || MUSICAL.test(`${said} ${roles.attribute ?? ''}`)) : false;
  return false;
}

if (globalThis.process?.env?.MU_DEBUG) for (const k of Object.keys(domain)) { const f = domain[k]; domain[k] = (ctx, r) => { console.error('DOMAIN', k, JSON.stringify({ ...r, request: undefined })); return f(ctx, r); }; }
const acceptsDebug = (info) => { const v = accepts(info); if (globalThis.process?.env?.MU_DEBUG) console.error('ACCEPTS', JSON.stringify({ action: info.action, mode: info.mode, tab: info.tab, roles: info.roles, v })); return v; };
export const hooks = { domain, accepts: acceptsDebug, noState: true };
