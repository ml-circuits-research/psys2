# Auxiliary inventory model in the browser

`training/sop-bert/export-bootstrap.py` exports the shared encoder's candidate
logit and token start/end logits. It requires a named checkpoint SHA256 and a
frozen calibration file with that same checkpoint hash. It checks the hash again
before publishing into a new output directory. The existing output is never
replaced. Export compares FP32 ONNX outputs with PyTorch on paired inputs at two
batch sizes and sequence lengths, then reports the quantized model's numerical
difference. Numerical agreement does not measure graph reading or execution.

The model directory can be loaded with Transformers.js `AutoTokenizer` and
`AutoModel` (`dtype: 'q8'`). Its manifest records checkpoint, model, tokenizer,
calibration, exporter and run hashes. Quantized calibration remains false: the
training calibration belongs to the PyTorch weights, and quantized inference
needs its own calibration before any execution gate can depend on it.

`createInventoryBootstrapInference` takes the loaded tokenizer/model callables
and the manifest. `scoreFields(text, fields)` requires caller supplied concept,
key, phase, instance and candidate for each field. It reproduces the training
query format and returns the conditioning alongside score and span logits. It
refuses an encoded pair exceeding the training maximum length; it does not
truncate. Token logits remain unaligned proposals, with no invented source spans.

This model predicts neither field instances nor graph topology. Every result
therefore has no request candidates, incomplete coverage, unresolved topology,
and `executable: false`. `propose(text)` returns an explicit graph proposal gap.
A general learned graph/instance proposer is still required for a primary SOP
reader. Neither gold field instances nor the symbolic grammar may be used to
hide that gap. Router configuration, side by side execution evaluation and
verified replies are separate from this auxiliary inference adapter.

The optional real-artifact test runs with `SOP_BOOTSTRAP_MODEL_DIR` pointing to
the exported directory and `SOP_TRANSFORMERS_RUNTIME` pointing to the installed
Transformers.js module. Run
`node --test tests/inventory-bootstrap-inference.test.mjs` with both variables.
It verifies exported model/tokenizer hashes, loads only local files, and exercises
the actual pair-tokenizer and q8 model. Transformers.js pairs use the `text_pair`
option; Python's positional pair API must not be copied into JavaScript.
Absent those variables, the artifact test is explicitly skipped. This is a
Node CPU runtime check of the browser library, not a browser deployment test.
The frozen training calibration used CUDA autocast bfloat16; it certifies neither
CPU FP32 nor browser q8 decisions.
