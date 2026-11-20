// The Diagram tab's controls on its SOP area (worlds/diagram.sketch): changing a node's shape, a multi-selection
// kept in the area's view (one key per selected node or connection), clearing the selection, and the observed group
// scale. Every command goes through the declared native interface (the route the tab and chat share), so each
// result carries an intent record whose verification is read from the projection.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiagramState,projectDiagramArea,createDiagramArea} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {diagramNodes} from './diagram-state.mjs';

async function tab() {
 const session={isession:{state:{'diagram.sketch':emptyDiagramState()}},engine:{}};
 const state=()=>session.isession.state['diagram.sketch'];
 const run=(operation,args)=>performGesture(session,{view:'diagram',operation,args});
 const ok=async(operation,args)=>{const result=await run(operation,args);assert.ok(result.ok,operation+' '+JSON.stringify(args)+' -> '+result.message);return result;};
 const selected=()=>projectDiagramArea(state()).objects.filter(o=>o.selected==='true').map(o=>o.id).sort();
 return {state,run,ok,selected};
}

test('diagram.node.change declares kind with the shapes diagram.node.make declares, and changes the shape',async()=>{
 const bindings=(await createDiagramArea({instanceId:'controls'})).bindings(),param=(op,name)=>bindings.find(o=>o.id===op).params[name];
 assert.deepEqual(param('diagram.node.change','kind').enum,param('diagram.node.make','kind').enum);
 const {ok,run,state}=await tab();
 await ok('diagram.node.make',{kind:'rectangle',label:'Api'});
 const changed=await ok('diagram.node.change',{ids:['n1'],kind:'diamond'});
 assert.equal(changed.intentRecord.verification.status,'verified');
 assert.equal(diagramNodes(state())[0].kind,'diamond');
 assert.equal(projectDiagramArea(state()).objects.find(o=>o.id==='n1').kind,'diamond');
 assert.match(projectDiagramArea(state()).svg,/data-select="n1"><polygon/,'a diamond is drawn');
 const outside=await run('diagram.node.change',{ids:['n1'],kind:'blob'}).catch(error=>({ok:false,error}));
 assert.equal(outside.ok,false,'a shape outside the declared list is not applied');
 assert.equal(diagramNodes(state())[0].kind,'diamond');
});

test('a multi-selection is the area state: every selected node and connection is observed as selected',async()=>{
 const {ok,selected}=await tab();
 for(const kind of ['rectangle','circle','diamond'])await ok('diagram.node.make',{kind});
 await ok('diagram.link.make',{from:'n1',to:'n2'});
 assert.equal((await ok('diagram.node.select',{ids:['n1']})).intentRecord.verification.status,'verified');
 assert.deepEqual(selected(),['n1']);
 assert.equal((await ok('diagram.node.select',{ids:['n1','n2']})).intentRecord.verification.status,'verified','adding to a selection changes only the selection');
 assert.deepEqual(selected(),['n1','n2']);
 await ok('diagram.node.select',{ids:['n1','n2','n3'],edges:['e1']});
 assert.deepEqual(selected(),['e1','n1','n2','n3']);
 assert.equal((await ok('diagram.node.select',{ids:['n3']})).intentRecord.verification.status,'verified','the others are deselected');
 assert.deepEqual(selected(),['n3']);
 await ok('diagram.link.select',{ids:['e1'],nodes:['n1']});
 assert.deepEqual(selected(),['e1','n1']);
 await ok('diagram.node.select',{ids:['n1','n3']});
 await ok('diagram.node.remove',{ids:['n3']});
 assert.deepEqual(selected(),['n1'],'a removed node leaves the selection');
 await ok('diagram.group.make',{name:'g1',ids:['n1','n2']});
 await ok('diagram.group.select',{id:'g1'});
 assert.deepEqual(selected(),['g1'],'selecting a group replaces the node selection');
 await ok('diagram.node.select',{ids:[]});
 assert.deepEqual(selected(),[],'selecting nothing clears the selection');
});

test('a group\'s scale is observed, so the inspector shows the scale it has',async()=>{
 const {ok,state}=await tab();
 for(const kind of ['rectangle','circle'])await ok('diagram.node.make',{kind});
 await ok('diagram.group.make',{name:'g1',label:'Back',ids:['n1','n2']});
 assert.equal(projectDiagramArea(state()).inputs.g1.scale,undefined);
 await ok('diagram.group.resize',{id:'g1',scale:1.5});
 assert.equal(projectDiagramArea(state()).inputs.g1.scale,1.5);
});
