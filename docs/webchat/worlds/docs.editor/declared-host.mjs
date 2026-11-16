// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,copyHostData,nativeToken} from '../native-tool-host.mjs?v=34e8c452f9';
import {createDoc,writeText,commit,sync,undoStep,redoStep,addBlock} from './document.mjs?v=d1f3113f66';
const text={type:'string',required:true},array={type:'array',required:true};
export const DOCUMENT_TOOL_BINDINGS=[
 {id:'document.write',act:'make',on:'docs.editor.document',params:{title:text,blocks:array,genre:{type:'string'},topic:{type:'string'}}},
 {id:'document.compose',act:'make',on:'docs.editor.document',requires:['knowledge-composer'],params:{genre:text,topic:text,words:{type:'integer',min:1,max:100000},chapters:{type:'integer',min:1,max:100}}},
 {id:'document.rewrite',act:'change',on:'docs.editor.document',requires:['knowledge-rewriter'],params:{property:{type:'string',required:true,enum:['tone','length']},value:{type:'string',required:true}}},
 {id:'document.block.make',act:'make',on:'docs.editor.block',params:{parent:text,kind:{type:'string',required:true,enum:['paragraph','heading','quote']},text:{type:'string',default:''},level:{type:'integer',min:3,max:6},name:{type:'string'}}},
 {id:'document.section.make',act:'make',on:'docs.editor.section',params:{parent:text,text:{type:'string',default:''},level:{type:'integer',default:2,min:1,max:2},name:{type:'string'}}},
 {id:'document.block.change',act:'change',on:'docs.editor.block',params:{id:text,text:text}},
 {id:'document.block.remove',act:'remove',on:'docs.editor.block',params:{ids:array}},
 {id:'document.section.remove',act:'remove',on:'docs.editor.section',params:{ids:array}},
 {id:'document.section.reorder',act:'place',on:'docs.editor.section',params:{ids:array}},
 {id:'document.remove',act:'remove',on:'docs.editor.document',params:{}},
 {id:'document.observe',act:'ask',on:'docs.editor.document',params:{}},
 {id:'document.undo',act:'undo',on:'docs.editor.document',params:{}},
 {id:'document.redo',act:'redo',on:'docs.editor.document',params:{}},
];
export function initialDocumentState(){const s={title:'',titleMarks:[],titleAlign:'left',titleSize:0,blocks:[],cursor:-1,selection:null,focus:null,inputMode:null,history:[],future:[],nextId:1,dictBlock:null,kind:null,about:null,textId:null};sync(s);return s;}
const fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const sections=s=>{const heads=s.blocks.map((b,i)=>({b,i})).filter(({b})=>b.kind==='heading'&&(b.level??2)<=2);return heads.map(({b,i},n)=>({id:b.id,start:i,end:heads[n+1]?.i??s.blocks.length}));};
const validBlocks=blocks=>Array.isArray(blocks)&&blocks.length<=10000&&blocks.every(b=>b&&typeof b==='object'&&!Array.isArray(b)&&['paragraph','heading','quote'].includes(b.kind)&&typeof b.text==='string'&&(!Object.hasOwn(b,'level')||Number.isSafeInteger(b.level)&&b.level>=1&&b.level<=6)&&(!Object.hasOwn(b,'from')||Array.isArray(b.from)&&b.from.every(x=>typeof x==='string'))&&Object.keys(b).every(k=>['kind','text','level','from'].includes(k)));
const view=s=>{
 if(!Array.isArray(s.blocks)||!Array.isArray(s.history)||!Array.isArray(s.future))throw new TypeError('invalid-document');
 const groups=new Map(sections(s).map(g=>[g.id,g])),rows=[];
 if(s.textId||s.blocks.length)rows.push({id:s.textId||'document',kind:'document',sourceType:'docs.editor.document',inputs:Object.entries({title:s.title,genre:s.kind,topic:s.about,length:s.stats.words}).map(([key,value])=>({binding:`document.${key}`,key,values:value===null||value===undefined?[]:[nativeToken(value)],...(key==='length'?{dimension:'count',unit:'word',frame:'document.text'}:{})}))});
 for(const b of s.blocks)rows.push({id:b.id,kind:groups.has(b.id)?'section':b.kind,sourceType:groups.has(b.id)?'docs.editor.section':'docs.editor.block',parent:s.textId,inputs:[{binding:'document.block.text',key:'text',values:typeof b.text==='string'?[nativeToken(b.text)]:[]},{binding:'document.block.name',key:'name',values:typeof b.name==='string'?[nativeToken(b.name)]:[]},{binding:'document.block.parent',key:'parent',values:s.textId?[nativeToken(s.textId)]:[]}],...(groups.has(b.id)?{members:s.blocks.slice(groups.get(b.id).start,groups.get(b.id).end).map(x=>x.id)}:{})});
 return rows;
};
export function createDocumentHost({state=initialDocumentState(),instanceId,composer=null,rewriter=null,...limits}={}){
 const stamp=(s,genre,topic)=>{s.kind=genre??'text';s.about=topic??null;s.textSeq=(s.textSeq??0)+1;s.textId=`text${s.textSeq}`;sync(s);};
 const makeChild=(ctx,a,section)=>{
  const s=ctx.state;if(!s.textId||a.parent!==s.textId)return fail('missing-parent-document');
  if(!Number.isSafeInteger(s.nextId)||s.nextId<1||!Number.isSafeInteger(s.nextId+1)||s.blocks.some(b=>b.id===`b${s.nextId}`))return fail('native-id-collision');
  if(!section&&a.kind!=='heading'&&Object.hasOwn(a,'level'))return fail('unexpected-heading-level');
  const block={kind:section?'heading':a.kind,text:a.text};
  if(block.kind==='heading')block.level=section?a.level:(a.level??3);
  if(Object.hasOwn(a,'name'))block.name=a.name;
  commit(s);const made=addBlock(s,block,s.blocks.length);sync(s);return done([made.id]);
 };
 const handlers={
  'document.block.make':(ctx,a)=>makeChild(ctx,a,false),
  'document.section.make':(ctx,a)=>makeChild(ctx,a,true),
  'document.write':(ctx,a)=>{if(!validBlocks(a.blocks))return fail('invalid-content');createDoc(ctx,a.title,a.blocks);stamp(ctx.state,a.genre,a.topic);return done([ctx.state.textId,...ctx.state.blocks.map(b=>b.id)]);},
  'document.compose':(ctx,a,step)=>{if(!composer?.available||typeof composer.compose!=='function')return fail('missing-knowledge-composer');const bounded={available:true,compose:args=>{const result=copyHostData(composer.compose(args));const chapters=result?.composition?.chapters;if(!Array.isArray(chapters)||chapters.length>100||chapters.some(ch=>!Array.isArray(ch.subchapters)||ch.subchapters.length>100||ch.subchapters.some(sc=>!Array.isArray(sc.sentences)||sc.sentences.length>100)))return null;return result;}};return writeText({...ctx,composer:bounded},{kind:a.genre,about:a.topic,words:a.words,chapters:a.chapters,step});},
  'document.rewrite':(ctx,a)=>{if(!rewriter||typeof rewriter.rewrite!=='function')return fail('missing-knowledge-rewriter');const blocks=copyHostData(rewriter.rewrite({blocks:copyHostData(ctx.state.blocks),property:a.property,value:a.value}));if(!validBlocks(blocks))return fail('invalid-rewrite');const genre=ctx.state.kind,topic=ctx.state.about;createDoc(ctx,ctx.state.title,blocks);stamp(ctx.state,genre,topic);return done(ctx.state.blocks.map(b=>b.id));},
  'document.block.change':(ctx,a)=>{const b=ctx.state.blocks.find(b=>b.id===a.id);if(!b||typeof b.text!=='string')return fail('missing-target');if(b.text===a.text)return done([]);commit(ctx.state);b.text=a.text;b.marks=[];sync(ctx.state);return done([a.id]);},
  'document.block.remove':(ctx,a)=>{if(!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ctx.state.blocks.some(b=>b.id===id)))return fail('missing-target');commit(ctx.state);ctx.state.blocks=ctx.state.blocks.filter(b=>!a.ids.includes(b.id));sync(ctx.state);return done(a.ids);},
  'document.section.remove':(ctx,a)=>{const groups=sections(ctx.state);if(!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!groups.some(g=>g.id===id)))return fail('missing-target');const cut=new Set(groups.filter(g=>a.ids.includes(g.id)).flatMap(g=>ctx.state.blocks.slice(g.start,g.end).map(b=>b.id)));commit(ctx.state);ctx.state.blocks=ctx.state.blocks.filter(b=>!cut.has(b.id));sync(ctx.state);return done([...cut]);},
  'document.section.reorder':(ctx,a)=>{const groups=sections(ctx.state);if(!groups.length||a.ids.length!==groups.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!groups.some(g=>g.id===id)))return fail('incomplete-section-order');if(a.ids.every((id,i)=>groups[i].id===id))return done([]);const prefix=ctx.state.blocks.slice(0,groups[0].start),ordered=a.ids.flatMap(id=>{const g=groups.find(g=>g.id===id);return ctx.state.blocks.slice(g.start,g.end);});commit(ctx.state);ctx.state.blocks=[...prefix,...ordered];sync(ctx.state);return done(a.ids);},
  'document.remove':ctx=>{if(!ctx.state.blocks.length&&!ctx.state.textId)return done([]);const ids=view(ctx.state).map(x=>x.id);commit(ctx.state);ctx.state.blocks=[];ctx.state.title='';ctx.state.kind=null;ctx.state.about=null;ctx.state.textId=null;sync(ctx.state);return done(ids);},
  'document.observe':ctx=>({status:'supported',data:view(ctx.state)}),
  'document.undo':undoStep,'document.redo':redoStep,
 };
 return createNativeToolHost({state,instanceId,scope:'document-and-blocks',operations:DOCUMENT_TOOL_BINDINGS,handlers,view,...limits});
}
