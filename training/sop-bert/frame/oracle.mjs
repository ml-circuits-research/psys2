// Oracle study: execute the benchmark's expected meanings as if a reader had produced them perfectly, through two
// representations, on the real area hosts of the app route (no neural reader runs):
//   frame  — the gold semantic frame (bench_to_frame.py), bound through declared concept rows (frame-binding.mjs),
//            executed as authored std.request graphs with partial execution: unbound roles are disclosed, and a request
//            the host refuses is retried without its placement/motion roles, then with its theme alone.
//   keys   — the same meaning restricted to what the official tool-key labels can say: a role with no inventory key is
//            silently absent (a perfect key reader cannot label it); a role whose key exists but has no deployed
//            binding makes the bridge refuse the whole request (unresolved-canonical-property-binding); the rest runs.
// Output lines have the run-benchmark.mjs shape (before/after snapshots), so score.py scores them unchanged.
//   strict — the frame admitted all-or-nothing (one unbound role refuses the reading; no run-time fallback).
// usage: node oracle.mjs MODE(frame|keys|strict) ITEMS.jsonl FRAMES.jsonl > out.jsonl
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { frameTools } from './frame-binding.mjs';
const [mode, itemsFile, framesFile] = process.argv.slice(2);
const P = (rel) => new URL('../../../' + rel, import.meta.url).href;
const { routeNewEngine } = await import(P('src/dialog/reader-routing.mjs'));
const { NATIVE_AREAS } = await import(P('src/dialog/app-reader-context.mjs'));
const { seedFunctionalContext } = await import(P('scripts/functional-context-seeding.mjs'));
const { FUNCTIONAL_NATIVE_BINDINGS } = await import(P('scripts/lib/functional-native-bindings.mjs'));
const root = new URL('../../../', import.meta.url).pathname;
const deployment = JSON.parse(readFileSync(path.join(root, 'docs/webchat/models/sop-bert/deployment.json')));
const bindings = JSON.parse(readFileSync(process.env.ORACLE_BINDINGS ?? path.join(root, 'docs/webchat', deployment.artifactBase, 'bindings.json')));
const tools = await frameTools({ bindings, root });

let catalogKnowledge;
async function siteKnowledge() {
  if (catalogKnowledge !== undefined) return catalogKnowledge;
  const { readdirSync, existsSync } = await import('node:fs');
  const dir = path.join(root, 'docs/webchat/catalog/'), commit = existsSync(dir) ? readdirSync(dir).find((n) => /^[0-9a-f]{40}$/.test(n)) : null;
  if (!commit) return catalogKnowledge = null;
  const { createFacts } = await import(P('src/knowledge/facts.mjs')), { createKnowledgeSource } = await import(P('src/loaders/knowledge-source.mjs'));
  return catalogKnowledge = createFacts({ source: createKnowledgeSource(dir + commit) });
}
const snap = (obs) => obs.objects.map((o) => {
  const inputs = {};
  for (const i of o.inputs ?? []) { if (/^(selected|source|version)$/.test(i.key)) continue; inputs[i.key] = i.values.length === 1 ? i.values[0] : i.values; }
  return { id: o.id, kind: o.kind ?? null, ...(o.in ? { in: o.in } : {}), ...(o.role ? { role: o.role } : {}), inputs };
});
async function newPage(p) {
  const tab = { drawing: 'draw', diagram: 'diagram' }[p.area], area = NATIVE_AREAS[tab], state = {};
  const empties = { draw: async () => (await import(P('worlds/art.draw/sop-drawing.mjs'))).emptyDrawingState(), diagram: async () => (await import(P('worlds/diagram.sketch/sop-diagram.mjs'))).emptyDiagramState() };
  state[area.world] = await empties[tab](); state['ui.shell'] = { activeTab: tab };
  const knowledge = await siteKnowledge();
  const host = await area.create({ state: state[area.world], instanceId: 'oracle-' + Math.random().toString(16).slice(2), ...(knowledge ? { knowledge } : {}) });
  const setup = await seedFunctionalContext({ context: { existing: p.context?.existing ?? [] }, host, kindMappings: FUNCTIONAL_NATIVE_BINDINGS[p.area] ?? [], invocationPrefix: 'oracle' });
  const session = { isession: { state }, newEngineJournal: [], engine: { ...(knowledge ? { knowledge } : {}), nativeBindings: bindings } };
  return { host, area, session, setup };
}
const supported = (reply) => reply?.statuses?.includes('supported');
async function run(page, wires) {
  try { return await routeNewEngine(page.session, wires, { language: 'en' }); } catch (e) { return { statuses: ['error'], text: String(e.message), trace: { reason: 'exception' } }; }
}
async function turn(page, item, frame) {
  const before = snap(page.host.observe());
  const table = tools.table(item.area, page.host);
  let plan = mode === 'keys' ? tools.keyPlan(item.area, frame, table) : tools.framePlan(item.area, frame, table);
  // strict: the same frame admitted all-or-nothing, as the reader admission and bridge do today: one unbound role
  // anywhere refuses the whole reading, and a request the host refuses is not retried
  if (mode === 'strict' && plan.disclosed.some((d) => !['discourse-only', 'no-theme'].includes(d.reason))) plan = { entries: [], disclosed: plan.disclosed, refused: [{ reason: 'all-or-nothing' }] };
  const steps = [];
  for (const entry of plan.entries) {
    let reply = await run(page, entry.wires), used = "full";
    if (process.env.ORACLE_DEBUG) console.error(entry.wires, "\n=>", reply?.statuses, reply?.trace?.reason, String(reply?.text).slice(0, 300));
    // partial execution at run time: the host refused the bound request; retry with less, and disclose what was dropped
    for (const fallback of mode === 'frame' && !supported(reply) ? entry.fallbacks ?? [] : []) {
      // a fallback is one request, or a sequence (make placed, then change the made thing); undo a failed sequence
      const sequence = [].concat(fallback.wires);
      const mark = structuredClone(page.session.isession.state);
      const replies = [];
      for (const wires of sequence) { replies.push(await run(page, wires)); if (process.env.ORACLE_DEBUG) console.error('FALLBACK', fallback.dropped, wires, '\n=>', replies.at(-1)?.statuses, replies.at(-1)?.trace?.reason, String(replies.at(-1)?.text).slice(0, 200)); if (!supported(replies.at(-1))) break; }
      reply = replies.at(-1);
      if (replies.length === sequence.length && replies.every(supported)) { used = fallback.dropped; reply = { ...reply, text: replies.map((r) => r.text).join(' ') }; break; }
      if (replies.some(supported)) for (const key of Object.keys(mark)) {
        // restore in place: the page's host observes the same state objects
        const current = page.session.isession.state[key];
        if (current && typeof current === 'object') { for (const k of Object.keys(current)) delete current[k]; Object.assign(current, mark[key]); }
        else page.session.isession.state[key] = mark[key];
      }
    }
    steps.push({ entry: entry.id, used, statuses: reply?.statuses, reason: reply?.trace?.reason ?? null, text: String(reply?.text ?? '').slice(0, 200) });
  }
  const after = snap(page.host.observe());
  return { before, after, steps, disclosed: plan.disclosed, refused: plan.refused ?? [], statuses: steps.flatMap((s) => s.statuses ?? []),
    answer: steps.map((s) => s.text).join(' '), reason: steps.find((s) => !s.statuses?.includes('supported'))?.reason ?? null, wires: plan.entries.map((e) => e.wires) };
}
const frames = new Map(readFileSync(framesFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r.frame]));
const pages = new Map();
for (const line of readFileSync(itemsFile, 'utf8').split('\n').filter(Boolean)) {
  const p = JSON.parse(line); p.area = p.area ?? p.tab;
  let out;
  try {
    let page = p.session ? pages.get(p.session) : null;
    if (!page) { page = await newPage(p); if (p.session) pages.set(p.session, page); }
    out = { id: p.id, text: p.text, area: p.area, session: p.session ?? null, seeded: page.setup.ok, ...(await turn(page, p, frames.get(p.id))) };
  } catch (e) { out = { id: p.id, text: p.text, area: p.area, error: String(e.message), stack: String(e.stack).split('\n').slice(0, 5).join(' / ') }; }
  process.stdout.write(JSON.stringify(out) + '\n');
}
