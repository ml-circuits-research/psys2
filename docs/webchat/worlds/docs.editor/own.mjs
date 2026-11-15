// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor (spec 21): what the schema cannot say and other code needs from this world. The editor engine (editor.mjs) keeps the document; the schema reads the acts, the operations
// below are the families that have no act (dictation, reading aloud, export formats, statistics, documents built from other worlds) and the cross-world doors (doc.addHeading,
// doc.addList, doc.undo ... are called by other worlds through ctx.request).
export {
  initialState, summary, view, adopt, make as makeDocument, dictate, dictateStop, read, download, stats, mentions, isEmpty, whatIs, say, fromList, holdings, fillTable, whatSelected, checkTask, countTasks, listTasks,
  addHeading, addList, addParagraph, undo as docUndo, redo as docRedo,
} from './editor.mjs?v=eb3053781e';
export { digest, compose } from './textgen.mjs?v=4075ef6182';   // the summary and the composition (spec 26), from the library's std.summarize / std.compose
/** Spec 28: a text as the goal of a request (the planner) and what a turn wrote (the check). */
export { planRequest, requestResult } from "./textgen.mjs?v=4075ef6182";
