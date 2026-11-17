# Demo application controls

Owner scope, 2026-11-17: the visible areas are Drawing, Diagram, Calendar, Documents and Avatar (permanent last tab). Charts are vector objects in the Diagram instance, not a separate tab. Its owning chart declarations remain reusable tools. Existing chart state migrates into diagram.sketch.chartTools.

Calendar exposes personal calendars (name, colour), managed rooms (name, seats, location), events and room reservations (title, start/end, personal calendar, room, notes). Times are displayed in the browser's local time zone and submitted as explicit Unix milliseconds. Day/week navigation, agenda and room occupancy all read the same native state. Resource and event forms live in a docked inspector; inputs are keyboard accessible. Overlapping shared resources are rejected by the loaded SOP scheduling policy; adjacent bookings are valid.

UI gestures call declared native operations through the engine worker. They do not turn button labels into sentences for the neural reader to rediscover. The same declared native host and policy serve recognized text requests. Changes enter the shared conditional undo journal. Local demo work is persisted in browser storage and restored before rendering. A stale tab or undeclared operation does not mutate another world's state.

Actual normal-page validation is scripts/smoke-demo-areas.mjs: resource creation, personal event, overlap refusal, adjacent room-only booking, edit/undo, chart creation as SVG in Diagram, shared node/chart state and persistence across reload. This validation does not claim arbitrary text interpretation works; reader accuracy is measured separately.

Desktop editors fill their available pane. Auxiliary controls occupy docked sidebars: Drawing catalog and object/part properties, Diagram groups and chart data, Calendar resources/event forms, Document block properties, and Avatar slots/variants/colour/size. Routine edits do not open modal dialogs. Scene selection, dragging, keyboard movement and direct text editing call declared typed controls. Avatar work is persisted alongside the other four instances.

Each declared UI control emits readable text and visible `app.control.intent` SOP wires into chat. The exact typed interpreter decodes those wires before invoking the tool. Browser-local training pairs retain expected arguments, actual before/after observations, receipt and effect verification; the header export downloads JSONL. This expected UI intent is distinct from the neural reader output, whose request wires are also shown for text turns.
