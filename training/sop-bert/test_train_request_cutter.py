"""Pure fixture tests: no model downloads, GPU, or corpus fixtures."""
import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
import hashlib

spec = importlib.util.spec_from_file_location("cutter", Path(__file__).with_name("train-request-cutter.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CutterTests(unittest.TestCase):
    def test_unique_scalar_spans_and_empty(self):
        self.assertEqual(m.gold_spans("A😀 then B", [{"span": "A😀"}, {"span": "B"}]), ([(0, 2), (8, 9)], []))
        self.assertEqual(m.gold_spans("nothing", []), ([], []))

    def test_repeated_missing_malformed_not_flattened(self):
        self.assertIsNone(m.gold_spans("go go", [{"span": "go"}])[0])
        self.assertIn("missing-span:0", m.gold_spans("go", [{"span": "stop"}])[1])
        self.assertIn("malformed-span:0", m.gold_spans("go", [{}])[1])

    def test_overlap_and_order_diagnostics(self):
        self.assertIn("overlapping-spans", m.gold_spans("abcdef", [{"span": "abcd"}, {"span": "cdef"}])[1])
        self.assertIn("annotation-order", m.gold_spans("A B", [{"span": "B"}, {"span": "A"}])[1])

    def test_special_padding_and_positive_alignment(self):
        labels, issues = m.align_labels("go now", [(0, 6)], [(0, 0), (0, 2), (3, 6), (0, 0), (0, 0)],
                                        [None, 0, 0, None, None], [1, 1, 1, 1, 0])
        self.assertEqual(labels, [-100, 1, 2, -100, -100])
        self.assertEqual(issues, [])

    def test_no_request_source_is_O(self):
        self.assertEqual(m.align_labels("go", [], [(0, 2)], [0], [1])[0], [0])

    def test_unrepresentable_masks_whole_row(self):
        labels, issues = m.align_labels("prefix", [(1, 6)], [(0, 6)], [0], [1])
        self.assertEqual(labels, [-100])
        self.assertIn("unrepresentable-token-boundary", issues)

    def test_ambiguity_overlap_and_truncation_mask_entire_row(self):
        for spans, reasons, truncated in [(None, ["ambiguous-span:0"], False),
                                          ([(0, 2), (0, 2)], [], False), ([], [], True)]:
            self.assertEqual(m.align_labels("go", spans, [(0, 2)], [0], [1], truncated, reasons)[0], [-100])

    def test_illegal_I_does_not_repair_boundary(self):
        self.assertEqual(m.decode_bio([0, 2], [(0, 1), (2, 3)], [0, 0], [1, 1], 3),
                         ([], ["illegal-I-after-O"]))

    def test_valid_decode_and_scalar_boundaries(self):
        self.assertEqual(m.decode_bio([1, 2, 0, 1], [(0, 1), (1, 2), (3, 4), (5, 6)],
                                      [0] * 4, [1] * 4, 6), ([(0, 2), (5, 6)], []))
        self.assertEqual(m.decode_bio([1], [(0, 1)], [1], [1], 1)[1], ["invalid-source-offset"])
        self.assertEqual(m.decode_bio([1], [(0, 1)], [0], [1], 1, True)[1], ["source-truncated"])

    def test_unknown_argmax_is_unresolved(self):
        self.assertEqual(m.decode_bio([-1], [(0, 1)], [0], [1], 1)[1], ["unknown-BIO-label"])

    def test_O_dominance_and_empty_metrics_separate(self):
        def row(text, labels, spans, request_count):
            return dict(text=text, labels=labels, spans=spans, request_count=request_count,
                        offsets=[(i, i+1) for i in range(len(text))], sequence_ids=[0]*len(text),
                        attention_mask=[1]*len(text), truncated=False, issues=[])
        report = m.metrics([row("abcdef", [0, 0, 0, 0, 1, 2], [(4, 6)], 1),
                            row("ab", [0, 0], [], 0)], [[0]*6, [0]*2])
        self.assertEqual(report["tokenPositive"]["support"], 2)
        self.assertEqual(report["tokenPositive"]["f1"], 0)
        self.assertEqual(report["positive"]["utteranceExact"], 0)
        self.assertEqual(report["empty"]["utteranceExact"], 1)
        self.assertEqual(report["span"]["fn"], 1)

    def test_unknown_token_counts_as_missed_positive(self):
        row = dict(text="a", labels=[1], spans=[(0, 1)], request_count=1, offsets=[(0, 1)],
                   sequence_ids=[0], attention_mask=[1], truncated=False, issues=[])
        report = m.metrics([row], [[-1]])
        self.assertEqual(report["tokenClasses"]["B"]["fn"], 1)
        self.assertEqual(report["tokenPositive"]["fn"], 1)

    def test_original_source_hash_split_exclusion_and_annotation_guards(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "raw"
            data = root / "data"
            source.mkdir()
            data.mkdir()
            raw = {"id": "sample-1", "text": "go", "requests": [{"span": "go"}]}
            source_path = source / "sample.jsonl"
            source_path.write_text(json.dumps(raw) + "\n")
            exclusions = root / "excluded.json"
            exclusions.write_text("[]")
            identity = "sample.jsonl:sample-1"
            split = "calibration" if int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16) % 10 == 0 else "train"
            row = {"source_path": "sample.jsonl", "source_id": "sample-1", "id": identity,
                   "source": {"text": "go"}, "annotations": raw["requests"], "split": split,
                   "source_sha256": m.digest(source_path)}
            for name in ("train", "calibration"):
                (data / (name + ".jsonl")).write_text(json.dumps(row) + "\n" if name == split else "")
            manifest = {"exclusion": {"sha256": m.digest(exclusions)},
                        "sources": [{"path": "sample.jsonl", "sha256": m.digest(source_path)}],
                        "outputs": {name: m.digest(data / (name + ".jsonl")) for name in ("train", "calibration")}}
            (data / "manifest.json").write_text(json.dumps(manifest))
            loaded, _ = m.load_corpus(data, source, exclusions)
            self.assertEqual(len(loaded[split]), 1)
            row["annotations"] = []
            (data / (split + ".jsonl")).write_text(json.dumps(row) + "\n")
            manifest["outputs"][split] = m.digest(data / (split + ".jsonl"))
            (data / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "original-annotation"):
                m.load_corpus(data, source, exclusions)
            exclusions.write_text('["sample-1"]')
            manifest["exclusion"]["sha256"] = m.digest(exclusions)
            (data / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "reserved-id"):
                m.load_corpus(data, source, exclusions)

    def test_weights_only_supplied_train_rows(self):
        weights, counts = m.class_weights([{"labels": [-100, 0, 0, 1, 2]}])
        self.assertEqual(counts, [2, 1, 1])
        self.assertEqual(weights, [2/3, 4/3, 4/3])

if __name__ == "__main__":
    unittest.main()
