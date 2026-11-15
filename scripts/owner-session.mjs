#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE OWNER'S PHONE SESSION (reviewer 2026-11-15 10:00): replays a checks file in order on the phone settings (the page's shipped settings, Romanian, the on-device translation
 * model, the tab of each turn) and judges every turn by the user's INTENT, written per turn in the checks file. The headline is "turns right of N"; the variants file (sentences of
 * our own per failure class, written before any fix) is reported per class, so nothing is fitted to the owner's sentences.
 *
 *   node scripts/owner-session.mjs [--checks training/eval/owner-2026-11-15T0734-checks.jsonl] [--variants training/eval/owner-2026-11-15T0734-variants.jsonl]
 *        --ort <onnxruntime-node entry> [--bergamot <model cache dir> | PSYS2_BERGAMOT] [--reasoner matrix|ops] [--tag NAME] [--dump]
 *   writes training/results/<name>[-tag].json, <name> = the checks file's name without `-checks.jsonl` (owner-2026-11-15T0734). Every owner session is a headline file of its
 *   own, judged the same way (a Romanian one and, later, an English one: translation faults apart from intent faults): its checks file and, optionally, its variants file.
 *   Without a variants file next to the checks file (<name>-variants.jsonl) only the session is replayed.
 *
 * A checks / variants line: { turn | id, session?, class?, tab, lang, text, intent, expect, seed?, redraw? }. `redraw` (a regex over the visible
 * state) replays the lines up to it with seeds 1, 2, ... until the state matches: the owner's random diagram of turn 1 (the report pipeline: summary, work done, results,
 * problems) is drawn again, so the later turns name the same nodes. `setup` (a list of English requests) replaces `redraw`: the turn is judged on its own draw, then the session goes back
 * to before it and the requests build the owner's state (independent of the random draw and of the catalog version). `seed` on a session's first line fixes its generator. Lines of one `session` are replayed in order in one session (the checks file is one
 * session; a variant line without `session` gets a fresh one). `expect` (all optional; an empty expect is a context turn, replayed and not judged):
 *   world      the world that must act or answer (one of the reply's worlds), or a list of acceptable worlds
 *   tab        the tab after the turn
 *   changed    true: the content of a world must change (src/dialog/honest-done.mjs: not only its log or last act); false: it must not
 *   state / forbid_state   items of scripts/lib/operational-check.mjs ("diagram.sketch:shapes.length=5", "shapes[name=results].y<$+0": went up)
 *   or_reply   a regex: when the reply matches it, `changed` / `state` may fail (the reply says why it could not: "already at the top")
 *   reply_any / reply_not  regexes (case-insensitive) over the shown (Romanian) reply; every reply_any must match
 *   max_ms     the turn must take at most this long (class G)
 * Two invariants hold for EVERY turn (classes B and C): the reply is never withheld (the fixed "no Romanian wording" line), and "done" (Făcut / Gata / Done) is never said when
 * the visible state did not change.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openShipped, sendOptions, REAL_SEED } from './real-set.mjs';
import { visibleState } from './lib/visible-state.mjs';
import { evaluateCase } from './lib/operational-check.mjs';
import { contentChanged } from '../src/dialog/honest-done.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l)) : []);

/** The invariants of every turn (classes B and C). */
export const WITHHELD = /Nu am încă o formulare în română/i;
export const DONE_WORDS = /^(?:\s*)(?:f[aă]cut[aă]?|gata|done|ok,? (?:f[aă]cut|gata))[.!]?\s*$/i;
export function invariantFailures({ shown, content: changed }) {
  const bad = [];
  if (WITHHELD.test(shown)) bad.push('withheld');
  if (!changed && DONE_WORDS.test(shown)) bad.push('false-done');   // `changed`: the CONTENT of a world changed (src/dialog/honest-done.mjs), not only its log
  return bad;
}

export function judge(row, out) {
  const ex = row.expect ?? {};
  const bad = invariantFailures(out);
  const worlds = [].concat(ex.world ?? []);
  if (worlds.length && !worlds.some((w) => out.worlds.includes(w))) bad.push(`world:${worlds.join('|')} got ${out.worlds.join(',') || '-'}`);
  if (ex.tab && out.tabAfter !== ex.tab) bad.push(`tab:${ex.tab} got ${out.tabAfter}`);
  const effect = [];   // what the turn must have done; `or_reply` (a regex) excuses it when the reply says why it could not (a shape already at the edge)
  if (ex.changed === true && !out.content) effect.push('changed');
  if (ex.changed === false && out.content) effect.push('unchanged');
  for (const it of evaluateCase({ world: worlds[0] ?? null, expect: { state: ex.state, forbid_state: ex.forbid_state } }, { before: out.before, after: out.after, replyText: '', effects: [], statuses: [] })) if (!it.ok) effect.push(`${it.kind}:${it.spec}${it.actual !== undefined ? ` (${it.actual})` : ''}`);
  if (!(effect.length && ex.or_reply && new RegExp(ex.or_reply, 'i').test(out.shown))) bad.push(...effect);
  for (const re of [].concat(ex.reply_any ?? [])) if (!new RegExp(re, 'i').test(out.shown)) bad.push(`reply_any:${re}`);
  for (const re of [].concat(ex.reply_not ?? [])) if (new RegExp(re, 'i').test(out.shown)) bad.push(`reply_not:${re}`);
  if (ex.max_ms && out.ms > ex.max_ms) bad.push(`ms:${out.ms}>${ex.max_ms}`);
  return bad;
}

const TAB_WORLD = { draw: 'art.draw', music: 'media.music', diagram: 'diagram.sketch', map: 'geo.map', charts: 'data.charts', editor: 'docs.editor' };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
/** Class G: the turn times of a set of rows (median, p90, max in ms). */
const timing = (rows) => { const s = rows.map((x) => x.ms).sort((a, b) => a - b); return s.length ? { median: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], max: s.at(-1) } : null; };

/** The stage times of a turn (reply.perf, src/formalizer/perf.mjs) over 5 ms, slowest first, and its busiest budget sites: where a slow turn spends its time. */
const stagesOf = (p) => (p ? { total: p.total, stages: Object.fromEntries(Object.entries(p.stages ?? {}).filter(([, v]) => v.ms >= 1 || v.n > 0).sort((a, b) => b[1].ms - a[1].ms).map(([k, v]) => [k, `${v.n}x ${v.ms}`])), ticks: p.ticks ? Object.fromEntries(Object.entries(p.ticks.sites ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6)) : undefined } : null);

async function main() {
  const checksFile = resolve(arg('checks', join(REPO, 'training/eval/owner-2026-11-15T0734-checks.jsonl')));
  const name = arg('name', checksFile.split('/').pop().replace(/-checks\.jsonl$/, '').replace(/\.jsonl$/, ''));
  const variantsFile = resolve(arg('variants', /-checks\.jsonl$/.test(checksFile) ? checksFile.replace(/-checks\.jsonl$/, '-variants.jsonl') : '/nonexistent'));
  const reasoner = arg('reasoner', 'matrix'), tag = arg('tag', ''), dump = process.argv.includes('--dump');
  const ortPath = arg('ort', process.env.PSYS2_ORT ?? null), bergamot = arg('bergamot', process.env.PSYS2_BERGAMOT ?? null);
  const { engine, settings, mt, keepFor } = await openShipped({ reasoner, mode: ortPath ? 'shipped' : 'rules', ortPath, bergamot });
  const { sessionOptions } = await import('../src/dialog/runtime-config.mjs');
  const { createBudget } = await import('../src/dialog/budget.mjs');
  const checks = jl(checksFile).map((r) => ({ ...r, set: 'session', session: r.session ?? 'owner' }));
  const variants = jl(variantsFile).map((r, i) => ({ ...r, set: 'variant', session: r.session ? `v:${r.session}` : `v#${i}` }));
  const sessions = new Map();
  for (const r of [...checks, ...variants]) (sessions.get(r.session) ?? sessions.set(r.session, []).get(r.session)).push(r);
  const rows = [];
  let seedN = REAL_SEED;
  const realRandom = Math.random;
  const seeded = (a0) => { let a = a0 >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const newSession = () => { const s = engine.createSession(sessionOptions(settings, { language: 'ro' })); s.fastPath = settings.fastPath === true; keepFor.session = s; return s; };
  const play = async (s, r) => {
    if (r.tab) s.setWorldState('ui.shell', { activeTab: r.tab });
    // OWNER_PROBE=<turn> OWNER_PROBE_TEXTS=<json file of English sentences>: before that turn, each sentence is sent in English and undone (what the open world makes of a rewording)
    if (process.env.OWNER_PROBE && process.env.OWNER_PROBE.split(',').includes(String(r.turn ?? r.id))) {
      for (const e of JSON.parse(readFileSync(process.env.OWNER_PROBE_TEXTS, 'utf8'))) {
        const snap = s.snapshot();
        const u = await s._understands(e);
        let rep = null; try { rep = await s.send(e, sendOptions(settings, { lang: 'en', language: 'en' }, createBudget())); } catch (err) { rep = { text: `error ${err.message}` }; }
        console.error(`PROBE T${r.turn ?? r.id} issues=${u.issues} ${JSON.stringify(e)}\n   -> ${String(rep?.text ?? '').slice(0, 300)} ${JSON.stringify(rep?.statuses ?? [])} ${JSON.stringify((rep?.trace?.segments ?? []).map((x) => x.text))}`);
        s.restore(snap);
      }
    }
    const before = s.state(), t0 = performance.now();
    const setupSnap = r.setup ? s.snapshot() : null;
    let reply = null, error = null;
    try { reply = await s.send(r.text, sendOptions(settings, { lang: r.lang ?? 'ro' }, createBudget())); } catch (e) { error = e.message; }
    const ms = Math.round(performance.now() - t0);
    if (process.env.OWNER_TRACE && process.env.OWNER_TRACE.split(",").includes(String(r.turn ?? r.id))) console.error(JSON.stringify({ text: reply?.text, statuses: reply?.statuses, parts: reply?.parts, trace: { ...reply?.trace, budget: undefined } }, null, 1).slice(0, Number(process.env.OWNER_TRACE_MAX ?? 12000)));
    const after = s.state();
    // `setup`: the turn is judged on its own result; then the session goes back to before it and the owner's state is built by plain English requests (independent of any random
    // draw or catalog version: the later turns name the owner's things), unjudged
    if (r.setup) { s.restore(setupSnap); for (const e of r.setup) { try { await s.send(e, sendOptions(settings, { lang: 'en', language: 'en' }, createBudget())); } catch { /* the next lines say what is missing */ } } }
    if (process.env.OWNER_STATE && String(r.turn ?? r.id) === process.env.OWNER_STATE) console.error(JSON.stringify(after[TAB_WORLD[r.tab]] ?? null).slice(0, 6000));
    const changed = JSON.stringify(visibleState(before)) !== JSON.stringify(visibleState(after));
    const content = contentChanged(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, JSON.stringify(v)])), after);
    return { r, error, out: { before, after, changed, content, ms, shown: reply?.text ?? '', english: reply?.trace?.replyEnglish ?? '', worlds: [...new Set((reply?.segments ?? []).map((x) => x.world ?? x.match?.worldId).filter(Boolean))], tabAfter: after['ui.shell']?.activeTab ?? null, perf: reply?.perf ?? null } };
  };
  for (const [key, turns] of sessions) {
    // `redraw`: a regex over the visible state after that line; the lines up to it are replayed with seeds 1, 2, ... in fresh sessions until the state matches (the owner's own
    // random draw, so the later turns name the same things). Otherwise the session's seed is fixed by its key (or `seed`).
    const cut = turns.findIndex((r) => r.redraw);
    let s = null, played = [];
    if (cut >= 0) {
      const re = new RegExp(turns[cut].redraw, 'i');
      for (let seed = 1; seed <= 400 && !s; seed++) {
        Math.random = seeded(seed);
        const t = newSession(), p = [];
        for (const r of turns.slice(0, cut + 1)) p.push(await play(t, r));
        if (re.test(JSON.stringify(visibleState(t.state())))) { s = t; played = p; }
      }
      if (!s) throw new Error(`redraw: no seed in 1..400 draws ${turns[cut].redraw}`);
    } else {
      Math.random = seeded(turns[0].seed ?? (seedN++ ^ [...key].reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619), 2166136261)));
      s = newSession();
    }
    for (const r of turns.slice(played.length)) played.push(await play(s, r));
    for (const { r, error, out } of played) {
      const { after, before, ms } = out;
      const judged = r.expect && Object.keys(r.expect).length > 0;
      const bad = error ? [`error:${error}`] : judge(r, out);
      const row = { set: r.set, context: !!r.context, id: r.turn ?? r.id, class: r.class ?? null, text: r.text, tab: r.tab, ms, judged, right: judged ? bad.length === 0 : null, invariant: invariantFailures(out), failing: bad, worlds: out.worlds, tabAfter: out.tabAfter, changed: out.changed, content: out.content, reply: out.shown.slice(0, 240), english: out.english.slice(0, 240), stages: stagesOf(out.perf) };
      rows.push(row);
      if (dump) {
        const ch = Object.keys(after).filter((w) => JSON.stringify(visibleState({ [w]: before[w] })) !== JSON.stringify(visibleState({ [w]: after[w] })));
        console.log(`${row.set === 'session' ? 'T' : 'V'}${row.id} [${r.tab}] ${r.text}\n   -> ${row.right === null ? '·' : row.right ? 'RIGHT' : 'WRONG'} ${ms}ms worlds=${out.worlds.join(',')} tab=${out.tabAfter} changed=${ch.join(',')}\n   ro: ${row.reply.slice(0, 200)}\n   en: ${row.english.slice(0, 200)}${bad.length ? `\n   failing: ${bad.join(' ; ')}` : ''}`);
      }
    }
  }
  Math.random = realRandom;
  mt?.reset?.();
  const sess = rows.filter((x) => x.set === 'session' && x.judged), vars = rows.filter((x) => x.set === 'variant' && x.judged);
  const byClass = {};
  for (const v of vars) { const c = (byClass[v.class ?? '?'] ??= { right: 0, total: 0 }); c.total++; if (v.right) c.right++; }
  for (const [k, c] of Object.entries(byClass)) c.ms = timing(rows.filter((x) => x.set === 'variant' && !x.context && (x.class ?? '?') === k));
  const summary = {
    session: { right: sess.filter((x) => x.right).length, total: sess.length, medianMs: median(rows.filter((x) => x.set === 'session' && !x.context).map((x) => x.ms)), withheld: rows.filter((x) => x.set === 'session' && x.invariant.includes('withheld')).length, falseDone: rows.filter((x) => x.set === 'session' && x.invariant.includes('false-done')).length, ms: timing(rows.filter((x) => x.set === 'session' && !x.context)) },
    variants: { right: vars.filter((x) => x.right).length, total: vars.length, byClass, medianMs: median(rows.filter((x) => x.set === 'variant' && !x.context).map((x) => x.ms)), ms: timing(rows.filter((x) => x.set === 'variant' && !x.context)) },
  };
  const file = join(REPO, `training/results/${name}${tag ? `-${tag}` : ''}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ date: new Date().toISOString(), reasoner, mt: !!mt, encoder: !!ortPath, summary, rows }, null, 1)}\n`);
  console.log(JSON.stringify(summary));
  console.log(`wrote ${file}`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
