// Sound engine of the Music tab: Tone.js synth presets (no samples), transport scheduling, loop, analyser.
// Tone.js (MIT) is vendored in docs/webchat/vendor/music/tone.mjs and loaded on first use.

export const INSTRUMENTS = {
  piano: { label: 'Piano', color: '#4a8fe0', gain: 0, make: (T) => new T.PolySynth(T.FMSynth, { harmonicity: 3.01, modulationIndex: 14, oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.7, sustain: 0.08, release: 1.1 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 } }) },
  organ: { label: 'Organ', color: '#8e5bd0', gain: -6, make: (T) => new T.PolySynth(T.Synth, { oscillator: { type: 'custom', partials: [1, 0.8, 0.5, 0.35, 0.2, 0.1] }, envelope: { attack: 0.02, decay: 0.05, sustain: 1, release: 0.12 } }), fx: (T) => new T.Chorus(4, 2.5, 0.4).start() },
  flute: { label: 'Flute', color: '#2fb7c9', gain: -2, make: (T) => new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.07, decay: 0.12, sustain: 0.85, release: 0.3 } }), fx: (T) => new T.Vibrato({ frequency: 5, depth: 0.12 }) },
  strings: { label: 'Strings', color: '#e0623e', gain: -9, make: (T) => new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 1.2 } }), fx: (T) => new T.Filter(2600, 'lowpass') },
  bells: { label: 'Bells', color: '#e6b422', gain: -6, make: (T) => new T.PolySynth(T.FMSynth, { harmonicity: 8, modulationIndex: 2, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 2, sustain: 0.05, release: 2 }, modulation: { type: 'square' }, modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 } }) },
  bass: { label: 'Bass', color: '#4caf6a', gain: -2, shift: -12, make: (T) => new T.PolySynth(T.MonoSynth, { oscillator: { type: 'fmsquare' }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 }, filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4, baseFrequency: 120, octaves: 2.6 } }) },
  marimba: { label: 'Marimba', color: '#f08ab4', gain: -1, make: (T) => new T.PolySynth(T.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.3 } }) },
};

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const volDb = (v) => (v <= 0 ? -Infinity : 20 * Math.log10((Math.max(0, Math.min(100, v)) / 100) ** 1.6) - 3);

export function createEngine(loadTone) {
  let T = null, bus = null, analyser = null, reverb = null, loading = null;
  const voices = {};
  let session = null;      // { id, total, loop, rounds, onEvent, onEnd }
  let counter = 0;

  async function load() {
    if (T) return T;
    loading ??= loadTone().then((m) => {
      T = m;
      bus = new T.Volume(volDb(70));
      analyser = new T.Analyser('fft', 64);
      const limiter = new T.Limiter(-2);
      bus.chain(limiter, T.getDestination());
      bus.connect(analyser);
      try { reverb = new T.Reverb({ decay: 2.4, wet: 0.2 }); reverb.connect(bus); reverb.generate?.().catch?.(() => {}); } catch { reverb = null; }
      return T;
    });
    return loading;
  }
  const out = () => reverb ?? bus;
  function voice(name) {
    const def = INSTRUMENTS[name] ?? INSTRUMENTS.piano;
    if (voices[name]) return voices[name];
    const synth = def.make(T);
    const fx = def.fx?.(T);
    const trim = new T.Volume(def.gain ?? 0);
    if (fx) synth.chain(fx, trim); else synth.connect(trim);
    trim.connect(out());
    return (voices[name] = { synth, def });
  }
  const state = () => T?.getContext().state ?? 'suspended';

  /** Resume the audio context (needs a user gesture the first time). Resolves true when running. */
  async function unlock(timeoutMs = 1500) {
    await load();
    if (state() === 'running') return true;
    try { await Promise.race([T.start(), new Promise((r) => setTimeout(r, timeoutMs))]); } catch { /* blocked */ }
    return state() === 'running';
  }

  function setVolume(v) { if (bus) bus.volume.value = volDb(v); }
  function stop() {
    if (!T) return;
    const tr = T.getTransport();
    tr.stop(); tr.cancel(0); tr.loop = false;
    for (const { synth } of Object.values(voices)) { try { synth.releaseAll(); } catch { /* ignore */ } }
    T.getDraw().cancel?.(0);
    if (session) { const s = session; session = null; s.onEnd?.({ stopped: true, rounds: s.rounds }); }
  }
  /**
   * play({ events: [[t, d, [midi], from, to]], beats, tempo, instrument, volume, loop }, { onEvent(ev, on), onEnd(info), onProgress })
   */
  async function play(args, hooks = {}) {
    const ok = await unlock();
    if (!ok) throw new Error('the browser blocked audio until you click or press a key on the page');
    stop();
    const tr = T.getTransport();
    tr.bpm.value = 120;
    setVolume(args.volume ?? 70);
    const { synth, def } = voice(args.instrument);
    const spb = 60 / Math.max(30, Math.min(240, args.tempo || 100));
    const total = Math.max(0.1, args.beats * spb);
    const tail = Math.min(0.6, spb * 0.5);
    const id = ++counter;
    session = { id, total, loop: !!args.loop, rounds: 1, onEnd: hooks.onEnd };
    const s = session;
    for (const ev of args.events) {
      const [t, d, midi, a, b] = ev;
      const when = t * spb, dur = Math.max(0.08, d * spb * 0.96);
      const freqs = midi.map((m) => mtof(m + (def.shift ?? 0)));
      const vel = midi.length > 1 ? 0.55 : 0.78;
      tr.schedule((time) => {
        try { synth.triggerAttackRelease(freqs, dur, time, vel); } catch { /* voice limit */ }
        T.getDraw().schedule(() => hooks.onEvent?.({ midi, a, b, dur, t, when }, true), time);
        T.getDraw().schedule(() => hooks.onEvent?.({ midi, a, b, dur, t, when }, false), time + dur);
      }, when);
    }
    tr.loop = s.loop; tr.loopStart = 0; tr.loopEnd = total + tail;
    const finish = (time) => T.getDraw().schedule(() => {
      if (session !== s) return;
      session = null; tr.stop(); tr.cancel(0); tr.loop = false;
      hooks.onEnd?.({ stopped: false, rounds: s.rounds });
    }, time);
    if (!s.loop) tr.scheduleOnce(finish, total + tail);
    tr.on?.('loop', function onLoop() { if (session !== s) { tr.off?.('loop', onLoop); return; } s.rounds += 1; hooks.onLoop?.(s.rounds); });
    s.finish = finish;
    tr.position = 0;
    tr.start('+0.06');
    return { total: total + tail };
  }
  /** Stop looping: the current round plays to its end, then playback ends. */
  function endLoop() {
    if (!session || !session.loop) return false;
    const s = session; s.loop = false;
    const tr = T.getTransport();
    tr.loop = false;
    tr.scheduleOnce(s.finish, tr.loopEnd);
    return true;
  }
  function spectrum() { return analyser ? analyser.getValue() : null; }
  return { load, unlock, play, stop, endLoop, setVolume, spectrum, state, get playing() { return !!session; }, get ready() { return !!T; } };
}
