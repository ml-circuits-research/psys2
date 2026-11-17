# Actual eight-case tokenizer parity

The bounded diagnostic compares actual Transformers.js 3.8.1 and Python
AutoTokenizer 5.22.2 inputs on the frozen eight source/context examples.
It imports the actual host's `bertRuntimeConfiguration`, actual key context
serializer and verified source-offset authority; it supplies no gold labels
and invokes no neural model or GPU.

All 18 tokenization entries match: context UTF-8 bytes, full and length-192
padded IDs/masks, sequence/special roles, and source Unicode-scalar offsets.
Entries cover eight cutter messages and the union of independently predicted
Node/Python cuts plus full-message controls. One recorded cutter disagreement
remains: calendar-b01-0022 has Node cuts [0,3),[4,20) and Python [0,20), despite
identical cutter feeds. These inputs provide a backend numeric handoff; they
provide no semantic accuracy, calibration or admission evidence.

The small summary records SHA256 for the full external reports and identical
feed arrays under `.session-control/review23-eight-tokenizer-parity-v1`.
The report records exact source/runtime/tokenizer hashes and the original
verified runtime-inventory receipt. This diagnostic rechecks direct runtime
and source files, rather than independently rehashing that entire inventory.

Run the pure checks with:

```
node --test tests/eight-tokenizer-diagnostic.test.mjs
```

The executable's required CLI arguments specify the eight inputs, recorded
Node/Python predictions, actual source modules, verified runtime spec and local
Python tokenizer. Outputs remain outside Git; missing/duplicate cases or
mismatched source/context fail instead of borrowing annotation information.
