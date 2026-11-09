#!/usr/bin/env node
// Main-thread time of DialogSession.dryRead on room-talk noise (FREEZE item 4). Prints per-text ms and the total.
//   node scripts/measure-dryread.mjs
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
export const NOISE = ['să mi spună domnul bujii lui tata', 'Dar cu cine vorbești ce vrei', 'tata ce pot să zic', 'unchiul', 'voi', 'faci tu', 'enervant da', 'scuze',
  'ia uite ce a zis vecina despre mașina aia nouă care a stat toată ziua în fața blocului', 'nu mai vreau să mănânc supă că nu e bună deloc',
  'hai mai repede că întârziem la școală și mama se supără pe noi', 'I think we should go to the store later today', 'where did you put my keys',
  'Do you want some tea or coffee, I am making some', 'mă duc să iau pâinea de la magazin și vin imediat', 'și atunci ea a zis că nu vine la petrecere'];
const s = engine.createSession({ language: 'ro' });
const times = []; let total = 0;
for (let round = 0; round < 3; round++) for (const t of NOISE) {
  const lang = /[ăîșțâ]|\b(nu|și|că|de|la|mai)\b/.test(t) ? 'ro' : 'en';
  const t0 = performance.now(); const r = await s.dryRead(t, { language: lang }); const ms = performance.now() - t0;
  total += ms; times.push(ms); if (round === 2) console.log(ms.toFixed(1).padStart(8), r.reason.padEnd(10), t.slice(0, 60));
}
times.sort((a, b) => a - b);
console.log(`calls ${times.length}  total ${total.toFixed(0)} ms  mean ${(total / times.length).toFixed(1)}  p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}  max ${times.at(-1).toFixed(1)}`);
