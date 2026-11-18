# Source-cut request composition

`app.request.composition` is an operational SOP policy. It schedules independently validated source cuts in source order, preserves explicit dependencies, and retains one turn undo group. Source order is a scheduling policy, not an inferred causal relationship.

The verified reader exposes `proposeRequests(text)`. It validates the actual cutter output once and refreshes the actual world context for each request-local proposal after the preceding result. Every request uses the existing single-request projection, admission and tool effect verification. Source offsets remain in the original full utterance; diagnostics, uncertainty and unexecuted proposals remain attached to each step. Mixed results remain partial and do not claim all requested effects.

The original single-proposal API and explicit graph dependency checks remain unchanged. This mechanism does not split text on conjunctions, rewrite elided verbs, manufacture missing model targets or repair a cutter that emits one span for a multi-target request. Repeated target membership and inherited-act reasoning require their own declared or learned structure.

The iterator validates the source-only cutter once, then calls the request reader once for each actual cut. It does not first read the entire batch and discard those neural results. Every emitted proposal records its original source range. The worker records actual coordinated-reader boundaries and request-local proposal events; operational policy reads emit their real declaration/fact identities on the same activity bus. Timing the coordinated boundary includes time between successive yields (including execution), while per-request diagnostics preserve the finer neural evidence.

A mixed reply identifies an unapplied cut by quoting its Unicode source range. The step trace retains the original diagnostic. When any cut changes a world, the reply carries the final state of the turn even if its last cut failed.
