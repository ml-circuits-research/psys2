// A tool supplies measured alternatives. The receiving world's criteria decide how to compare them.
import {parse,serialize} from '../vendor/sopworld/sopworld.mjs?v=d86f897e0e';

export function compileObservedChoice(world,policy,observations) {
  const atom = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
  if (typeof policy !== 'string' || !atom.test(policy)) throw Error('invalid-choice-policy');
  const measurements = [];
  const indices = new Map();
  const options = observations.map((values,index) => {
    const id = 'observed.option.' + index;
    indices.set('$' + id,index);
    const refs = [];
    for (const [metric,value] of Object.entries(values)) {
      if (!atom.test(metric)) throw Error('invalid-observed-metric');
      if (!Number.isFinite(value)) throw Error('nonfinite-observed-metric');
      const measure = 'observed.metric.' + measurements.length;
      refs.push('$' + measure);
      measurements.push({id:measure,type:'std.choice.measurement',attrs:{metric:[metric],value:[String(value)]}});
    }
    return {id,type:'std.choice.option',attrs:{measurement:refs}};
  });
  const request = {id:'observed.choice',type:'std.choice.request',attrs:{policy:[policy],option:[...indices.keys()]}};
  const input = serialize([request,...options,...measurements]);
  const sop = world.compileRequest(input);
  const result = parse(sop).find(row => row.type === 'std.choice.result');
  const references = key => (result?.attrs[key] ?? []).map(ref => indices.get(ref));
  return {input,sop,selected:references('option')[0],alternatives:references('alternative'),ties:references('tie')};
}
