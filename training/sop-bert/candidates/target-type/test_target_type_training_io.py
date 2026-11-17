"""Tiny gzip + synthetic CPU warmstart fixtures; no model/checkpoint files."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
prep=load('prep_v3',ROOT/'prepare-key-reader.py')
train=load('train_v3',ROOT/'train-key-reader.py')
helper=load('cpu_helper',ROOT/'target-type-weight-migration.py')
fixtures=load('tiny_states',ROOT/'test_target_type_weight_migration.py')

class TrainingIOTests(unittest.TestCase):
    def corpus(self,root):
        corpus=root/'source';corpus.mkdir()
        excluded=root/'excluded.json';excluded.write_text('["reserved"]')
        aliases=root/'aliases.py';aliases.write_text("M={}\nW={}\nCO={}\n")
        split_rows={'train':[],'calibration':[]}
        for i,(version,requests)in enumerate([('v2',[{'span':'make a circle','target':{'type':'drawn','kind':'circle'}}]),
                                             ('v1',[{'span':'make a circle','answers':{}}]),('v2',[]),('v1',[])]):
            path='data/haiku-'+version+'/drawing/fixture.jsonl';sid='sample-'+str(i);identity=path+':'+sid
            split='calibration'if int(hashlib.sha256(identity.encode()).hexdigest()[:8],16)%10==0 else'train'
            split_rows[split].append({'id':identity,'source_path':path,'source_id':sid,'split':split,'world':'drawing',
                                     'source':{'text':'make a circle'},'context':{'existing':[]},'annotations':requests})
        for split,rows in split_rows.items():
            (corpus/(split+'.jsonl')).write_text(''.join(json.dumps(row)+'\n'for row in rows))
        manifest={'outputs':{s:prep.sha(corpus/(s+'.jsonl'))for s in split_rows},
                  'exclusion':{'sha256':prep.sha(excluded)}}
        (corpus/'manifest.json').write_text(json.dumps(manifest))
        return corpus,aliases,excluded,split_rows

    def prepare(self,root,out,**kwargs):
        corpus,aliases,excluded,rows=self.corpus(root)
        manifest=prep.prepare(corpus,ROOT/'tests/fixtures/target-type-inventory.json',aliases,out,excluded,
                              max_output_bytes=1000000,reserve_bytes=1024,**kwargs)
        return manifest,rows,(corpus,aliases,excluded)

    def test_deterministic_gzip_roundtrip_encoded_and_decoded_provenance(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);manifest,rows,args=self.prepare(root,root/'a')
            second=prep.prepare(args[0],ROOT/'tests/fixtures/target-type-inventory.json',args[1],root/'b',args[2],
                                max_output_bytes=1000000,reserve_bytes=1024)
            self.assertEqual(manifest['outputs'],second['outputs'])
            total=0;raw=[]
            for split in ('train','calibration'):
                self.assertEqual((root/'a'/manifest['dataFiles'][split]['path']).read_bytes(),
                                 (root/'b'/second['dataFiles'][split]['path']).read_bytes())
                got=train.load_candidate_records(root/'a',manifest,split);total+=len(got)
                raw.extend(r['rawRequest']for r in got)
                self.assertEqual(manifest['dataFiles'][split]['encoding'],'utf-8')
                self.assertEqual(manifest['dataFiles'][split]['compression'],'gzip')
            self.assertEqual(total,4)
            self.assertEqual(sum(r is None for r in raw),2)
            self.assertEqual(manifest['exclusionSha256'],prep.sha(args[2]))

    def test_corrupted_encoded_and_decoded_hashes_refuse(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);manifest,_,_=self.prepare(root,root/'a')
            wrong=copy.deepcopy(manifest);wrong['dataFiles']['train']['decodedSha256']='0'*64
            with self.assertRaisesRegex(ValueError,'decoded-data-provenance'):
                train.load_candidate_records(root/'a',wrong,'train')
            path=root/'a'/manifest['dataFiles']['train']['path'];path.write_bytes(path.read_bytes()+b'bad')
            with self.assertRaisesRegex(ValueError,'encoded-data'):
                train.load_candidate_records(root/'a',manifest,'train')

    def test_partial_output_cleanup_and_exclusion_refusal(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);corpus,aliases,excluded,_=self.corpus(root)
            out=root/'bounded'
            with self.assertRaisesRegex(ValueError,'byte-bound'):
                prep.prepare(corpus,ROOT/'tests/fixtures/target-type-inventory.json',aliases,out,excluded,
                             max_output_bytes=1,reserve_bytes=1)
            self.assertFalse(out.exists())
            bad=root/'bad-exclusions.json';bad.write_text('[]')
            with self.assertRaisesRegex(ValueError,'exclusion-hash'):
                prep.prepare(corpus,ROOT/'tests/fixtures/target-type-inventory.json',aliases,root/'bad',bad,
                             max_output_bytes=1000000,reserve_bytes=1)

    def test_record_and_decompressed_work_bounds(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);manifest,_,_=self.prepare(root,root/'a')
            with self.assertRaisesRegex(ValueError,'decoded-data-bound'):
                train.load_candidate_records(root/'a',manifest,'train',max_decoded_bytes=1)
            with self.assertRaisesRegex(ValueError,'decoded-record-bound'):
                train.load_candidate_records(root/'a',manifest,'train',max_record_bytes=1)

    def warm_fixture(self):
        old,new=fixtures.configs()
        hashes={name:str(i)*64 for i,name in enumerate(('checkpoint','config','run','trainer','dataManifest','preparer','helper'),1)}
        hashes['spec']='8'*64
        spec={'format':'sop.key-reader-frozen-warmstart/1','optimizerPolicy':'reset','elementWorkAllowance':100000,
              'files':{key:{'path':'frozen-'+key,'sha256':value}for key,value in hashes.items()if key!='spec'}}
        old.update(trainerSha256=hashes['trainer'],dataManifestSha256=hashes['dataManifest'])
        new.update(tensorArchitectureVersion=2,inventorySha256='a'*64,exclusionSha256='e'*64)
        run={'format':'sop.key-reader-run/1','steps':10,'checkpointSha256':hashes['checkpoint'],
             'configSha256':hashes['config'],'trainerSha256':hashes['trainer']}
        manifest={'scriptSha256':hashes['preparer'],'inventorySha256':'a'*64,
                  'sourceManifest':{'exclusion':{'sha256':'e'*64}}}
        payload={'config':old,'model':fixtures.state(old,10)}
        fresh=fixtures.state(new,100)
        return new,old,run,manifest,spec,hashes,payload,fresh

    def test_synthetic_warmstart_success_semantic_rows_and_provenance(self):
        args=self.warm_fixture()
        fresh={k:v.clone()for k,v in args[-1].items()}
        got,provenance=train.migrate_frozen_state(*args,helper,lambda m:{'format':'sop.key-reader/1'})
        self.assertEqual(provenance['kind'],'semantic-migration')
        self.assertEqual(provenance['estimatedElements'],provenance['stats']['elements'])
        self.assertEqual(provenance['optimizer'],'fresh-AdamW')
        self.assertEqual(provenance['migrationHelperSha256'],args[5]['helper'])
        self.assertTrue(__import__('torch').equal(got['classes.0.weight'],fresh['classes.0.weight']))
        for key in fresh:self.assertTrue(__import__('torch').equal(args[-1][key],fresh[key]))

    def test_warmstart_hash_chain_layout_exclusion_and_allowance_refusal(self):
        for mutation in ('hash','run','trainer','preparer','layout','exclusion','allowance','payload'):
            args=list(self.warm_fixture());factory=lambda m:{'format':'sop.key-reader/1'}
            if mutation=='hash':args[5]['checkpoint']='f'*64
            elif mutation=='run':args[2]['steps']=0
            elif mutation=='trainer':args[1]['trainerSha256']='f'*64
            elif mutation=='preparer':args[3]['scriptSha256']='f'*64
            elif mutation=='layout':factory=lambda m:{'keys':['wrong']}
            elif mutation=='exclusion':args[3]['sourceManifest']['exclusion']['sha256']='f'*64
            elif mutation=='allowance':args[4]['elementWorkAllowance']=1
            else:args[6]['config']={}
            with self.assertRaises(ValueError,msg=mutation):
                train.migrate_frozen_state(*args,helper,factory)

    def test_selection_prefers_correct_global_type_over_better_bio_f1(self):
        wrong={'positiveBioAndGlobalSupport':10,'positiveBioAndGlobalExact':0,
               'targetTypePresentClass':{'support':10,'correct':0},'decodedMentionF1':.99}
        right={'positiveBioAndGlobalSupport':10,'positiveBioAndGlobalExact':8,
               'targetTypePresentClass':{'support':10,'correct':10},'decodedMentionF1':.8}
        self.assertGreater(train.selection_rank(right),train.selection_rank(wrong))

if __name__=='__main__':unittest.main()
