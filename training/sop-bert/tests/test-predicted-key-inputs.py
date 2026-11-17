import copy,importlib.util,json,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('builder',Path(__file__).parents[1]/'prepare-predicted-key-inputs.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
MODEL={'sha256':'a'*64,'tokenizerSha256':'b'*64,'codecSha256':'c'*64,'decoderVersion':1}
class BuilderTests(unittest.TestCase):
    def records(self,text='😀red blue',spans=None):
        return ([{'id':'source:0','text':text}],[{'id':'source:0','prediction':{'source':{'text':text,'unit':'unicode-scalar'},'spans':[[0,4],[5,9]] if spans is None else spans,'coverage':{'complete':True,'truncated':False},'unresolved':[],'model':MODEL}}],[{'id':'source:0','area':'Drawing','context':{'existing':[]}}])
    def test_predicted_unicode_substrings_and_dependencies(self):
        result=m.prepare(*self.records(),MODEL)
        self.assertEqual([r['text'] for r in result['inputs']],['😀red','blue'])
        self.assertEqual([r['sourceRange'] for r in result['origins']],[[0,4],[5,9]])
        self.assertEqual(result['messages'][0]['unresolved'],['request-dependencies-unknown'])
        self.assertEqual(set(result['inputs'][0]),{'id','text','area','context'})
        self.assertFalse(result['executionEligible'])
    def test_all_o_is_empty_not_semantic_success(self):
        result=m.prepare(*self.records(spans=[]),MODEL)
        self.assertEqual(result['inputs'],[]);self.assertEqual(result['messages'][0]['status'],'empty')
    def test_invalid_whole_cut_never_partially_prepares(self):
        for spans in [[[0,4],[3,8]],[[0,4],[6,99]],[[True,4]],[[4,4]]]:
            result=m.prepare(*self.records(spans=spans),MODEL)
            self.assertEqual(result['inputs'],[]);self.assertEqual(result['counts']['refused'],1)
    def test_truncation_unknown_and_source_mismatch_refuse(self):
        for field,value in [('coverage',{'complete':1,'truncated':False}),('model',{**MODEL,'decoderVersion':True}),('coverage',{'complete':True,'truncated':True}),('unresolved',['unknown']),('source',{'text':'other','unit':'unicode-scalar'})]:
            a,b,c=self.records();b[0]['prediction'][field]=value
            self.assertEqual(m.prepare(a,b,c,MODEL)['inputs'],[])
    def test_missing_mismatched_duplicate_context_and_gold_fields_reject(self):
        for mutation in ['missing','duplicate','mismatch','gold']:
            a,b,c=self.records()
            if mutation=='missing':c=[]
            elif mutation=='duplicate':c+=copy.deepcopy(c)
            elif mutation=='mismatch':b[0]['id']='other'
            else:a[0]['requests']=[]
            with self.assertRaises(ValueError):m.prepare(a,b,c,MODEL)
    def test_hash_chain_and_output_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);a,b,c=self.records();paths={key:root/(key+'.jsonl') for key in ['sources','predictions','contexts']}
            for key,rows in zip(paths,[a,b,c]):paths[key].write_text(''.join(json.dumps(row)+'\n'for row in rows))
            manifest=root/'cutter.json';manifest.write_text(json.dumps({'format':'sop.request-cutter-prediction-run/1','complete':True,'executionEligible':False,'frozenInputs':{'input':m.digest(paths['sources'])},'outputSha256':m.digest(paths['predictions']),'rows':1,'model':MODEL}))
            args=SimpleNamespace(**paths,manifest=manifest,manifest_sha256=m.digest(manifest),contexts_sha256=m.digest(paths['contexts']),out=root/'out')
            m.run(args);proof=json.loads((args.out/'manifest.json').read_text());self.assertTrue(proof['complete']);self.assertEqual(proof['counts']['requests'],2)
            paths['predictions'].write_text('')
            with self.assertRaisesRegex(ValueError,'chain-mismatch'):m.run(args)
if __name__=='__main__':unittest.main()
