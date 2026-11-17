import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('real tiny cutter and key graphs export to q8 without FP32 disk intermediates',()=>{
 const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
 execFileSync(python,['training/sop-bert/tests/test-export-reader-onnx.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
