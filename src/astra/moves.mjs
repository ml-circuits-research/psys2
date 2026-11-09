/**
 * ASTRA dialogue moves and information state (spec 13 section 3, TRINDI style). Browser-safe, pure.
 *
 * A turn becomes typed moves; `applyMove` is the one function that updates a discussion's information state
 * (`discussion.context.is = { facts, qud, commitments, proposals, moves }`). A proposed interpretation becomes a fact only after validation.
 */
export const MOVE_TYPES = ['inform', 'ask', 'answer', 'request', 'correct', 'cancel', 'confirm', 'resume', 'switch'];
const MOVE_LIMIT = 30;

const emptyIS = () => ({ facts: [], qud: [], commitments: [], proposals: [], moves: [] });

/** The information state of a discussion (created on demand). */
export function infoState(d) {
  d.context ??= {};
  const is = (d.context.is ??= emptyIS());
  for (const k of Object.keys(emptyIS())) is[k] ??= [];
  return is;
}

export const move = (type, props = {}) => ({ type, ...props });

/**
 * Derive the moves of a turn from what the pipeline already decided; the text is not read again.
 * `{ text, meta, pre, pending, consumed, segments }`: `meta.kind` as in `trace.discourse.meta`, `pre.kind` as `trace.discourse.resolved`,
 * `consumed` the expectation that this turn answered ({ type, world, question }), `segments` the plain segments of the turn.
 */
export function recognize({ text = '', meta = null, pre = null, consumed = null, segments = [], yesNo = null } = {}) {
  const out = [];
  const kind = meta?.kind ?? null;
  if (consumed) {
    if (consumed.type === 'confirm') out.push(move(yesNo === 'yes' ? 'confirm' : yesNo === 'no' ? 'cancel' : 'answer', { text, question: consumed.question ?? null }));
    else out.push(move('answer', { text, question: consumed.question ?? null, world: consumed.world ?? null }));
  }
  if (kind === 'cancel') out.push(move('cancel', { text }));
  else if (kind === 'repair' || kind === 'feedback') out.push(move('correct', { text }));
  else if (kind === 'topic') out.push(meta.target ? move('switch', { text, target: meta.target, world: meta.world ?? null }) : move('resume', { text, world: meta.world ?? null }));
  else if (kind === 'choice.answer') out.push(move('answer', { text }));
  else if (kind === 'offer') out.push(move('confirm', { text }));
  if (pre?.kind === 'fill' && !consumed) out.push(move('answer', { text, world: pre.world ?? null }));
  if (pre?.kind === 'repair') out.push(move('correct', { text }));
  for (const s of segments ?? []) {
    if (s.unparsed || !s.match) continue;
    const k = s.match.kind;
    if (k === 'question') out.push(move('ask', { text: s.text, world: s.match.worldId }));
    else if (k === 'request') out.push(move('request', { text: s.text, world: s.match.worldId, pattern: s.match.patternId }));
    else if (k === 'statement' || k === 'fact') out.push(move('inform', { text: s.text, world: s.match.worldId, pattern: s.match.patternId }));
  }
  return out;
}

/**
 * The update function. Mutates the discussion's information state and returns `{ applied, instruction? }`. `validate(proposal) -> boolean`
 * decides whether an `inform` becomes a fact at once; without it the proposal waits for a `confirm`.
 */
export function applyMove(d, m, { validate = null } = {}) {
  const is = infoState(d);
  const rev = d.revision ?? 0;
  const note = () => { is.moves.unshift({ type: m.type, text: m.text ?? null }); is.moves.length = Math.min(is.moves.length, MOVE_LIMIT); };
  let res = { applied: true };
  switch (m.type) {
    case 'inform': {
      const prop = { text: m.text ?? '', content: m.content ?? null, world: m.world ?? null, source: m.source ?? 'user', rev };
      if (validate && validate(prop)) is.facts.unshift({ ...prop, validity: 'current', justification: null });
      else is.proposals.unshift(prop);
      break;
    }
    case 'ask':
      is.qud.unshift({ text: m.text ?? '', world: m.world ?? null, rev });
      d.openQuestions = is.qud.map((q) => q.text);
      break;
    case 'answer': {
      const q = is.qud.length ? is.qud.shift() : null;
      d.openQuestions = is.qud.map((x) => x.text);
      is.facts.unshift({ text: m.text ?? '', content: m.content ?? null, world: m.world ?? q?.world ?? null, source: 'user', validity: 'current', justification: q ? { question: q.text } : (m.question ? { question: m.question } : null), rev });
      break;
    }
    case 'request':
      is.commitments.unshift({ text: m.text ?? '', world: m.world ?? null, pattern: m.pattern ?? null, status: m.status ?? 'executed', rev });
      is.commitments.length = Math.min(is.commitments.length, MOVE_LIMIT);
      break;
    case 'correct': {
      const i = m.target != null ? is.facts.findIndex((f) => f.text === m.target || f.id === m.target) : is.facts.findIndex((f) => f.validity === 'current');
      if (i >= 0) is.facts[i] = { ...is.facts[i], validity: 'superseded', reason: 'correction', supersededAt: rev };
      if (m.content != null || (m.replacement ?? null) != null) is.facts.unshift({ text: m.replacement ?? m.text ?? '', content: m.content ?? null, world: m.world ?? null, source: 'user', validity: 'current', justification: { corrects: i >= 0 ? is.facts[i + 1]?.text ?? null : null }, rev });
      else res = { applied: i >= 0 };
      break;
    }
    case 'cancel':
      if (is.proposals.length) is.proposals.shift();
      else if (is.qud.length) { is.qud.shift(); d.openQuestions = is.qud.map((x) => x.text); }
      else res = { applied: false };
      break;
    case 'confirm': {
      const accepted = [];
      const keep = [];
      for (const p of is.proposals) {
        if (!validate || validate(p)) { is.facts.unshift({ ...p, validity: 'current', justification: { confirmed: true } }); accepted.push(p); } else keep.push(p);
      }
      is.proposals = keep;
      res = { applied: accepted.length > 0 };
      break;
    }
    case 'resume':
    case 'switch':
      res = { applied: true, instruction: { switchTo: m.discussion ?? null, world: m.world ?? null, target: m.target ?? null } };
      break;
    default:
      res = { applied: false };
  }
  note();
  return res;
}
