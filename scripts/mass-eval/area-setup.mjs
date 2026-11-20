// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation setup only: a row's context objects ({kind,name[,id]}) are created on the tab's SOP area through the
// area's own declared commands (invokeToolCommand on the native host), never by writing state. Each seeded state is
// cached by tab and context, so a worker builds one area base per distinct context and clones it per row.
// Objects that no declared command can create from {kind,name} are reported (setup layer), not invented.
import {invokeToolCommand} from '../../src/dialog/native-control-intent.mjs';
import {NATIVE_AREAS} from '../../src/dialog/app-reader-context.mjs';
import {emptyDrawingState} from '../../worlds/art.draw/sop-drawing.mjs';
import {emptyDiagramState} from '../../worlds/diagram.sketch/sop-diagram.mjs';
import {emptyDocumentArea} from '../../worlds/docs.editor/sop-document.mjs';
import {emptyCalendarArea} from '../../worlds/time.calendar/sop-calendar.mjs';
import {emptyAvatarState} from '../../worlds/ui.avatar/sop-avatar.mjs';

export const TAB={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar',avatar:'avatar'};
const EMPTY={draw:emptyDrawingState,diagram:emptyDiagramState,editor:emptyDocumentArea,calendar:emptyCalendarArea,avatar:emptyAvatarState};
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'x';

export function emptyState(world){
 const tab=TAB[world],area=NATIVE_AREAS[tab];
 return {[area.world]:EMPTY[tab](),'ui.shell':{activeTab:tab}};
}

/** Create the context objects; returns {state, failures:[{index,kind,reason}], seeded}. */
export async function seedContext(world,existing,{knowledge,bindings}={}){
 const tab=TAB[world],area=NATIVE_AREAS[tab],state=emptyState(world);
 const host=await area.create({state:state[area.world],instanceId:'mass-eval-setup',...(knowledge?{knowledge}:{})});
 const ops=new Map((await host.bindings()).map(op=>[op.id,op]));
 const failures=[];let seq=0,seeded=0;
 const call=async(operation,args)=>{
  if(!ops.has(operation))return {ok:false,reason:'undeclared-operation:'+operation};
  try{
   const before=host.observe(),known=new Set(before.objects.map(o=>o.id));
   const receipt=await invokeToolCommand(host,{invocation:'mass-eval-setup:'+(seq++),expectedVersion:before.version,operation,args});
   if(!['changed','unchanged'].includes(receipt.status))return {ok:false,reason:'refused:'+(receipt.reason??receipt.code??receipt.status)};
   const created=host.observe().objects.filter(o=>!known.has(o.id));
   return {ok:true,created};
  }catch(e){return {ok:false,reason:'error:'+String(e?.message??e).slice(0,80)};}
 };
 const kindEnum=id=>ops.get(id)?.params?.kind?.enum??[];
 const items=(existing??[]).map((item,index)=>({...item,index}));
 const ids=new Map();// context id or name -> native id
 const note=(item,r)=>{if(!r.ok)failures.push({index:item.index,kind:item.kind,reason:r.reason});else{seeded++;const id=r.created?.[0]?.id;if(id){ids.set(item.name,id);if(item.id)ids.set(item.id,id);}}return r;};
 if(world==='drawing'){
  for(const item of items){
   const kind=String(item.kind);
   if(kindEnum('drawing.object.make').includes(kind))note(item,await call('drawing.object.make',{kind,...(item.name?{name:item.name}:{})}));
   else{const r=await call('drawing.catalog.make',{name:kind});if(r.ok&&r.created?.[0]&&item.name)await call('drawing.object.change',{ids:[r.created[0].id],name:item.name});note(item,r.ok&&!r.created?.length?{ok:false,reason:'catalog-made-nothing'}:r);}
  }
 }else if(world==='diagram'){
  const nodes=[],charts=[],links=[],groups=[],points=[],series=[];
  // A chart named by its kind ("bar chart", "line graph", "pie chart", "scatter plot") is a chart group drawn with the
  // declared layout its first word names (diagram.group.chart.make layout), else as bars.
  const chartLayouts=ops.get('diagram.group.chart.make')?.params?.layout?.enum??[];
  const isChart=k=>k==='chart'||/ (chart|graph|plot)$/.test(String(k));
  for(const item of items){const k=item.kind;(k==='link'||k==='arrow'||k==='edge'?links:isChart(k)?charts:k==='group'?groups:k==='point'?points:k==='series'?series:nodes).push(item);}
  const nodeKinds=kindEnum('diagram.node.make');
  for(const item of nodes){
   const kind=nodeKinds.includes(item.kind)?item.kind:item.kind==='box'?'rectangle':item.kind==='node'?'rectangle':null;
   if(!kind){failures.push({index:item.index,kind:item.kind,reason:'no-node-kind'});continue;}
   note(item,await call('diagram.node.make',{kind,...(item.name?{label:item.name}:{})}));
  }
  const nativeNodes=()=>host.observe().objects.filter(o=>o.sourceType==='diagram.sketch.node').map(o=>o.id);
  for(const item of links){const n=nativeNodes();if(n.length<2){failures.push({index:item.index,kind:item.kind,reason:'link-needs-two-nodes'});continue;}
   const i=links.indexOf(item)%(n.length-1);note(item,await call('diagram.link.make',{from:n[i],to:n[i+1],...(item.name&&!/^e\d+$/.test(item.name)?{label:item.name}:{})}));}
  const labels=points.length?points.map(p=>p.name):['A','B','C'],values=labels.map((_,i)=>i+1);
  for(const item of charts){const first=String(item.kind).split(' ')[0],layout=chartLayouts.includes(first)?first:'bar';const r=note(item,await call('diagram.group.chart.make',{label:item.name||'Chart',labels,values,layout}));
   if(r.ok)for(const p of points)ids.set(p.name,r.created?.[0]?.id);}
  for(const item of points)if(!charts.length)failures.push({index:item.index,kind:item.kind,reason:'chart-member-without-chart'});else seeded++;
  // A series of the chart (the chart's own values are its first): made by the chart's series command on the first chart.
  const chartId=charts.map(c=>ids.get(c.name)).find(Boolean)??host.observe().objects.find(o=>o.sourceType==='diagram.sketch.group')?.id;
  for(const [i,item] of series.entries()){
   if(!chartId){failures.push({index:item.index,kind:item.kind,reason:'chart-member-without-chart'});continue;}
   note(item,await call('diagram.chart.series.add',{chart:chartId,label:item.name||'Series '+(i+2),values:labels.map((_,k)=>k+2+i)}));
  }
  for(const item of groups){const n=nativeNodes();if(!n.length){failures.push({index:item.index,kind:item.kind,reason:'group-needs-nodes'});continue;}note(item,await call('diagram.group.make',{name:item.name||'Group',ids:n.slice(0,2)}));}
 }else if(world==='document'){
  const doc=()=>host.observe().objects.find(o=>o.sourceType==='docs.editor.document')?.id;
  const docItem=items.find(i=>i.kind==='document');
  if(docItem)note(docItem,await call('document.write',{title:docItem.name||'Document',blocks:[]}));
  for(const item of items){
   if(item===docItem)continue;const parent=doc();if(!parent){failures.push({index:item.index,kind:item.kind,reason:'no-document'});continue;}
   const k=item.kind,name=item.name||undefined;
   if(['paragraph','heading','quote'].includes(k))note(item,await call('document.block.make',{parent,kind:k,text:name??'',...(name?{name}:{})}));
   else if(['section','chapter','subchapter'].includes(k))note(item,await call('document.section.make',{parent,level:k==='subchapter'?2:1,text:'',...(name?{name}:{})}));
   else if(k==='list')note(item,await call('document.list.make',{parent,items:['first item','second item'],style:ops.get('document.list.make').params.style.enum[0],...(name?{name}:{})}));
   else if(k==='table')note(item,await call('document.table.make',{parent,rows:[['A','B'],['1','2']],...(name?{name}:{})}));
   else failures.push({index:item.index,kind:k,reason:'no-document-command'});
  }
 }else if(world==='calendar'){
  let hour=9;
  for(const item of items){
   const k=item.kind,id=slug(item.name||k);
   if(k==='calendar'){if(!item.name||item.name==='Calendar'){seeded++;continue;}note(item,await call('calendar.calendar.add',{id,label:item.name}));}
   else if(k==='person'||k==='room')note(item,await call(`calendar.${k}.add`,{id,label:item.name||k}));
   else if(k==='meeting'||k==='event'){
    // A meeting needs a time: consecutive one-hour slots from 9:00 on the evaluation day (declared baseline, not truth).
    const op=ops.get('calendar.meeting.add'),start=op?.params?.start;
    note(item,await call('calendar.meeting.add',{id,title:item.name||k,start:hour*60,duration:60,participants:[],room:null}));hour++;
   }
   else failures.push({index:item.index,kind:k,reason:'no-calendar-command'});
  }
 }else if(world==='avatar'){
  const present=new Set(host.observe().objects.map(o=>o.kind));
  const slots=ops.get('avatar.part.add')?.params?.id?.enum??[];
  for(let item of items){
   // A context kind is a slot id or a word the deployed binding table binds to a w.face slot ("back hair").
   const bound=(bindings?.kinds??[]).find(k=>k.area==='avatar'&&k.lemma===item.kind)?.canonical?.replace(/^w\.face\./,'');
   const slot=slots.includes(item.kind)||present.has(item.kind)?item.kind:bound;
   if(present.has(slot)||slot==='face'){seeded++;continue;}
   if(slots.includes(slot)){item={...item,kind:slot};
    // The first declared variant the slot accepts.
    let r=null;for(const v of ops.get('avatar.part.add').params.variant.enum){r=await call('avatar.part.add',{id:item.kind,variant:v});if(r.ok)break;}
    note(item,r??{ok:false,reason:'no-variant'});
   }else failures.push({index:item.index,kind:item.kind,reason:'no-avatar-slot'});
  }
 }
 return {state,failures,seeded,ids:Object.fromEntries(ids)};
}

/** Cache of seeded bases per worker: tab + context -> frozen JSON of the state. */
export function createSetupCache({knowledge,bindings,limit=4000}={}){
 const cache=new Map();
 return async(world,existing)=>{
  const key=world+'\u0000'+JSON.stringify(existing??[]);
  let hit=cache.get(key);
  if(!hit){const r=await seedContext(world,existing,{knowledge,bindings});hit={json:JSON.stringify(r.state),failures:r.failures,seeded:r.seeded,ids:r.ids};if(cache.size>=limit)cache.delete(cache.keys().next().value);cache.set(key,hit);}
  return {state:JSON.parse(hit.json),failures:hit.failures,seeded:hit.seeded,ids:hit.ids};
 };
}
