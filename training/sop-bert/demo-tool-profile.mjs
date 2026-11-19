// SPDX-License-Identifier: AGPL-3.0-only
// C1 data scope: annotation roles joined explicitly to real tool declarations.
// These joins declare relevance only; they do not parse language or authorize execution.
import {PREFIX} from '../../worlds/diagram.sketch/core.mjs';
import {colourHex} from '../../src/knowledge/values.mjs';
import {pathToFileURL} from 'node:url';
import {createFacts} from '../../src/knowledge/facts.mjs';
import {createKnowledgeSource} from '../../src/loaders/knowledge-source.mjs';
import {createAvatarArea,emptyAvatarState} from '../../worlds/ui.avatar/sop-avatar.mjs';
const faceFacts=createFacts({source:createKnowledgeSource(new URL('../../../sop-knowledge-worlds/docs/worlds',import.meta.url).pathname)});
export const DEMO_AVATAR_DATA=await faceFacts.faces();
if(!DEMO_AVATAR_DATA)throw Error('published-avatar-knowledge-unavailable');
const avatarState=emptyAvatarState(),avatarHost=await createAvatarArea({state:avatarState,instanceId:'training-avatar-contract'});
// The avatar's declared choices: the enumerations of its realized native interface.
const avatarChoices=Object.fromEntries(avatarHost.bindings().map(op=>[op.id,Object.fromEntries(Object.entries(op.params).filter(([,p])=>p.enum).map(([k,p])=>[k,p.enum]))]));
const avatarSlots=Object.fromEntries(avatarHost.observe().objects.filter(o=>o.sourceType==='ui.avatar.part').map(o=>[o.id,JSON.parse(o.inputs.find(i=>i.key==='variant').values[0])]));
import {drawingPartsOf} from '../../worlds/art.draw/part-tools.mjs';
import {makeObject} from '../../worlds/art.draw/board.mjs';
import {DRAWING_TOOL_BINDINGS} from '../../worlds/art.draw/declared-host.mjs';
import {DIAGRAM_TOOL_BINDINGS} from '../../worlds/diagram.sketch/declared-host.mjs';
import {CHART_TOOL_BINDINGS} from '../../worlds/data.charts/declared-host.mjs';
import {DOCUMENT_TOOL_BINDINGS} from '../../worlds/docs.editor/declared-host.mjs';
import {CALENDAR_TOOL_BINDINGS} from '../../worlds/time.calendar/declared-host.mjs';
const declarations={drawing:DRAWING_TOOL_BINDINGS,diagram:[...DIAGRAM_TOOL_BINDINGS,...CHART_TOOL_BINDINGS],document:DOCUMENT_TOOL_BINDINGS,calendar:CALENDAR_TOOL_BINDINGS,avatar:avatarHost.bindings()};
const fields={},families={};
const actRealizations={drawing:{place:['drawing.object.change'],arrange:['drawing.object.change']},diagram:{connect:['diagram.link.make'],disconnect:['diagram.link.remove'],arrange:['diagram.node.layout']},calendar:{arrange:['calendar.meeting.move'],connect:['calendar.meeting.change']},document:{place:['document.section.reorder']}};
function field(area,key,operation,parameter,interpretation='literal-or-typed-value'){
 const op=declarations[area].find(op=>op.id===operation),param=op?.params?.[parameter];
 fields[area+'.'+key]={status:param?'relevant':'unsupported',operation,parameter,interpretation,...(param?{parameterDeclaration:param,requires:op.requires??[]}:{reason:'native-operation-parameter-not-exposed'})};
}
function family(area,type,operations,{kindParameter=null,kindOperation=null,interpretation='direct-native-family'}={}){
 const ops=operations.map(id=>declarations[area].find(op=>op.id===id)).filter(Boolean);
 const kindOp=ops.find(op=>op.id===kindOperation)??ops.find(op=>op.act==='make');
 families[area+'.'+type]={status:ops.length?'relevant':'unsupported',operations:ops.map(op=>op.id),acts:[...new Set(ops.map(op=>op.act))],sourceTypes:[...new Set(ops.map(op=>op.on))],interpretation,...(kindParameter?{kindParameter,kindOperation:kindOp?.id,kindValues:kindOp?.params?.[kindParameter]?.enum??null}:{})};
}
family('drawing','drawn',DRAWING_TOOL_BINDINGS.map(op=>op.id),{kindParameter:'kind'});
for(const [key,param]of Object.entries({colour:'color',size:'size',kind:'kind',name:'name'}))field('drawing','drawn.'+key,key==='kind'?'drawing.object.make':'drawing.object.change',param);
for(const key of ['at','relation','anchor','direction','distance'])field('drawing','drawn.'+key,'drawing.object.change','x','spatial-reference-or-measured-placement; preserve relation and anchor, resolve through shared spaces');
field('drawing','drawn.count','drawing.object.make','kind','group quantity composes repeated creation/removal; never replaces count with 1');
family('diagram','node',DIAGRAM_TOOL_BINDINGS.filter(op=>op.on==='diagram.sketch.node').map(op=>op.id),{kindParameter:'kind'});
family('diagram','link',DIAGRAM_TOOL_BINDINGS.filter(op=>op.on==='diagram.sketch.link').map(op=>op.id));
family('diagram','diagram',DIAGRAM_TOOL_BINDINGS.map(op=>op.id),{interpretation:'whole observed diagram; acts compose over native nodes and links'});
family('diagram','chart',CHART_TOOL_BINDINGS.map(op=>op.id),{kindParameter:'type'});
for(const [key,param]of Object.entries({label:'label',colour:'colour',size:'size'}))field('diagram','node.'+key,'diagram.node.change',param);
field('diagram','node.shape','diagram.node.make','kind','native node kind; existing node shape change requires a separate exposed mutation');
for(const key of ['at','position','anchor'])field('diagram','node.'+key,'diagram.node.place','x','spatial reference resolves to native coordinates');
for(const key of ['from','to'])field('diagram','link.'+key,'diagram.link.make',key,'resolve endpoint description to observed node identity');
field('diagram','diagram.layout','diagram.node.layout','layout','layout applies to observed node collection');
field('diagram','chart.datasets','chart.make','datasets','literal dataset array');
field('diagram','diagram.kind','diagram.node.make','kind','diagram structure requires explicit composition, not node-kind equivalence');
for(const [key,param]of Object.entries({title:'title',values:'values',source:'source',series:'series',labels:'labels'}))field('diagram','chart.'+key,'chart.make',param,key==='values'?'copy explicit data span, then typed labels/numbers conversion':'literal-or-source-reference');
for(const [key,param]of Object.entries({legend:'showLegend',show_values:'showValues',stacked:'stacked',horizontal:'horizontal',sort:'sort',palette:'palette',colour:'colour'}))field('diagram','chart.'+key,'chart.change',param);
family('document','text',DOCUMENT_TOOL_BINDINGS.filter(op=>op.on==='docs.editor.document').map(op=>op.id),{interpretation:'visible document; compose requires installed knowledge composer'});
family('document','section',DOCUMENT_TOOL_BINDINGS.filter(op=>['docs.editor.section','docs.editor.block'].includes(op.on)).map(op=>op.id),{interpretation:'visible section/paragraph/heading/quote, preserves literal content'});
family('document','inline',DOCUMENT_TOOL_BINDINGS.filter(op=>op.on==='docs.editor.block').map(op=>op.id),{interpretation:'literal block and inline editing'});
for(const [key,param]of Object.entries({genre:'genre',about:'topic',title:'title'}))field('document','text.'+key,'document.write',param);
for(const [key,param]of Object.entries({words:'words',chapters:'chapters'}))field('document','text.'+key,'document.compose',param,'knowledge composition; bounded requested quantity retained');
for(const[key,param]of Object.entries({format:'mark',enabled:'enabled',from:'from',to:'to',link_target:'attrs',highlight_colour:'attrs'}))field('document','inline.'+key,'document.block.mark',param);
field('document','inline.align','document.block.align','align');
field('document','inline.list_kind','document.list.make','style');
field('document','inline.items','document.list.make','items');
field('document','inline.rows','document.table.make','rows');
field('document','text.content','document.write','blocks','literal paragraph body serialized as native block array');
field('document','text.tone','document.rewrite','value','requires installed knowledge rewriter');
field('document','text.length','document.rewrite','value','requires installed knowledge rewriter; contextual degree preserved');
field('document','section.content','document.block.change','text','literal block/section text');
field('document','section.role','document.section.make','name','named section as a visible heading');
for(const key of ['order','order_anchor'])field('document','section.'+key,'document.section.reorder','ids','resolve ordered sections and preserve relative reference');
field('document','section.level','document.section.make','level');
field('document','section.count','document.section.make','parent','quantity composes visible sections under one document');
field('document','section.length','document.rewrite','value','rewriter must implement section-local scope, never rewrite whole document implicitly');
field('document','section.words','document.compose','words','composer must implement section-local scope');
for(const type of ['person','room','calendar','meeting'])family('calendar',type,CALENDAR_TOOL_BINDINGS.filter(op=>op.on==='time.calendar.'+type).map(op=>op.id));
field('calendar','person.name','calendar.person.add','label');
field('calendar','room.seats','calendar.room.add','capacity');
for(const key of ['name','label','location','capacity'])field('calendar','room.'+key,'calendar.room.add',key==='name'?'label':key);
for(const key of ['name','label','colour'])field('calendar','calendar.'+key,'calendar.calendar.add',key==='name'?'label':key);
for(const [key,param]of Object.entries({title:'title',people:'participants',room:'room',calendar:'calendar',agenda:'notes'}))field('calendar','meeting.'+key,'calendar.meeting.add',param,['people','room','calendar'].includes(key)?'resolve declared resource identity':'literal text');
for(const key of ['day','time','end','length','shift','relation','relation_anchor','free'])field('calendar','meeting.'+key,'calendar.meeting.add',key==='length'?'duration':'start','typed temporal constraint over observed intervals; shared temporal resolution/completion required');
family('avatar','face',declarations.avatar.filter(op=>op.on==='ui.avatar.face').map(op=>op.id));
family('avatar','part',declarations.avatar.filter(op=>op.on==='ui.avatar.part').map(op=>op.id));
for(const key of ['preset','expression','name'])field('avatar','face.'+key,'avatar.face.'+key,key);
for(const key of ['variant','colour','size'])field('avatar','part.'+key,'avatar.part.change',key);
field('avatar','part.ids','avatar.part.change','ids','exact observed slot labels to declared native slot ids');
field('avatar','part.place','avatar.part.move','place');
const partState={objects:[],nextId:1};const partObject=makeObject(partState,'house');
family('drawing','part',DRAWING_TOOL_BINDINGS.filter(op=>op.on==='art.draw.part').map(op=>op.id));
family('drawing','group',DRAWING_TOOL_BINDINGS.filter(op=>['drawing.object.group','drawing.object.ungroup'].includes(op.id)).map(op=>op.id));
for(const key of ['owner','index','colour','width','height'])field('drawing','part.'+key,'drawing.part.change',{owner:'id',index:'index',colour:'color',width:'width',height:'height'}[key]);
for(const key of ['x','y'])field('drawing','part.'+key,'drawing.part.place',key);
for(const key of ['members','name'])field('drawing','group.'+key,'drawing.object.group',key==='members'?'ids':'name');
export function demoToolProfile(){return {format:'psys2.demo-tool-profile/1',tabs:{drawing:'Drawing',diagram:'Diagram (including charts)',calendar:'Calendar',document:'Documents',avatar:'Avatar'},drawingParts:drawingPartsOf(partObject).map(part=>({index:part.index,role:part.role,width:part.width,height:part.height})),avatar:{capabilities:avatarChoices,initialSlots:avatarSlots,tintColours:Object.fromEntries(Object.entries(DEMO_AVATAR_DATA.colours).map(([role,values])=>[role,Object.keys(values)])),fixedColours:Object.fromEntries(DEMO_AVATAR_DATA.slots.map(slot=>[slot.name,[...new Set((slot.variants.find(v=>v.name===avatarSlots[slot.name])?.parts??[]).flatMap(p=>p.tint?[]:p.colour??[]))]])),objects:avatarHost.observe().objects.map(o=>({id:o.id,kind:o.kind,sourceType:o.sourceType}))},declarations,actRealizations,fields,families,nativeIdentity:{diagramNodePrefixes:PREFIX,diagramChartPrefix:'chart:'},normalizations:{colour:Object.fromEntries(['red','blue','green','yellow','purple','orange'].map(name=>[name,colourHex(name)]))},knowledgeReferences:[{path:'sop-knowledge-worlds/docs/worlds/w.chart/schema.sop',purpose:'chart, series, category and numeric point schemas; schema breadth does not imply renderer breadth'},{path:'sop-knowledge-worlds/docs/worlds/k.charts/shards/charts.sop',purpose:'declared chart kinds/forms; no spelling substitution for unavailable forms'},{path:'sop-knowledge-worlds/docs/worlds/w.calendar/schema.sop',purpose:'calendar resources and interval event identities'},{path:'sop-knowledge-worlds/docs/worlds/w.room/schema.sop',purpose:'room name and seating capacity'},{path:'sop-knowledge-worlds/docs/worlds/w.person/schema.sop',purpose:'person occupation belongs here, not to calendar management'},{path:'sop-knowledge-worlds/docs/worlds/w.document/schema.sop',purpose:'document, chapter, section and paragraph structure; genre/register joins to k.genres'}],boundary:'Annotation-to-tool relevance only. No row is certified executable or semantically correct by this profile. Composition/solver/knowledge-dependent roles remain visible; unsupported roles are never silently stripped.'};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(JSON.stringify(demoToolProfile(),null,2)+'\n');
