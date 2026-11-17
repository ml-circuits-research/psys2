// UI coordinate precision is applied before dispatch, so intent text and effects agree.
const fields=new Set(['x','y','x0','y0','x1','y1','dx','dy','width','height','size','rotation','angle','scale','radius','innerRadius','outerRadius','startAngle','endAngle']);
const positive=new Set(['width','height','size','scale','radius','innerRadius','outerRadius']);
const containers=new Set(['geometry','bounds','position','offset','dimensions','placement','rect','point','points','translation','transform','matrix','geometryMatrix']);
const rounded=(value,key)=>{if(!Number.isFinite(value))return value;const result=Number(value.toFixed(2));return positive.has(key)&&value>0&&result===0?.01:result===0?0:result;};
/** Spatial arguments only. Series data, content, timestamps and arbitrary numeric payloads stay exact. */
export function quantizeGeometryArguments(args){
 const root={},pending=[{parent:root,key:'value',value:args,mode:'scan',field:'',depth:0}];
 // At most 100000 values and 32 levels, including opaque payload copies.
 for(let visits=0;visits<100000;visits++){
  if(!pending.length)break;const item=pending.pop();if(item.depth>32)throw new TypeError('UI geometry argument budget exceeded');
  const {parent,key,value,mode,field,depth}=item;let result=value;
  if(typeof value==='number'&&mode==='geometry')result=rounded(value,field);
  else if(value&&typeof value==='object'){
   const array=Array.isArray(value);result=array?[]:{};
   const entries=Object.entries(value);
   for(let index=entries.length-1;index>=0;index--){const [childKey,child]=entries[index];
    const childMode=mode==='copy'?'copy':array?(mode==='geometry'?'geometry':'copy'):(fields.has(childKey)||containers.has(childKey)?'geometry':'copy');
    pending.push({parent:result,key:childKey,value:child,mode:childMode,field:array?field:childKey,depth:depth+1});
   }
  }
  Object.defineProperty(parent,key,{value:result,writable:true,enumerable:true,configurable:true});
 }
 if(pending.length)throw new TypeError('UI geometry argument budget exceeded');
 return root.value;
}
