// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor: what the request door calls (spec 28 sections 11, 14), and nothing else. The tool primitives bound by request.sop's std.tool wires (a text written by the composer,
// its chapters kept to a count), the document's view and its own undo / redo (request.sop psys2.op). All of it is the document's (document.mjs); the editor's word operations
// (editor.mjs) are not reachable from here. scripts/glue-lint.mjs measures the glue from this file. Browser-safe.
export { writeText, keepChapters, removeText, toolView, undoStep, redoStep } from './document.mjs?v=e04d587f05';
