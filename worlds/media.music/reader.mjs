// SPDX-License-Identifier: AGPL-3.0-only
// media.music (spec 21): the world's OWN reader of what a role holds: the words of a note, a chord, a scale, a transposition ("an octave higher", "down a fifth", "to G major"). The acts and their frames
// are read by the generated grammar; this is the music's own text (note names, chord qualities, scale types), which is notation, not English grammar. Browser-safe.
import { CHORD_TYPES, SCALE_TYPES, INTERVALS } from './theory.mjs';
import { INST_OF, INSTRUMENTS } from './music.mjs';

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const DET = new Set(['a', 'an', 'the', 'some', 'that', 'this', 'my', 'your']);
const KINDW = /^(?:chord|chords|triad|triads|arpeggio|arpeggios|scale|scales|note|notes|song|songs|tune|tunes|melody|melodies|track|piece)$/;
export const clean = (t) => String(t ?? '').replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[.!?]+$/g, '').trim();
export const words = (t) => clean(t).toLowerCase().split(/[\s,;:]+/).filter(Boolean);
const key = (...w) => w.join('_');
const pcEntry = (l, acc) => (acc === '#' ? `${l}_sharp` : acc === 'b' ? `${l}_flat` : l);

/** The note at tokens[i]: letter, accidental (in the token or the next word), octave (in the token or the next digit). { pc, entry, oct?, n } with n the tokens used, or null. */
export function noteAt(tk, i) {
  const m = tk[i]?.match(/^([a-g])(#{1,2}|b{1,2})?(\d)?$/);
  if (!m) return null;
  let acc = m[2] ?? '', oct = m[3] !== undefined ? Number(m[3]) : undefined, n = 1;
  if (!acc && (tk[i + n] === 'sharp' || tk[i + n] === 'flat')) { acc = tk[i + n] === 'sharp' ? '#' : 'b'; n++; }
  if (oct === undefined && /^\d$/.test(tk[i + n] ?? '')) { oct = Number(tk[i + n]); n++; }
  return { pc: m[1].toUpperCase() + acc, oct, n, entry: pcEntry(m[1], acc) };
}

/** Strips the trailing instrument ("on the flute"), tempo ("at 90 bpm"), length ("for 4 beats") and fillers of a phrase. */
export function peel(text) {
  let t = clean(text).toLowerCase().replace(/\s+/g, ' ').replace(/^(?:me|us)\s+/, ''), inst, bpm, beats, secs;
  for (let again = true; again;) {
    again = false;
    let m;
    if ((m = t.match(/\s+(?:please|pls|plz|now|for me|thanks|thx|would be nice|would be great|would be lovely)$/))) { t = t.slice(0, m.index); again = true; }
    if ((m = t.match(/\s+(?:on|with|using|in|through|by)\s+(?:the |a |an |my )?([a-z_]+(?: [a-z]+)?)$/))) {
      const w = m[1].replace(/ /g, '_'), last = m[1].split(' ').at(-1), hit = [w, w.replace(/s$/, ''), last, last.replace(/s$/, '')].find((x) => INST_OF[x]);
      if (hit) { inst = hit; t = t.slice(0, m.index); again = true; }
    }
    if ((m = t.match(/\s+(?:at|in|with)\s+(\d+)\s*(?:bpm|beats per minute|beats a minute)$/))) { bpm = m[1]; t = t.slice(0, m.index); again = true; }
    if ((m = t.match(/\s+for\s+(\d+(?:\.\d+)?)\s+(beats?|seconds?|secs?)$/))) { if (/^b/.test(m[2])) beats = m[1]; else secs = m[1]; t = t.slice(0, m.index); again = true; }
  }
  return { text: t, inst, bpm, beats, secs };
}

function rootOf(tk) {
  for (let i = 0; i < tk.length; i++) { const n = noteAt(tk, i); if (n) return { ...n, at: i, rest: [...tk.slice(0, i), ...tk.slice(i + n.n)] }; }
  const m = tk.map((w, i) => [w.match(/^([a-g])m(\d)?$/), i]).find(([x]) => x);
  if (m) return { pc: m[0][1].toUpperCase(), entry: m[0][1], sym: true, symN: m[0][2], at: m[1], rest: tk.filter((_, i) => i !== m[1]) };
  return null;
}
/** The longest run of words that is a key of `table` (chord qualities, scale types), and the words left. */
const qualityOf = (ws, table) => {
  const w = ws.filter((x) => !DET.has(x) && !KINDW.test(x) && !['of', 'in', 'on', 'for'].includes(x));
  for (let n = w.length; n >= 1; n--) for (let s = 0; s + n <= w.length; s++) { const k = key(...w.slice(s, s + n)); if (table[k]) return { q: k, left: [...w.slice(0, s), ...w.slice(s + n)] }; }
  return { q: undefined, left: w };
};
const DIRW = { up: 'ascending', ascending: 'ascending', upwards: 'ascending', down: 'descending', descending: 'descending', downwards: 'descending', up_and_down: 'up_and_down', both_ways: 'up_and_down', down_and_up: 'down_and_up' };

const ARP = /\b(?:arpeggio|arpeggios|arpeggiate|broken|single notes|one by one|note by note|one note after another|one at a time|spread|spread out)\b/;
const ARPW = new Set(['into', 'but', 'out', 'after', 'another', 'time', 'by', 'spread', 'arpeggio', 'arpeggios', 'arpeggiate', 'broken', 'single', 'notes', 'one', 'at', 'note']);
const SCALEONLY = /pentatonic|dorian|phrygian|lydian|mixolydian|locrian|blues|harmonic|melodic|chromatic|whole|ionian|aeolian/;
function parseTokens(tk0, p, common) {
  const mode = ARP.test(`${tk0.join(' ')} ${p.hint ?? ''}`) ? 'arpeggio' : undefined;
  const base = mode ? tk0.filter((w) => !ARPW.has(w)) : tk0;
  if (!base.length) return null;
  const bs = base.join(' ');
  // notes said together make a chord
  const together = /\s+(?:together|at once|all at once|at the same time|as a chord|all together)$/.exec(bs);
  if (together) return { type: 'chord', args: { ...common, seq: bs.slice(0, together.index).replace(/^(?:the )?notes\s+/, ''), mode } };
  const hasChord = base.some((w) => /^(?:chord|chords|triad|triads)$/.test(w)) || (!!mode && !base.some((w) => /^scales?$/.test(w)));
  const hasScale = base.some((w) => /^scales?$/.test(w));
  const body = base.filter((w) => !/^(chord|chords|triad|triads|scale|scales|of|in|for|on|the|an)$/.test(w));
  // g7 / a7 / c9: a letter with 7 or 9 is a chord
  const g7 = body.length === 1 && body[0].match(/^([a-g])(#|b)?([79])$/);
  if (g7 && !hasScale) return { type: 'chord', args: { ...common, root: pcEntry(g7[1], g7[2] ?? ''), n: g7[3], mode } };
  // a chord: a root and a quality, every word used ("a minor", "g seventh", "a minor 7", "g major chord")
  if (!hasScale) {
    const r = rootOf(body);
    if (r) {
      if (r.sym && (hasChord || body.length === 1)) return { type: 'chord', args: { ...common, sym: `${r.entry}m`, n: r.symN, mode } };
      const rest = r.rest.filter((w) => w !== 'a');
      const nums = rest.filter((w) => /^\d$/.test(w)), ql = qualityOf(rest.filter((w) => !/^\d$/.test(w)), CHORD_TYPES);
      if (!ql.left.length && (hasChord || ql.q || nums.length) && !(!hasChord && (r.oct !== undefined && r.oct !== 7)) && !(!hasChord && ql.q && SCALEONLY.test(ql.q)) && !(!hasChord && !ql.q && !nums.length)) return { type: 'chord', args: { ...common, root: r.entry, q: ql.q, n: nums[0], mode } };
    }
  }
  // a scale: "C major scale up and down", "D dorian", "e min pentatonic", "the scale"
  const dirm = bs.match(/\s+(up and down|down and up|both ways|ascending|descending|upwards|downwards|up|down)$/);
  const tks = words(dirm ? bs.slice(0, dirm.index) : bs).filter((w) => !/^(scale|scales|in|of|the|an|for|from)$/.test(w));
  if (hasScale || tks.length >= 2) {
    const rr = rootOf(tks);
    const ql = qualityOf(rr ? rr.rest : tks, SCALE_TYPES);
    const left = ql.left.filter((w) => w !== 'a');
    if ((hasScale && !left.length) || (rr && ql.q && !left.length && (!CHORD_TYPES[ql.q] || SCALEONLY.test(ql.q))))
      return { type: 'scale', args: { ...common, root: rr?.entry, st: ql.q, dir: dirm ? DIRW[dirm[1].replace(/ /g, '_')] : undefined } };
  }
  // one note: "middle c", "high g", "c sharp", "the note b flat 3", "just one e note", "a 4"
  const ws = base.filter((w) => !['note', 'notes', 'just', 'one', 'only', 'the', 'an', 'in', 'octave', 'at'].includes(w));
  let reg, i = 0;
  if (['high', 'higher', 'low', 'lower', 'middle'].includes(ws[0])) { reg = ws[0]; i = 1; }
  const n = noteAt(ws, i);
  if (n && i + n.n === ws.length) return { type: 'note', args: { ...common, note: n.entry, oct: n.oct, reg: reg === 'middle' ? undefined : reg, beats: p.beats, secs: p.secs, explicit: tk0.includes('note') || tk0.includes('notes') } };
  return null;
}

/** What a thing role asks to be played: { type: 'note'|'chord'|'scale'|'song'|'seq'|'melody'|'current'|'random'|'instrument'|'none'|'unknown', args }. */
export function readPlayable(raw, { findSong, parseSeq, hint } = {}) {
  const p = peel(raw);
  p.hint = String(hint ?? '').toLowerCase();
  const t = p.text;
  const common = { inst: p.inst, bpm: p.bpm };
  if (!t) return { type: 'none', args: common };
  if (/^(?:it|that|this|that one|this one|it again|the same|the same one|again|that again|this again)$/.test(t)) return { type: 'current', args: common };
  if (/^(?:my|the)?\s*(?:melody|tune|composition|song|notes?)(?: i made| i wrote| i composed| i created| back)?$|^(?:back )?my (?:melody|tune|composition|song|notes)(?: back)?$|^(?:the )?notes back$|^(?:back )?my notes$/.test(t) && !/^(?:the )?(?:song|tune)$/.test(t)) return { type: 'melody', args: common };
  if (/^(?:a |some |any )?(?:random|different|new|next|another)?\s*(?:song|tune|music|piece|something|one|track)(?: at random| for me)?$|^something(?: nice| else)?$/.test(t)) return { type: 'random', args: common };
  const tk = words(t);
  if (tk.length === 1 && /^(?:scales?)$/.test(tk[0])) return { type: 'scale', args: { ...common } };
  if (tk.length === 1 && /^(?:chords?)$/.test(tk[0])) return { type: 'chord', args: { ...common } };
  if (tk.length === 1 && /^(?:notes?)$/.test(tk[0])) return { type: 'note', args: { ...common } };
  // an instrument alone ("the cello", "a violin sound")
  const iw = tk.filter((w) => !DET.has(w) && !['sound', 'instrument', 'please', 'instead'].includes(w));
  if (iw.length && iw.length <= 2 && INST_OF[key(...iw)] && !(iw.length === 1 && noteAt(iw, 0))) return { type: 'instrument', args: { inst: key(...iw) } };
  const stripped = tk[0] && DET.has(tk[0]) && tk.length > 1 ? tk.slice(1) : null;
  for (const v of stripped ? (tk.some((w) => /^scales?$/.test(w)) && tk[0] === 'a' && !/^(?:minor|major|min|maj)$/.test(tk[1] ?? '') ? [stripped, tk] : [tk, stripped]) : [tk]) {   // "a blues scale": the scale has a root only when one is said, so the "a" is an article; "a minor chord" needs its root
    const r = parseTokens(v, p, common); if (r) return r; }
  if (findSong) { const f = findSong(t); if (f.current) return { type: 'current', args: common }; if (f.song) return { type: 'song', args: { ...common, song: f.song, flags: f.flags } }; }
  if (parseSeq) { const s = parseSeq(t); if (s.items.length && !s.bad.length) return { type: 'seq', args: { ...common, text: t } }; }
  return { type: 'unknown', args: { ...common, text: p.text } };
}

/** A setting said about "it" ("slower", "a bit louder", "at half speed", "just once", "in G"): { what: 'tempo'|'volume'|'pitch'|'loop'|'key', args } or null. */
export function readSetting(raw) {
  const t = clean(raw).toLowerCase().replace(/^(?:it|that|this|the song|the music|the tune)\s*/, '').replace(/\s+(?:please|pls|plz|now|for me|thanks)$/, '').trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/^(slower|faster|quicker|louder|quieter|softer|higher|lower)\b\s*(.*)$/))) {
    const what = /slower|faster|quicker/.test(m[1]) ? 'tempo' : /louder|quieter|softer/.test(m[1]) ? 'volume' : 'pitch';
    const rest = m[2].trim();
    if (rest && !/^(?:a bit|a little|a lot|much|slightly|a tad|a notch|just a bit|a touch)$/.test(rest)) return null;
    return { what, args: { dir: m[1], deg: rest ? rest.replace(/\s+/g, '_') : undefined } };
  }
  if ((m = t.match(/^(?:at\s+)?(half|double|twice|triple|normal)(?:\s+the)?\s+(?:speed|tempo)$/))) return m[1] === 'normal' ? { what: 'tempo', args: { dir: 'reset' } } : { what: 'tempo', args: { f: String({ half: 0.5, double: 2, twice: 2, triple: 3 }[m[1]]), replay: 'true' } };
  if ((m = t.match(/^(?:to |at |be )?(\d+)\s*(?:bpm|beats per minute|beats a minute)$/))) return { what: 'tempo', args: { bpm: m[1], replay: 'true' } };
  if ((m = t.match(/^(up|down)(?:\s+(a bit|a little|a lot|much|slightly|a tad|a notch|just a bit|a touch))?$/))) return { what: 'volume', args: { dir: m[1] === 'up' ? 'louder' : 'quieter', deg: m[2] ? m[2].replace(/\s+/g, '_') : undefined } };
  if (/^(?:just )?once$/.test(t) || /^(?:just )?one time$/.test(t)) return { what: 'loop', args: { on: 'false' } };
  if ((m = t.match(/^in\s+(?:the\s+)?(?:key\s+)?(?:of\s+)?([a-g][#b]?|[a-g]\s+(?:sharp|flat))(?:\s+(major|minor))?$/))) { const n = noteAt(words(m[1]), 0); if (n) return { what: 'key', args: { root: n.entry, m: m[2] } }; }
  return null;
}

/** A transposition said in words: "an octave higher", "two octaves down", "down a fifth", "up 3 semitones", "to G major". { dir, n, unit } or { root, m } or { dir, hl } or null. */
export function readShift(raw) {
  const t = clean(raw).toLowerCase().replace(/^(?:it|that|this|the song|the melody|the music|the tune)\s+/, '').replace(/\s+(?:please|pls|now|for me|thanks)$/, '');
  const to = t.match(/(?:^|\s)(?:to|into|in)\s+(?:the )?(?:key )?(?:of )?(.+)$/);
  if (to) {
    const tk = words(to[1].replace(/\bkey\b/, ''));
    const r = noteAt(tk, 0);
    if (r) { const rest = tk.slice(r.n).filter((w) => w !== 'key'); if (rest.length <= 1) return { root: r.entry, m: rest[0] === 'minor' || rest[0] === 'min' ? 'minor' : rest[0] === 'major' || rest[0] === 'maj' ? 'major' : undefined }; }
  }
  const up = /\b(?:up|upward|upwards|higher|above|sharper|raise|raised)\b/.test(t), down = /\b(?:down|downward|downwards|lower|below|flatter|lowered)\b/.test(t);
  if (!up && !down) return null;
  const tk = words(t.replace(/\b(?:up|upward|upwards|higher|above|down|downward|downwards|lower|below|by|a bit|a little|just|than|from|the)\b/g, ' '));
  let n, unit;
  for (let i = 0; i < tk.length; i++) {
    const w = tk[i];
    if (/^\d+$/.test(w) || NUMW[w] !== undefined) { n = /^\d+$/.test(w) ? Number(w) : NUMW[w]; continue; }
    const cand = [key(w), key(tk[i - 1] ?? '', w), key(w, tk[i + 1] ?? '')].map((x) => x.replace(/s$/, '')).concat([w.replace(/s$/, '')]);
    const hit = cand.find((c) => INTERVALS[c] || c === 'octave' || c === 'semitone');
    if (hit) { unit = ['half_step', 'half_tone', '0.5_step', '0.5_tone'].includes(hit) ? 'semitone' : hit; break; }
  }
  if (!unit && /\boctaves?\b/.test(t)) unit = 'octave';
  if (!unit && n === undefined) return { dir: up ? 'up' : 'down', hl: true, amount: /a bit|a little|slightly/.test(t) ? 'a_bit' : /a lot|much/.test(t) ? 'a_lot' : undefined };
  return { dir: up ? 'up' : 'down', n, unit };
}
export const instrumentOf = (v) => { const k = String(v ?? '').toLowerCase().trim().replace(/^(?:the|a|an)\s+/, '').replace(/\s+(?:sound|instrument)$/, '').replace(/\s+/g, '_'); return [k, k.replace(/s$/, '')].find((x) => INST_OF[x]) ?? null; };
export { INSTRUMENTS };

/** "Play A 4", "set the key to A minor": the frame's determiner took the note name "a" for an article; give it back when what is left only makes sense as a note's continuation. */
export function unDet(said, text) {
  const t = String(said ?? '').trim(), full = String(text ?? '').toLowerCase();
  const first = t.toLowerCase().split(/\s+/)[0] ?? '';
  if (!first || !/^(?:\d|sharp$|flat$|minor$|major$|min$|maj$|m$|seventh$|dim$|aug$|sus|dorian$|phrygian$|lydian$|mixolydian$|locrian$|blues$|pentatonic$)/.test(first)) return t;
  return new RegExp(`(?:^|\\s)a\\s*${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(full) ? `a ${t}` : t;
}
