import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('predicted key inputs preserve frozen cutter provenance and actual context only',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-predicted-key-inputs.py'],{stdio:['ignore','pipe','pipe']});
});
