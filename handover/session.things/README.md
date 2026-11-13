# session.things -> sopworld `std.things`

**What it is.** The session-wide registry of things shared by all tab worlds: one thing, many views. A thing has aspects (visual, spatial, relational, numeric,
textual, geographic, temporal); a view (a tab) syncs its items into the registry (`sync`), another view shows them (`show`, `whyNot`), and phrases find things
across views (`find`, `select`, `viewByWords`). `view.mjs` adds the generic view operations to any acts-based world (`withView`, `viewOps`: adopt, view).

**API.** `fn/things.mjs`: `ensure`, `aspectsOf`, `aspectOfAttr`, `sync`, `find`, `whyNot`, `viewByWords`, `viewByWord`, `select`, `labelOf`, `ASPECTS`,
`ASPECT_WORDS`. `fn/ops.mjs`: `initialState`, `learn`, `sync`, `show`, `list`. `fn/view.mjs`: `withView(schema, ns, hooks)`, `viewOps(X, schema, ns, H)`.
`sop/`: legend, lexicon, operations, patterns, templates (the English commands "show it in the diagram", "what things do I have").

**Host dependencies.** The list of views (tabs) and their item shapes come from the host; kind -> aspect mapping (`ATTR_ASPECT_TEMPORARY`, `TYPE_ASPECT`) is a
general table that should be read from k.attributes; `view.mjs` depends on `std.acts` executor hooks (hand over together with acts).

**Tests to carry.** `tests/things.test.mjs`, `sop/tests.sop`.

**Host keeps.** Which tabs exist and the adapter that turns a tab's items into `sync` input; the English patterns if the library keeps patterns language-keyed.

**General lines still in PSys2:** 263 SOP, 460 code.
