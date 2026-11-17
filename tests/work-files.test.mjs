import test from'node:test';import assert from'node:assert/strict';
import{workFile,readWorkFile}from'../docs/webchat/ui/work-files.mjs';
test('explicit work files preserve archives, reject version differences and never translate native state',()=>{
 const rows=[{world:'invented',instanceId:'actual',revision:3,wires:'@x invented.object label="Exact"'}],file=workFile('build-1',rows);
 assert.deepEqual(readWorkFile(JSON.stringify(file),'build-1'),rows);file.records[0].wires='changed';assert.notEqual(rows[0].wires,file.records[0].wires);
 assert.throws(()=>readWorkFile(JSON.stringify(file),'build-2'),/No conversion/);
 assert.throws(()=>readWorkFile(JSON.stringify({objects:[]}), 'build-1'),/No conversion/);
 assert.throws(()=>workFile('build-1',[...rows,...rows]),/Duplicate/);
});
