import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '../src/soplang/index.mjs';
const dir = 'handover/w.lang.ro';
let n = 0;
for (const f of ['schema.sop', ...readdirSync(`${dir}/shards`).map((x) => `shards/${x}`)]) {
  const r = parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const wires = r.wires ?? r;
  console.log(f, Array.isArray(wires) ? wires.length : Object.keys(r), r.errors?.length ? `ERRORS ${JSON.stringify(r.errors.slice(0, 3))}` : 'ok');
  n += Array.isArray(wires) ? wires.length : 0;
}
console.log('wires', n);
