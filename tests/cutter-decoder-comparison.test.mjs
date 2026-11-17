import test from 'node:test';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';
test('frozen cutter comparison fixtures preserve greedy baseline and actual alternate decoder behavior',()=>{
 execFileSync('python3',['training/sop-bert/test_compare_request_cutter.py'],{stdio:['ignore','pipe','pipe'],env:{...process.env,BIO_VITERBI_HELPER:resolve('src/dialog/bio-viterbi.mjs')}});
});
