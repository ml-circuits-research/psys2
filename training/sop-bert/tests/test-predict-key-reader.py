import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('predictor',Path(__file__).parents[1]/'predict-key-reader.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class PredictorTests(unittest.TestCase):
    def fixture(self):
        keys=['request.target.kind','drawing.drawn.colour','request.constraint.phase']
        config={'format':'sop.key-reader/1','keys':keys,'bioKeys':keys[:2],'metadataKeys':[keys[2]],'banks':{keys[2]:[{'state':'absent'},{'state':'unknown'},{'state':'value','value':'selector'},{'state':'value','value':'result'}]},'registry':{keys[0]:{'role':'global'},keys[1]:{'role':'domain','area':'Drawing','type':'drawn','key':'colour'},keys[2]:{'role':'metadata'}}}
        text='shape red blue';offsets=[[0,0],[0,5],[6,9],[10,14],[0,0],[0,6]];seq=[None,0,0,0,None,1];attention=[1]*6
        o=[3,0,0];b=[0,3,0]
        bio=[[o,b,o,o,o,b],[o,o,b,b,o,b]]
        mentions={(keys[1],2,3):{keys[2]:[0,0,3,0]},(keys[1],3,4):{keys[2]:[0,0,0,3]}}
        return config,text,bio,mentions,offsets,seq,attention
    def predict(self,change=None):
        c,t,b,mentions,offsets,seq,att=self.fixture()
        if change:change(c,b,mentions)
        return m.normalize(c,t,'Drawing',b,[1,1,1],{},mentions,offsets,seq,att,{'sha256':'fixture'},{c['keys'][0]:'target.kind'},{c['keys'][2]:'phase'})
    def test_repeated_mentions_keep_distinct_metadata_and_ignore_context(self):
        packet,mentions=self.predict()
        self.assertEqual([c['phase']for c in packet['request']['constraints']],['selector','result'])
        self.assertEqual([c['value']for c in packet['request']['constraints']],['red','blue'])
        self.assertEqual(len(mentions),2)
        self.assertEqual(packet['request']['target'],{'kind':'shape','kind_span':'shape'})
        self.assertEqual([x['reason']for x in packet['unresolved']],['target-type-requires-declared-kind-route'])
        self.assertFalse(packet['coverage']['complete'])
    def test_canonical_source_proof_survives_unfamiliar_domain_and_wrong_classifier(self):
        c,t,b,mentions,offsets,seq,att=self.fixture();old=c['keys'][1];key='quasar.surface.finish'
        c['keys'][1]=key;c['bioKeys'][1]=key;c['registry'][key]={**c['registry'].pop(old),'area':'quasar','type':'surface','key':'finish'}
        c['banks'][key]=[{'state':'absent'},{'state':'unknown'}]+[{'state':'value','value':v}for v in ['amber','red','blue']]
        queries={(key,a,z):{**v,key:[0,0,8,0,0]}for(_,a,z),v in mentions.items()}
        packet,proofs=m.normalize(c,t,'quasar',b,[1,1,1],{},queries,offsets,seq,att,{}, {c['keys'][0]:'target.kind'},{c['keys'][2]:'phase'})
        self.assertEqual([c['value']for c in packet['request']['constraints']],['red','blue'])
        self.assertTrue(all(p['valueProof']['classifier']['value']=='amber'and p['valueProof']['disagrees']for p in proofs))
        self.assertTrue(all(p['valueProof']['classifier']['probability']>.9 for p in proofs))
    def test_typed_count_accepts_only_complete_safe_positive_integer(self):
        c={'format':'sop.key-reader/1','keys':['count'],'bioKeys':['count'],'metadataKeys':[],'banks':{},'registry':{'count':{'role':'global'}}}
        packet,proofs=m.normalize(c,'23','quasar',[[[0,3,0]]],[1],{}, {},[[0,2]],[0],[1],{}, {'count':'target.count'},{})
        self.assertEqual(packet['request']['target'],{'count':23,'count_span':'23'})
        self.assertNotIn('unresolved-numeric-normalization',[r['reason']for r in packet['unresolved']])
        self.assertEqual(proofs[0]['valueProof']['kind'],'positive-safe-integer')
        self.assertEqual(packet['ranges'],[{'path':['target','count_span'],'range':[0,2]}])
    def test_unknown_metadata_and_invalid_bio_remain_unresolved(self):
        def change(c,b,mentions):
            mentions[('drawing.drawn.colour',2,3)]['request.constraint.phase']=[0,3,0,0]
            b[0][1]=[0,0,3]
        packet,_=self.predict(change)
        self.assertIn('unknown-class',[x['reason']for x in packet['unresolved']])
        self.assertIn('illegal-I-after-O',[x['reason']for x in packet['unresolved']])
    def test_ties_nonfinite_malformed_logits(self):
        for values in [[1,1,0],[float('nan'),0,1],None]:
            spans,error=m.key_spans([values],[[0,1]],[0],[1],1)
            self.assertEqual(spans,[]);self.assertEqual(error,'ambiguous-BIO-label')
    def test_unicode_scalar_offsets_and_context_not_copied(self):
        spans,error=m.key_spans([[0,2,0],[0,0,2],[0,2,0]],[[0,1],[1,2],[0,4]],[0,0,1],[1,1,1],2)
        self.assertIsNone(error);self.assertEqual(spans,[{'tokens':[0,2],'range':[0,2]}])
    def test_preparer_chain_and_layout_are_pinned(self):
        config={'dataManifestSha256':'data','keys':['x']}
        manifest={'scriptSha256':'codec'}
        m.verify_codec_chain(config,manifest,'data','codec',lambda _: {'keys':['x']})
        for digest,codec,layout in [('wrong','codec',['x']),('data','wrong',['x']),('data','codec',['other'])]:
            with self.assertRaises(ValueError):m.verify_codec_chain(config,manifest,digest,codec,lambda _: {'keys':layout})
    def test_numeric_copy_is_not_a_typed_count(self):
        c,t,b,mentions,offsets,seq,att=self.fixture()
        packet,_=m.normalize(c,t,'Drawing',b,[1,1,1],{},mentions,offsets,seq,att,{}, {c['keys'][0]:'target.count'}, {c['keys'][2]:'phase'})
        self.assertNotIn('count',packet['request']['target'])
        self.assertEqual(packet['request']['target']['count_span'],'shape')
        self.assertIn('unresolved-numeric-normalization',[x['reason']for x in packet['unresolved']])
    def test_static_support_distinguishes_untrained_from_absent(self):
        c,*_=self.fixture()
        c['keys']+=['derived','unit'];c['registry'].update({'derived':{'role':'derived'},'unit':{'role':'metadata'}})
        rows={r['key']:r for r in m.support(c)}
        self.assertEqual(rows['derived']['presence'],'untrained')
        self.assertEqual(rows['unit']['value'],'unsupported')
        self.assertEqual(rows['unit']['presence'],'learned-uncalibrated')
    def test_normalized_enum_needs_source_proof(self):
        def change(c,b,mentions):
            key='drawing.drawn.colour';c['banks'][key]=[{'state':'absent'},{'state':'unknown'},{'state':'value','value':'<ABSENT>'}]
            for values in mentions.values():values[key]=[0,0,3]
        packet,_=self.predict(change)
        self.assertEqual(packet['request']['constraints'][0]['value'],'<ABSENT>')
        self.assertEqual(sum(x['reason']=='normalization-requires-declared-proof'for x in packet['unresolved']),2)
        self.assertFalse(any(r['path'][-1]=='value'for r in packet['ranges']))

if __name__=='__main__':unittest.main()
