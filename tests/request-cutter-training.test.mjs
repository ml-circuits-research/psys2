import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('source-only request cutter fixtures preserve BIO ambiguity and frozen provenance',()=>{
 const output=execFileSync('python3',['training/sop-bert/test_train_request_cutter.py'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.equal(typeof output,'string');
});
