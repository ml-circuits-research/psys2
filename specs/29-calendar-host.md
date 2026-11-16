# Calendar host foundation

This implements the independent host-tool preparation ordered in worker-tasks (16 November, 14:30), against book sections 6.8.2, 6.9, 7.4 and 8.6. It is not the conversational calendar world: the shared phase-zero contracts, complete domain declaration, routing and calendar work-area registration are still pending. The existing `time.calendar` clock/arithmetic reader is unchanged.

`worlds/time.calendar/calendar-tool.mjs` exports `createCalendar({instanceId, people, rooms, meetings})`. This browser-safe local tool owns an in-memory state. Inputs and observations are copied, so callers cannot mutate the state without an operation. Instance identity is supplied by the host and must be fresh for each new tool lifetime. State versions increase monotonically within that lifetime, including undo. Recreating a tool starts at version zero: the caller must not reuse an old instance identity, even if it loads the same meeting values, because old observation versions and operation receipts belong to the previous lifetime. Restoration across process restarts is not implemented by this foundation; a future persistence layer must restore the version and receipt/history state together or assign a fresh identity.

| Record | Fields |
| --- | --- |
| Person or room | `id`, `label`; identities are distinct across all record kinds. |
| Meeting | `id`, `title`, `start` (integer Unix milliseconds), `duration` (positive integer milliseconds), `participants` (nonempty unique person identities), `room` (room identity or explicit `null`). |

Absolute instants are resolved before calling the tool. It does not parse dates, assume a timezone, expand recurring series, choose rooms or find free slots. The planner must supply those decisions. The tool rejects missing resource references, invalid intervals and overlap on a shared participant or room. Intervals are half-open: one meeting ending exactly at the next start is valid. These integrity checks enforce the host's stored state; they do not replace the planner's declared constraints or prove external availability. Observation completeness refers only to this entire local store, never to a remote calendar or an unexpanded recurrence.

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

Tests exercise arbitrary identities and resources, conflict and boundary behavior, stale updates, idempotent replay, removal integrity, all operation families' undo, isolation of observations, and HTML escaping. They establish host behavior, not owner-session language acceptance. No existing conversational case is claimed as solved by these primitives alone.

The generated system-map validation must be reproducible. Its owner-log measurement uses a fixed pseudorandom sequence and clock while generating the report, and restores the host's original `Math.random` and `Date` in `finally`. This fixes the existing generator's changing operation maximum without changing runtime behavior or weakening the generated-file equality test. Wall-clock performance measurement remains real.
