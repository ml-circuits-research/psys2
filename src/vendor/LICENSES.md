# Licences of vendored code in src/

## sopworld 0.35.0 (one file, unmodified)

- Source: https://github.com/ml-circuits-research/soplang-words-lib (same owner as this repository)
- Pinned commit: `c79ad5e` (its `docs/version.md`: version 0.35.0, build `2d4a1d0ce95d`, built 2026-11-14). The library makes no tags: it is vendored from its `main` at a commit hash.
- Vendored file: `src/vendor/sopworld/sopworld.mjs`, the library's built single file `docs/sopworld.mjs` (581113 bytes, sha256 `2b404886820332590f849b55ebfd04ecbba4d44479ac7c59cf67c257fa12bc9e`), copied byte for byte. Never patch it here: a workaround goes into `src/reasoner/` and a defect into the list of library issues in `worker-log.md`.
- `src/vendor/sopworld/tools/scan-loops.mjs`: the library's own loop scanner (`tools/scan-loops.mjs`), copied byte for byte; `tests/reasoner.test.mjs` runs it on the vendored file.
- Licence: MIT (below). Compatible with AGPL-3.0-only.
- Runs offline: nothing is fetched at run time. Loaded lazily (`import('../vendor/sopworld/sopworld.mjs')`) only when the Reasoner setting is `matrix`.
- `src/vendor/sopworld/tools/build-bundle.mjs` and `src/vendor/sopworld/src/knowledge.mjs`: the library's `tools/build-bundle.mjs` and `src/knowledge.mjs`, byte for byte (the second is the one module the first imports, so the offline bundle generator runs unmodified: `node src/vendor/sopworld/tools/build-bundle.mjs <catalog dir> <out.json> <word|shard|world> ...`).
- Earlier pins: 0.29.0 at `d1f8121` (build `1f23ee172960`), 0.24.0 at `f726471` (build `ef15b5ca97ff`), 0.23.0 at `8b763ad` (build `2c7044be7436`), 0.18.0 at `b5c7f3d` (build `12dd5cde48d6`), 0.17.0 at `551c45b` (build `dd4835245b48`), 0.16.0 at `1e18f1d` (build `d41d73a9301a`), 0.15.0 at `782cd0c` (build `694081ad7e6f`), 0.14.0 at `c7247e2` (build `ab7bc4ec2db6`), 0.13.1 at `e586ac5` (build `19d76bd21ca5`), 0.13.0 at `8b9a46b` (build `691f31c95a06`), 0.12.0 at `7a49329` (build `a4ae897bf038`), 0.9.0 at `f062052` (build `807d8bde76f3`), 0.7.1 at `93362d7` (build `08e2627de8d4`), 0.6.1 at `775dfe7cd468fab8e4a48fb6dd9ca83e3414c576` (build `c034e3804d4e`), 0.4.0 at `a7a8e1669c8a74fba5225a28186d6d83a14d457a` (SOPWORLD-1 stage 1).
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
