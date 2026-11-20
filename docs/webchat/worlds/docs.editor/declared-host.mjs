// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=f24fe0f51c';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=0111c52683';
import {createNativeToolHost,copyHostData,nativeToken} from '../native-tool-host.mjs?v=f9a751a339';
import {createDoc,writeText,commit,sync,undoStep,redoStep,addBlock} from './document.mjs?v=bb449fec98';
import {documentEditingHandlers,changeDocumentBlock,documentTextId} from './native-editing.mjs?v=d10b89aec3';
import {canonicalDocumentState,documentStateWorld,toNativeDocumentState,DOCUMENT_STATE_SCHEMA} from './canonical-state.mjs?v=a9e70dd15f';
import {blockText,containers} from './model.mjs?v=7dfba6bc28';
const toolInterface = readNativeToolInterface(NATIVE_INTERFACE).realize();
export const DOCUMENT_TOOL_BINDINGS = toolInterface.bindings;
export function initialDocumentState(){const s={title:'',titleMarks:[],titleAlign:'left',titleSize:0,blocks:[],cursor:-1,selection:null,focus:null,inputMode:null,history:[],future:[],nextId:1,dictBlock:null,kind:null,about:null,textId:null};sync(s);return s;}
export const initialCanonicalDocumentState=()=>canonicalDocumentState(initialDocumentState());
export const DOCUMENT_STATE_INTERFACE=Object.freeze({canonicalizeState:canonicalDocumentState,projectState:toNativeDocumentState,
 stateWorld:documentStateWorld,stateSchema:DOCUMENT_STATE_SCHEMA,stateInterfaceTypeKey:'nativeType',separateRuntime:true});
const fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const sections=s=>{const heads=s.blocks.map((b,i)=>({b,i})).filter(({b})=>b.kind==='heading'&&(b.level??2)<=2);return heads.map(({b,i},n)=>({id:b.id,start:i,end:heads[n+1]?.i??s.blocks.length}));};
const validBlocks=blocks=>Array.isArray(blocks)&&blocks.length<=10000&&blocks.every(b=>b&&typeof b==='object'&&!Array.isArray(b)&&['paragraph','heading','quote'].includes(b.kind)&&typeof b.text==='string'&&(!Object.hasOwn(b,'level')||Number.isSafeInteger(b.level)&&b.level>=1&&b.level<=6)&&(!Object.hasOwn(b,'from')||Array.isArray(b.from)&&b.from.every(x=>typeof x==='string'))&&Object.keys(b).every(k=>['kind','text','level','from'].includes(k)));
const view=s=>{
 if(!Array.isArray(s.blocks)||!Array.isArray(s.history)||!Array.isArray(s.future))throw new TypeError('invalid-document');
 const groups=new Map(sections(s).map(g=>[g.id,g])),rows=[];
 if(s.textId||s.title||s.blocks.length)rows.push({id:s.textId||'document',kind:'document',sourceType:'docs.editor.document',inputs:Object.entries({title:s.title,genre:s.kind,topic:s.about,length:s.stats.words}).map(([key,value])=>({binding:`document.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)],...(key==='length'?{dimension:'count',unit:'word',frame:'document.text'}:{})}))});
 for(const [index,b]of s.blocks.entries())rows.push({id:b.id,kind:groups.has(b.id)?'section':b.kind,sourceType:groups.has(b.id)?'docs.editor.section':'docs.editor.block',parent:s.textId,inputs:Object.entries({text:blockText(b),name:b.name??'',parent:s.textId,kind:b.kind,level:b.level??null,align:b.align??'left',index,items:b.items??null,rows:b.rows??null,style:b.style??null,checked:b.checked??null,header:b.header??null,marks:b.marks??[],selected:s.focus===b.id,...(s.selection?.type==='range'&&s.selection.block===b.id?{selectionFrom:s.selection.from,selectionTo:s.selection.to,selectionAt:s.selection.at}:{})}).map(([key,value])=>({binding:'document.block.'+key,key,values:value===null?[]:Array.isArray(value)?value.map(v=>v&&typeof v==='object'?JSON.stringify(v):nativeToken(v)):[nativeToken(value)]})),...(groups.has(b.id)?{members:s.blocks.slice(groups.get(b.id).start,groups.get(b.id).end).map(x=>x.id)}:{})});
 for(const b of s.blocks)for(const container of containers(b))rows.push({id:documentTextId(b.id,container.at),kind:'text',sourceType:'docs.editor.text',parent:b.id,inputs:[{binding:'document.text.text',key:'text',values:[nativeToken(container.text)]},{binding:'document.text.name',key:'name',values:[nativeToken((b.name??b.kind)+' '+container.at)]},{binding:'document.text.parent',key:'parent',values:[nativeToken(b.id)]},{binding:'document.text.at',key:'at',values:[nativeToken(container.at)]}]});
 return rows;
};
export function createDocumentHost({state=initialDocumentState(),instanceId,composer=null,rewriter=null,...limits}={}){
 const stamp=(s,genre,topic)=>{s.kind=genre??'text';s.about=topic??null;s.textSeq=(s.textSeq??0)+1;s.textId=`text${s.textSeq}`;sync(s);};
 const makeChild=(ctx,a,section)=>{
  const s=ctx.state;if(!s.textId||a.parent!==s.textId)return fail('missing-parent-document');
  if(!Number.isSafeInteger(s.nextId)||s.nextId<1||!Number.isSafeInteger(s.nextId+1)||s.blocks.some(b=>b.id===`b${s.nextId}`))return fail('native-id-collision');
  if(!section&&a.kind!=='heading'&&Object.hasOwn(a,'level'))return fail('unexpected-heading-level');
  if(a.after!==undefined&&!s.blocks.some(b=>b.id===a.after))return fail('missing-insertion-reference');
  const block={kind:section?'heading':a.kind,text:a.text};
  if(block.kind==='heading')block.level=section?a.level:(a.level??3);
  if(Object.hasOwn(a,'name'))block.name=a.name;
  commit(s);const made=addBlock(s,block,a.after===undefined?s.blocks.length:s.blocks.findIndex(b=>b.id===a.after)+1);sync(s);return done([made.id]);
 };
 const handlers={
  ...documentEditingHandlers(),
  'document.block.make':(ctx,a)=>makeChild(ctx,a,false),
  'document.section.make':(ctx,a)=>makeChild(ctx,a,true),
  'document.write':(ctx,a)=>{if(!validBlocks(a.blocks))return fail('invalid-content');createDoc(ctx,a.title,a.blocks);stamp(ctx.state,a.genre,a.topic);return done([ctx.state.textId,...ctx.state.blocks.map(b=>b.id)]);},
  'document.compose':(ctx,a,step)=>{if(!composer?.available||typeof composer.compose!=='function')return fail('missing-knowledge-composer');const bounded={available:true,compose:args=>{const result=copyHostData(composer.compose(args));const chapters=result?.composition?.chapters;if(!Array.isArray(chapters)||chapters.length>100||chapters.some(ch=>!Array.isArray(ch.subchapters)||ch.subchapters.length>100||ch.subchapters.some(sc=>!Array.isArray(sc.sentences)||sc.sentences.length>100)))return null;return result;}};return writeText({...ctx,composer:bounded},{kind:a.genre,about:a.topic,words:a.words,chapters:a.chapters,step});},
  'document.rewrite':(ctx,a)=>{if(!rewriter||typeof rewriter.rewrite!=='function')return fail('missing-knowledge-rewriter');const blocks=copyHostData(rewriter.rewrite({blocks:copyHostData(ctx.state.blocks),property:a.property,value:a.value}));if(!validBlocks(blocks))return fail('invalid-rewrite');const genre=ctx.state.kind,topic=ctx.state.about;createDoc(ctx,ctx.state.title,blocks);stamp(ctx.state,genre,topic);return done(ctx.state.blocks.map(b=>b.id));},
  'document.block.change':changeDocumentBlock,
  'document.block.remove':(ctx,a)=>{if(!a.ids.length)return done([]);if(new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.blocks.some(b=>b.id===id)))return fail('missing-target');commit(ctx.state);ctx.state.blocks=ctx.state.blocks.filter(b=>!a.ids.includes(b.id));sync(ctx.state);return done(a.ids);},
  'document.section.remove':(ctx,a)=>{const groups=sections(ctx.state);if(!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!groups.some(g=>g.id===id)))return fail('missing-target');const cut=new Set();for(const group of groups.filter(g=>a.ids.includes(g.id))){const level=ctx.state.blocks[group.start].level;for(let i=group.start;i<ctx.state.blocks.length;i++){const b=ctx.state.blocks[i];if(i>group.start&&b.kind==='heading'&&(b.level??3)<=level)break;cut.add(b.id);}}commit(ctx.state);ctx.state.blocks=ctx.state.blocks.filter(b=>!cut.has(b.id));sync(ctx.state);return done([...cut]);},
  'document.section.reorder':(ctx,a)=>{const groups=sections(ctx.state);if(!groups.length||a.ids.length!==groups.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!groups.some(g=>g.id===id)))return fail('incomplete-section-order');if(a.ids.every((id,i)=>groups[i].id===id))return done([]);const prefix=ctx.state.blocks.slice(0,groups[0].start),ordered=a.ids.flatMap(id=>{const g=groups.find(g=>g.id===id);return ctx.state.blocks.slice(g.start,g.end);});commit(ctx.state);ctx.state.blocks=[...prefix,...ordered];sync(ctx.state);return done(a.ids);},
  'document.remove':ctx=>{if(!ctx.state.blocks.length&&!ctx.state.textId)return done([]);const ids=view(ctx.state).map(x=>x.id);commit(ctx.state);ctx.state.blocks=[];ctx.state.title='';ctx.state.kind=null;ctx.state.about=null;ctx.state.textId=null;sync(ctx.state);return done(ids);},
  'document.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'document.undo':undoStep,'document.redo':redoStep,
 };
 const canonical=Object.hasOwn(state,'sop');
 const effectiveHandlers=canonical?Object.fromEntries(Object.entries(handlers).map(([id,handler])=>[id,(ctx,args,invocation)=>{
  const native=toNativeDocumentState(ctx.state),result=handler({...ctx,state:native},args,invocation);
  if(result?.status==='supported')Object.assign(ctx.state,canonicalDocumentState(native));
  return result;
 }])):handlers;
 return createNativeToolHost({state,instanceId,scope:'document-and-blocks',toolInterface,handlers:effectiveHandlers,
  view:canonical?carrier=>view(toNativeDocumentState(carrier)):view,...limits});
}
