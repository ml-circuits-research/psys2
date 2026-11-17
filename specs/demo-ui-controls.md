# Demo application controls

Owner scope, 2026-11-17: the visible areas are Drawing, Diagram, Documents and Calendar. Charts are vector objects in the Diagram instance, not a separate tab. Its owning chart declarations remain reusable tools. Existing chart state migrates into diagram.sketch.chartTools.

Calendar exposes personal calendars (name, colour), managed rooms (name, seats, location), events and room reservations (title, start/end, personal calendar, room, notes). Times are displayed in the browser's local time zone and submitted as explicit Unix milliseconds. Day/week navigation, agenda and room occupancy all read the same native state. Dialog inputs are keyboard accessible. Overlapping shared resources are rejected by the loaded SOP scheduling policy; adjacent bookings are valid.

UI gestures call declared native operations through the engine worker. They do not turn button labels into sentences for the neural reader to rediscover. The same declared native host and policy serve recognized text requests. Changes enter the shared conditional undo journal. Local demo work is persisted in browser storage and restored before rendering. A stale tab or undeclared operation does not mutate another world's state.

Actual normal-page validation is scripts/smoke-demo-areas.mjs: resource creation, personal event, overlap refusal, adjacent room-only booking, edit/undo, chart creation as SVG in Diagram, shared node/chart state and persistence across reload. This validation does not claim arbitrary text interpretation works; reader accuracy is measured separately.
