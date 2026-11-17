// Offline bounded decoder comparison. Uses the published decoder, not a copy.
import {readFileSync,createWriteStream,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
const [input,output,helper,expectedSha]=process.argv.slice(2);
if(!input||!output||!helper||!/^[a-f0-9]{64}$/.test(expectedSha??''))throw Error('explicit-paths-and-helper-hash-required');
const hash=()=>createHash('sha256').update(readFileSync(helper)).digest('hex');
if(hash()!==expectedSha)throw Error('helper-hash-mismatch');
const {decodeBioViterbi}=await import(pathToFileURL(helper).href);
const destination=createWriteStream(output,{flags:'wx'});
let rows=0;
for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})){
 if(line.length>1000000||++rows>100000)throw Error('input-bound');
 const row=JSON.parse(line);
 if(typeof row.id!=='string'||!Array.isArray(row.emissions)||row.emissions.length>4096)throw Error('invalid-emission-row');
 const greedy=row.emissions.map(values=>{
  if(!Array.isArray(values)||values.length!==3||values.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('invalid-logits');
  const best=Math.max(...values),winners=values.flatMap((x,i)=>x===best?[i]:[]);
  return winners.length===1?winners[0]:-1;
 });
 const viterbi=decodeBioViterbi(row.emissions,{maxTokens:4096,maxWork:200000});
 const result={id:row.id,greedy,viterbi:{ok:viterbi.ok,labels:viterbi.labels,reason:viterbi.reason??null,decoder:viterbi.decoder,calibrated:false}};
 if(!destination.write(JSON.stringify(result)+'\n'))await new Promise(resolve=>destination.once('drain',resolve));
}
await new Promise((resolve,reject)=>{destination.once('error',reject);destination.end(resolve);});
if(hash()!==expectedSha)throw Error('helper-mutated');
