// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The path of a message as a fixed sequence of small decisions (SYSTEM MAP). One vocabulary for three readers: the turn trace (`trace.steps`), the
 * "why" answer's explanation, and the generated page docs/system-map.html (scripts/build-system-map.mjs). Browser-safe (no node:*).
 *
 * A step has an id, a plain label, the module that decides, the data it decides from, and a measure: "alternatives" is the number of candidates the step
 * weighed for one clause (or for the turn), as far as the trace shows it.
 */
export const STEPS = [
  { id: 'kind', label: 'kind of turn', module: 'src/dialog/dialogue.mjs (world session.dialogue)', data: 'the focus log, the open question, the dialogue.* phrase groups of lang.common', measure: 'readers that accepted the message (the first one wins, so 1)' },
  { id: 'world', label: 'world', module: 'src/dialog/index.mjs policy tiers; worlds/meta.worlds cards via src/dialog/symbolic-router.mjs', data: 'open tab, recent worlds, running game, pattern priority, the cards (worlds/meta.worlds/kb.sop)', measure: 'worlds whose patterns read the clause (the router keeps at most three)' },
  { id: 'act', label: 'act', module: 'the chosen world\'s patterns (src/interpreter); worlds/acts for schema worlds', data: 'patterns.sop of the world, or the acts of its schema', measure: 'readings kept: the winning pattern, its runner-up, the other readings' },
  { id: 'things', label: 'things', module: 'the world\'s lexicon; worlds/session.things; the knowledge catalog', data: 'lexicon.sop, the registry of things, the catalog (knowledge/k.objects)', measure: 'slots the pattern read from the sentence' },
  { id: 'missing', label: 'what is missing and who fills it', module: 'src/dialog/dialogue.mjs fill (std.fill); continuation.mjs', data: 'tiers: said, then focus, then scene, then knowledge, then default', measure: 'gaps filled from outside the sentence' },
  { id: 'apply', label: 'apply', module: 'the world\'s operations (worlds/<id>/ops.mjs); worlds/acts executor', data: 'the world\'s state, with undo and a diff', measure: 'operations run' },
  { id: 'reply', label: 'reply', module: 'src/interpreter/render.mjs; graded fallback in src/dialog/index.mjs', data: 'templates and statuses; lang.common phrases', measure: 'statuses of the clauses (supported, missing, unparsed ...)' },
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const stepLabel = (id) => STEPS.find((s) => s.id === id)?.label ?? id;

const opWorld = (op) => { const m = /^op\.(.+)\.[^.]+$/.exec(String(typeof op === 'string' ? op : op?.name ?? op?.op ?? '')); return m ? m[1] : null; };

/**
 * The steps of one finished turn, from what the trace already holds. `alternatives` is a list of numbers (one per clause that ran the step; one for a
 * turn-level step); `pick` is what was chosen; `by` is who or what decided it.
 */
export function turnSteps({ segments = [], operations = [], statuses = [], rec = null } = {}) {
  const read = segments.filter((s) => s.match);
  const withWorlds = segments.filter((s) => Array.isArray(s.worlds) && s.worlds.length);
  const filled = rec?.filled ?? [];
  const opWorlds = [...new Set(operations.map(opWorld).filter(Boolean))];
  return [
    { id: 'kind', pick: rec?.kind ?? 'new', by: 'session.dialogue', alternatives: [1] },
    { id: 'world', pick: [...new Set(read.map((s) => s.match.worldId))], by: [...new Set(read.map((s) => s.routing?.router === 'meta.worlds' ? 'meta.worlds' : s.routing?.tierName ?? 'policy'))], alternatives: withWorlds.map((s) => s.worlds.length) },
    { id: 'act', pick: read.map((s) => s.match.patternId), by: read.map((s) => s.match.worldId), alternatives: read.map((s) => (s.routing?.runnerUp ? 2 : 1) + (s.alternatives?.length ?? 0)) },
    { id: 'things', pick: read.map((s) => Object.keys(s.match.slots ?? {})), by: read.map((s) => s.match.worldId), alternatives: read.map((s) => Object.keys(s.match.slots ?? {}).length) },
    { id: 'missing', pick: filled.map((f) => `${f.role}=${f.value}`), by: [...new Set(filled.map((f) => f.source))], alternatives: [filled.length] },
    { id: 'apply', pick: operations.map((o) => (typeof o === 'string' ? o : o?.name ?? o?.op ?? '')), by: opWorlds, alternatives: [operations.length] },
    { id: 'reply', pick: [...new Set(statuses)], by: 'render', alternatives: [new Set(statuses).size] },
  ];
}
