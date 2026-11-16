// Versioned evaluation baselines, never inferred world facts or model input labels.
import {createHash} from 'node:crypto';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export const FUNCTIONAL_FIXTURE_POLICY={id:'functional-native-baseline',version:2,calendar:{start:0,duration:1,participants:[],room:null},document:{blocks:[],childText:'',parentTitle:'Evaluation fixture document'},representations:{diagram:{node:'rectangle'}}};
export const FUNCTIONAL_FIXTURE_POLICY_HASH=createHash('sha256').update(JSON.stringify(FUNCTIONAL_FIXTURE_POLICY)).digest('hex');
export function prepareFunctionalFixture(area,context={}){
 const original=copyHostData(context),prepared=copyHostData(context),defaulted=[],limitations=[];
 if(prepared.previous){limitations.push({reason:'previous-context-not-replayed',value:prepared.previous});prepared.previous=null;}
 for(const [index,item]of (prepared.existing??[]).entries()){
  if(area==='calendar'&&['person','room','meeting'].includes(item.kind)){
   item.nativeId='fixture-'+createHash('sha256').update(JSON.stringify([area,item.kind,item.name])).digest('hex').slice(0,24);
   if(item.kind==='meeting')for(const [key,value]of Object.entries(FUNCTIONAL_FIXTURE_POLICY.calendar))if(!Object.hasOwn(item,key)){item[key]=copyHostData(value);defaulted.push({index,field:key,value:copyHostData(value)});}
  }
  if(area==='document'&&item.kind==='document'&&!Object.hasOwn(item,'blocks')){item.blocks=[];defaulted.push({index,field:'blocks',value:[]});}
  const representation=FUNCTIONAL_FIXTURE_POLICY.representations[area]?.[item.kind];
  if(representation){const sourceKind=item.kind;item.kind=representation;defaulted.push({index,field:'nativeRepresentation',sourceKind,value:representation});}
 }
 if(area==='document'){
  const children=(prepared.existing??[]).filter(item=>['paragraph','heading','quote','section'].includes(item.kind));
  if(children.length){
   let parents=prepared.existing.filter(item=>item.kind==='document');
   if(!parents.length){
    let name=FUNCTIONAL_FIXTURE_POLICY.document.parentTitle;for(let i=0;prepared.existing.some(item=>item.name===name);i++)name=FUNCTIONAL_FIXTURE_POLICY.document.parentTitle+' '+String(i+1);
    const parent={kind:'document',name,blocks:[]};prepared.existing.unshift(parent);parents=[parent];defaulted.push({field:'parentDocument',value:copyHostData(parent)});
   }else if(parents.length===1)prepared.existing=[parents[0],...prepared.existing.filter(item=>item!==parents[0])];
   for(const child of children){
    const index=prepared.existing.indexOf(child);
    if(!Object.hasOwn(child,'parent')&&parents.length===1){child.parent=parents[0].name;defaulted.push({index,field:'parent',value:child.parent});}
    if(!Object.hasOwn(child,'text')){child.text=FUNCTIONAL_FIXTURE_POLICY.document.childText;defaulted.push({index,field:'text',value:child.text});}
   }
  }
 }
 return {context:prepared,original,policy:{...FUNCTIONAL_FIXTURE_POLICY,sha256:FUNCTIONAL_FIXTURE_POLICY_HASH},defaulted,limitations,semanticallyLimited:defaulted.length>0||limitations.length>0};
}
