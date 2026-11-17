import test from'node:test';import assert from'node:assert/strict';
import{createEngineClient}from'../docs/webchat/ui/engine-client.mjs';
const fakeWorker=({readyBeforeResponse=false}={})=>({terminate(){},emit(name,data){this.onmessage({data:{type:'evt',name,data}});},postMessage(message){if(message.op==='init')queueMicrotask(()=>{this.emit('sop-reader-status',{state:'loading'});if(readyBeforeResponse)this.emit('sop-reader-status',{state:'ready',cache:{stats:{hits:7}}});this.onmessage({data:{type:'res',id:message.id,ok:true,value:{state:{},worlds:['core'],known:['core'],reader:{state:'loading'}}}});});}});
test('engine boot resolves while reader loads and later real status updates the public info',async()=>{
 const worker=fakeWorker(),events=[],client=createEngineClient({base:'https://example.test/app/',getSettings:()=>({}),spawn:()=>worker,onEvent:(name,data)=>events.push({name,data})});
 try{const info=await client.boot({});assert.equal(info.reader.state,'loading');assert.deepEqual(info.known,['core']);await client.ready();worker.emit('sop-reader-status',{state:'ready',cache:{stats:{hits:7}}});assert.equal(client.info.reader.state,'ready');assert.equal(client.info.reader.cache.stats.hits,7);assert.ok(events.some(event=>event.name==='sop-reader-status'&&event.data.state==='ready'));}finally{client.destroy();}
});
test('a reader completion event before the init response is retained rather than overwritten by boot loading state',async()=>{
 const worker=fakeWorker({readyBeforeResponse:true}),client=createEngineClient({base:'https://example.test/app/',getSettings:()=>({}),spawn:()=>worker});
 try{assert.equal((await client.boot({})).reader.state,'ready');assert.equal(client.info.reader.cache.stats.hits,7);}finally{client.destroy();}
});
