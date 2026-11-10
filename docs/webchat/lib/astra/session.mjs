/**
 * ASTRA <-> DialogSession glue (spec 13 sections 1, 2 and 8). Browser-safe: it only uses the dialog's own members.
 * The session never awaits anything here; everything is bookkeeping on the turn path.
 */
import { Astra } from './registry.mjs?v=a492721382';
import { runCommand, parseCommand } from './where.mjs?v=72e99182f4';
import { Agenda, frameFromPending, frameFromModal } from './frames.mjs?v=7f08beebfe';
import { USER_SCOPE } from './registry.mjs?v=a492721382';

const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };

/** The Astra of a dialog session: the binding reads `dialog.isession.state` lazily (the session object is replaced by an undo restore). */
export function createSessionAstra(dialog, { chatKey = 'chat' } = {}) {
  const set = () => dialog.engine.set;
  const binding = {
    get: (w) => dialog.isession.state[w],
    set: (w, s) => {
      const cur = (dialog.isession.state[w] ??= {});
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, s);
    },
    initial: (w) => { const f = set().get(w)?.ops?.initialState; return typeof f === 'function' ? structuredClone(f()) : {}; },
  };
  return new Astra({
    binding, chatKey,
    tabOf: (w) => set().get(w)?.tab?.id ?? BUILTIN_TAB[w] ?? null,
    titleOf: (w) => String(set().get(w)?.title ?? w).replace(/\s*\(.*\)\s*$/, ''),
  });
}

/** Extra words that name a world (manifest tab id and aliases), for "back to the second drawing". */
export function tokensOfWorld(dialog, w) {
  const x = dialog.engine.set.get(w);
  return [...(x?.tab ? [x.tab.id, ...(x.tabAliases ?? x.tab.aliases ?? [])] : []), ...String(x?.title ?? '').toLowerCase().split(/\W+/)];
}

/**
 * A discussion command ("new discussion", "my discussions", "back to the second drawing"): `{ reply, info }` like a meta result, or null
 * when the text is not one (or does not name an existing discussion) and the normal pipeline reads it.
 */
export function runDiscussionCommand(dialog, text, turn) {
  const astra = dialog.astra;
  const cmd = astra ? parseCommand(text) : null;
  if (!cmd) return null;
  const ctx = dialog.context();
  const r = runCommand(cmd, astra, { tab: ctx.activeTab, tabWorld: ctx.tabWorld, tokensOf: (w) => tokensOfWorld(dialog, w) });
  if (!r) return null;
  const info = { kind: 'discussion', command: r.kind, discussion: r.discussion?.id ?? null };
  if (r.kind !== 'back') return { reply: r.text, info };
  // "back to ...": bring the discussion's tab forward and summarise its world, like a topic return
  const d = r.discussion, inst = astra.instancesOf(d.id)[0];
  const world = inst?.world;
  const w = world ? dialog.engine.set.get(world) : null;
  const tab = w?.tab?.id ?? BUILTIN_TAB[world] ?? d.tab;
  const { interp } = dialog.engine;
  if (tab && dialog.isession.state['ui.shell']?.activeTab !== tab) { try { interp.runAction(dialog.isession, 'ui.openTab', { tab }); } catch { /* the shell may be absent */ } }
  const sum = world ? (interp.hook(dialog.isession, world, 'topicSummary', {}) ?? interp.hook(dialog.isession, world, 'summary', {})) : null;
  const disc = dialog.discourse;
  if (world) { disc.topics = [world, ...disc.topics.filter((x) => x !== world)].slice(0, 6); disc.lastTopic = { world, turn }; disc._topicTurn = turn; }
  return { reply: [r.text, typeof sum === 'string' ? sum : ''].filter(Boolean).join(' '), info: { ...info, world, tab } };
}

/**
 * Mirror the existing expectation records into the agenda of the active discussion (observational, spec 13 section 4): the one-turn
 * `Discourse.pending` (fill, confirm) and every world whose state has an open `inputMode`. A consumed expectation completes its frame; a mode
 * that closed completes its mode frame. Nothing here decides anything yet; the interceptors are migrated one world at a time (A10).
 */
export function mirrorFrames(dialog, { consumed = null, open = null, turn = null } = {}) {
  const astra = dialog.astra, d = astra?.activeDiscussion();
  if (!d) return;
  const ag = new Agenda(d);
  const instOf = (w) => astra.live[w] ?? null;
  if (consumed) { const f = ag.frames.find((x) => x.state === 'active' && x.kind === consumed.type && x.question === (consumed.question ?? null)); if (f) ag.complete(f.id); }
  const st = dialog.isession.state;
  for (const w of Object.keys(st)) {
    if (USER_SCOPE.has(w) && w !== 'user.profile') continue;
    const spec = frameFromModal(w, st[w], instOf(w));
    const cur = ag.frames.find((x) => x.state !== 'done' && x.state !== 'cancelled' && x.kind === 'mode' && x.world === w);
    if (spec && !cur) ag.push({ ...spec, turn });
    else if (!spec && cur) ag.complete(cur.id);
  }
  if (open && !ag.frames.some((x) => x.state === 'active' && x.kind === open.type && x.question === (open.question ?? null)) && !(open.type === 'confirm' && ag.frames.some((x) => x.kind === 'mode' && x.world === open.world && x.state === 'active'))) {
    ag.push({ ...frameFromPending(open, instOf(open.world)), turn });
  }
}
