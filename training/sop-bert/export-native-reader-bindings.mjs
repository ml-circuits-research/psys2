// C1 interface authoring: explicit raw families join actual native tool contracts.
// No corpus rows, source-language descriptions, lexical values or observed requests.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createFacts}from '../../src/knowledge/facts.mjs';
import {createKnowledgeSource}from '../../src/loaders/knowledge-source.mjs';
import {NATIVE_AREAS} from '../../src/dialog/app-reader-context.mjs';
export const NATIVE_READER_FAMILIES=[
 ['draw','drawing','drawn','art.draw.object',true],['draw','drawing','group','art.draw.object'],['draw','drawing','part','art.draw.part'],['draw','drawing','page','art.draw.page'],
 ['diagram','diagram','node','diagram.sketch.node',true],['diagram','diagram','link','diagram.sketch.link'],['diagram','diagram','diagram','diagram.sketch'],['diagram','diagram','sketch','diagram.sketch'],['diagram','diagram','group','diagram.sketch.group'],['diagram','diagram','page','diagram.sketch.page'],['diagram','diagram','chart','data.charts.chart'],['diagram','diagram','series','data.charts.series'],['diagram','diagram','point','data.charts.point'],
 ['editor','document','document','docs.editor.document',true],['editor','document','text','docs.editor.document'],['editor','document','block','docs.editor.block'],['editor','document','section','docs.editor.section'],['editor','document','inline','docs.editor.text'],
 ['calendar','calendar','meeting','time.calendar.meeting',true],['calendar','calendar','calendar','time.calendar.calendar'],['calendar','calendar','person','time.calendar.person'],['calendar','calendar','room','time.calendar.room'],
 ['avatar','avatar','face','ui.avatar.face',true],['avatar','avatar','part','ui.avatar.part'],
 // Published legacy reader used the drawing area for the same native Avatar.
 ['avatar','drawing','face','ui.avatar.face']
].map(([view,area,type,sourceType,primary=false])=>({view,area,type,sourceType,primary}));
const sha=value=>createHash('sha256').update(value).digest('hex');
const q=JSON.stringify;
const token=value=>/^[a-zA-Z0-9_.-]+$/.test(value)?value:q(value);
export function buildNativeReaderBindings({inventory,hosts,families=NATIVE_READER_FAMILIES}){
 const result={format:'sop.structural-bindings/1',families:[],properties:[],kinds:[],units:[],unresolved:[],nativeInterfaces:[],readerAreaByView:{}};
 const scopes=new Map();
 for(const family of families){
  const table=hosts[family.view],operations=table?.operations?.filter(op=>op.on===family.sourceType)??[];
  if(!operations.length){result.unresolved.push({family:'families',area:family.area,type:family.type,reason:'native-source-type-unavailable'});continue;}
  const primary=family.primary;if(primary)result.readerAreaByView[family.view]=family.area;
  const namespace='native.reader.'+family.view,canonical=namespace+'.'+family.type;
  let scope=scopes.get(namespace);if(!scope){scope={namespace,lines:[`@world.${namespace} core.world namespace=${namespace} version=1.0.0 imports=world.core status=fixture`,`@legend.${namespace} core.legend namespace=${namespace} version=1.0.0 imports=core`],records:[]};scopes.set(namespace,scope);}
  // A legacy area alias refers to the same exact native-interface declaration.
  if(!scope.records.some(record=>record.canonical===canonical))scope.lines.push(`@${canonical} core.type of=${canonical} doc=${q('Native interface family for '+family.sourceType+'. Not a global knowledge identity.')}`);
  const preferred=operations.find(op=>op.act==='make')??operations[0];
  const record={area:family.area,type:family.type,canonical,sourceWire:canonical,sourceWorld:namespace,moduleVersion:'1.0.0',actualSourceType:family.sourceType,alignment:{kind:'explicit-raw-family-identity',authority:'C1 native interface family declaration'},nativeFamilyBinding:{operation:preferred.id,sourceType:family.sourceType,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256},familyIdentity:true};
  result.families.push(record);scope.records.push(record);
  const descriptors=inventory[family.area]?.[family.type]?.keys??{};
  for(const [key,raw]of Object.entries(descriptors)){
   const choices=operations.filter(op=>Object.hasOwn(op.params,key));if(!choices.length)continue;
   const supported=choices.filter(op=>['string','number','integer','boolean'].includes(op.params[key].type));
   if(!supported.length){result.unresolved.push({family:'properties',area:family.area,key:family.type+'.'+key,reason:'native-structured-argument-needs-declared-codec'});continue;}
   const types=new Set(supported.map(op=>op.params[key].type));if(types.size!==1){result.unresolved.push({family:'properties',area:family.area,key:family.type+'.'+key,reason:'native-parameter-type-ambiguous'});continue;}
   const operation=supported.find(op=>op.act==='change')??supported[0],parameter=operation.params[key],property=canonical+'.'+key;
   if(!scope.records.some(record=>record.canonical===property))scope.lines.push(`@${property} core.slot of=${canonical} key=${token(key)} kind=${parameter.type==='integer'?'number':parameter.type}${(parameter.enum??[]).filter(value=>value!==null).map(value=>' enum='+q(value)).join('')} doc=${q('Literal native parameter '+key+'; validated by actual native tool declaration.')}`);
   const binding={area:family.area,key:family.type+'.'+key,canonical:property,valueKind:'string',sourceWire:property,sourceWorld:namespace,moduleVersion:'1.0.0',rawDescriptor:{area:family.area,type:family.type,key,...raw},hostBinding:{id:operation.id,operation:operation.id,sourceType:family.sourceType,parameter:key,key,sourcePath:table.sourcePath,sourceSha256:table.sourceSha256,parameterContract:structuredClone(parameter)},alignment:{kind:'explicit-C1-native-interface-parameter',authority:'Exact raw parameter name joined within an explicitly declared family; source descriptions are never parsed.'}};
   result.properties.push(binding);scope.records.push(binding);
  }
 }
 for(const scope of scopes.values()){
  const wires=scope.lines.join('\n')+'\n',sourceSnapshotSHA=sha(wires);for(const record of scope.records)record.sourceSnapshotSHA=sourceSnapshotSHA;
  result.nativeInterfaces.push({id:scope.namespace,sourceWorld:scope.namespace,moduleVersion:'1.0.0',sourceSnapshotSHA,wires});
 }
 return result;
}
export async function exportNativeReaderBindings({inventory,knowledge=createFacts({source:createKnowledgeSource(fileURLToPath(new URL('../../../sop-knowledge-worlds/docs/worlds/',import.meta.url)))})}){
 const hosts={};for(const [view,area]of Object.entries(NATIVE_AREAS)){const sourcePath='worlds/'+area.world+'/native-interface.sop';const bytes=await readFile(new URL('../../'+sourcePath,import.meta.url));if(area.loadKnowledge)await knowledge[area.loadKnowledge]();const host=await area.create({instanceId:'native-reader-interface.'+view,knowledge});hosts[view]={operations:host.bindings(),sourcePath,sourceSha256:sha(bytes)};}
 return buildNativeReaderBindings({inventory,hosts});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [inventoryPath,out]=process.argv.slice(2);if(!inventoryPath||!out)throw Error('Usage: export-native-reader-bindings.mjs INVENTORY.json OUT.json');const result=await exportNativeReaderBindings({inventory:JSON.parse(await readFile(inventoryPath,'utf8'))});await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({families:result.families.length,properties:result.properties.length,interfaces:result.nativeInterfaces.length,readerAreaByView:result.readerAreaByView}));}
