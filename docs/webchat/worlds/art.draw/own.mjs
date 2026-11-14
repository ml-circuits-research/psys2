// SPDX-License-Identifier: AGPL-3.0-only
// art.draw (pilot, spec 21 and 23): what the schema cannot say and other code calls. The drawing board itself (scene.mjs: the renderer's geometry, the scene composition and the
// drawing from facts; ops.mjs: the scene operations) stays in worlds/art.draw; this file re-exports what the dialog layer and other worlds reach by name and gives the discourse hooks
// (referents, openSlots, checkReferents) the words of the acts (`art.draw.make` -> the board's `draw.add`). Browser-safe.
import * as D from './engine.mjs?v=5c10fe69c0';
import { addArgs, tOf } from './hooks.mjs?v=8fdc72cad7';
import { goalOf, goalFromText, goalWord, goalWords, layoutGoal, liveOf, whyPlan as whyOfPlan } from './plan.mjs?v=86c8801f75';

export { initialState, summary } from './engine.mjs?v=5c10fe69c0';
/** Other worlds ask the board by its old action names: Talk draws with draw.add, the chess tab and Talk undo with draw.undo, the tab has "new" and "open". */
export const add = D.add;
export const drawUndo = D.undo;
export const drawRedo = D.redo;
export const newDrawing = D.newDrawing;
export const openTab = D.openTab;
export const scene = D.scene;
/** The discourse hooks (referents is `hooks.referents`): the words a reading holds that the board has no picture for. */
const actOf = (action) => String(action ?? '').split('.').pop();
export function openSlots(ctx, { action, args = {} } = {}) {
  if (actOf(action) !== 'make') return [];
  return D.openSlots(ctx, { action: 'draw.add', args: addArgs(args) });
}
/** Words for the sky as a whole, which the picture always has ("change the scene to dawn"): the regions of the schema, so they are never missing. */
const WHOLE = /(?:^|\s)(?:scene|mood|time|weather|atmosphere)$/i;
export function checkReferents(ctx, { action, args = {} } = {}) {
  const a = actOf(action);
  if (a === 'ask' && ['options', 'describe'].includes(String(args.mode ?? ''))) return undefined;   // "what colour options do I have": a question about the board, not a thing in it
  if (a === 'change' && (WHOLE.test(String(args.thing ?? '').trim()) || /^(?:it|them|that|this)\b/i.test(String(args.thing ?? '').trim()))) return undefined;   // the whole scene, or a pronoun the dialogue resolves
  if (a === 'remove') return D.checkReferents(ctx, { action: 'draw.remove', args: { phrase: args.thing ?? '' } });
  if (a === 'place' && args.thing && args.place && goalWord(args.thing) && !D.parseNP(args.thing).known) return undefined;   // a thing of the catalog that is not drawn, put somewhere ("put a scarf on the girl"): the plan makes it there, there is nothing to find
  if (['change', 'place', 'copy', 'group', 'pick', 'ask'].includes(a) && args.thing) return D.checkReferents(ctx, { action: `draw.${a}`, args: { t: tOf(args) } });
  return undefined;
}
/** Discourse hook (specs/24): a reading that may be a GOAL (a kind the board has no picture of, or a thing with a place of "on" / "in" / "around"): { goal, words } for the host to load the methods before the board runs, else null. */
export function planGoal(ctx, { action, args = {} } = {}) {
  const act = actOf(action);
  if (act !== 'make' && act !== 'place') return null;
  if (act === 'place' && args.mode === 'layout') { const goal = layoutGoal(args); return goal ? { goal, words: goalWords(goal) } : null; }
  if (act === 'place') {   // the thing is in the picture; the methods that put a thing on another are loaded for its words and the place's
    const g = goalOf('make', { kind: args.thing }, args), t = goalFromText(args.text);
    if (t && goalWord(t.roles.kind)) return { goal: t, words: goalWords(t) };   // "set a table for four" is read as a place act
    return g?.roles.place ? { goal: null, words: goalWords(g) } : null;
  }
  for (const goal of [goalOf('make', addArgs(args), args), goalFromText(args.text)]) {   // the roles as read, then the sentence's own words ("set a table for four")
    if (goal && (goal.roles.place || goal.roles.material || !D.kindOfWord(goal.roles.kind) || goalWord(goal.roles.kind))) return { goal, words: goalWords(goal) };
  }
  return null;
}
/** The things of the picture as the planner's live world (hook of the host). */
export const planLive = (ctx) => liveOf(ctx.state);
/** Discourse hook: why the newest change was made, when a plan made it (the method and its steps, from the knowledge that holds them). */
export const whyPlan = (ctx) => whyOfPlan(ctx);
