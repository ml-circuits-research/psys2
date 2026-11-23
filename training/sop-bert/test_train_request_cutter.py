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

    def test_dynamic_padding_crops_only_right_padding(self):
        rows = [{"input_ids": [1, 2, 3, 0, 0], "attention_mask": [1, 1, 1, 0, 0]},
                {"input_ids": [1, 2, 0, 0, 0], "attention_mask": [1, 1, 0, 0, 0]}]
        self.assertEqual(m.batch_width(rows), 5)
        self.assertEqual(m.batch_width(rows, "dynamic"), 3)
        rows[1]["attention_mask"] = [1, 0, 1, 0, 0]
        with self.assertRaisesRegex(ValueError, "right-padded"):
            m.batch_width(rows, "dynamic")

    def test_cutter_warmstart_requires_actual_selected_complete_component(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkpoint = root / "best.pt"
            checkpoint.write_bytes(b"test checkpoint")
            config = {"format": "sop.request-cutter-model/1", "codec": m.CODEC}
            (root / "model-config.json").write_text(json.dumps(config))
            proof = {"format": "sop.request-cutter-run/1", "complete": True,
                     "role": "trained-cutter-only", "checkpointSha256": m.digest(checkpoint),
                     "configSha256": m.digest(root / "model-config.json")}
            proof_path = root / "proof.json"
            proof_path.write_text(json.dumps(proof))
            deployment = {"cutterCheckpointSha256": proof["checkpointSha256"], "cutterConfigSha256": proof["configSha256"]}
            deployment_path = root / "deployment.json"
            deployment_path.write_text(json.dumps(deployment))
            self.assertEqual(m.verify_cutter_warmstart(checkpoint, m.digest(checkpoint), proof_path, deployment_path), config)
            deployment["cutterCheckpointSha256"] = "different"
            deployment_path.write_text(json.dumps(deployment))
            with self.assertRaisesRegex(ValueError, "not-selected"):
                m.verify_cutter_warmstart(checkpoint, m.digest(checkpoint), proof_path, deployment_path)

    def test_source_group_contract_preserves_raw_and_grouped_splits(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); source = root / "raw"; source.mkdir(); data = root / "data"; data.mkdir()
            raw = {"id": "item", "text": "go", "requests": [{"span": "go"}], "split_group": "shared-family"}
            path = source / "items.jsonl"; path.write_text(json.dumps(raw) + "\n")
            excluded = root / "excluded.json"; excluded.write_text("[]")
            split = "calibration" if int(hashlib.sha256(raw["split_group"].encode()).hexdigest()[:8], 16) % 10 == 0 else "train"
            row = {"id": "items.jsonl:item", "source_id": "item", "source_path": "items.jsonl", "source_sha256": m.digest(path), "source": {"text": "go"}, "annotations": raw["requests"], "split_group": raw["split_group"], "split": split}
            for name in ["train", "calibration"]:
                (data / (name + ".jsonl")).write_text(json.dumps(row) + "\n" if name == split else "")
            manifest = {"sources": [{"path": "items.jsonl", "sha256": m.digest(path)}], "exclusion": {"sha256": m.digest(excluded)}, "outputs": {name: m.digest(data / (name + ".jsonl")) for name in ["train", "calibration"]}, "sourceGrouping": {"format": "psys2.source-cohort-split/1", "field": "split_group", "hash": "sha256-first8-mod10"}}
            (data / "manifest.json").write_text(json.dumps(manifest))
            loaded, _ = m.load_corpus(data, source, excluded)
            self.assertEqual(loaded[split][0]["text"], "go")
            row["split_group"] = "invented"
            (data / (split + ".jsonl")).write_text(json.dumps(row) + "\n")
            manifest["outputs"][split] = m.digest(data / (split + ".jsonl"))
            (data / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "cohort-group-mismatch"):
                m.load_corpus(data, source, excluded)

    def test_official_cutter_preparation_loads_and_keeps_context_outside_model_inputs(self):
        path = Path(__file__).with_name("prepare-official.py")
        spec = importlib.util.spec_from_file_location("official_preparation", path)
        preparation = importlib.util.module_from_spec(spec); spec.loader.exec_module(preparation)
        import gzip
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); official = root / "official"; official.mkdir()
            row = lambda rid, text, span: {"id": rid, "world": "drawing", "text": text, "requests": [{"span": span}], "context": {"hidden": "never input"}, "family": rid, "source": "ui-natural"}
            train, dev, test = row("a:1", "please draw a house", "draw a house"), row("b:2", "a tree", "a tree"), row("c:3", "a sun", "a sun")
            with gzip.open(official / "train.jsonl.gz", "wt") as stream: stream.write(json.dumps(train) + "\n")
            (official / "dev.jsonl").write_text(json.dumps(dev) + "\n"); (official / "test.jsonl").write_text(json.dumps(test) + "\n")
            preparation.OFFICIAL = official
            out = root / "prepared"; manifest = preparation.prepare_cutter(out)
            self.assertEqual(manifest["counts"], {"train": 1, "calibration": 1, "reservedTest": 1})
            splits, provenance = m.load_corpus(out, out / "raw", out / "exclusions.json")
            self.assertEqual(sum(map(len, splits.values())), 2)
            self.assertEqual(provenance["exclusionCount"], 1)
            for rows in splits.values():
                for item in rows:
                    self.assertNotIn("context", item)
                    self.assertIn(item["text"], [train["text"], dev["text"]])

    def test_weights_only_supplied_train_rows(self):
        weights, counts = m.class_weights([{"labels": [-100, 0, 0, 1, 2]}])
        self.assertEqual(counts, [2, 1, 1])
        self.assertEqual(weights, [2/3, 4/3, 4/3])

if __name__ == "__main__":
    unittest.main()
