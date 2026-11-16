// Versioned evaluation baselines, never inferred world facts or model input labels.
import {createHash} from 'node:crypto';
import {copyHostData} from '../../worlds/native-tool-host.mjs';
export const FUNCTIONAL_FIXTURE_POLICY={id:'functional-native-baseline',version:1,calendar:{start:0,duration:1,participants:[],room:null},document:{blocks:[]},representations:{diagram:{node:'rectangle'}}};
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
 return {context:prepared,original,policy:{...FUNCTIONAL_FIXTURE_POLICY,sha256:FUNCTIONAL_FIXTURE_POLICY_HASH},defaulted,limitations,semanticallyLimited:defaulted.length>0||limitations.length>0};
}
