// Development-only functional matrix through the sole application reader/coordinator.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runNewEngine} from '../src/dialog/new-engine.mjs';
import {initialState as drawing} from '../worlds/art.draw/board.mjs';
import {initialDiagramState as diagram} from '../worlds/diagram.sketch/declared-host.mjs';
import {initialDocumentState as document} from '../worlds/docs.editor/declared-host.mjs';
import {initialChartState as charts} from '../worlds/data.charts/declared-host.mjs';
const path='training/eval/functional-matrix/dev-rows.jsonl',raw=readFileSync(path,'utf8'),input=raw.trim().split('\n').map(JSON.parse);
const tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'},rows=[];
for(const row of input){
 const state={'art.draw':drawing(),'diagram.sketch':diagram(),'docs.editor':document(),'data.charts':charts(),'time.calendar':{people:[],rooms:[],meetings:[]},'ui.shell':{activeTab:tabs[row.world]}};
 const session={isession:{state},newEngineJournal:[]},before=JSON.stringify(state);
 let reply,error;
 try{reply=await runNewEngine(session,row.text,{language:'en'});}catch(e){error=String(e?.message??e);}
 const unchanged=before===JSON.stringify(state),refused=reply?.statuses?.length>0&&reply.statuses.every(s=>s==='unsupported');
 // Context names/kinds are not complete native snapshots. Never invent times,
 // resources, layouts or document contents to make an annotated request pass.
 const setupComplete=!row.context?.existing?.length&&!row.context?.previous;
 const honest=!error&&refused&&unchanged&&reply.effects?.length===0&&reply.text?.trim()&&reply.trace?.legacy===false;
 const verdict=honest?'honest':error||reply?.trace?.legacy!==false?'wrong':'needs-review';
 rows.push({id:row.id,area:row.world,classes:row.classes,text:row.text,verdict,setupComplete,contextInstantiated:false,unchanged,reason:reply?.trace?.reason??null,reply:reply?.text??null,error,annotation:row.requests});
}
const verdicts=['right','partly','honest','wrong','needs-review'],summary=Object.fromEntries(verdicts.map(v=>[v,rows.filter(r=>r.verdict===v).length]));
const declared=JSON.parse(readFileSync('training/eval/functional-matrix/matrix.json','utf8')),areas=Object.keys(tabs),cells={};
for(const name of Object.keys(declared).sort())cells[name]=Object.fromEntries(areas.map(area=>{const selected=rows.filter(r=>r.area===area&&r.classes.includes(name));return [area,{...Object.fromEntries(verdicts.map(v=>[v,selected.filter(r=>r.verdict===v).length])),setupIncomplete:selected.filter(r=>!r.setupComplete).length,total:selected.length}];}));
const scope='Actual sole-engine development replay from empty native stores. Annotated context names/kinds are retained but are not fabricated into incomplete native objects. Honest counts measure no-effect refusals, not semantic success; executions require independent annotation/state assessment before promotion to right or partly. Context-dependent rows remain explicitly setup-incomplete.';
writeFileSync('training/results/new-engine-functional.json',JSON.stringify({source:{path,sha256:createHash('sha256').update(raw).digest('hex')},scope,summary,cells,rows},null,2)+'\n');
const table='| Class | '+areas.join(' | ')+' |\n|---|'+areas.map(()=>'---').join('|')+'|\n'+Object.entries(cells).map(([name,cell])=>'| '+name+' | '+areas.map(area=>verdicts.map(v=>cell[area][v]).join('/')+` (${cell[area].setupIncomplete} incomplete)`).join(' | ')+' |').join('\n');
writeFileSync('training/results/new-engine-functional.md','# Sole-engine functional matrix\n\n'+scope+'\n\nCells: right / partly / honest / wrong / needs-review; context-incomplete count in parentheses. Rows may belong to several classes.\n\n'+table+'\n');
console.log(JSON.stringify({summary,rows:rows.length,setupIncomplete:rows.filter(r=>!r.setupComplete).length}));
if(summary.wrong||summary['needs-review'])process.exitCode=1;
