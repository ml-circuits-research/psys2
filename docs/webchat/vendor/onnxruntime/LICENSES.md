# onnxruntime-web (vendored)

- Library: ONNX Runtime Web, version 1.31.1 (npm package `onnxruntime-web`, https://github.com/microsoft/onnxruntime).
- Files: `ort.wasm.bundle.min.mjs` (the package's `dist/ort.wasm.bundle.min.mjs`, header comment added), `ort-wasm-simd-threaded.mjs` (its Emscripten loader,
  imported at run time from the same folder) and `ort-wasm-simd-threaded.wasm` (CPU execution provider only, no JSEP/WebGPU). Otherwise unmodified.
- Built/obtained with: `npm i onnxruntime-web@1.31.1` in a scratch directory (not added to the repository's package.json).
- Licence: MIT, Copyright (c) Microsoft Corporation. Compatible with the project's AGPL-3.0.

```
MIT License

Copyright (c) Microsoft Corporation

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

The WebAssembly binary also contains third-party components of ONNX Runtime (for example Eigen, protobuf, abseil, re2, flatbuffers, GSL, MLAS), all under permissive licences (MIT, BSD, Apache-2.0, MPL-2.0); see https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt.
