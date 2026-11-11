# Licences of vendored code in src/

## sopworld 0.7.1 (one file, unmodified)

- Source: https://github.com/ml-circuits-research/soplang-words-lib (same owner as this repository)
- Pinned commit: `93362d7` (its `docs/version.md`: version 0.7.1, build `08e2627de8d4`, built 2026-11-11). The library makes no tags: it is vendored from its `main` at a commit hash.
- Vendored file: `src/vendor/sopworld/sopworld.mjs`, the library's built single file `docs/sopworld.mjs` (330791 bytes, 93284 bytes gzip -9, sha256 `5452ebe3931d861768c01fc8db8c2914a8be8c3aa02e3879b556aaa32826e2db`), copied byte for byte. Never patch it here: a workaround goes into `src/reasoner/` and a defect into the list of library issues in `worker-log.md`.
- `src/vendor/sopworld/tools/scan-loops.mjs`: the library's own loop scanner (`tools/scan-loops.mjs`), copied byte for byte; `tests/reasoner.test.mjs` runs it on the vendored file.
- Licence: MIT (below). Compatible with AGPL-3.0-only.
- Runs offline: nothing is fetched at run time. Loaded lazily (`import('../vendor/sopworld/sopworld.mjs')`) only when the Reasoner setting is `matrix`.
- Earlier pins: 0.6.1 at `775dfe7cd468fab8e4a48fb6dd9ca83e3414c576` (build `c034e3804d4e`), 0.4.0 at `a7a8e1669c8a74fba5225a28186d6d83a14d457a` (SOPWORLD-1 stage 1).
- To update: copy the new `docs/sopworld.mjs` from a pinned commit, change this entry (commit, version, build, size, sha256), run `npm test`, the parity gates in `worker-log.md` (SOPWORLD-1, SOPWORLD-1b) and `node scripts/build-webchat.mjs`.

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
