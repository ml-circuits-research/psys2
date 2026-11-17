import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {proposeDeclarationAlignments} from './propose-declaration-alignments.mjs';

export async function exportDeclarationAlignments({knowledge,library,inventoryPath,cataloguePath,output}) {
  const {World,parse,str,format}=await import(pathToFileURL(resolve(library)));
  const catalogue=JSON.parse(await readFile(cataloguePath,'utf8'));
  const inventory=JSON.parse(await readFile(inventoryPath,'utf8'));
  const areas=new Set(catalogue.families.map(f=>f.area));
  const git=(...args)=>execFileSync('git',['-C',knowledge,...args],{encoding:'utf8',maxBuffer:8*1024*1024});
  const pin=catalogue.knowledgePin;
  const paths=git('ls-tree','-r','--name-only',pin,'docs/worlds/').trim().split('\n').filter(p=>p.endsWith('.sop'));
  const records=new Map(); let sourceBytes=0;
  for(const path of paths) {
    const text=git('show',pin+':'+path); sourceBytes+=Buffer.byteLength(text);
    if(sourceBytes>128*1024*1024) throw Error('declaration-source-byte-budget');
    for(const wire of parse(text)) {
      // Rules/patterns are not declarations or a population of provider values.
      if(wire.pattern) continue;
      const identity=(['core.type','core.slot'].includes(wire.type)?'schema:':'fact:')+wire.id;
      const prior=records.get(identity);
      if(prior&&format(prior)!==format(wire)) throw Error('conflicting-source-identity:'+wire.id);
      records.set(identity,wire);
      if(records.size>1000000) throw Error('declaration-source-record-budget');
    }
  }
  const schema=[...records.values()].filter(w=>['core.type','core.slot'].includes(w.type));
  const world=World.fromJSON({format:'sopworld',version:1,log:[{op:'tell',wires:schema,facts:[]}]});
  // Select the value providers required by the declared slot contracts, not by evaluation cases.
  const slotIds=new Set(schema.filter(w=>w.type==='core.slot').map(w=>w.id));
  const providers=new Set(schema.flatMap(w=>(w.attrs.type??[]).map(str)));
  const selected=[...records.values()].filter(w=>['core.type','core.slot'].includes(w.type)||providers.has(w.type)||
    w.type==='core.word'&&((w.attrs.means??[]).some(v=>slotIds.has(str(v)))||(w.attrs.of??[]).some(v=>slotIds.has(str(v)))));
  const result=proposeDeclarationAlignments({world,str,records:selected,inventory:Object.fromEntries(Object.entries(inventory).filter(([area])=>areas.has(area))),families:catalogue.families});
  const counts={properties:result.rows.length,unique:result.rows.filter(r=>r.status==='declared-proposal').length,ambiguous:result.rows.filter(r=>r.candidates.length>1).length};
  counts.missing=counts.properties-counts.unique-counts.ambiguous;
  const report={...result,knowledgePin:pin,counts,sourceFiles:paths.length,sourceBytes};
  if(output) {
    const text=output.endsWith('.md')?[
      '# Mechanical declaration alignment', '',
      `Knowledge commit: ${pin}. Examined ${paths.length} published SOP files.`,
      `${counts.properties} properties: ${counts.unique} unique declaration proposals, ${counts.ambiguous} ambiguous, ${counts.missing} without a unique owning declaration/alias.`,
      'These are identity proposals, not validated value conversions, runtime bindings, calibration or execution results. The deployed bindings are unchanged.', '',
      '| Area | Inventory property | Declared candidates / missing contract |', '|---|---|---|',
      ...report.rows.map(r=>`| ${r.area} | ${r.key} | ${r.candidates.length?r.candidates.map(c=>c.canonical).join(', '):r.reason} |`), '',
      'Regenerate: `node training/sop-bert/export-declaration-alignments.mjs ../sop-knowledge-worlds src/vendor/sopworld/sopworld.mjs training/results/declaration-alignments.md`',
      ''
    ].join('\n'):JSON.stringify(report,null,2)+'\n';
    await writeFile(output,text);
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [knowledge,library,output]=process.argv.slice(2);
  if(!knowledge||!library||!output) throw Error('usage: KNOWLEDGE LIBRARY OUTPUT');
  const report=await exportDeclarationAlignments({knowledge,library,output,inventoryPath:'training/sop-bert/heads/inventory.json',cataloguePath:'training/sop-bert/bindings/semantic-alignments-v1.json'});
  console.log(JSON.stringify({counts:report.counts,sourceFiles:report.sourceFiles,steps:report.steps,tasks:report.tasks.length}));
}
