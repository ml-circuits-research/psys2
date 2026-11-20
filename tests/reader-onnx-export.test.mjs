import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['numpy','torch','onnx','onnxruntime']);
test('real tiny cutter and key graphs export to q8 without FP32 disk intermediates',{skip},()=>{
  execFileSync(python,['training/sop-bert/tests/test-export-reader-onnx.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
