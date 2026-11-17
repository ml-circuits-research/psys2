"""Review26 synthetic CPU gradients only; no encoder/checkpoint/data processing."""
import ast,copy,hashlib,importlib.util,math,os
from pathlib import Path
import unittest
import torch
P=Path(__file__).with_name('train-key-reader.py')
spec=importlib.util.spec_from_file_location('review26',P);train=importlib.util.module_from_spec(spec);spec.loader.exec_module(train)
def config(keys=('x',)):
    return {'keys':list(keys),'bioKeys':list(keys),'registry':{k:{'role':'domain'}for k in keys},'banks':{},'metadataKeys':[],'trainingObjective':copy.deepcopy(train.TRAINING_OBJECTIVE)}
def tensors(*,positive=True,batch=1,length=4):
    bio=torch.tensor([[[[0.,0.,0.],[2.,-2.,-2.],[3.,-3.,-3.],[0.,0.,0.]]]],requires_grad=True).expand(batch,1,length,3).clone().detach().requires_grad_()
    presence=torch.full((batch,1),2. if positive else -2.,requires_grad=True)
    gold=torch.tensor([[[-100,1 if positive else 0,0,-100]]]).expand(batch,1,length).clone()
    pgold=torch.full((batch,1),float(positive));source=torch.tensor([[False,True,True,False]]).expand(batch,length).clone()
    attention=torch.ones(batch,length,dtype=torch.long);truncated=torch.zeros(batch,dtype=torch.bool)
    return [bio,presence,gold,pgold,source,attention,truncated]
def loss(t,c=None):return train.presence_bio_consistency(*t,c or config())
class ConsistencyTests(unittest.TestCase):
    def test_gradients_join_both_disagreeing_heads_in_both_directions(self):
        for positive in [True,False]:
            t=tensors(positive=positive)
            if not positive:
                with torch.no_grad():t[0][0,0,1]=torch.tensor([-2.,2.,-2.])
            value=loss(t);self.assertGreater(value.item(),0);self.assertLessEqual(value.item(),math.log(2)+1e-6)
            value.backward();self.assertGreater(t[1].grad.item()*(1 if positive else -1),0)
            self.assertLess(t[0].grad[0,0,1,1].item()*(1 if positive else -1),0)
            with torch.no_grad():t[0].sub_(t[0].grad*.1);t[1].sub_(t[1].grad*.1)
            self.assertLess(loss(t).item(),value.item())
    def test_agreement_zero_deterministic_and_no_label_mutation(self):
        t=tensors();before=[x.clone()for x in t[2:]]
        with torch.no_grad():t[1].zero_();t[0][0,0,1]=torch.tensor([0.,math.log(2),0.])
        a=loss(t);b=loss(t);self.assertTrue(torch.equal(a,b));self.assertAlmostEqual(a.item(),0,places=6)
        a.backward();self.assertTrue(torch.isfinite(t[0].grad).all())
        for a,b in zip(t[2:],before):self.assertTrue(torch.equal(a,b))
    def test_unknown_partial_truncated_contradictory_or_illegal_supervision_ignored(self):
        for change in [lambda t:t[3].fill_(-100),lambda t:t[2].fill_(-100),lambda t:t[2].__setitem__((0,0,2),-100),lambda t:t[6].fill_(True),lambda t:t[3].fill_(0),lambda t:t[2].__setitem__((0,0,1),2),lambda t:t[4].fill_(False)]:
            t=tensors();change(t);value=loss(t);self.assertEqual(value.item(),0);value.backward();self.assertEqual(t[0].grad.abs().sum().item(),0);self.assertEqual(t[1].grad.abs().sum().item(),0)
    def test_context_padding_and_ignored_nonfinite_logits_never_contribute(self):
        t=tensors();base=loss(t).item()
        with torch.no_grad():t[0][0,0,0]=float('nan');t[0][0,0,3]=float('inf')
        self.assertAlmostEqual(loss(t).item(),base);loss(t).backward();self.assertTrue(torch.isfinite(t[0].grad).all());self.assertEqual(t[0].grad[0,0,[0,3]].abs().sum().item(),0)
        ignored=tensors();ignored[2].fill_(-100)
        with torch.no_grad():ignored[0].fill_(float('nan'));ignored[1].fill_(float('inf'))
        z=loss(ignored);self.assertEqual(z.item(),0);z.backward();self.assertTrue(torch.isfinite(ignored[0].grad).all())
    def test_extreme_logits_finite_and_nonfinite_active_logits_refuse(self):
        t=tensors()
        with torch.no_grad():t[0][0,0,1:3]=torch.tensor([1000.,-1000.,-1000.]);t[1].fill_(1000.)
        value=loss(t);self.assertAlmostEqual(value.item(),math.log(2),places=5);value.backward();self.assertTrue(torch.isfinite(t[0].grad).all());self.assertTrue(torch.isfinite(t[1].grad).all())
        for tensor,index in [(t[0],(0,0,1,0)),(t[1],(0,0))]:
            with torch.no_grad():tensor[index]=float('nan')
            with self.assertRaisesRegex(ValueError,'nonfinite-consistency'):loss(t)
            with torch.no_grad():tensor[index]=0
    def test_key_and_stratum_normalization_does_not_count_common_absence_repeatedly(self):
        a=tensors();b=tensors(positive=False)
        mixed=[torch.cat((x,y),dim=0)for x,y in zip(a,b)]
        expected=(loss(a)+loss(b))/2;self.assertAlmostEqual(loss(mixed).item(),expected.item(),places=6)
        repeated=[torch.cat((x,y,y,y),dim=0)for x,y in zip(a,b)]
        self.assertAlmostEqual(loss(repeated).item(),expected.item(),places=6)
        # Duplicate another identical key: mean remains unchanged, not a sum.
        two=[mixed[0].repeat(1,2,1,1),mixed[1].repeat(1,2),mixed[2].repeat(1,2,1),mixed[3].repeat(1,2),*mixed[4:]]
        self.assertAlmostEqual(loss(two,config(('x','y'))).item(),expected.item(),places=6)
    def test_no_noisy_or_length_inflation_and_no_metadata_or_class_only_coupling(self):
        t=tensors();more=[torch.cat((t[0],t[0][:,:,2:3]),dim=2),t[1],torch.cat((t[2],torch.zeros(1,1,1,dtype=torch.long)),dim=2),t[3],torch.cat((t[4],torch.ones(1,1,dtype=torch.bool)),dim=1),torch.ones(1,5,dtype=torch.long),t[6]]
        self.assertAlmostEqual(loss(t).item(),loss(more).item(),places=6)
        c=config();c['registry']['x']['role']='metadata';self.assertEqual(loss(t,c).item(),0)
        c=config();c['registry']['x']['bio']=False;self.assertEqual(loss(t,c).item(),0)
    def test_shape_errors_refuse(self):
        t=tensors();t[4]=t[4].long()
        with self.assertRaisesRegex(ValueError,'mask-shapes'):loss(t)

class EncodingTests(unittest.TestCase):
    def test_source_mask_uses_sequence_offsets_attention_and_keeps_unknown_labels(self):
        class Enc(dict):
            def sequence_ids(self):return [None,0,0,None,1,None,None]
        class Tokenizer:
            def __call__(self,text,context,**kw):
                if kw.get('truncation')is False:return {'input_ids':[1]*6}
                return Enc(input_ids=[101,1,2,102,3,102,0],attention_mask=[1,1,1,1,1,1,0],offset_mapping=[(0,0),(0,1),(1,2),(0,0),(0,3),(0,0),(0,0)])
        c=config();c.update(maxLength=7)
        row={'area':'toy','context':{},'text':'ab','coveredKeys':['x'],'unknownBIOKeys':['x'],'globals':{},'mentions':[],'version':'v2','id':'toy'}
        encoded=train.encode(row,Tokenizer(),c)
        self.assertEqual(encoded['source_mask'].tolist(),[False,True,True,False,False,False,False]);self.assertTrue((encoded['bio']==-100).all());self.assertEqual(encoded['presence'].tolist(),[0.])

SAFEGUARD_HASHES={'bio_mentions':'8a0f34473d56c8805368d127bf0d0c7beecf85511afbe9717a8b99f04836ca90','evaluate':'d20c6e7ea8512e6896857328c330370324c4b6daca5037cdde6b48cf3be910e3','selection_rank': '0b075c25df262fbbaf1ed7671b08d6b04ad9de0f8683420d84b9bac4fc595249', 'training_policy': '49c9d7e6525d9208babde5c42049db3c04ef342210ea5bb10aa241d1ab15f525', 'advance_plateau': '4cd436cd7d73524a590b0e0f51959e25031b5c06cd6ed73d2c0357c8257d750e', 'build_model': 'cbcd5a2e390a1aba6f5bfc7431125347f8b862b7e30e48d36d91ac0bfcf0cf33', 'evaluate_compacted_checkpoint': '0eab731781ede0000a351536ef60f20294b8b99786247ce2f56b7b5246e5faa1', 'publish_compact_checkpoint': 'f4029bd2754e38434e09bdee3386039d297cf48defdbb5949489d1b13fbdfebd', 'publish_first_epoch_proof': 'f9e79a319541789bdd1ca18d7a9aead61a5c5b999999482657391af7f9586c69', 'verify_first_epoch_receipt': '5fc50b43f8294cd93a10274b331daa97b1b24dbc13b8244655e88b27a46078ed'}

class ArchitectureTests(unittest.TestCase):
    def test_frozen_architecture_and_checkpoint_plateau_safeguards_unchanged(self):
        # Source digests only; no imported encoder, checkpoint, dataset or model file.
        expected=SAFEGUARD_HASHES
        tree=ast.parse(P.read_text())
        found={n.name:hashlib.sha256(ast.get_source_segment(P.read_text(),n).encode()).hexdigest()for n in tree.body if isinstance(n,ast.FunctionDef)}
        for name,digest in expected.items():self.assertEqual(found[name],digest,name)
    def test_profile_records_objective_without_new_tensor_or_raw_codec(self):
        spec=importlib.util.spec_from_file_location('prep',P.with_name('prepare-key-reader.py'));prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
        import json
        inventory=json.loads((P.parent/'tests/fixtures/target-type-inventory.json').read_text())
        c=train.configuration({'format':prep.CANDIDATE_FORMAT,'registry':prep.registry(inventory),'inventorySha256':'a'*64,'exclusionSha256':'b'*64,'targetFamilies':prep.target_families(inventory)})
        self.assertEqual((len(c['keys']),len(c['bioKeys']),len(c['banks'])),(135,122,63));self.assertEqual(c['tensorArchitectureVersion'],2)
        self.assertEqual(c['trainingObjective']['coefficient'],.1);self.assertIn('/5-',c['trainingSourceFormat']);self.assertIn('/2-',c['format']);self.assertIn('/2-',c['rawCodecFormat'])
        self.assertNotIn('request.target.type',c['bioKeys'])

class ObjectiveIntegrationTests(unittest.TestCase):
    def test_original_weighted_supervised_loss_and_class_query_code_preserved(self):
        tree=ast.parse(P.read_text());node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='objective')
        prefix=ast.get_source_segment(P.read_text(),node).split('    base=torch.stack(losses).mean()')[0]
        self.assertEqual(hashlib.sha256(prefix.encode()).hexdigest(),BASE_LOSS_PREFIX_SHA)
    def test_consistency_added_outside_base_mean_without_weight_change(self):
        t=tensors()
        class Tiny(torch.nn.Module):
            def __init__(self):super().__init__();self.bio=torch.nn.Parameter(t[0].detach().clone());self.presence=torch.nn.Parameter(t[1].detach().clone())
            def forward(self,ids,mask):return torch.zeros(1,4,2),self.bio,self.presence
        model=Tiny();row={'input_ids':torch.arange(4),'attention_mask':t[5][0],'source_mask':t[4][0],'bio':t[2][0],'presence':t[3][0],'classes':{},'mentions':[],'truncated':False}
        weights=[torch.tensor([1.,3.,2.])]
        out,bio,gold=train.objective(model,[row],config(),'cpu',weights)
        valid=t[2][:,0]!=-100
        base=(torch.nn.functional.cross_entropy(model.bio[:,0][valid],t[2][:,0][valid],weight=weights[0])+torch.nn.functional.binary_cross_entropy_with_logits(model.presence,t[3]))/2
        auxiliary=train.presence_bio_consistency(model.bio,model.presence,*t[2:],config())
        self.assertTrue(torch.allclose(out,base+.1*auxiliary));out.backward();self.assertTrue(torch.isfinite(model.bio.grad).all());self.assertTrue(torch.isfinite(model.presence.grad).all())

BASE_LOSS_PREFIX_SHA='33b27f0a944ee9f611ae2775ac9be833b6660c83d98680b614a90433e44c8191'
