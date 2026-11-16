# Licences of vendored code in src/

## sopworld 0.164.0 (one file, unmodified)

- Source: https://github.com/ml-circuits-research/soplang-words-lib (same owner as this repository)
- Pinned commit: `714239e` (its `docs/version.md`: version 0.164.0, build `2b437de097a8`, built 2026-11-16). The library makes no tags: it is vendored from its `main` at a commit hash.
- Vendored file: `src/vendor/sopworld/sopworld.mjs`, the library's built single file `docs/sopworld.mjs` (1352426 bytes, sha256 `593e3157b5ca519bdadfe85cd067dd15111cc6b60b80b88487973cc393801c19`), copied byte for byte. Never patch it here: a workaround goes into `src/reasoner/` and a defect into the list of library issues in `worker-log.md`.
- `src/vendor/sopworld/tools/scan-loops.mjs`: the library's own loop scanner (`tools/scan-loops.mjs`), copied byte for byte; `tests/reasoner.test.mjs` runs it on the vendored file.
- Licence: MIT (below). Compatible with AGPL-3.0-only.
- Runs offline: nothing is fetched at run time. Loaded lazily (`import('../vendor/sopworld/sopworld.mjs')`) only when the Reasoner setting is `matrix`.
- `src/vendor/sopworld/tools/build-bundle.mjs` and `src/vendor/sopworld/src/knowledge.mjs`: the library's `tools/build-bundle.mjs` and `src/knowledge.mjs`, byte for byte (the second is the one module the first imports, so the offline bundle generator runs unmodified: `node src/vendor/sopworld/tools/build-bundle.mjs <catalog dir> <out.json> <word|shard|world> ...`).
- Earlier pins: 0.163.0 at `a678103` (build `5cf3866340d8`), 0.162.0 at `78863d3` (build `f4552dc8f11d`), 0.161.0 at `8a2f592` (build `5aa3d4c2373c`), 0.160.0 at `432ddc3` (build `291f9a379713`), 0.159.0 at `0494e60` (build `e4ea2b61f757`), 0.158.0 at `4800ddc` (build `5016abb0f004`), 0.157.0 at `8e5edeb` (build `9ba5444c607e`), 0.156.0 at `6f8f145` (build `271cb690cbfb`), 0.155.0 at `48b9ae7` (build `2900021fe2e4`), 0.154.0 at `4c3a987` (build `90ce9a799330`), 0.152.1 at `da024e3` (build `bd462d623804`), 0.151.0 at `421f13b` (build `29bf05310cc5`), 0.150.0 at `4bf5814` (build `e30d6a7b8884`), 0.148.0 at `598e2ca` (build `fe4d3c943918`), 0.147.0 at `6b5b074` (build `7f4faeeefb80`), 0.146.0 at `f515e06` (build `983bbdf18a01`), 0.136.0 at `39a212f` (build `c6e1d3f01bff`), 0.129.0 at `0797f91` (build `6aa9350ce66f`), 0.121.0 at `40d1d82` (build `51b8cbd957b8`), 0.118.0 at `7955c4f` (build `2b68b616070f`), 0.114.0 at `85c6032` (build `6b02aef2b871`), 0.113.0 at `80e0137` (build `7bafaf2c0cdd`), 0.104.0 at `bb3f8eb` (build `4cae410c7f15`), 0.103.0 at `86c22f1` (build `a1fdacb1f255`), 0.97.0 at `04fc35e` (build `a7e78da88c45`), 0.94.0 at `340ac05` (build `822b247880d3`), 0.89.0 at `251e769` (build `ef2e8f950b5c`), 0.84.0 at `c7b032c` (build `b812638ad76d`), 0.80.0 at `ed8d808` (build `9b8336612971`), 0.75.0 at `4e6ed1f` (build `ed9bac68fbf9`), 0.72.0 at `a24d64b` (build `b1f22465774d`), 0.71.0 at `91f9f2b` (build `8cdaddc2b16b`), 0.65.0 at `3d68ee5` (build `e6a9bf96ca14`), 0.62.0 at `e526a6a` (build `673c2175e802`), 0.61.0 at `23adfb8`, 0.60.0 at `2d0b563`, 0.59.0 at `494a5dd` (build `baf0100991f6`), 0.58.0 at `5975153` (not vendored), 0.57.0 at `4a66344` (build `cc066b639eaa`), 0.56.0 at `1d1c3c6` (build `dd893aeaf6c0`), 0.55.0 at `02f37c1` (build `ba4e730aa89e`), 0.54.0 at `919d20d` (build `b0e6cba3be8b`), 0.40.0 at `4935c22` (build `64c571d66535`), 0.39.0 at `4e88834` (build `df4bd5deeaf6`), 0.38.0 at `3e08856` (build `b38437759b39`), 0.35.0 at `c79ad5e` (build `2d4a1d0ce95d`), 0.29.0 at `d1f8121` (build `1f23ee172960`), 0.24.0 at `f726471` (build `ef15b5ca97ff`), 0.23.0 at `8b763ad` (build `2c7044be7436`), 0.18.0 at `b5c7f3d` (build `12dd5cde48d6`), 0.17.0 at `551c45b` (build `dd4835245b48`), 0.16.0 at `1e18f1d` (build `d41d73a9301a`), 0.15.0 at `782cd0c` (build `694081ad7e6f`), 0.14.0 at `c7247e2` (build `ab7bc4ec2db6`), 0.13.1 at `e586ac5` (build `19d76bd21ca5`), 0.13.0 at `8b9a46b` (build `691f31c95a06`), 0.12.0 at `7a49329` (build `a4ae897bf038`), 0.9.0 at `f062052` (build `807d8bde76f3`), 0.7.1 at `93362d7` (build `08e2627de8d4`), 0.6.1 at `775dfe7cd468fab8e4a48fb6dd9ca83e3414c576` (build `c034e3804d4e`), 0.4.0 at `a7a8e1669c8a74fba5225a28186d6d83a14d457a` (SOPWORLD-1 stage 1).
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
