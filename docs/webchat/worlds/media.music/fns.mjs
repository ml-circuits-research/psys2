// SPDX-License-Identifier: AGPL-3.0-only
// media.music on the matrix reasoner (spec 15). The rules (what a tempo, a key or an instrument may be, the tempo marking, what was assumed) are in matrix.sop; this file is
// what the library cannot say: the sound engine (the notes, the ABC, the songs, the effects the host plays), reading what the user said, and the words of the replies (the same
// sentences ops.mjs says). The player is wires: one music.player (instrument, tempo, key, volume, playing, loop ... and where each setting came from: default, user or song),
// one music.current (what is loaded), one music.note per note of the melody the user composes (the queue), music.melody, music.said (an assumption already told).
// `toState` derives the state ops.mjs keeps (and the tab reads) from them; `adopt` is the inverse (the operations that stay in ops.mjs change the state, the library takes it
// over as wires). Browser-safe. It imports its sibling ops.mjs and theory.mjs (a world is plain files).
import { initialState, tempo as opsTempo, instrument as opsInstrument, key as opsKey, transposeTo as opsTransposeTo, playAny as opsPlayAny, playScale as opsPlayScale, status as opsStatus } from './ops.mjs?v=2d6c274ea6';
import { pcFromLex, Note } from './theory.mjs?v=967bf62fb3';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const un = (v) => { const s = String(v ?? ''); if (s.startsWith('"')) { try { return JSON.parse(s); } catch { /* not JSON */ } } return s; };
const val = (w, k) => un(w?.attrs?.[k]?.[0]);
const TYPES = ['music.player', 'music.current', 'music.note', 'music.melody'];
const BASE = initialState();
const fresh = () => ({ ...BASE, melody: { items: [], abc: '' }, highlight: [] });   // initialState() without running it again
const CORE = new Set(['instrument', 'tempo', 'tempoLocked', 'volume', 'key', 'current', 'playing', 'loop', 'melody', 'songIndex', 'plays']);
const bool = (v) => v === 'true';

// ------------------------------------------------------------------ the state, derived from the wires

/** The state ops.mjs keeps, derived from the wires. */
export function toState({ find }) {
  const p = find('music.player')[0];
  if (!p) return fresh();
  const rest = val(p, 'rest') ? JSON.parse(val(p, 'rest')) : {};
  const s = { ...fresh(), instrument: val(p, 'instrument'), tempo: Number(val(p, 'tempo')), tempoLocked: bool(val(p, 'locked')), volume: Number(val(p, 'volume')), key: val(p, 'key'),
    playing: bool(val(p, 'playing')), loop: bool(val(p, 'loop')), songIndex: Number(val(p, 'songIndex')), plays: Number(val(p, 'plays')) };
  const cur = find('music.current')[0];
  s.current = cur ? JSON.parse(val(cur, 'data')) : null;
  const items = find('music.note').map((w) => ({ n: Number(val(w, 'n')), p: val(w, 'p') ? val(w, 'p').split(' ') : [], beats: Number(val(w, 'beats')) })).sort((a, b) => a.n - b.n).map((x) => ({ p: x.p, beats: x.beats }));
  s.melody = { items, abc: val(find('music.melody')[0], 'abc') };
  Object.assign(s, structuredClone(rest));
  return s;
}

// ------------------------------------------------------------------ the wires, derived from the state (the inverse of toState)

const bare = (v) => (/^[\w.-]+$/.test(String(v)) && !/^(true|false)$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));
const line = (id, type, attrs) => `@${id} ${type} ${Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${bare(v)}`).join(' ')}`;

/** The wires a state asks for: Map(id -> { type, attrs }). `prev` is the player wire the library holds now (a setting that did not change keeps where it came from). */
function wiresOf(s, prev, find) {
  const want = new Map();
  const rest = {};
  for (const k of Object.keys(s)) if (!CORE.has(k)) rest[k] = s[k];
  // where a setting came from: untouched (the default stands), unchanged (as it was told before), or changed now (by the user, or by the song that was loaded)
  const pick = (key, srcKey, cur, base, now) => {
    const was = prev ? val(prev, srcKey) : null;
    if (cur === base && (!prev || was === 'default')) return 'default';
    return prev && was && String(cur) === val(prev, key) ? was : now;
  };
  const tsrc = pick('tempo', 'tsrc', s.tempo, BASE.tempo, s.tempoLocked ? 'user' : s.current?.songId ? 'song' : 'user');
  const isrc = pick('instrument', 'isrc', s.instrument, BASE.instrument, 'user');
  const ownKey = s.current?.songId ? val(find('media.music.song').find((w) => w.id === `kb.song.${s.current.songId}`), 'key') : null;   // the key the song is written in
  const ksrc = pick('key', 'ksrc', s.key, BASE.key, ownKey && s.key === ownKey ? 'song' : 'user');
  want.set('music.p', { type: 'music.player', attrs: {
    instrument: isrc === 'default' ? undefined : s.instrument, tempo: tsrc === 'default' ? undefined : s.tempo, key: ksrc === 'default' ? undefined : s.key,
    volume: s.volume, locked: s.tempoLocked, playing: s.playing, loop: s.loop, songIndex: s.songIndex, plays: s.plays, tsrc, isrc, ksrc, rest: Object.keys(rest).length ? JSON.stringify(rest) : undefined } });
  if (s.current) want.set('music.cur', { type: 'music.current', attrs: { kind: s.current.kind, title: s.current.title, key: s.current.key, songId: s.current.songId, mine: s.current.mine, data: JSON.stringify(s.current) } });
  s.melody.items.forEach((it, i) => want.set(`music.n.${i}`, { type: 'music.note', attrs: { n: i, p: it.p.join(' '), beats: it.beats } }));
  if (s.melody.abc || s.melody.items.length) want.set('music.mel', { type: 'music.melody', attrs: { abc: s.melody.abc } });
  return want;
}

/** The logical name of a wire id: a replaced wire keeps its name and gets a new revision (`music.p_1`): the library does not take a retract and a tell of one id together. */
const logical = (id) => String(id).replace(/_\d+$/, '');
const revOf = (id) => Number(/_(\d+)$/.exec(String(id))?.[1] ?? 0);

/** What to retract and what to tell so that the library holds the state: only what differs. */
function planOf(s, find) {
  const prev = find('music.player')[0];
  const want = wiresOf(s, prev, find);
  const retract = [], tell = [];
  const kept = new Set();
  const rev = new Map();
  for (const type of TYPES) {
    for (const w of find(type)) {
      budget.tick('music.plan');
      const key = logical(w.id);
      const d = want.get(key);
      const same = d && d.type === type && Object.entries(d.attrs).every(([k, v]) => v === undefined || v === null || String(v) === val(w, k)) && !d.attrs.rest === !w.attrs?.rest;
      if (same) kept.add(key); else { retract.push(w.id); rev.set(key, Math.max(rev.get(key) ?? 0, revOf(w.id) + 1)); }
    }
  }
  for (const [key, d] of want) if (!kept.has(key)) tell.push(line(rev.has(key) ? `${key}_${rev.get(key)}` : key, d.type, d.attrs));
  return { retract, tell: tell.join('\n') };
}

/** The operations of ops.mjs changed the state: the wires that say the same (host: `ReasonerSession.adoptState`). */
export function adopt({ state, find }) {
  const p = planOf(state, find);
  return p.retract.length || p.tell ? p : null;
}

// ------------------------------------------------------------------ the actions

const stateOf = (ctx) => toState({ find: ctx.find });
const scratch = (ctx, st, effects) => ({
  state: st,
  effect: (name, args = {}) => effects.push({ name: String(name), args: structuredClone(args) }),
  request: () => ({ status: 'unsupported' }),
  batch: ctx.live?.batch ?? null,
  ...ctx.host.view(ctx),   // find, val, vals, lexicon: the song library is wires of the library
});
function commit(ctx, st) {
  const p = planOf(st, ctx.find);
  if (!p.retract.length && !p.tell) return;
  const r = ctx.world.applyPatch({ retract: p.retract, wires: p.tell });   // one transaction: the rules settle once
  if (!r.ok) throw new Error(`the player was refused: ${r.violations?.[0]?.why ?? r.violations?.[0]?.kind}`);
}
const envelope = (r, effects) => ({ ...(r.status && r.status !== 'supported' ? { status: r.status, note: r.note } : { value: r.value }), ...(r.pending ? { pending: r.pending } : {}), ...(effects.length ? { effects } : {}), openTab: 'music' });
const arg = (v) => (typeof v === 'string' ? un(v) : v);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const q = JSON.stringify;

/** The most basic reason when several rules refuse a thing. */
const reasonOf = (violations) => (violations ?? []).find((v) => v.why)?.why ?? null;
const tid = (ctx) => `t${ctx.find('music.player')[0]?.id ?? 0}${ctx.world.stamp ?? ''}`;

/** Asks the rules whether a value may be: the refusal's reason, or null. */
function refusal(ctx, text) {
  const r = ctx.world.check({ wires: text });
  return r.ok ? null : reasonOf(r.violations);
}
const tryTempo = (ctx, what, value) => `@music.try music.try tid=${tid(ctx)} what=${what} value=${Number(value)}`;
const tryKey = (ctx, root, mode) => `@music.try music.try tid=${tid(ctx)} what=key root=${q(root)} mode=${mode}`;
const tryInst = (ctx, name) => `@music.try music.try tid=${tid(ctx)} what=instrument name=${q(String(name))} shown=${q(String(name).replace(/_/g, ' '))}`;

/** Runs `fn` of ops.mjs on a scratch copy of the state (the sound engine stays there), then takes the state over as wires. */
function run(ctx, fn, args, st) {
  if (!ctx.find('music.player')[0]) commit(ctx, st);
  const effects = [];
  const r = fn(scratch(ctx, st, effects), args);
  commit(ctx, st);
  return envelope(r, effects);
}
const refuse = (note) => ({ status: 'unsupported', note, openTab: 'music' });
/** A key as the rules know it: the root as the user wrote it (a pitch class when it is one) and the mode. */
const keyOf = (root, m, st) => {
  const pc = pcFromLex(root);
  const shown = pc ?? cap(String(root ?? '').replace(/[_-]/g, ' '));
  const cur = String(st.current?.key ?? st.key ?? '');
  return { root: shown, mode: m ?? (/minor/.test(cur) ? 'minor' : 'major') };
};

export const fns = {
  /** "Make it 90 beats per minute", "faster": a tempo the player cannot play is refused with the limit; the rest is ops.mjs. */
  musicTempo(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    const why = (args.bpm !== undefined && Number.isFinite(Number(args.bpm)) ? refusal(ctx, tryTempo(ctx, 'tempo', args.bpm)) : null)
      ?? (args.f !== undefined && Number.isFinite(Number(args.f)) ? refusal(ctx, tryTempo(ctx, 'factor', args.f)) : null);
    return why ? refuse(why) : run(ctx, opsTempo, args, st);
  },
  /** "Play it at 90 bpm" and the like: the tempo is checked by the rules. */
  musicPlayAny(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    const why = args.bpm !== undefined && Number.isFinite(Number(args.bpm)) ? refusal(ctx, tryTempo(ctx, 'tempo', args.bpm)) : null;
    return why ? refuse(why) : run(ctx, opsPlayAny, args, st);
  },
  musicPlayScale(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    const why = args.bpm !== undefined && Number.isFinite(Number(args.bpm)) ? refusal(ctx, tryTempo(ctx, 'tempo', args.bpm)) : null;
    return why ? refuse(why) : run(ctx, opsPlayScale, args, st);
  },
  /** "Set the key to D major": a key that has no signature (there is no H major, no G sharp major) is refused. */
  musicKey(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    if (args.root === undefined) return run(ctx, opsKey, args, st);
    const k = keyOf(args.root, args.m ?? 'major', st);
    const why = refusal(ctx, tryKey(ctx, k.root, k.mode));
    return why ? refuse(why) : run(ctx, opsKey, args, st);
  },
  musicTransposeTo(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    if (args.root === undefined) return run(ctx, opsTransposeTo, args, st);
    const k = keyOf(args.root, args.m, st);
    const why = refusal(ctx, tryKey(ctx, k.root, k.mode));
    return why ? refuse(why) : run(ctx, opsTransposeTo, args, st);
  },
  /** "Use the flute": an instrument the player does not have is refused with the ones it has. */
  musicInstrument(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    const why = args.inst !== undefined ? refusal(ctx, tryInst(ctx, args.inst)) : null;
    return why ? refuse(why) : run(ctx, opsInstrument, args, st);
  },

  /** "What tempo is it?": the answer of ops.mjs; when it rests on a setting nobody made (the default), the library says so once. */
  musicStatus(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    if (!ctx.find('music.player')[0]) commit(ctx, st);
    const out = run(ctx, opsStatus, args, st);
    const key = { tempo: 'tsrc', instrument: 'isrc', key: 'ksrc' }[args.what];
    const p = ctx.find('music.player')[0];
    if (!key || !p || val(p, key) !== 'default' || out.status || ctx.find('music.said').some((w) => val(w, 'what') === args.what)) return out;
    ctx.tell(`@music.said.${args.what} music.said what=${args.what}`);
    const shown = { tempo: `${st.tempo} beats per minute`, instrument: `the ${st.instrument}`, key: st.key }[args.what];
    return { ...out, assumed: `I assumed ${shown}: nobody has set it yet.`, assumptions: [`music.player.${args.what}=${st[args.what]} (default)`] };
  },

  /** "Why is the tempo 100?": where a setting came from (the default, the user, the song), from what the wire says. */
  musicWhy(ctx, args0) {
    const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, arg(v)]));
    const st = stateOf(ctx);
    const p = ctx.find('music.player')[0];
    const what = { speed: 'tempo', tempo: 'tempo', instrument: 'instrument', key: 'key' }[String(args.what ?? 'tempo')] ?? (args.inst ? 'instrument' : 'tempo');
    const src = p ? val(p, { tempo: 'tsrc', instrument: 'isrc', key: 'ksrc' }[what]) : 'default';
    const song = ctx.find('music.current')[0] && val(ctx.find('music.current')[0], 'kind') === 'song' ? val(ctx.find('music.current')[0], 'title') : null;
    const mark = what === 'tempo' ? ctx.find('music.marking')[0] : null;
    const because = src === 'user' ? 'you asked for it' : src === 'song' ? `that is how "${song ?? 'the song'}" goes` : `nobody has set it: it is my default`;
    const subject = { tempo: `I play at ${st.tempo} beats per minute${mark ? ` (${val(mark, 'word')})` : ''}`, instrument: `I play the ${st.instrument}`, key: `The key is ${st.key}` }[what];
    return { value: `${subject} because ${because}.`, openTab: 'music', ...(p ? { from: [p.id] } : {}) };
  },
};

/** What "undo" says in the world's words (the host calls it with the states before and after the rewind). */
export function undoWords({ before, after }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  let value = 'OK, I took that back.';
  if (before.tempo !== after.tempo) value = `OK, the tempo is back to ${after.tempo} beats per minute.`;
  else if (before.instrument !== after.instrument) value = `OK, I play the ${after.instrument} again.`;
  else if (before.key !== after.key) value = `OK, the key is ${after.key} again.`;
  else if (before.volume !== after.volume) value = `OK, the volume is ${after.volume} percent again.`;
  else if ((before.melody?.items ?? []).length > (after.melody?.items ?? []).length) {
    const word = (i) => (i.p.length ? Note.get(i.p[0]).pc : 'rest');
    const gone = before.melody.items.at(-1), left = after.melody.items;
    value = `Removed ${gone.p.length ? word(gone) : 'the rest'}. ${left.length ? `Your melody is now: ${left.map(word).join(' ')}.` : 'Your melody is empty now.'}`;
  }
  else if (before.playing && !after.playing) value = 'OK, I stopped that.';
  return { value, openTab: 'music' };
}
