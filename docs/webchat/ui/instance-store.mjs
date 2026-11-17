// Browser carrier for canonical SOP archives. No native world state is serialized here.
const DATABASE='psys2-instance-worlds',TABLE='instances',FALLBACK_KEY='psys2.instance-worlds.sop.v1';
function checked(record){
 if(!record||Object.getPrototypeOf(record)!==Object.prototype||Reflect.ownKeys(record).length!==4||!['world','instanceId','wires','revision'].every(key=>Object.hasOwn(record,key)))throw new TypeError('invalid-instance-record');
 const {world,instanceId,wires,revision}=record;
 if(typeof world!=='string'||!world||typeof instanceId!=='string'||!instanceId||typeof wires!=='string'||!(typeof revision==='string'&&revision.length||Number.isSafeInteger(revision)&&revision>=0))throw new TypeError('invalid-instance-record');
 return {world,instanceId,wires,revision};
}
function batch(records){if(!Array.isArray(records))throw new TypeError('instance-records-required');const rows=records.map(checked);if(new Set(rows.map(row=>row.world)).size!==rows.length)throw new TypeError('duplicate-instance-world');return rows;}
const sorted=records=>records.map(checked).sort((a,b)=>a.world.localeCompare(b.world));
function openDatabase(){return new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(Error('indexeddb-unavailable'));return;}
 let request;try{request=globalThis.indexedDB.open(DATABASE,1);}catch(error){reject(error);return;}
 let failed=false;request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(TABLE))request.result.createObjectStore(TABLE,{keyPath:'world'});};request.onerror=()=>{failed=true;reject(request.error??Error('instance-store-open-failed'));};request.onblocked=()=>{failed=true;reject(Error('instance-store-blocked'));};request.onsuccess=()=>{const db=request.result;if(failed){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
});}
function transaction(db,mode,work){return new Promise((resolve,reject)=>{let tx;try{tx=db.transaction(TABLE,mode);work(tx.objectStore(TABLE));}catch(error){try{tx?.abort();}catch{}reject(error);return;}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??Error('instance-store-write-failed'));tx.onabort=()=>reject(tx.error??Error('instance-store-aborted'));});}
export function createInstanceStore({persistent=true}={}){
 let memory=new Map(),pending=Promise.resolve(),backendPromise=null;
 const backend=()=>backendPromise??=persistent?openDatabase().then(db=>({kind:'indexeddb',db}),()=>({kind:'localStorage'})):Promise.resolve({kind:'memory'});
 const localRows=()=>{const text=globalThis.localStorage?.getItem(FALLBACK_KEY);return text===null||text===undefined?[]:batch(JSON.parse(text));};
 const all=async()=>{await pending;const store=await backend();if(store.kind==='memory')return sorted([...memory.values()]);if(store.kind==='localStorage')return sorted(localRows());return new Promise((resolve,reject)=>{let tx,rows;try{tx=store.db.transaction(TABLE,'readonly');const request=tx.objectStore(TABLE).getAll();request.onsuccess=()=>{rows=request.result;};}catch(error){reject(error);return;}tx.oncomplete=()=>{try{resolve(sorted(rows??[]));}catch(error){reject(error);}};tx.onerror=()=>reject(tx.error??Error('instance-store-read-failed'));tx.onabort=()=>reject(tx.error??Error('instance-store-read-aborted'));});};
 const enqueue=work=>{const result=pending.then(work);pending=result.catch(()=>{});return result;};
 const saveMany=records=>{let rows;try{rows=batch(records);}catch(error){return Promise.reject(error);}return enqueue(async()=>{const store=await backend();if(store.kind==='indexeddb')await transaction(store.db,'readwrite',objects=>{for(const row of rows)objects.put(row);});else if(store.kind==='memory'){const next=new Map(memory);for(const row of rows)next.set(row.world,row);memory=next;}else{const next=new Map(localRows().map(row=>[row.world,row]));for(const row of rows)next.set(row.world,row);if(!globalThis.localStorage)throw Error('persistent-instance-storage-unavailable');globalThis.localStorage.setItem(FALLBACK_KEY,JSON.stringify(sorted([...next.values()])));}return rows.map(checked);});};
 const clear=()=>enqueue(async()=>{const store=await backend();if(store.kind==='indexeddb')await transaction(store.db,'readwrite',objects=>objects.clear());else if(store.kind==='memory')memory=new Map();else{if(!globalThis.localStorage)throw Error('persistent-instance-storage-unavailable');globalThis.localStorage.removeItem(FALLBACK_KEY);}});
 return {all,saveMany,clear,async inspect(){const store=await backend();return {backend:store.kind,persistent,database:store.kind==='indexeddb'?DATABASE:null,table:store.kind==='indexeddb'?TABLE:null,fallbackKey:store.kind==='localStorage'?FALLBACK_KEY:null,records:await all()};},async exportWorld(world){return (await all()).find(row=>row.world===world)?.wires??null;},async close(){await pending;const store=await backend();store.db?.close();}};
}
