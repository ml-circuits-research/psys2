"""Candidate-only pure/CPU fixtures. No model/checkpoint, GPU, or dataset run."""
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
prep=load('candidate_preparer',ROOT/'prepare-key-reader.py')
train=load('candidate_trainer',ROOT/'train-key-reader.py')
INVENTORY=ROOT/'tests/fixtures/target-type-inventory.json'
INV=json.loads(INVENTORY.read_text())
SHA='5e5c4404d392774b6e4754a31988fc2ba943d90289e9a083a6e23ba6cba21832'
ALIASES={'M':{'kind':'request.target.kind','mood':'request.request.mood'},'W':{},'CO':{}}
def row(version='v2',area='drawing'):
    return {'source_path':'data/haiku-'+version+'/fixture.jsonl','source_id':'fixture-1',
            'id':'fixture-source','world':area,'source':{'text':'make a circle'},'context':{}}
def config():
    return train.configuration({'format':prep.CANDIDATE_FORMAT,'registry':prep.registry(INV),
                                'inventorySha256':SHA,'targetFamilies':prep.target_families(INV)})
class CandidateTests(unittest.TestCase):
    def test_authoritative_inventory_unchanged_and_fifteen_families(self):
        self.assertEqual(hashlib.sha256(INVENTORY.read_bytes()).hexdigest(),SHA)
        families=prep.target_families(INV)
        self.assertEqual({k:len(v)for k,v in families.items()},{'drawing':4,'diagram':5,'document':3,'calendar':3})
        self.assertEqual(sum(map(len,families.values())),15)

    def test_shared_family_label_has_one_class_and_area_membership(self):
        inventory=copy.deepcopy(INV)
        inventory['drawing']['node']=copy.deepcopy(inventory['diagram']['node'])
        reg=prep.registry(inventory)
        self.assertEqual(reg[prep.TARGET_TYPE]['values'].count('node'),1)
        self.assertIn('node',reg[prep.TARGET_TYPE]['familiesByArea']['drawing'])
        self.assertIn('node',reg[prep.TARGET_TYPE]['familiesByArea']['diagram'])
        self.assertNotIn('node',reg[prep.TARGET_TYPE]['familiesByArea']['calendar'])

    def test_config_135_keys_122_bio_63_banks_new_version(self):
        c=config()
        self.assertEqual((len(c['keys']),len(c['bioKeys']),len(c['banks'])),(135,122,63))
        self.assertNotIn(prep.TARGET_TYPE,c['bioKeys'])
        self.assertEqual(len(c['banks'][prep.TARGET_TYPE]),17)
        self.assertNotEqual(c['format'],'sop.key-reader/1')
        self.assertFalse(c['executionEligible'])

    def test_v2_family_not_kind_and_no_source_literal_span(self):
        request={'span':'make a circle','target':{'type':'drawn','kind':'circle'}}
        result=prep.sample(row(),request,prep.registry(INV),ALIASES)
        self.assertEqual(result['globals'][prep.TARGET_TYPE],{'value':'drawn','span':None})
        self.assertEqual(result['globals']['request.target.kind']['value'],'circle')
        self.assertEqual(result['rawRequest'],request)
        self.assertNotIn('circle',prep.registry(INV)[prep.TARGET_TYPE]['values'])

    def test_all_area_families_supervised_from_existing_annotations(self):
        reg=prep.registry(INV)
        for area,names in prep.target_families(INV).items():
            for name in names:
                result=prep.sample(row(area=area),{'span':'make a circle','target':{'type':name}},reg,ALIASES)
                self.assertEqual(result['globals'][prep.TARGET_TYPE]['value'],name)

    def test_v1_nonempty_type_unknown_fully_masked(self):
        request={'span':'make a circle','answers':{'kind':'circle','mood':'do','type':'drawn'}}
        result=prep.sample(row('v1'),request,prep.registry(INV),ALIASES)
        self.assertNotIn(prep.TARGET_TYPE,result['coveredKeys'])
        self.assertNotIn(prep.TARGET_TYPE,result['globals'])
        self.assertEqual(result['rawRequest'],request)

    def test_no_request_absence_preserved_for_both_versions(self):
        for version in ('v1','v2'):
            result=prep.sample(row(version),None,prep.registry(INV),ALIASES)
            self.assertIn(prep.TARGET_TYPE,result['coveredKeys'])
            self.assertNotIn(prep.TARGET_TYPE,result['globals'])
            self.assertFalse(result['hasRequest'])

    def test_missing_v2_type_masked_not_fabricated_from_kind(self):
        result=prep.sample(row(),{'span':'make a circle','target':{'kind':'circle'}},prep.registry(INV),ALIASES)
        self.assertNotIn(prep.TARGET_TYPE,result['coveredKeys'])
        self.assertNotIn(prep.TARGET_TYPE,result['globals'])

    def test_invalid_and_cross_area_types_unknown_not_new_enum(self):
        c=config()
        for value in ('meeting','invented',None):
            request={'span':'make a circle','target':{'type':value}}
            result=prep.sample(row(),request,prep.registry(INV),ALIASES)
            self.assertEqual(result['globals'][prep.TARGET_TYPE],{'value':None,'span':None})
            self.assertEqual(train.label(None,c['banks'][prep.TARGET_TYPE]),1)
            self.assertEqual(result['rawRequest'],request)

    def test_registry_order_and_class_bank_migration_are_semantic(self):
        old={'format':'sop.key-reader/1','keys':['a','b'],'bioKeys':['a','b'],
             'banks':{'a':[{'state':'absent'},{'state':'unknown'},{'state':'value','value':'red'},{'state':'value','value':'blue'}]}}
        new={'format':'sop.key-reader/2-target-type-candidate','keys':['new','b','a'],'bioKeys':['b','a'],
             'banks':{'a':[{'state':'unknown'},{'state':'value','value':'blue'},{'state':'absent'},{'state':'value','value':'red'}],
                      'new':[{'state':'absent'},{'state':'unknown'}]}}
        plan=train.weight_migration_plan(old,new)
        tables={p['target']:p for p in plan['rowPlans']}
        self.assertEqual(tables['key.weight']['rows'],[[0,2],[1,1]])
        self.assertEqual(tables['classes.2.weight']['source'],'classes.0.weight')
        self.assertEqual(tables['classes.2.weight']['rows'],[[1,0],[3,1],[0,2],[2,3]])
        self.assertEqual(tables['bio.weight']['rows'],[[0,3],[1,4],[2,5],[3,0],[4,1],[5,2]])
        self.assertEqual(plan['newKeys'],['new'])
        self.assertFalse(plan['appliesWeights'])

    def test_literal_sentinel_is_not_reserved_and_typed_values_distinct(self):
        old={'format':'sop.key-reader/1','keys':['a'],'bioKeys':[],
             'banks':{'a':[{'state':'absent'},{'state':'value','value':'<ABSENT>'},{'state':'value','value':1},{'state':'value','value':'1'}]}}
        new=copy.deepcopy(old);new['format']='sop.key-reader/2-target-type-candidate';new['banks']['a'].reverse()
        plan=train.weight_migration_plan(old,new)
        table=next(p for p in plan['rowPlans'] if p['target']=='classes.0.weight')
        self.assertEqual(table['rows'],[[3,0],[2,1],[1,2],[0,3]])

    def test_duplicate_migration_identities_refuse(self):
        old={'format':'sop.key-reader/1','keys':['a','a'],'bioKeys':[],'banks':{}}
        with self.assertRaisesRegex(ValueError,'duplicate'):
            train.weight_migration_plan(old,config())

    def test_cpu_encoding_new_class_not_bio_v1_mask_and_empty_absence(self):
        try:
            import torch
        except ImportError:
            self.skipTest('torch unavailable: pure fixtures still run')
        class Encoding(dict):
            def sequence_ids(self):return [None,0,0,0,None]
        class Tokenizer:
            def __call__(self,*args,**kwargs):
                return Encoding(input_ids=[101,10,11,12,102],attention_mask=[1]*5,offset_mapping=[(0,0),(0,4),(5,6),(7,13),(0,0)])
        c=config();reg=prep.registry(INV);key=prep.TARGET_TYPE;index=c['keys'].index(key)
        positive=prep.sample(row(),{'span':'make a circle','target':{'type':'drawn'}},reg,ALIASES)
        encoded=train.encode({**positive,'id':'p'},Tokenizer(),c)
        self.assertGreaterEqual(encoded['classes'][key],2)
        self.assertEqual(float(encoded['presence'][index]),1.)
        self.assertEqual(encoded['bio'].shape[0],122)
        unknown=prep.sample(row('v1'),{'span':'make a circle','answers':{}},reg,ALIASES)
        encoded=train.encode({**unknown,'id':'u'},Tokenizer(),c)
        self.assertNotIn(key,encoded['classes'])
        self.assertEqual(float(encoded['presence'][index]),-100.)
        negative=prep.sample(row(),None,reg,ALIASES)
        encoded=train.encode({**negative,'id':'n'},Tokenizer(),c)
        self.assertEqual(encoded['classes'][key],0)
        self.assertEqual(float(encoded['presence'][index]),0.)

if __name__=='__main__':
    unittest.main()
