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
test('completed replies retain only their exact worker request activity, independently of later live events',async()=>{
 const worker=fakeWorker(),post=worker.postMessage.bind(worker),first=[{id:40,requestId:2,phase:'start',nodeIds:['component:reasoner']},{id:41,requestId:2,phase:'end',nodeIds:['component:reasoner']}];
 worker.postMessage=function(message){if(message.op!=='send')return post(message);queueMicrotask(()=>this.onmessage({data:{type:'res',id:message.id,ok:true,value:{reply:{text:'Completed',trace:{reading:{wires:'actual request'}}},state:{},worldActivity:first,activityRequestId:message.id}}}));};
 const client=createEngineClient({base:'https://example.test/app/',getSettings:()=>({}),spawn:()=>worker});
 try{await client.boot({});const reply=await client.session.send('actual request');assert.deepEqual(reply.trace.worldActivity,first);assert.equal(reply.trace.activityRequestId,2);assert.equal(reply.trace.reading.wires,'actual request');worker.emit('world-activity',{id:42,requestId:999,phase:'end'});assert.deepEqual(reply.trace.worldActivity,first);assert.equal(client.stats.sends,1);}finally{client.destroy();}
});

test('the public tool entry accepts an exact SOP instruction and rejects argument objects before dispatch', async () => {
 const worker = fakeWorker();
 const initialize = worker.postMessage.bind(worker);
 const calls = [];
 worker.postMessage = function (message) {
   if (message.op !== 'nativeTool') return initialize(message);
   calls.push(message);
   queueMicrotask(() => this.onmessage({data:{type:'res', id:message.id, ok:true, value:{ok:true}}}));
 };
 const client = createEngineClient({base:'https://example.test/app/',getSettings:()=>({}),spawn:()=>worker});
 try {
   await client.boot({});
   await assert.rejects(client.session.tool('drawing.object.make',{kind:'circle'}), /SOP Lang/);
   await assert.rejects(client.session.tool({operation:'drawing.object.make'}), /SOP Lang/);
   const sop = '@create drawing.object.make kind="circle" x=135 y=220';
   assert.equal((await client.session.tool(sop,{view:'draw'})).ok,true);
   assert.deepEqual(calls.map(({op,view,sop})=>({op,view,sop})),[{op:'nativeTool',view:'draw',sop}]);
 } finally {
   client.destroy();
 }
});
