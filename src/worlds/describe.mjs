/**
 * Operation descriptions (E3, spec 03 section 2c). Browser-safe, pure: no node imports.
 *
 * A `core.describe` wire states ONE operation once, by roles and words: what the operation emits, which arguments it takes (role name,
 * lexicon class, the words that introduce the argument), the words for the action and for the thing it is about. `describePatterns`
 * generates the ordinary `core.pattern` objects of its request / question / statement forms from a small table of FRAMES (the grammar of
 * asking, commanding and stating, written once here and in the `lang.*` phrase groups of `lang.common`), so a world never spells a
 * sentence. Shapes (`core.shape`, spec 03 section 2b) stay the family-specific generator for single-object operations; a description
 * is the more general form (several arguments, quantified items, optional arguments, statements).
 *
 * Description keys (strings as read from the wire; `arg` is repeated):
 *   op        the operation's emit key: `action=` of a request or `type=` of a question, or the statement type (the first token after `@{_}`)
 *   intent    command | query | statement
 *   emit      emit template ({slot} placeholders; an optional quantified argument that is absent drops the tokens / lines that use it)
 *   arg       `name:class[?][*qty][;prep=a|b][;det=a|b][;unit=a|b]`: one argument role.
 *             `class` is a lexicon id, `number`, `rest`, `words(N)`; `?` marks an optional argument; `*qty` names the count slot of an item
 *             (the item is written `{qty:number} {name:class}` with emit `{qty}`, or `[a|an|the]? {name:class}` with the literal 1; an optional
 *             quantified argument also has the form without it); `prep` the words that introduce it (optional in the sentence); `det` the
 *             determiners before it; `unit` the optional unit words after a number.
 *   verb      verbs of the action (imperative of a command, first-person verb of a statement, verb of a `can I ...` question)
 *   tverb     trailing verbs of a question ("how much do 2 pens COST")
 *   noun      the nouns of the thing asked for ("the PRICE of a pen"), or the thing a statement is about
 *   ask       question openers that stand alone ("how_far", "how_much")
 *   rest      words that complete the sentence after the arguments or the verb ("do_i_have", "the_map"), optional
 *   pre       words that open the first clause of a compound question ("i_want|i_would_like_to_buy"), `mid` the words between its two clauses ("and_i_pay")
 *   subject   subject words of a statement (default `i`)
 *   frames    comma list of frames to generate (default: every frame of the intent)
 *   skip      comma list of frames to leave out
 *   bareVerb  `true`: the verb alone is the command ("undo", "redo"); the noun after it is optional
 *   shortPriority  priority of the `short` frames (default priority - 2)
 *   priority  base priority (default 12); `short` frames get priority - 2
 *   kind      overrides the default kind (query: question, command: request, statement: statement)
 *   sample    example words per slot, `a=Paris;b=Rome`
 *   example   extra examples, put first on the first pattern
 *   requires  (documentation) the matrix deny ids that act as preconditions of the operation
 *   effect    (documentation) the state change or answer the operation produces
 */
import { exampleSentences } from '../formalizer/rules/shapes.mjs';

export const INTENT_FRAMES = {
  command: ['imp', 'wish', 'ind', 'can', 'short'],
  query: ['qnoun', 'tell', 'ask', 'poss', 'last', 'cond', 'compound', 'canq', 'canlast', 'rev', 'bare'],
  statement: ['stmt', 'about'],   // `pred` ("a ball COSTS 7 lei": first argument, verb, the other arguments) only when listed in `frames`
};
export const SHORT_PENALTY = 2;

const LEAD = '[$lang.lead.filler|pls|plz]? [$lang.lead.polite]?';
const TAIL = '[$lang.tail.filler]?';
const grp = (alts, optional) => `[${alts.split('|').map((a) => a.trim()).filter(Boolean).join('|')}]${optional ? '?' : ''}`;
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
  stmt: { tpl: '<SJ> <V> <A> <R?> <T>', needs: ['V'] },
  pred: { tpl: '<L> <A0> <V> <A+> <R?> <T>', needs: ['V', 'A'] },
  about: { tpl: '[my|the] <N> [has|had|is|was|holds|contains] <A> <R?> <T>', needs: ['N', 'A'] },
};

/** Parse one `arg` value. */
export function parseArg(spec) {
  const [head, ...opts] = spec.split(';').map((s) => s.trim());
  const m = /^(\w+):([\w.-]+(?:\([^()]*\))?)(\?)?(?:\*(\w+))?$/.exec(head);
  if (!m) throw new Error(`bad arg '${spec}' (name:class[?][*qty][;prep=..][;det=..][;unit=..])`);
  const a = { name: m[1], cls: m[2], optional: !!m[3], qty: m[4] ?? null, prep: null, det: null, unit: null };
  for (const o of opts) {
    const [k, v] = o.split('=');
    if (!['prep', 'det', 'unit'].includes(k) || v == null) throw new Error(`bad arg option '${o}' in '${spec}'`);
    a[k] = v;
  }
  return a;
}

/** The alternatives of one argument: `[{ text: match fragment, subst: {slot: literal}, absent: [slots to drop from the emit] }]`. */
function argVariants(a, full = false, defaultPrep = null) {
  const pre = (a.prep || defaultPrep ? `${grp(a.prep ?? defaultPrep, !full)} ` : '');   // `full`: the words are mandatory (used to write a natural example sentence)
  const det = (a.det ? `${grp(a.det, !full)} ` : '');
  const unit = a.unit ? ` ${grp(a.unit, !full)}` : '';
  const slot = `{${a.name}:${a.cls}${a.optional && !a.qty ? '?' : ''}}`;
  if (!a.qty) return [{ text: `${pre}${det}${slot}${unit}`, subst: {}, absent: [] }];
  const out = [
    { text: `${pre}{${a.qty}:number} ${slot}`, subst: {}, absent: [] },
    { text: `${pre}[a|an|the]? ${slot}`, subst: { [a.qty]: '1' }, absent: [] },   // an article, or none: "a ball", "puzzle"
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
 * @param {object} d  { id (without `describe.`), op, intent, emit, args: [parseArg...], verb, tverb, noun, ask, rest, pre, mid, subject, frames, skip, priority, kind, sample, example }
 */
export function describePatterns(d, { phrases = null, lexicons = null } = {}) {
  const intent = d.intent;
  if (!INTENT_FRAMES[intent]) throw new Error(`describe '${d.id}': unknown intent '${intent}' (${Object.keys(INTENT_FRAMES).join(', ')})`);
  if (!d.emit) throw new Error(`describe '${d.id}': no emit`);
  const args = (d.args ?? []).map(parseArg);
  const names = new Set(args.map((a) => a.name));
  for (const t of d.emit.match(/\{(\w+)\}/g) ?? []) {
    const n = t.slice(1, -1);
    if (/^_\d*$/.test(n)) continue;
    if (!names.has(n) && !args.some((a) => a.qty === n)) throw new Error(`describe '${d.id}': emit uses {${n}} which no arg declares`);
  }
  const want = d.frames ? d.frames.split(',').map((s) => s.trim()).filter(Boolean) : INTENT_FRAMES[intent];
  const skip = new Set((d.skip ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const sample = Object.fromEntries((d.sample ?? '').split(/[;,]/).map((x) => x.trim().split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const out = [];
  const tokenValue = {
    V: d.verb ? grp(d.verb) : null, TV: d.tverb ? grp(d.tverb) : null, 'TV?': d.tverb ? grp(d.tverb, true) : '',
    N: d.noun ? grp(d.noun) : null, 'NN?': d.noun ? grp(d.noun, true) : '', Q: d.ask ? grp(d.ask) : null,
    'DN?': d.noun && intent === 'command' ? `[the|a|an|all|all_the|my]? ${grp(d.noun, d.bareVerb === 'true')}` : '', PRE: d.pre ? grp(d.pre) : null, MID: d.mid ? grp(d.mid) : null,
    'R?': d.rest ? grp(d.rest, true) : '', SJ: (d.subject ?? 'i') === '' ? '' : grp(d.subject ?? 'i'), L: LEAD, T: TAIL,
  };
  for (const frameName of want) {
    if (skip.has(frameName)) continue;
    const bases = frameName === 'qnoun' ? ['qnoun', 'qnoun.2'] : frameName === 'tell' ? ['tell', 'tell.tv'] : [frameName];
    for (const fn of bases) {
      const f = FRAMES[fn];
      if (!f) throw new Error(`describe '${d.id}': unknown frame '${fn}'`);
      if (f.needs.some((n) => (n === 'A' ? !args.length : n === 'AI' ? !args.some((a) => a.qty) : n === 'AP' ? !args.some((a) => !a.qty) : tokenValue[n] == null))) continue;
      const dp = (i) => (f.ofprep && i === 0 ? 'of|for|on|in|of_the|of_your' : null);   // the thing asked about: "the capital OF Japan"
      const variants = cartesian(args.map((a, i) => argVariants(a, false, dp(i))));
      const fullVariants = cartesian(args.map((a, i) => argVariants(a, true, dp(i))));
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
