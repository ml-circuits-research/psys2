# Expected-result references

The example-only **Expected** main tab has three subtabs: **Drawing** shows the final expected diagram, **SOP Lang** shows that final state serialized as SOP, and **Text** contains only the natural-language requests, separated by blank lines. The drawing retains the normal zoom, pan, fit, and names controls. It never uses a live reader prediction as the expected answer. The display is independent of all four reader drawings.

Coverage: all 35 menu scenarios (1,126 messages) and the 13 quick examples. `manual.json` contains the fixed, reviewed references for the original 11 scenarios and quick examples. Their initial draft came from Rules and was inspected against each existing message. These are display references, not new training data. The other 24 scenarios use the existing annotated scene messages, matched by exact text.

Rebuild the exported `reference.json` from the repository root:

```sh
node training/sketch/build_example_reference.mjs
node --test training/sketch/test_example_reference.mjs
```

The exporter rejects missing or stale message associations, preserves explicit dimensions and literals, and expands annotated mention references into SOP nodes. Unspecified resize amounts use stated preview factors. The known incomplete size-comparison annotation in Robot factory is marked, and the qualification remains visible in subsequent previews. Existing annotations remain reviewable; successful replay establishes engine compatibility, not annotation truth.

Scenarios preview from an isolated empty drawing. Their opening clear is a no-op when that preview is already empty. Quick examples use a snapshot of the selected reader's drawing before the request. Name-clash renamings are applied to both the request and its saved SOP. Wire identities remain intact. An engine error or a missing reference prevents a complete-looking drawing from being shown. Custom/edited English scripts do not receive invented references; explicit SOP can be replayed directly.

The reference is an execution illustration. It is not a reader score: resolving context and choosing layout defaults belong to the symbolic executor, beyond faithful text-to-frame formalization.

Browser verification runs in local Chrome with actual models over both `file://` and HTTP. It covers all 35 scenarios and 13 quick examples, plain request text, final drawings, view controls, reader isolation, keyboard navigation, regular-message dismissal, and phone layout. Run `npm test --prefix tools/file-build` after building the file snapshot. This is a UI check, not a model evaluation.
