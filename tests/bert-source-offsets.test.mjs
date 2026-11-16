import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
import {createBertSourceOffsetAuthority} from '../src/dialog/bert-source-offsets.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
test('offset authority rejects unauthenticated tokenizer bytes and unsupported profiles',async()=>{
 await assert.rejects(createBertSourceOffsetAuthority({tokenizer:()=>{},tokenizerJSON:'{}',tokenizerSha256:'0'.repeat(64)}),/hash-mismatch/);
 await assert.rejects(createBertSourceOffsetAuthority({tokenizer:()=>{},tokenizerJSON:'{}',tokenizerSha256:sha('{}')}),/unsupported-profile/);
 await assert.rejects(createBertSourceOffsetAuthority({}),/invalid-options/);
});
const runtimePath=process.env.SOP_TRANSFORMERS_RUNTIME,modelDir=process.env.SOP_STRUCTURAL_MODEL_DIR;
test('actual BERT component trace matches fast-tokenizer scalar offsets and refuses unsupported input',{skip:!runtimePath||!modelDir},async()=>{
 const runtime=await import(pathToFileURL(resolve(runtimePath)).href);runtime.env.allowRemoteModels=false;
 const tokenizer=await runtime.AutoTokenizer.from_pretrained(resolve(modelDir),{local_files_only:true}),json=readFileSync(resolve(modelDir,'tokenizer.json'),'utf8');
 const options={tokenizer,tokenizerJSON:json,tokenizerSha256:sha(json)},authority=await createBertSourceOffsetAuthority(options);
 const inputs=['Set BLUE widget.','Café naïve résumé','Cafe\u0301 repeated cafe\u0301','🟦 😀 widget','one, two; three!','same same same','a'.repeat(101),'你好 世界','İstanbul','A\u0000B','x\t y\n z','unbelievably colourful'];
 const contextJson='{"area":"drawing","context":{"name":"same"}}';
 const packet=async(text,maxLength=192)=>{const common={text_pair:[contextJson],return_tensor:false},full=await tokenizer([text],{...common,padding:false,truncation:false}),padded=await tokenizer([text],{...common,padding:'max_length',truncation:true,max_length:maxLength});return {text,contextJson,tokenIds:padded.input_ids[0],attentionMask:padded.attention_mask[0],fullTokenIds:full.input_ids[0],fullAttentionMask:full.attention_mask[0],maxLength};};
 const actual=[];for(const text of inputs){const p=await packet(text),a=await authority(p);assert.deepEqual(a.tokenIds,p.tokenIds);assert.ok(a.offsets.every((r,i)=>a.sequenceIds[i]===0?r!==null:r===null));actual.push({text,tokenIds:a.tokenIds,attentionMask:a.attentionMask,sequenceIds:a.sequenceIds,offsets:a.offsets});}
 const python=process.env.SOP_PYTHON??'.venv/bin/python';assert.ok(existsSync(python),'explicit Python parity runtime required for certification test');
 const oracle=JSON.parse(execFileSync(python,['-c',"import json,sys;from transformers import AutoTokenizer;x=json.load(sys.stdin);t=AutoTokenizer.from_pretrained(x['path'],local_files_only=True);out=[]\nfor text in x['texts']:\n e=t(text,x['context'],padding='max_length',truncation=False,max_length=192,return_offsets_mapping=True);s=e.sequence_ids();out.append({'text':text,'tokenIds':e['input_ids'],'attentionMask':e['attention_mask'],'sequenceIds':s,'offsets':[list(r) if s[i]==0 else None for i,r in enumerate(e['offset_mapping'])]})\nprint(json.dumps(out))"],{input:JSON.stringify({path:resolve(modelDir),texts:inputs,context:contextJson}),encoding:'utf8',maxBuffer:2000000}));assert.deepEqual(actual,oracle);
 for(const [text,reason,maxLength]of [['[MASK] widget',/added-token/,192],['ΟΣ',/context-sensitive/,192],['𠀀 widget',/unsupported-unicode/,192],['word '.repeat(100),/truncation/,16]])await assert.rejects(authority(await packet(text,maxLength)),reason);
 const p=await packet('set blue');p.tokenIds[1]++;await assert.rejects(authority(p),/padded-token-parity/);
 const q=await packet('set blue');q.fullTokenIds[1]++;await assert.rejects(authority(q),/full-token-parity/);
 const small=await createBertSourceOffsetAuthority({...options,budget:1});await assert.rejects(small(await packet('set blue')),/budget/);
 const old=tokenizer.padding_side;tokenizer.padding_side='left';await assert.rejects(authority(await packet('set blue')),/component-profile-mismatch/);tokenizer.padding_side=old;
});
