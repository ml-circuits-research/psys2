// SPDX-License-Identifier: AGPL-3.0-only
// art.draw (pilot, spec 21 and 23): what the schema cannot say and other code calls. The drawing board itself (scene.mjs: the renderer's geometry, the scene composition and the
// drawing from facts; ops.mjs: the scene operations) stays in worlds/art.draw; this file re-exports what the dialog layer and other worlds reach by name and gives the discourse hooks
// (referents, openSlots, checkReferents) the words of the acts (`art.draw.make` -> the board's `draw.add`). Browser-safe.
import * as D from './engine.mjs?v=0f507edfbe';
import { addArgs, tOf } from './hooks.mjs?v=3542e619fa';

export { initialState, summary } from './engine.mjs?v=0f507edfbe';
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
  if (['change', 'place', 'copy', 'group', 'pick', 'ask'].includes(a) && args.thing) return D.checkReferents(ctx, { action: `draw.${a}`, args: { t: tOf(args) } });
  return undefined;
}
