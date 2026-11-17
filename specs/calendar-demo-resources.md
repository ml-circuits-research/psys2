# Calendar demo resources and bookings

Owner decision, 2026-11-17: Calendar becomes a visible application area with personal calendars, managed rooms and time-bounded events. The same declared tools serve UI actions and future neural request execution. This extends the native contract in `29-calendar-host.md`; no sentence patterns or alternative reader are introduced.

## State and operations

`initialCalendarState()` returns `{calendars:[], people:[], rooms:[], meetings:[]}`. Older states without `calendars` load as an empty calendar list. Identities are unique across all four collections, and event references use identities, never display names.

| Record | Fields |
|---|---|
| Personal calendar | `id`, `label`, optional `colour` as a six-digit hex RGB string |
| Person | `id`, `label`; retained for participant references, not occupation knowledge |
| Room | `id`, `label`, optional integer `capacity >= 1`, optional `location` string |
| Event/booking | Existing `id`, `title`, integer Unix-millisecond `start`, positive integer millisecond `duration`, participant-id array, nullable room id; optional nullable personal-calendar id `calendar` and `notes` string |

Calendar resource operations are `calendar.calendar.add`, `.change`, `.remove`. Room and person operations retain their existing ids. Add requires identity and label; change requires identity and accepts any declared resource field. A referenced resource cannot be removed until its events are removed or reassigned. The existing `calendar.meeting.add`, `.change`, `.move`, `.remove` operations handle both personal events and room bookings. The UI resolves a local date/time to an explicit numeric timestamp before calling a tool.

On `calendar.room.change`, explicit `capacity:null` or `location:null` removes that optional field. Omission keeps the stored value; room creation still requires a valid typed value when a field is supplied. Clearing optional metadata therefore changes the observed state instead of silently retaining stale values.

An event needs at least one resource: a personal calendar, a room or a participant. A personal event or room-only reservation therefore does not require inventing a person. Omission of the existing required nullable `room` field remains distinct from explicit null. Event `calendar` and `notes` are optional for backward compatibility. Unknown fields and invalid references refuse atomically.

## Scheduling policy and observation

The native store remains able to represent overlapping bookings; policy belongs to the declared world. The application supplies `scheduling-policy.sop` through `createCalendarHost({policySource})`, or its existing validator. The policy projects one half-open interval per event/resource: participant, room and personal calendar. Distinct events sharing a resource may not overlap; an event ending exactly when another starts is allowed. Separate resources can be occupied at the same time. The supplied optional custom validator runs only after this policy succeeds.

`observe()` exposes every calendar, person, room and event with its native identity, source type and all stored fields. Calendar colour, room metadata, notes and calendar association participate in before/after comparison. No successful invocation alone is a claim that the user's intended request was satisfied. Existing transaction versions, replay protection and conditional undo remain unchanged. UI journal undo is coordinated by the application, while the standalone primitive also retains its native last-change undo.

No occupation/role field, external account, recurring event expansion, invitation sending or remote calendar synchronization is promised by this demo. Natural utterances about those unavailable capabilities must not be relabeled as supported actions during training review.
