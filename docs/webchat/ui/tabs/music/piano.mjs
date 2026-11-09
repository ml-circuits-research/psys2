// On-screen piano keyboard (C3 to B5). Keys light up for a set of notes (idle highlight) and for playing notes.
// A click sends a command through the language layer, so mouse and voice share the same path.
import { h } from '../../util.mjs';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SPOKEN = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
export const LOW = 48, HIGH = 83;

export function midiOfName(name) {
  const m = String(name).match(/^([A-G])(#{1,2}|b{1,2})?(-?\d+)$/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const alt = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
  return 12 * (Number(m[3]) + 1) + base + alt;
}

export function createPiano(container, { onKey } = {}) {
  const whites = [];
  for (let m = LOW; m <= HIGH; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const root = h('div', { class: 'p2m-piano', role: 'group', 'aria-label': 'Piano keyboard, three octaves' });
  const keys = new Map();
  const W = 100 / whites.length;
  whites.forEach((m, i) => {
    const oct = Math.floor(m / 12) - 1, pc = m % 12;
    const k = h('button', { class: 'p2m-key is-white', type: 'button', style: `left:${i * W}%;width:${W}%`, 'aria-label': `${SPOKEN[pc]} ${oct}`, title: `${SPOKEN[pc]} ${oct}`, dataset: { midi: m } },
      h('span', { class: 'p2m-keyname' }, pc === 0 ? `C${oct}` : NAMES[pc]));
    keys.set(m, k); root.append(k);
  });
  for (let m = LOW; m <= HIGH; m++) {
    if (!BLACK.has(m % 12)) continue;
    const left = (whites.indexOf(m - 1) + 1) * W;
    const oct = Math.floor(m / 12) - 1, pc = m % 12;
    const k = h('button', { class: 'p2m-key is-black', type: 'button', style: `left:${left - W * 0.3}%;width:${W * 0.6}%`, 'aria-label': `${SPOKEN[pc]} ${oct}`, title: `${SPOKEN[pc]} ${oct}`, dataset: { midi: m } });
    keys.set(m, k); root.append(k);
  }
  root.addEventListener('pointerdown', (e) => {
    const k = e.target.closest?.('.p2m-key');
    if (!k) return;
    const m = Number(k.dataset.midi);
    k.classList.add('is-press'); setTimeout(() => k.classList.remove('is-press'), 180);
    onKey?.(m, `${SPOKEN[m % 12]} ${Math.floor(m / 12) - 1}`);
  });
  container.append(root);
  const idle = new Set(), live = new Map();
  const paint = (m) => { const k = keys.get(m); if (!k) return; k.classList.toggle('is-idle', idle.has(m)); k.classList.toggle('is-live', (live.get(m) ?? 0) > 0); };
  return {
    el: root,
    /** Idle highlight: midi numbers lit softly (the notes of the current thing). */
    setIdle(midis) { const old = [...idle]; idle.clear(); for (const m of midis) idle.add(m); for (const m of [...old, ...idle]) paint(m); },
    note(m, on) { live.set(m, Math.max(0, (live.get(m) ?? 0) + (on ? 1 : -1))); paint(m); },
    clearLive() { const old = [...live.keys()]; live.clear(); old.forEach(paint); },
    setColor(c) { root.style.setProperty('--key-color', c); },
  };
}
