import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{createProjectWorld,projectDomainForTab,inspectProjectWorld}from'../src/dialog/project-world.mjs';
import schema from'../worlds/app.project/schema-source.mjs';
test('an operational SOP project resolves domains and links actual instance identities',()=>{
 assert.equal(schema,readFileSync(new URL('../worlds/app.project/instance-schema.sop',import.meta.url),'utf8'));
 const world=createProjectWorld({areas:[{world:'novel.domain',view:'novel',label:'Novel',schemaWorld:'pattern.novel'}],instances:[{world:'novel.domain',instanceId:'actual',revision:3}]});
 assert.deepEqual(projectDomainForTab(world,'novel'),{world:'novel.domain',view:'novel',label:'Novel',schemaWorld:'pattern.novel'});assert.equal(projectDomainForTab(world,'unknown'),null);
 const main=inspectProjectWorld(world).nodes[0];assert.equal(main.label,'Main World');assert.equal(main.kind,'instance');assert.match(main.help.limits[0],/instance of the Main schema/);
 assert.equal(world.ofType('app.project.instance').length,1);assert.match(inspectProjectWorld(world).nodes[0].wires,/app.project.instance.*id="actual"/);
 assert.equal(world.tell('@bad app.project.domain world="novel.domain" tab="second" label="Bad" unknown=true').ok,false);
});
