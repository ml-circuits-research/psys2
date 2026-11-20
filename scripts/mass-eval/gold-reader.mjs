// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only. A "gold reader": the labelled requests of one dataset row, served through the same
// cutter/reader interfaces the deployed SOP-BERT models implement, so that the real key-reader pipeline
// (createKeyReaderPipeline: raw structure -> structural bridge -> candidates) and the whole application route
// run on the labels exactly as they would on a perfect reading. Nothing here reads the text: the labels are the
// reading. The labels are first put in the trainer's view (prepare-official.py trainer_view): determiners on the
// two-class head, closed-bank values outside the bank dropped (the mention stays); fields the bridge does not take
// (needs, spanOrigin, open_value) are removed and reported.
import {createKeyReaderPipeline} from '../../src/dialog/key-reader-pipeline.mjs';
import {positiveCardinalProof} from '../../src/dialog/key-reader-value-proof.mjs';
import {projectJournalAction} from '../../src/dialog/project-journal-action.mjs';
import {MODEL_SELECTION_SCORE} from '../../src/dialog/model-selection-score.mjs';

const TRAINER_DETERMINERS={demonstrative:'definite',possessive:'definite',quantified:'definite'};
const REQUEST_KEYS=['span','trigger','mood','act','target','constraints','question','turn'];
const TARGET_KEYS=['type','mode','fill','determiner','kind','kind_span','name_span','description_span','ordinal','count','count_span','quantifier'];
const CONSTRAINT_KEYS=['key','value','value_span','operator','phase','polarity','character','step','measure','measure_span','unit','anchor_span','anchor_fill','variety','scope','group'];
const IDENTITY={sha256:'0'.repeat(63)+'1',tokenizerSha256:'0'.repeat(63)+'2',codecSha256:'0'.repeat(63)+'3',decoderVersion:1};
const READER_IDENTITY={...IDENTITY,sha256:'0'.repeat(63)+'4'};
const chars=s=>Array.from(s);

/** First whole-word occurrence (unicode scalars) of literal in text, else first occurrence, else null. */
export function findRange(text,literal,from=0){
 if(typeof literal!=='string'||!literal)return null;
 const hay=chars(text),needle=chars(literal),hits=[];
 for(let i=from;i+needle.length<=hay.length;i++){let ok=true;for(let j=0;j<needle.length;j++)if(hay[i+j]!==needle[j]){ok=false;break;}if(ok)hits.push(i);}
 if(!hits.length)return null;
 const word=c=>c!==undefined&&/[\p{L}\p{N}]/u.test(c);
 const whole=hits.find(i=>!word(hay[i-1])&&!word(hay[i+needle.length]));
 const at=whole??hits[0];return [at,at+needle.length];
}

/** The labels of one request as the trainer sees them, restricted to the reader/bridge field set. */
export function trainerRequest(request,world,inventory,notes){
 const out={};
 for(const [k,v]of Object.entries(request)){if(REQUEST_KEYS.includes(k))out[k]=structuredClone(v);else notes.push('dropped-request-field:'+k);}
 const t=out.target=out.target??{};
 for(const k of Object.keys(t))if(!TARGET_KEYS.includes(k)){notes.push('dropped-target-field:'+k);delete t[k];}
 if(TRAINER_DETERMINERS[t.determiner])t.determiner=TRAINER_DETERMINERS[t.determiner];
 // The reader writes the kind as the words of the text (its kind_span); the lemma is the bridge's job.
 if(typeof t.kind_span==='string')t.kind=t.kind_span;
 // The reader writes the count as the proven number of its count words (positiveCardinalProof), never a string.
 if(t.count!==undefined&&!Number.isSafeInteger(t.count))delete t.count;
 if(typeof t.count_span==='string'&&t.count===undefined){const proof=positiveCardinalProof(t.count_span);if(proof)t.count=proof.value;}
 out.constraints=(out.constraints??[]).map(c=>{
  const x={};for(const [k,v]of Object.entries(c)){if(CONSTRAINT_KEYS.includes(k))x[k]=v;else if(k!=='open_value')notes.push('dropped-constraint-field:'+k);}
  const [type,name]=String(c.key).split('.');const bank=inventory?.[world]?.[type]?.keys?.[name]?.values;
  if(c.open_value||(Array.isArray(bank)&&Object.hasOwn(x,'value')&&!bank.includes(x.value))){delete x.value;notes.push('open-value:'+c.key);}
  // A key without a closed bank is a copy key: the reader writes the words of the text as its value and the
  // application normalises them ("9:45am"), so a label normalised by the dataset build ("09:45") is not the reading.
  else if(!Array.isArray(bank)&&typeof x.value_span==='string'&&Object.hasOwn(x,'value')&&x.value!==x.value_span){x.value=x.value_span;notes.push('copy-value:'+c.key);}
  return x;
 });
 return out;
}

/** Ranges (relative to the request span) of the span-valued fields, as the reader reports them. */
function rangesOf(span,req){
 const ranges=[],add=(path,value)=>{if(typeof value!=='string'||!value)return;const r=findRange(span,value);if(r)ranges.push({path,range:r});};
 add(['trigger'],req.trigger);
 for(const k of ['kind_span','name_span','description_span','count_span'])add(['target',k],req.target?.[k]);
 (req.constraints??[]).forEach((c,i)=>{add(['constraints',String(i),'value_span'],c.value_span);if(typeof c.value==='string'&&c.value===c.value_span)add(['constraints',String(i),'value'],c.value);
  for(const k of ['measure_span','anchor_span'])add(['constraints',String(i),k],c[k]);});
 // A kind given only as a label (no source words) has no range; drop a kind whose words are not in the span.
 return ranges;
}

/** Locate the gold request spans in the text in source order. Returns {spans,requests} or {error}. */
export function goldCut(text,requests){
 const spans=[];let from=0;
 for(const r of requests){
  const range=findRange(text,r.span,from)??findRange(text,r.span,0);
  if(!range)return {error:'gold-span-not-in-text'};
  if(range[0]<from)return {error:'gold-spans-overlap-or-out-of-order'};
  spans.push(range);from=range[1];
 }
 return {spans};
}

/** A cutter and key reader whose readings are the row's labels; text outside the row reads as unresolved. */
export function createGoldModels(){
 let current=null;
 const cutter={provenance:()=>({model:{...IDENTITY}}),async cut(text){
  const base={source:{text,unit:'unicode-scalar'},model:{...IDENTITY},coverage:{complete:true,truncated:false},unresolved:[]};
  if(current&&text===current.text)return {...base,spans:current.spans.map(s=>[...s])};
  // A sub-text the application re-reads (coordination parts): the labels do not cover it.
  if(current){const sub=current.requests.findIndex(r=>r.span===text);if(sub>=0)return {...base,spans:[[0,chars(text).length]]};}
  return {...base,spans:[[0,chars(text).length]],coverage:{complete:false,truncated:false},unresolved:[{reason:'oracle-no-label-for-text',detail:{text}}]};
 }};
 const reader={provenance:()=>({model:{...READER_IDENTITY}}),async read(text){
  const base={source:{text,unit:'unicode-scalar'},model:{...READER_IDENTITY}};
  const req=current?.requests.find(r=>r.span===text);
  if(!req){current&&(current.unlabelled??=[]).push(text);return {...base,request:{span:text,target:{},constraints:[]},ranges:[],coverage:{complete:false,truncated:false},unresolved:[{reason:'oracle-no-label-for-text'}]};}
  const request=structuredClone(req),ranges=rangesOf(text,request);
  return {...base,request,ranges,coverage:{complete:true,truncated:false},unresolved:[]};
 }};
 return {cutter,reader,set(value){current=value;},get current(){return current;}};
}

/** A provider with the deployed reader's surface (verified-reader-provider.mjs scoredProvider: propose, proposeRequests,
 * re-readings, journal projection, registry, bindings) over the gold models. A gold reading scores 1. */
export async function createGoldProvider({bindingsJSON,bindingsSha256,bindings,registry,getContext}){
 const models=createGoldModels();
 const pipeline=await createKeyReaderPipeline({cutter:models.cutter,reader:models.reader,getContext,cutterModel:IDENTITY,readerModel:READER_IDENTITY,bindingsJSON,bindingsSha256});
 const proposals=[];
 const score=p=>p?{...projectJournalAction(p),selectionScore:{definition:MODEL_SELECTION_SCORE,value:1}}:null;
 const provider={provenance:pipeline.provenance,registry:()=>registry,bindings:()=>bindings,
  async propose(sop){const p=score(await pipeline.propose(sop));proposals.push(p);return p;},
  async proposeIndependent(sop){const p=score(await pipeline.proposeIndependent(sop));if(p)proposals.push({...p,__retry:true});return p;},
  async proposeLiteral(sop){const p=score(await pipeline.proposeLiteral(sop));if(p)proposals.push({...p,__retry:true});return p;},
  async *proposeRequests(sop){for await(const p of pipeline.proposeRequests(sop)){const q=score(p);proposals.push(q);yield q;}}};
 return {provider,models,proposals};
}
