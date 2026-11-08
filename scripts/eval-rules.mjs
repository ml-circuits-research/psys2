#!/usr/bin/env node
/**
 * Rule baseline on the test splits (worker-tasks T2). Deterministic, standard library only, parallel over worlds.
 *
 * Per training/dataset/<world>/test.jsonl record, in a fresh session with the record's active tab and its context messages
 * formalized first, then the text:
 *   (a) restricted: the rule formalizer with only the record's world (and its imports): the pure rule-formalizer ceiling;
 *   (b) routed: the dialog session over all worlds with the current rule router (what the dialog server does).
 * A positive record is correct when every segment of the text is parsed and the id-normalized SOP of the produced wires
 * equals the id-normalized target (normalizedSop of scripts/collect-paraphrases.mjs).
 * A negative record is correct when the record's world does not claim the text: restricted = nothing parsed;
 * routed = no segment matched by the record's world (or its imports); `silent` additionally counts routed texts that no world parsed.
 * Routing: routing.jsonl test rows, the dialog session with the row's tab, recent_worlds and session messages; the routed
 * world is the world of the first parsed segment of the text; correct when it equals `world` or is in `alt_worlds`.
 *
 * Held-out set (worker-tasks B1): training/paraphrases/heldout/out/<world>.jsonl, evaluated exactly the same way (restricted and
 * routed, record context and tab, target = expected_circuit) as a separate source `heldout`, reported in its own `heldout` section.
 * Records flagged needs_review are excluded and counted. By default one run does the test splits, routing and the held-out set;
 * `--heldout` = held-out only (default output training/results/rules-heldout.json), `--no-heldout` = skip it. Never train on it.
 *
 * Usage: node scripts/eval-rules.mjs [--world <id>] [--heldout | --no-heldout] [--out <file>] [--failures <file>] [--jobs N] [--no-write]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { formalize, FormSession } from '../src/formalizer/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';

export { groupOf, GROUP_ORDER };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = join(REPO, 'training/dataset');
export const normText = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const CHUNK = 250;
const HELDOUT = join(REPO, 'training/paraphrases/heldout/out');
/** Held-out records in dataset-record shape; needs_review ones are excluded and counted. */
function loadHeldout(world) {
  const file = join(HELDOUT, `${world}.jsonl`);
  const recs = [];
  let review = 0;
  if (existsSync(file)) for (const r of readJsonl(file)) {
    if (r.needs_review) { review++; continue; }
    recs.push({ id: r.example_id, world, text: r.text, context: r.context ?? [], tab: r.tab ?? null, target: r.expected_circuit, negative: false, source: 'heldout' });
  }
  return { recs, review };
}

// ---- worker side ---------------------------------------------------------------------------------------------------
async function makeEnv() {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  return { engine, legends: engine.set.legends, restricted: new Map() };
}

/** A view of the world set with only `world` and its imports (own memo cache; legends shared). */
function restrictedSet(env, world) {
  if (!env.restricted.has(world)) {
    const set = env.engine.set;
    const ids = set.available(world);
    const sub = Object.create(set);
    sub._cache = new Map();
    sub.list = () => ids.map((i) => set.get(i));
    env.restricted.set(world, { set: sub, ids });
  }
  return env.restricted.get(world);
}

function runRestricted(env, rec) {
  const { set, ids } = restrictedSet(env, rec.world);
  const form = new FormSession();
  form.initDefaults();
  const ctx = { activeTab: rec.tab ?? null, tabWorld: rec.tab ? rec.world : null, recentWorlds: [] };
  let res = null;
  [...(rec.context ?? []), rec.text].forEach((m, i) => { res = formalize(m, { worlds: set, session: form, source: `msg${i + 1}`, context: ctx }); });
  return summarizeSegments(env, res.segments, ids);
}

function newSession(env, { tab, recent = [], setup = [] }) {
  const s = env.engine.createSession();
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  if (recent.length) s._recentWorlds = [...recent];
  return s;
}

async function runRouted(env, rec) {
  const s = newSession(env, { tab: rec.tab });
  for (const m of rec.context ?? []) await s.send(m);
  const r = await s.send(rec.text);
  return summarizeSegments(env, r.segments, null);
}

function summarizeSegments(env, segments, ids) {
  const parsed = segments.filter((x) => !x.unparsed);
  const wires = parsed.flatMap((x) => x.wires);
  const worlds = parsed.map((x) => x.match?.worldId).filter(Boolean);
  return { sop: normalizedSop(wires, env.legends), worlds, parsed: parsed.length, unparsed: segments.length - parsed.length, ids };
}

async function worldTask(env, world, heldout = false) {
  const file = join(DATASET, world, 'test.jsonl');
  const ho = heldout ? loadHeldout(world) : null;
  const recs = heldout ? ho.recs : existsSync(file) ? readJsonl(file) : [];
  const cells = {}, failures = [];
  const avail = new Set(env.engine.set.available(world));
  for (const rec of recs) {
    const neg = !!rec.negative;
    const cell = (cells[`${rec.source}|${neg ? 'neg' : 'pos'}`] ??= { n: 0, restricted_ok: 0, routed_ok: 0, routed_silent: 0 });
    cell.n++;
    let target = null, badTarget = false;
    if (!neg) {
      const p = parse(rec.target, { source: rec.id });
      if (p.errors.length) badTarget = true; else target = normalizedSop(p.wires, env.legends);
    }
    const modes = { restricted: await safe(() => runRestricted(env, rec)), routed: await safe(() => runRouted(env, rec)) };
    for (const [mode, out] of Object.entries(modes)) {
      let ok, cls = null;
      if (neg) {
        const claimed = mode === 'restricted' ? out.parsed > 0 : out.worlds.some((w) => avail.has(w));
        ok = !claimed;
        if (!ok) cls = 'claimed';
        if (mode === 'routed' && out.parsed === 0) cell.routed_silent++;
      } else if (badTarget) { ok = false; cls = 'bad target'; }
      else {
        ok = out.unparsed === 0 && out.parsed > 0 && JSON.stringify(out.sop) === JSON.stringify(target);
        if (!ok) cls = out.parsed === 0 ? 'not parsed' : out.worlds.some((w) => avail.has(w)) ? 'differs' : 'wrong world';
      }
      if (ok) cell[mode + '_ok']++;
      else failures.push({ mode, id: rec.id, world, source: rec.source, negative: neg, text: rec.text, context: rec.context ?? [], tab: rec.tab ?? null,
        target: neg ? '' : rec.target, target_norm: target ?? [], produced: out.sop, routed_world: out.worlds[0] ?? null, routed_worlds: [...new Set(out.worlds)], unparsed_segments: out.unparsed, failure_class: cls });
    }
  }
  return { cells, failures, review_excluded: ho?.review ?? 0 };
}

const safe = async (f) => { try { return await f(); } catch (e) { return { sop: [`ERROR ${e.message}`], worlds: [], parsed: 0, unparsed: 1, ids: null }; } };

async function routingTask(env, rows) {
  const out = [];
  for (const row of rows) {
    const c = row.context ?? {};
    const s = newSession(env, { tab: c.tab, recent: c.recent_worlds ?? [] });
    let r = null;
    try { for (const m of c.session ?? []) await s.send(m); r = await s.send(row.text); } catch { r = null; }
    const seg = r?.segments.find((x) => !x.unparsed && x.match);
    const routed = seg?.match.worldId ?? null;
    const ok = routed != null && (routed === row.world || (row.alt_worlds ?? []).includes(routed));
    out.push({ id: row.id, ok, routed, world: row.world, text: row.text, tab: c.tab ?? null, session: c.session ?? [], recent: c.recent_worlds ?? [], alt: row.alt_worlds ?? [], source: row.source, synthetic: !!c.synthetic, unseen: row.unseen });
  }
  return out;
}

if (!isMainThread) {
  const env = await makeEnv();
  parentPort.on('message', async (t) => {
    try {
      const result = t.kind === 'world' ? await worldTask(env, t.world, !!t.heldout) : await routingTask(env, t.rows);
      parentPort.postMessage({ idx: t.idx, result });
    } catch (e) { parentPort.postMessage({ idx: t.idx, error: e.stack }); }
  });
  parentPort.postMessage({ ready: true });
}

// ---- main side -----------------------------------------------------------------------------------------------------
async function runPool(tasks, jobs) {
  const results = new Array(tasks.length);
  let next = 0, done = 0;
  await new Promise((res, rej) => {
    if (!tasks.length) return res();
    const workers = [];
    const feed = (w) => { if (next < tasks.length) { const idx = next++; w.postMessage({ ...tasks[idx], idx }); } };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
      workers.push(w);
      w.on('message', (m) => {
        if (m.ready) return feed(w);
        if (m.error) { workers.forEach((x) => x.terminate()); return rej(new Error(m.error)); }
        results[m.idx] = m.result;
        if (++done === tasks.length) { workers.forEach((x) => x.terminate()); res(); } else feed(w);
      });
      w.on('error', rej);
    }
  });
  return results;
}

const pct = (a, n) => (n ? Number((a / n).toFixed(4)) : null);
const add = (a, b) => { for (const k of ['n', 'restricted_ok', 'routed_ok', 'routed_silent']) a[k] = (a[k] ?? 0) + (b[k] ?? 0); return a; };
const finish = (c) => ({ ...c, restricted_acc: pct(c.restricted_ok, c.n), routed_acc: pct(c.routed_ok, c.n) });

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const only = opt('--world', null);
  const hoOnly = args.includes('--heldout');
  const doHeldout = hoOnly || (!args.includes('--no-heldout') && existsSync(HELDOUT));
  const out = resolve(opt('--out', join(REPO, hoOnly ? 'training/results/rules-heldout.json' : 'training/results/rules.json')));
  const failFile = resolve(opt('--failures', join(REPO, 'training/runs/rules-failures.jsonl')));
  const jobs = Number(opt('--jobs', Math.min(cpus().length, 20)));
  const t0 = Date.now();

  // worlds listed in stats.json only: other directories under training/dataset (e.g. multicmd) are not per-world datasets
  const known = Object.keys(JSON.parse(readFileSync(join(DATASET, 'stats.json'), 'utf8')).worlds);
  const worlds = readdirSync(DATASET, { withFileTypes: true }).filter((d) => d.isDirectory() && known.includes(d.name)).map((d) => d.name).sort().filter((w) => !only || w === only);
  if (only && !worlds.length) { console.error(`unknown world ${only}`); process.exit(2); }

  // routing rows: test split; `unseen` = normalized text absent from routing train
  const routingAll = readJsonl(join(DATASET, 'routing.jsonl'));
  const trainTexts = new Set(routingAll.filter((r) => r.split === 'train').map((r) => normText(r.text)));
  const routingTest = routingAll.filter((r) => r.split === 'test' && (!only || r.world === only)).map((r) => ({ ...r, unseen: !trainTexts.has(normText(r.text)) }));

  const tasks = [];
  if (!hoOnly) for (const w of worlds) tasks.push({ kind: 'world', world: w });
  const nWorldTasks = tasks.length;
  const hoWorlds = doHeldout ? worlds.filter((w) => existsSync(join(HELDOUT, `${w}.jsonl`))) : [];
  for (const w of hoWorlds) tasks.push({ kind: 'world', world: w, heldout: true });
  const nHoEnd = tasks.length;
  if (!hoOnly) for (let i = 0; i < routingTest.length; i += CHUNK) tasks.push({ kind: 'routing', rows: routingTest.slice(i, i + CHUNK) });
  const results = await runPool(tasks, jobs);

  // aggregate
  const aggregate = (ws, rs) => {
    const perWorld = {}, perSource = {}, perGroup = {}, total = {};
    const failures = [];
    ws.forEach((w, i) => {
      const { cells, failures: f } = rs[i];
      failures.push(...f);
      const g = groupOf(w);
      for (const [k, c] of Object.entries(cells)) {
        const [source, kind] = k.split('|');
        const slots = [[perWorld, w], [perSource, source], [perGroup, g], [total, 'all']];
        for (const [obj, key] of slots) add(((obj[key] ??= {})[kind] ??= {}), c);
        add((((perWorld[w].by_source ??= {})[source] ??= {})[kind] ??= {}), c);
        add((((perGroup[g].by_source ??= {})[source] ??= {})[kind] ??= {}), c);
      }
    });
    const fin = (o) => {
      for (const v of Object.values(o)) {
        for (const kind of ['pos', 'neg']) if (v[kind]) v[kind] = finish(v[kind]);
        if (v.by_source) for (const s of Object.values(v.by_source)) for (const kind of ['pos', 'neg']) if (s[kind]) s[kind] = finish(s[kind]);
      }
      return o;
    };
    fin(perWorld); fin(perSource); fin(perGroup); fin(total);
    const groups = {};
    for (const g of GROUP_ORDER) if (perGroup[g]) groups[g] = perGroup[g];
    return { perWorld, perSource, groups, total, failures };
  };
  const main_ = hoOnly ? { perWorld: {}, perSource: {}, groups: {}, total: { all: null }, failures: [] } : aggregate(worlds, results.slice(0, nWorldTasks));
  const { perWorld, perSource, groups, total } = main_;
  const failures = main_.failures;
  let heldout = null;
  if (doHeldout) {
    const hr = results.slice(nWorldTasks, nHoEnd);
    const h = aggregate(hoWorlds, hr);
    const excluded = Object.fromEntries(hoWorlds.map((w, i) => [w, hr[i].review_excluded]));
    heldout = {
      source: 'training/paraphrases/heldout/out/*.jsonl (record context and tab, target = expected_circuit); needs_review records excluded',
      needs_review_excluded: { total: Object.values(excluded).reduce((a, b) => a + b, 0), by_world: excluded },
      totals: h.total.all, by_group: h.groups, by_world: h.perWorld,
    };
    failures.push(...h.failures);
  }

  const rrows = results.slice(nHoEnd).flat();
  const rstat = (rows) => ({ n: rows.length, correct: rows.filter((r) => r.ok).length, accuracy: pct(rows.filter((r) => r.ok).length, rows.length), not_parsed: rows.filter((r) => r.routed == null).length });
  const routing = { all: rstat(rrows), unseen_text: rstat(rrows.filter((r) => r.unseen)), seen_text: rstat(rrows.filter((r) => !r.unseen)), real_context: rstat(rrows.filter((r) => !r.synthetic)), by_world: {}, by_group: {}, by_source: {} };
  for (const w of [...new Set(rrows.map((r) => r.world))].sort()) routing.by_world[w] = rstat(rrows.filter((r) => r.world === w));
  for (const g of GROUP_ORDER) { const rs = rrows.filter((r) => groupOf(r.world) === g); if (rs.length) routing.by_group[g] = rstat(rs); }
  for (const s of [...new Set(rrows.map((r) => r.source))].sort()) routing.by_source[s] = rstat(rrows.filter((r) => r.source === s));

  const report = {
    task: 'T2/B1', baseline_commit: 'c989cd1',
    command: 'node scripts/eval-rules.mjs' + (only ? ` --world ${only}` : '') + (hoOnly ? ' --heldout' : doHeldout ? '' : ' --no-heldout'),
    definitions: {
      positive_correct: 'every segment parsed and id-normalized SOP of the produced wires equals the id-normalized target',
      restricted: 'rule formalizer limited to the record world and its imports, fresh session, active tab from the record, context messages first',
      routed: 'dialog session over all worlds with the current rule router, same session setup',
      negative_correct: 'restricted: nothing parsed; routed: no segment matched by the record world or its imports (routed_silent = nothing parsed by any world)',
      routing_correct: 'world of the first parsed segment equals world or is in alt_worlds; unseen = normalized text not in routing train',
    },
    totals: total.all, by_source: perSource, by_group: groups, by_world: perWorld, routing, ...(heldout ? { heldout } : {}),
  };
  if (!args.includes('--no-write')) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    mkdirSync(dirname(failFile), { recursive: true });
    const rf = rrows.filter((r) => !r.ok).map((r) => ({ mode: 'routing', id: r.id, world: r.world, alt_worlds: r.alt, source: r.source, text: r.text, context: r.session, tab: r.tab, recent_worlds: r.recent, target: '', produced: [], routed_world: r.routed, failure_class: r.routed == null ? 'not parsed' : 'wrong world' }));
    writeFileSync(failFile, [...failures, ...rf].map((f) => JSON.stringify(f)).join('\n') + '\n');
  }
  // console summary
  const f = (c) => (c ? `${c.restricted_ok}/${c.n} ${(100 * c.restricted_acc).toFixed(1)}%  |  ${c.routed_ok}/${c.n} ${(100 * c.routed_acc).toFixed(1)}%` : '-');
  if (total.all) {
    console.log(`positives: restricted ${f(total.all.pos)}`);
    console.log(`negatives: restricted ${f(total.all.neg)}`);
  }
  console.log('per world: restricted | routed');
  for (const [w, v] of Object.entries(perWorld)) console.log(`${w.padEnd(18)} pos ${f(v.pos)}   neg ${f(v.neg)}`);
  if (heldout) {
    console.log(`heldout (needs_review excluded: ${heldout.needs_review_excluded.total}): restricted | routed`);
    for (const [w, v] of Object.entries(heldout.by_world)) console.log(`${w.padEnd(18)} pos ${f(v.pos)}`);
    for (const [g, v] of Object.entries(heldout.by_group)) console.log(`group ${g.padEnd(24)} pos ${f(v.pos)}`);
    console.log(`heldout total pos ${f(heldout.totals.pos)}`);
  }
  if (!hoOnly) console.log(`routing: all ${routing.all.correct}/${routing.all.n} (${routing.all.accuracy}), unseen text ${routing.unseen_text.correct}/${routing.unseen_text.n} (${routing.unseen_text.accuracy})`);
  console.error(`wall time ${((Date.now() - t0) / 1000).toFixed(1)} s, ${jobs} workers`);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
