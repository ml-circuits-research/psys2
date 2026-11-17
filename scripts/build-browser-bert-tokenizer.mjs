// Host-only vendor build; no npm dependency is added to the core.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [root,bundler,out]=process.argv.slice(2);
if(!root||!bundler||!out)throw Error('usage: node build-browser-bert-tokenizer.mjs transformersPackage esbuildModule output');
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
if(pkg.version!=='3.8.1')throw Error('expected-transformers-3.8.1');
const {build}=await import(pathToFileURL(resolve(bundler)));
const common=resolve(root,'../../onnxruntime-common/dist/esm/tensor.js');
const result=await build({stdin:{contents:`export {BertTokenizer} from ${JSON.stringify(resolve(root,'src/tokenizers.js'))};`,resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',minify:true,keepNames:true,metafile:true,legalComments:'eof',plugins:[{name:'local-tokenizer-only',setup(b){
 b.onResolve({filter:/utils\/hub\.js$/},()=>({path:'hub',namespace:'local'}));
 b.onResolve({filter:/backends\/onnx\.js$/},()=>({path:'backend',namespace:'local'}));
 b.onResolve({filter:/ops\/registry\.js$/},()=>({path:'ops',namespace:'local'}));
 b.onLoad({filter:/.*/,namespace:'local'},a=>({contents:a.path==='hub'?`export function getModelJSON(){throw Error('tokenizer-network-loading-disabled');}`:a.path==='ops'?`export const TensorOpRegistry=new Proxy({}, {get(){throw Error('tokenizer-tensor-ops-disabled');}});`:`import {Tensor} from ${JSON.stringify(common)};export {Tensor};export const isONNXTensor=x=>x instanceof Tensor;`,resolveDir:root}));
}}]});
const banner='// Hugging Face Transformers.js 3.8.1 BertTokenizer (Apache-2.0), https://github.com/huggingface/transformers.js\n// Host-only local constructor build; no model loading, tensor operations or runtime included.\n';
await mkdir(dirname(out),{recursive:true});await writeFile(out,banner+result.outputFiles[0].text);
const inputs=await Promise.all(Object.keys(result.metafile.inputs).filter(x=>!x.startsWith('<')).map(async x=>x.startsWith('local:')?{path:x}:{path:x.slice(x.indexOf('node_modules/')+13),sha256:createHash('sha256').update(await readFile(resolve(x))).digest('hex')}));
await writeFile(out+'.inputs.json',JSON.stringify({format:'psys2.browser-tokenizer-build/1',transformersVersion:pkg.version,keepNames:true,bundlerVersion:(await import(pathToFileURL(resolve(bundler)))).version,inputs},null,2)+'\n');
