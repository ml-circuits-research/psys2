import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('frozen key reader preserves predicted mention metadata and unresolved routes',()=>{
 execFileSync('python3',['training/sop-bert/tests/test-predict-key-reader.py'],{stdio:['ignore','pipe','pipe']});
});
