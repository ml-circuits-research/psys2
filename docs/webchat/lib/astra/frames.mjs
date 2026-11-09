/**
 * ASTRA task frames and expectation agenda (spec 13 section 4, RavenClaw style). Browser-safe, pure data plus small functions.
 *
 * A frame belongs to a world instance: typed parameters, a declarative completion condition, the current question and its admissible answers.
 * The agenda of a discussion decides which frame an answer belongs to. A mode never captures every message globally.
 */
export const FRAME_KINDS = ['fill', 'confirm', 'choice', 'mode'];
export const COMPLETIONS = ['all-required', 'answered', 'explicit'];

/** Agenda of one discussion: `d.agenda = { frames: [] }` (newest first). Counter is kept in the agenda so ids are stable across restore. */
export class Agenda {
  constructor(d) { this.d = d; d.agenda ??= { frames: [] }; d.agenda.frames ??= []; d.agenda.n ??= 0; }
  get frames() { return this.d.agenda.frames; }

  /** Add a frame (newest first). `interrupt` suspends the active frames of the same instance first. Returns the stored frame. */
  push(spec, { interrupt = false } = {}) {
    const f = {
      id: `f${++this.d.agenda.n}`, instance: spec.instance ?? null, world: spec.world ?? null, kind: FRAME_KINDS.includes(spec.kind) ? spec.kind : 'fill',
      params: Object.fromEntries(Object.entries(spec.params ?? {}).map(([k, p]) => [k, { type: p.type ?? null, required: p.required !== false, value: p.value ?? null, admissible: p.admissible ?? null }])),
      completion: COMPLETIONS.includes(spec.completion) ? spec.completion : (spec.kind === 'mode' ? 'explicit' : spec.kind === 'fill' ? 'all-required' : 'answered'),
      question: spec.question ?? null, state: 'active', turn: spec.turn ?? null,
    };
    if (interrupt) for (const g of this.frames) if (g.state === 'active' && g.instance === f.instance) g.state = 'suspended';
    this.frames.unshift(f);
    if (this.frames.length > 12) this.frames.length = 12;
    return f;
  }

  get(id) { return this.frames.find((f) => f.id === id) ?? null; }
  /** The newest active frame. */
  top() { return this.frames.find((f) => f.state === 'active') ?? null; }
  open() { return this.frames.filter((f) => f.state === 'active' || f.state === 'suspended'); }
  suspend(id) { const f = this.get(id); if (!f || f.state !== 'active') return false; f.state = 'suspended'; return true; }
  resume(id) { const f = this.get(id); if (!f || f.state !== 'suspended') return false; f.state = 'active'; return true; }
  complete(id) { const f = this.get(id); if (!f) return false; f.state = 'done'; return true; }
  cancel(id) { const f = this.get(id); if (!f) return false; f.state = 'cancelled'; return true; }
  /** Suspend every active frame of an instance (an interruption). */
  suspendInstance(instance) { let n = 0; for (const f of this.frames) if (f.state === 'active' && f.instance === instance) { f.state = 'suspended'; n++; } return n; }
  /** Reactivate the newest suspended frame of an instance. */
  resumeInstance(instance) { const f = this.frames.find((x) => x.state === 'suspended' && x.instance === instance); if (!f) return null; f.state = 'active'; return f; }

  /** Set a parameter; the frame completes when its completion condition holds. Returns the frame, or null. */
  provide(id, name, value) {
    const f = this.get(id);
    if (!f || !(name in f.params)) return null;
    f.params[name].value = value;
    if (isComplete(f)) f.state = 'done';
    return f;
  }

  /**
   * Which frame does `text` belong to? The newest active frame first, then the suspended ones, most recent first; the first for which
   * `compatible(frame, text)` holds. `passThrough(text)` (switch, help, cancel, a discussion command) is never captured. Returns `{ frame, how }` or null.
   */
  route(text, { compatible = defaultCompatible, passThrough = () => false } = {}) {
    if (passThrough(text)) return null;
    const act = this.frames.filter((f) => f.state === 'active');
    const sus = this.frames.filter((f) => f.state === 'suspended');
    for (const f of act) if (compatible(f, text)) return { frame: f, how: 'active' };
    for (const f of sus) if (compatible(f, text)) return { frame: f, how: 'suspended' };
    return null;
  }
}

/** A frame is complete when its completion condition holds. */
export function isComplete(f) {
  if (f.completion === 'explicit') return false;
  if (f.completion === 'answered') return Object.values(f.params).some((p) => p.value != null);
  return Object.values(f.params).filter((p) => p.required).every((p) => p.value != null);
}

/** The parameters a frame still lacks. */
export const missing = (f) => Object.entries(f.params).filter(([, p]) => p.required && p.value == null).map(([k]) => k);

/** Default compatibility: a frame with `admissible` answers accepts only those; a typed frame without a list accepts anything; a mode accepts anything. */
export function defaultCompatible(f, text) {
  const t = String(text ?? '').trim().toLowerCase();
  const lists = Object.values(f.params).map((p) => p.admissible).filter(Array.isArray);
  if (f.kind === 'confirm') return lists.length ? lists.some((l) => l.includes(t)) : true;
  if (lists.length) return lists.some((l) => l.some((a) => t === String(a).toLowerCase() || t.includes(String(a).toLowerCase())));
  return true;
}

// ---- adapters for the existing records (migration is incremental) ------------------------------------------------------------

/** `Discourse.pending` ({ type: 'fill' | 'confirm', world, key, expected, question, turn }) as a frame spec. */
export function frameFromPending(p, instance = null) {
  if (!p) return null;
  if (p.type === 'confirm') return { kind: 'confirm', world: p.world, instance, question: p.question, turn: p.turn, params: { answer: { type: 'yes/no', admissible: ['yes', 'no'] } } };
  return { kind: 'fill', world: p.world, instance, question: p.question, turn: p.turn, params: { [p.key ?? 'value']: { type: p.expected ?? null } } };
}

/** A world state with an open `inputMode` (dictation, a game, an interview) as a `mode` frame spec. */
export function frameFromModal(world, state, instance = null) {
  if (!state?.inputMode) return null;
  return { kind: 'mode', world, instance, question: state.question ?? null, params: { mode: { type: String(state.inputMode), required: false, value: state.inputMode } }, completion: 'explicit' };
}
