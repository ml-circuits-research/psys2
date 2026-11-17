// Evaluation host declarations: native display labels, never inferred semantic types.
import {str} from '../../src/vendor/sopworld/sopworld.mjs';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export const REPLAY_CONTEXT_PROFILE='psys2.native-reader-context/1';
const labels={
 'art.draw.object':'drawing.object.name','diagram.sketch.node':'diagram.node.label',
 'docs.editor.document':'document.title','docs.editor.block':'document.block.name','docs.editor.section':'document.block.name',
 'time.calendar.meeting':'calendar.meeting.title','time.calendar.room':'calendar.room.label','time.calendar.person':'calendar.person.label',
};
/** Caller supplies actual native observation, actual selected area and sent history.
 * Expected request annotations are not part of this API. */
export function observedReaderContext(area,observation,previous=null){
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
 return {area,context:{existing,previous}};
}
