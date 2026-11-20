// Probe helper: raw reader requests (stdin, from probe-reader.py) -> runtime bridge -> request wires (stdout).
// Uses the deployed bindings and the unchanged src bridge; no model, no execution.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bridgeRawStructure,RAW_STRUCTURAL_FORMAT} from '../../src/dialog/raw-structural-bridge.mjs';
const webchat=new URL('../../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindingsText=readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8');
const bindings=JSON.parse(bindingsText),bindingSha256=createHash('sha256').update(bindingsText).digest('hex');
const input=JSON.parse(readFileSync(0,'utf8'));
for(const message of input){
 const requests=message.requests.map(r=>({...r.request,span:message.text.slice(...r.span)}));
 const raw={format:RAW_STRUCTURAL_FORMAT,source:{text:message.text,unit:'unicode-scalar'},area:message.area,model:{kind:'structural-graph',sha256:'0'.repeat(64),decoderVersion:1},
  requestCount:requests.length,requests,ranges:[],coverage:{complete:true,truncated:false}};
 const bridge=bridgeRawStructure(raw,{bindings,bindingSha256});
 const candidate=bridge.decoded?.candidates?.[0];
 message.wires=candidate?.batch?.entries?.map(e=>e.wires)??[];
 message.bridgeIssues=[...bridge.diagnostics,...(bridge.decoded?.issues??[])].map(i=>i.reason+(i.path?.length?':'+i.path.join('.'):''));
}
process.stdout.write(JSON.stringify(input));
