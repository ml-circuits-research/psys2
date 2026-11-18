// Private transport for tools that work on detached records derived from SOP state.
// A typed reference without a named join owns a child in this projection. Named
// joins preserve a scalar identity and do not traverse the referenced record.
const atom = value => typeof value === 'string' && /^[A-Za-z_][\w.-]*$/.test(value);
const plain = value => value && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = reason => { throw new TypeError('instance-fact-codec:' + reason); };
const need = (condition, reason) => { if (!condition) fail(reason); };
const valueKinds = new Set(['string','integer','number','boolean','atom']);
const list = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const escapeId = value => Array.from(value, char => char.codePointAt(0).toString(16).padStart(6,'0')).join('');

function accepts(kind,value) {
 if(kind==='atom')return atom(value);
 if(kind==='integer')return Number.isSafeInteger(value);
 if(kind==='number')return Number.isFinite(value);
 return typeof value===kind;
}

function literal(value,kinds,quote) {
 if(value===null&&kinds.includes('atom'))return 'null';
 const kind=kinds.find(kind=>accepts(kind,value));
 need(kind,'literal-kind');
 if(kind==='atom')return value;
 if(kind==='string')return quote(value);
 return Object.is(value,-0)?'-0':String(value);
}

function scalar(token,kinds) {
 if(token==='null'&&kinds.includes('atom'))return null;
 if(kinds.includes('atom')&&atom(token)&&!['true','false'].includes(token))return token;
 let value;
 try {value=JSON.parse(token);}catch {fail('literal-kind');}
 need(kinds.some(kind=>accepts(kind,value)),'literal-kind');
 return value;
}

/** This is an internal carrier adapter. It does not change an operational World.
 * A closed schema and an explicitly named root determine the record shape. */
export function instanceFactCodec(schemaWorld,rootType,{parse,quote,serialize,rootId=rootType}={}) {
 need([parse,quote,serialize].every(service=>typeof service==='function'),'parser-services');
 need(schemaWorld.wires.size===0,'schema-only-world');
 const types=new Map();
 function descriptor(type) {
  if(types.has(type))return types.get(type);
  const schema=schemaWorld.schema(type);
  need(schema?.closed,'closed-type:'+type);
  const entries=Object.entries(schema.keys),slots=new Map(),identities=[];
  for(const [key,slot] of entries){
   if(key.startsWith('has.')){
    need(schema.keys[key.slice(4)]?.many&&slot.kind==='boolean'&&!slot.many,'collection-presence:'+key);
    continue;
   }
   const kinds=list(slot.kind),children=list(slot.type);
   const owned=children.length&&!slot.by;
   need(kinds.every(kind=>valueKinds.has(kind))&&children.length<=1,'slot-kind:'+key);
   need(owned||kinds.length,'scalar-kind:'+key);
   if(slot.id==='true'){
    need(!slot.many&&!owned&&kinds.includes('string'),'identity-slot:'+key);
    identities.push(key);
   }
   const presence=schema.keys['has.'+key];
   slots.set(key,{kinds,child:owned?children[0]:null,many:slot.many,
    nullable:kinds.includes('atom'),required:slot.required||presence?.required,presence:!!presence});
  }
  need(identities.length<=1,'identity-cardinality:'+type);
  const record={slots,identity:identities[0]};
  types.set(type,record);
  return record;
 }
 function identityId(type,record) {
  const key=descriptor(type).identity,identity=record?.[key];
  need(typeof identity==='string'&&identity.length>0&&identity.length<=512,'identity:'+type);
  return type+'.u'+escapeId(identity);
 }

 function encode(data) {
  const nodes=[];
  const visit=(type,record,id,depth)=>{
   need(plain(record)&&depth<48&&nodes.length<100000,'record-budget:'+type);
   const {slots}=descriptor(type),own=Object.getOwnPropertyDescriptors(record),attrs=Object.create(null);
   need(Reflect.ownKeys(own).every(key=>slots.has(key)&&own[key].enumerable&&Object.hasOwn(own[key],'value')),'record-key:'+type);
   nodes.push({id,type,attrs});
   for(const [key,slot] of slots){
    if(!Object.hasOwn(own,key)){need(!slot.required,'missing:'+key);continue;}
    const value=own[key].value;
    const encodeValue=(item,index)=>{
     if(item===null&&slot.nullable)return 'null';
     if(!slot.child)return literal(item,slot.kinds,quote);
     const child=descriptor(slot.child).identity?identityId(slot.child,item):id+'.'+key+(slot.many?'.i'+index:'');
     visit(slot.child,item,child,depth+1);
     return '$'+child;
    };
    if(slot.many){
     need(Array.isArray(value)&&(slot.presence||value.length>0),'collection:'+key);
     const encoded=Array.from(value,encodeValue);
     need(new Set(encoded).size===encoded.length,'duplicate-collection:'+key);
     if(slot.presence)attrs['has.'+key]=['true'];
     if(encoded.length)attrs[key]=encoded;
    }else attrs[key]=[encodeValue(value,0)];
   }
  };
  visit(rootType,data,rootId,0);
  const sop=serialize(nodes);
  decode(sop);
  return sop;
 }

 function decode(sop) {
  need(typeof sop==='string'&&sop.length<=4000000,'carrier');
  const nodes=parse(sop),index=new Map(nodes.map(node=>[node.id,node])),used=new Set();
  need(nodes.length<=100000&&index.size===nodes.length&&nodes.every(node=>!node.pattern&&!node.legacy),'duplicate-or-pattern');
  const world=schemaWorld.fork(),admitted=world.tell(sop,{factsOnly:true});
  need(admitted.ok,'facts:'+JSON.stringify(admitted.violations));
  const visit=(type,id,depth)=>{
   const node=index.get(id),{slots,identity}=descriptor(type);
   need(depth<48&&node?.type===type&&!used.has(id),'ownership-or-reference:'+id);
   used.add(id);
   need(Object.keys(node.attrs).every(key=>slots.has(key)||key.startsWith('has.')&&slots.get(key.slice(4))?.presence),'unknown-key:'+id);
   const data={};
   for(const [key,slot] of slots){
    const tokens=node.attrs[key],presence=node.attrs['has.'+key];
    const decodeValue=token=>{
     if(token==='null'&&slot.nullable)return null;
     if(!slot.child)return scalar(token,slot.kinds);
     need(token.startsWith('$'),'reference:'+key);
     return visit(slot.child,token.slice(1),depth+1);
    };
    let value;
    if(slot.many){
     need(!presence||presence.length===1&&presence[0]==='true','presence:'+key);
     need(!tokens||!slot.presence||presence,'missing-presence:'+key);
     need(!tokens||new Set(tokens).size===tokens.length,'duplicate-collection:'+key);
     if(tokens||presence)value=(tokens??[]).map(decodeValue);
    }else if(tokens){
     need(tokens.length===1,'cardinality:'+key);
     value=decodeValue(tokens[0]);
    }
    need(value!==undefined||!slot.required,'missing:'+key);
    if(value!==undefined)Object.defineProperty(data,key,{value,enumerable:true,writable:true,configurable:true});
   }
   if(identity&&depth!==0)need(identityId(type,data)===id,'noncanonical-identity:'+id);
   return data;
  };
  const data=visit(rootType,rootId,0);
  need(used.size===nodes.length,'unowned-facts');
  return {data,world};
 }
 descriptor(rootType);
 return {encode,decode};
}
