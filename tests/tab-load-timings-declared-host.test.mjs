import{test}from'node:test';import assert from'node:assert/strict';
import{createLoadTimings}from'../docs/webchat/ui/engine-client.mjs';
test('tab stage measurements retain real elapsed work and freeze after completion',()=>{
 let time=10;const changes=[],timer=createLoadTimings({now:()=>time,onChange:value=>changes.push(value)});
 timer.stage('Read module');time=35;assert.equal(timer.snapshot().elapsedMs,25);timer.stage('Build view');time=75;
 const result=timer.finish();assert.equal(result.status,'ready');assert.equal(result.elapsedMs,65);assert.deepEqual(result.stages,[{stage:'Read module',ms:25},{stage:'Build view',ms:40}]);
 time=500;timer.stage('Ignored after completion');assert.deepEqual(timer.snapshot(),result);result.stages[0].ms=999;assert.equal(timer.snapshot().stages[0].ms,25);assert.equal(changes.length,3);
});
test('load failures preserve their stage, duration and actual error',()=>{
 let time=0;const timer=createLoadTimings({now:()=>time});timer.stage('Read bundle');time=17;const failed=timer.finish(new Error('Unavailable source'));
 assert.equal(failed.status,'error');assert.equal(failed.error,'Unavailable source');assert.deepEqual(failed.stages,[{stage:'Read bundle',ms:17}]);assert.equal(failed.elapsedMs,17);
});
