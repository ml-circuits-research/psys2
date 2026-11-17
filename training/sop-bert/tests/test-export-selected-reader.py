"""Tiny metadata/opaque-byte fixtures only: never reads trained weights or GPU."""
import copy,hashlib,importlib.util,json,tempfile,unittest,os
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parent.parent
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('selected_export',ROOT/'export-selected-reader.py');fixtures=load('proof_fixtures',ROOT/'candidates/target-type/test_artifact_loading.py')
class SelectedTests(unittest.TestCase):
 def metadata(self,root,first=False):
  c,a,data,h=fixtures.fixture()if first else fixtures.final_fixture();paths={}
  if not first:a.update(bestCheckpointEpoch=7,epochsCompleted=10);a['stopping'].update(epoch=10,badEpochs=3)
  for key,body in [('trainer',b'# fixture trainer'),('preparer',b'# fixture preparer')]:
   p=root/(key+'.py');p.write_bytes(body);paths[key]=p;h[key]=m.file_hash(p)
  data['scriptSha256']=h['preparer'];p=root/'data.json';p.write_text(json.dumps(data));paths['dataManifest']=p;h['dataManifest']=m.file_hash(p)
  c.update(trainerSha256=h['trainer'],preparerSha256=h['preparer'],dataManifestSha256=h['dataManifest']);p=root/'config.json';p.write_text(json.dumps(c));paths['config']=p;h['config']=m.file_hash(p)
  a.update(**{k+'Sha256':h[k]for k in ['trainer','preparer','config','dataManifest']});p=root/'run.json';p.write_text(json.dumps(a));paths['artifact']=p;h['artifact']=m.file_hash(p)
  return paths,h
 def cutter(self,root):
  graph=root/'old-cutter.onnx';graph.write_bytes(b'opaque frozen cutter');graph.chmod(0o444);proof=root/'cutter-proof.json';proof.write_text('{}')
  return {'graph':str(graph),'descriptor':{'path':graph.name,'sha256':m.file_hash(graph),'bytes':graph.stat().st_size},'proofPath':str(proof),'proofSha256':m.file_hash(proof),'manifestSha256':'a'*64}
 def test_metadata_without_checkpoint_reads_and_selected_not_last(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as d:
   paths,h=self.metadata(Path(d));v=m.verify_selected_metadata(paths,h);self.assertEqual(v['proof']['checkpointEpoch'],7);self.assertEqual(v['artifact']['epochsCompleted'],10);self.assertFalse(v['checkpointRead']);bad={**h,'config':'f'*64}
   with self.assertRaisesRegex(ValueError,'hash'):m.verify_selected_metadata(paths,bad)
   (paths['artifact']).write_text('{}')
   with self.assertRaisesRegex(ValueError,'hash'):m.verify_selected_metadata(paths,h)
 def test_first_epoch_not_selected_and_symlinks_refused(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as d:
   paths,h=self.metadata(Path(d),first=True)
   with self.assertRaisesRegex(ValueError,'completed-run-selected'):m.verify_selected_metadata(paths,h)
   alias=Path(d)/'alias';alias.symlink_to(paths['config']);paths['config']=alias
   with self.assertRaisesRegex(ValueError,'symlink'):m.verify_selected_metadata(paths,h)
 def test_exclusive_bounded_export_failure_cleanup_and_exact_reuse(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as d:
   root=Path(d);paths,h=self.metadata(root);v=m.verify_selected_metadata(paths,h);c=self.cutter(root);out=root/'export'
   with patch.object(m,'key_graph_bytes',return_value=iter([('encoder',b'tiny encoder'),('heads',b'tiny heads')])):
    r=m.export_selected_components(None,v,c,out,None,max_new_bytes=16384,reserve_bytes=1)
   self.assertEqual((out/'cutter.q8.onnx').stat().st_ino,Path(c['graph']).stat().st_ino);self.assertGreater(r['totalNewBytes'],r['newBytesBeforeReceipt']);self.assertEqual((out/'key-run.json').read_bytes(),paths['artifact'].read_bytes());self.assertEqual(sum(p.stat().st_size for p in out.iterdir())-c['descriptor']['bytes'],r['totalNewBytes'])
   with self.assertRaisesRegex(ValueError,'already-exists'):m.export_selected_components(None,v,c,out,None,max_new_bytes=16384,reserve_bytes=1)
   for count in [1,40]:
    failed=root/('fail'+str(count))
    def broken(*args):
     yield 'encoder',b'one'
     if count==40:raise ValueError('synthetic second component failure')
     yield 'heads',b'two'
    with patch.object(m,'key_graph_bytes',broken):
     with self.assertRaises(ValueError):m.export_selected_components(None,v,c,failed,None,max_new_bytes=count,reserve_bytes=1)
    self.assertFalse(failed.exists());self.assertEqual(Path(c['graph']).read_bytes(),b'opaque frozen cutter')
 def test_separate_cutter_proof_and_exact_descriptor_refuse_corruption(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as d:
   root=Path(d);c=self.cutter(root);config='{}';manifest={'files':{'cutter':c['descriptor']},'cutterSha256':c['descriptor']['sha256'],'cutterConfigJSON':config,'cutterConfigSha256':m.digest(config.encode()),'cutterCheckpointSha256':'a'*64,'cutterTrainerSha256':'b'*64,'cutterCodecSha256':'c'*64};p=root/'manifest.json';p.write_text(json.dumps(manifest));proof={'format':'sop.request-cutter-run/1','complete':True,'confidenceCalibrated':False,'executionEligible':False,'checkpointSha256':manifest['cutterCheckpointSha256'],'configSha256':manifest['cutterConfigSha256'],'trainerSha256':manifest['cutterTrainerSha256']};Path(c['proofPath']).write_text(json.dumps(proof));proofsha=m.file_hash(c['proofPath']);r=m.verify_frozen_cutter(p,m.file_hash(p),c['proofPath'],proofsha);self.assertEqual(r['checkpointSha256'],'a'*64)
   proof['complete']=False;Path(c['proofPath']).write_text(json.dumps(proof))
   with self.assertRaisesRegex(ValueError,'correlation'):m.verify_frozen_cutter(p,m.file_hash(p),c['proofPath'],m.file_hash(c['proofPath']))
   with self.assertRaisesRegex(ValueError,'hash'):m.verify_frozen_cutter(p,'f'*64,c['proofPath'],proofsha)
 def test_forged_artifact_bytes_not_used_and_preflight_reserve(self):
  with tempfile.TemporaryDirectory(dir=Path(__file__).parent)as d:
   root=Path(d);paths,h=self.metadata(root);v=m.verify_selected_metadata(paths,h);v['artifactBytes']=b'forged';c=self.cutter(root)
   with patch.object(m,'key_graph_bytes',return_value=iter([('encoder',b'e'),('heads',b'h')])):
    m.export_selected_components(None,v,c,root/'out',None,max_new_bytes=16384,reserve_bytes=1)
   self.assertEqual((root/'out/key-run.json').read_bytes(),paths['artifact'].read_bytes())
   with self.assertRaisesRegex(ValueError,'preflight'):m.export_selected_components(None,v,c,root/'huge',None,max_new_bytes=2**40,reserve_bytes=1)
class ActualTinyTests(unittest.TestCase):
 def test_serial_ram_export_actual_ort_and_no_cutter_export(self):
  import torch,onnxruntime as ort,numpy as np
  fixture=load('tiny_export_fixture',ROOT/'tests/test-export-reader-onnx.py');torch.set_num_threads(2);model=fixture.Key().eval();config=fixture.config();ids,mask=fixture.inputs(1,6);spans=torch.tensor([[0,1],[1,3],[2,4]]);keys=torch.tensor([-1,1,1]);examples=(ids,mask,spans,keys,[False,True,True,True,True,False])
  with patch('tempfile.TemporaryDirectory',side_effect=AssertionError('FP32 disk temporary forbidden')),patch('onnx.save_model',side_effect=AssertionError('FP32 save forbidden')):
   components=dict(m.key_graph_bytes(model,config,examples))
  self.assertEqual(set(components),{'encoder','heads'});opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
  enc=ort.InferenceSession(components['encoder'],sess_options=opts,providers=['CPUExecutionProvider']);head=ort.InferenceSession(components['heads'],sess_options=opts,providers=['CPUExecutionProvider'])
  for batch,length in [(1,5),(2,8)]:
   ti,tm=fixture.inputs(batch,length);hidden,bio,presence=enc.run(None,{'input_ids':ti.numpy(),'attention_mask':tm.numpy()});self.assertEqual(hidden.shape,(batch,length,8));self.assertTrue(np.isfinite(bio).all());self.assertEqual(presence.shape,(batch,3))
   logits=head.run(None,{'hidden':hidden[0],'spans':spans.numpy(),'key_indices':keys.numpy()})[0];self.assertEqual(logits.shape,(3,12));self.assertTrue(np.isfinite(logits).all())
if __name__=='__main__':unittest.main()
