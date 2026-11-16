// Evaluation setup bindings, not a language reader or per-row fixture bank.
import {DIAGRAM_TOOL_BINDINGS} from '../../worlds/diagram.sketch/declared-host.mjs';
import {DRAWING_TOOL_BINDINGS} from '../../worlds/art.draw/declared-host.mjs';
const name={from:'name'},field=key=>({from:'field',key});
export const FUNCTIONAL_NATIVE_BINDINGS={
 drawing:DRAWING_TOOL_BINDINGS.find(op=>op.id==='drawing.object.make').params.kind.enum.map(kind=>({id:`setup.drawing.${kind}`,kind,nativeKind:kind,operation:'drawing.object.make',arguments:{kind:{from:'kind'},name}})),
 diagram:DIAGRAM_TOOL_BINDINGS.find(op=>op.id==='diagram.node.make').params.kind.enum.map(kind=>({id:`setup.diagram.${kind}`,kind,nativeKind:kind,operation:'diagram.node.make',arguments:{kind:{from:'kind'}},setters:[{operation:'diagram.node.change',arguments:{ids:{from:'createdIds'},label:name}}]})),
 document:[{id:'setup.document',kind:'document',singleton:true,operation:'document.write',arguments:{title:name,blocks:field('blocks')}},
 ...['paragraph','heading','quote'].map(kind=>({id:`setup.document.${kind}`,kind,operation:'document.block.make',arguments:{parent:{from:'contextObject',key:'parent',sourceType:'docs.editor.document'},kind:{from:'kind'},name,text:field('text')}})),
 {id:'setup.document.section',kind:'section',operation:'document.section.make',arguments:{parent:{from:'contextObject',key:'parent',sourceType:'docs.editor.document'},name,text:field('text')}}],
 calendar:[...['person','room'].map(kind=>({id:`setup.calendar.${kind}`,kind,operation:`calendar.${kind}.add`,arguments:{id:field('nativeId'),label:name}})),{id:'setup.calendar.meeting',kind:'meeting',operation:'calendar.meeting.add',arguments:{id:field('nativeId'),title:name,start:field('start'),duration:field('duration'),participants:field('participants'),room:field('room')}}],
};
