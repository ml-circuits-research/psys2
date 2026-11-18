// SPDX-License-Identifier: AGPL-3.0-only
// Serialize declared domain records as closed SOP types. Only scalar properties
// and explicitly typed child records can become facts.
import { World, parse, quote, serialize } from '../src/vendor/sopworld/sopworld.mjs';
import { budget } from '../src/dialog/budget.mjs';
import { copyHostData } from './native-tool-host.mjs';

const scalarKinds = new Set(['string','number','integer','boolean','atom']);
const token = value => typeof value === 'string' ? quote(value) : Object.is(value,-0) ? '-0' : String(value);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const atom = value => typeof value === 'string' && /^[A-Za-z_][\w.-]*$/.test(value);
function validScalar(kind,value) {
 if(kind==='atom')return atom(value);
 if(kind==='integer')return Number.isSafeInteger(value);
 if(kind==='number')return Number.isFinite(value);
 return typeof value===kind;
}

/** Field definitions accept a scalar kind or {kind, type, many, nullable, required}.
 * A type names another closed record. Collection order and empty presence are retained. */
export function typedStateCodec(namespace, root, inventory, {identities={}}={}) {
 const typeOf = type => namespace+'.'+type;
 const fields = Object.fromEntries(Object.entries(inventory).map(([kind,field])=>[kind,Object.entries(field).map(([name,definition])=>
  [name,typeof definition==='string'?{kind:definition}:definition])]));
 const rootId = typeOf(root);
 const validate=(condition,why)=>{if(!condition)throw new TypeError(namespace+':'+why);};
 const entityId=(type,value)=>{
  const key=identities[type],identity=value?.[key];
  validate(typeof identity==='string'&&identity.length>0&&identity.length<=512,'identity-'+type);
  return typeOf(type)+'.u'+Array.from(identity,char=>char.codePointAt(0).toString(16).padStart(6,'0')).join('');
 };
 const slots = Object.entries(fields).flatMap(([type,entries])=>entries.flatMap(([key,spec])=>{
  validate(spec.type ? Object.hasOwn(fields,spec.type) : scalarKinds.has(spec.kind),'invalid-schema');
  const accepts=spec.type?'type='+typeOf(spec.type):'kind='+spec.kind;
  const flags=(spec.many?' many=true':'')+(spec.required&&!spec.many?' required=true':'')+(spec.nullable?' kind=atom':'');
  return ['@'+typeOf(type)+'.'+key+' core.slot of='+typeOf(type)+' key='+key+' '+accepts+flags,
   ...(spec.many?['@'+typeOf(type)+'.has.'+key+' core.slot of='+typeOf(type)+' key=has.'+key+' kind=boolean']:[])];
 }));
 const schema=['@'+namespace+' core.module name='+namespace,
  ...Object.keys(fields).map(type=>'@'+typeOf(type)+' core.type of='+typeOf(type)+' closed=true'),
  ...slots].join('\n');
 const base=new World({library:{[namespace]:schema}});
 base.load('@use core.use world='+namespace);

 function encode(data) {
  const nodes=[];
  const visit=(type,input,id,depth=0)=>{
   budget.tick('typed-state.encode');
   validate(depth<48&&plain(input),type+'-record');
   const entries=fields[type],keys=new Set(entries.map(([key])=>key));
   validate(Object.keys(input).every(key=>keys.has(key)),type+'-unknown-key:'+Object.keys(input).find(key=>!keys.has(key)));
   const attrs={};
   nodes.push({id,type:typeOf(type),attrs});
   for(const [key,spec] of entries){
    if(!Object.hasOwn(input,key)){validate(!spec.required,type+'-missing-'+key);continue;}
    const item=(value,index)=>{
     if(value===null&&spec.nullable)return 'null';
     if(spec.type){
      const child=Object.hasOwn(identities,spec.type)?entityId(spec.type,value):id+'.'+key+(spec.many?'.i'+index:'');
      visit(spec.type,value,child,depth+1);return '$'+child;
     }
     validate(validScalar(spec.kind,value),type+'-invalid-'+key);return spec.kind==='atom'?value:token(value);
    };
    if(spec.many){
     validate(Array.isArray(input[key]),type+'-collection-'+key);
     attrs['has.'+key]=['true'];
     if(input[key].length){
      const values=input[key].map(item);
      validate(new Set(values).size===values.length,'duplicate-collection-'+key);
      attrs[key]=values;
     }
    }else attrs[key]=[item(input[key],0)];
   }
  };
  visit(root,copyHostData(data),rootId);
  const sop=serialize(nodes);
  decode(sop);
  return sop;
 }

 function decode(sop) {
  validate(typeof sop==='string'&&sop.length<=4_000_000,'carrier');
  const nodes=parse(sop),index=new Map(nodes.map(node=>[node.id,node])),used=new Set();
  validate(index.size===nodes.length&&nodes.every(node=>!node.pattern&&!node.legacy),'duplicate-or-pattern');
  const world=base.fork(),admitted=world.tell(sop,{factsOnly:true});
  validate(admitted.ok,'facts:'+JSON.stringify(admitted.violations));
  const visit=(type,id,depth)=>{
   budget.tick('typed-state.decode');
   const node=index.get(id);
   validate(depth<48&&node?.type===typeOf(type)&&!used.has(id),'ownership-or-reference-type');
   used.add(id);
   const data={};
   for(const [key,spec] of fields[type]){
    const values=node.attrs[key];
    const item=value=>{
     if(value==='null'&&spec.nullable)return null;
     if(spec.type){validate(value.startsWith('$'),'reference-'+key);return visit(spec.type,value.slice(1),depth+1);}
     let scalar;
     try{scalar=spec.kind==='atom'?value:JSON.parse(value);}catch{throw new TypeError(namespace+':literal-'+key);}
     validate(validScalar(spec.kind,scalar),type+'-invalid-'+key);
     return scalar;
    };
    if(spec.many){
     const presence=node.attrs['has.'+key];
     if(presence){
      validate(presence.length===1&&presence[0]==='true','presence-'+key);
      validate(!values||new Set(values).size===values.length,'duplicate-collection-'+key);
      data[key]=(values??[]).map(item);
     }
     else validate(!values&&!spec.required,'missing-collection-'+key);
    }else if(values){validate(values.length===1,'single-'+key);data[key]=item(values[0]);}
    else validate(!spec.required,'missing-'+key);
   }
   if(Object.hasOwn(identities,type))validate(entityId(type,data)===id,'noncanonical-identity-'+type);
   return data;
  };
  const data=visit(root,rootId,0);
  validate(used.size===nodes.length,'unowned-facts');
  return {data,world};
 }
 return {schema,encode,decode};
}
