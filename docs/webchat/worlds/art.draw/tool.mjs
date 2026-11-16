// SPDX-License-Identifier: AGPL-3.0-only
// art.draw: what the request door calls (spec 28 sections 11, 14), and nothing else. The tool primitives bound by request.sop's std.tool wires, the board's view and the declared
// custom search; undo / redo / a new page (request.sop psys2.op). A scene (pond, forest, garden) is a whole the library plans with its parts and runs through the same
// primitives (startScene, then addThings in it). The door reaches the world through these names only; scripts/glue-lint.mjs measures the glue from this file. Browser-safe.
export { startScene, addThings, removeThings, moveThings, setThings, paintSky, toolView, thingAt, newDrawing, undo as drawUndo, redo as drawRedo } from './engine.mjs?v=4b32a092ef';
