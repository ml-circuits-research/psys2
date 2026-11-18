// Avatar SOP authority. Native objects exist only at the primitive/view boundary.
import {World,parse,serialize,quote} from '../../lib/vendor/sopworld/sopworld.mjs?v=9d6ddce277';
import {copyHostData} from '../native-tool-host.mjs?v=c0eac86cc6';
import schemaSource from './state-schema-source.mjs?v=3242b6318f';
export {schemaSource as AVATAR_STATE_SCHEMA};
// The reusable schema is owned by this module; carriers contain only instance facts.
const schemaWorld=new World({library:{'ui.avatar':schemaSource}});
schemaWorld.load('@avatar.state.schema core.use world=ui.avatar');
const own=(o,k)=>Object.hasOwn(o,k),plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const need=(ok,why)=>{if(!ok)throw new TypeError('avatar-canonical:'+why);};
const workBudget=()=>{let steps=0;return {tick(){need(++steps<=100000,'work-budget');}};};
const maps={slots:'variant',paint:'paint',grade:'grade',expressionParts:'expressionVariant',adj:'geometry'};
const common=['slots','colours','paint','adj','grade','expression','expressionParts','explicit','base','name'];
const faceFields=[...common,'v','saved','options','n','history','future','refs','stepGroup','label'];
const keys=(o,allowed,why)=>need(plain(o)&&Object.keys(o).every(k=>allowed.includes(k)),why);
const strings=a=>Array.isArray(a)&&a.every(v=>typeof v==='string');
const literal=v=>typeof v==='string'?quote(v):Object.is(v,-0)?'-0':String(v);
const suffix=s=>Array.from(new TextEncoder().encode(s),b=>b.toString(16).padStart(2,'0')).join('');
/** Strict inventory of current face2 state and saved/undo composition records. */
function nativeData(input){
 const budget=workBudget();
 const s=copyHostData(input);keys(s,['face','name','selectedSlot','idDisplay'],'state-fields');
 need(plain(s.face)&&s.face.v===2,'face-version');
 if(own(s,'name'))need(typeof s.name==='string','name');
 if(own(s,'selectedSlot'))need(s.selectedSlot===null||typeof s.selectedSlot==='string','selection');
 if(own(s,'idDisplay')){keys(s.idDisplay,['mode','expiresAt'],'id-display');need(typeof s.idDisplay.mode==='string','id-mode');if(own(s.idDisplay,'expiresAt'))need(Number.isFinite(s.idDisplay.expiresAt),'id-time');}
 const composition=(f,full)=>{
  budget.tick();
  keys(f,full?faceFields:[...common,'label'],'composition-fields');
  for(const k of ['expression','base','name','label'])if(own(f,k))need(typeof f[k]==='string','composition-string');
  for(const k of [...Object.keys(maps),'colours'])if(own(f,k)){
   need(plain(f[k]),'composition-map');for(const v of Object.values(f[k])){
    if(k==='adj'){keys(v,['s','dx','dy'],'geometry-fields');need(Object.values(v).every(Number.isFinite),'geometry-number');}
    else need(typeof v==='string','map-string');
   }
  }
  if(own(f,'explicit')){keys(f.explicit,['slots','roles','paint'],'override-fields');need(Object.values(f.explicit).every(strings),'override-values');}
  if(!full)return;
  if(own(f,'n'))need(Number.isSafeInteger(f.n)&&f.n>=0,'counter');
  if(own(f,'stepGroup'))need(f.stepGroup===null||typeof f.stepGroup==='string','step-group');
  for(const k of ['history','future'])if(own(f,k)){need(Array.isArray(f[k]),'journal');f[k].forEach(v=>composition(v,false));}
  if(own(f,'saved')){need(plain(f.saved),'saved');Object.values(f.saved).forEach(v=>composition(v,false));}
  if(own(f,'options')&&f.options!==null){keys(f.options,['slot','variants'],'options-fields');need(typeof f.options.slot==='string'&&strings(f.options.variants),'options-values');}
  if(own(f,'refs')){need(Array.isArray(f.refs),'references');for(const r of f.refs){keys(r,['thing'],'referent-fields');need(typeof r.thing==='string','referent');}}
 };
 composition(s.face,true);need(s.face.v===2,'face-version');return s;
}
function encode(input){
 const budget=workBudget();
 const s=nativeData(input),nodes=[];
 const add=(id,kind,attrs={})=>{const n={id,type:'ui.avatar.state.'+kind,attrs};nodes.push(n);return n;};
 const put=(n,k,v)=>n.attrs[k]=[literal(v)];
 const presence=(n,k)=>put(n,'has.'+k,true);
 const composition=(f,id,extra={})=>{
  budget.tick();
  const n=add(id,'composition',extra),parts=new Map();
  if(id==='avatar.face'){put(n,'id','face');put(n,'nativeType','ui.avatar.face');}
  const part=key=>{if(!parts.has(key)){const p=add(id+'.part.u'+suffix(key),'part');put(p,'id',key);if(id==='avatar.face'&&key!=='face'&&(own(f.slots??{},key)||own(f.expressionParts??{},key)))put(p,'nativeType','ui.avatar.part');parts.set(key,p);}return parts.get(key);};
  for(const k of ['v','expression','base','name','label','n','stepGroup'])if(own(f,k))put(n,k,f[k]);
  for(const [map,field]of Object.entries(maps))if(own(f,map)){
   presence(n,map);n.attrs[map]=Object.entries(f[map]).map(([key,v])=>{
    const p=part(key);if(map==='adj'){put(p,'has.geometry',true);for(const [k,vv]of Object.entries(v))put(p,'geometry.'+k,vv);}else put(p,field,v);
    return '$'+p.id;
   });
  }
  if(own(f,'colours')){presence(n,'colours');n.attrs.colours=Object.entries(f.colours).map(([role,value])=>{const p=add(id+'.colour.u'+suffix(role),'colour');put(p,'role',role);put(p,'colour',value);return '$'+p.id;});}
  if(own(f,'explicit')){const p=add(id+'.explicit','overrides');for(const [k,v]of Object.entries(f.explicit)){presence(p,k);p.attrs[k]=v.map(literal);}n.attrs.explicit=['$'+p.id];}
  for(const k of ['history','future'])if(own(f,k)){presence(n,k);n.attrs[k]=f[k].map((v,i)=>'$'+composition(v,id+'.'+k+'.i'+i).id);}
  if(own(f,'saved')){presence(n,'saved');n.attrs.saved=Object.entries(f.saved).map(([key,v])=>'$'+composition(v,id+'.saved.u'+suffix(key),{savedKey:[literal(key)]}).id);}
  if(own(f,'options')){
   if(f.options===null)put(n,'options',null);else{const p=add(id+'.options','options');put(p,'slot',f.options.slot);p.attrs.variants=f.options.variants.map(literal);n.attrs.options=['$'+p.id];}
  }
  if(own(f,'refs')){presence(n,'refs');n.attrs.refs=f.refs.map((r,i)=>{const p=add(id+'.referent.i'+i,'referent');put(p,'thing',r.thing);return '$'+p.id;});}
  return n;
 };
 const root=add('avatar.state','root');root.attrs.face=['$'+composition(s.face,'avatar.face').id];
 for(const k of ['name','selectedSlot'])if(own(s,k))put(root,k,s[k]);
 if(own(s,'idDisplay')){const p=add('avatar.idDisplay','idDisplay');for(const [k,v]of Object.entries(s.idDisplay))put(p,k,v);root.attrs.idDisplay=['$'+p.id];}
 return serialize(nodes);
}
function avatarStateContext(carrier){
 need(plain(carrier)&&Object.keys(carrier).length===1&&typeof carrier.sop==='string'&&carrier.sop.length<=4000000,'carrier');
 const w=schemaWorld.fork();need(w.tell(carrier.sop,{factsOnly:true}).ok,'facts');return w;
}
export function avatarStateWorld(carrier){return decodeAvatarState(carrier).world;}
/** Exact temporary native data, including empty collections and journal ordering. */
export function toNativeAvatarState(input){
 if(!input||!own(input,'sop'))return nativeData(input);
 return decodeAvatarState(input).state;
}
function decodeAvatarState(input){
 const budget=workBudget(),world=avatarStateContext(input),nodes=parse(input.sop),byId=new Map(nodes.map(n=>[n.id,n]));
 need(nodes.every(n=>!n.pattern&&!n.legacy)&&nodes.length===byId.size,'duplicate-or-pattern');
 const used=new Set(),compositionPath=new Set();
 const get=(id,kind)=>{const n=byId.get(id);need(n?.type==='ui.avatar.state.'+kind,'reference-type');used.add(id);return n;};
 const one=(n,k)=>{need(n.attrs[k]?.length===1,'single-'+k);return n.attrs[k][0];};
 const value=raw=>{need(typeof raw==='string'&&!['$','?'].includes(raw[0]),'literal');let v;try{v=JSON.parse(raw);}catch{throw new TypeError('avatar-canonical:literal');}need(v===null||['string','number','boolean'].includes(typeof v),'scalar');return v;};
 const at=(n,k)=>value(one(n,k));
 const ref=(raw,kind)=>{need(raw?.startsWith('$'),'reference');return get(raw.slice(1),kind);};
 const has=(n,k)=>{if(!own(n.attrs,'has.'+k)){need(!own(n.attrs,k),'missing-presence');return false;}need(at(n,'has.'+k)===true,'presence');return true;};
 const composition=n=>{
  budget.tick();
  need(!compositionPath.has(n.id)&&compositionPath.size<64,'composition-cycle-or-depth');compositionPath.add(n.id);
  const f={};for(const k of ['v','expression','base','name','label','n','stepGroup'])if(own(n.attrs,k))f[k]=at(n,k);
  for(const [map,field]of Object.entries(maps))if(has(n,map)){
   f[map]={};for(const raw of n.attrs[map]??[]){const p=ref(raw,'part'),key=at(p,'id');need(typeof key==='string'&&!own(f[map],key),'part-key');
    let v;if(map==='adj'){need(at(p,'has.geometry')===true,'geometry-presence');v={};for(const k of ['s','dx','dy'])if(own(p.attrs,'geometry.'+k))v[k]=at(p,'geometry.'+k);}else v=at(p,field);
    Object.defineProperty(f[map],key,{value:v,writable:true,configurable:true,enumerable:true});
   }
  }
  if(own(n.attrs,'explicit')){const p=ref(one(n,'explicit'),'overrides');f.explicit={};for(const k of ['slots','roles','paint'])if(has(p,k))f.explicit[k]=(p.attrs[k]??[]).map(value);}
  if(has(n,'colours')){f.colours={};for(const raw of n.attrs.colours??[]){const p=ref(raw,'colour'),key=at(p,'role');need(typeof key==='string'&&!own(f.colours,key),'colour-role');Object.defineProperty(f.colours,key,{value:at(p,'colour'),writable:true,configurable:true,enumerable:true});}}
  for(const k of ['history','future'])if(has(n,k))f[k]=(n.attrs[k]??[]).map(raw=>composition(ref(raw,'composition')));
  if(has(n,'saved')){f.saved={};for(const raw of n.attrs.saved??[]){const p=ref(raw,'composition'),key=at(p,'savedKey');need(typeof key==='string'&&!own(f.saved,key),'saved-key');Object.defineProperty(f.saved,key,{value:composition(p),writable:true,configurable:true,enumerable:true});}}
  if(own(n.attrs,'options')){const raw=one(n,'options');if(raw==='null')f.options=null;else{const p=ref(raw,'options');f.options={slot:at(p,'slot'),variants:(p.attrs.variants??[]).map(value)};}}
  if(has(n,'refs'))f.refs=(n.attrs.refs??[]).map(raw=>({thing:at(ref(raw,'referent'),'thing')}));
  compositionPath.delete(n.id);return f;
 };
 const root=get('avatar.state','root'),state={face:composition(ref(one(root,'face'),'composition'))};
 for(const k of ['name','selectedSlot'])if(own(root.attrs,k))state[k]=at(root,k);
 if(own(root.attrs,'idDisplay')){const p=ref(one(root,'idDisplay'),'idDisplay');state.idDisplay={};for(const k of ['mode','expiresAt'])if(own(p.attrs,k))state.idDisplay[k]=at(p,k);}
 need(nodes.every(n=>used.has(n.id)),'unowned-fact');nativeData(state);
 // Canonical domain structure must account for every supplied attribute and relationship.
 const normalized=ns=>ns.map(n=>({id:n.id,type:n.type,attrs:Object.fromEntries(Object.entries(n.attrs).filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b)))})).sort((a,b)=>a.id.localeCompare(b.id));
 need(JSON.stringify(normalized(parse(encode(state))))===JSON.stringify(normalized(nodes)),'noncanonical-domain-structure');return {state,world};
}
export function canonicalAvatarState(input){if(input&&own(input,'sop')){toNativeAvatarState(input);return {sop:input.sop};}const carrier={sop:encode(input)};avatarStateWorld(carrier);return carrier;}
export function adoptCanonicalAvatarState(target,input){const next=canonicalAvatarState(input);for(const k of Object.keys(target))delete target[k];target.sop=next.sop;return target;}
