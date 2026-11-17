import test from 'node:test';import {existsSync} from 'node:fs';import {execFileSync} from 'node:child_process';
test('inventory-key preparation retains per-mention BIO metadata and explicit ambiguity',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-key-reader.py'],{stdio:['ignore','pipe','pipe']});
});

test('batched reader loss preserves every masked head/stratum loss and parameter gradient',()=>{
 execFileSync(existsSync('.venv/bin/python')?'.venv/bin/python':'python3',['training/sop-bert/tests/test-key-reader-loss.py'],{stdio:['ignore','pipe','pipe']});
});
