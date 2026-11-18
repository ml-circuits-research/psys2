# Read-only catalog source inspection

`worldSources` accepts a catalog world node ID or an exact declared source node ID. The worker resolves IDs against the active pinned catalog index; callers cannot supply file paths. Only published `.sop` schemas and shards are eligible. JSON manifests remain catalog metadata.

Inspection reads raw source through the actual layered catalog source. It does not compile a world, call the knowledge fact parser, run reasoning or invoke a native tool. Actual read events carry `purpose="inspection"`; source records retain runtime and inspection read purposes separately. Reading bytes for inspection does not activate a world in reasoning.

Each page returns at most eight files and two MiB of complete text, with source paths, continuation offset and explicit errors. Files are never summarized, rewritten or partially truncated. An oversized individual source request fails explicitly. Responses declare `inspectionOnly=true`, `runtimeUseStatus="unchanged"` and `compiledByInspection=false`.
