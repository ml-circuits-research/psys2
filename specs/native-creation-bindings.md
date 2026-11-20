# Native creation bindings

A recognized canonical kind identifies a semantic family; it does not establish that the native primitive constructor accepts its lexical name. Creation dispatch joins the canonical binding to the actual native family's `on` type and constructor declarations.

The primitive constructor remains preferred when its declared `kind` enumeration accepts the bound lemma. A compatible constructor may instead declare `knowledgeInputs`: each input names a native argument and a knowledge service. The same preparation mechanism loads these inputs for UI controls and interpreted requests. It uses the bound lexical identity, not a suffix guessed from the canonical identifier. A requested object name cannot overwrite a knowledge-query argument.

Coordinates, dimensions and placement are omitted when absent from the request; the selected native tool supplies its existing defaults. No sentence or object-name dispatch table is introduced. Knowledge lookup and the actual tool invocation publish observed activity events; observer failures cannot alter execution.

Dispatch verifies observable effects against its concrete control intent. Its trace retains that intent, verification status and rejected constructor alternatives. Missing family bindings, incompatible native enumerations and missing required arguments are reported as native binding gaps, separately from reader failures. Missing knowledge services report knowledge preparation failure and leave the scene unchanged.

The reader-routing diagnostic retains the original provider candidate array before contextual or creation projection. It never synthesizes a SOP proposal from incomplete decoded fields for display.

## Creation grounding over the whole catalogue

When the reader's structure for a single `make` request is incomplete, `src/dialog/project-create-action.mjs` grounds the stated noun (the kind word, or a `kind`/`shape` entry, or, when neither is stated, a coextensive `part_kind` entry: `worlds/app.project/creation-policy.sop`) against every published constructor lemma of the area through the declared `std.ground` policy: exact identity costs 0 and outranks spelling repairs and longer catalogue names ("lake" before "mountain lake", "fish" before "catfish"); the reader's target type is only a later criterion. The ranked alternatives stay in the trace and the reply offers undo. `src/dialog/lexical-grounding.mjs` keeps each library grounding request inside its wire budget by grounding in batches: every candidate admitted in a batch is carried, under its original identity, into the next one, so the final request ranks exactly the admitted set one unbounded request would.

## Reader context as a prior

The reader sees the previous message and the observed objects. When the reading conditioned on them stays unusable after the projections above, `src/dialog/reader-routing.mjs` asks the provider for the same text read without the previous message (`proposeIndependent`), then also without the observed objects (`proposeLiteral`), and routes the first usable reading. Every attempt is kept in `readerRouting.contextRetry` and a supported reply says the message was read on its own. A turn without effect leaves the area state, undo history and last action unchanged.

## Operational execution policy

`worlds/app.project/execution-policy.sop` owns omitted-argument defaults and knowledge-value lookup descriptors. `src/dialog/execution-policy.mjs` queries those actual facts; the execution adapter has no operation-to-default or concept-to-source map. Explicit arguments override defaults, including explicit null/empty values. Duplicate parameter defaults or competing sources are errors. The declared `clock.now` host primitive supplies the current timestamp only when the policy requests it for a missing argument. Default notices are facts, so the trace/reply reports the actual assumptions.

Worlds shows the exact source/matrix/facts and the actual loaded state without initializing a lazy policy solely for inspection. Moving these decisions into SOP does not claim that native editor state, geometry, tool handlers or the remainder of request execution are already governed by declarative reasoning.
