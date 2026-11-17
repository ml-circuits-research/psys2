# Actual Chromium reader route smoke

The C1-only harness opens the normal unmodified application page and its normal
engine worker, using Chromium CDP over Node's built-in WebSocket. No dependencies,
production debug hooks, reader overrides or admission reports are installed.
`openBrowserReaderRoute({root,url})` returns info/logs, send({text,state,meta}) and
close(). Optional supplied state loads only declared world IDs and the declared
tab join before restoring; unchanged compares actual worker snapshots, not the
caller subset. The same adapter supports matrix/owner browser-route replays.

A fresh workspace-only profile uses bounded16MiB disk/1MiB media caches, disabled
GPU/background networking/extensions and a localhost static server. It removes
its own profile on close and never touches normal user browser data. Console,
worker errors and file requests are bounded to2000 entries each. Model and WASM
requests retain path/status/bytes; actual route reply records reader status,
neural diagnostic count, provenance/admission and effects. No neural correctness
or calibration is inferred from successful loading.

Run `node scripts/smoke-browser-reader.mjs --root docs/webchat --out <workspace
report.json>`. A closed-route smoke requires ready reader, actual neural
diagnostics, selected=null/eligible=false, no effects and unchanged state.
Two pure fixtures cover evidence checks and CDP identities/errors. Actual browser
run requires PSys's completed app build/deployment assets and is recorded separately.

Actual first smoke fetched all three q8 graphs but offset authority refused the
minified tokenizer constructor names. The preserved report shows no effects.
After keepNames fix (authority unchanged), actual rerun passed all five checks:
reader ready, two actual neural diagnostic records, missing-calibration gate
closed, effects empty, and actual worker state unchanged. All three q8 graphs
and14,848,852B ORT Web WASM returned200; console/worker error records were empty.
The model produced one complete graph candidate, which was NOT selected for
execution because no calibration report was installed. This is browser route
computation/no-effect evidence, not semantic correctness or cohort calibration.
`browser-reader-smoke-evidence.json` retains compact provenance and full report
hashes. Both profiles closed and were removed before matrix/owner replay handoff.
