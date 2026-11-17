// Complete power sets of meaningful optional UI detail units. Endpoints and kind/level
// are coupled where dropping only half would change the intended structural relation.
const profiles=[];
const profile=(area,operation,core,required,units,extra={})=>profiles.push({area,operation,core,required,units,...extra});
const unit=(key,value,phrase)=>({args:{[key]:value},phrase});
const coupled=(args,phrase)=>({args,phrase});
const geometry=[unit('x',120,'at x 120'),unit('y',90,'at y 90'),unit('width',160,'160 wide'),unit('height',100,'100 high')];
profile('drawing','drawing.object.make','draw a house',{kind:'house'},[...geometry,unit('size',80,'size 80'),unit('color','#ff0000','coloured red'),unit('label','Home','labelled Home')],{mentions:{color:'red'}});
profile('drawing','drawing.catalog.make','draw a man',{name:'man'},[unit('x',120,'at x 120'),unit('y',90,'at y 90'),unit('size',80,'size 80')]);
profile('drawing','drawing.object.change','update the house',{ids:['$house']},[...geometry,unit('size',80,'size 80'),unit('color','#ff0000','coloured red'),unit('label','Home','labelled Home')],{minimumUnits:1,mentions:{color:'red'}});
profile('drawing','drawing.part.change','update part 0 of the house',{id:'$house',index:0},[unit('color','#ff0000','coloured red'),unit('width',90,'90 wide'),unit('height',45,'45 high')],{minimumUnits:1,mentions:{color:'red'}});
profile('drawing','drawing.object.group','group the house and circle',{ids:['$house','$circle']},[unit('name','Scene','called Scene'),unit('label','Village','labelled Village')]);
profile('drawing','drawing.ids.show','temporarily display the drawing object IDs',{mode:'temporary'},[unit('duration',4000,'for 4 seconds')]);
profile('diagram','diagram.node.make',args=>args.n===2?'add two rectangle nodes':'add a rectangle',{kind:'rectangle'},[unit('label','Step','labelled Step'),unit('n',2,''),unit('colour','blue','coloured blue'),unit('size','large','large'),unit('layout','row','in a row'),unit('x',240,'at x 240'),unit('y',160,'at y 160')]);
profile('diagram','diagram.node.change','update the Start box',{ids:['$node']},[unit('label','Approval','labelled Approval'),unit('colour','blue','coloured blue'),unit('size','large','large'),unit('value',12,'with value 12')],{minimumUnits:1});
profile('diagram','diagram.link.change','update arrow $edge',{ids:['$edge']},[coupled({from:'$otherNode',to:'$node'},'pointing from Finish back to Start'),unit('label','next','labelled next'),unit('colour','blue','coloured blue'),unit('style','dashed','with a dashed stroke'),unit('arrow','both','with arrowheads at both ends'),unit('width',2,'with stroke width 2')],{minimumUnits:1});
profile('diagram','diagram.group.make','group Start and Finish as g2',{name:'g2',ids:['$node','$otherNode']},[unit('label','Process','labelled Process')]);
profile('diagram','diagram.group.change','update the Process group',{id:'$group'},[unit('label','Updated process','labelled Updated process'),unit('colour','blue','with blue members'),unit('size','large','with large members')],{minimumUnits:1});
profile('diagram','diagram.ids.show','temporarily display the diagram object IDs',{mode:'temporary'},[unit('duration',4000,'for 4 seconds')]);
profile('document','document.section.change','update the Chapter heading',{id:'$chapter'},[unit('text','Overview','with text Overview'),unit('name','Outline','with object name Outline'),unit('level',1,'at level 1'),unit('align','center','centred')],{minimumUnits:1,mentions:{align:'centred'}});
profile('document','document.list.make','add a checklist containing Draft and Review',{parent:'$document',items:['Draft','Review'],style:'task'},[unit('name','Tasks','called Tasks')]);
profile('document','document.list.change','update the Tasks list',{id:'$list'},[unit('items',['Draft','Approve'],'with items Draft and Approve'),unit('style','numbered','numbered'),unit('checked',[true,false],'with only the first item checked')],{minimumUnits:1,mentions:{checked:'only the first item checked'}});
profile('document','document.table.make','add a table with rows Item,Cost and Paper,12',{parent:'$document',rows:[['Item','Cost'],['Paper','12']]},[unit('name','Budget','called Budget'),unit('header',true,'with a header row')]);
profile('document','document.table.change','update the Budget table',{id:'$table'},[unit('rows',[['Item','Cost'],['Paper','15']],'with rows Item,Cost and Paper,15'),unit('header',false,'without a header row')],{minimumUnits:1});
profile('document','document.block.make','add a level 3 heading',{parent:'$document',kind:'heading',level:3},[unit('text','A new idea','with text A new idea'),unit('name','Idea','with object name Idea')]);
profile('document','document.section.make','add a subchapter',{parent:'$document'},[unit('after','$chapter','after Chapter'),unit('text','Results','with heading Results'),unit('level',2,'at level 2'),unit('name','Findings','with object name Findings')]);
profile('document','document.block.change','update the first paragraph',{id:'$paragraph'},[unit('text','Revised paragraph','with text Revised paragraph'),unit('name','Summary','with object name Summary'),coupled({kind:'heading',level:3},'as a level 3 heading'),unit('align','justify','with justified alignment')],{minimumUnits:1,mentions:{align:'justified'}});
profile('calendar','calendar.event.add','add Planning on 2026-11-18 at 10:00 UTC for 30 minutes, ID planning',{id:'planning',title:'Planning',start:1794996000000,duration:1800000},[unit('notes','Draft budget','with notes Draft budget')]);
profile('calendar','calendar.meeting.change','update the Review event',{id:'$event'},[unit('title','Team review','with title Team review'),unit('start',1794996000000,'on 2026-11-18 at 10:00 UTC'),unit('duration',3600000,'for one hour'),unit('notes','Bring draft','with notes Bring draft')],{minimumUnits:1});
profile('avatar','avatar.face.compose','change the avatar',{id:'face'},[unit('base','man','to the man appearance'),unit('characterKind','human','with human character kind')],{minimumUnits:1});
profile('avatar','avatar.part.change','update the mouth',{ids:['mouth']},[unit('variant','smile','to the smile variant'),unit('size','big','big')],{minimumUnits:1});
profile('avatar','avatar.part.change','update the front hair, back hair and eyebrows',{ids:'$hairColourScope'},[unit('colour','blue','coloured blue'),unit('size','big','big')],{minimumUnits:1,mentions:{ids:'the front hair, back hair and eyebrows'}});
profile('avatar','avatar.ids.show','temporarily display the avatar part IDs',{mode:'temporary'},[unit('duration',4000,'for 4 seconds')]);
export const omissionPolicy={
 format:'psys2.ui-omission-policy/1',
 combination:'Every subset of the curated material optional-detail units, including full and minimal forms. Change requests retain at least one effect; identities and required intent cores remain.',
 units:profiles.map(p=>({operation:p.operation,required:Object.keys(p.required),units:p.units.map(u=>Object.keys(u.args)),minimumUnits:p.minimumUnits??0})),
 excludedOptional:{
  reason:'No false omission coverage for structural, locator or non-UI arguments.',
  fields:['Drawing legacy name alias (Label/ObjectID examples use current UI meanings)','Empty secondary selection arrays (nodes/edges)','Document locator at=0, mark attrs metadata and compose-only genre/topic','Redundant heading kind=heading in section-only operations','Avatar constant face id','Document genre/topic not exposed in the current editor','Calendar participants/room/calendar advanced resource fields']
 },
 relationalUnits:'Diagram from/to and document kind/level are coupled to keep a coherent endpoint pair or heading type/level. Required numeric bounds, event time/duration, mark ranges and numeric chart data remain explicit; their vague interpretation belongs to separate completion cases.'
};
export function omissionCases(){
 const result=[];
 for(const [profileIndex,p]of profiles.entries()){
  for(let mask=0;mask<2**p.units.length;mask++){
   const retained=p.units.filter((_,i)=>mask&(2**i));if(retained.length<(p.minimumUnits??0))continue;
   const omitted=p.units.filter((_,i)=>!(mask&(2**i))).flatMap(u=>Object.keys(u.args));
   // Keep the full counterpart as well as every meaningful omission subset.
   const args={...p.required,...Object.assign({},...retained.map(u=>u.args))};
   const phrases=retained.map(u=>u.phrase).filter(Boolean),core=typeof p.core==='function'?p.core(args):p.core;
   const text=core+(phrases.length?', '+phrases.join(', '):'');
   result.push({area:p.area,operation:p.operation,args,texts:[text],family:'optional-profile-'+String(profileIndex+1).padStart(2,'0')+':'+p.operation,style:omitted.length?'optional-detail-omission':'optional-detail-complete',omitted,mentions:p.mentions});
  }
 }
 return result;
}
