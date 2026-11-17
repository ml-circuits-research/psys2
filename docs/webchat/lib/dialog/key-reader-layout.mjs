import {createBudget} from './budget.mjs?v=00bce6e369';
// Artifact-declared layout; counts and domain identities never come from host constants.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const closed=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const ids=(v,max)=>Array.isArray(v)&&v.length>0&&v.length<=max&&v.every(k=>typeof k==='string'&&k&&!['__proto__','constructor','prototype'].includes(k))&&new Set(v).size===v.length;
function valueIdentity(v,budget=createBudget({perTurn:100000,perSite:100000}),depth=0){
 budget.tick('reader-layout.value');if(depth>48)throw Error('class-value-depth');
 return Array.isArray(v)?'['+v.map(x=>valueIdentity(x,budget,depth+1)).join(',')+']':object(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+valueIdentity(v[k],budget,depth+1)).join(',')+'}':JSON.stringify(v);
}
export function validateKeyReaderLayout(config){
 const candidate=config?.format==='sop.key-reader/2-target-type-candidate';
 if(!object(config)||config.executionEligible===true||!['sop.key-reader/1','sop.key-reader/2-target-type-candidate'].includes(config.format)||candidate&&(config.rawCodecFormat!=='sop.key-reader-raw-codec/2-target-type-candidate'||config.candidate!==true||config.executionEligible!==false))throw Error('incompatible-candidate-layout');
 const {keys,registry,banks,bioKeys:bio,metadataKeys:metadata}=config;
 if(!ids(keys,512)||!object(registry)||Object.keys(registry).length!==keys.length||keys.some(k=>!Object.hasOwn(registry,k))||!object(banks)||Object.keys(banks).some(k=>!keys.includes(k))||!Array.isArray(bio)||bio.length>keys.length||new Set(bio).size!==bio.length||bio.some(k=>!keys.includes(k))||!Array.isArray(metadata)||new Set(metadata).size!==metadata.length||metadata.some(k=>!keys.includes(k))||!Number.isSafeInteger(config.maxLength)||config.maxLength<2||config.maxLength>4096)throw Error('incompatible-reader-layout');
 let width=0;const derived=Object.create(null);
 for(const key of keys){
  const row=registry[key];if(!object(row)||!['global','domain','metadata','derived'].includes(row.role))throw Error('invalid-registry-role');
  if(bio.includes(key)&&(!['global','domain'].includes(row.role)||row.bio===false)||metadata.includes(key)&&(row.role!=='metadata'||!Object.hasOwn(banks,key)))throw Error('invalid-head-role');
  if(row.role==='domain'){
   if(typeof row.area!=='string'||!row.area||typeof row.type!=='string'||!row.type||typeof row.key!=='string'||!row.key)throw Error('invalid-domain-registry');
   if(['__proto__','constructor','prototype'].some(k=>[row.area,row.type,row.key].includes(k)))throw Error('invalid-domain-registry');
   const list=derived[row.area]??=[];if(!list.includes(row.type))list.push(row.type);
  }
  if(Object.hasOwn(banks,key)){
   const bank=banks[key];if(!Array.isArray(bank)||bank.length<2||bank.length>8192||!closed(bank[0],['state'])||bank[0].state!=='absent'||!closed(bank[1],['state'])||bank[1].state!=='unknown'||bank.slice(2).some(e=>!closed(e,['state','value'])||e.state!=='value'))throw Error('invalid-class-bank');
   const values=bank.slice(2).map(e=>e.value),identities=values.map(v=>valueIdentity(v));
   if(valueIdentity(values)!==valueIdentity(row.values??[])||new Set(identities).size!==identities.length)throw Error('bank-registry-mismatch');
   width+=bank.length;if(width>65536)throw Error('class-output-layout-budget');
  }
 }
 const type=registry['request.target.type'];if(!type||type.role!=='global'||type.bio===true||bio.includes('request.target.type')||!Object.hasOwn(banks,'request.target.type'))throw Error('missing-type-class-profile');
 const families=config.targetFamilies??type.familiesByArea??derived,declared=type.familiesByArea??families;
 if(!object(families)||!object(declared)||!ids(Object.keys(families),512)||Object.keys(declared).length!==Object.keys(families).length)throw Error('invalid-type-family-profile');
 const values=[];
 for(const [area,list]of Object.entries(families)){
  const other=declared[area];if(!ids(list,512)||!ids(other,512)||list.length!==other.length||list.some(v=>!other.includes(v))||(derived[area]??[]).some(v=>!list.includes(v)))throw Error('invalid-type-family-profile');values.push(...list);
 }
 if(Object.keys(derived).some(area=>!Object.hasOwn(families,area)))throw Error('invalid-type-family-profile');
 const unique=new Set(values),bank=banks['request.target.type'];if(bank.length!==unique.size+2||bank.slice(2).some(e=>typeof e.value!=='string'||!unique.has(e.value))||new Set(bank.slice(2).map(e=>e.value)).size!==unique.size)throw Error('invalid-type-class-bank');
 return {keys,bioKeys:bio,metadataKeys:metadata,classWidth:width,targetFamilies:families};
}
