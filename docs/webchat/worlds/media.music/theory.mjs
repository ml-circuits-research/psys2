// Music theory helpers of media.music, built on the vendored `tonal` library (vendor/tonal.mjs, MIT).
// Browser-safe: relative imports only. Everything here is a pure function of its arguments, so C2 answers
// ("what chord is C E G?", "how many sharps does D major have?") are deterministic and testable in Node.
import { Note, Chord, Scale, Interval, Key } from './vendor/tonal.mjs?v=7e36dbfe54';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midiOf = (letter, alt, oct) => 12 * (oct + 1) + STEP[letter] + alt;

/** Pitch class (`C#`, `Bb`, `F`) from a lexicon entry (`c_sharp`, `b-flat`, `bb`, `c`), or null. */
export function pcFromLex(entry) {
  const m = String(entry ?? '').toLowerCase().match(/^([a-g])(?:[_-]?(sharp|flat)|(b))?$/);
  if (!m) return null;
  const acc = m[2] === 'sharp' ? '#' : m[2] === 'flat' || m[3] ? 'b' : '';
  return m[1].toUpperCase() + acc;
}
/** Words for speech and chat: `F#` -> "F sharp", `Bb4` -> "B flat 4". */
export function spoken(name) {
  const n = Note.get(name);
  if (n.empty) return String(name);
  return n.letter + (n.alt === 1 ? ' sharp' : n.alt === -1 ? ' flat' : n.alt === 2 ? ' double sharp' : n.alt === -2 ? ' double flat' : '') + (n.oct !== undefined ? ` ${n.oct}` : '');
}
/** Pitch-class names in a list: `C D E F# G A B` (ASCII, so a user can type them back). */
export const list = (names) => names.map((n) => Note.get(n).pc || n).join(' ');
export const noteWithOctave = (pc, oct) => `${pc}${oct}`;

// ---- scales ----------------------------------------------------------------------------------
/** Scale types by lexicon entry: tonal name and the English name used in answers. */
export const SCALE_TYPES = {
  major: ['major', 'major'], ionian: ['ionian', 'ionian'], minor: ['minor', 'natural minor'], natural_minor: ['minor', 'natural minor'], aeolian: ['aeolian', 'aeolian'],
  harmonic_minor: ['harmonic minor', 'harmonic minor'], melodic_minor: ['melodic minor', 'melodic minor'],
  dorian: ['dorian', 'dorian'], phrygian: ['phrygian', 'phrygian'], lydian: ['lydian', 'lydian'], mixolydian: ['mixolydian', 'mixolydian'], locrian: ['locrian', 'locrian'],
  pentatonic: ['major pentatonic', 'major pentatonic'], major_pentatonic: ['major pentatonic', 'major pentatonic'], minor_pentatonic: ['minor pentatonic', 'minor pentatonic'],
  blues: ['minor blues', 'blues'], blue: ['minor blues', 'blues'], chromatic: ['chromatic', 'chromatic'], whole_tone: ['whole tone', 'whole tone'],
};
// spoken aliases: abbreviations and word-order variants (E min pentatonic, pentatonic minor, harmonic) map to the same scale types
Object.assign(SCALE_TYPES, {
  min: SCALE_TYPES.minor, maj: SCALE_TYPES.major, pentatonic_minor: SCALE_TYPES.minor_pentatonic, pentatonic_major: SCALE_TYPES.major_pentatonic,
  min_pentatonic: SCALE_TYPES.minor_pentatonic, maj_pentatonic: SCALE_TYPES.major_pentatonic, harmonic: SCALE_TYPES.harmonic_minor, melodic: SCALE_TYPES.melodic_minor,
});
/** Notes of a scale with octaves, ascending from `root` in `oct` and ending on the octave. */
export function scaleNotes(root, type = 'major', oct = 4) {
  const [tonal] = SCALE_TYPES[type] ?? [type];
  const s = Scale.get(`${root}${oct} ${tonal}`);
  if (s.empty) return null;
  const ascending = s.notes.slice();
  const top = Note.transpose(`${root}${oct}`, '8P');
  if (ascending.at(-1) !== top && Note.midi(ascending.at(-1)) < Note.midi(top)) ascending.push(top);
  return { notes: ascending, name: `${root} ${SCALE_TYPES[type]?.[1] ?? tonal}`, type };
}

// ---- chords ----------------------------------------------------------------------------------
/** Chord qualities by lexicon entry: tonal alias, English name, symbol suffix. */
export const CHORD_TYPES = {
  major: ['M', 'major'], maj: ['M', 'major'], minor: ['m', 'minor'], min: ['m', 'minor'], diminished: ['dim', 'diminished'], dim: ['dim', 'diminished'],
  augmented: ['aug', 'augmented'], aug: ['aug', 'augmented'], dominant: ['7', 'dominant seventh'], seventh: ['7', 'dominant seventh'], dominant_seventh: ['7', 'dominant seventh'],
  major_seventh: ['maj7', 'major seventh'], minor_seventh: ['m7', 'minor seventh'], diminished_seventh: ['dim7', 'diminished seventh'], half_diminished: ['m7b5', 'half-diminished'],
  sus: ['sus4', 'suspended fourth'], suspended: ['sus4', 'suspended fourth'], sus2: ['sus2', 'suspended second'], sus4: ['sus4', 'suspended fourth'],
  sixth: ['6', 'sixth'], minor_sixth: ['m6', 'minor sixth'], ninth: ['9', 'dominant ninth'], power: ['5', 'power'],
};
/** Quality key from the quality word and a number (`major` + 7, `minor` + 7, `sus` + 2, none + 7 ...). */
export function qualityKey(q, n) {
  const num = n === undefined || n === '' || n === null ? null : Number(n);
  const w = q || '';
  if (num === 7) return !w ? 'seventh' : w === 'major' || w === 'maj' ? 'major_seventh' : w === 'minor' || w === 'min' ? 'minor_seventh' : w === 'diminished' || w === 'dim' ? 'diminished_seventh' : w;
  if (num === 9) return 'ninth';
  if (num === 6) return !w || w === 'major' ? 'sixth' : w === 'minor' || w === 'min' ? 'minor_sixth' : w;
  if (num === 5) return 'power';
  if ((w === 'sus' || w === 'suspended') && (num === 2 || num === 4)) return num === 2 ? 'sus2' : 'sus4';
  return w || 'major';
}
export function chordNotes(root, key = 'major', oct = 4) {
  const [alias, label] = CHORD_TYPES[key] ?? CHORD_TYPES.major;
  const c = Chord.getChord(alias, root);
  if (c.empty) return null;
  const notes = c.intervals.map((i) => Note.transpose(`${root}${oct}`, i));
  return { notes, name: `${root} ${label}`, symbol: c.symbol, label, root, key };
}
/** Best name for a set of notes (pitch classes or with octaves), or null. */
export function detectChord(names) {
  const pcs = names.map((n) => Note.get(n).pc).filter(Boolean);
  if (pcs.length < 2) return null;
  const found = Chord.detect(pcs).filter((s) => !s.includes('/') || s.split('/')[1] === s.replace(/^([A-G][#b]?).*$/, '$1') || true);
  if (!found.length) return null;
  const nice = (sym) => { const c = Chord.get(sym); return c.empty ? sym : c.name; };
  const slashless = found.filter((s) => !s.includes('/'));
  const best = (slashless[0] ?? found[0]);
  const others = slashless.filter((s) => s !== best).slice(0, 2).map(nice);
  return { name: nice(best), symbol: best, others, pcs };
}

// ---- intervals -------------------------------------------------------------------------------
const Q = { P: 'perfect', M: 'major', m: 'minor', A: 'augmented', d: 'diminished' };
const ORD = ['', 'unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth'];
export function intervalName(iv) {
  const i = Interval.get(iv);
  if (i.empty) return String(iv);
  if (i.semitones === 6 && (i.num === 4 || i.num === 5)) return 'tritone';
  const n = ORD[i.num] ?? `${i.num}th`;
  if (i.num === 1 && i.q === 'P') return 'unison';
  if (i.num === 8 && i.q === 'P') return 'octave';
  return `${Q[i.q] ?? i.q} ${n}`.trim();
}
/** Interval names that users say, with the tonal name and the semitones. */
export const INTERVALS = {
  semitone: ['2m', 1], half_step: ['2m', 1], step: ['2M', 2], tone: ['2M', 2], whole_step: ['2M', 2], whole_tone: ['2M', 2],
  minor_second: ['2m', 1], major_second: ['2M', 2], second: ['2M', 2],
  minor_third: ['3m', 3], major_third: ['3M', 4], third: ['3M', 4],
  fourth: ['4P', 5], perfect_fourth: ['4P', 5], augmented_fourth: ['4A', 6], tritone: ['4A', 6], diminished_fifth: ['5d', 6],
  fifth: ['5P', 7], perfect_fifth: ['5P', 7],
  minor_sixth: ['6m', 8], major_sixth: ['6M', 9], sixth: ['6M', 9],
  minor_seventh: ['7m', 10], major_seventh: ['7M', 11], seventh: ['7M', 11],
  octave: ['8P', 12],
};
/** Interval between two pitch classes (or notes with octaves), going up from `a` to `b`. */
export function between(a, b) {
  const x = Note.get(a), y = Note.get(b);
  if (x.empty || y.empty) return null;
  const withOct = x.oct !== undefined && y.oct !== undefined;
  let iv = Interval.distance(withOct ? x.name : x.pc, withOct ? y.name : y.pc);
  const i = Interval.get(iv);
  if (i.empty) return null;
  if (i.semitones < 0) { iv = Interval.distance(x.pc, y.pc); }
  const r = Interval.get(iv);
  return { interval: r.name, name: intervalName(r.name), semitones: r.semitones, simple: r.simple };
}

// ---- keys ------------------------------------------------------------------------------------
export const MODES = { major: 'major', minor: 'minor' };
/** Key facts: signature, scale, relative key, chords of the key (triads, spoken). */
export function keyInfo(root, mode = 'major') {
  const minor = mode === 'minor';
  const k = minor ? Key.minorKey(root) : Key.majorKey(root);
  if (!k || k.empty !== undefined && k.empty) return null;
  const scale = minor ? k.natural.scale : k.scale;
  const accidentals = scale.filter((n) => /[#b]/.test(n));
  const sharps = k.alteration;
  const triads = minor ? k.natural.triads : k.triads;
  return {
    tonic: root, mode, name: `${root} ${mode}`, sharps, count: Math.abs(sharps), kind: sharps > 0 ? 'sharp' : sharps < 0 ? 'flat' : 'none',
    accidentals, scale, relative: minor ? k.relativeMajor : k.minorRelative, triads,
    chordNames: triads.map((t) => { const c = Chord.get(t); return c.empty ? t : c.name; }),
  };
}
export const relativeOf = (root, mode) => { const k = keyInfo(root, mode); return k ? { tonic: k.relative, mode: mode === 'minor' ? 'major' : 'minor' } : null; };
/** Major or minor keys with `n` sharps (kind 'sharp') or flats ('flat'). */
export function keysWith(n, kind, mode = 'major') {
  const fifths = kind === 'flat' ? -n : n;
  const MAJOR = { '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };
  const tonic = MAJOR[fifths];
  if (!tonic) return null;
  if (mode === 'major') return { tonic, mode };
  return { tonic: Key.majorKey(tonic).minorRelative, mode: 'minor' };
}

// ---- misc ------------------------------------------------------------------------------------
export const frequency = (name) => Note.freq(name);
export const enharmonic = (pc) => Note.enharmonic(pc);
export const transposeNote = (name, iv) => Note.transpose(name, iv);
export { Note, Chord, Scale, Interval, Key };
