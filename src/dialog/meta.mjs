/**
 * Meta-dialogue recognizers and reference resolution (spec 11 sections 6-14). Browser-safe, pure functions, no model.
 *
 * `classify(text)` names the conversational intent of a short utterance (cancel, repeat, explain, feedback, topic return,
 * list mode, repair, degree fragment, ...); `resolveReference(phrase, refs)` resolves attribute and ordinal references
 * ("the red one", "the second one", "both", "all the trees") against the referents a world lists through its `referents(ctx)` hook.
 * The Discourse class (discourse.mjs) acts on the results.
 */

const plain = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
export { plain };

const REPEAT = /^(?:what|pardon|pardon me|huh|come again|what was that|what did you say|what did you just say|say (?:that|it) again|say again|repeat(?: that| it| please| that please)?|can you repeat(?: that| it)?|could you repeat(?: that| it)?|please repeat(?: that)?|i did not (?:hear|catch|get) (?:that|you|it)|i didnt (?:hear|catch|get) (?:that|you|it)|sorry what|sorry|one more time please)$/;
const EXPLAIN = /^(?:what did you do|what have you done|what did you just do|what was that|what happened|why|why is that|why was that|why did you (?:do|say) (?:that|this|it)|why did you do that|how come|how did you (?:do|get) (?:that|this|it)|explain(?: that| it| yourself| please)?|how did you know|how do you know|why do you say that|what did you change)$/;
const FEEDBACK = [
  /^(?:no |oh no |nope |hmm |ugh )?(?:thats|that is|this is|it is|its|you are|youre) (?:wrong|not right|incorrect|not correct|a mistake|bad|rubbish|nonsense|not it|totally wrong|completely wrong|not what i (?:asked|wanted|meant|said)(?: for)?)$/,
  /^(?:no |oh no |nope |hmm |ugh )?(?:wrong|incorrect|not right|bad answer|wrong answer|thats not it|that is not it|not what i (?:asked|wanted|meant|said)(?: for)?|not what i asked for)$/,
  /^(?:no )?(?:you got (?:it|that) wrong|you misunderstood(?: me)?|you did it wrong|you made a mistake|you are wrong|you were wrong|thats not what i (?:asked|wanted|meant|said)(?: for)?|that is not what i (?:asked|wanted|meant|said)(?: for)?|that was not what i (?:asked|wanted|meant|said)(?: for)?|that was wrong|that was not right|that did not work|that didnt work)$/,
];
const BACKCHANNEL = /^(?:lol|lmao|rofl|haha+|hehe+|heh|hmm+|hm+|mm+|mhm|um+|uh+|uhh+|er+|eh|ah+|oh+|ooh|huh|meh|wow|ok|okay|k|kk|ugh|whoa|oops)$/;
const TOPIC_RESUME = /^(?:where were we(?: again)?|where did we stop|where did we leave off|what were we (?:doing|talking about|working on)|continue|carry on|go on|resume|lets (?:continue|carry on|go on|resume)|keep going)$/;
const TOPIC_BACK = /^(?:lets |let us |please |can we |could we )?(?:go |get |switch |come |jump |take me |bring me )?(?:back|return) to (?:the |my |our )?(.+?)$/;
const LIST_START = /^(?:lets|let us|i want to|i would like to|id like to|can we|could we|we should|time to|i need to|please)? ?(?:make|start|write|create|begin|build|do|set up) (?:a |my |the |another |a new |our )?(?:new )?([a-z\- ]*?) ?list$/;
const LIST_END = /^(?:thats all|that is all|thats it|that is it|thats everything|i am done|im done|done|finished|im finished|i am finished|no more|nothing else|nothing more|end of (?:the )?list|the end|stop|enough|all done|all finished|thats enough|stop the list|finish(?: the list)?)(?: thanks| please| thank you)?$/;
const REPAIR_LEAD = '(?:no|nope|nah|not that|not that one|wait|hold on|oops|sorry|hmm|oh|uh|er|actually|no no|oh no)';
const REPAIR_CORRECT = [
  // explicit correction phrases work with or without a lead word
  new RegExp(`^(?:${REPAIR_LEAD}[ ,]+)*(?:i meant|i mean|i said|i wanted|rather|let it be|it should be|should be|it must be)\\s+(.+)$`),
  // imperatives that are ordinary commands on their own count as a correction only after a lead word ("actually make it green")
  new RegExp(`^(?:${REPAIR_LEAD}[ ,]+)+(?:make it|make that|make them|change that to|change it to|change them to|instead|use|try|paint it|colour it|color it|put|give it|give me)\\s+(.+)$`),
  /^(?:no|nope|nah|wait|oops|sorry|actually|hmm)(?:\s*,\s*|\s+(?=(?:the|a|an|that|this)\s))(?!more\b|less\b|thanks\b|thank\b)(?:the |a |an )?(.+)$/,
];
const NOT_THAT = /^(?:no |nope |nah )?not (?:that|this|the same) one(?:[ ,]+(?:but |instead |use |i meant |the )?(.*))?$/;
const NOT_X = /^(?:no |nope |nah )?not (?:the )?([a-z\- ]+?)[ ,]+(?:but |instead |use |i meant )?((?:the |a |an )?[a-z\- ]+)$/;
const BARE_OTHER = /^(?:the )?(other one|another one|the other|other|another)$/;

const SENTENCE_STARTERS = new Set(['who', 'whom', 'whose', 'what', 'where', 'when', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'i', 'you', 'we', 'please', 'draw', 'add', 'show', 'open', 'play', 'tell', 'give', 'let']);

/** Name the conversational intent of `text`: { intent, ... } or null. `ctx` carries `lang` (required, spec 04) and may carry { hasAction, hasAnswer, listMode }. */
export function classify(text, ctx = {}) {
  const t = plain(text);
  if (!t) return null;
  const { lang } = ctx;   // the shared vocabulary (ctx.lang of the interpreter): cancel and degree words come from lang.common
  const degree = (x) => lang.degree(x);
  if (ctx.listMode) {
    if (LIST_END.test(t)) return { intent: 'list.end' };
    if (lang.cancel(t)) return { intent: 'cancel' };
  }
  if (lang.cancel(t)) return { intent: 'cancel' };
  for (const re of FEEDBACK) if (re.test(t)) return { intent: 'feedback' };
  if (BACKCHANNEL.test(t)) return { intent: 'backchannel' };
  if (REPEAT.test(t)) return { intent: 'repeat' };
  if (EXPLAIN.test(t)) return { intent: 'explain' };
  if (TOPIC_RESUME.test(t)) return { intent: 'topic', target: null, digression: /^(?:where|what were we)/.test(t) };
  let m = t.match(TOPIC_BACK);
  if (m) return { intent: 'topic', target: m[1].replace(/^(?:the |my )/, '') };
  m = t.match(LIST_START);
  if (m && m[1].split(" ").length <= 2 && !/\b(?:to|and|from|on|my|of|in|document|doc|the|with|for|me|us)\b/.test(m[1])) return { intent: 'list.start', list: m[1].trim() || 'to-do' };
  const deg = degree(t);
  if (deg) return { intent: 'degree', degree: deg };
  m = t.match(NOT_THAT);
  if (m) return { intent: 'repair', how: 'retarget', content: m[1] ? plain(m[1]) : null };
  if (BARE_OTHER.test(t) && ctx.hasAction) return { intent: 'repair', how: 'retarget', content: 'the other one' };
  for (const re of REPAIR_CORRECT) {
    m = t.match(re);
    if (!m) continue;
    const content = plain(m[1]);
    const ws = content.split(' ');
    if (ws.length > 5 || SENTENCE_STARTERS.has(ws[0])) continue;
    if (re === REPAIR_CORRECT[2] && !ctx.hasAction) continue;
    return { intent: 'repair', how: 'replace', content };
  }
  m = t.match(NOT_X);
  if (m && ctx.hasAction) return { intent: 'repair', how: 'replace', content: plain(m[2]), not: plain(m[1]) };
  return null;
}

// ---- attribute and ordinal references ---------------------------------------------------------------------------------------

const QUANT = /^(both|all|each|every)(?: of)?(?: the)?(?: (.+))?$/;
const nounKind = (w, refs) => {
  const forms = new Set([w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y')]);
  return refs.find((r) => (r.words ?? [r.noun]).some((x) => forms.has(x)))?.kind ?? null;
};
const colourOf = (r) => String(r.attrs?.color ?? '');
const byCoord = (key) => (a, b) => (a.attrs?.[key] ?? 0) - (b.attrs?.[key] ?? 0);

/**
 * Resolve a reference phrase against `refs` ([{ id, kind, noun, words, attrs, salient }], document order).
 *   "the red one" -> attr; "the second one" / "the last house" -> ordinal; "the big one" -> size; "the left one" -> position;
 *   "the other one" -> other (not the salient ones); "both" / "all the trees" / "each circle" -> quantifier.
 * Returns { type, matches, kind?, complete } or null when the phrase is not a reference. `matches` is the list of
 * referents it can denote; one match is a resolution, several mean the phrase is ambiguous.
 */
export function resolveReference(phrase, refs, { prefer = null, lang } = {}) {
  const { ordinal, position, size, colour, COLOURS, SHADES } = lang;
  const t = plain(phrase).replace(/^(?:the|that|this|those|these)\s+/, '');
  if (!t || !refs?.length) return null;
  let m = t.match(QUANT);
  if (m) {
    const noun = m[2] ? m[2].split(' ').at(-1) : null;
    const kind = noun ? nounKind(noun, refs) : (/^(?:them|ones|things|of them)$/.test(m[2] ?? '') ? null : undefined);
    if (noun && !kind && !/^(?:them|ones|things)$/.test(noun)) return null;
    const matches = kind ? refs.filter((r) => r.kind === kind) : refs;
    if (m[1] === 'both' && matches.length !== 2) return { type: 'quantifier', quant: 'both', matches, kind: kind ?? null, complete: false };
    return { type: 'quantifier', quant: m[1], matches, kind: kind ?? null, complete: matches.length > 0 };
  }
  const ws = t.split(' ');
  const head = ws.at(-1);
  const oneWord = /^(?:one|ones|thing|things)$/.test(head);
  const kind = oneWord ? null : nounKind(head, refs);
  if (!oneWord && !kind) return null;
  const adjs = ws.slice(0, -1);
  if (!adjs.length && oneWord) return null;
  let matches = kind ? refs.filter((r) => r.kind === kind) : [...refs];
  let type = 'attr';
  const used = [];
  const colourWords = adjs.filter((w) => COLOURS.includes(w) || SHADES.includes(w));
  if (colourWords.length) {
    const c = colour(colourWords);
    const exact = matches.filter((r) => colourOf(r) === c);
    matches = exact.length ? exact : matches.filter((r) => colourOf(r).split(' ').at(-1) === c.split(' ').at(-1));
    used.push('colour');
  }
  const ord = adjs.map(ordinal).find((x) => x != null);
  const other = adjs.includes('other') || adjs.includes('another');
  const pos = adjs.map(position).find(Boolean);
  const sz = adjs.map(size).find(Boolean);
  if (pos) {
    const sorted = [...matches].sort(pos === 'left' || pos === 'right' ? byCoord('x') : byCoord('y'));
    if (sorted.length) matches = [pos === 'left' || pos === 'top' ? sorted[0] : sorted.at(-1)];
    type = 'position'; used.push('position');
  }
  if (sz && !pos) {
    const sorted = [...matches].sort(byCoord('size'));
    const group = new Set(matches.map((r) => r.kind));
    if (sorted.length > 1 && group.size === 1) matches = [sz === 'big' ? sorted.at(-1) : sorted[0]];
    else if (sorted.length > 1) {
      const lo = sorted[0].attrs.size, hi = sorted.at(-1).attrs.size;
      matches = sorted.filter((r) => r.attrs.size === (sz === 'big' ? hi : lo));
    }
    type = 'size'; used.push('size');
  }
  if (ord != null) {
    let pool = matches;
    if (!kind) {
      // no noun: count over everything, in order ("the last one" is the last thing)
    }
    matches = ord === -1 ? pool.slice(-1) : pool[ord - 1] ? [pool[ord - 1]] : [];
    type = 'ordinal'; used.push('ordinal');
  }
  if (other) {
    const salient = new Set(refs.filter((r) => r.salient).map((r) => r.id));
    const sameKind = prefer ?? refs.find((r) => r.salient)?.kind ?? null;
    let pool = matches.filter((r) => !salient.has(r.id));
    if (sameKind) pool = pool.filter((r) => r.kind === sameKind);
    matches = pool;
    type = 'other'; used.push('other');
  }
  if (!used.length && !kind) return null;
  if (!used.length && kind) return { type: 'noun', matches, kind, complete: matches.length === 1 };
  return { type, matches, kind: kind ?? (new Set(matches.map((r) => r.kind)).size === 1 ? matches[0]?.kind : null), complete: matches.length === 1 };
}

/** A phrase that denotes exactly this referent among `refs`: "the red house", else "the second house" (by order within the kind). */
export function describeReferent(ref, refs, lang) {
  const same = refs.filter((r) => r.kind === ref.kind);
  if (same.length === 1) return `the ${ref.noun}`;
  const c = colourOf(ref);
  if (c && same.filter((r) => colourOf(r) === c).length === 1) return `the ${c} ${ref.noun}`;
  const i = same.findIndex((r) => r.id === ref.id) + 1;
  const o = i === same.length ? 'last' : lang.ordinalWord(i);
  return o ? `the ${o} ${ref.noun}` : `the ${ref.noun}`;
}

/** Match a reply to a "which one" question: option by reference words ("the red one", "the first", "blue", "the second house"). */
export function chooseOption(reply, options, lang) {
  const t = plain(reply).replace(/^(?:the|that|this)\s+/, '').replace(/^(?:i mean |i meant |i want |i said |it is |its |um |uh )/, '').replace(/^(?:the|that|this)\s+/, '');
  if (!t) return null;
  const words = t.replace(/\b(?:one|ones|please|pls)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const ord = words.map(lang.ordinal).find((x) => x != null);
  if (ord != null) { const o = ord === -1 ? options.at(-1) : options[ord - 1]; return o ? [o] : null; }
  if (/^(?:both|all|each|every)/.test(t)) return options;
  let hits = options;
  const pool = words.filter((w) => !['of', 'and', 'or', 'a', 'an'].includes(w));
  if (!pool.length) return null;
  for (const w of pool) {
    const next = hits.filter((o) => plain(o.label).split(' ').includes(w) || (o.attrs ?? []).includes(w));
    if (next.length) hits = next; else return null;
  }
  return hits.length ? hits : null;
}

