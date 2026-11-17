import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('candidate predictor uses learned schema type with explicit version and area guards',()=>{
 execFileSync('python3',['training/sop-bert/candidates/target-type/test_predict_key_reader.py'],{stdio:['ignore','pipe','pipe']});
});
