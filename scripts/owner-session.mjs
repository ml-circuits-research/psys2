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
 *   INTENT over the things of a world (reviewer 2026-11-16 11:30; selectors `duck`, `lake|pond`, `*`, `bird[color=yellow]`; kind = a thing's kind, thing or name; `W:` = world):
 *   count      ["W:SEL OP N" | "W:SEL OP $+N"]   how many such things (N more than before)
 *   delta      ["W:SEL.FIELD OP"]                every such thing's field after OP before ("house.y>": went down; "flower.color|parts!=")
 *   only       ["W:SEL"]                         nothing but SEL changed, appeared or disappeared
 *   unchanged  ["W"]                             the world's things did not change (a request for another domain)
 *   same       ["W:path"]                        the value at path is the same before and after (the preset when only the expression is asked)
 *   rel / forbid_rel  ["W:SEL REL[_all] SEL"]    place relation (in on over near above below left_of right_of amid) to some / every B; forbid: to none
 *   layout     ["W:SEL ring|row|column"]; spread (no two things on each other); differs (most kinds differ from before: "altceva"); kinds ["W:new|all>=N"]
 *   either     [expect, ...]                     one of the alternatives holds
 *   reply_clean  no internal names (water_lily, the role "target"), and in a Romanian reply no English fragment (a quote the user did not write, an English
 *              function word, a word of the English reply left untranslated)
 *   partly     (on the line, beside expect) a weaker real intent: right when it holds and the content changed
 * Every judged turn also fails when the reply says "nothing changed" while the content changed.
 *   max_ms     the turn must take at most this long (class G)
 * Two invariants hold for EVERY turn (classes B and C): the reply is never withheld (the fixed "no Romanian wording" line), and "done" (Făcut / Gata / Done) is never said when
 * the visible state did not change.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openShipped, sendOptions, REAL_SEED } from './real-set.mjs';
import { visibleState } from './lib/visible-state.mjs';
import { evaluateCase, statePath } from './lib/operational-check.mjs';
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

/** A reply that says something was done (en / ro). With no content change it is a false "done" (reviewer 2026-11-16 10:20 item 1). */
export const CLAIMS_CHANGE = /\b(?:I (?:added|moved|made|changed|put|removed|drew|took|swapped|wrote|arranged|coloured|colored)|(?:is|are|look|looks) [^.]*\bnow\b|now (?:I|the)\b|(?<!\bnu )Am (?:ad[aă]ugat|mutat|pus|f[aă]cut|schimbat|desenat|scos|[sș]ters|aranjat|colorat|scris))|\bAcum\b|\bacum\.?$/i;
/** right | partly | honest | wrong of a judged turn: right = the expectation holds; partly = the row's weaker `partly` expectation holds; honest = nothing changed and the reply
 *  claims nothing (a refusal, a question, an explanation); wrong = everything else (a wrong change, or a false "done"). */
export function verdictOf(row, out, bad) {
  if (!bad.length) return 'right';
  if (out.content && row.partly && !judge({ ...row, expect: row.partly }, out).length) return 'partly';
  if (!out.content && !CLAIMS_CHANGE.test(out.shown) && !CLAIMS_CHANGE.test(out.english ?? '')) return 'honest';
  return 'wrong';
}

// ---- intent assertions over the THINGS of a world (reviewer 2026-11-16 11:30): generic over every world that keeps a list of things with a kind and a place (Drawing's
// objects, Diagram's shapes, ...); no per-turn code. A selector names things: `duck`, `lake|pond|water` (any of), `*` (all), with optional filters `bird[color=yellow]`;
// a kind matches a thing's `kind`, `thing` (a composite drawing) or `name` (a named node), case-insensitive, `_` = space. `W:` prefixes the world (default: the row's world,
// else the tab's world).
const THING_LISTS = ['objects', 'shapes', 'things', 'items', 'blocks'];
export const thingsOf = (ws) => { for (const k of THING_LISTS) if (Array.isArray(ws?.[k])) return ws[k]; return []; };
const low = (x) => String(x ?? '').toLowerCase().replace(/_/g, ' ').trim();
const kindsOf = (t) => [t.kind, t.thing, t.name].filter((x) => x !== undefined && x !== null && x !== '').map(low);
function parseSel(sel) {
  const m = String(sel).trim().match(/^([^[]+?)(?:\[([^\]]*)\])?$/);
  const kinds = m ? m[1].split('|').map(low) : [low(sel)];
  const filters = m?.[2] ? m[2].split(',').map((f) => f.split('=').map((x) => x.trim())) : [];
  return (t) => (kinds.includes('*') || kindsOf(t).some((k) => kinds.includes(k))) && filters.every(([k, v]) => low(t[k]) === low(v));
}
const splitWorld = (spec, dflt) => { const m = String(spec).match(/^([a-z]\w*\.[\w.]*):(.*)$/); return m ? [m[1], m[2].trim()] : [dflt, String(spec).trim()]; };
const cmp = (a, op, b) => (op === '=' ? a === b : op === '!=' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b);
/** Geometry of a thing: centre and half extent (x, y = centre; size = extent, as Drawing and Diagram keep them). */
const geo = (t) => ({ x: Number(t.x), y: Number(t.y), h: Number(t.size ?? Math.max(t.w ?? 0, t.h ?? 0) ?? 0) / 2 });
/** A place relation of A to B: in / on / over (A's centre inside B's extent), near (the extents nearly touch), above / below / left_of / right_of (by centre). */
export function related(a, rel, b) {
  const A = geo(a), B = geo(b);
  if ([A.x, A.y, B.x, B.y].some(Number.isNaN)) return false;
  const dx = A.x - B.x, dy = A.y - B.y;
  if (rel === 'in' || rel === 'on' || rel === 'over' || rel === 'inside') return Math.abs(dx) <= B.h && Math.abs(dy) <= B.h;
  if (rel === 'near') return Math.hypot(dx, dy) <= A.h + B.h + 60;
  if (rel === 'above') return dy < 0;
  if (rel === 'below') return dy > 0;
  if (rel === 'left_of') return dx < 0;
  if (rel === 'right_of') return dx > 0;
  throw new Error(`relation ${rel}`);
}
const strip = (t) => JSON.stringify(Object.fromEntries(Object.entries(t ?? {}).filter(([k]) => !/^(?:z|order|seq)$/.test(k))));
const kindSet = (ws) => new Set([...thingsOf(ws).map((t) => low(t.thing ?? t.kind)), ...(ws?.scenes ?? []).map((s) => `scene:${low(s.kind)}`)]);

/** The intent assertions of an `expect` (see the header): a list of failures. */
export function intentFailures(ex, { before, after }, dflt) {
  const bad = [];
  const ws = (st, w) => st?.[w] ?? {};
  for (const spec of [].concat(ex.count ?? [])) {   // "W:SEL OP N" or "W:SEL OP $+N" (N more than before)
    const [w, rest] = splitWorld(spec, dflt);
    const m = rest.match(/^(.+?)\s*(<=|>=|!=|=|<|>)\s*(\$)?([+-]?\d+)$/);
    if (!m) { bad.push(`count:bad spec ${spec}`); continue; }
    const pick = parseSel(m[1]);
    const n0 = thingsOf(ws(before, w)).filter(pick).length, n1 = thingsOf(ws(after, w)).filter(pick).length;
    const want = m[3] ? n0 + Number(m[4]) : Number(m[4]);
    if (!cmp(n1, m[2], want)) bad.push(`count:${spec} (${n0}->${n1})`);
  }
  for (const spec of [].concat(ex.delta ?? [])) {   // "W:SEL.FIELD OP": every such thing present before and after has after OP before ("house.y>": went down); FIELD may be
    // `a|b` (the fields taken together, compared by value: "flower.color|parts!=": their colour changed in either field)
    const [w, rest] = splitWorld(spec, dflt);
    const m = rest.match(/^(.+?)\.([\w|]+)\s*(<=|>=|!=|=|<|>)$/);
    if (!m) { bad.push(`delta:bad spec ${spec}`); continue; }
    const pick = parseSel(m[1]), fields = m[2].split('|');
    const val = (t) => (fields.length === 1 && typeof t[fields[0]] === 'number' ? t[fields[0]] : JSON.stringify(fields.map((f) => t[f] ?? null)));
    const pre = new Map(thingsOf(ws(before, w)).filter(pick).map((t) => [t.id, t]));
    const pairs = thingsOf(ws(after, w)).filter((t) => pick(t) && pre.has(t.id)).map((t) => [val(pre.get(t.id)), val(t)]);
    const fails = pairs.filter(([a, b]) => !cmp(b, m[3], a));
    if (!pairs.length || fails.length) bad.push(`delta:${spec} (${pairs.length ? pairs.map(([a, b]) => `${a}->${b}`).join(' ').slice(0, 160) : 'none'})`);
  }
  for (const spec of [].concat(ex.only ?? [])) {   // "W:SEL": nothing else changed, appeared or disappeared (what must NOT change when the sentence names one thing); a thing
    // that matches SEL before or after (a bird that turned from green to yellow) is the named one
    const [w, sel] = splitWorld(spec, dflt);
    const pick = parseSel(sel), b0 = thingsOf(ws(before, w)), a0 = thingsOf(ws(after, w));
    const named = new Set([...b0, ...a0].filter(pick).map((t) => t.id));
    const pre = new Map(b0.filter((t) => !named.has(t.id)).map((t) => [t.id, strip(t)]));
    const post = new Map(a0.filter((t) => !named.has(t.id)).map((t) => [t.id, strip(t)]));
    const moved = [...new Set([...pre.keys(), ...post.keys()])].filter((id) => pre.get(id) !== post.get(id));
    if (moved.length) bad.push(`only:${spec} (also ${moved.map((id) => { const t = a0.find((x) => x.id === id) ?? b0.find((x) => x.id === id); return `${t?.thing ?? t?.name ?? t?.kind}:${id}`; }).slice(0, 6).join(',')})`);
  }
  for (const w of [].concat(ex.unchanged ?? [])) {   // "W": the things of that world did not change at all (a request for another domain)
    if (JSON.stringify(thingsOf(ws(before, w)).map(strip)) !== JSON.stringify(thingsOf(ws(after, w)).map(strip))) bad.push(`unchanged:${w}`);
  }
  for (const spec of [].concat(ex.same ?? [])) {   // "W:path": the value at that path is the same before and after (the preset stays when only the expression is asked)
    const [w, path] = splitWorld(spec, dflt);
    const a = JSON.stringify(statePath(ws(before, w), path) ?? null), b = JSON.stringify(statePath(ws(after, w), path) ?? null);
    if (a !== b) bad.push(`same:${spec} (${a.slice(0, 60)} -> ${b.slice(0, 60)})`);
  }
  for (const [key, neg] of [['rel', false], ['forbid_rel', true]]) {
    // "W:SEL REL SEL": every A stands in REL to some B (at least one A and one B); `REL_all`: to every B ("lake below_all tree|house": the water is the lowest band);
    // `amid`: A's centre lies at the centre of the Bs taken together (within their mean half extent); forbid_rel: no A does to any B
    for (const spec of [].concat(ex[key] ?? [])) {
      const [w, rest] = splitWorld(spec, dflt);
      const m = rest.match(/^(.+?)\s+(in|on|over|inside|near|above|below|left_of|right_of|amid)(_all)?\s+(.+)$/);
      if (!m) { bad.push(`${key}:bad spec ${spec}`); continue; }
      const all = thingsOf(ws(after, w)), A = all.filter(parseSel(m[1])), B = all.filter(parseSel(m[4]));
      let holds;
      if (m[2] === 'amid') {
        const g = B.map(geo), cx = g.reduce((t, q) => t + q.x, 0) / (g.length || 1), cy = g.reduce((t, q) => t + q.y, 0) / (g.length || 1), r = g.reduce((t, q) => t + q.h, 0) / (g.length || 1);
        holds = A.map((x) => { const q = geo(x); return Math.hypot(q.x - cx, q.y - cy) <= Math.max(r, 30); });
      } else {
        const others = (x) => B.filter((y) => y !== x);
        holds = A.map((x) => (m[3] ? others(x).length > 0 && others(x).every((y) => related(x, m[2], y)) : others(x).some((y) => related(x, m[2], y))));
      }
      if (neg ? holds.some(Boolean) : !A.length || !B.length || !holds.every(Boolean)) bad.push(`${key}:${spec} (${A.length} vs ${B.length}, holds ${holds.filter(Boolean).length})`);
    }
  }
  for (const spec of [].concat(ex.kinds ?? [])) {   // "W:new>=2" / "W:all>=2": distinct kinds among the things added this turn / among all things (random means varied)
    const [w, rest] = splitWorld(spec, dflt);
    const m = rest.match(/^(new|all)\s*(<=|>=|=|<|>)\s*(\d+)$/);
    if (!m) { bad.push(`kinds:bad spec ${spec}`); continue; }
    const old = new Set(thingsOf(ws(before, w)).map((t) => t.id));
    const ts = thingsOf(ws(after, w)).filter((t) => m[1] === 'all' || !old.has(t.id));
    const n = new Set(ts.map((t) => low(t.thing ?? t.kind))).size;
    if (!cmp(n, m[2], Number(m[3]))) bad.push(`kinds:${spec} (${n})`);
  }
  if (ex.either) {   // a list of alternative expectations (the same assertion keys); at least one must hold ("a random drawing here, or on the Drawing tab")
    const alts = ex.either.map((alt) => [...intentFailures(alt, { before, after }, dflt), ...evaluateCase({ world: dflt, expect: { state: alt.state, forbid_state: alt.forbid_state } }, { before, after, replyText: '', effects: [], statuses: [] }).filter((it) => !it.ok).map((it) => `${it.kind}:${it.spec}`)]);
    if (!alts.some((f) => !f.length)) bad.push(`either:${alts.map((f) => f.join(' & ')).join(' | ')}`);
  }
  for (const spec of [].concat(ex.layout ?? [])) {   // "W:SEL ring|row|column": the things lie on a ring (distance to their centre within 20%) or in a row / column
    const [w, rest] = splitWorld(spec, dflt);
    const m = rest.match(/^(.+?)\s+(ring|row|column)$/);
    const ts = m ? thingsOf(ws(after, w)).filter(parseSel(m[1])).map(geo) : [];
    let ok = ts.length >= 3;
    if (ok && m[2] === 'ring') { const cx = ts.reduce((s, t) => s + t.x, 0) / ts.length, cy = ts.reduce((s, t) => s + t.y, 0) / ts.length; const d = ts.map((t) => Math.hypot(t.x - cx, t.y - cy)), mean = d.reduce((s, x) => s + x, 0) / d.length; ok = mean > 20 && d.every((x) => Math.abs(x - mean) <= 0.2 * mean); }
    if (ok && m[2] !== 'ring') { const k = m[2] === 'row' ? 'y' : 'x', v = ts.map((t) => t[k]); ok = Math.max(...v) - Math.min(...v) <= 25; }
    if (!ok) bad.push(`layout:${spec}`);
  }
  if (ex.spread) {   // "W" or true: no two things sit on each other (centres within 0.6 of the smaller half extent), a thing at least twice the other's size excepted (a container)
    const [w] = splitWorld(ex.spread === true ? '' : ex.spread, dflt);
    const ts = thingsOf(ws(after, w)).map(geo), hits = [];
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const a = ts[i], b = ts[j], s = Math.min(a.h, b.h); if (Math.max(a.h, b.h) >= 2 * s) continue; if (Math.abs(a.x - b.x) < 0.6 * s && Math.abs(a.y - b.y) < 0.6 * s) hits.push(`${i}/${j}`); }
    if (hits.length) bad.push(`spread:${hits.length} overlapping`);
  }
  if (ex.differs) {   // true or "W": a different picture: most of the kinds differ from before (Jaccard of the kind sets below 0.5)
    const [w] = splitWorld(ex.differs === true ? '' : ex.differs, dflt);
    const a = kindSet(ws(before, w)), b = kindSet(ws(after, w)), inter = [...a].filter((k) => b.has(k)).length, uni = new Set([...a, ...b]).size;
    if (!b.size || (uni && inter / uni >= 0.5)) bad.push(`differs:${[...a].join(',')} -> ${[...b].join(',')}`);
  }
  return bad;
}

// ---- reply checks (reviewer 11:30 rule 5) ----
/** Internal names in a reply: an identifier (water_lily) or the internal role "target" said as a word. */
export const INTERNAL = /\b[a-z]+_[a-z_]+\b|\bfor the target\b|pentru (?:[țţt]int[aă]|ce fac)\b/i;
const RO_REPLY = /[ăâîșşțţ]|\b(?:Am|Nu|este|acum|aici|pentru)\b/;
const EN_FUNCTION = /\b(?:the|is|I|you|to|now|here|did|not|moved|added|with|and|of|it|was|for|this)\b/;
const words = (s) => (String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/\p{L}+/gu) ?? []);
/** Failures of `reply_clean`: no internal name; in a Romanian reply no English fragment (a quoted piece the user did not write, an English function word, or a word of the
 *  English reply left untranslated that the user did not write). */
export function replyCleanFailures(shown, english, text) {
  const bad = [];
  const m = String(shown).match(INTERNAL);
  if (m) bad.push(`internal:${m[0]}`);
  if (!RO_REPLY.test(shown)) return bad;
  const said = new Set(words(text));
  const echo = (w) => said.has(w) || [...said].some((u) => u.length >= 4 && (u.startsWith(w) || w.startsWith(u)));
  const quoted = [...String(shown).matchAll(/[„"“]([^"”“]+)["”“]/g)].map((q) => q[1]);
  for (const q of quoted) if (words(q).some((w) => !echo(w))) { bad.push(`english-quote:${q}`); break; }
  const bare = String(shown).replace(/[„"“][^"”“]*["”“]/g, ' ');
  const f = bare.match(EN_FUNCTION);
  if (f) bad.push(`english-word:${f[0]}`);
  const en = new Set(words(english).filter((w) => w.length >= 3));
  const left = words(bare).filter((w) => w.length >= 3 && en.has(w) && !echo(w));
  if (left.length) bad.push(`english-left:${[...new Set(left)].join(',')}`);
  return bad;
}
/** The reply says nothing changed while the content changed (what the reply says must equal the state). */
export const SAYS_UNCHANGED = /Nothing changed|Nu s-a schimbat nimic/i;

export function judge(row, out) {
  const ex = row.expect ?? {};
  const bad = invariantFailures(out);
  if (out.content && SAYS_UNCHANGED.test(out.shown) && !/\b(?:I|Am) (?:added|moved|made|changed|ad[aă]ugat|mutat|f[aă]cut|schimbat)\b/i.test(out.shown)) bad.push('says-unchanged');
  const worlds = [].concat(ex.world ?? []);
  if (worlds.length && !worlds.some((w) => out.worlds.includes(w))) bad.push(`world:${worlds.join('|')} got ${out.worlds.join(',') || '-'}`);
  if (ex.tab && out.tabAfter !== ex.tab) bad.push(`tab:${ex.tab} got ${out.tabAfter}`);
  const effect = [];   // what the turn must have done; `or_reply` (a regex) excuses it when the reply says why it could not (a shape already at the edge)
  if (ex.changed === true && !out.content) effect.push('changed');
  if (ex.changed === false && out.content) effect.push('unchanged');
  for (const it of evaluateCase({ world: worlds[0] ?? null, expect: { state: ex.state, forbid_state: ex.forbid_state } }, { before: out.before, after: out.after, replyText: '', effects: [], statuses: [] })) if (!it.ok) effect.push(`${it.kind}:${it.spec}${it.actual !== undefined ? ` (${it.actual})` : ''}`);
  effect.push(...intentFailures(ex, out, worlds[0] ?? TAB_WORLD[row.tab] ?? null));
  if (ex.reply_clean) bad.push(...replyCleanFailures(out.shown, out.english, row.text));
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
    // `view`: the view the page tells while a popup is open (the avatar popup: `view: 'avatar'`, docs/webchat/app.mjs)
    try { reply = await s.send(r.text, { ...sendOptions(settings, { lang: r.lang ?? 'ro' }, createBudget()), ...(r.view ? { view: r.view } : {}) }); } catch (e) { error = e.message; }
    const ms = Math.round(performance.now() - t0);
    if (process.env.OWNER_TRACE && process.env.OWNER_TRACE.split(",").includes(String(r.turn ?? r.id))) console.error(JSON.stringify({ text: reply?.text, statuses: reply?.statuses, parts: reply?.parts, trace: { ...reply?.trace, budget: undefined } }, null, 1).slice(0, Number(process.env.OWNER_TRACE_MAX ?? 12000)));
    const after = s.state();
    // `setup`: the turn is judged on its own result; then the session goes back to before it and the owner's state is built by plain English requests (independent of any random
    // draw or catalog version: the later turns name the owner's things), unjudged
    // the fixture is built by the readers (`request: false`): it is the owner's state, not a measured turn ("a hexagon called summary" needs names in the request reader, Q42)
    if (r.setup) { s.restore(setupSnap); for (const e of r.setup) { try { await s.send(e, { ...sendOptions(settings, { lang: 'en', language: 'en' }, createBudget()), request: false }); } catch { /* the next lines say what is missing */ } } }
    if (process.env.OWNER_STATE && (process.env.OWNER_STATE === 'all' || String(r.turn ?? r.id) === process.env.OWNER_STATE)) console.error(`STATE T${r.turn ?? r.id} ${JSON.stringify(Object.fromEntries(Object.entries(after).filter(([w]) => w !== 'session.things').map(([w, v]) => [w, JSON.stringify(v) === JSON.stringify(before[w]) ? '=' : v])))}`);   // OWNER_STATE=all: every turn's changed worlds
    const changed = JSON.stringify(visibleState(before)) !== JSON.stringify(visibleState(after));
    // the turn's step counters (Drawing `stepGroup`, Diagram `toolStep`) are bookkeeping, not content: a move that went nowhere and only advanced them is not a change
    const noStep = (st) => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) && ('stepGroup' in v || 'toolStep' in v) ? { ...v, stepGroup: undefined, toolStep: undefined } : v]));
    const content = contentChanged(Object.fromEntries(Object.entries(noStep(before)).map(([k, v]) => [k, JSON.stringify(v)])), noStep(after));
    return { r, error, out: { before, after, changed, content, ms, shown: reply?.text ?? '', english: reply?.trace?.replyEnglish ?? '', read: reply?.trace?.english ?? '', worlds: [...new Set((reply?.segments ?? []).map((x) => x.world ?? x.match?.worldId).filter(Boolean))], tabAfter: after['ui.shell']?.activeTab ?? null, perf: reply?.perf ?? null, door: reply?.trace?.door ?? null, legacy: !!reply?.trace?.legacy } };
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
      const row = { set: r.set, context: !!r.context, id: r.turn ?? r.id, class: r.class ?? null, text: r.text, tab: r.tab, ms, judged, right: judged ? bad.length === 0 : null, verdict: judged ? (error ? 'wrong' : verdictOf(r, out, bad)) : null, invariant: invariantFailures(out), failing: bad, worlds: out.worlds, tabAfter: out.tabAfter, changed: out.changed, content: out.content, reply: out.shown.slice(0, 240), english: out.english.slice(0, 240), ...(r.lang && r.lang !== 'en' && out.read ? { read: String(out.read).slice(0, 240) } : {}), stages: stagesOf(out.perf), door: out.door, legacy: out.legacy };
      rows.push(row);
      if (dump) {
        const ch = Object.keys(after).filter((w) => JSON.stringify(visibleState({ [w]: before[w] })) !== JSON.stringify(visibleState({ [w]: after[w] })));
        console.log(`${row.set === 'session' ? 'T' : 'V'}${row.id} [${r.tab}] ${r.text}\n   -> ${row.verdict === null ? '·' : row.verdict.toUpperCase()} ${ms}ms worlds=${out.worlds.join(',')} tab=${out.tabAfter} changed=${ch.join(',')}\n   ro: ${row.reply.slice(0, 200)}\n   en: ${row.english.slice(0, 200)}${bad.length ? `\n   failing: ${bad.join(' ; ')}` : ''}`);
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
    session: { right: sess.filter((x) => x.right).length, total: sess.length, verdicts: Object.fromEntries(['right', 'partly', 'honest', 'wrong'].map((v) => [v, sess.filter((x) => x.verdict === v).length])), turns: Object.fromEntries(['right', 'partly', 'honest', 'wrong'].map((v) => [v, sess.filter((x) => x.verdict === v).map((x) => x.id)])),medianMs: median(rows.filter((x) => x.set === 'session' && !x.context).map((x) => x.ms)), withheld: rows.filter((x) => x.set === 'session' && x.invariant.includes('withheld')).length, falseDone: rows.filter((x) => x.set === 'session' && x.invariant.includes('false-done')).length, ms: timing(rows.filter((x) => x.set === 'session' && !x.context)) },
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
/** Alias kept for tests/no-false-done.test.mjs (both scorers merged 2026-11-16: one claim pattern). */
export const CLAIMS = CLAIMS_CHANGE;
