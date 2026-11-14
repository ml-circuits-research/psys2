# SOURCE: billsum-test-200.jsonl

- Dataset: BillSum (US Congress bills with CRS summaries), https://huggingface.co/datasets/FiscalNote/billsum
- Fetched: 2026-11-14 via https://datasets-server.huggingface.co/rows?dataset=FiscalNote/billsum&config=default&split=test&offset=0&length=100 and offset=100.
- Licence: CC0-1.0 per the dataset card; the texts are US government works (public domain).
- Subset: first 200 rows of the `test` split (row_idx 0-199), fields `{id, text, summary, title}`, id = `billsum-test-<row_idx>`. No other change.
