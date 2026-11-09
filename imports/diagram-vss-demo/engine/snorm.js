// snorm.js: the sketch world's normalizer in the browser, the twin of training/sketch/normalize.py, driven by the same normalize.json.
// normalize(table, lexicon, text) -> { tokens, info: { texts, names, numbers } }. Deterministic; parity is tested by training/sketch/parity.mjs.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"; }

export function compile(T) {
  const split = (s) => s.split(/\s+/).filter(Boolean);
  return {
    T, lead: T.lead_strip.map(split).sort((a, b) => b.length - a.length), open: T.openers.map(([a, b]) => [split(a), split(b)]),
    mwe: T.mwe.map(([a, b]) => [split(a), split(b)]).sort((a, b) => b[0].length - a[0].length), syn: T.synonyms, num: T.number_words,
    noNum: new Set(T.number_word_exceptions), punct: T.punctuation, follow: new Set(T.article_followers), before: new Set(T.name_before),
    keepS: new Set(Object.keys(T.contractions).filter((k) => k.endsWith("'s")).map((k) => k.split("'")[0])),
    rewrites: T.rewrites || [], qverbs: new Set(T.question_verbs || []),
    trig: (T.triggers || []).map((e) => [split(e.p), e.prev, e.next, e.tok, e.keep || []]),
  };
}
const eq = (a, b, i) => b.every((x, k) => a[i + k] === x);

export function normalize(C, lexicon, text, names = []) {
  const info = { texts: {}, names: {}, numbers: {} }, known = new Set(names.map((n) => String(n).toLowerCase()));
  let s = text.replace(/"([^"]*)"|“([^”]*)”|(?<![A-Za-z0-9])'([^']+)'(?![A-Za-z0-9])/g, (m, a, b, c) => {
    const v = a ?? b ?? c, tok = "t_" + slug(v); info.texts[tok] = v; return ` ${tok} `;
  }).replace(/\u2019/g, "'");   // a curly apostrophe left inside a word: let’s -> let's
  const parts = s.split(" ");
  for (let i = 0; i < parts.length; i++) if (parts[i] === "A") {
    const nxt = parts.slice(i + 1).find((x) => x) || "", prev = (parts.slice(0, i).reverse().find((x) => x) || "").toLowerCase();
    if (!C.follow.has(nxt.toLowerCase().replace(/[^a-z-]/g, "")) || C.before.has(prev)) parts[i] = "N_A_NAME";
  }
  s = parts.join(" ");
  s = s.replace(/\b(\d+)(px|pixels?)\b/g, "$1 $2").replace(/\b([A-Za-z0-9]+)['\u2019]s\b/g, (m, w) => (C.keepS.has(w.toLowerCase()) ? m : w));   // Done's -> Done; let's, it's stay
  const originals = new Map(), capital = new Set(), words = s.match(/[A-Za-z_][\w-]*/g) || [];
  words.forEach((w, k) => { if (!originals.has(w.toLowerCase())) originals.set(w.toLowerCase(), w); if (k > 0 && w[0] >= "A" && w[0] <= "Z" && w !== "I") capital.add(w.toLowerCase()); });
  s = s.toLowerCase();
  for (const [a, b] of Object.entries(C.T.contractions)) s = s.replace(new RegExp("(?<![a-z])" + esc(a) + "(?![a-z])", "g"), b);
  s = s.replace(new RegExp("([" + esc(C.punct) + "])(?=\\s|$)", "g"), " $1 ").replace(/,(?=\d)/g, " , ");
  let toks = s.split(/\s+/).filter(Boolean);
  for (let changed = true; changed && toks.length;) {
    changed = false;
    for (const a of C.lead) if (eq(toks, a, 0) && toks.length > a.length) { toks = toks.slice(a.length); changed = true; break; }
    if (toks[0] === ",") { toks = toks.slice(1); changed = true; }
  }
  for (const [a, b] of C.open) if (eq(toks, a, 0)) { toks = b.concat(toks.slice(a.length)); break; }
  let out = [];
  for (let i = 0; i < toks.length;) {
    const hit = C.mwe.find(([a]) => eq(toks, a, i));
    if (hit) { out.push(...hit[1]); i += hit[0].length; } else out.push(toks[i++]);
  }
  toks = out.map((t) => (Object.hasOwn(C.syn, t) ? C.syn[t] : t));
  out = [];
  for (let i = 0; i < toks.length;) {
    const t = toks[i];
    if (Object.hasOwn(C.num, t) && !C.noNum.has(t)) {
      let v = C.num[t], j = i + 1;
      if (v >= 20 && v <= 90 && j < toks.length && Object.hasOwn(C.num, toks[j]) && C.num[toks[j]] >= 1 && C.num[toks[j]] <= 9) { v += C.num[toks[j]]; j++; }
      out.push(String(v)); info.numbers[String(v)] = v; i = j; continue;
    }
    if (/^\d+$/.test(t)) info.numbers[t] = +t;
    out.push(t); i++;
  }
  const res = [];
  for (const t of out) {
    if (t === "n_a_name") { info.names.n_a = "A"; res.push("n_a"); continue; }
    if (lexicon.has(t) || /^\d+$/.test(t) || C.punct.includes(t) || t.startsWith("t_") || /^[^a-z0-9_]+$/.test(t)) { res.push(t); continue; }
    if (known.has(t) || capital.has(t)) { const n = "n_" + slug(t); info.names[n] = originals.get(t) || t; res.push(n); }
    else res.push(t);                                                    // unknown word: kind 'unknown' for the reader
  }
  for (const r of C.rewrites) if (res.length && r.first.includes(res[0]) && r.all.every((alts) => alts.some((w) => res.includes(w)))) { res[0] = r.set; break; }
  if (res.length && C.qverbs.has(res[0])) for (let i = 1; i < res.length; i++) if (res[i] === "is" || res[i] === "are") res[i] = "be";
  return { tokens: C.trig.length ? applyTriggers(res, C.trig) : res, info };
}
// learned triggers (training/sketch/learn_triggers.py), the twin of normalize.py apply_triggers: the first rule in table order with a fitting match, at its leftmost match
function tclass(t) {
  if (t == null) return "B";
  if (t.startsWith("n_")) return "NAME";
  if (t === "a" || t === "an" || t === "another" || /^\d+$/.test(t)) return "ART";
  if (t === "the") return "THE";
  if (["it", "them", "this", "that", "these", "those", "everything", "all", "both", "they"].includes(t)) return "PRON";
  return "O";
}
function applyTriggers(toks, trig) {
  for (const [ph, pv, nx, tok, keep] of trig) for (let i = 0; i + ph.length <= toks.length; i++) {
    if (!eq(toks, ph, i)) continue;
    const p = tclass(i > 0 ? toks[i - 1] : null), n = tclass(i + ph.length < toks.length ? toks[i + ph.length] : null);
    if ((pv === "*" || pv === p) && (nx === "*" || nx === n)) return toks.slice(0, i).concat([tok], keep, toks.slice(i + ph.length));
  }
  return toks;
}
