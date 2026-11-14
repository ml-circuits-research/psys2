# 09 — Documents: one tab, the editor with the composition and the summary (world `docs.editor`)

Status: rewritten at the tab cut of 2026-11-15 (`specs/decisions/ADR-010-tab-cut.md`). The document-analysis world `docs.reader` (files added to the page, entities, events, search, read aloud, the Hansel and Gretel sample, PDF.js and mammoth) and its tab were removed; the specification of it stays in git history (tag `pre-tab-cut`, `specs/09-documents.md` at that tag).

## 1. One Documents tab
The tab id is `editor` and its title is "Documents" (`docs/webchat/ui/tabs/editor.mjs`; "documents", "docs", "document", "doc" and "editor" all name it for `ui.shell`). The world is `docs.editor` (spec 07, section 3 and `specs/21-acts-and-schemas.md`): a TipTap page that is edited by talking. The page is read-only; every change is a command (mouse and voice share one language layer).

## 2. What the Documents world adds to the editor (moved from `docs.reader`)
- **Composition** (`doc.compose`, `worlds/docs.editor/textgen.mjs`): "write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words", "write a short story", "make a presentation about the moon with 5 sections", "write a scientific article about bees, 3 chapters", "write a composition about anything". The words and the numbers are read by the patterns of `worlds/docs.editor/patterns.extra.sop` (lexicons `lex.docs.editor.doctypes`, `.compkinds`, `.anything`). The text is written by the library's `std.compose` (spec 26); the result REPLACES the open document (undo takes it back, like any `doc.make`): the title, a heading per chapter and subchapter and a paragraph per subchapter whose `from` lists the wires the claims were made from. Without the library: "I cannot write compositions yet: the library has no composer (std.compose) in this build."
- **Summary** (`doc.digest`): "summarize the following: <text>" summarises pasted text and "condense the document" the open document, by `std.summarize` (extractive, k sentences, default 3). Without the library: "I cannot write summaries yet: ...".
- **The form and the button.** The Documents tab shows a "Summarise" button and a "Compose" form (type, topic, chapters, subchapters, size) only when the library has `std.summarize` / `std.compose` (`host.textGen()`); the form sends one of the commands above, so the form and the command are the same path.

## 3. Removed (and where it went)
- Adding .md, .txt, .pdf and .docx files, the entity index, events, dialogue, relations, TF-IDF and BM25 search, "read aloud" of a document, the sample text: removed with `docs.reader`. A document that comes from outside is a future decision (it would need its own approach).
- The animal-grouped "report" of the editor (`doc.report`, "write a report about sea animals") is superseded by the composition ("report" is one of its types).
