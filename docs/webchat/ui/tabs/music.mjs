// Music tab plugin (spec 07 §6/§7): sound with Tone.js, sheet music with abcjs, a clickable keyboard.
// World: media.music. Effects: music.play, music.stop, music.loop. Libraries are vendored in docs/webchat/vendor/music/
// and loaded on first use, so the other tabs do not pay for them.
import { h } from '../util.mjs';
import { createEngine, INSTRUMENTS } from './music/synth.mjs';
import { createPiano, midiOfName, LOW, HIGH } from './music/piano.mjs';
import { createSheet } from './music/sheet.mjs';
import { CSS } from './music/styles.mjs';

const WORLD = 'media.music';
export const SONGS = [
  ['Twinkle, Twinkle, Little Star', 'Traditional', 'C major'], ['Happy Birthday to You', 'Hill sisters, 1893', 'G major'], ['Ode to Joy', 'Beethoven, 1824', 'C major'],
  ['Frère Jacques', 'Traditional', 'C major'], ['Mary Had a Little Lamb', 'Traditional', 'C major'], ['Jingle Bells', 'Pierpont, 1857', 'C major'],
  ['Old MacDonald Had a Farm', 'Traditional', 'C major'], ['London Bridge Is Falling Down', 'Traditional', 'C major'], ['Row, Row, Row Your Boat', 'Traditional', 'C major'],
  ["Brahms' Lullaby", 'Brahms, 1868', 'D major'],
];
const TIPS = ['Play a C major chord', 'Play the D major scale', 'Write a melody: C D E F G', 'Transpose up two steps', 'What chord is C E G?', 'How many sharps does D major have?', 'Change the instrument to flute', 'Loop it'];
const NOTE_RE = /^([A-G])(#{1,2}|b{1,2})?(-?\d+)$/;

function ensureStyle() {
  if (document.querySelector('style[data-p2-music]')) return;
  document.head.append(h('style', { 'data-p2-music': '' }, CSS));
}

function make(holder, host) {
  ensureStyle();
  holder.style.maxWidth = '980px';
  const engine = createEngine(() => import(host.asset('vendor/music/tone.mjs')));
  let st = {}, unlocked = false, current = null, rafId = 0;

  // ---- DOM ----
  const lock = h('button', { class: 'p2m-lock', type: 'button', hidden: true, onclick: () => unlock(true) },
    h('span', { 'aria-hidden': 'true' }, '🔇'), h('span', {}, h('b', {}, 'Sound is locked by your browser. '), 'Click here (or press any key once) to switch it on, then talk to me.'));
  const pillText = h('span', {}, 'Ready');
  const pill = h('div', { class: 'p2m-pill', role: 'status', 'aria-live': 'polite' }, h('i'), pillText);
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const nowEl = h('div', { class: 'p2m-now' }, 'Say “play middle C” or “play Twinkle Twinkle”.');
  const barFill = h('b');
  const hero = h('section', { class: 'p2m-hero', 'aria-label': 'Music studio' }, canvas,
    h('div', { class: 'p2m-hero-in' }, h('div', {}, h('h2', { class: 'p2m-title' }, 'Music studio'), h('p', { class: 'p2m-sub' }, 'Notes, chords, scales and songs by voice. Everything you say goes through the same rules as the chat.')), pill),
    nowEl, h('div', { class: 'p2m-bar', 'aria-hidden': 'true' }, barFill));

  const chips = Object.entries(INSTRUMENTS).map(([id, def]) => h('button', { class: 'p2m-chip', type: 'button', style: `--c:${def.color}`, 'aria-pressed': 'false', dataset: { inst: id }, onclick: () => host.send(`use the ${id}`) }, def.label));
  const tempoVal = h('b', {}, '100'), keyVal = h('b', {}, 'C major'), volVal = h('b', {}, '70');
  const vol = h('input', { class: 'p2m-vol', type: 'range', min: 0, max: 100, step: 5, value: 70, 'aria-label': 'Volume' });
  let volTimer = 0;
  vol.addEventListener('input', () => { volVal.textContent = vol.value; engine.setVolume(Number(vol.value)); clearTimeout(volTimer); volTimer = setTimeout(() => host.send(`set the volume to ${vol.value}`), 450); });
  const playBtn = h('button', { class: 'p2m-btn', type: 'button', onclick: () => host.send(st.current ? 'play it again' : 'play me a song') }, '▶ Play');
  const stopBtn = h('button', { class: 'p2m-btn is-ghost', type: 'button', onclick: () => host.send('stop') }, '■ Stop');
  const loopBtn = h('button', { class: 'p2m-btn is-ghost', type: 'button', 'aria-pressed': 'false', onclick: () => host.send(st.loop ? 'stop looping' : 'loop it') }, '⟳ Loop');
  const controls = h('section', { class: 'p2m-card p2m-controls', 'aria-label': 'Controls' },
    h('div', {}, h('h3', {}, 'Instrument'), h('div', { class: 'p2m-row' }, chips)),
    h('div', { class: 'p2m-row' },
      h('div', { class: 'p2m-meter', title: 'Tempo' }, h('small', {}, 'Tempo'), h('button', { class: 'p2m-round', type: 'button', 'aria-label': 'Slower', title: 'Slower', onclick: () => host.send('make it slower') }, '−'), tempoVal, h('small', {}, 'bpm'), h('button', { class: 'p2m-round', type: 'button', 'aria-label': 'Faster', title: 'Faster', onclick: () => host.send('make it faster') }, '+')),
      h('div', { class: 'p2m-meter', title: 'Volume' }, h('small', {}, 'Volume'), vol, volVal, h('small', {}, '%')),
      h('div', { class: 'p2m-meter', title: 'Key' }, h('small', {}, 'Key'), keyVal),
      h('div', { class: 'p2m-row', style: 'margin-left:auto' }, playBtn, stopBtn, loopBtn)));

  const sheetEl = h('div', { class: 'p2m-sheet' });
  const empty = h('p', { class: 'p2m-empty' }, 'The sheet music appears here. Try “write a melody: C D E F G” or “play the D major scale”.');
  const metaEl = h('div', { class: 'p2m-meta' });
  const sheetCard = h('section', { class: 'p2m-card', 'aria-label': 'Sheet music' }, h('h3', {}, 'Sheet music'), h('div', { class: 'p2m-sheetwrap' }, sheetEl, empty), metaEl);
  const sheet = createSheet(sheetEl, () => import(host.asset('vendor/music/abcjs.mjs')));

  const pianoHost = h('div');
  const pianoCard = h('section', { class: 'p2m-card', style: 'padding-bottom:0', 'aria-label': 'Keyboard' }, h('h3', {}, 'Keyboard (click a key)'), pianoHost);
  const piano = createPiano(pianoHost, { onKey: (_m, spoken) => host.send(`play the note ${spoken}`) });

  const songBtns = SONGS.map(([title, by, key]) => h('button', { class: 'p2m-song', type: 'button', dataset: { title }, onclick: () => host.send(`play ${title}`) }, h('b', {}, title), h('span', {}, `${by} · ${key}`)));
  const songsCard = h('section', { class: 'p2m-card', 'aria-label': 'Songs' }, h('h3', {}, 'Songs I know'), h('div', { class: 'p2m-songs' }, songBtns));
  const tipsCard = h('section', { class: 'p2m-card', 'aria-label': 'Ideas' }, h('h3', {}, 'Try saying'), h('div', { class: 'p2m-tips' }, TIPS.map((t) => h('button', { class: 'p2m-tip', type: 'button', onclick: () => host.send(t) }, `“${t}”`))));
  const root = h('div', { class: 'p2m' }, lock, hero, controls, sheetCard, pianoCard, songsCard, tipsCard);
  holder.append(root);

  // ---- helpers ----
  const instColor = () => INSTRUMENTS[st.instrument]?.color ?? '#0f766e';
  const idleMidis = () => (st.highlight ?? []).map((n) => midiOfName(n)).filter((m) => m != null && m >= LOW && m <= HIGH);
  function setPill(kind, text) { pill.classList.toggle('is-on', kind === 'on'); pill.classList.toggle('is-lock', kind === 'lock'); pillText.textContent = text; }
  function showLock(on) { lock.hidden = !on; if (on && !engine.playing) setPill('lock', 'Sound locked'); }
  async function unlock(fromClick) {
    try { const ok = await engine.unlock(fromClick ? 4000 : 1200); unlocked = ok; showLock(!ok); if (ok && !engine.playing) setPill('', 'Ready'); return ok; } catch { return false; }
  }
  // Browsers need a user gesture before audio starts: the first click, key press or touch unlocks it.
  const gesture = () => { unlock(true).then((ok) => { if (ok) off(); }); };
  const off = () => { for (const ev of ['pointerdown', 'keydown', 'touchend']) document.removeEventListener(ev, gesture, true); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, gesture, true);
  showLock(false);

  function drawLoop() {
    cancelAnimationFrame(rafId);
    const ctx = canvas.getContext('2d');
    const frame = () => {
      const w = canvas.clientWidth, hh = canvas.clientHeight;
      if (canvas.width !== w * 2) { canvas.width = w * 2; canvas.height = hh * 2; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const data = engine.playing ? engine.spectrum() : null;
      if (data) {
        const n = data.length, bw = canvas.width / n;
        for (let i = 0; i < n; i++) {
          const v = Math.max(0, Math.min(1, (data[i] + 90) / 80));
          const bh = v * canvas.height * 0.95;
          ctx.fillStyle = `rgba(255,255,255,${0.18 + v * 0.5})`;
          ctx.beginPath(); ctx.roundRect?.(i * bw + 2, canvas.height - bh, bw - 4, bh, 6); ctx.fill?.();
          if (!ctx.roundRect) ctx.fillRect(i * bw + 2, canvas.height - bh, bw - 4, bh);
        }
        rafId = requestAnimationFrame(frame);
      } else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    frame();
  }
  let startAt = 0, total = 0;
  function progress() {
    if (!engine.playing) { barFill.style.width = '0'; return; }
    const secs = (performance.now() - startAt) / 1000;
    const p = total ? (st.loop ? (secs % total) / total : Math.min(1, secs / total)) : 0;
    barFill.style.width = `${(p * 100).toFixed(1)}%`;
    requestAnimationFrame(progress);
  }
  const noteLabel = (midi) => midi.map((m) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1)).join(' ');
  function applyColors() { const c = instColor(); root.style.setProperty('--key-color', c); }
  function reportEnd(info) {
    // The world learns that playback ended: through observe() when the host offers it, else by patching its state.
    const rounds = info.rounds ?? 1;
    if (typeof host.observe === 'function') host.observe({ effect: 'music.play', ok: true, detail: 'ended', data: { phase: 'ended', rounds, stopped: !!info.stopped }, world: WORLD });
    else host.setWorldState?.(WORLD, { playing: false });
  }
  function ended(info) {
    piano.clearLive(); sheet.clear(); barFill.style.width = '0';
    st = { ...st, playing: false };
    piano.setIdle(idleMidis());
    setPill(unlocked ? '' : '', 'Ready');
    nowEl.textContent = info.stopped ? 'Stopped.' : 'Done.';
    drawLoop();
    if (!info.stopped) reportEnd(info);
  }

  async function renderScore(abc, info) {
    empty.hidden = !!abc;
    sheetEl.parentElement.style.minHeight = abc ? '' : '';
    await sheet.render(abc);
    metaEl.replaceChildren(...(info ?? []).map(([k, v]) => h('span', {}, `${k}: `, h('b', {}, v))));
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { sheet.retry().then(() => sheet.resize()); }) : null;
  ro?.observe(sheetEl);

  return {
    /** Called with the state of media.music (or undefined before the first state). */
    update(state) {
      const prev = st;
      st = { ...(state ?? {}) };
      const s = st;
      for (const b of chips) b.setAttribute('aria-pressed', String(b.dataset.inst === s.instrument));
      tempoVal.textContent = s.tempo ?? 100; keyVal.textContent = s.key ?? 'C major';
      if (s.volume !== undefined && document.activeElement !== vol) { vol.value = s.volume; volVal.textContent = s.volume; }
      if (s.volume !== undefined) engine.setVolume(s.volume);
      loopBtn.setAttribute('aria-pressed', String(!!s.loop));
      applyColors(); piano.setColor(instColor());
      for (const b of songBtns) b.setAttribute('aria-current', String(s.current?.kind === 'song' && s.current.title === b.dataset.title));
      if (!engine.playing) piano.setIdle(idleMidis());
      if (s.playing === false && engine.playing) engine.stop();
      if ((s.score ?? '') !== (prev.score ?? '') || !sheet.rendered && s.score) {
        const c = s.current;
        renderScore(s.score ?? '', c ? [['Playing', c.title], ['Key', c.key ?? ''], ['Notes', (c.seq ?? []).slice(0, 12).map((n) => n.replace(/\d+$/, '')).join(' ') + ((c.seq ?? []).length > 12 ? ' …' : '')]] : []);
      }
      if (!engine.playing && !s.playing) nowEl.textContent = s.current ? `${s.current.title} · ${s.instrument ?? 'piano'} · ${s.tempo} bpm` : 'Say “play middle C” or “play Twinkle Twinkle”.';
    },
    async play(args) {
      applyColors();
      let ok;
      try { ok = await engine.unlock(1200); } catch (e) { return { ok: false, detail: e?.message ?? 'audio failed to start' }; }
      if (!ok) { showLock(true); return { ok: false, detail: 'the browser blocked audio until a user gesture (click or key press)' }; }
      showLock(false); unlocked = true;
      await renderScore(args.abc, [['Playing', args.title], ['Instrument', args.instrument], ['Tempo', `${args.tempo} bpm`]]);
      piano.setIdle([]); piano.clearLive();
      try {
        const r = await engine.play(args, {
          onEvent: (ev, on) => {
            for (const m of ev.midi) piano.note(m, on);
            sheet.highlight(ev.a, on);
            if (on) nowEl.textContent = `${args.title} · ${noteLabel(ev.midi)}`;
          },
          onEnd: ended,
          onLoop: (n) => { setPill('on', `Looping · round ${n}`); },
        });
        total = r.total; startAt = performance.now();
        setPill('on', `Playing · ${args.title}`);
        drawLoop(); progress();
        current = args;
        return { ok: true, detail: 'started', data: { phase: 'started', seconds: Math.round(r.total * 10) / 10 } };
      } catch (e) { return { ok: false, detail: e?.message ?? 'playback failed' }; }
    },
    async stop() { engine.stop(); piano.clearLive(); sheet.clear(); setPill('', 'Ready'); return { ok: true }; },
    async setLoop(on) { if (!on) engine.endLoop(); return { ok: true }; },
    destroy() { off(); engine.stop(); ro?.disconnect(); cancelAnimationFrame(rafId); },
  };
}

export default {
  id: 'music',
  label: 'Music',
  world: WORLD,
  order: 50,
  make,
  effects: {
    'music.play': async (args, { ui }) => (ui ? ui.play(args) : { ok: false, detail: 'the music tab is not available' }),
    'music.stop': async (_args, { ui }) => (ui ? ui.stop() : { ok: true }),
    'music.loop': async (args, { ui }) => (ui ? ui.setLoop(!!args.loop) : { ok: true }),
  },
};
