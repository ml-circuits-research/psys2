/**
 * Operation descriptions (E3, spec 03 section 2c). Browser-safe, pure: no node imports.
 *
 * An operation is described by wires, in SOP Lang only (no notation inside a string):
 *   core.describe        the operation: `op`, `intent`, `emit`, `frames` / `skip` (repeated), `priority`, `shortPriority`, `bareVerb`, `kind`, `requires` (repeated), `effect`
 *   core.describe.arg    one per argument: `of=$<describe>`, `name`, `class` (a lexicon id, `number`, `rest`, `noun`, `words`), `size` (the maximum of `words`),
 *                        `optional=true`, `qty=<count slot>` (a quantified item: "2 balls" or "a ball"), `slot=<type>.<key>` (the slot of the world's legend the argument fills:
 *                        the one declaration from which the host derives the library's judgement of a host-run action and the check of what the reading names, spec 16 section 8)
 *   core.describe.words  the wording of one language: `of=$<describe>`, `lang`, and the words of each role as repeated keys whose values are `core.word` wires:
 *                        `verb tverb noun ask rest pre mid subject`, and for an argument `prep.<name> det.<name> unit.<name>`; `nosubject=true`;
 *                        `sample.<slot>=value` (example values), `example` (extra example sentences)
 *   core.word            `text= means= [of=]`: `means` is the operation's emit key (verbs, nouns, openers, rest, subject words) or `<op>.<argument>` (words that
 *                        introduce an argument, its determiners, its units). A word is stated once and read by the generator, by the library's `interpret` and by scoring.
 * `describePatterns` generates the ordinary `core.pattern` objects of the request / question / statement forms from a table of FRAMES (the grammar of asking,
 * commanding and stating, written once here for English, in `lang/<lang>/frames.sop` for another language), so a world never spells a sentence. Shapes
 * (`core.shape`, spec 03 section 2b) stay the family-specific generator for single-object operations; a description is the more general form.
 *
 * Roles: verb (imperative of a command, first-person verb of a statement, verb of a `can I ...` question), tverb (trailing verbs of a question: "how much do 2 pens COST"),
 * noun (the thing asked for, "the PRICE of a pen"), ask (stand-alone openers: "how much"), rest (words that complete the sentence, optional), pre / mid (the opener of the
 * first clause of a compound question and the words between its two clauses), subject (default `i`).
 * Emit templates: `{slot}` placeholders; an optional quantified argument that is absent drops the tokens / lines that use it.
 */
import { exampleSentences } from '../formalizer/rules/shapes.mjs?v=5d5cc75c7e';
import { get, getAll } from '../soplang/index.mjs?v=26885599a7';

export const INTENT_FRAMES = {
  command: ['imp', 'wish', 'ind', 'can', 'short', 'phr'],
  query: ['qnoun', 'tell', 'ask', 'poss', 'last', 'cond', 'compound', 'canq', 'canlast', 'rev', 'bare', 'phr'],
  statement: ['stmt', 'about', 'phr'],   // `pred` ("a ball COSTS 7 lei": first argument, verb, the other arguments) only when listed in `frames`
};
export const SHORT_PENALTY = 2;

const LEAD = '[$lang.lead.filler|pls|plz]? [$lang.lead.polite]?';
const TAIL = '[$lang.tail.filler]?';
const grp = (alts, optional) => `[${alts.join('|')}]${optional ? '?' : ''}`;   // alts: an array of words (`_` joins the words of one alternative)
/** Language settings of the generator: English here; another language supplies its own (`lang/<lang>/frames.sop`, read by the loader). */
export const EN = { lang: 'en', frames: null, intentFrames: null, lead: null, tail: null, article: 'a|an|the', determiners: 'the|a|an|all|all_the|my', ofPrep: 'of|for|on|in|of_the|of_your' };
const words = (s) => s.split(/\s+/).filter(Boolean).join(' ');

/** Frame templates. Tokens: <L> <T> <V> <TV> <N> <Q> <R> <S> <A> (the argument sequence), <ANY> (arguments optional too). A frame that needs a token the description lacks is skipped. */
export const FRAMES = {
  imp: { tpl: '<L> <V> [me]? <DN?> <A> <R?> <T>', needs: ['V'] },
  wish: { tpl: '<L> [$lang.shape.wishto] <V> <DN?> <A> <R?> <T>', needs: ['V'] },
  ind: { tpl: '[$lang.shape.ind] <V> <DN?> <A> <R?> <T>', needs: ['V'] },
  can: { tpl: '<L> [$lang.shape.can] [i|we|you|u|ya] <V> <DN?> <A> <R?> <T>', needs: ['V'] },
  short: { tpl: '<L> <A> <T>', needs: ['A'], short: true },
  qnoun: { tpl: '<L> [$lang.shape.whatis] [the]? <N> <A> <R?> <T>', needs: ['N'], ofprep: true },
  'qnoun.2': { tpl: '<L> [$lang.shape.what] <N> [is|are|do|does]? <A> <R?> <T>', needs: ['N'], ofprep: true },
  tell: { tpl: '<L> [$lang.shape.tellme] [the]? <N> <A> <R?> <T>', needs: ['N'], ofprep: true },
  'tell.tv': { tpl: '<L> [$lang.shape.tellme] [what|how_much]? <A> <TV> <R?> <T>', needs: ['TV', 'A'] },
  ask: { tpl: '<L> <Q> [is|are|do|does|did|will|would|can|could]? <NN?> <A> <TV?> <R?> <T>', needs: ['Q'] },
  canlast: { tpl: '<L> <A> [,]? [can|could|may|might|will|would] [i|we|you|u]? <V> [for_them|it|them|that|this]? <R?> <T>', needs: ['V', 'A'] },
  canq: { tpl: '<L> [can|could|may|might|will|would] [i|we|you|u]? <V> <A> <R?> <T>', needs: ['V'] },
  asn: { tpl: '<L> <V> <A> [as|for|to_be|as_the|as_my] [a|the|my]? <N> <T>', needs: ['V', 'N', 'A'], mid: true },
  poss: { tpl: "<L> [$lang.shape.whatis]? <A> 's <N> <R?> <T>", needs: ['N', 'A'] },
  rev: { tpl: '<L> <A> <N> <R?> <T>', needs: ['N', 'A'], short: true },
  bare: { tpl: '<L> <N> <A> <R?> <T>', needs: ['N', 'A'], short: true, ofprep: true },
  last: { tpl: '<L> <A> <TV?> [,]? <Q> <NN?> <R?> <T>', needs: ['Q', 'A'] },
  cond: { tpl: '<L> [if|when|after|once|suppose] <SJ> <V> <A> [,|then]? <Q> <NN?> <TV?> <R?> <T>', needs: ['Q', 'V', 'A'] },
  compound: { tpl: '<L> <PRE> <AI> [and|,]? <MID> <AP> [,]? <Q> <NN?> <R?> <T>', needs: ['Q', 'PRE', 'MID', 'AI', 'AP'] },
  phr: { tpl: '<L> <P> <A> <R?> <T>', needs: ['P'] },   // a shared intent group of lang.common ("new game", "give up") followed by the arguments
  stmt: { tpl: '<SJ> <V> <A> <R?> <T>', needs: ['V'] },
  pred: { tpl: '<L> <A0> <V> <A+> <R?> <T>', needs: ['V', 'A'] },
  askpred: { tpl: '<L> <Q> <A0> <V> <A+> <R?> <T>', needs: ['Q', 'V', 'A'] },
  about: { tpl: '[my|the] <N> [has|had|is|was|holds|contains] <A> <R?> <T>', needs: ['N', 'A'] },
};

/** An argument as the generator uses it, from its `core.describe.arg` fields and the words of the language (`prep`, `det`, `unit`: arrays of words). */
export function makeArg({ name, cls, optional = false, qty = null, size = null }, words = {}) {
  if (!name || !cls) throw new Error(`argument needs name and class (got ${JSON.stringify({ name, cls })})`);
  return { name, cls: size && cls === 'words' ? `words(${size})` : cls, optional: !!optional, qty: qty ?? null, prep: words.prep?.length ? words.prep : null, det: words.det?.length ? words.det : null, unit: words.unit?.length ? words.unit : null };
}

/** The alternatives of one argument: `[{ text: match fragment, subst: {slot: literal}, absent: [slots to drop from the emit] }]`. */
function argVariants(a, full = false, defaultPrep = null, lg = EN) {
  const pre = (a.prep || defaultPrep ? `${grp(a.prep ?? defaultPrep, !full)} ` : '');   // `full`: the words are mandatory (used to write a natural example sentence)
  const det = (a.det ? `${grp(a.det, !full)} ` : '');
  const unit = a.unit ? ` ${grp(a.unit, !full)}` : '';
  const slot = `{${a.name}:${a.cls}${a.optional && !a.qty ? '?' : ''}}`;
  if (!a.qty) return [{ text: `${pre}${det}${slot}${unit}`, subst: {}, absent: [] }];
  const out = [
    { text: `${pre}{${a.qty}:number} ${slot}`, subst: {}, absent: [] },
    { text: `${pre}[${lg.article}]? ${slot}`, subst: { [a.qty]: '1' }, absent: [] },   // an article, or none: "a ball", "puzzle"
  ];
  if (a.optional) out.push({ text: '', subst: {}, absent: [a.name, a.qty] });
  return out;
}

const cartesian = (lists) => lists.reduce((acc, l) => acc.flatMap((x) => l.map((y) => ({ text: words(`${x.text} ${y.text}`), parts: [...x.parts, y.text], subst: { ...x.subst, ...y.subst }, absent: [...x.absent, ...y.absent] }))), [{ text: '', parts: [], subst: {}, absent: [] }]);

function applyEmit(emit, subst, absent) {
  const lines = emit.split('\n').filter((l, i) => i === 0 || !absent.some((s) => l.includes(`{${s}}`)));   // a later line that uses an absent argument goes; in the first line only its tokens go
  return lines.map((l) => l.split(' ').filter((t) => !absent.some((s) => t.includes(`{${s}}`))).join(' ')
    .replace(/\{(\w+)\}/g, (all, k) => subst[k] ?? all)).join('\n');
}

/**
 * Generate the pattern objects of one description: `[{ id, form, match, emit, kind, priority, example: [] }]`.
 * @param {object} d  { id (without `describe.`), op, intent, emit, args: [makeArg(...)], verb, tverb, noun, ask, rest, pre, mid, subject (arrays of words), noSubject, frames, skip (arrays),
 *                      priority, shortPriority, bareVerb (boolean), kind, sample ({slot: value}), example (array) }
 * @param {object} [o]  { phrases, lexicons, lg } `lg` are the language settings (`EN` by default; `lg.frames`, `lg.intentFrames`, `lg.lead`, `lg.tail` replace the English tables)
 */
export function describePatterns(d, { phrases = null, lexicons = null, lg = EN } = {}) {
  const intent = d.intent;
  const FR = lg.frames ?? FRAMES, IF = lg.intentFrames ?? INTENT_FRAMES;
  if (!IF[intent]) throw new Error(`describe '${d.id}': unknown intent '${intent}' (${Object.keys(IF).join(', ')})`);
  if (!d.emit) throw new Error(`describe '${d.id}': no emit`);
  const args = d.args ?? [];
  const names = new Set(args.map((a) => a.name));
  for (const t of d.emit.match(/\{(\w+)\}/g) ?? []) {
    const n = t.slice(1, -1);
    if (/^_\d*$/.test(n)) continue;
    if (!names.has(n) && !args.some((a) => a.qty === n)) throw new Error(`describe '${d.id}': emit uses {${n}} which no arg declares`);
  }
  const want = d.frames?.length ? d.frames : IF[intent];
  const skip = new Set(d.skip ?? []);
  const sample = d.sample ?? {};
  const has = (k) => d[k]?.length > 0;
  const out = [];
  const tokenValue = {
    V: has('verb') ? grp(d.verb) : null, TV: has('tverb') ? grp(d.tverb) : null, 'TV?': has('tverb') ? grp(d.tverb, true) : '',
    N: has('noun') ? grp(d.noun) : null, 'NN?': has('noun') ? grp(d.noun, true) : '', Q: has('ask') ? grp(d.ask) : null,
    'DN?': has('noun') && intent === 'command' ? `[${lg.determiners}]? ${grp(d.noun, !!d.bareVerb)}` : '', PRE: has('pre') ? grp(d.pre) : null, MID: has('mid') ? grp(d.mid) : null,
    P: has('phrase') ? `[${d.phrase.join('|')}]` : null,
    'R?': has('rest') ? grp(d.rest, true) : '', SJ: d.noSubject ? '' : grp(has('subject') ? d.subject : ['i']), L: lg.lead ?? LEAD, T: lg.tail ?? TAIL,
  };
  for (const frameName of want) {
    if (skip.has(frameName)) continue;
    const bases = frameName === 'qnoun' ? ['qnoun', 'qnoun.2'] : frameName === 'tell' ? ['tell', 'tell.tv'] : [frameName];
    for (const fn of bases) {
      const f = FR[fn];
      if (!f) { if (lg !== EN) continue; throw new Error(`describe '${d.id}': unknown frame '${fn}'`); }   // a language may not have every frame of English
      if (f.needs.some((n) => (n === 'A' ? !args.length : n === 'AI' ? !args.some((a) => a.qty) : n === 'AP' ? !args.some((a) => !a.qty) : tokenValue[n] == null))) continue;
      const dp = (i) => (f.ofprep && i === 0 ? lg.ofPrep.split('|') : null);   // the thing asked about: "the capital OF Japan"
      const variants = cartesian(args.map((a, i) => argVariants(a, false, dp(i), lg)));
      const fullVariants = cartesian(args.map((a, i) => argVariants(a, true, dp(i), lg)));
      const render = (v) => {
        let m = f.tpl.replace(/<A>/g, f.mid ? v.text.replace(/:rest\}/g, ':words(25)}') : v.text).replace(/<AI>/g, words(v.parts.filter((_, i) => args[i].qty).join(' '))).replace(/<AP>/g, words(v.parts.filter((_, i) => !args[i].qty).join(' '))).replace(/<A0>/g, v.parts[0] ?? '').replace(/<A\+>/g, words(v.parts.slice(1).join(' ')));
        for (const [k, val] of Object.entries(tokenValue)) m = m.split(`<${k}>`).join(val);
        return words(m.replace(/<\w+\??>/g, ''));
      };
      for (const [vi, v] of variants.entries()) {
        const match = render(v);
        const emit = applyEmit(d.emit, v.subst, v.absent);
        const kind = d.kind ?? (intent === 'query' ? 'question' : intent === 'command' ? 'request' : 'statement');
        const base = Number(d.priority ?? 12);
        const id = `${d.id}.${fn}${variants.length > 1 ? `.${vi}` : ''}`;
        const ex = exampleSentences(render(fullVariants[vi]), { phrases, lexicons, sample, det: null });
        out.push({ id, form: f.short ? 'short' : fn, match, emit, kind, priority: f.short ? Number(d.shortPriority ?? base - SHORT_PENALTY) : base, example: ex });
      }
    }
  }
  if (d.example?.length && out.length) out[0].example = [...new Set([...d.example, ...out[0].example])].slice(0, 6);
  return out;
}

/** Emit key of an emit template: the `action=` of a request, else the `type=` of a question, else the first type token. */
export function emitKey(emit) {
  if (!emit) return null;
  return /action=([\w.]+)/.exec(emit)?.[1] ?? /type=([\w.]+)/.exec(emit)?.[1] ?? /^@\{_\d*\}\s+([\w.]+)/.exec(emit)?.[1] ?? null;
}

// ---- reading the wires --------------------------------------------------------------------------------------------------------------

/** The token of a `core.word` text in a match string: spaces and apostrophes become `_` ("how much" -> how_much). */
export const wordToken = (text) => String(text).trim().replace(/[\s']+/g, '_');
/** Diacritics folded away (a language pack's words and the text it reads are both folded: `plătește` = `plateste`). */
export const foldText = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const ROLES = ['verb', 'tverb', 'noun', 'ask', 'rest', 'pre', 'mid', 'subject'];
/** A shared intent group: `phrase=$phrase.lang.intent.newgame` is the group token `$lang.intent.newgame` of the match language. */
const phraseToken = (ref) => `$${refId(ref).replace(/^phrase\./, '')}`;
const val = (x, k) => get(x, k)?.v;
const refId = (v) => (v == null ? v : String(v).replace(/^\$/, ''));

/**
 * Read the `core.describe*` and `core.word` wires of one source (a world's `describe.sop`, or a language pack) into descriptions.
 * A language pack adds wording (`core.describe.words` of another `lang`) and words to the descriptions of the world: pass the result of the first read as `into`.
 * @param {object[]} wires  parsed wires
 * @param {object} [into]   `{ descriptions: Map(wire id -> description), words: Map(wire id -> { id, text, means, of }), errors: [] }`
 */
export function readDescriptionWires(wires, into = null) {
  const out = into ?? { descriptions: new Map(), words: new Map(), errors: [] };
  const err = (m) => out.errors.push(m);
  for (const x of wires) if (x.type === 'core.word') out.words.set(x.id, { id: x.id, text: val(x, 'text'), means: val(x, 'means'), of: val(x, 'of') ?? null });
  for (const x of wires) {
    if (x.type !== 'core.describe') continue;
    out.descriptions.set(x.id, {
      id: x.id.replace(/^describe\./, ''), wireId: x.id, wire: x, op: val(x, 'op'), intent: val(x, 'intent'), emit: val(x, 'emit'),
      frames: getAll(x, 'frames').map((v) => v.v), skip: getAll(x, 'skip').map((v) => v.v),
      priority: val(x, 'priority') == null ? undefined : Number(val(x, 'priority')), shortPriority: val(x, 'shortPriority') == null ? undefined : Number(val(x, 'shortPriority')),
      bareVerb: String(val(x, 'bareVerb')) === 'true', kind: val(x, 'kind'), requires: getAll(x, 'requires').map((v) => v.v), effect: val(x, 'effect'),
      args: [], words: new Map(),
    });
  }
  for (const x of wires) {
    if (x.type !== 'core.describe.arg') continue;
    const d = out.descriptions.get(refId(val(x, 'of')));
    if (!d) { err(`argument ${x.id}: of=${val(x, 'of')} is not a described operation`); continue; }
    d.args.push({ name: val(x, 'name'), cls: val(x, 'class'), optional: String(val(x, 'optional')) === 'true', qty: val(x, 'qty') ?? null, size: val(x, 'size') ?? null, slot: val(x, 'slot') ?? null });
  }
  for (const x of wires) {
    if (x.type !== 'core.describe.words') continue;
    const d = out.descriptions.get(refId(val(x, 'of')));
    const lang = val(x, 'lang');
    if (!d) { err(`words ${x.id}: of=${val(x, 'of')} is not a described operation`); continue; }
    if (!lang) { err(`words ${x.id}: no lang`); continue; }
    const w = { lang, wire: x, frames: getAll(x, 'frames').map((v) => v.v), skip: getAll(x, 'skip').map((v) => v.v), noSubject: String(val(x, 'nosubject')) === 'true', sample: {}, example: getAll(x, 'example').map((v) => v.v), roles: {}, argWords: {} };
    const resolve = (ref, expectMeans, where) => {
      const wd = out.words.get(refId(ref));
      if (!wd) { err(`${x.id}: ${where} refers to ${ref}, which is not a core.word wire`); return null; }
      if (wd.means !== expectMeans) err(`${x.id}: ${where} word ${wd.id} means ${wd.means}, expected ${expectMeans}`);
      return wordToken(wd.text);
    };
    w.roles.phrase = getAll(x, 'phrase').map((v) => phraseToken(v.v));
    for (const r of ROLES) w.roles[r] = getAll(x, r).map((v) => resolve(v.v, d.op, r)).filter(Boolean);
    for (const e of x.entries) {
      const m = /^(prep|det|unit)\.(\w+)$/.exec(e.key);
      if (m) { const t = resolve(e.value.v, `${d.op}.${m[2]}`, e.key); if (t != null) ((w.argWords[m[2]] ??= {})[m[1]] ??= []).push(t); }
      const sm = /^sample\.(\w+)$/.exec(e.key);
      if (sm) w.sample[sm[1]] = String(e.value.v);
    }
    for (const name of Object.keys(w.argWords)) if (!d.args.some((a) => a.name === name)) err(`${x.id}: words for an argument '${name}' that ${d.wireId} does not declare`);
    d.words.set(lang, w);
  }
  return out;
}

/**
 * The part of a `describe.sop` that declares what the arguments fill: every `core.describe.arg` wire that has a `slot=` and the `core.describe` wire it belongs to, as SOP text.
 * The host reads (and the webchat ships) only this, so a description with wording costs nothing when it is not used to generate patterns (spec 16 section 8). '' when there is none.
 */
export function slotDeclarations(text) {
  if (text == null || !text.includes('slot=')) return '';
  const chunks = String(text).split(/\n[ \t]*\n/);
  const head = (c) => /^@(\S+)\s+(core\.describe(?:\.arg)?)\b/m.exec(c);
  const arg = chunks.filter((c) => head(c)?.[2] === 'core.describe.arg' && /^\s*slot=/m.test(c));
  const wanted = new Set(arg.map((c) => /^\s*of=\$?(\S+)/m.exec(c)?.[1]).filter(Boolean));
  const desc = chunks.filter((c) => head(c)?.[2] === 'core.describe' && wanted.has(head(c)[1]));
  return [...desc, ...arg].map((c) => c.replace(/^\s*\n/, '').trimEnd()).join('\n\n') + (arg.length ? '\n' : '');
}

/** The input of `describePatterns` for one description in one language, or null when the description has no wording in it. */
export function descriptionFor(desc, lang) {
  const w = desc.words.get(lang);
  if (!w) return null;
  return {
    id: desc.id, op: desc.op, intent: desc.intent, emit: desc.emit, frames: w.frames.length ? w.frames : desc.frames, skip: w.skip.length ? w.skip : desc.skip, priority: desc.priority, shortPriority: desc.shortPriority,
    bareVerb: desc.bareVerb, kind: desc.kind, args: desc.args.map((a) => makeArg(a, w.argWords[a.name] ?? {})), noSubject: w.noSubject, sample: w.sample, example: w.example,
    verb: w.roles.verb, tverb: w.roles.tverb, noun: w.roles.noun, ask: w.roles.ask, rest: w.roles.rest, pre: w.roles.pre, mid: w.roles.mid, subject: w.roles.subject, phrase: w.roles.phrase,
  };
}
