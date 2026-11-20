// C1 source authoring only. No corpus, model outputs or native execution.
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const areas=['drawing','diagram','document','calendar','avatar'];
export function validateSemanticCatalogue(catalogue,{inventoryBytes,promptBytes}){
 const inventory=JSON.parse(inventoryBytes),c=catalogue;
 if(c?.format!=='sop.semantic-alignment-catalogue/1'||! /^[a-f0-9]{40}$/.test(c.knowledgePin)||c.inventory?.sha256!==sha(inventoryBytes)||c.prompt?.sha256!==sha(promptBytes))throw Error('catalogue-source-identity');
 const expectedFamilies=[],expectedProperties=[];
 for(const area of areas)for(const[type,row]of Object.entries(inventory[area]??{})){expectedFamilies.push(area+'.'+type);for(const key of Object.keys(row.keys))expectedProperties.push(area+'.'+type+'.'+key);}
 // The pinned inventory fixes the profile; the catalogue states it and covers every family and property of it.
 if(c.coverage?.families!==expectedFamilies.length||c.coverage?.properties!==expectedProperties.length||expectedFamilies.length>256||expectedProperties.length>4096)throw Error('catalogue-inventory-profile');
 for(const [records,expected,kind]of [[c.families,expectedFamilies,'family'],[c.properties,expectedProperties,'property']]){
  if(!Array.isArray(records)||records.length!==expected.length)throw Error('catalogue-coverage');const seen=new Set();
  for(const row of records){const id=row.area+'.'+(kind==='family'?row.type:row.key);if(!expected.includes(id)||seen.has(id)||!['aligned','unresolved'].includes(row.status))throw Error('catalogue-descriptor');seen.add(id);
   const raw=inventory[row.area]?.[row.type];if(!raw||kind==='family'&&row.rawMeaning!==raw.doc||kind==='property'&&(row.key.slice(0,row.type.length+1)!==row.type+'.'||JSON.stringify(row.descriptor)!==JSON.stringify(raw.keys[row.key.slice(row.type.length+1)])))throw Error('catalogue-raw-descriptor-drift');
   if(row.status==='unresolved'){if(typeof row.reason!=='string'||!row.reason.trim())throw Error('catalogue-unresolved-reason');continue;}
   const e=row.evidence;if(!e||e.knowledgePin!==c.knowledgePin||!/^docs\/worlds\/[a-z0-9._/-]+\.sop$/.test(e.path)||e.path.split('/').includes('..')||! /^[a-f0-9]{64}$/.test(e.sha256)||!e.sourceWorld||!e.moduleVersion||!e.declaration?.startsWith('@'+e.sourceWire+' '))throw Error('catalogue-evidence');
   if(kind==='family'){if(row.sourceWire!==row.canonical||e.sourceWire!==row.canonical||!row.authority?.trim())throw Error('catalogue-family');}
   else if(row.alignment?.area!==row.area||row.alignment?.key!==row.key||row.alignment?.sourceWire!==e.sourceWire||!['string','literal'].includes(row.alignment?.valueKind)||JSON.stringify(row.descriptor)!==JSON.stringify(inventory[row.area]?.[row.type]?.keys[row.key.slice(row.type.length+1)]))throw Error('catalogue-property');
  }
 }
 return {familyAlignments:c.families.filter(r=>r.status==='aligned').map(({area,type,canonical,sourceWire,authority,evidence})=>({area,type,canonical,sourceWire,authority,evidence})),propertyAlignments:c.properties.filter(r=>r.status==='aligned').map(r=>({...r.alignment,evidence:r.evidence,valueContract:r.valueContract})),unresolved:[...c.families.filter(r=>r.status==='unresolved').map(r=>({family:'families',...r})),...c.properties.filter(r=>r.status==='unresolved').map(r=>({family:'properties',...r}))]};
}
export async function planCatalogueEnrichment(catalogue,{readSource,world,parse,format,str}){
 if(!Array.isArray(catalogue.families)||catalogue.families.length>256||!Array.isArray(catalogue.properties)||catalogue.properties.length>4096||!Array.isArray(catalogue.sources)||catalogue.sources.length>64)throw Error('catalogue-enrichment-profile');
 let totalBytes=0;const charge=bytes=>{totalBytes+=bytes.length;if(totalBytes>2*1024*1024)throw Error('catalogue-enrichment-bytes');};
 const sources=new Map(),planned=new Map(),evidence=[...catalogue.families,...catalogue.properties].filter(r=>r.status==='aligned').map(r=>r.evidence);
 let steps=0;const tick=()=>{if(++steps>50000)throw Error('catalogue-enrichment-budget');};
 for(const e of evidence){tick();if(sources.has(e.path))continue;const bytes=await readSource(catalogue.knowledgePin,e.path);charge(bytes);if(bytes.length>2*1024*1024||sha(bytes)!==e.sha256)throw Error('catalogue-source-hash');sources.set(e.path,{bytes,records:parse(bytes.toString()),sha256:e.sha256});}
 for(const e of evidence){tick();const source=sources.get(e.path),wire=source.records.find(w=>w.id===e.sourceWire);if(source.sha256!==e.sha256||!wire||!source.bytes.toString().split('\n').includes(e.declaration))throw Error('catalogue-source-wire');
  const schemaPath='docs/worlds/'+e.sourceWorld+'/schema.sop';if(!sources.has(schemaPath)){const declared=catalogue.sources.find(s=>s.path===schemaPath);if(!declared)throw Error('catalogue-module-source');const bytes=await readSource(catalogue.knowledgePin,schemaPath);charge(bytes);if(bytes.length>2*1024*1024||sha(bytes)!==declared.sha256)throw Error('catalogue-module-hash');sources.set(schemaPath,{bytes,records:parse(bytes.toString()),sha256:declared.sha256});}
  const module=sources.get(schemaPath).records.find(w=>w.type==='core.module'&&str(w.attrs.name?.[0])===e.sourceWorld);if(!module||str(module.attrs.version?.[0])!==e.moduleVersion)throw Error('catalogue-module-version');
 }
 const needed=new Set(evidence.map(e=>e.sourceWire));
 for(const {records}of sources.values())for(const w of records){tick();if(!needed.has(w.id)&&!['core.module','core.type','core.slot','core.word'].includes(w.type))continue;const old=world.get(w.id)||world.matrix?.get(w.id),prior=planned.get(w.id);if(old&&format(old)!==format(w)||prior&&format(prior)!==format(w))throw Error('catalogue-existing-source-conflict:'+w.id);if(!old)planned.set(w.id,w);}
 return {records:[...planned.values()],sources:[...sources].map(([path,s])=>({knowledgePin:catalogue.knowledgePin,path,sha256:s.sha256})),boundary:'Explicit pinned declaration enrichment; conflicting existing identities refuse, never overwrite.'};
}
