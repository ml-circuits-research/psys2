import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { World, parse } from '../src/vendor/sopworld/sopworld.mjs';
import { createNativeToolHost } from '../worlds/native-tool-host.mjs';
import { readNativeToolInterface } from '../worlds/native-tool-interface.mjs';

const fixture = `
@abi.scope std.capability.scope instance="example" version="1"
@measure std.capability.operation scope=$abi.scope name="region.measure" act=make on="measurement" order=0 eligible=true
@measure.value std.capability.parameter operation=$measure name="value" kind=number required=true min=0
@limit app.native.input name="maximum" required=true
@measure.limit app.native.parameter parameter=$measure.value field=max input=$limit
`;

test('a typed SOP input changes both compiler admissibility and the real host guard', async () => {
  const authority = readNativeToolInterface(fixture);
  assert.throws(() => authority.realize(), /missing-native-interface-input:maximum/);
  for (const maximum of [2, 4]) {
    const initial = {};
    const host = createNativeToolHost({ state: initial, instanceId: 'binding-' + maximum, scope: 'measurements',
      toolInterface: authority.realize({ maximum }), handlers: { 'region.measure': (ctx, args) => {
        ctx.state.observed = args.value;
        return { status: 'supported', changed: ['measured'] };
      } }, view: state => state.observed === undefined ? [] : [{ id: 'measured', kind: 'result', sourceType: 'measurement' }],
    });
    const world = new World();
    world.use('std.capability');
    world.load('@scope std.capability.scope instance="test" version="1"');
    world.load(host.capabilityFacts('$scope'));
    world.load(`
@mode std.capability.mode act=make target=new requireResult=true
@kind std.capability.target scope=$scope canonical=region label="region" operation=$measure
@property std.capability.property scope=$scope concept=extent on="measurement" parameter="value" order=0
`);
    const result = parse(world.compileRequest(`
@request std.request act=make mood=do source=$source
@source std.request.source text="Measure three units"
@target std.request.target request=$request mode=new kind=region
@extent std.request.constraint request=$request target=$target concept=extent operator=eq character=requirement polarity=positive value=3
@context std.capability.context request=$request scope=$scope
`))[0];
    assert.equal(result.attrs.status[0], maximum === 4 ? 'compiled' : 'unavailable');
    assert.equal(host.bindings()[0].params.value.max, maximum);
    const receipt = await host.invoke({ invocation: 'measure', expectedVersion: host.observe().version,
      operation: 'region.measure', args: { value: 3 } });
    assert.equal(receipt.status, maximum === 4 ? 'changed' : 'refused');
    assert.equal(initial.observed, maximum === 4 ? 3 : undefined);
  }
});

test('each generated module presents exactly the authored interface source', async () => {
  for (const owner of ['art.draw', 'diagram.sketch', 'time.calendar', 'docs.editor', 'ui.avatar', 'data.charts']) {
    const dir = new URL('../worlds/' + owner + '/', import.meta.url);
    const compiled = (await import(new URL('native-interface-source.mjs', dir))).default;
    assert.equal(compiled, await readFile(new URL('native-interface.sop', dir), 'utf8'), owner);
  }
});
