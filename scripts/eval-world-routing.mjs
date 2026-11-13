#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * WORLD-OF-WORLDS experiment (spec 20): which world takes a message, by three routers.
 *   A  today: the encoder's world head (top 3) validated by the rules (the dispatcher validator, shipped policy)
 *   B  symbolic only: meta.worlds (cards + live facts + rules with reasons), the encoder off
 *   C  symbolic with the encoder as one prior (weight 30 points; never over a block)
 * Sets: operational, dialogues (each turn), minimal pairs, knowledge lookup, the owner's log, and a seeded wrong-tab set (canonical requests of every world said on
 * another tab, plus fragments after a turn said on another tab). Measured per message: right world / wrong world / asked (no world taken) and the time.
 *
 *   node scripts/eval-world-routing.mjs build  --dir <dir>                      writes <dir>/inputs.json (items with live facts) and <dir>/enc-in.jsonl
 *   <python> -m psys2_train.world_scores --ckpt <ckpt> --inp <dir>/enc-in.jsonl --out <dir>/enc-out.jsonl     (GPU; through the global lock)
 *   node scripts/eval-world-routing.mjs run    --dir <dir> [--out training/results/world-routing-2026-11-13.json] [--no-validator]
 * The encoder gets the context the dispatcher is trained with (tab, recent worlds, the earlier messages of the session). Gold is the world of the case.
 * The hold-out test masks one world's encoder output (probability 0, renormalised) without retraining, and routes with B and C; B never reads the encoder.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions, policyFromSettings, runtimeSettings } from '../src/dialog/runtime-config.mjs';
import { createDispatchValidator, normalizePrediction } from '../src/dialog/dispatch-validate.mjs';
import { loadMetaWorlds, liveFromContext, messageWords } from '../src/dialog/meta-worlds.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const L = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const HOLDOUT = ['art.draw', 'diagram.sketch', 'geo.map', 'games.chess'];
const ENCODER_CKPT_NOTE = 'training/runs/dispatcher-v5s2-c3265 (21 worlds incl. diagram.sketch; none of talk, user.profile)';

async function makeEngine() {
  return createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
}
const rulesSession = (engine, tab) => {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const snap = (s, texts, tab) => {
  const ctx = s.context();
  return { tab, recent_worlds: ctx.recentWorlds, session: texts.slice(-6), live: liveFromContext(ctx, { sceneKeys: ['thing', 'kind', 'name'] }) };
};

// ---------------------------------------------------------------- the sets
async function build(dir) {
  const engine = await makeEngine();
  const vocab = JSON.parse(readFileSync(join(REPO, 'knowledge/k.objects/vocab.json'), 'utf8'));
  const items = [];
  const add = (set, id, text, gold, ctx, extra = {}) => items.push({ set, id, text, gold, ...ctx, catalog: messageWords(text).tokens.filter((t) => vocab[t] || vocab[t.replace(/s$/, '')]), ...extra });
  // operational + minimal pairs + knowledge lookup: one session per case, the setup messages first
  const single = async (set, rows, get) => {
    for (const c of rows) {
      const g = get(c);
      const s = rulesSession(engine, g.tab);
      for (const m of g.setup ?? []) { try { await s.send(m); } catch { /* the replay of a setup that fails is part of the case */ } }
      add(set, g.id, g.message, { world: g.world }, snap(s, g.setup ?? [], g.tab ?? null));
    }
  };
  // messages that span several worlds (multi, world-switch, triple) have no one world: the dispatcher segments them; they are left out of this world-level comparison
  const SPANS = new Set(['multi', 'world-switch', 'triple']);
  await single('operational', L('training/eval/operational.jsonl').filter((c) => !c.families.some((f) => SPANS.has(f))), (c) => c);
  await single('minimal-pairs', L('training/eval/minimal-pairs-2026-11-12.jsonl'), (c) => c);
  // (the 80 knowledge questions are answered by the conversation composite today: their world is Talk, the world that takes them since spec 18)
  await single('knowledge', L('training/eval/knowledge-lookup-2026-11-13.jsonl').filter((c) => c.world), (c) => ({ id: c.id, message: c.message, world: c.world === 'conversation' ? 'talk' : c.world, tab: engine.set.get(c.tab)?.tab?.id ?? c.tab ?? null, setup: [] }));
  // dialogues: each turn, the session replayed to that point
  const frags = [];
  for (const d of L('training/eval/dialogues.jsonl')) {
    const s = rulesSession(engine, d.tab);
    const said = [];
    for (const [k, t] of d.turns.entries()) {
      const ctx = snap(s, said, d.tab ?? null);
      add('dialogues', `${d.id}#${k}`, t.message, { world: d.world }, ctx);
      if (k >= 1 && messageWords(t.message).tokens.length <= 5) frags.push({ d, k, said: [...said], ctx });
      try { await s.send(t.message); } catch { /* keep going */ }
      said.push(t.message);
    }
  }
  // owner's log: the replay the owner's browser did (rules translation first), in the tab it was typed in
  {
    const rows = L('training/eval/owner-log-2026-11-13.jsonl');
    const chk = JSON.parse(readFileSync(join(REPO, 'training/eval/owner-log-checks.json'), 'utf8'));
    let s = null, day = null; const said = [];
    for (const [i, r] of rows.entries()) {
      if (!s || r.time.slice(0, 10) !== day) { s = rulesSession(engine, null); said.length = 0; }
      day = r.time.slice(0, 10);
      s.setWorldState('ui.shell', { activeTab: r.tab });
      const ctx = snap(s, said, r.tab);
      let english = r.text;
      try { const rep = await s.send(r.text, r.lang === 'ro' ? { language: 'ro' } : undefined); english = rep.trace?.english ?? r.text; said.push(english); } catch { /* keep the text */ }
      const c = chk[i];
      const gold = c?.world ? { world: c.world } : c?.world_not ? { not: [].concat(c.world_not) } : null;
      if (gold) add('owner-log', `owner#${i}`, english, gold, ctx);
    }
  }
  // wrong-tab: canonical requests of every world said on another tab (seeded), then fragments after a turn said on another tab
  {
    const R = rng(20261113);
    const worlds = engine.set.list().filter((w) => w.patterns?.length && !['kids.common', 'meta.worlds'].includes(w.id));
    const tabs = engine.set.list().filter((w) => w.tab).map((w) => w.tab.id).concat(['robot', 'editor', 'tictactoe', 'guess', 'hangman']);
    const ownTab = (w) => w.tab?.id ?? ({ 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' })[w.id] ?? null;
    const per = Math.floor(160 / worlds.length), extra = 160 - per * worlds.length;
    let n = 0;
    for (const [wi, w] of worlds.entries()) {
      const canon = [...new Set(w.patterns.flatMap((p) => p.canonical ?? []))].filter((x) => x.length < 90);
      for (let i = canon.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [canon[i], canon[j]] = [canon[j], canon[i]]; }
      for (const text of canon.slice(0, per + (wi < extra ? 1 : 0))) {
        const others = tabs.filter((t) => t !== ownTab(w));
        const tab = others[Math.floor(R() * others.length)];
        add('wrong-tab', `wt#${n++}`, text, { world: w.id }, snap(rulesSession(engine, tab), [], tab));
      }
    }
    for (let i = frags.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [frags[i], frags[j]] = [frags[j], frags[i]]; }
    let f = 0;
    for (const { d, k, said } of frags.slice(0, 40)) {
      const w = engine.set.get(d.world);
      const others = tabs.filter((t) => t !== ownTab(w));
      const tab = others[Math.floor(R() * others.length)];
      const s = rulesSession(engine, d.tab);
      for (const m of said) { try { await s.send(m); } catch { /* keep going */ } }
      s.setWorldState('ui.shell', { activeTab: tab });
      add('wrong-tab', `wtf#${f++}`, d.turns[k].message, { world: d.world }, snap(s, said, tab), { fragment: true });
    }
    // the same on operational messages (not canonical: the cards come from the canonical examples), 200 seeded
    const ops = L('training/eval/operational.jsonl').filter((c) => !c.setup.length && c.world !== 'ui.shell' && !c.families.some((f) => SPANS.has(f)));
    for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
    for (const c of ops.slice(0, 200)) {
      const w = engine.set.get(c.world);
      const others = tabs.filter((t) => t !== ownTab(w));
      const tab = others[Math.floor(R() * others.length)];
      add('wrong-tab-ops', `wto#${c.id}`, c.message, { world: c.world }, snap(rulesSession(engine, tab), [], tab));
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inputs.json'), JSON.stringify(items));
  writeFileSync(join(dir, 'enc-in.jsonl'), items.map((x, i) => JSON.stringify({ id: String(i), text: x.text, context: { tab: x.tab, recent_worlds: x.recent_worlds, session: x.session } })).join('\n') + '\n');
  const by = {}; for (const x of items) by[x.set] = (by[x.set] ?? 0) + 1;
  console.log('items', items.length, by);
}

// ---------------------------------------------------------------- the routers
const norm = (p, mask) => { if (!p) return null; const q = { ...p }; for (const m of mask) delete q[m]; const t = Object.values(q).reduce((a, b) => a + b, 0) || 1; for (const k of Object.keys(q)) q[k] /= t; return q; };
const top3 = (p) => Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([world, score]) => ({ world, score }));
const verdict = (gold, world) => (world == null ? 'asked' : gold.world ? (world === gold.world ? 'right' : 'wrong') : gold.not.includes(world) ? 'wrong' : 'right');

async function run(dir, out) {
  const engine = await makeEngine();
  const mw = await loadMetaWorlds(engine.set);
  const items = JSON.parse(readFileSync(join(dir, 'inputs.json'), 'utf8'));
  const enc = new Map(readFileSync(join(dir, 'enc-out.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r.p]));
  const reuse = arg('reuse-a') ? JSON.parse(readFileSync(resolve(arg('reuse-a')), 'utf8')) : null;   // the A column of an earlier run of the same inputs (the validator is the slow part)
  const weights = (arg('prior-weights', '') || '').split(',').filter(Boolean).map(Number);
  const validator = flag('no-validator') || reuse ? null : createDispatchValidator({ engine, policy: policyFromSettings(runtimeSettings()) });
  const noTalk = new Set(mw.worlds.filter((w) => w !== 'talk'));
  const rows = [];
  for (const [i, x] of items.entries()) {
    const p = enc.get(String(i)) ?? null;
    const base = { text: x.text, live: x.live, catalog: x.catalog, fragment: x.fragment ? true : undefined };
    const r = { i, set: x.set, id: x.id, gold: x.gold, text: x.text };
    const time = (f) => { const t = performance.now(); const v = f(); return [v, performance.now() - t]; };
    // A: the encoder's top 3 validated by the rules; not validated = asked
    if (validator) {
      const t = performance.now();
      let world = null, why = null;
      try {
        validator.clearCache();
        const pred = normalizePrediction({ id: String(i), text: x.text, context: { tab: x.tab, recent_worlds: x.recent_worlds, session: x.session }, segmentations: [{ score: 0, segments: [{ start: 0, end: x.text.length, text: x.text, worlds: top3(p) }] }] });
        const v = await validator.validate(pred, policyFromSettings(runtimeSettings()));
        const win = v.trace.segmentations[v.trace.winnerIndex ?? 0];
        world = win?.pieces?.every((q) => q.valid) ? win.pieces[0].chosen?.world ?? null : null;
        why = v.status;
      } catch (e) { why = `error ${e.message?.slice(0, 40)}`; }
      r.A = { world, v: verdict(x.gold, world), ms: performance.now() - t, why };
    }
    if (reuse && reuse[i]?.A) r.A = reuse[i].A;
    // A without validation: the encoder's top-1 (reference)
    const a1 = p ? top3(p)[0].world : null;
    r.A1 = { world: a1, v: verdict(x.gold, a1) };
    const dec = (args, keep) => { const [d, ms] = time(() => mw.decide({ ...base, ...args, keep })); return { world: d.world, v: verdict(x.gold, d.world), ms, top: d.top, asked: d.asked, why: d.ranked[0]?.reasons.slice(0, 2).map((y) => y.say).join('; ') ?? null }; };
    r.B = dec({}); r.C = dec({ prior: norm(p, []) });
    r.Bt = dec({}, noTalk); r.Ct = dec({ prior: norm(p, []) }, noTalk);   // without the talk card
    r.sweep = {};
    for (const wt of weights) r.sweep[wt] = dec({ prior: norm(p, []), weight: wt }, noTalk);
    r.holdout = {};
    for (const h of HOLDOUT) { r.holdout[h] = { C: dec({ prior: norm(p, [h]) }, noTalk) }; if (weights.length) r.holdout[h].light = dec({ prior: norm(p, [h]), weight: 15 }, noTalk);  }   // (a lighter prior, 15 points, for the hold-out)
    rows.push(r);
  }
  writeFileSync(join(dir, 'rows.json'), JSON.stringify(rows));
  report(rows, out);
}

const pct = (n, d) => (d ? Math.round(1000 * n / d) / 10 : 0);
const tally = (rs, k) => { const t = { n: rs.length, right: 0, wrong: 0, asked: 0, ms: 0 }; for (const r of rs) { const v = r[k]; if (!v) continue; t[v.v]++; t.ms += v.ms ?? 0; } return t; };
function report(rows, out) {
  const sets = [...new Set(rows.map((r) => r.set))];
  const lines = [];
  const fmt = (t) => `${String(t.right).padStart(5)} ${String(t.wrong).padStart(5)} ${String(t.asked).padStart(5)}  ${pct(t.right, t.n).toFixed(1).padStart(5)}%`;
  const res = { encoder: ENCODER_CKPT_NOTE, sets: {}, holdout: {}, talk: {} };
  lines.push('set'.padEnd(16) + 'n'.padStart(5) + '  | A right wrong asked  | A1 (top-1 only) | B right wrong asked | C right wrong asked   | ms/msg A B C');
  const all = [...sets.map((s) => [s, rows.filter((r) => r.set === s)]), ['ALL', rows]];
  for (const [s, rs] of all) {
    const A = tally(rs, 'A'), A1 = tally(rs, 'A1'), B = tally(rs, 'B'), C = tally(rs, 'C');
    res.sets[s] = { n: rs.length, A, A1, B, C, Bt: tally(rs, 'Bt'), Ct: tally(rs, 'Ct') };
    lines.push(`${s.padEnd(16)}${String(rs.length).padStart(5)}  | ${fmt(A)} | ${fmt(A1)} | ${fmt(B)} | ${fmt(C)} | ${(A.ms / rs.length).toFixed(1)} ${(B.ms / rs.length).toFixed(2)} ${(C.ms / rs.length).toFixed(2)}`);
  }
  lines.push('', 'hold-out (the encoder never saw the world: its probability masked, no retraining); rows = the held-out world\'s own messages and all messages');
  for (const h of HOLDOUT) {
    const own = rows.filter((r) => r.gold.world === h); own.n = own.length; const tn = (rs, f) => { const t = { n: rs.length, right: 0 }; for (const r of rs) if (f(r).v === 'right') t.right++; return t; };
    const o = { A_trained: tn(own, (r) => r.A ?? r.A1), C_trained: tn(own, (r) => r.Ct), C_masked: tn(own, (r) => r.holdout[h].C), B: tn(own, (r) => r.Bt) };
    const a = { A_trained: tn(rows, (r) => r.A ?? r.A1), C_trained: tn(rows, (r) => r.Ct), C_masked: tn(rows, (r) => r.holdout[h].C), B: tn(rows, (r) => r.Bt) };
    res.holdout[h] = { own: o, all: a };
    lines.push(`${h}: own n=${own.n}  A ${pct(o.A_trained.right, own.n)}  C ${pct(o.C_trained.right, own.n)}  C masked ${pct(o.C_masked.right, own.n)}  B ${pct(o.B.right, own.n)}   | all n=${rows.length}  A ${pct(a.A_trained.right, rows.length)}  C ${pct(a.C_trained.right, rows.length)}  C masked ${pct(a.C_masked.right, rows.length)}  B ${pct(a.B.right, rows.length)}`);
  }
  if (rows[0]?.sweep) {
    lines.push('', 'prior weight sweep (C, right %): the prior is weight x probability, in points');
    const ws = Object.keys(rows[0].sweep);
    lines.push('set'.padEnd(16) + ws.map((w) => `w=${w}`.padStart(8)).join(''));
    res.sweep = {};
    for (const [s, rs] of all) { res.sweep[s] = Object.fromEntries(ws.map((w) => [w, pct(rs.filter((r) => r.sweep[w].v === 'right').length, rs.length)])); lines.push(s.padEnd(16) + ws.map((w) => String(res.sweep[s][w]).padStart(8)).join('')); }
    lines.push('hold-out, own messages, right %: C masked at 30 points / at 15 points');
    for (const h of HOLDOUT) { const own = rows.filter((r) => r.gold.world === h); res.holdout[h].light = pct(own.filter((r) => (r.holdout[h].light ?? r.holdout[h].C).v === 'right').length, own.length); lines.push(`${h}: ${pct(res.holdout[h].own.C_masked.right, own.length)} / ${res.holdout[h].light}`); }
  }
  const talk = rows.filter((r) => r.gold.world === 'talk');
  // what a card costs the worlds that have none of its messages: the same sets with and without the talk card
  res.talkCost = Object.fromEntries(sets.map((s) => { const rs = rows.filter((r) => r.set === s && r.gold.world !== 'talk'); const n = (k) => rs.filter((r) => r[k].v === 'right').length; return [s, { n: rs.length, B_with: n('B'), B_without: n('Bt'), C_with: n('C'), C_without: n('Ct') }]; }));
  lines.push('', 'talk card cost (messages of other worlds only; right with the card / without it): ' + Object.entries(res.talkCost).map(([s, v]) => `${s} B ${v.B_with}/${v.B_without} C ${v.C_with}/${v.C_without}`).join('; '));
  res.talk = { n: talk.length, A: tally(talk, 'A'), B: tally(talk, 'B'), C: tally(talk, 'C') };
  lines.push('', `talk (no training): n=${talk.length} messages whose world is talk; A right ${res.talk.A.right}, B right ${res.talk.B.right}, C right ${res.talk.C.right}`);
  const conf = {};
  for (const r of rows) { if (r.B.v === 'wrong') { const k = `${r.gold.world ?? 'not ' + r.gold.not} -> ${r.B.world}`; conf[k] = (conf[k] ?? 0) + 1; } }
  res.confusionB = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(lines.join('\n'));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(res, null, 1)); console.log('wrote', out); }
}

const dir = resolve(arg('dir', join(REPO, 'training/runs/world-routing')));
if (process.argv[2] === 'build') await build(dir);
else if (process.argv[2] === 'run') await run(dir, arg('out') ? resolve(arg('out')) : null);
else if (process.argv[2] === 'report') report(JSON.parse(readFileSync(join(dir, 'rows.json'), 'utf8')), arg('out') ? resolve(arg('out')) : null);
else console.error('usage: node scripts/eval-world-routing.mjs build|run|report --dir <dir>');
