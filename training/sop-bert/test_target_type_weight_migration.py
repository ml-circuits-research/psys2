"""Tiny synthetic CPU tensors only: no model construction, files or checkpoints."""
import copy
import importlib.util
from pathlib import Path
import unittest
import torch
ROOT=Path(__file__).parent
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
migration=load('migration',ROOT/'target-type-weight-migration.py')
trainer=load('candidate',ROOT/'train-key-reader.py')
ABSENT={'state':'absent'}
UNKNOWN={'state':'unknown'}
RED={'state':'value','value':'red'}
BLUE={'state':'value','value':'blue'}

def configs():
    registry={key:{'role':'global','concept':key,'values':[]}for key in ('a','b')}
    provenance={'encoder':'frozen-local-encoder','encoderFiles':{'config.json':'a'*64,'model.safetensors':'b'*64}}
    old={'format':'sop.key-reader/1','keys':['a','b'],'bioKeys':['a','b'],
         'banks':{'a':[ABSENT,UNKNOWN,RED,BLUE]},'registry':copy.deepcopy(registry),**copy.deepcopy(provenance)}
    new={'format':'sop.key-reader/2-target-type-candidate','keys':['type','b','a'],'bioKeys':['b','a'],
         'banks':{'a':[UNKNOWN,BLUE,ABSENT,RED],'type':[ABSENT,UNKNOWN,{'state':'value','value':'family'}]},
         'registry':{**copy.deepcopy(registry),'type':{'role':'global','concept':'target.type','bio':False}},
         **copy.deepcopy(provenance)}
    return old,new

def state(config,offset=0,dtype=torch.float32):
    result={'encoder.weight':torch.arange(6,dtype=dtype).reshape(2,3)+offset,
            'encoder.bias':torch.arange(2,dtype=dtype)+offset}
    n=len(config['keys']);h=3
    for name,shape in [('key.weight',(n,h)),('presence.weight',(n,h)),('presence.bias',(n,)),
                       ('bio.weight',(3*len(config['bioKeys']),h)),('bio.bias',(3*len(config['bioKeys']),))]:
        result[name]=torch.arange(__import__('math').prod(shape),dtype=dtype).reshape(shape)+offset
    for key,bank in config['banks'].items():
        prefix='classes.'+str(config['keys'].index(key))
        result[prefix+'.weight']=torch.arange(len(bank)*h,dtype=dtype).reshape(len(bank),h)+offset
        result[prefix+'.bias']=torch.arange(len(bank),dtype=dtype)+offset
    return result

class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.old,self.new=configs()
        self.before=state(self.old,10)
        self.fresh=state(self.new,100)
        self.plan=trainer.weight_migration_plan(self.old,self.new)
        self.old_copy={k:v.clone()for k,v in self.before.items()}
        self.fresh_copy={k:v.clone()for k,v in self.fresh.items()}

    def apply(self,**kwargs):
        return migration.apply_weight_migration(self.old,self.new,self.plan,self.before,self.fresh,**kwargs)

    def assert_unchanged(self):
        for source,snapshot in ((self.before,self.old_copy),(self.fresh,self.fresh_copy)):
            for key in source:
                self.assertTrue(torch.equal(source[key],snapshot[key]),key)

    def test_semantic_permutation_preserves_embedding_presence_bio_and_class_logits(self):
        result=self.apply();self.assertTrue(result['ok'],result)
        got=result['state'];x=torch.tensor([.25,.5,1.])
        for key in self.old['keys']:
            oi=self.old['keys'].index(key);ni=self.new['keys'].index(key)
            self.assertTrue(torch.equal(got['key.weight'][ni],self.before['key.weight'][oi]))
            self.assertEqual(float(got['presence.weight'][ni]@x+got['presence.bias'][ni]),
                             float(self.before['presence.weight'][oi]@x+self.before['presence.bias'][oi]))
            ob=self.old['bioKeys'].index(key)*3;nb=self.new['bioKeys'].index(key)*3
            self.assertTrue(torch.equal(got['bio.weight'][nb:nb+3]@x+got['bio.bias'][nb:nb+3],
                                        self.before['bio.weight'][ob:ob+3]@x+self.before['bio.bias'][ob:ob+3]))
        old_logits=self.before['classes.0.weight']@x+self.before['classes.0.bias']
        new_logits=got['classes.2.weight']@x+got['classes.2.bias']
        for i,entry in enumerate(self.new['banks']['a']):
            old_index=self.old['banks']['a'].index(entry)
            self.assertEqual(float(new_logits[i]),float(old_logits[old_index]))
        self.assert_unchanged()

    def test_new_type_rows_retain_fresh_initializers_and_no_aliases(self):
        result=self.apply();self.assertTrue(result['ok'],result);got=result['state']
        for name in ('key.weight','presence.weight','presence.bias'):
            self.assertTrue(torch.equal(got[name][0],self.fresh[name][0]))
        for name in ('classes.0.weight','classes.0.bias'):
            self.assertTrue(torch.equal(got[name],self.fresh[name]))
        for key,tensor in got.items():
            self.assertNotEqual(tensor.data_ptr(),self.fresh[key].data_ptr())
            if key in self.before:
                self.assertNotEqual(tensor.data_ptr(),self.before[key].data_ptr())
        self.assertIsNone(result['optimizerState'])
        got['key.weight'].zero_()
        self.assert_unchanged()

    def test_encoder_copy_requires_exact_provenance_and_shape(self):
        for mutate in ('path','sha','shape','name'):
            old,new=configs();before=state(old,10);fresh=state(new,100)
            if mutate=='path':new['encoder']='different'
            elif mutate=='sha':new['encoderFiles']['config.json']='c'*64
            elif mutate=='shape':fresh['encoder.weight']=torch.ones((3,2))
            else:fresh['encoder.other']=fresh.pop('encoder.weight')
            result=migration.apply_weight_migration(old,new,trainer.weight_migration_plan(old,new),before,fresh)
            self.assertFalse(result['ok'],mutate);self.assertIsNone(result['state'])
        good=self.apply()
        self.assertTrue(torch.equal(good['state']['encoder.weight'],self.before['encoder.weight']))

    def test_typed_bank_values_and_new_class_rows(self):
        old,new=configs()
        values=[{'state':'value','value':1},{'state':'value','value':'1'},{'state':'value','value':True},
                {'state':'value','value':'<ABSENT>'}]
        old['banks']['a']=[ABSENT,UNKNOWN]+values
        new['banks']['a']=[values[3],UNKNOWN,values[1],ABSENT,values[2],values[0],{'state':'value','value':'new'}]
        before=state(old,10);fresh=state(new,100)
        result=migration.apply_weight_migration(old,new,trainer.weight_migration_plan(old,new),before,fresh)
        self.assertTrue(result['ok'],result)
        for ni,entry in enumerate(new['banks']['a'][:-1]):
            oi=next(i for i,v in enumerate(old['banks']['a'])if migration.canonical(v)==migration.canonical(entry))
            self.assertTrue(torch.equal(result['state']['classes.2.weight'][ni],before['classes.0.weight'][oi]))
        self.assertTrue(torch.equal(result['state']['classes.2.weight'][-1],fresh['classes.2.weight'][-1]))

    def test_malformed_plans_refuse_atomically(self):
        for change in ('missing','duplicate','positional','new-row','bool-row','foreign','policy'):
            plan=copy.deepcopy(self.plan)
            if change=='missing':plan['rowPlans'].pop()
            elif change=='duplicate':plan['rowPlans'].append(copy.deepcopy(plan['rowPlans'][0]))
            elif change=='positional':plan['rowPlans'][0]['rows']=[[0,0],[1,1]]
            elif change=='new-row':plan['initializedClasses']=[]
            elif change=='bool-row':plan['rowPlans'][0]['rows'][0][0]=False
            elif change=='foreign':plan['rowPlans'][0]['source']='optimizer.state'
            else:plan['appliesWeights']=True
            result=migration.apply_weight_migration(self.old,self.new,plan,self.before,self.fresh)
            self.assertFalse(result['ok'],change);self.assertIsNone(result['state']);self.assert_unchanged()

    def test_duplicate_keys_bank_entries_and_changed_semantics_refuse(self):
        for change in ('keys','bank','semantics','version'):
            new=copy.deepcopy(self.new)
            if change=='keys':new['keys'].append('a')
            elif change=='bank':new['banks']['a'].append(copy.deepcopy(new['banks']['a'][0]))
            elif change=='semantics':new['registry']['a']['concept']='changed'
            else:new['format']='sop.key-reader/1'
            result=migration.apply_weight_migration(self.old,new,self.plan,self.before,self.fresh)
            self.assertFalse(result['ok'],change);self.assertIsNone(result['state']);self.assert_unchanged()

    def test_missing_foreign_shape_nonfinite_and_meta_tensors_refuse(self):
        for change in ('missing','foreign','shape','source-nan','fresh-inf','meta'):
            before={k:v.clone()for k,v in self.before.items()};fresh={k:v.clone()for k,v in self.fresh.items()}
            if change=='missing':before.pop('presence.bias')
            elif change=='foreign':before['optimizer.momentum']=torch.ones(1)
            elif change=='shape':fresh['presence.weight']=torch.zeros((3,4))
            elif change=='source-nan':before['encoder.weight'][0,0]=float('nan')
            elif change=='fresh-inf':fresh['classes.0.weight'][0,0]=float('inf')
            else:before['encoder.weight']=torch.empty((2,3),device='meta')
            result=migration.apply_weight_migration(self.old,self.new,self.plan,before,fresh)
            self.assertFalse(result['ok'],change);self.assertIsNone(result['state'])
        self.assert_unchanged()

    def test_work_limits_refuse_atomically(self):
        for options in ({'max_elements':1},{'max_tensors':1},{'max_rows':1},{'max_elements':True}):
            result=self.apply(**options)
            self.assertFalse(result['ok'],options);self.assertIsNone(result['state']);self.assert_unchanged()

    def test_exact_dtype_promotion_and_lossy_conversion(self):
        old,new=configs();before=state(old,10,dtype=torch.bfloat16);fresh=state(new,100)
        result=migration.apply_weight_migration(old,new,trainer.weight_migration_plan(old,new),before,fresh)
        self.assertTrue(result['ok'],result)
        before=state(old,10);fresh=state(new,100,dtype=torch.bfloat16)
        before['encoder.weight'][0,0]=1.001
        result=migration.apply_weight_migration(old,new,trainer.weight_migration_plan(old,new),before,fresh)
        self.assertFalse(result['ok']);self.assertEqual(result['issues'][0]['reason'],'lossy-dtype-conversion')

if __name__=='__main__':
    unittest.main()
