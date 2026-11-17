// Mechanical, lossless calendar facts <-> native tool data boundary. SOP wires own state.
import {World,parse,serialize,quote} from '../../src/vendor/sopworld/sopworld.mjs';
import {copyHostData} from '../native-tool-host.mjs';
import {createCalendar} from './calendar-tool.mjs';
import schemaSource from './schema-source.mjs';
export {schemaSource as CALENDAR_STATE_SCHEMA};
const groups={calendars:'calendar',people:'person',rooms:'room',meetings:'meeting'};
const fields={calendar:['id','label','colour'],person:['id','label'],room:['id','label','capacity','location'],meeting:['id','title','start','duration','participants','room','calendar','notes']};
const require=(value,why)=>{if(!value)throw new TypeError('calendar-canonical:'+why);};
const wireId=id=>'calendar.item.u'+Array.from(new TextEncoder().encode(id),byte=>byte.toString(16).padStart(2,'0')).join('');
const token=value=>typeof value==='string'?quote(value):Object.is(value,-0)?'-0':String(value);
function nativeData(input){
 const state=copyHostData(input);require(state&&typeof state==='object'&&!Array.isArray(state),'state');
 require(Object.keys(state).every(key=>Object.hasOwn(groups,key)||key==='selectedEvent'),'unknown-state-field');
 for(const [key,kind]of Object.entries(groups))if(Object.hasOwn(state,key)){require(Array.isArray(state[key]),'group');for(const row of state[key])require(row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).every(key=>fields[kind].includes(key)),'unknown-row-field');}
 createCalendar({instanceId:'canonical-validation',...state});
 const rows=Object.keys(groups).flatMap(key=>state[key]??[]),ids=new Set(rows.map(row=>row.id));require(ids.size===rows.length,'duplicate-native-id');
 if(Object.hasOwn(state,'selectedEvent'))require(state.selectedEvent===null||typeof state.selectedEvent==='string'&&(state.meetings??[]).some(row=>row.id===state.selectedEvent),'selection');
 return state;
}
function encode(input){
 const state=nativeData(input),nodes=[],root={id:'calendar.state',type:'time.calendar.state',attrs:{}};
 for(const [key,kind]of Object.entries(groups))if(Object.hasOwn(state,key)){
  root.attrs['has.'+key]=['true'];root.attrs[key]=state[key].map(row=>'$'+wireId(row.id));
  for(const row of state[key]){const attrs={};for(const [field,value]of Object.entries(row)){
   if(field==='participants')attrs[field]=value.map(id=>'$'+wireId(id));
   else if((field==='room'||field==='calendar')&&value!==null)attrs[field]=['$'+wireId(value)];
   else attrs[field]=[token(value)];
  }nodes.push({id:wireId(row.id),type:'time.calendar.'+kind,attrs});}
 }
 if(Object.hasOwn(state,'selectedEvent'))root.attrs.selectedEvent=[state.selectedEvent===null?'null':'$'+wireId(state.selectedEvent)];
 nodes.push(root);return serialize(nodes);
}
/** Load actual typed facts under the canonical schema; rules and queries see native resources directly. */
export function calendarStateWorld(state){
 require(state&&typeof state==='object'&&!Array.isArray(state)&&Object.keys(state).length===1&&typeof state.sop==='string','carrier');
 const world=new World();require(world.load(schemaSource).ok,'schema');require(world.load(state.sop).ok,'invalid-facts');return world;
}
/** Exact derived native rows; absent keys, nulls and ordered lists are retained. */
export function toNativeCalendarState(input){
 if(!input||!Object.hasOwn(input,'sop'))return nativeData(input);
 const world=calendarStateWorld(input),nodes=parse(input.sop),byId=new Map(nodes.map(node=>[node.id,node])),root=byId.get('calendar.state'),used=new Set(['calendar.state']);
 require(nodes.every(node=>!node.pattern&&!node.legacy)&&byId.size===nodes.length&&root?.type==='time.calendar.state','root');
 const one=(node,key)=>{const values=node.attrs[key];require(Array.isArray(values)&&values.length===1,'single-'+key);return values[0];};
 const literal=raw=>{require(typeof raw==='string'&&raw[0]!=='$'&&raw[0]!=='?','literal');let value;try{value=JSON.parse(raw);}catch{throw new TypeError('calendar-canonical:literal');}require(value===null||['string','number','boolean'].includes(typeof value),'literal-type');return value;};
 const idOf=(raw,type)=>{require(raw?.[0]==='$','reference');const node=byId.get(raw.slice(1));require(node?.type==='time.calendar.'+type,'reference-type');return literal(one(node,'id'));};
 const state={};
 for(const [key,kind]of Object.entries(groups)){
  const refs=root.attrs[key]??[];if(Object.hasOwn(root.attrs,'has.'+key)){require(literal(one(root,'has.'+key))===true,'presence');state[key]=refs.map(raw=>{
   const id=idOf(raw,kind),node=byId.get(raw.slice(1));require(!used.has(node.id)&&node.id===wireId(id),'identity');used.add(node.id);const row={};
   for(const [field,values]of Object.entries(node.attrs)){
    require(fields[kind].includes(field),'unknown-row-field');
    if(field==='participants')row[field]=values.map(raw=>idOf(raw,'person'));
    else if((field==='room'||field==='calendar')&&values[0]!=='null'){require(values.length===1,'single-reference');row[field]=idOf(values[0],field);}
    else row[field]=literal(one(node,field));
   }if(kind==='meeting'&&!Object.hasOwn(row,'participants'))row.participants=[];return row;
  });}else require(refs.length===0,'absent-group');
 }
 if(Object.hasOwn(root.attrs,'selectedEvent')){const raw=one(root,'selectedEvent');state.selectedEvent=raw==='null'?null:idOf(raw,'meeting');}
 require(nodes.every(node=>used.has(node.id)),'unowned-fact');return nativeData(state);
}
/** Explicit import/bootstrap boundary; no native rows remain in the returned carrier. */
export function canonicalCalendarState(input){
 if(input&&Object.hasOwn(input,'sop')){toNativeCalendarState(input);return {sop:input.sop};}
 const state={sop:encode(input)};toNativeCalendarState(state);return state;
}
export function adoptCanonicalCalendarState(target,input){
 const next=canonicalCalendarState(input);for(const key of Object.keys(target))delete target[key];target.sop=next.sop;return target;
}
