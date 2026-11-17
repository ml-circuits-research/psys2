"""Tiny ordinary byte fixtures: no real model/weights/checkpoint artifacts."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('candidate',Path(__file__).with_name('train-key-reader.py'))
train=importlib.util.module_from_spec(spec);spec.loader.exec_module(train)

def metric():
    return {'positiveBioAndGlobalExact':1,'positiveBioAndGlobalSupport':2,
            'targetTypePresentClass':{'correct':1,'support':2},'decodedMentionF1':.5}

class PublicationTests(unittest.TestCase):
    def config(self):
        return {'format':'sop.key-reader/2-target-type-candidate',
                'rawCodecFormat':'sop.key-reader-raw-codec/2-target-type-candidate',
                'trainingSourceFormat':'sop.key-reader-source/4-target-type-plateau-candidate',
                'trainingPolicy':train.training_policy(),'warmstart':{'kind':'synthetic-fixture'}}

    def first(self,directory,data=b'first-epoch-fixture'):
        publication=train.publish_compact_checkpoint(directory,lambda stream:stream.write(data),len(data)+64,1,reserve_bytes=1)
        config=self.config()
        manifest={'scriptSha256':'a'*64,'format':'sop.per-key-supervision/3-target-type-migration-candidate',
                  'outputs':{'train':'b'*64,'calibration':'c'*64}}
        proof=train.completed_epoch_proof(config,manifest,metric(),
            train.advance_plateau(None,1,metric(),config['trainingPolicy']),publication,
            run_id='fixture-run',steps=1,config_sha='d'*64,trainer_sha='e'*64,
            data_manifest_sha='f'*64,data_counts={'train':2,'calibration':2})
        receipt=train.publish_first_epoch_proof(directory,proof,reserve_bytes=1)
        return publication,proof,receipt

    def test_first_pin_is_same_inode_and_survives_current_replace_forever(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,proof,_=self.first(root)
            pin=root/publication['firstEpochPin'];target=root/'checkpoint.pt'
            self.assertEqual(pin.stat().st_ino,target.stat().st_ino)
            self.assertEqual(pin.name,hashlib.sha256(pin.read_bytes()).hexdigest()+'.pt')
            before=pin.read_bytes();proof_bytes=(root/'first-epoch-proof.json').read_bytes()
            train.publish_compact_checkpoint(root,lambda stream:stream.write(b'second-epoch-fixture'),128,2,reserve_bytes=1)
            self.assertEqual(pin.read_bytes(),before)
            self.assertEqual((root/'first-epoch-proof.json').read_bytes(),proof_bytes)
            self.assertNotEqual(pin.stat().st_ino,target.stat().st_ino)
            self.assertEqual(target.read_bytes(),b'second-epoch-fixture')
            self.assertEqual(len(list((root/'epoch-pins').glob('*.pt'))),1)
            with self.assertRaisesRegex(ValueError,'already-published'):
                self.first(root,b'forbidden-new-first')
            self.assertEqual(pin.read_bytes(),before)

    def test_exclusive_temporary_does_not_overwrite_stale_temp(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);stale=root/'.checkpoint-stale.tmp';stale.write_bytes(b'keep-stale')
            self.first(root)
            self.assertEqual(stale.read_bytes(),b'keep-stale')
            self.assertEqual(list(root.glob('.checkpoint-*.tmp')),[stale])

    def test_writer_exception_and_bound_failure_keep_prior_current_and_pin(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,_,_=self.first(root)
            target=root/'checkpoint.pt';pin=root/publication['firstEpochPin']
            before=target.read_bytes();pin_before=pin.read_bytes()
            def fail(stream):stream.write(b'partial');raise RuntimeError('fixture-failure')
            with self.assertRaisesRegex(RuntimeError,'fixture-failure'):
                train.publish_compact_checkpoint(root,fail,128,2,reserve_bytes=1)
            with self.assertRaisesRegex(ValueError,'upper-bound'):
                train.publish_compact_checkpoint(root,lambda stream:stream.write(b'too-many-bytes'),1,2,reserve_bytes=1)
            self.assertEqual(target.read_bytes(),before);self.assertEqual(pin.read_bytes(),pin_before)
            self.assertEqual(list(root.glob('.checkpoint-*.tmp')),[])

    def test_replace_failure_leaves_prior_target_and_pin_byte_identical(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,_,_=self.first(root)
            target=root/'checkpoint.pt';pin=root/publication['firstEpochPin']
            before=target.read_bytes();inode=target.stat().st_ino
            with patch.object(train.os,'replace',side_effect=OSError('replace-failed')):
                with self.assertRaisesRegex(OSError,'replace-failed'):
                    train.publish_compact_checkpoint(root,lambda stream:stream.write(b'new-bytes'),128,2,reserve_bytes=1)
            self.assertEqual(target.read_bytes(),before);self.assertEqual(pin.read_bytes(),before)
            self.assertEqual(target.stat().st_ino,inode)
            self.assertEqual(list(root.glob('.checkpoint-*.tmp')),[])

    def test_post_replace_sync_failure_rolls_back_current_without_touching_pin(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,_,_=self.first(root)
            target=root/'checkpoint.pt';pin=root/publication['firstEpochPin']
            train.publish_compact_checkpoint(root,lambda stream:stream.write(b'second'),128,2,reserve_bytes=1)
            before=target.read_bytes();pin_before=pin.read_bytes();inode=target.stat().st_ino
            with patch.object(train,'sync_directory',side_effect=OSError('sync-failed')):
                with self.assertRaisesRegex(OSError,'sync-failed'):
                    train.publish_compact_checkpoint(root,lambda stream:stream.write(b'third'),128,3,reserve_bytes=1)
            self.assertEqual(target.read_bytes(),before);self.assertEqual(target.stat().st_ino,inode)
            self.assertEqual(pin.read_bytes(),pin_before)
            self.assertEqual(list(root.glob('.checkpoint-rollback-*')),[])

    def test_preflight_is_only_one_additional_upper_plus_reserve(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);self.first(root)
            allowance=128;reserve=100
            with patch.object(train.shutil,'disk_usage',return_value=SimpleNamespace(free=allowance+reserve)):
                result=train.publish_compact_checkpoint(root,lambda stream:stream.write(b'new'),allowance,2,reserve_bytes=reserve)
            self.assertEqual(result['additionalAllocationUpperBytes'],allowance)
            self.assertEqual(result['reserveBytes'],reserve)
            with patch.object(train.shutil,'disk_usage',return_value=SimpleNamespace(free=allowance+reserve-1)):
                with self.assertRaisesRegex(ValueError,'one-checkpoint-reserve'):
                    train.publish_compact_checkpoint(root,lambda stream:stream.write(b'not-written'),allowance,3,reserve_bytes=reserve)

    def test_epoch_proof_is_not_final_run_and_cannot_be_replaced(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,proof,receipt=self.first(root)
            self.assertTrue(proof['epochComplete']);self.assertFalse(proof['runComplete'])
            self.assertEqual((proof['completedEpoch'],proof['checkpointEpoch']),(1,1))
            self.assertFalse(proof['executionEligible']);self.assertFalse(proof['confidenceCalibrated'])
            canonical=json.dumps(metric(),sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
            self.assertEqual(proof['checkpointMetricsSha256'],hashlib.sha256(canonical).hexdigest())
            before=(root/receipt['path']).read_bytes()
            with self.assertRaisesRegex(ValueError,'already-exists'):
                train.publish_first_epoch_proof(root,proof,reserve_bytes=1)
            self.assertEqual((root/receipt['path']).read_bytes(),before)
            self.assertEqual(publication['sha256'],proof['checkpoint']['sha256'])

    def test_mismatched_pin_refuses_proof_without_output(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);publication,proof,_=self.first(root)
            wrong=copy.deepcopy(proof);wrong['checkpoint']['sha256']='0'*64
            (root/'first-epoch-proof.json').unlink()
            with self.assertRaisesRegex(ValueError,'pin-path'):
                train.publish_first_epoch_proof(root,wrong,reserve_bytes=1)
            self.assertFalse((root/'first-epoch-proof.json').exists())

    def test_epoch_publisher_refuses_final_run_forgery(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);_,proof,_=self.first(root)
            (root/'first-epoch-proof.json').unlink()
            for field,value in [('runComplete',True),('epochComplete',False),('checkpointEpoch',2),('confidenceCalibrated',True)]:
                wrong=copy.deepcopy(proof);wrong[field]=value
                with self.assertRaisesRegex(ValueError,'proof-role'):
                    train.publish_first_epoch_proof(root,wrong,reserve_bytes=1)
                self.assertFalse((root/'first-epoch-proof.json').exists())

    def test_final_receipt_checks_original_immutable_proof_hash(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);_,proof,receipt=self.first(root)
            train.verify_first_epoch_receipt(root,receipt,proof)
            (root/receipt['path']).write_bytes(b'changed-metadata')
            with self.assertRaisesRegex(ValueError,'immutable-first-epoch-proof'):
                train.verify_first_epoch_receipt(root,receipt,proof)

    def test_no_later_epoch_can_skip_first_pin_proof(self):
        with tempfile.TemporaryDirectory()as temp:
            with self.assertRaisesRegex(ValueError,'first-epoch-proof-required'):
                train.publish_compact_checkpoint(Path(temp),lambda stream:stream.write(b'x'),128,2,reserve_bytes=1)

if __name__=='__main__':unittest.main()
