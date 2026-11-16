// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar: what the request door calls (spec 28 sections 11, 14), and nothing else. The tool primitives bound by request.sop's std.tool wires (a preset worn, a part worn, taken
// off, coloured, sized, moved), the face's view and its own undo / redo (request.sop psys2.op). All of it is the face's (face.mjs: state, history, the size and place algorithms);
// the face logic of the old readers (facelogic.mjs, hooks.mjs) is not reachable from here. scripts/glue-lint.mjs measures the glue from this file. Browser-safe.
export { wearPreset, putPart, takeOff, setParts, moveParts, toolView, presetVariant, undoStep, redoStep } from './face.mjs';
