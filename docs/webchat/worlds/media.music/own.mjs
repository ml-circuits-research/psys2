// SPDX-License-Identifier: AGPL-3.0-only
// media.music (spec 21): what the schema cannot say and other code needs from this world. The player, the note readers, the sheet music and the theory are music.mjs; the schema reads the acts, the
// operations below are the families that have no act (theory questions, lists, status, what a song is) and the state hooks of the tab.
export {
  initialState, onObservation, topicSummary, melodyShow, showNotes, showScore, listSongs, listInstruments, listTypes, scaleNotes, chordNotes, chordName, keySig, keyWith, interval, above, relative, keyChords,
  frequency, enharmonic, status, songInfo, askWhat,
  instrument, key, melodySet, octave, playAny, playChord, playNote, playScale, random, replay, stop, tempo, transpose, transposeTo, volume,
} from './music.mjs?v=7844697f58';
