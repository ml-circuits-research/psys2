// SPDX-License-Identifier: AGPL-3.0-only
// The current document is SOP. Editing primitives and the renderer use detached views.
import { copyHostData } from '../native-tool-host.mjs?v=ecc9d8b538';
import { typedStateCodec } from '../typed-state-codec.mjs?v=22973f8553';
import { containers, ALIGNS, MARK_TYPES } from './model.mjs?v=d82adc50e5';
import { sync } from './document.mjs?v=aa0453e621';
import { documentTextId } from './native-editing.mjs?v=77e696d766';

const string={kind:'string',required:true}, integer={kind:'integer',required:true};
const ordered=type=>({type,many:true});
const mark={
 kind:{kind:'atom',required:true},start:integer,end:integer,hasAttributes:'boolean',href:'string',color:'string',
};
const identity={id:string,nativeType:{kind:'atom',required:true}};
const codec=typedStateCodec('docs.editor.content','document',{
 document:{
  id:'string',nativeType:'atom',textId:'string',title:string,titleAlign:{kind:'atom',required:true},titleSize:integer,
  genre:'string',topic:'string',titleMark:ordered('mark'),block:{...ordered('block'),required:true},
 },
 block:{
  ...identity,kind:{kind:'atom',required:true},level:'integer',align:'atom',name:'string',part:'string',asTitle:'boolean',
  style:'atom',header:'boolean',source:ordered('source'),text:{type:'text'},item:ordered('text'),row:ordered('row'),
 },
 row:{cell:{...ordered('text'),required:true}},
 text:{...identity,text:string,at:string,checked:'boolean',mark:ordered('mark')},
 mark,
 source:{id:string},
},{identities:{block:'id',text:'id'}});
export const DOCUMENT_STATE_SCHEMA=codec.schema;

const own=(object,key)=>Object.hasOwn(object,key);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const fields=(object,keys)=>Object.fromEntries(keys.filter(key=>own(object,key)).map(key=>[key,object[key]]));
const need=(ok,why)=>{if(!ok)throw new TypeError('document-canonical:'+why);};
const blockKinds=new Set(['paragraph','heading','quote','list','table','rule']);
const section=block=>block.kind==='heading'&&block.level<=2;
const blockType=block=>section(block)?'docs.editor.section':'docs.editor.block';
const stateFields=['title','titleAlign','titleMarks','titleSize','kind','about','textId','blocks'];
const optionalBlockFields=['level','align','name','part','asTitle','style','header'];
const runtimeFields=['cursor','nextId','textSeq','selection','focus','inputMode','dictBlock','dictTitle','stepGroup','_ins','history','future'];

function known(input,allowed,why){
 need(plain(input)&&Object.keys(input).every(key=>allowed.includes(key)),why);
}

function encodeMarks(values) {
 return values.map(value=>{
  known(value,['at','from','to','type','attrs'],'mark-fields');
  if(own(value,'attrs'))known(value.attrs,['href','color'],'mark-attributes');
  return {kind:value.type,start:value.from,end:value.to,...(own(value,'attrs')?{hasAttributes:true,...value.attrs}:{})};
 });
}
function decodeMarks(values,at,text) {
 return (values??[]).map(value=>{
  const {kind,start,end,hasAttributes,href,color}=value;
  need(MARK_TYPES.includes(kind)&&start>=0&&start<end&&end<=text.length,'mark-range-or-kind');
  need(hasAttributes===true||!own(value,'hasAttributes')&&href===undefined&&color===undefined,'mark-attributes');
  if(kind==='link')need(typeof href==='string'&&/^(https?:|mailto:|#)/i.test(href),'link-target');
  if(kind==='highlight')need(color===undefined||/^#[a-f0-9]{6}$/i.test(color),'highlight-color');
  return {at,from:start,to:end,type:kind,...(hasAttributes?{attrs:fields(value,['href','color'])}:{})};
 });
}

function encodeBlock(block) {
 known(block,['id','kind','text','marks','from','items','rows','checked',...optionalBlockFields],'block-fields');
 const parts=new Map(containers(block).map(part=>[part.at,part.text]));
 const marks=new Map();
 for(const value of block.marks??[]){
  if(!marks.has(value.at))marks.set(value.at,[]);
  marks.get(value.at).push(value);
 }
 need([...marks.keys()].every(at=>parts.has(at)),'mark-target');
 const textAt=(at,checked)=>{
  const values=marks.get(at)??[];
  return {id:documentTextId(block.id,at),nativeType:'docs.editor.text',at,text:parts.get(at),
   ...(values.length?{mark:encodeMarks(values)}:{}),...(checked===undefined?{}:{checked})};
 };
 const data={id:block.id,nativeType:blockType(block),kind:block.kind,...fields(block,optionalBlockFields)};
 if(own(block,'from'))data.source=block.from.map(id=>({id}));
 if(block.kind==='list')data.item=block.items.map((_,index)=>textAt(String(index),block.checked?.[index]));
 else if(block.kind==='table')data.row=block.rows.map((row,index)=>({cell:row.map((_,column)=>textAt(index+':'+column))}));
 else if(block.kind!=='rule')data.text=textAt('0');
 return data;
}
function decodeBlock(input) {
 const {id,kind,nativeType}=input;
 const block={id,kind,...fields(input,optionalBlockFields)},marks=[];
 need(id.length&&id!=='title'&&blockKinds.has(kind)&&nativeType===blockType(block),'block-identity');
 need(!own(block,'align')||ALIGNS.includes(block.align),'block-alignment');
 need(kind==='heading'?Number.isSafeInteger(block.level)&&block.level>=1&&block.level<=6:!own(block,'level'),'heading-level');
 need(kind==='list'?['bullet','numbered','task'].includes(block.style):!own(block,'style'),'list-style');
 need(kind==='table'||!own(block,'header'),'table-header');
 const readText=(row,at,isTask=false)=>{
  need(row?.id===documentTextId(id,at)&&row.at===at&&row.nativeType==='docs.editor.text','text-identity');
  need(own(row,'checked')===isTask,'task-state');
  marks.push(...decodeMarks(row.mark,at,row.text));
  return row.text;
 };
 if(kind==='list'){
  need(Array.isArray(input.item)&&!input.text&&!input.row,'list-shape');
  const task=block.style==='task';
  block.items=input.item.map((item,index)=>readText(item,String(index),task));
  if(task)block.checked=input.item.map(item=>item.checked);
 }else if(kind==='table'){
  need(Array.isArray(input.row)&&!input.text&&!input.item,'table-shape');
  block.rows=input.row.map(({cell},index)=>cell.map((item,column)=>readText(item,index+':'+column)));
 }else {
  need(!input.item&&!input.row&&!!input.text===(kind!=='rule'),'text-shape');
  if(input.text)block.text=readText(input.text,'0');
 }
 if(marks.length)block.marks=marks;
 if(input.source)block.from=input.source.map(source=>source.id);
 return block;
}
function contentOf(state) {
 const id=state.textId??(state.title||state.blocks.length?'document':null);
 return {
  ...(id?{id,nativeType:'docs.editor.document'}:{}),...(state.textId?{textId:state.textId}:{}),
  title:state.title,titleAlign:state.titleAlign,titleSize:state.titleSize,
  ...(state.titleMarks.length?{titleMark:encodeMarks(state.titleMarks)}:{}),
  ...(state.kind==null?{}:{genre:state.kind}),...(state.about==null?{}:{topic:state.about}),
  block:state.blocks.map(encodeBlock),
 };
}
function readContent(content) {
 const {title,titleAlign,titleSize,genre,topic,textId}=content;
 const state={title,titleAlign,titleSize,kind:genre??null,about:topic??null,textId:textId??null,
  titleMarks:decodeMarks(content.titleMark,'0',title),blocks:content.block.map(decodeBlock)};
 const id=state.textId??(state.title||state.blocks.length?'document':undefined);
 need(content.id===id&&content.nativeType===(id?'docs.editor.document':undefined),'document-identity');
 need(ALIGNS.includes(titleAlign)&&new Set(state.blocks.map(block=>block.id)).size===state.blocks.length,'document-content');
 return state;
}
function freshRuntime(state) {
 const numberIn=(id,pattern)=>{
  const number=Number(pattern.exec(id??'')?.[1]??0);
  need(Number.isSafeInteger(number)&&number<Number.MAX_SAFE_INTEGER,'native-identity-limit');
  return number;
 };
 return {cursor:-1,nextId:state.blocks.reduce((next,block)=>Math.max(next,1+numberIn(block.id,/^b(\d+)$/)),1),
  ...(state.textId?{textSeq:numberIn(state.textId,/^text(\d+)$/)}:{}),selection:null,focus:null,inputMode:null,
  dictBlock:null,history:[],future:[]};
}
function runtimeOf(state,input) {
 if(input===undefined)return freshRuntime(state);
 const runtime=copyHostData(input);
 known(runtime,runtimeFields,'runtime-fields');
 const value={...freshRuntime(state),...runtime};
 need(Number.isSafeInteger(value.nextId)&&value.nextId>0&&Number.isSafeInteger(value.cursor),'runtime-cursor');
 if(own(value,'textSeq'))need(Number.isSafeInteger(value.textSeq)&&value.textSeq>=0,'runtime-text-sequence');
 for(const key of ['history','future']){
  need(Array.isArray(value[key])&&value[key].length<=50,'runtime-history');
  for(const entry of value[key]){
   known(entry,[...stateFields,'cursor','nextId','selection'],'history-fields');
   need(Array.isArray(entry.blocks)&&typeof entry.title==='string'&&Number.isSafeInteger(entry.nextId)&&entry.nextId>0&&Number.isSafeInteger(entry.cursor),'history-content');
   readContent(contentOf({...entry,titleMarks:entry.titleMarks??[],titleAlign:entry.titleAlign??'left',titleSize:entry.titleSize??0}));
  }
 }
 return value;
}
function decodeCarrier(input) {
 known(input,['sop','runtime'],'carrier-fields');
 const {data,world}=codec.decode(input.sop),state=readContent(data);
 Object.assign(state,runtimeOf(state,input.runtime));
 const before=contentOf(state);
 sync(state);
 need(JSON.stringify(before)===JSON.stringify(contentOf(state)),'noncanonical-content');
 return {state,world};
}
export function documentStateWorld(input) {
 return decodeCarrier(own(input,'sop')?input:canonicalDocumentState(input)).world;
}
export function toNativeDocumentState(input) {
 return own(input,'sop')?decodeCarrier(input).state:copyHostData(input);
}
export function canonicalDocumentState(input) {
 if(own(input,'sop')){
  const {state}=decodeCarrier(input);
  return {sop:input.sop,runtime:fields(state,runtimeFields)};
 }
 const state=copyHostData(input);
 known(state,[...stateFields,...runtimeFields,'doc','stats'],'native-fields');
 sync(state);
 const content=contentOf(state);
 readContent(content);
 return {sop:codec.encode(content),runtime:runtimeOf(state,fields(state,runtimeFields))};
}
