// Literal document editing tools. Uses the real block/mark model, never a language reader.
import {commit,sync,addBlock} from './document.mjs?v=aa0453e621';
import {getText,addMark,cutMark,spliceText,containers} from './model.mjs?v=d82adc50e5';
export const documentTextId=(id,at='0')=>JSON.stringify([id,at]);
const fail=code=>({status:'missing',code}),done=changed=>({status:'supported',changed});
const strings=items=>Array.isArray(items)&&items.length>0&&items.length<=500&&items.every(t=>typeof t==='string');
const table=rows=>Array.isArray(rows)&&rows.length>0&&rows.length<=100&&Array.isArray(rows[0])&&rows[0].length>0&&rows[0].length<=20&&rows.every(row=>Array.isArray(row)&&row.length===rows[0].length&&row.every(v=>typeof v==='string'));
export function changeDocumentBlock(ctx,a){
 const s=ctx.state,b=s.blocks.find(b=>b.id===a.id);if(!b)return fail('missing-target');
 if(!['paragraph','heading','quote'].includes(b.kind)&&['text','kind','level'].some(key=>Object.hasOwn(a,key)))return fail('not-a-plain-text-block');
 if(a.level!==undefined&&(a.kind??b.kind)!=='heading')return fail('unexpected-heading-level');
 const next={...b,...Object.fromEntries(Object.entries(a).filter(([k])=>k!=='id'))};
 if(next.kind!=='heading')delete next.level;
 if(JSON.stringify(b)===JSON.stringify(next))return done([]);
 commit(s);
 if(a.text!==undefined&&a.text!==b.text){let start=0;for(let i=0;i<Math.min(b.text.length,a.text.length);i++){if(b.text[i]!==a.text[i])break;start++;}let suffix=0;for(let i=0;i<Math.min(b.text.length-start,a.text.length-start);i++){if(b.text[b.text.length-1-i]!==a.text[a.text.length-1-i])break;suffix++;}spliceText(b,'0',start,b.text.length-suffix,a.text.slice(start,a.text.length-suffix));}
 const preserved=b.marks;Object.assign(b,next);if(next.kind!=='heading')delete b.level;if(preserved)b.marks=preserved;else delete b.marks;sync(s);return done([a.id]);
}
export function documentEditingHandlers(){
 const textTarget=(s,id)=>{for(const b of s.blocks)for(const c of containers(b))if(documentTextId(b.id,c.at)===id)return {b,c};return null;};
 const select=(ctx,a)=>{const b=ctx.state.blocks.find(b=>b.id===a.id),value=b?containers(b).find(c=>c.at===a.at)?.text:undefined;if(typeof value!=='string'||a.from>a.to||a.to>value.length)return fail('invalid-text-range');ctx.state.selection=a.to>a.from?{type:'range',block:a.id,at:a.at,from:a.from,to:a.to}:{type:'blocks',blocks:[a.id]};ctx.state.focus=a.id;sync(ctx.state);return done([a.id]);};
 const marks=(ctx,a)=>{
  const s=ctx.state,b=s.blocks.find(b=>b.id===a.id),value=b?containers(b).find(c=>c.at===a.at)?.text:undefined;
  if(typeof value!=='string'||a.from>=a.to||a.to>value.length)return fail('invalid-text-range');
  if(a.mark==='link'&&a.enabled&&(!a.attrs||typeof a.attrs.href!=='string'||! /^(https?:|mailto:|#)/i.test(a.attrs.href)))return fail('invalid-link');
  if(a.mark==='highlight'&&a.enabled&&(!a.attrs||typeof a.attrs.color!=='string'||!/^#[a-f0-9]{6}$/i.test(a.attrs.color)))return fail('invalid-highlight');
  if(a.attrs&&Object.keys(a.attrs).some(k=>!['href','color'].includes(k)))return fail('unknown-mark-attribute');
  commit(s);if(a.enabled)addMark(b,a.at,a.from,a.to,a.mark,a.attrs);else cutMark(b,a.at,a.from,a.to,a.mark);sync(s);return done([a.id]);
 };
 const align=(ctx,a)=>{const b=ctx.state.blocks.find(b=>b.id===a.id);if(!b)return fail('missing-target');if((b.align??'left')===a.align)return done([]);commit(ctx.state);b.align=a.align;sync(ctx.state);return done([a.id]);};
 const make=(ctx,a,kind)=>{const s=ctx.state;if(!s.textId||a.parent!==s.textId)return fail('missing-parent-document');if(kind==='list'?!strings(a.items):!table(a.rows))return fail('invalid-literal-content');commit(s);const b=addBlock(s,{kind,...Object.fromEntries(Object.entries(a).filter(([k])=>k!=='parent'))});sync(s);return done([b.id]);};
 return {
  'document.title.change':(ctx,a)=>{if(a.id!==ctx.state.textId)return fail('missing-document');if(ctx.state.title===a.title)return done([]);commit(ctx.state);ctx.state.title=a.title;ctx.state.titleMarks=[];sync(ctx.state);return done([a.id]);},
  'document.block.select':select,'document.section.select':select,
  'document.section.change':changeDocumentBlock,
  'document.block.mark':marks,'document.section.mark':marks,
  'document.block.align':align,'document.section.align':align,
  'document.block.reorder':(ctx,a)=>{const s=ctx.state;if(a.ids.length!==s.blocks.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!s.blocks.some(b=>b.id===id)))return fail('incomplete-block-order');if(a.ids.every((id,i)=>s.blocks[i].id===id))return done([]);commit(s);const byId=new Map(s.blocks.map(b=>[b.id,b]));s.blocks=a.ids.map(id=>byId.get(id));sync(s);return done([...a.ids]);},
  'document.list.make':(ctx,a)=>make(ctx,a,'list'),
  'document.table.make':(ctx,a)=>make(ctx,a,'table'),
  'document.list.change':(ctx,a)=>{const s=ctx.state,b=s.blocks.find(b=>b.id===a.id&&b.kind==='list');if(!b)return fail('missing-list');if(a.items!==undefined&&!strings(a.items)||a.checked!==undefined&&(!Array.isArray(a.checked)||a.checked.length!==(a.items??b.items).length||a.checked.some(v=>typeof v!=='boolean')))return fail('invalid-list-content');commit(s);Object.assign(b,Object.fromEntries(Object.entries(a).filter(([k])=>k!=='id')));sync(s);return done([a.id]);},
  'document.table.change':(ctx,a)=>{const s=ctx.state,b=s.blocks.find(b=>b.id===a.id&&b.kind==='table');if(!b)return fail('missing-table');if(a.rows!==undefined&&!table(a.rows))return fail('invalid-table-content');commit(s);Object.assign(b,Object.fromEntries(Object.entries(a).filter(([k])=>k!=='id')));sync(s);return done([a.id]);},
  'document.container.change':(ctx,a)=>{const s=ctx.state,target=textTarget(s,a.id);if(!target)return fail('missing-text-container');const {b,c}=target;if(c.text===a.text)return done([]);commit(s);let start=0;for(let i=0;i<Math.min(c.text.length,a.text.length);i++){if(c.text[i]!==a.text[i])break;start++;}let suffix=0;for(let i=0;i<Math.min(c.text.length-start,a.text.length-start);i++){if(c.text[c.text.length-1-i]!==a.text[a.text.length-1-i])break;suffix++;}spliceText(b,c.at,start,c.text.length-suffix,a.text.slice(start,a.text.length-suffix));sync(s);return done([a.id,b.id]);},
 };
}
