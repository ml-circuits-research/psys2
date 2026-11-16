// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor (spec 21): what the schema cannot say and other code needs from this world. The editor engine (editor.mjs) keeps the document; the schema reads the acts, the operations
// below are the families that have no act (dictation, reading aloud, export formats, statistics, documents built from other worlds) and the cross-world doors (doc.addHeading,
// doc.addList, doc.undo ... are called by other worlds through ctx.request).
export {
  initialState, summary, view, adopt, make as makeDocument, dictate, dictateStop, read, download, stats, mentions, isEmpty, whatIs, say, fromList, holdings, fillTable, whatSelected, checkTask, countTasks, listTasks,
  addHeading, addList, addParagraph, undo as docUndo, redo as docRedo,
} from './editor.mjs';
export { digest, compose } from './textgen.mjs';   // the summary and the composition (spec 26), from the library's std.summarize / std.compose
/** Spec 28: the tool primitives the request door runs (request.sop std.tool wires), the document's view and its own undo / redo (document.mjs). */
export { writeText, keepChapters, toolView, undoStep, redoStep } from './document.mjs';
