"""CPU fixtures only; never loads a running trained checkpoint."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
SPEC = importlib.util.spec_from_file_location('export_structural', Path(__file__).with_name('export-structural.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
R_FIELDS = ['act','mood','target.type','target.mode','target.fill','target.determiner','target.kind','target.count','target.ordinal','target.quantifier','question.ask','question.asked_key','turn.fragment','turn.objection','turn.repeat_count','turn.area']
C_FIELDS = ['key','value','operator','phase','polarity','character','scope','group','step','measure','unit','variety','anchor_fill']
R_SPANS = ['span','trigger','target.kind_span','target.name_span','target.description_span','target.count_span']
C_SPANS = ['value_span','measure_span','anchor_span']

def config():
    fields = ['r:'+f for f in R_FIELDS] + ['c:'+f for f in C_FIELDS]
    return {'format':'psys2.raw-structural-model/1','maxRequests':2,'maxConstraints':2,'reservedIndices':{'absent':0,'unknown':1},'spanStates':['absent','present','unresolved'],'requestFields':R_FIELDS,'constraintFields':C_FIELDS,'requestSpans':R_SPANS,'constraintSpans':C_SPANS,'banks':{key:[{'kind':'absent'},{'kind':'unknown'},{'kind':'value','value':'<ABSENT>'}] for key in fields}}

class StructuralExportTests(unittest.TestCase):
    def test_all_heads_and_typed_sentinels(self):
        c = config();layout = MODULE.output_layout(c)
        self.assertEqual(len(layout),59)
        self.assertEqual(layout['count'],['batch',4])
        self.assertEqual(layout['conditionCount'],['batch',2,4])
        self.assertEqual(layout['c:value_span:start'],['batch',2,2,'sequence'])
        self.assertEqual(c['banks']['r:act'][2],{'kind':'value','value':'<ABSENT>'})

    def test_missing_or_malformed_heads_refuse(self):
        for mutate in [lambda c:c['banks'].pop('r:act'), lambda c:c.update(reservedIndices={'absent':1,'unknown':0}), lambda c:c['banks']['r:act'].__setitem__(0,{'kind':'value','value':'<ABSENT>'}), lambda c:c['requestSpans'].pop()]:
            c = json.loads(json.dumps(config()));mutate(c)
            with self.assertRaises(ValueError):MODULE.output_layout(c)

    @unittest.skipUnless(os.environ.get('SOP_STRUCTURAL_TRAINER'), 'explicit frozen trainer path required for CPU fixture integration')
    def test_actual_attention_architecture_fixture_export_parity(self):
        import torch
        from transformers import DistilBertConfig,DistilBertModel,PreTrainedTokenizerFast
        from tokenizers import Tokenizer,models,normalizers,pre_tokenizers,processors
        torch.manual_seed(20261117)
        trainer_path = Path(os.environ['SOP_STRUCTURAL_TRAINER'])
        ts = importlib.util.spec_from_file_location('fixture_trainer',trainer_path);trainer=importlib.util.module_from_spec(ts);ts.loader.exec_module(trainer)
        temporary_root=Path(__file__).resolve().parents[2]/'.fixture-temp';temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as temporary:
            root=Path(temporary);encoder=root/'encoder';encoder.mkdir()
            DistilBertModel(DistilBertConfig(vocab_size=12,dim=32,hidden_dim=64,n_layers=1,n_heads=8,dropout=0,attention_dropout=0,max_position_embeddings=32)).save_pretrained(encoder)
            vocabulary={word:i for i,word in enumerate(['[PAD]','[UNK]','[CLS]','[SEP]','[MASK]','invented','source','fixture','area','context','null','a'])}
            tok=Tokenizer(models.WordPiece(vocab=vocabulary,unk_token='[UNK]'));tok.normalizer=normalizers.BertNormalizer(lowercase=True);tok.pre_tokenizer=pre_tokenizers.BertPreTokenizer();tok.post_processor=processors.TemplateProcessing(single='[CLS] $A [SEP]',pair='[CLS] $A [SEP] $B:1 [SEP]:1',special_tokens=[('[CLS]',2),('[SEP]',3)])
            PreTrainedTokenizerFast(tokenizer_object=tok,pad_token='[PAD]',unk_token='[UNK]',cls_token='[CLS]',sep_token='[SEP]',mask_token='[MASK]').save_pretrained(encoder)
            c=config();c.update(encoder=str(encoder),maxLength=24)
            path=root/'model-config.json';path.write_text(json.dumps(c));model=trainer.build_model(c,str(encoder));checkpoint=root/'fixture.pt';torch.save({'model':model.state_dict(),'config':c,'epoch':0,'steps':0},checkpoint)
            args=argparse.Namespace(checkpoint=checkpoint,checkpoint_sha256=MODULE.sha(checkpoint),config=path,config_sha256=MODULE.sha(path),trainer=trainer_path,trainer_sha256=MODULE.sha(trainer_path),out=root/'export',fixture=True,run_manifest=None,run_manifest_sha256=None,tokenizer=encoder)
            result=MODULE.export(args)
            (temporary_root/'fixture-report.json').write_text(json.dumps({'seed':20261117,'config':c,'manifest':result},indent=2)+'\n')
            self.assertEqual(result['artifactRole'],'fixture');self.assertFalse(result['executionEligible']);self.assertEqual(result['parity']['allHeads'],59);self.assertLess(result['parity']['maxAbsError'],.0001)
            self.assertEqual(MODULE.sha(args.out/'onnx/model.onnx'),result['modelSha256'])
            args.fixture=False;args.out=root/'not-trained'
            with self.assertRaisesRegex(ValueError,'trained-export-requires-frozen-run-manifest'):MODULE.export(args)

if __name__=='__main__':unittest.main()
