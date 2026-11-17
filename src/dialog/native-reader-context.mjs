// Evaluation host declarations: native display labels, never inferred semantic types.
import {str} from '../vendor/sopworld/sopworld.mjs';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export const REPLAY_CONTEXT_PROFILE='psys2.native-reader-context/1';
const labels={
 'art.draw.object':'drawing.object.name','diagram.sketch.node':'diagram.node.label',
 'docs.editor.document':'document.title','docs.editor.block':'document.block.name','docs.editor.section':'document.block.name',
 'time.calendar.meeting':'calendar.meeting.title','time.calendar.room':'calendar.room.label','time.calendar.person':'calendar.person.label',
 'time.calendar.calendar':'calendar.calendar.label','data.charts.chart':'chart.title',
};
/** Caller supplies actual native observation, actual selected area and sent history.
 * Expected request annotations are not part of this API. */
export function observedReaderContext(area,observation,previous=null,options={}){
 if(typeof area!=='string'||!area||!(previous===null||typeof previous==='string'))throw Error('invalid-reader-context-input');
 const o=copyHostData(observation,{maxBytes:1000000});
 if(!o||o.complete!==true||typeof o.scope!=='string'||typeof o.instanceId!=='string'||typeof o.version!=='string'||!Array.isArray(o.objects)||o.objects.length>1000)throw Error('incomplete-native-context');
 const sources=new Set(),existing=[];
 for(const object of o.objects){
  if(!(typeof object.id==='string'||Number.isSafeInteger(object.id))||typeof object.version!=='string'||typeof object.source!=='string'||sources.has(object.source)||typeof object.sourceType!=='string'||typeof object.kind!=='string'||!Array.isArray(object.inputs))throw Error('invalid-native-context-object');sources.add(object.source);
  const binding=labels[object.sourceType],inputs=binding?object.inputs.filter(input=>input.binding===binding):[];
  if(inputs.length>1||inputs.length===1&&(!Array.isArray(inputs[0].values)||inputs[0].values.length>1))throw Error('ambiguous-native-display-name');
  const name=inputs.length===1&&inputs[0].values.length===1?str(inputs[0].values[0]):null;
  if(name!==null&&typeof name!=='string')throw Error('invalid-native-display-name');
  existing.push({kind:object.kind,...(name!==null?{name}:{})});
 }
 if(!options.compact)return {area,context:{existing,previous}};
 const compact=hierarchicalReaderContext(o,existing,{text:options.text,focus:options.focus??[]});options.onSummary?.(compact.summary);return {area,context:{existing:compact.existing,previous}};
}

/** A ranked model view of actual observations; the full observation remains authoritative. */
export function hierarchicalReaderContext(observation,existing,{text='',focus=[]}={}){
 const objects=observation.objects,ids=new Set(objects.map(object=>String(object.id))),parents=new Map(),focused=new Set(focus.map(String));
 const own=(child,parent)=>{if(ids.has(String(child))&&ids.has(String(parent))&&String(child)!==String(parent))parents.set(String(child),String(parent));};
 for(const object of objects){for(const key of ['in','parent'])if(object[key]!==undefined)own(object.id,object[key]);for(const child of [...(object.members??[]),...(object.relations?.members??[])])own(child,object.id);}
 const contains=(value)=>{if(typeof text!=='string'||typeof value!=='string'||!value)return false;const source=Array.from(text.toLowerCase()),label=Array.from(value.toLowerCase()),word=char=>char!==undefined&&/[\p{L}\p{N}_]/u.test(char);for(let at=0;at+label.length<=source.length;at++)if(label.every((char,index)=>source[at+index]===char)&&!word(source[at-1])&&!word(source[at+label.length]))return true;return false;};
 const rows=objects.map((object,index)=>{
  let row=existing[index];if(!row.name){const label=(object.inputs??[]).find(input=>['label','name'].includes(input.key)&&input.values?.length===1);const value=label?str(label.values[0]):object.role;if(typeof value==='string'&&value)row={...row,name:value};}
  const mentioned=contains(row.name)||contains(object.role)||contains(row.kind),selected=focused.has(String(object.id))||(object.inputs??[]).some(input=>input.key==='selected'&&input.values?.[0]==='true'),root=!parents.has(String(object.id));
  return {object,index,row,mentioned,selected,root};
 }).filter(row=>row.root||row.mentioned||row.selected);
 rows.sort((a,b)=>Number(b.mentioned)-Number(a.mentioned)||Number(b.selected)-Number(a.selected)||Number(b.root)-Number(a.root)||b.index-a.index);
 return {existing:rows.map(value=>value.row),summary:{profile:'hierarchical-native-context/1',observed:objects.length,included:rows.length,omittedDescendants:objects.length-rows.length,rankedIds:rows.map(value=>value.object.id),policy:'Explicit labels and selection, then roots and recency; full observation retained.'}};
}
