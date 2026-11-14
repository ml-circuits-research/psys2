import { openReader } from './lib/meaning.mjs';
const r = await openReader();
const tab = process.argv[2] === '-' ? null : process.argv[2];
for (const t of process.argv.slice(3)) {
  const x = await r.read(t, { tab, setup: process.env.SETUP ? JSON.parse(process.env.SETUP) : [] });
  console.log(JSON.stringify(t), x.complete, x.world, x.action, '\n   ', x.key.slice(0, 600) || JSON.stringify(x.segments).slice(0, 400));
}
