// The Worlds map must show every JavaScript module that can influence a chat turn or a UI action.
// This test walks the real module graph from the page, the engine worker, the tab modules and the declared
// world runtime modules, and fails when a reachable module is missing from the declared component registry
// (src/dialog/runtime-component-registry.mjs) or when the registry lists a module that is no longer reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RUNTIME_COMPONENTS,CLASSIFICATIONS,registeredModules,auditRuntimeComponents} from '../src/dialog/runtime-component-registry.mjs';
import {inspectWorldsRuntime} from '../src/dialog/worlds-inspection.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>readFileSync(path.join(root,file),'utf8');
const exists=file=>existsSync(path.join(root,file));
// Static imports/re-exports, dynamic imports (also through the worker's vurl/imp helpers and host.asset), new URL(...) module URLs.
const STATIC=/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?['"]([^'"]+)['"]/gm;
const DYNAMIC=/(?:import|vurl|imp|asset)\(\s*['"`]([^'"`$]+)['"`]\s*\)/g;
const URLS=/new URL\(\s*['"`]((?:lib|ui|worlds|\.{1,2})\/[^'"`$]+\.mjs)['"`]/g;
const LITERAL=/['"`]((?:\.{1,2}\/|lib\/|ui\/|worlds\/)[\w./-]+\.mjs)['"`]/g;
// The page serves src/X as lib/X and worlds/X as worlds/X (scripts/build-webchat.mjs).
function servedSource(file){
 if(file.startsWith('docs/webchat/lib/'))return 'src/'+file.slice('docs/webchat/lib/'.length);
 if(file.startsWith('docs/webchat/worlds/'))return 'worlds/'+file.slice('docs/webchat/worlds/'.length);
 return file;
}
function resolveSpecifier(from,specifier){
 const clean=specifier.replace(/\?.*$/,'');
 if(clean.startsWith('.'))return servedSource(path.posix.normalize(path.posix.join(path.posix.dirname(from),clean)));
 if(/^(?:lib|ui|worlds)\//.test(clean))return servedSource('docs/webchat/'+clean);
 return null;
}
export function runtimeRoots(){
 const roots=['docs/webchat/app.mjs','docs/webchat/ui/engine-worker.mjs',...JSON.parse(read('docs/webchat/ui/tabs/index.json')).map(file=>'docs/webchat/ui/tabs/'+file)];
 const index=JSON.parse(read('docs/webchat/worlds/index.json'));
 for(const world of Object.values(index.worlds??{})){roots.push(...(world.runtimeModules??[]));if(world.nativeHost)roots.push(world.nativeHost.module);if(world.nativeInitializer)roots.push(world.nativeInitializer.module);}
 return roots;
}
export function reachableModules(roots=runtimeRoots()){
 const seen=new Map(),queue=roots.map(file=>[file,'root']),missing=[];
 while(queue.length){
  const [file,by]=queue.shift();if(seen.has(file))continue;seen.set(file,by);
  if(!exists(file)){missing.push(file+' (imported by '+by+')');continue;}
  if(file.startsWith('src/vendor/')||file.startsWith('docs/webchat/vendor/'))continue;   // vendored bundles are registered as one unit each
  const text=read(file),explicit=new Set(),literal=new Set();
  for(const pattern of [STATIC,DYNAMIC,URLS])for(const match of text.matchAll(pattern))if(/\.mjs(?:\?|$)/.test(match[1]))explicit.add(match[1]);
  for(const match of text.matchAll(LITERAL))if(!explicit.has(match[1]))literal.add(match[1]);
  for(const specifier of explicit){const target=resolveSpecifier(file,specifier);if(target)queue.push([target,file]);}
  // A bare module path in a string is followed only when it names an existing file (e.g. host.asset('lib/...')).
  for(const specifier of literal){const target=resolveSpecifier(file,specifier);if(target&&exists(target))queue.push([target,file]);}
 }
 return {modules:[...seen.keys()].filter(exists).sort(),importedBy:seen,missing};
}

test('every runtime JavaScript module is registered with its generality classification',()=>{
 const {modules,importedBy,missing}=reachableModules();
 assert.deepEqual(missing,[],'imports that point at missing files');
 const registered=registeredModules();
 const unregistered=modules.filter(file=>!registered.has(file));
 assert.deepEqual(unregistered,[],'Runtime JavaScript modules missing from src/dialog/runtime-component-registry.mjs. Add each one to a component with its classification (generic, domain-logic, data, sop-carrier), decision, evidence and SOP replacement; see specs/worlds-inspector.md "Stewardship". First importer: '+unregistered.map(file=>file+' <- '+importedBy.get(file)).join('; '));
 const stale=[...registered.keys()].filter(file=>!modules.includes(file));
 assert.deepEqual(stale,[],'Registered modules that are no longer reachable from the runtime: remove them from the registry (and the audit) so the map stays true.');
});

test('registry entries are complete: domain logic carries evidence and a replacement, secrets carry evidence',()=>{
 const ids=new Set(),files=new Set();
 for(const component of RUNTIME_COMPONENTS){
  assert.ok(/^[a-z][\w:.-]*$/.test(component.id),component.id);assert.ok(!ids.has(component.id),'duplicate component '+component.id);ids.add(component.id);
  assert.ok(component.label&&component.role,component.id+' needs label and role');
  assert.ok(Array.isArray(component.modules)&&component.modules.length,component.id+' lists modules');
  for(const module of component.modules){
   assert.ok(!files.has(module.path),'module registered twice: '+module.path);files.add(module.path);
   assert.ok(CLASSIFICATIONS.includes(module.classification),module.path+' classification '+module.classification);
   if(module.classification==='domain-logic'){
    assert.ok(module.evidence?.length,module.path+' is domain logic and needs file:line evidence');
    assert.ok(module.replacement,module.path+' is domain logic and needs its SOP/knowledge replacement');
    for(const line of module.evidence)assert.match(line,/^[\w./-]+\.mjs:\d+/,module.path+' evidence must start with file:line');
   }
   for(const secret of module.secret??[])assert.match(secret,/[\w./-]+\.mjs:\d+/,module.path+' secret behaviour needs file:line');
  }
 }
});

test('the Worlds inspection shows every registered component with implementation, badge, activity hook and links',()=>{
 const graph=inspectWorldsRuntime({});
 const byId=new Map(graph.nodes.map(node=>[node.id,node])),audit=auditRuntimeComponents();
 for(const component of RUNTIME_COMPONENTS){
  // A component decorates its named record when that record is present, otherwise it is its own record.
  const node=byId.get(component.node)?.audit?.component===component.id?byId.get(component.node):byId.get('js:'+component.id);
  assert.ok(node,'component on the map: '+component.id);
  assert.equal(node.audit.component,component.id);
  assert.ok(['domain-logic','generic'].includes(node.audit.badge),component.id+' badge');
  assert.equal(node.audit.modules.length,component.modules.length);
  assert.equal(typeof node.audit.activityHook,'boolean');
  assert.ok(node.implementation,component.id+' implementation');
 }
 assert.equal(audit.components,RUNTIME_COMPONENTS.length);
 // With the base records present, the components decorate them instead of adding a second record.
 const full=inspectWorldsRuntime({libraryInfo:{version:'t'}}),fullIds=new Map(full.nodes.map(node=>[node.id,node]));
 assert.equal(fullIds.get('component:library').audit.component,'library');assert.ok(!fullIds.has('js:library'));
 assert.equal(fullIds.get('component:reasoner').audit.component,'session-coordinator');
 const ids=new Set(graph.nodes.map(node=>node.id));for(const edge of graph.edges){assert.ok(ids.has(edge.from),edge.from);assert.ok(ids.has(edge.to),edge.to);}
 // Links to records that only the merged worker graph holds are declared, resolved by the explorer when both ends exist.
 for(const link of graph.componentLinks)assert.ok(ids.has(link.from)&&typeof link.to==='string'&&link.label,JSON.stringify(link));
});

test('reader bindings, per-turn reader evidence, turn limits, translation and sampler are records on the map',async()=>{
 const {summarizeReaderBindings}=await import('../src/dialog/worlds-inspection.mjs');
 const bindings={format:'sop.structural-bindings/1',catalogue:{knowledgePin:'pin1',inventory:{path:'inventory.json'}},kinds:[{sourceWorld:'k.objects'},{sourceWorld:'k.objects'},{sourceWorld:'k.shapes'}],
  coverage:[{area:'diagram',key:'chart.type',status:'bound',by:'native-parameter',operation:'diagram.group.chart',parameter:'type'},{area:'diagram',key:'chart.colour',status:'unbound',reason:'no-native-parameter'}]};
 const summary=summarizeReaderBindings(bindings,{sha256:'abc'});
 assert.deepEqual(summary.coverage.diagram.bound,1);assert.equal(summary.coverage.diagram.total,2);assert.equal(summary.coverage.diagram.unboundKeys[0].reason,'no-native-parameter');assert.equal(summary.kindWorlds['k.objects'],2);
 const graph=inspectWorldsRuntime({readerBindings:summary,readerDiagnostics:[{component:'cutter',result:{packet:{source:{text:'a sun and a tree'},spans:[[0,5],[10,16]],coverage:{complete:true},unresolved:[]},auxiliary:{minimumProbability:.9}}}],
  turnLimits:{limits:{watchdogMs:8000},budget:true},translation:{calls:2,failures:1,lastFailure:{op:'translate',error:'browser translation timeout'}},sampler:{runs:1,last:{view:'draw',items:3}}});
 const byId=new Map(graph.nodes.map(node=>[node.id,node]));
 assert.match(byId.get('component:reader-bindings').status,/diagram 1\/2/);
 assert.deepEqual(byId.get('runtime:reader-evidence').details.calls[0].spans,[[0,5],[10,16]]);assert.match(byId.get('runtime:reader-evidence').status,/\[\[0,5\],\[10,16\]\]/);
 assert.match(byId.get('runtime:turn-limits').status,/watchdog 8000 ms/);assert.match(byId.get('runtime:translation-boundary').status,/browser translation timeout/);assert.match(byId.get('runtime:suggestion-sampler').status,/draw · 3 items/);
 assert.ok(graph.edges.some(edge=>edge.from==='component:reader'&&edge.to==='component:reader-bindings'));
 assert.ok(graph.componentLinks.some(link=>link.from==='component:reader-bindings'&&link.to==='knowledge-world:k.objects'));
 // The cutter component lights for the worker's per-turn cut event.
 assert.ok(RUNTIME_COMPONENTS.find(component=>component.id==='key-reader-inference').activity.operations.includes('reader.cut'));
});
