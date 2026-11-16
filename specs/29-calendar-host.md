# Calendar host foundation

This implements the independent host-tool preparation ordered in worker-tasks (16 November, 14:30), against book sections 6.8.2, 6.9, 7.4 and 8.6. It is not the conversational calendar world: the shared phase-zero contracts, complete domain declaration, routing and calendar work-area registration are still pending. The existing `time.calendar` clock/arithmetic reader is unchanged.

`worlds/time.calendar/calendar-tool.mjs` exports `createCalendar({instanceId, people, rooms, meetings})`. This browser-safe local tool owns an in-memory state. Inputs and observations are copied, so callers cannot mutate the state without an operation. Instance identity is supplied by the host and must be fresh for each new tool lifetime. State versions increase monotonically within that lifetime, including undo. Recreating a tool starts at version zero: the caller must not reuse an old instance identity, even if it loads the same meeting values, because old observation versions and operation receipts belong to the previous lifetime. Restoration across process restarts is not implemented by this foundation; a future persistence layer must restore the version and receipt/history state together or assign a fresh identity.

| Record | Fields |
| --- | --- |
| Person or room | `id`, `label`; identities are distinct across all record kinds. |
| Meeting | `id`, `title`, `start` (integer Unix milliseconds), `duration` (positive integer milliseconds), `participants` (nonempty unique person identities), `room` (room identity or explicit `null`). |

Absolute instants are resolved before calling the tool. It does not parse dates, assume a timezone, expand recurring series, choose rooms or find free slots. The planner must supply those decisions. The tool rejects missing resource references and malformed intervals, but preserves overlapping bookings as representable state. A no-overlap rule is a declared deny of the calendar world, evaluated on a candidate fork before execution and explained from that violation. It is not duplicated in the host: optional attendance or a resource with greater capacity can change the declared policy without changing tool code. Observation must also be able to describe an already double-booked calendar accurately. Structural checks do not establish scheduling policy or external availability. Observation completeness refers only to this entire local store, never to a remote calendar or an unexpanded recurrence.

`call({operationId, expectedVersion, operation, args})` accepts the following typed operations. Unknown fields and unsupported operations are rejected without effect. Person and room operations are configuration primitives, not language acts.

| Operation | Arguments and effect |
| --- | --- |
| `person.add`, `room.add` | A complete resource record. |
| `person.change`, `room.change` | `id` and replacement `label`. |
| `person.remove`, `room.remove` | `id`; a referenced resource cannot be removed. |
| `meeting.add` | A complete meeting record. |
| `meeting.change` | `id` and one or more replacement meeting fields. Resource sets are replaced as a whole. |
| `meeting.move` | `id`, `start`; duration and resources are retained. |
| `meeting.remove` | `id`. |
| `undo` | `operationId` of the latest still-applied change. Its exact prior state is restored under a new version. |

A successful response contains `status=executed`, operation identity, before/after versions and an observation of the actual state after mutation. Failed calls contain `status=refused`, the unchanged version and a machine-readable issue. No natural-language reply is emitted. Repeating a successful command with the same operation identity and identical typed payload returns the original receipt without another mutation; `currentVersion` identifies whether the receipt is historical. Reusing the identity with another payload is refused. Stale expected versions prevent lost updates. No-op changes are refused without history or version changes.

Undo is conditional and last-change-only. A new independent edit prevents undoing an older operation directly. Undo of the latest edit first permits undo of its predecessor under the new version; it does not restore an old version number. A repeated original operation after its undo remains a receipt replay, not a fresh execution. There is no redo API in this foundation.

`observe()` returns `{instanceId, version, complete, timeUnit, timeOrigin, facts}`. Each fact has `id`, `kind` (`person`, `room`, `meeting`) and the record fields. This follows the existing host `toolView` record style; these are observation records, not a new SOP wire schema. The later domain adapter maps these records to shared contracts with declared identity and provenance. `calendar-view.mjs` renders this observation as an escaped HTML table with UTC start/end, participants and rooms. It reads no request text, changes no state, and is ready for the future calendar work-area mount.

Tests exercise arbitrary identities and resources, overlapping observations without an embedded scheduling policy, stale updates, idempotent replay, removal integrity, all operation families' undo, isolation of observations, and HTML escaping. They establish host behavior, not owner-session language acceptance. No existing conversational case is claimed as solved by these primitives alone.

The generated system-map validation must be reproducible. Its owner-log measurement uses a fixed pseudorandom sequence and clock while generating the report, and restores the host's original `Math.random` and `Date` in `finally`. This fixes the existing generator's changing operation maximum without changing runtime behavior or weakening the generated-file equality test. Wall-clock performance measurement remains real.

## Comparing observations and operation receipts

`calendar-observation.mjs` is a pure host adapter over the native records above. It is not a SOP observation/change/trace binding or a conversational reply mechanism. `calendarObservationIssue` validates this local observation envelope using the same structural checks as the store. A partial observation is insufficient for this comparison: a missing meeting in a partial read must never become a reported removal. The complete flag covers only the local store, not all external calendars or recurrence instances.

`compareCalendarObservations(before, after)` requires complete valid observations from the same lifetime instance, in nondecreasing version order. It matches records by native identity, never title or label. It returns copied added/removed/changed records and the names of changed fields. Fact order and participant-set order are immaterial. A source changing kind under an identity is visible as a kind change, rather than silently merged by label. Different instances, stale reads, missing observations and incomplete reads return `unknown`; conflicting values at the same version return `inconsistent`.

The result keeps both source identities, versions and completeness flags. `stateEqual` describes values, while `versionChanged` describes history: adding then undoing a meeting can restore exactly the same values at a newer version. Consequently equal snapshots do not prove that no operations happened between them. The adapter never modifies its inputs or calls a tool.

`compareCalendarReceipt({before, receipt, after})` also requires an independently supplied post-read. A successful invocation acknowledgement alone does not confirm the observed effect. The receipt must identify the same instance, a one-version transition, and its complete stored post-observation. That observation is compared with the supplied current read, not treated as a replacement for it.

| Status | Evidence and limits |
| --- | --- |
| `confirmed` | A fresh receipt matches the baseline version, its post-state matches the independent read at the receipt's version, and a change is observed. This establishes consistency of these trusted local records, not cryptographic proof of causality. |
| `receipt_replay` | The tool returned a historical receipt at its original version, and the surrounding reads are unchanged. `newExecution` is false. |
| `historical` | The current read is newer than the receipt's post-state. Its differences remain available, but the receipt does not establish the present effect. Concurrent edits or undo may have changed it. |
| `not_executed` | A refusal from this instance has a version within the supplied read interval. The attached comparison still exposes any independent concurrent changes; the status does not mean the entire store stayed unchanged. |
| `unknown` / `inconsistent` | Missing, partial, mismatched, stale or contradictory evidence prevents confirmation. The reason and available comparisons remain explicit. |

A replay receipt can report a `currentVersion` later than its stored post-observation. A post-read older than that version is rejected as stale even when its values match the historical receipt. No current-effect claim is made by looking only at the replay's old observation. The adapter does not infer intent satisfaction, scheduling policy, external coverage or successful reply wording. Those require the complete declared world and published shared contracts before the calendar vertical slice can be connected.
