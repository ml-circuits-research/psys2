// C1 execution check of authored expected tool plans. No sentence parsing or model input labels.
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {invokeToolCommand} from '../../src/dialog/native-control-intent.mjs';
import {emptyAreaState} from '../../worlds/sop-area-adapter.mjs';
import {createAvatarArea} from '../../worlds/ui.avatar/sop-avatar.mjs';
import {createDrawingArea} from '../../worlds/art.draw/sop-drawing.mjs';
import {createDiagramArea} from '../../worlds/diagram.sketch/sop-diagram.mjs';
import {createDocumentArea} from '../../worlds/docs.editor/sop-document.mjs';
import {createCalendarArea} from '../../worlds/time.calendar/sop-calendar.mjs';
const [input,output,limit='1000']=process.argv.slice(2);if(!output)throw Error('usage: check-demo-native-tools.mjs CORPUS_GZ OUTPUT_JSON [LIMIT]');
const bytes=readFileSync(input),rows=gunzipSync(bytes).toString().trim().split('\n').map(JSON.parse).filter(row=>row.phase==='direct');
const hash=value=>createHash('sha256').update('native-tool-check-1\n'+value).digest('hex');rows.sort((a,b)=>hash(a.source_path+':'+a.source_id).localeCompare(hash(b.source_path+':'+b.source_id)));
const checked=[],start=performance.now();
for(const [index,row]of rows.slice(0,Number(limit)).entries()){
 const state=emptyAreaState();
 const factory={drawing:createDrawingArea,diagram:createDiagramArea,document:createDocumentArea,calendar:createCalendarArea,avatar:createAvatarArea}[row.world],host=await factory({state,instanceId:'corpus-check-'+index});let seq=0;
 const call=async(operation,args)=>{const result=invokeToolCommand(host,{invocation:'call-'+(++seq),expectedVersion:host.observe().version,operation,args});if(!['changed','unchanged'].includes(result.status))throw Error(JSON.stringify({operation,args,status:result.status,reason:result.reason,code:result.code}));return result;};
 let setup=true,error=null;const objects=row.context.existing,counts={},ids={};
 try{
  if(row.world==='document'&&objects.length)await call('document.write',{title:objects.find(o=>o.kind==='document')?.name??'Draft',blocks:[]});
  for(const object of objects){
   if(row.world==='drawing')await call('drawing.object.make',{kind:object.kind,name:object.name});
   else if(row.world==='diagram'){
    if(object.kind==='chart')await call('chart.make',{type:'bar',title:object.name,labels:['Alpha','Beta'],values:[1,2]});
    else{const before=new Set(host.observe().objects.map(o=>o.id));await call('diagram.node.make',{kind:'rectangle'});const made=host.observe().objects.find(o=>!before.has(o.id)&&o.sourceType==='diagram.sketch.node');await call('diagram.node.change',{ids:[made.id],label:object.name});}
   }else if(row.world==='document'&&object.kind!=='document'){
    if(object.kind==='section'||object.kind==='heading')await call('document.section.make',{parent:'text1',name:object.name,text:object.name,level:2});
    else await call('document.block.make',{parent:'text1',kind:object.kind,name:object.name,text:object.text??object.name});
   }else if(row.world==='calendar'&&object.kind!=='meeting'){
    const kind=object.kind;counts[kind]=(counts[kind]??0)+1;ids[kind]??=[];const id=kind+counts[kind];ids[kind].push(id);await call('calendar.'+kind+'.add',{id,label:object.name});
   }
  }
  if(row.world==='calendar')for(const object of objects.filter(o=>o.kind==='meeting')){counts.meeting=(counts.meeting??0)+1;await call('calendar.meeting.add',{id:'meeting'+counts.meeting,title:object.name,start:Date.UTC(2026,11,1,8),duration:1800000,participants:ids.person??[],room:ids.room?.[0]??null,calendar:ids.calendar?.[0]??null});}
 }catch(e){setup=false;error=String(e.message);}
 let applied=0;
 if(setup)try{for(const tool of row.expectedTools){await call(tool.operation,tool.args);applied++;}}catch(e){error=String(e.message);}
 checked.push({id:row.source_path+':'+row.source_id,area:row.world,setup,applied,expected:row.expectedTools.length,error});
 if((index+1)%250===0)console.log(JSON.stringify({checked:index+1,errors:checked.filter(r=>r.error).length}));
}
const summary={format:'psys2.authored-native-tool-check/1',input,sha256:createHash('sha256').update(bytes).digest('hex'),selection:`${Math.min(rows.length,Number(limit))} smallest hash(native-tool-check-1 newline source identity), before outcomes, phase1 only`,checked:checked.length,setupFailures:checked.filter(r=>!r.setup).length,toolFailures:checked.filter(r=>r.setup&&r.error).length,seconds:(performance.now()-start)/1000,rows:checked,scope:'Actual declared native host calls on authored setup. No SOP-BERT inference, semantic sentence judgment or browser interaction; does not prove generated text variety or training success.'};
writeFileSync(output,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({checked:summary.checked,setupFailures:summary.setupFailures,toolFailures:summary.toolFailures,seconds:summary.seconds}));
