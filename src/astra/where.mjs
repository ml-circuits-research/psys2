/**
 * ASTRA discussion commands, "where were we?" and UI projections (spec 13 section 8, A11). Browser-safe, pure.
 */
import { infoState } from './moves.mjs';
import { USER_SCOPE } from './registry.mjs';

const plain = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * "Where were we?" (decision of the review, worker-tasks.md): the most recent unfinished activity that the user left for a digression;
 * not the last thing said, not the oldest topic. Same algorithm as the former `Discourse._topicWorld(null, true)`.
 *   topics: worlds, newest first; lastByWorld: world -> last exchange; here: the world of the open tab (the digression);
 *   lastTopic: { world } after an explicit return to an earlier activity (it stays until the user digresses again).
 */
export function lastUnfinished({ topics = [], lastByWorld = {}, here = null, lastTopic = null } = {}) {
  if (lastTopic && (!here || lastTopic.world === here)) return lastTopic.world;
  return topics.find((w) => lastByWorld[w] && w !== here) ?? topics.find((w) => lastByWorld[w]) ?? null;
}

// ---- commands ---------------------------------------------------------------------------------------------------------------

const ORD = '(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|1st|2nd|3rd|4th|5th)';
const ORD_N = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
const AFTER = '(?: from before| from earlier| from last time| we had| we started| we were doing| again)*';
const NEW_RE = /^(?:(?:please |lets |let us |can we |could we )+)?(?:start |open |begin |make |create )?(?:a |another )?new discussion$/;
const LIST_RE = /^(?:(?:please |lets |let us )+)?(?:(?:show|list|see|open)(?: me)?(?: all)? )?(?:(?:my|the|our|all my|all the) )?(?:open |active )?discussions$|^what discussions (?:do i|have i|are there|are open)(?: have| got)?$/;
const BACK_RE = new RegExp(`^(?:(?:please |lets |let us |can we |could we )+)?(?:(?:go |get |come )?back to|return to|switch to|(?:continue|resume|carry on|go on)(?: with)?) (?:the |my |our )?(?:${ORD} )?([a-z][a-z0-9\\- ]*?)${AFTER}$`);
const GENERIC = new Set(['game', 'discussion', 'one', 'tab', 'page', 'activity', 'conversation', 'chat', 'thing']);

/** Recognise a discussion command: { kind: 'new' | 'list' | 'back', ordinal?, noun? } or null. Closed phrase sets, like meta.mjs. */
export function parseCommand(text) {
  const t = plain(text);
  if (!t) return null;
  if (NEW_RE.test(t)) return { kind: 'new' };
  if (LIST_RE.test(t)) return { kind: 'list' };
  const m = t.match(BACK_RE);
  if (m) {
    const noun = m[2].trim();
    if (!noun || /^(?:it|that|this|them|there|before|earlier)$/.test(noun)) return null;
    return { kind: 'back', ordinal: m[1] ? ORD_N[m[1]] : null, noun };
  }
  return null;
}

/** Words that name a discussion: its title, its worlds (id parts, title) and tab words; `tokensOf(world)` adds manifest words. */
export function tokensOfDiscussion(d, astra, tokensOf = () => []) {
  const out = new Set(plain(d.title).split(' '));
  for (const w of plain(d.baseTitle).split(' ')) out.add(w);
  if (d.tab) out.add(plain(d.tab));
  for (const i of astra.instancesOf(d.id)) {
    for (const p of i.world.split('.')) out.add(p);
    for (const x of plain(astra.titleOf(i.world)).split(' ')) out.add(x);
    for (const x of tokensOf(i.world) ?? []) out.add(plain(x));
  }
  out.delete('');
  return out;
}

const wordMatches = (w, toks) => toks.has(w) || toks.has(w.replace(/s$/, '')) || [...toks].some((k) => k.length > 3 && w.length > 3 && (w.startsWith(k) || k.startsWith(w)));

/**
 * Resolve "the second drawing" / "the chess game" against the chat's discussions (open ones only).
 * `{ status: 'one' | 'ambiguous' | 'none', candidates }`; candidates are oldest first; an ordinal selects among them.
 */
export function findDiscussion({ noun, ordinal = null }, astra, { tokensOf = () => [] } = {}) {
  const words = plain(noun).split(' ').filter((w) => w && !GENERIC.has(w) && !['the', 'my', 'our', 'a', 'an', 'to'].includes(w));
  if (!words.length) return { status: 'none', candidates: [] };
  const open = [...astra.discussions.values()].filter((d) => d.status !== 'completed' && d.status !== 'abandoned');
  const cands = open.filter((d) => { const toks = tokensOfDiscussion(d, astra, tokensOf); return words.every((w) => wordMatches(w, toks)); })
    .sort((a, b) => a.created - b.created);
  if (ordinal != null) {
    const pick = ordinal === -1 ? cands.at(-1) : cands[ordinal - 1];
    return { status: pick ? 'one' : 'none', candidates: pick ? [pick] : [] };
  }
  return { status: cands.length === 1 ? 'one' : cands.length ? 'ambiguous' : 'none', candidates: cands };
}

/**
 * Execute a parsed command against the chat. Returns null when the text is not a command ASTRA handles (it falls through to the normal
 * pipeline), else `{ kind, discussion?, text, cards? }`. "back" is handled only when it resolves to an existing discussion that is not the
 * current one of its tab and at least two discussions answer to the noun (the topic return of Discourse covers the rest).
 */
export function runCommand(cmd, astra, { tab = null, tabWorld = null, tokensOf = () => [] } = {}) {
  if (!cmd) return null;
  if (cmd.kind === 'new') {
    const d = astra.createDiscussion({ world: tabWorld, tab, activate: false });
    if (tabWorld && !USER_SCOPE.has(tabWorld)) astra.newInstance(d.id, tabWorld);
    astra.activate(d.id);
    return { kind: 'new', discussion: d, text: `OK, a new discussion: ${d.title}.` };
  }
  if (cmd.kind === 'list') {
    const cards = panel(astra, {});
    if (!cards.length) return { kind: 'list', cards, text: 'There are no discussions yet.' };
    const lines = cards.map((c, k) => `${k + 1}. ${c.title} (${c.status})`);
    return { kind: 'list', cards, text: `Your discussions: ${lines.join('; ')}.` };
  }
  if (cmd.kind === 'back') {
    // a reference is a discussion command only when several discussions answer to the noun ("the first chart" with one chart discussion
    // names an object inside the world: the normal pipeline reads it)
    if (findDiscussion({ noun: cmd.noun }, astra, { tokensOf }).candidates.length < 2) return null;
    const r = findDiscussion(cmd, astra, { tokensOf });
    if (r.status === 'none') return null;
    const d = r.status === 'one' ? r.candidates[0] : r.candidates.filter((x) => x.id !== astra.active).at(-1) ?? r.candidates.at(-1);
    if (!d) return null;
    const current = d.tab != null && astra.tabs[d.tab] === d.id && astra.active === d.id;
    if (current && cmd.ordinal == null) return null;
    astra.activate(d.id);
    return { kind: 'back', discussion: d, text: `Back to ${d.title}.` };
  }
  return null;
}

// ---- UI projections ----------------------------------------------------------------------------------------------------------

/** The discussion card: goal, objects, established facts, the open question and the next step (technical details stay in the record). */
export function card(d, astra) {
  const is = infoState(d);
  const lastAct = astra.log.of(d.id).filter((e) => e.type === 'act' && e.data.worlds?.length).at(-1);   // progress = the last turn that changed something
  const top = (d.agenda?.frames ?? []).find((f) => f.state === 'active');
  const insts = astra.instancesOf(d.id);
  return {
    id: d.id, title: d.title, goal: d.goal ?? null, status: d.status, tab: d.tab,
    worlds: [...new Set(insts.map((i) => i.world))], instances: insts.map((i) => ({ id: i.id, world: i.world, version: i.version })),
    facts: is.facts.filter((f) => f.validity === 'current').slice(0, 5).map((f) => f.text),
    openQuestion: d.openQuestions?.[0] ?? top?.question ?? null,
    nextStep: top?.question ?? d.plan?.[0]?.text ?? null,
    lastProgress: lastAct ? { msg: lastAct.msg, text: lastAct.data.text ?? null } : null,
    active: astra.active === d.id, revision: d.revision,
  };
}

/** Data for a Discussions panel or a per-tab header list: cards, the current one first. Filter by tab, status or world. */
export function panel(astra, { tab, status, world } = {}) {
  return astra.list({ tab, status, world }).map((d) => card(d, astra));
}
