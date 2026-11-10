// A small ABC notation toolkit for media.music (single-voice subset: notes, accidentals, octave marks, lengths,
// rests, chords [CEG], bars, header fields). Browser-safe, imports only inside the world.
//
//   parseAbc(text)            -> { title, composer, meter, tempo, key, events, beats, notes }
//       events: [{ t, d, m: [midi], n: ['F#4'], rest, a, b }]  t, d in quarter-note beats; a..b = character span
//   transposeAbc(text, semis) -> ABC text with every pitch moved and respelled for the new key signature
//   buildAbc({ title, key, meter, tempo, items }) -> ABC text; items: [{ p: [{l,a,o}] | null, beats }]
//   parsePitchName('F#4')     -> { l: 'F', a: 1, o: 4 }
import { midiOf } from './theory.mjs';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';
const FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, F: -1 };
const MODE_OFFSET = { major: 0, ionian: 0, lydian: 1, mixolydian: -1, dorian: -2, minor: -3, aeolian: -3, phrygian: -4, locrian: -5 };
const MODE_WORD = { '': 'major', maj: 'major', major: 'major', ion: 'ionian', m: 'minor', min: 'minor', minor: 'minor', aeo: 'minor', mix: 'mixolydian', dor: 'dorian', phr: 'phrygian', lyd: 'lydian', loc: 'locrian' };
const ACC_VALUE = { '^': 1, '^^': 2, _: -1, __: -2, '=': 0 };
const ACC_SYMBOL = { 1: '^', 2: '^^', '-1': '_', '-2': '__', 0: '=' };

export const parsePitchName = (name) => {
  const m = String(name).match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)?$/);
  if (!m) return null;
  return { l: m[1].toUpperCase(), a: m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0, o: m[3] === undefined ? 4 : Number(m[3]) };
};
export const pitchName = (p) => `${p.l}${p.a > 0 ? '#'.repeat(p.a) : p.a < 0 ? 'b'.repeat(-p.a) : ''}${p.o}`;
export const pitchMidi = (p) => midiOf(p.l, p.a, p.o);

export function keySigAccidentals(sharps) {
  const m = {};
  if (sharps > 0) for (let i = 0; i < sharps; i++) m[SHARP_ORDER[i]] = 1;
  else for (let i = 0; i < -sharps; i++) m[FLAT_ORDER[i]] = -1;
  return m;
}

/** `D`, `Gm`, `F#min`, `Bb major`, `A dor` -> { tonic, mode, sharps, name }. */
export function parseKeyField(s) {
  const m = String(s ?? 'C').trim().match(/^([A-Ga-g])([#b]?)\s*([A-Za-z]*)/);
  if (!m) return { tonic: 'C', mode: 'major', sharps: 0, name: 'C major' };
  const letter = m[1].toUpperCase();
  const mode = MODE_WORD[m[3].toLowerCase()] ?? 'major';
  const alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const sharps = FIFTHS[letter] + 7 * alt + MODE_OFFSET[mode];
  const tonic = letter + m[2];
  return { tonic, mode, sharps, name: `${tonic} ${mode}` };
}
export const keyField = (k) => `${k.tonic}${k.mode === 'major' ? '' : k.mode === 'minor' ? 'm' : k.mode.slice(0, 3)}`;

const lengthOf = (txt) => {
  const m = txt.match(/^(\d+)?(\/+)?(\d+)?$/);
  if (!m) return 1;
  const [, n, slashes, d] = m;
  if (!slashes) return n ? Number(n) : 1;
  const den = d ? Number(d) : 2 ** slashes.length;
  return (n ? Number(n) : 1) / den;
};

/** Tokenize header and body; tokens carry character spans. */
function tokenize(text) {
  const tokens = [];
  const lines = text.split('\n');
  let pos = 0, inBody = false;
  for (const line of lines) {
    const start = pos;
    pos += line.length + 1;
    if (!inBody) {
      const f = line.match(/^([A-Za-z]):\s*(.*)$/);
      tokens.push({ type: 'field', s: start, e: start + line.length, f: f?.[1], v: f?.[2] ?? '' });
      if (f?.[1] === 'K') inBody = true;
      continue;
    }
    if (/^\s*%/.test(line) || /^[A-Za-z]:/.test(line)) { tokens.push({ type: 'other', s: start, e: start + line.length }); continue; }
    let i = 0;
    const push = (t) => tokens.push({ ...t, s: start + t.i0, e: start + i });
    while (i < line.length) {
      budget.tick('abc.push');
      const c = line[i];
      const i0 = i;
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '|' || c === ':' || (c === '[' && /[|\d]/.test(line[i + 1] ?? ''))) {
        i++;
        while (i < line.length && /[|\]:\d\[]/.test(line[i])) { budget.tick('abc.push2'); i++; }
        push({ type: 'bar', i0 });
        continue;
      }
      if (c === '[') { // chord
        i++;
        const notes = [];
        while (i < line.length && line[i] !== ']') {
          budget.tick('abc.push3');
          const n = line.slice(i).match(/^(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)/);
          if (!n) { i++; continue; }
          notes.push({ acc: n[1] ?? '', letter: n[2], marks: n[3], s: start + i, e: start + i + n[0].length - n[4].length });
          i += n[0].length;
        }
        i++;
        const len = line.slice(i).match(/^\d*\/*\d*/)[0];
        i += len.length;
        push({ type: 'chord', i0, notes, len });
        continue;
      }
      const n = line.slice(i).match(/^(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)/);
      if (n) { i += n[0].length; push({ type: 'note', i0, acc: n[1] ?? '', letter: n[2], marks: n[3], len: n[4] }); continue; }
      const r = line.slice(i).match(/^[zxZ](\d*\/*\d*)/);
      if (r) { i += r[0].length; push({ type: 'rest', i0, len: r[1] }); continue; }
      i++;
      push({ type: 'other', i0 });
    }
    tokens.push({ type: 'newline', s: start + line.length, e: start + line.length });
  }
  return tokens;
}

const abcOctave = (letter, marks) => {
  let o = letter === letter.toUpperCase() ? 4 : 5;
  for (const ch of marks) o += ch === "'" ? 1 : -1;
  return o;
};

function headerInfo(tokens) {
  const h = {};
  for (const t of tokens) if (t.type === 'field' && t.f && !(t.f in h)) h[t.f] = t.v;
  const key = parseKeyField(h.K);
  const meter = (h.M ?? '4/4').trim();
  const [mn, md] = meter === 'C' ? [4, 4] : meter === 'C|' ? [2, 2] : meter.split('/').map(Number);
  let unit = 1 / 8;
  if (h.L) { const [a, b] = h.L.split('/').map(Number); if (a && b) unit = a / b; } else if (mn / md >= 0.75) unit = 1 / 8; else unit = 1 / 16;
  let tempo = null;
  if (h.Q) { const q = h.Q.match(/^\s*(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/); if (q) tempo = Math.round(Number(q[3]) * (q[1] ? (4 * Number(q[1])) / Number(q[2]) : 1)); }
  return { title: h.T ?? '', composer: h.C ?? '', meter, barBeats: (mn / md) * 4, unitBeats: unit * 4, tempo, key };
}

export function parseAbc(text) {
  const tokens = tokenize(text);
  const hd = headerInfo(tokens);
  const keyAcc = keySigAccidentals(hd.key.sharps);
  let bar = {};
  let t = 0;
  const events = [];
  const pitch = (acc, letter, marks) => {
    const L = letter.toUpperCase(), o = abcOctave(letter, marks);
    const k = L + o;
    if (acc) bar[k] = ACC_VALUE[acc];
    const a = bar[k] ?? keyAcc[L] ?? 0;
    return { l: L, a, o };
  };
  for (const tk of tokens) {
    if (tk.type === 'bar') { bar = {}; continue; }
    if (tk.type === 'note') {
      const p = pitch(tk.acc, tk.letter, tk.marks);
      const d = lengthOf(tk.len) * hd.unitBeats;
      events.push({ t, d, m: [pitchMidi(p)], n: [pitchName(p)], rest: false, a: tk.s, b: tk.e });
      t += d;
    } else if (tk.type === 'chord') {
      const ps = tk.notes.map((n) => pitch(n.acc, n.letter, n.marks));
      const d = lengthOf(tk.len) * hd.unitBeats;
      events.push({ t, d, m: ps.map(pitchMidi), n: ps.map(pitchName), rest: false, a: tk.s, b: tk.e });
      t += d;
    } else if (tk.type === 'rest') {
      const d = lengthOf(tk.len) * hd.unitBeats;
      events.push({ t, d, m: [], n: [], rest: true, a: tk.s, b: tk.e });
      t += d;
    }
  }
  const notes = [];
  for (const e of events) for (const n of e.n) if (!notes.includes(n)) notes.push(n);
  notes.sort((x, y) => pitchMidi(parsePitchName(x)) - pitchMidi(parsePitchName(y)));
  return { title: hd.title, composer: hd.composer, meter: hd.meter, tempo: hd.tempo, key: hd.key, events, beats: t, notes };
}

// ---- spelling and writing ---------------------------------------------------------------------
const SHARP_NAMES = { 1: ['C', 1], 3: ['D', 1], 6: ['F', 1], 8: ['G', 1], 10: ['A', 1] };
const FLAT_NAMES = { 1: ['D', -1], 3: ['E', -1], 6: ['G', -1], 8: ['A', -1], 10: ['B', -1] };
const NATURAL = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

/** Spell a midi number for a key (sharps count): scale tones as the key spells them, others by sharps/flats. */
export function spellMidi(midi, sharps) {
  const pc = ((midi % 12) + 12) % 12;
  const keyAcc = keySigAccidentals(sharps);
  let found = null;
  for (const L of Object.keys(STEP)) if ((STEP[L] + (keyAcc[L] ?? 0) + 12) % 12 === pc) found = [L, keyAcc[L] ?? 0];
  if (!found) found = NATURAL[pc] ? [NATURAL[pc], 0] : (sharps >= 0 ? SHARP_NAMES : FLAT_NAMES)[pc];
  const [l, a] = found;
  return { l, a, o: Math.floor((midi - a) / 12) - 1 };
}

function writePitch(p, keyAcc, bar) {
  const k = p.l + p.o;
  const effective = bar[k] ?? keyAcc[p.l] ?? 0;
  let s = '';
  if (p.a !== effective) { s = ACC_SYMBOL[p.a]; bar[k] = p.a; }
  let letter = p.l;
  if (p.o >= 5) letter = p.l.toLowerCase();
  const marks = p.o >= 6 ? "'".repeat(p.o - 5) : p.o <= 3 ? ','.repeat(4 - p.o) : '';
  return s + letter + marks;
}

/** Respell the note tokens of `text` shifted by `semis`; `toKey` overrides the key field (default: the shifted tonic). */
export function transposeAbc(text, semis, toKey) {
  const tokens = tokenize(text);
  const hd = headerInfo(tokens);
  const oldAcc = keySigAccidentals(hd.key.sharps);
  const tonicPc = (STEP[hd.key.tonic[0]] + (hd.key.tonic[1] === '#' ? 1 : hd.key.tonic[1] === 'b' ? -1 : 0) + 120) % 12;
  const newPc = (tonicPc + semis + 120) % 12;
  const MAJ = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const newKey = toKey ?? parseKeyField((hd.key.mode === 'minor' ? MIN : MAJ)[newPc] + (hd.key.mode === 'major' || hd.key.mode === 'minor' ? '' : ' ' + hd.key.mode));
  const newAcc = keySigAccidentals(newKey.sharps);
  let barOld = {}, barNew = {};
  let out = '', cursor = 0;
  const replace = (s, e, str) => { out += text.slice(cursor, s) + str; cursor = e; };
  const shiftOne = (acc, letter, marks) => {
    const L = letter.toUpperCase(), o = abcOctave(letter, marks), k = L + o;
    if (acc) barOld[k] = ACC_VALUE[acc];
    const a = barOld[k] ?? oldAcc[L] ?? 0;
    return writePitch(spellMidi(midiOf(L, a, o) + semis, newKey.sharps), newAcc, barNew);
  };
  for (const tk of tokens) {
    if (tk.type === 'bar') { barOld = {}; barNew = {}; }
    else if (tk.type === 'field' && tk.f === 'K') replace(tk.s, tk.e, `K:${keyField(newKey)}`);
    else if (tk.type === 'note') replace(tk.s, tk.s + tk.acc.length + 1 + tk.marks.length, shiftOne(tk.acc, tk.letter, tk.marks));
    else if (tk.type === 'chord') for (const n of tk.notes) replace(n.s, n.e, shiftOne(n.acc, n.letter, n.marks));
  }
  return out + text.slice(cursor);
}

const lenToken = (beats, unitBeats) => {
  let n = Math.round((beats / unitBeats) * 64), d = 64;
  const g = (a, b) => { while (b) { budget.tick('abc.gcd'); [a, b] = [b, a % b]; } return a; };
  const k = g(n, d); n /= k; d /= k;
  return d === 1 ? (n === 1 ? '' : String(n)) : n === 1 ? `/${d}` : `${n}/${d}`;
};

/** Build ABC from items [{ p: [{l,a,o}] | null, beats }]. Unit length is a quarter note. */
export function buildAbc({ title = 'Untitled', composer, key = 'C major', meter = '4/4', tempo = 100, items, source }) {
  const k = typeof key === 'string' ? parseKeyField(key.replace(/ major$/, '').replace(/ minor$/, 'm')) : key;
  const keyAcc = keySigAccidentals(k.sharps);
  const [mn, md] = meter.split('/').map(Number);
  const barBeats = (mn / md) * 4;
  let bar = {}, acc = 0, bars = 0, body = '';
  for (const it of items) {
    const len = lenToken(it.beats, 1);
    if (!it.p || !it.p.length) body += 'z' + len;
    else if (it.p.length === 1) body += writePitch(it.p[0], keyAcc, bar) + len;
    else body += '[' + it.p.map((p) => writePitch(p, keyAcc, bar)).join('') + ']' + len;
    acc += it.beats;
    if (acc >= barBeats - 1e-9) { acc = 0; bars++; bar = {}; body += bars % 4 === 0 ? ' |\n' : ' | '; } else body += ' ';
  }
  body = body.trimEnd().replace(/\|$/, '').trimEnd() + ' |]';
  const head = ['X:1', `T:${title}`, composer ? `C:${composer}` : null, source ? `Z:${source}` : null, `M:${meter}`, 'L:1/4', `Q:1/4=${tempo}`, `K:${keyField(k)}`].filter(Boolean);
  return head.join('\n') + '\n' + body + '\n';
}

/** Shift of semitones from key `a` to key `b` (tonic pitch classes), choosing the nearest direction (-6..+5). */
export function shiftBetween(a, b) {
  const pc = (k) => (STEP[k.tonic[0]] + (k.tonic[1] === '#' ? 1 : k.tonic[1] === 'b' ? -1 : 0) + 120) % 12;
  let d = (pc(b) - pc(a) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}
