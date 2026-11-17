"""Release corpus invariants; neural understanding is measured separately on TRAIN."""
import gzip, hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data/demo-tool-profile'
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
contract=load('demo_contract',ROOT/'demo-intent-contract.py')
prepare=load('demo_prepare',ROOT/'prepare-key-reader.py')
trainer=load('demo_trainer',ROOT/'train-key-reader.py')
class AuthoredCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with gzip.open(DATA/'active.jsonl.gz','rt')as source:cls.rows=[json.loads(line)for line in source]
        cls.profile=json.loads((DATA/'profile.json').read_text())
        cls.inventory=json.loads((DATA/'inventory.json').read_text())
    def test_all_source_identities_have_active_counterparts(self):
        expected={}
        for version in ['haiku-v1','haiku-v2']:
            for path in (ROOT/'data'/version).glob('*/*.jsonl'):
                for line in path.open():
                    if line.strip():
                        row=json.loads(line);expected[(path.relative_to(ROOT).as_posix(),row['id'])]=row
        actual={(row['source_path'],row['source_id']):row for row in self.rows}
        self.assertEqual(len(actual),len(self.rows));self.assertTrue(expected.keys()<=actual.keys())
        self.assertEqual({row['world']for row in self.rows},{'drawing','diagram','document','calendar','avatar'})
        self.originals=expected
    def test_genuine_chatter_keeps_original_text_and_no_tools(self):
        originals={}
        for version in ['haiku-v1','haiku-v2']:
            for path in (ROOT/'data'/version).glob('*/*.jsonl'):
                for line in path.open():
                    if line.strip():
                        row=json.loads(line)
                        if not row['requests']:originals[(path.relative_to(ROOT).as_posix(),row['id'])]=row['text']
        chatter=[row for row in self.rows if(row['source_path'],row['source_id'])in originals]
        self.assertGreater(len(chatter),100)
        for row in chatter:
            self.assertEqual(row['text'],originals[(row['source_path'],row['source_id'])]);self.assertEqual(row['requests'],[]);self.assertEqual(row['expectedTools'],[])
    def test_every_released_label_has_valid_source_and_supported_inventory(self):
        path=ROOT/'data/haiku-v2/validate_v2.py';validator={'__file__':str(path)}
        exec(compile(path.read_text().split("if sys.argv[1] == '--check':")[0],str(path),'exec'),validator)
        validator['INV']=self.inventory
        for row in self.rows:
            self.assertIn(row['phase'],['direct','world-inference'])
            self.assertNotIn(row.get('status'),['excluded','deferred','unsupported'])
            errors=validator['problems'](row,row['world'])
            self.assertEqual(errors,[],row['id']+': '+str(errors))
    def test_every_direct_gold_plan_recompiles_from_complete_labels(self):
        operations=set()
        for row in self.rows:
            if row['phase']!='direct':continue
            plan=contract.direct_tools(row,self.profile)
            self.assertEqual(plan,row['expectedTools'],row['id'])
            operations.update(step['operation']for step in plan)
        for prefix in ['drawing.','diagram.','chart.','document.','calendar.','avatar.']:
            self.assertTrue(any(op.startswith(prefix)for op in operations),prefix)
    def test_units_remain_in_copy_spans_and_type_is_explicit(self):
        registry=prepare.registry(self.inventory)
        self.assertIn('request.target.type',registry)
        config=trainer.configuration({'registry':registry,'annotationContract':'authored-v2','maxLength':384})
        self.assertEqual(config['maxLength'],384)
        self.assertIn('request.target.type',config['banks'])
        self.assertNotIn('request.target.type',config['bioKeys'])
        examples=[c for row in self.rows if row['phase']=='direct'for r in row['requests']for c in r.get('constraints',[])if c.get('unit')]
        self.assertTrue(examples)
        self.assertTrue(any(c['value_span'].endswith('minutes')for c in examples))
        self.assertNotIn('request.constraint.unit',registry)
    def test_authored_train_supplement_preserves_cal_and_enforces_its_hash(self):
        cutprep=load('demo_cutprep',ROOT/'prepare-demo-cutter.py');cuttrain=load('demo_cuttrain',ROOT/'train-request-cutter.py')
        rows=[r for r in self.rows if r['phase']=='direct'and int(hashlib.sha256((r['source_path']+':'+r['source_id']).encode()).hexdigest()[:8],16)%10==0][:2]
        with tempfile.TemporaryDirectory()as directory:
            root=Path(directory);source=root/'source.jsonl.gz';exclude=root/'exclude.json';supplement=root/'supplement.json'
            with gzip.open(source,'wt')as target:
                for row in rows:target.write(json.dumps(row)+'\n')
            exclude.write_text('[]');supplement.write_text(json.dumps([rows[0]['source_id']]))
            cutprep.prepare(source,root/'out',exclude,supplement)
            splits,provenance=cuttrain.load_corpus(root/'out',root/'out/raw',exclude)
            self.assertEqual(len(splits['train']),1);self.assertEqual(len(splits['calibration']),1)
            self.assertEqual(provenance['authoredTrainSupplementCount'],1)
            (root/'out/supplement-train-ids.json').write_text('[]')
            with self.assertRaisesRegex(ValueError,'train-supplement-hash-mismatch'):cuttrain.load_corpus(root/'out',root/'out/raw',exclude)
    def test_absent_identity_is_never_invented(self):
        row=next(row for row in self.rows if row['phase']=='direct'and row['world']=='calendar'and row['expectedTools']and row['expectedTools'][0]['operation']=='calendar.meeting.add')
        broken=json.loads(json.dumps(row));broken['context']['existing']=[]
        with self.assertRaisesRegex(ValueError,'identity is missing'):contract.direct_tools(broken,self.profile)
if __name__=='__main__':unittest.main()
