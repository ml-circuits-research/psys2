// SPDX-License-Identifier: AGPL-3.0-only
// media.music: the names the ten library songs are called (the titles and `aka` of kb.sop), for the decline hook, which has no wires: "is this phrase a song of mine?". The song itself is looked up in
// the wires by music.mjs (findSong); a test pins this list to kb.sop.
const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]s\b/g, 's').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const SONG_NAMES = [
  'twinkle twinkle little star', 'twinkle twinkle', 'twinkle', 'little star', 'happy birthday to you', 'happy birthday', 'birthday song', 'ode to joy', 'ode', 'joy', 'ode an die freude',
  'frere jacques', 'brother john', 'are you sleeping', 'mary had a little lamb', 'mary had a lamb', 'little lamb', 'jingle bells', 'jingle', 'old macdonald had a farm', 'old macdonald', 'macdonald', 'farm song',
  'london bridge is falling down', 'london bridge', 'falling down', 'row row row your boat', 'row your boat', 'row row row', 'row row', 'brahms lullaby', 'lullaby', 'wiegenlied', 'lullaby and goodnight', 'brahms',
];
/** True when the phrase names one of the library songs (the same tolerance as findSong: the, a, "song" and a prefix of three letters). */
export function knownSong(text) {
  const t = plain(text).replace(/^(the|a|an) /, '').replace(/ (song|tune|melody)$/, '').replace(/^(song|tune) /, '');
  if (!t) return false;
  return SONG_NAMES.some((n) => n === t || (t.length >= 3 && n.startsWith(t)) || (t.length >= 6 && t.startsWith(n) && n.split(' ').length >= 2));
}
