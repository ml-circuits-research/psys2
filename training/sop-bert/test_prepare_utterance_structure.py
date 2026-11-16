"""Fixture-only supervision checks; never reads real/reserved evaluation text."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('prepare_utterance', Path(__file__).with_name('prepare-utterance-structure.py'))
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class PreparationTests(unittest.TestCase):
    def fixture(self, directory, rows):
        root = Path(directory) / 'annotations'
        source = root / 'data/haiku-v2/toy/examples.jsonl'
        source.parent.mkdir(parents=True)
        source.write_text('\n'.join(json.dumps(row) if not isinstance(row, str) else row for row in rows) + '\n')
        exclusion = Path(directory) / 'excluded.json'
        exclusion.write_text('["reserved"]\n')
        return root, source, exclusion

    def row(self, identity, requests):
        return {'id': identity, 'world': 'toy', 'text': 'An invented utterance.', 'context': {'previous': None}, 'requests': requests}

    def ids(self):
        source = 'data/haiku-v2/toy/examples.jsonl'
        result = {}
        for i in range(100):
            identity = 'toy-' + str(i)
            result.setdefault(PREPARE.split_for(source, identity), identity)
        return result

    def read_rows(self, output):
        return [json.loads(line) for split in ['train', 'calibration'] for line in (output / (split + '.jsonl')).read_text().splitlines()]

    def test_presence_and_exact_count_keep_empty_and_multi_request_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, source, exclusion = self.fixture(temporary, [self.row('empty', []), self.row('many', [{'unknown': 'detail'}, {}])])
            output = Path(temporary) / 'prepared'
            manifest = PREPARE.prepare(root, output, exclusion)
            rows = {row['source_id']: row for row in self.read_rows(output)}
            self.assertEqual(rows['empty']['labels'], {'has_request': False, 'request_count': 0})
            self.assertEqual(rows['many']['labels'], {'has_request': True, 'request_count': 2})
            self.assertEqual(rows['empty']['source_sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(rows['empty']['source_line'], 1)
            self.assertEqual(rows['empty']['context'], {'previous': None})
            self.assertTrue(manifest['ready'])
            self.assertFalse(manifest['executable'])
            self.assertNotIn('graph', rows['many']['labels'])

    def test_exclusion_precedes_validation_and_train_inventory_never_uses_calibration(self):
        identities = self.ids()
        with tempfile.TemporaryDirectory() as temporary:
            root, source, exclusion = self.fixture(temporary, [self.row(identities['train'], []), self.row(identities['calibration'], [{}] * 7), {'id': 'reserved', 'requests': 'malformed must not be inspected'}])
            output = Path(temporary) / 'prepared'
            manifest = PREPARE.prepare(root, output, exclusion)
            self.assertEqual(manifest['trainLabelSupport']['request_count'], {'0': 1})
            self.assertEqual(manifest['counts']['excludedRows'], 1)
            self.assertEqual(manifest['exclusion']['foundIds'], 1)
            self.assertEqual(manifest['malformed'], {})
            self.assertTrue(manifest['exclusion']['beforeLabelsAndInventories'])
            rows = self.read_rows(output)
            self.assertEqual(len(rows), 2)
            for row in rows:
                identity = row['source'] + ':' + row['source_id']
                expected = 'calibration' if int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16) % 10 == 0 else 'train'
                self.assertEqual(row['split'], expected)

    def test_malformed_rows_are_diagnosed_without_negative_label_coercion(self):
        rows = ['{bad', {'id': 'missing', 'world': 'toy', 'text': 'Invented.'}, self.row('null', None), self.row('bad-element', [None]), self.row('valid', [])]
        with tempfile.TemporaryDirectory() as temporary:
            root, _, exclusion = self.fixture(temporary, rows)
            output = Path(temporary) / 'prepared'
            manifest = PREPARE.prepare(root, output, exclusion)
            self.assertFalse(manifest['ready'])
            self.assertEqual(manifest['malformed'], {'invalid-json': 1, 'requests-not-list': 2, 'request-not-object': 1})
            self.assertEqual([row['source_id'] for row in self.read_rows(output)], ['valid'])
            self.assertEqual(len((output / 'diagnostics.jsonl').read_text().splitlines()), 4)

    def test_deterministic_outputs_and_exact_exclusion_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, _, exclusion = self.fixture(temporary, [self.row('empty', [])])
            first, second = Path(temporary) / 'first', Path(temporary) / 'second'
            PREPARE.prepare(root, first, exclusion)
            PREPARE.prepare(root, second, exclusion)
            for name in ['train.jsonl', 'calibration.jsonl', 'diagnostics.jsonl', 'manifest.json']:
                self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
            with self.assertRaisesRegex(ValueError, 'output-already-exists'):
                PREPARE.prepare(root, first, exclusion)
            with self.assertRaisesRegex(ValueError, 'exclusion-hash-mismatch'):
                PREPARE.prepare(root, Path(temporary) / 'hash-mismatch', exclusion, '0' * 64)
            for invalid in ['"reserved"', '["reserved", "reserved"]', '[12]']:
                exclusion.write_text(invalid)
                with self.assertRaisesRegex(ValueError, 'invalid-exclusion-manifest'):
                    PREPARE.prepare(root, Path(temporary) / 'invalid', exclusion)


if __name__ == '__main__':
    unittest.main()
