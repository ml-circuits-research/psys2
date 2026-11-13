## Q-H3 (hand-over from PSys2, 2026-11-13): the shared things registry and views as `std.things`

Question: will the library take `handover/session.things/` as `std.things` (one thing across views, aspects, sync, show, find)?
Context: it is the host-independent half of "one name, one thing across worlds": every tab world syncs its items; `aspectsOf` says what a thing can be seen as
(a picture, a place, links, a number, text, a map spot, a time) and `whyNot` says why a thing cannot be shown in a view. It needs `std.acts` (the executor
hooks) and the catalog (`std.knowledge`) for the kind -> aspect table.
Options: (a) one module `std.things` with the registry as wires (`std.things.thing`, `std.things.view`) and the operations as standard functions;
(b) fold into `std.acts` as its `send` / `copy` acts. PSys2 prefers (a): the registry also serves worlds that have no acts.
Blocking: no. Meanwhile: PSys2 keeps its bridge.
