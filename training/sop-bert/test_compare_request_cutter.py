"""Pure offline comparison fixtures; optional actual published Node helper."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('comparison',Path(__file__).with_name('compare-request-cutter.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ComparisonTests(unittest.TestCase):
    def test_source_only_and_duplicate_guards(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'input.jsonl'
            path.write_text(json.dumps({'id':'a','text':'source'})+'\n')
            self.assertEqual(m.source_records(path),[{'id':'a','text':'source'}])
            path.write_text(json.dumps({'id':'a','text':'source','annotations':[]})+'\n')
            with self.assertRaisesRegex(ValueError,'source-only'):
                m.source_records(path)
            row=json.dumps({'id':'a','text':'source'})+'\n'
            path.write_text(row+row)
            with self.assertRaisesRegex(ValueError,'duplicate'):
                m.source_records(path)

    def test_scalar_source_not_special_context_padding(self):
        self.assertEqual(m.source_indices([(0,0),(0,1),(1,2),(0,0),(0,0)],
                         [None,0,0,None,None],[1,1,1,1,0],2),[1,2])
        with self.assertRaisesRegex(ValueError,'source-sequence'):
            m.source_indices([(0,1)],[1],[1],1)
        with self.assertRaisesRegex(ValueError,'scalar-offset'):
            m.source_indices([(1,2),(0,1)],[0,0],[1,1],2)

    def test_transitions_preserve_negative_regressions(self):
        rows=[{'request_count':1},{'request_count':1},{'request_count':0},{'request_count':0}]
        self.assertEqual(m.transition_counts([False,True,True,False],[True,False,False,True],rows),
                         {'positive:incorrect->correct':1,'positive:correct->incorrect':1,
                          'empty:correct->incorrect':1,'empty:incorrect->correct':1})

    @unittest.skipUnless(os.environ.get('BIO_VITERBI_HELPER'),'published helper path not provided')
    def test_actual_node_wrapper_uses_global_path_and_preserves_ties(self):
        helper=Path(os.environ['BIO_VITERBI_HELPER'])
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);source=root/'emissions.jsonl';output=root/'labels.jsonl'
            rows=[{'id':'global','emissions':[[5,4,0],[0,0,5]]},
                  {'id':'tie','emissions':[[1,1,0]]},{'id':'empty','emissions':[]}]
            source.write_text(''.join(json.dumps(row)+'\n' for row in rows))
            subprocess.run(['node',str(Path(__file__).with_name('compare-request-cutter-decoders.mjs')),
                            str(source),str(output),str(helper),m.digest(helper)],check=True)
            results=[json.loads(line) for line in output.read_text().splitlines()]
            self.assertEqual(results[0]['greedy'],[0,2])
            self.assertEqual(results[0]['viterbi']['labels'],[1,2])
            self.assertEqual(results[1]['greedy'],[-1])
            self.assertFalse(results[1]['viterbi']['ok'])
            self.assertEqual(results[1]['viterbi']['reason'],'ambiguous-best-path')
            self.assertEqual(results[2]['viterbi']['labels'],[])

if __name__=='__main__':
    unittest.main()
