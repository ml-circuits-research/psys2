# Licences of vendored code in src/

## sopworld 0.4.0 (one file, unmodified)

- Source: https://github.com/ml-circuits-research/soplang-words-lib (same owner as this repository)
- Pinned commit: `a7a8e1669c8a74fba5225a28186d6d83a14d457a` (the 0.5.0 tag did not exist yet; `package.json` of that commit says 0.4.0). The library's main was checked again at `1116af44446c9ddcb50474b44a657f5b55b78ea3` (2026-11-10): only `worker-tasks.md` changed since, so the built file is byte for byte the same. Re-vendor at 0.5.0 later
- Vendored file: `src/vendor/sopworld/sopworld.mjs`, the library's built single file `docs/sopworld.mjs` (195858 bytes, 55167 bytes gzip, sha256 `7c6a53ac2648ca0b6751a90f37bc61a2597bef8b357efc158ce51d038958dce1`), copied byte for byte. Never patch it here: a workaround goes into `src/reasoner/` and a defect into the list of library issues in `worker-log.md`.
- `src/vendor/sopworld/tools/scan-loops.mjs`: the library's own loop scanner (`tools/scan-loops.mjs`), copied byte for byte; `tests/reasoner.test.mjs` runs it on the vendored file.
- Licence: MIT (below). Compatible with AGPL-3.0-only.
- Runs offline: nothing is fetched at run time. Loaded lazily (`import('../vendor/sopworld/sopworld.mjs')`) only when the Reasoner setting is `matrix`.
- To update: copy the new `docs/sopworld.mjs` from a pinned commit, change this entry (commit, size, sha256), run `npm test`, the parity gates in `worker-log.md` (SOPWORLD-1) and `node scripts/build-webchat.mjs`.

```text
MIT License

Copyright (c) 2026 ml-circuits-research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
