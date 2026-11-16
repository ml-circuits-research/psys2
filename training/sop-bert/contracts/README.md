# Training-only contract validator

`sopworld-0.188.0.mjs` is the published bundle from soplang-words-lib commit `27668e05149b277d656e1c5d302f161247b30322`, copied byte for byte with its MIT licence. `provenance.json` records its hash and source path. Its `std.request` module is version 0.183.0.

This separate validator makes the label codec and tests reproducible without relying on a changing sibling checkout or an installed npm dependency. It is not a replacement for PSys2's runtime vendor pin, is not included in the browser build, and does not authorize consuming incomplete phase-zero contracts in the application. The codec uses its public schema, parser and `inspectRequest` rather than duplicating logical-scope/selector validation.
