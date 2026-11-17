# Local BERT tokenizer host

`bert-tokenizer.mjs` exports only the installed Transformers.js 3.8.1
BertTokenizer constructor (Apache-2.0, https://github.com/huggingface/transformers.js).
Bundled dependencies include @huggingface/jinja 0.5.11 (MIT,
https://github.com/huggingface/huggingface.js) and onnxruntime-common 1.21.0
Tensor storage (MIT, https://github.com/microsoft/onnxruntime). Licence texts
are included alongside this file. These licences permit AGPL-3.0 distribution.

The build script retains actual tokenizer and Tensor implementation code,
replacing network loading and unused TensorOpRegistry with explicit refusals.
The backend provides actual onnxruntime-common Tensor storage only; it includes
no inference runtime, model, WASM or downloads. Runtime model inference uses the
separately vendored ORT Web 1.31.1. Chat-template code is incidental upstream
code and is not invoked by this host. No tokenizer normalization or role logic
is rewritten. The browser host applies the reviewed legacy BERT role adapter.

Build with `node scripts/build-browser-bert-tokenizer.mjs <installed Transformers
package> <existing esbuild lib/main.js> <output file>`. No new package is installed
or added to core dependencies. The adjacent input manifest records source SHA256
and bundler version; tests compare arrays and tensors to the actual full runtime.
