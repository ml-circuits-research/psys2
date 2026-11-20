import test from 'node:test';import {trainingPython} from './fixtures/training-python.mjs';import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['torch']);
test('inventory-key preparation retains per-mention BIO metadata and explicit ambiguity',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-key-reader.py'],{stdio:['ignore','pipe','pipe']});
});

test('batched reader loss preserves every masked head/stratum loss and parameter gradient',{skip},()=>{
 execFileSync(python,['training/sop-bert/tests/test-key-reader-loss.py'],{stdio:['ignore','pipe','pipe']});
});
