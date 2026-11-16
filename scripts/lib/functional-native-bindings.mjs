// Evaluation setup bindings, not a language reader or per-row fixture bank.
import {DIAGRAM_TOOL_BINDINGS} from '../../worlds/diagram.sketch/declared-host.mjs';
const name={from:'name'},field=key=>({from:'field',key});
export const FUNCTIONAL_NATIVE_BINDINGS={
 drawing:[], // No declared Drawing lifecycle create host is published.
 diagram:DIAGRAM_TOOL_BINDINGS.find(op=>op.id==='diagram.node.make').params.kind.enum.map(kind=>({id:`setup.diagram.${kind}`,kind,nativeKind:kind,operation:'diagram.node.make',arguments:{kind:{from:'kind'}},setters:[{operation:'diagram.node.change',arguments:{ids:{from:'createdIds'},label:name}}]})),
 document:[{id:'setup.document',kind:'document',operation:'document.write',arguments:{title:name,blocks:field('blocks')}}],
 calendar:[...['person','room'].map(kind=>({id:`setup.calendar.${kind}`,kind,operation:`calendar.${kind}.add`,arguments:{id:name,label:name}})),{id:'setup.calendar.meeting',kind:'meeting',operation:'calendar.meeting.add',arguments:{id:name,title:name,start:field('start'),duration:field('duration'),participants:field('participants'),room:field('room')}}],
};
