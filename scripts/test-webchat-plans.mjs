// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Chrome probe of PLANS FROM KNOWLEDGE (specs/24): in the built webchat a goal request ("draw a person on the swing", "draw a farm", "draw a family photo") is carried out by the plan of k.procedures
 * (the catalog is read over the network, the methods and the scenes are loaded on the first goal, never at boot), is ONE undo step, and the page has no error. When the catalog cannot be reached the
 * probe says so and only checks that nothing broke (a plan needs the catalog; the board's own reading goes on without it).
 *   node scripts/build-webchat.mjs && PUPPETEER_CORE=<scratch>/node_modules/puppeteer-core node scripts/test-webchat-plans.mjs
 */
import { openChat } from './test-webchat-turns.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };
const c = await openChat({ settings: MATRIX, throttle: 1, viewport: { width: 1100, height: 900, deviceScaleFactor: 1 } });
try {
  const objects = async () => JSON.parse(await c.state())['art.draw']?.objects ?? [];
  await c.say('open the drawing tab');
  const r1 = await c.say('draw a person on the swing');
  const planned = /^I drew a person on the swing/.test(r1.reply);
  console.log(`catalog ${planned ? 'reached: the plan ran' : 'not reached (or no plan): the board read it'}  | ${r1.reply.slice(0, 120)}`);
  const n1 = (await objects()).length;
  const w = await c.say('why');
  await c.say('undo');
  const r2 = await c.say('draw a family photo');   // nobody is in the picture now: a new family
  const n2 = (await objects()).length;
  check('a goal request is answered (never silent)', r1.ok && r2.ok && r1.reply.length > 0 && r2.reply.length > 0);
  if (planned) {
    check('a person on the swing: a swing and a person', n1 === 2, `${n1} things`);
    check('why names the method of the plan', /the method "/.test(w.reply), w.reply.slice(0, 100));
    check('a family photo is one thing of its own (the group)', n2 === 1, `${n2} things`);
    const u = await c.say('undo');
    check('undo takes the whole request back (one step)', (await objects()).length === 0, `${u.reply.slice(0, 60)} | ${(await objects()).length} things`);
  }
  check('no page errors', c.errors.length === 0, c.errors[0] ?? '');
} finally { await c.close(); }
process.exit(failed ? 1 : 0);
