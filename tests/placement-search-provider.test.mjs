import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placementSearchProvider,warmPlacementSearch,z3Status,Z3_BASE} from '../src/dialog/placement-search-provider.mjs';
import {z3Version} from '../src/vendor/sopworld/smt-z3.mjs';

test('placement uses no search provider where Z3 cannot run, so compileRequest stays synchronous; the warm-up loads nothing', () => {
 assert.equal(placementSearchProvider(), undefined);
 const status=warmPlacementSearch();
 assert.equal(status.state,'unavailable');
 assert.deepEqual({supported:status.supported,base:status.base,load:status.load,loadMs:status.loadMs,warmedBy:status.warmedBy,version:status.version},
  {supported:false,base:Z3_BASE,load:null,loadMs:null,warmedBy:null,version:z3Version});
 assert.equal(z3Status().state,'unavailable');
});

test('the Z3 provider loads from the library site under the vendored version, once per realm', () => {
 assert.equal(Z3_BASE,`https://ml-circuits-research.github.io/soplang-words-lib/vendor/z3-solver-${z3Version}/`);
 const first=placementSearchProvider({supported:()=>true});
 assert.equal(typeof first,'function');
 assert.equal(typeof first.preload,'function');
 assert.equal(placementSearchProvider({supported:()=>true}),first);
});
