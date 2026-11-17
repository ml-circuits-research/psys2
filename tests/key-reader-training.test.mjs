import test from 'node:test';import {execFileSync} from 'node:child_process';
test('inventory-key preparation retains per-mention BIO metadata and explicit ambiguity',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-key-reader.py'],{stdio:['ignore','pipe','pipe']});
});
