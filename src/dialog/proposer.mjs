// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE REQUEST PROPOSER (questions.md Q48 proposal 1; owner GO 2026-11-15 late). Browser-safe: no `node:*` imports; the ONNX runtime and the model files are passed in by the host.
 *
 * A small non-generative encoder (training/psys2_train/request_proposer.py) PROPOSES a w.request for the words of a turn: the act (or none), the reaction, the reference, whether
 * it is a question, and one tag per word: its role in the request (ACT, a constraint key such as kind / kind.no / count / size / place / attribute, REACT, REF, NAME), UNREAD (a
 * word that must stay, so that the reply names it), DROP (phrasing that changes nothing) or O. THE RULES DECIDE: the proposal is turned into a phrasing (`renderOf`: the words
 * without the DROP ones, the act's verb in front when the act has no word) that the library's readRequest reads over the open world like any other text; the proposal is
 * accepted only when that reading is complete (no unread word), agrees with the proposal (act, reaction, every kind word the proposal tags) and a value checker holds (every
 * number, negation and name of the turn is kept). Nothing executes on the model alone: an accepted proposal is one more candidate reading of the door, which then plans it
 * against the open world's declarations as it plans any reading. A disagreement with the rules is returned for the log (trace.proposer).
 *
 * The proposer reads the spell-repaired words (spelling stays symbolic: repairWords runs first; owner 2026-11-15).
 */

/** The words of a text exactly as the library's readRequest cuts them (sopworld tokensOf): lowercase, n't -> not, numbers, words, '-' and ','. */
export function requestTokens(text) {
  return (String(text ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/n't\b/g, ' not').replace(/[–—]/g, '-')
    .match(/\d+(?:\.\d+)?|[\p{L}][\p{L}'_]*|[-,]/gu) ?? []).map((t) => t.replace(/'$/, ''));
}

/** What a reading says, without where it says it: the act, the reactions, the reference, the question mark and the constraints (key, want, value, number, bounds ...). */
export function signatureOf(req) {
  if (!req) return 'null';
  const c = (req.constraints ?? []).map((x) => [x.on, x.want, x.value, x.number, x.min, x.max, x.attribute, x.of, x.step, x.amount, x.bound, x.relation].map((v) => (v == null ? '' : String(v))).join('|')).sort();
  return JSON.stringify([req.act ?? null, (req.reactions ?? []).map((r) => r.value).sort(), req.refers ?? null, !!req.question, c]);
}

const roleOf = (c) => `${c.on}${c.want === 'no' ? '.no' : c.want === 'not_all' ? '.not_all' : ''}`;

/**
 * The label of a reading over its words: { tags, act, reaction, refers, question } (one tag per word), or null when the act's word cannot be found. `drop` / `unread`: word
 * positions of phrasing that changes nothing / of words that stay unread. Narrow spans win over wide ones ("3 big red dogs" is a count of dogs: only "3" is the count's).
 */
export function labelOf(req, words, drop = new Set(), unread = new Set()) {
  const tags = words.map((_, i) => (drop.has(i) ? 'DROP' : unread.has(i) ? 'UNREAD' : 'O'));
  const span = (at, text, role) => { if (at == null || at < 0) return; const n = Math.max(1, requestTokens(text ?? '').length); for (let k = at; k < Math.min(words.length, at + n); k++) if (tags[k] === 'O') tags[k] = role; };
  const cs = [...(req.constraints ?? [])].filter((c) => c.at != null).sort((a, b) => requestTokens(a.words ?? '').length - requestTokens(b.words ?? '').length);
  for (const r of req.reactions ?? []) span(r.at, r.words, 'REACT');
  for (const c of cs) span(c.at, c.words, roleOf(c));
  for (const n of req.named ?? []) span(n.at, n.words, 'NAME');
  if (req.refersAt != null && req.refersAt >= 0 && tags[req.refersAt] === 'O') tags[req.refersAt] = 'REF';
  if (req.act && req._actAt !== -1) {
    const used = new Set(req.used ?? []);
    let at = -1;
    for (let i = 0; i < Math.min(words.length, 8); i++) if (tags[i] === 'O' && used.has(words[i])) { at = i; break; }
    if (at < 0) return null;
    tags[at] = 'ACT';
  }
  return { tags, act: req.act ?? 'none', reaction: req.reactions?.[0]?.value ?? 'none', refers: req.refers ?? 'none', question: !!req.question };
}

/** The phrasing the rules read for a proposal: the words without DROP, the act's verb (`verbFor(act)`) in front when no word is the act's. */
export function renderOf(words, tags, act, verbFor) {
  const kept = words.filter((_, i) => tags[i] !== 'DROP');
  const hasAct = tags.some((t, i) => t === 'ACT' && words[i]);
  const v = act && act !== 'none' && !hasAct ? verbFor?.(act) : null;
  return [...(v ? [v] : []), ...kept].join(' ').replace(/ ,/g, ',');
}

/**
 * The value checker of a rendered proposal against the turn's own words: every number, every negation word of the language (the cues of on=kind want=no / not_all: `negations`)
 * and every name (a word capitalized in the turn, not first) is kept; nothing is added but the act's verb. Returns the first broken check, or null.
 */
export function valueCheck(words, tags, original, negations = new Set()) {
  for (const [i, w] of words.entries()) {
    if (tags[i] !== 'DROP') continue;
    if (/^\d/.test(w)) return `number ${w}`;
    if (negations.has(w)) return `negation ${w}`;
  }
  const names = new Set();
  for (const m of String(original ?? '').matchAll(/[\p{L}'’]+/gu)) if (m.index > 0 && /^\p{Lu}/u.test(m[0])) for (const t of requestTokens(m[0])) names.add(t);
  for (const [i, w] of words.entries()) if (tags[i] === 'DROP' && names.has(w)) return `name ${w}`;
  return null;
}

/**
 * ONE MORE CANDIDATE READING OF THE DOOR. `q` is the rules' reading of `english` (readTurn); `read(text)` reads a text the same way over the same open world; `world` the tab
 * world's id (the verbs of meta.verbs). Returns { accepted, q?, english?, log } — `q` / `english` the rules' reading of the proposal's phrasing when it is accepted, `log` what
 * the proposer said and why it was taken or not (for trace.proposer and the training log). The rules' own reading wins whenever it is complete: the proposal is then only
 * compared and a disagreement logged.
 */
export async function proposeReading(proposer, { q, english, world, read, negations = new Set() }) {
  const corr = new Map((q.corrections ?? []).map((c) => [String(c.said ?? '').toLowerCase(), String(c.as ?? '').toLowerCase()]));
  const words = requestTokens(english).map((w) => corr.get(w) ?? w);   // the spell-repaired words: spelling is the symbolic repair's
  if (!words.length) return { accepted: false, log: null };
  // consulted only on a signal (reviewer 00:50 item 3): the rules left words unread, or read nothing to do; a turn the rules read whole never touches the model
  const complete = !q.unread.length && !!q.act;   // the signal: unread words, or no act (a reaction alone is consulted too; its proposal must still read strictly more words to be taken)
  if (complete) return { accepted: false, log: null };
  const t0 = Date.now();
  const p = await proposer.propose(words);
  const log = { act: p.act, reaction: p.reaction, refers: p.refers, question: p.question, tags: p.tags.join(' '), score: Number(p.score.toFixed(3)), ms: Date.now() - t0 };
  if (p.tags.includes('UNREAD')) return { accepted: false, log: { ...log, why: 'proposal keeps an unread word' } };
  // every proposed part cites words of the person (reviewer 00:50 item 2): an act the proposal puts in front with no word of its own stands on the frame that replaced the verb
  // ("i want …", "can i get …"): words tagged DROP at the start, before any word of the request; a bare thing ("drawings", "of fish") is never made an act
  if (p.act !== 'none' && !p.tags.includes('ACT')) {
    const lead = p.tags.findIndex((t) => t !== 'DROP');
    if (lead <= 0) return { accepted: false, log: { ...log, why: 'act with no words of the person' } };
  }
  const verbFor = (act) => proposer.meta?.verbs?.[world]?.[act] ?? null;
  const render = renderOf(words, p.tags, p.act, verbFor);
  log.render = render;
  if (render === words.join(' ').replace(/ ,/g, ',')) return { accepted: false, log: { ...log, why: 'same words' } };
  const broken = valueCheck(words, p.tags, english, negations);
  if (broken) return { accepted: false, log: { ...log, why: `value check: ${broken}` } };
  const q2 = read(render);
  if (!q2) return { accepted: false, log: { ...log, why: 'not read' } };
  if (q2.unread.length) return { accepted: false, log: { ...log, why: `rules leave unread: ${q2.unread.join(' ')}` } };
  if (!(q2.act || q2.target || q2.reaction || q2.request?.constraints?.length || q2.request?.refers)) return { accepted: false, log: { ...log, why: 'rules read nothing' } };
  if ((q2.act ?? 'none') !== p.act || (q2.reaction ?? 'none') !== p.reaction) return { accepted: false, log: { ...log, why: `rules disagree: act ${q2.act ?? 'none'} reaction ${q2.reaction ?? 'none'}` } };
  // every word the proposal tags as a kind is a kind of the rules' reading (by its words)
  const kindWords = new Set((q2.request?.constraints ?? []).filter((c) => c.on === 'kind').flatMap((c) => requestTokens(c.words ?? '')));
  const missing = words.filter((w, i) => /^kind/.test(p.tags[i]) && !kindWords.has(w));
  if (missing.length) return { accepted: false, log: { ...log, why: `kinds not read: ${missing.join(' ')}` } };
  // it reads strictly more of the person's words than the rules did (or finds the act they did not), and contradicts nothing the rules read with a cue
  if (!(q2.used?.length > (q.used?.length ?? 0) || (!q.act && q2.act))) return { accepted: false, log: { ...log, why: 'reads no more than the rules' } };
  const sigs = new Set(sigParts(q2.request));
  const lost = sigParts(q.request, true).filter((x) => !sigs.has(x));
  if (lost.length) return { accepted: false, log: { ...log, why: `contradicts the rules' cues: ${lost.join(', ')}` } };
  // a reading of the model alone never removes: the act that takes things away asks first (reviewer 00:50 item 4); with no question mechanism here, it is refused honestly
  if (p.act === 'remove' && q.act !== 'remove') return { accepted: false, log: { ...log, why: 'remove on a model-only reading' } };
  return { accepted: true, q: q2, english: render, log: { ...log, why: 'accepted' } };
}

/** The constraints of a reading as comparable strings; `cued`: only those a cue of the language read. */
function sigParts(req, cued = false) {
  return (req?.constraints ?? []).filter((x) => !cued || x.cue).map((x) => [x.on, x.want, x.value, x.number, x.min, x.max, x.attribute, x.step, x.amount, x.bound, x.relation].map((v) => (v == null ? '' : String(v))).join('|'));
}

/** The negation words of the language world (cues on=kind want=no / not_all): a proposal never drops one. */
export function negationWords(language, lang = 'w.lang.en') {
  const out = new Set();
  let rows = [];
  try { rows = language.ofType(`${lang}.cue`).map((x) => x.attrs ?? {}); } catch { rows = []; }
  let dets = [];
  try { dets = language.ofType(`${lang}.det`).flatMap((x) => (x.attrs?.text ?? []).map((t) => String(t).replace(/^"|"$/g, ''))); } catch { dets = []; }
  const det = new Set(dets);
  for (const r of rows) {
    const want = String(r.want?.[0] ?? '').replace(/^"|"$/g, '');
    if (String(r.on?.[0] ?? '').replace(/^"|"$/g, '') !== 'kind' || (want !== 'no' && want !== 'not_all')) continue;
    for (const l of r.lead ?? []) for (const w of requestTokens(String(l).replace(/^"|"$/g, ''))) if (!det.has(w)) out.add(w);   // the cue's words but its determiners
  }
  return out;
}

/**
 * The runtime: `createProposer({ ort, model, vocab, meta, tokenizer })` -> { propose(words) -> { act, reaction, refers, question, tags, score } }, or null when a piece is missing.
 *   ort        onnxruntime (node or web) module; model: bytes or a path / URL the runtime opens; vocab: vocab.txt text; meta: meta.json object; tokenizer: createWordPieceTokenizer.
 */
export async function createProposer({ ort, model, vocab, meta, tokenizer }) {
  if (!ort || !model || !vocab || !meta || !tokenizer) return null;
  const session = await ort.InferenceSession.create(model, { executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: meta.threads ?? 1 });
  const tk = tokenizer(vocab);
  const maxLen = meta.max_len ?? 64;
  const argmax = (a, off, n) => { let b = 0; for (let k = 1; k < n; k++) if (a[off + k] > a[off + b]) b = k; return b; };
  const softmaxTop = (a, off, n) => { let m = -Infinity; for (let k = 0; k < n; k++) m = Math.max(m, a[off + k]); let z = 0; for (let k = 0; k < n; k++) z += Math.exp(a[off + k] - m); return Math.exp(a[off + argmax(a, off, n)] - m) / z; };
  return {
    meta,
    async propose(words) {
      // word pieces of each word (the Python side encodes the same words with is_split_into_words): [CLS] pieces... [SEP]; the first piece of each word carries its tag
      const ids = [meta.cls_id], firsts = [];
      for (const w of words) {
        const e = tk.encode(w, { maxLength: maxLen }).ids.slice(1, -1);
        if (ids.length + e.length >= maxLen - 1) break;
        firsts.push(ids.length);
        ids.push(...(e.length ? e : [meta.unk_id]));
      }
      ids.push(meta.sep_id);
      const T = ids.length;
      const feeds = { input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, T]), attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, T]) };
      const out = await session.run(feeds);
      const head = (name, labels) => { const d = out[name].data; const i = argmax(d, 0, labels.length); return { value: labels[i], p: softmaxTop(d, 0, labels.length) }; };
      const act = head('act_logits', meta.acts), reaction = head('reaction_logits', meta.reactions), refers = head('refers_logits', meta.refers);
      const qd = out.question_logits.data;
      const tl = out.tag_logits.data, NT = meta.tags.length;
      const tags = words.map((_, i) => (i < firsts.length ? meta.tags[argmax(tl, firsts[i] * NT, NT)] : 'O'));
      const tagP = words.map((_, i) => (i < firsts.length ? softmaxTop(tl, firsts[i] * NT, NT) : 1));
      return { act: act.value, reaction: reaction.value, refers: refers.value, question: qd[1] > qd[0], tags, score: Math.min(act.p, reaction.p, ...tagP) };
    },
  };
}
