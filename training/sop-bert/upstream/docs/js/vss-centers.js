// vss-centers.js: the message cut into requests by the VSS reader, "several centres of gravity" (owner's idea, approved 2026-10-31).
// First principles: a VSS state has ONE predicate (its centre) and its word addresses are computed from a start point, so a message
// with several requests needs several states, one per centre. Here:
//   1. the centres are the event words of the sentence (the learned triggers, applied repeatedly along the sentence);
//   2. for every centre, every stretch [start, end] that contains it and no other centre is read by the VSS reader; a stretch scores
//      (#tokens the reading places in a role or as the predicate) - (#tokens it cannot place): a word belongs to a centre when that
//      centre's reading explains it; chatter glued to a request is not explained and costs;
//   3. a dynamic programme over the centres picks, for each, the stretch with the best total score, stretches not overlapping; a centre
//      whose every stretch is unreadable (unknown-event, no-sense) is dropped; tokens in no stretch are chatter.
// Sentences are cut at . ! ? (punctuation is a mechanical separator). No separate model, no tuned weight.
import * as FRONT from "./front.js";

const ENDS = new Set([".", "!", "?"]), PUNCT = new Set([".", ",", "!", "?", ";", ":"]);

/** the event centres of a token list: positions (in `toks`) where a learned trigger rule fires, found left to right */
function centres(words, F, verbs) {
  // values first, keeping for each value token the index of its first source word
  const vals = [], src = []; let i = 0;
  const V = F.values, isWord = (t) => !(t.startsWith("n_") || t.startsWith("t_") || /^\d+$/.test(t) || PUNCT.has(t));
  while (i < words.length) {
    let hit = false;
    for (const n of [3, 2, 1]) { const g = words.slice(i, i + n); if (g.length === n && g.every(isWord) && Object.hasOwn(V, g.join(" "))) { vals.push(V[g.join(" ")]); src.push(i); i += n; hit = true; break; } }
    if (!hit) { vals.push(words[i]); src.push(i); i++; }
  }
  const out = []; let from = 0;
  for (;;) {
    const rest = vals.slice(from), t = FRONT.applyTriggers(rest, F.triggers);
    const k = t.findIndex((x, j) => verbs.has(x) && x !== rest[j]);   // the position where a rule fired (its token differs from the word)
    const kk = k >= 0 ? k : t.findIndex((x) => verbs.has(x));          // or a word that is itself an event token
    if (kk < 0) break;
    out.push(src[from + kk]); from += kk + 1;
    if (from >= vals.length) break;
  }
  return out;
}

export function vssCentres(text, names, F, vss, opts = {}) {
  if (opts.cut === "q1") return vssCentresQ1(text, names, F, vss, opts);
  const verbs = opts.verbs || new Set(vss.model.legend.events.flatMap((e) => e.verbs || []));
  const vk = new Set(Object.entries(vss.model.lexicon || {}).filter(([w, e]) => /^[A-Z]+$/.test(e.kind) && e.kind !== "VERB").map(([w]) => w));   // legend value tokens (kinds in capitals)
  const [toks] = FRONT.tokenize(text, names), sents = []; let cur = [];
  toks.forEach((t, k) => { cur.push(k); if (ENDS.has(t[0])) { sents.push(cur); cur = []; } });
  if (cur.length) sents.push(cur);
  const out = [], cache = new Map();
  const read = (s, a, b) => {                                   // stretch s[a..b] inclusive
    while (a <= b && PUNCT.has(toks[s[a]][0])) a++;
    while (b >= a && PUNCT.has(toks[s[b]][0])) b--;
    if (a > b) return null;
    const srcText = text.slice(toks[s[a]][1], toks[s[b]][2]);
    if (cache.has(srcText)) return cache.get(srcText);
    const { tokens } = FRONT.normalize(srcText, names, F); let v = null;
    if (tokens.filter((t) => verbs.has(t)).length === 1) {
      const r = vss.read(tokens.join(" "));
      if (r.status !== "unknown-event" && r.status !== "no-sense" && !(opts.confident && r.status === "abstain")) {   // confident: a centre whose reading abstains is not a request
        // only words that carry content count: names, quoted texts, numbers, legend values, action words (a word of these kinds that
        // the reading cannot place belongs to another request); chatter words ("still", "uh", "because") are neither for nor against
        const content = (t) => t.startsWith("n_") || t.startsWith("t_") || /^\d+$/.test(t) || verbs.has(t) || (vk && vk.has(t));
        const un = r.unplaced.filter(content).length, all = tokens.filter(content).length;
        v = { src: srcText, score: (all - un) - un };
      }
    }
    cache.set(srcText, v); return v;
  };
  for (const s of sents) {
    const words = s.map((k) => toks[k][0]), C = centres(words, F, verbs);
    if (!C.length) continue;
    // DP over centres: state = end index of the previous stretch
    let states = new Map([[-1, { score: 0, spans: [] }]]);
    C.forEach((c, j) => {
      const lo = j > 0 ? C[j - 1] + 1 : 0, hi = j + 1 < C.length ? C[j + 1] - 1 : s.length - 1, next = new Map();
      for (const [prevEnd, st] of states) {
        if (!next.has(prevEnd) || next.get(prevEnd).score < st.score) next.set(prevEnd, st);      // the centre dropped
        for (let a = Math.max(lo, prevEnd + 1); a <= c; a++) for (let b = c; b <= hi; b++) {
          const r = read(s, a, b); if (!r) continue;
          const cand = { score: st.score + r.score, spans: st.spans.concat([r.src]) };
          if (!next.has(b) || next.get(b).score < cand.score) next.set(b, cand);
        }
      }
      states = next;
    });
    let best = null; for (const st of states.values()) if (!best || st.score > best.score) best = st;
    out.push(...best.spans);
  }
  return out;
}

// ---------------- cut "q1" (opts.cut = "q1"; training/sketch/diagnosis_cut/CUT.md section 6). Decoding only, the same reader and front end.
// It differs from the default cut in three places:
//   1. the centres are the event tokens of a LEFT-TO-RIGHT scan of the sentence (the loop of front.js normalizeMessage: at each position the
//      first rule, in the learned order, that starts there fires and the scan resumes after its whole phrase; a word that is itself an
//      event token is a centre). The default scan takes the first rule in rule order anywhere and resumes one token after it, inside the
//      fired phrase (one phrase -> 2-3 centres: CUT.md M1a).
//   2. a stretch may hold up to MAX_JOIN consecutive centres (one request with two event tokens: "Is X connected to Y", "which shape is the
//      leftmost"); it is read alone like an annotated span (more than one event token allowed: the reader picks its predicate). A stretch of
//      one centre still needs exactly one event token. The DP chooses join or split by the same total score.
//   3. the score of a stretch counts only the content words that are not event tokens: placed - unplaced (the event token no longer earns a
//      reading a point for itself, which rewarded splitting); a reading that fills none of its event's roles is not a request, unless the
//      legend gives the event no roles (undo, redo, forget, cycle). On an equal total, the segmentation that drops fewer readable centres wins.
// The one constant: MAX_JOIN = 3 (centres per stretch), the longest run of event tokens of one request seen on the dev file
// ("which shape is the leftmost": which + is + extreme_q); not tuned (2 and 3 were measured: 54.2% / 54.0% under another tie rule).
const MAX_JOIN = 3;
const qctx = (t) => (t == null ? "B" : t.startsWith("n_") ? "NAME" : t.startsWith("t_") ? "TEXT" : /^\d+$/.test(t) ? "NUM" : t);
const qpform = (toks) => toks.map((x) => (x.startsWith("n_") ? "NAME" : x));
const qByFirst = new WeakMap();
function centresLTR(words, F, verbs) {
  const vals = [], src = []; let i = 0;
  const V = F.values, isWord = (t) => !(t.startsWith("n_") || t.startsWith("t_") || /^\d+$/.test(t) || PUNCT.has(t));
  while (i < words.length) {
    let hit = false;
    for (const n of [3, 2, 1]) { const g = words.slice(i, i + n); if (g.length === n && g.every(isWord) && Object.hasOwn(V, g.join(" "))) { vals.push(V[g.join(" ")]); src.push(i); i += n; hit = true; break; } }
    if (!hit) { vals.push(words[i]); src.push(i); i++; }
  }
  if (!qByFirst.has(F.triggers)) { const m = new Map(); for (const e of F.triggers) { const f = e.p.split(" ")[0]; if (!m.has(f)) m.set(f, []); m.get(f).push(e); } qByFirst.set(F.triggers, m); }
  const byFirst = qByFirst.get(F.triggers), pv = qpform(vals), out = [];
  for (let i = 0; i < vals.length;) {
    let hit = null;
    for (const e of byFirst.get(pv[i]) || []) {
      const ph = e.p.split(" "), L = ph.length;
      if (i + L > vals.length || !ph.every((x, k) => pv[i + k] === x)) continue;
      const p = qctx(i > 0 ? vals[i - 1] : null), n = qctx(i + L < vals.length ? vals[i + L] : null), p2 = qctx(i > 1 ? vals[i - 2] : null);
      if ((e.prev === "*" || e.prev === p) && (e.next === "*" || e.next === n) && (e.prev2 === undefined || e.prev2 === "*" || e.prev2 === p2)) { hit = e; break; }
    }
    if (hit) { if (verbs.has(hit.tok)) out.push(src[i]); i += hit.p.split(" ").length; continue; }
    if (verbs.has(vals[i])) out.push(src[i]);
    i++;
  }
  return out;
}

/** the q1 cut: -> the request texts in order (opts.spans: [{src, c0, c1}] with character offsets in `text`) */
export function vssCentresQ1(text, names, F, vss, opts = {}) {
  const verbs = opts.verbs || new Set(vss.model.legend.events.flatMap((e) => e.verbs || []));
  const vk = new Set(Object.entries(vss.model.lexicon || {}).filter(([w, e]) => /^[A-Z]+$/.test(e.kind) && e.kind !== "VERB").map(([w]) => w));
  const evRoles = new Map(vss.model.legend.events.map((e) => [e.id, (e.roles || []).length]));
  // switch Q1b (training/sketch/DECODE.md): opts.roleless = the events that may be read with no role, learned from the training frames
  // (decode.json roleless_ok: >= 5% of the event's training frames fill no role; tool/sop/decode_stats.py); it replaces the legend test
  const rolelessOk = opts.roleless ? new Set(opts.roleless) : null;
  const mayBeRoleless = (ev) => (rolelessOk ? rolelessOk.has(ev) : (evRoles.get(ev) || 0) === 0);
  const content = (t) => t.startsWith("n_") || t.startsWith("t_") || /^\d+$/.test(t) || verbs.has(t) || vk.has(t);
  const [toks] = FRONT.tokenize(text, names), sents = []; let cur = [];
  toks.forEach((t, k) => { cur.push(k); if (ENDS.has(t[0])) { sents.push(cur); cur = []; } });
  if (cur.length) sents.push(cur);
  const out = [], cache = new Map();
  const read = (s, a, b, g) => {                                // stretch s[a..b] inclusive holding g centres
    while (a <= b && PUNCT.has(toks[s[a]][0])) a++;
    while (b >= a && PUNCT.has(toks[s[b]][0])) b--;
    if (a > b) return null;
    const c0 = toks[s[a]][1], c1 = toks[s[b]][2], srcText = text.slice(c0, c1), key = g + "\u0000" + srcText;
    if (cache.has(key)) return cache.get(key);
    const { tokens } = FRONT.normalize(srcText, names, F); let v = null;
    const nv = tokens.filter((t) => verbs.has(t)).length;
    if (g === 1 ? nv === 1 : nv >= 1) {
      const r = vss.read(tokens.join(" "));
      if (r.status !== "unknown-event" && r.status !== "no-sense" && !(opts.confident && r.status === "abstain")) {
        const cont = tokens.filter(content), un = r.unplaced.filter(content);
        const ev = cont.filter((t) => verbs.has(t)).length, unEv = un.filter((t) => verbs.has(t)).length;
        const roles = Object.values((r.frame && r.frame.roles) || {}).filter((x) => x !== null && x !== undefined).length;
        const roleless = roles === 0 && !mayBeRoleless(r.frame && r.frame.event);
        if (!roleless) v = { src: srcText, c0, c1, score: ((cont.length - ev) - (un.length - unEv)) - (un.length - unEv) };
      }
    }
    cache.set(key, v); return v;
  };
  const better = (old, cand) => !old || old.score < cand.score || (old.score === cand.score && cand.drop < old.drop);
  for (const s of sents) {
    const words = s.map((k) => toks[k][0]), C = centresLTR(words, F, verbs);
    if (!C.length) continue;
    // DP over centres; steps[j]: Map(end index of the previous stretch -> {score, drop, spans}); a stretch covers centres j .. j+g-1
    const steps = Array.from({ length: C.length + 1 }, () => new Map());
    steps[0].set(-1, { score: 0, drop: 0, spans: [] });
    const put = (m, key, cand) => { if (better(m.get(key), cand)) m.set(key, cand); };
    for (let j = 0; j < C.length; j++) {
      for (const [prevEnd, st] of steps[j]) {
        put(steps[j + 1], prevEnd, { score: st.score, drop: st.drop + 1, spans: st.spans });     // the centre dropped
        for (let g = 1; g <= MAX_JOIN && j + g <= C.length; g++) {
          const lo = j > 0 ? C[j - 1] + 1 : 0, hi = j + g < C.length ? C[j + g] - 1 : s.length - 1;
          for (let a = Math.max(lo, prevEnd + 1); a <= C[j]; a++) for (let b = C[j + g - 1]; b <= hi; b++) {
            const r = read(s, a, b, g); if (!r) continue;
            put(steps[j + g], b, { score: st.score + r.score, drop: st.drop, spans: st.spans.concat([r]) });
          }
        }
      }
    }
    let best = null; for (const st of steps[C.length].values()) if (better(best, st)) best = st;
    out.push(...best.spans);
  }
  return opts.spans ? out.map(({ src, c0, c1 }) => ({ src, c0, c1 })) : out.map((x) => x.src);
}
