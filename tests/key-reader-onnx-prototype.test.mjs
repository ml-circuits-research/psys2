import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['numpy','torch','onnx','onnxruntime']);
test('key-reader export prototype preserves actual synthetic module computations and query bounds',{skip},()=>{
  execFileSync(python,['training/sop-bert/tests/test-export-key-reader.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
