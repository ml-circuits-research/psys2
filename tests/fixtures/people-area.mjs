// A SOP area (Drawing or Avatar) over the pinned catalog for the people tests: the site's copy of the catalog at the
// pin (docs/webchat/catalog/<commit>, made by the webchat build) or the local checkout at the pin (.cache/catalog), with
// an optional change of some catalog files (a garment added to the people's knowledge).
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createSopArea,initialSopAreaState,renderSopArea} from '../../worlds/sop-area.mjs';
import {toolInvocationContext} from '../../worlds/native-tool-host.mjs';
import {CATALOG_PIN} from '../../src/knowledge/catalog-pin.mjs';

const root=new URL('../../',import.meta.url);
export const catalogDir=[new URL('docs/webchat/catalog/'+CATALOG_PIN.commit+'/',root),new URL('.cache/catalog/'+CATALOG_PIN.commit+'/docs/worlds/',root)]
 .find(url=>existsSync(new URL('k.faces/shards/figure-slots.sop',url)))??null;

export async function peopleArea(world,{change={}}={}){
 const interfaceSource=(await import('../../worlds/'+world+'/native-interface-source.mjs')).default;
 const readCatalog=async path=>{const text=await readFile(new URL(path,catalogDir),'utf8');return change[path]?change[path](text):text;};
 const options={world,interfaceSource,loader:{readFile:(owner,file)=>readFile(new URL('worlds/'+owner+'/'+file,root),'utf8').catch(()=>null)},readCatalog};
 const state=world==='art.draw'?{sop:'',runtime:{view:{}}}:await initialSopAreaState(options);
 let host=await createSopArea({...options,state,instanceId:world+'.people.'+Math.random().toString(16).slice(2)}),n=0;
 return {
  state,
  run:async(operation,args={})=>{
   host=await createSopArea({...options,state,instanceId:world+'.people.'+Math.random().toString(16).slice(2),args});
   const sop='@c '+operation+' '+Object.entries(args).map(([k,v])=>k+'='+JSON.stringify(v)).join(' ');
   return host.invoke(sop,toolInvocationContext('people-'+(n++),host.observe().version));
  },
  objects:()=>host.observe().objects,
  parts:id=>host.observe().objects.filter(o=>o.in===id),
  input:(object,key)=>{const v=object?.inputs.find(i=>i.key===key)?.values[0];return v===undefined?undefined:JSON.parse(v);},
  facts:type=>state.sop.split('\n').filter(line=>line.split(' ')[1]===type),
  render:()=>renderSopArea(options,state),
 };
}
