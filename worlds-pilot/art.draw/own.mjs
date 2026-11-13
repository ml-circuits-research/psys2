// SPDX-License-Identifier: AGPL-3.0-only
// art.draw (pilot, spec 21 and 23): what the schema cannot say and other code calls. The drawing board itself (scene.mjs: the renderer's geometry, the scene composition and the
// drawing from facts; ops.mjs: the scene operations) stays in worlds/art.draw; this file re-exports what the dialog layer and other worlds reach by name and gives the discourse hooks
// (referents, openSlots, checkReferents) the words of the acts (`art.draw.make` -> the board's `draw.add`). Browser-safe.
import * as D from '../../worlds/art.draw/ops.mjs';
import { addArgs, tOf } from './hooks.mjs';

export { initialState, summary } from '../../worlds/art.draw/ops.mjs';
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
export function checkReferents(ctx, { action, args = {} } = {}) {
  const a = actOf(action);
  if (a === 'remove') return D.checkReferents(ctx, { action: 'draw.remove', args: { phrase: args.thing ?? '' } });
  if (['change', 'place', 'copy', 'group', 'pick', 'ask'].includes(a) && args.thing) return D.checkReferents(ctx, { action: `draw.${a}`, args: { t: tOf(args) } });
  return undefined;
}
