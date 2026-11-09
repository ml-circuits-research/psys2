/**
 * Request shapes (L6, spec 03 section 2b, ADR-007). Browser-safe, pure: no node imports.
 *
 * A `core.shape` wire declares ONE operation (family + verbs + object slot + value slot + emit) and `expandShape` generates the
 * ordinary `core.pattern` objects for its request forms (imperative, question, wish, indirect, word order, short, state, options).
 * The generated patterns use the phrase macros `lang.shape.*` and `lang.lead.*` / `lang.tail.*` of `lang.common`, so the same
 * phrasing is written once for all worlds.
 *
 * Shape fields (all strings, as read from the wire):
 *   family   set | do | ask.value | ask.count | ask.exists | list
 *   verb     alternatives `a|b|c` (`_` joins words): imperative verbs (set, do, list), have-verbs (ask.count, ask.exists)
 *   obj      object slot `name:class` (the thing: a part, an item, a lexicon of things); optional for `do`;  for `set`, `do` and `ask.value` it may be left
 *            out when `noun` names the thing itself ("set the tempo to 90", "what is the key")
 *   val      value slot `name:class` (set only)
 *   noun     property noun alternatives (`color|colour`): optional in `set`, required by `ask.value`
 *   det      determiners before the object (default `the|your|ur|my`)
 *   link     words between object and value in the imperative of `set` (default `to|into|be|as`, followed by an optional a|an|the)
 *   poss     `true` (`ask.value`): also generate the possessive order form "what is Japan's capital" (`L [$lang.shape.whatis]? O 's N T`)
 *   objdet   `none`: no determiner before the object of an `ask.value` shape ("the day after Monday", not "the Monday")
 *   rel      (`ask.value`) relation words between the noun and the object (`after|comes_after|follows`: "what day comes after Monday"); the relation is then mandatory
 *   cont     (`ask.count`) container slot `name:class`: "how many days are in a week" (obj = the counted part, cont = the whole), "how many apples does Tom have"
 *            (`verb` then lists the trailing verbs, default `have|has|got`; the `order` form "a week has how many days" exists only with `cont`)
 *   pron     (noun-only `ask.value`) pronouns that may follow the verb in the question (default `it|this|that|we|you|u|i`)
 *   mod      optional modifier group before the value, alternatives and `$macro` ids (`$ui.avatar.g11_a_bit` for "a bit", "much"), or a slot
 *            (`s:lex.x?`: "make the bars LIGHT green")
 *   objmod   optional modifier group before the object (`whole|entire`), or a slot `ord:lex.x` (mandatory; `ord:lex.x?` optional): "delete the LAST paragraph"
 *   extra    one more optional element after the value or object: a slot (`n:number` mandatory, `n:number?` optional) or a group `[percent|per_cent]?`
 *   emit     emit template; `emitOpts` the emit of the `opts` form (without it `opts` is not generated)
 *   forms    comma list of forms to generate (default: every form of the family); `skip` comma list of forms to leave out
 *   sample   example words per slot, `p=eyes;c=blue` (default: the first word of the slot's lexicon)
 *   priority the pattern priority (`short` forms get priority - 2)
 *   kind     overrides the default kind (ask.* question; list q/opts question; the rest request)
 */

export const FAMILY_FORMS = {
  set: ['imp', 'order', 'wish', 'ind', 'q', 'short', 'state', 'opts'],
  do: ['imp', 'wish', 'ind', 'q', 'short'],
  'ask.value': ['q', 'imp', 'wish', 'ind', 'order', 'short', 'opts'],
  'ask.count': ['q', 'imp', 'wish', 'ind', 'order', 'short'],
  'ask.exists': ['q', 'imp', 'wish', 'ind', 'short'],
  list: ['imp', 'q', 'wish', 'ind', 'short', 'opts'],
};
export const FORMS = ['imp', 'q', 'wish', 'ind', 'order', 'short', 'state', 'opts'];
/** `short` forms are less specific than the full ones: lower priority, and dropped at routing tier 5. */
export const SHORT_PENALTY = 2;

const LEAD = '[$lang.lead.filler|pls|plz]? [$lang.lead.polite]?';
const TAIL = '[$lang.tail.filler]?';
const AND = (...a) => a.join(' ');

/**
 * Templates per family and form: arrays of `[suffix, template]`; the suffix names the variant (`imp`, `imp.2`).
 * Tokens: `<L>` lead, `<T>` tail, `<V>` verbs (mandatory), `<V?>` optional verbs, `<D>` optional determiner, `<O>` object slot,
 * `<X>` value slot, `<N>` / `<N?>` noun (mandatory / optional), `<K>` optional link, `<E>` optional extra slot. A template that uses a token
 * the shape does not define is not generated; `<D> <O>` pairs vanish when the shape has no object.
 */
const NOW = '[$lang.shape.now]?';
const OF_ALTS = 'of|for|on|of_the|of_your|of_ur';
const OF = `[${OF_ALTS}]`;
export const TEMPLATES = {
  set: {
    imp: [['', AND('<L>', '<V>', '<D>', '<O>', '<N?>', '<K>', '<X><E>', '<T>')]],
    order: [['', AND('<L>', '[$lang.shape.want|<VL>]', '[a|an]?', '<D>', '<X>', '<O>', '<N?>', '<E>', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.want]', '<D>', '<O>', '<N?>', '[$lang.shape.be]?', '[a|an]?', '<X><E>', '<T>')]],
    ind: [['', AND('[$lang.shape.ind]', '<V>', '<D>', '<O>', '<N?>', '<K>', '<X><E>', '<T>')]],
    q: [['', AND('<L>', '[$lang.shape.can]', '<D>', '<O>', '<N?>', '[$lang.shape.be]', '[a|an]?', '<X><E>', '<T>')]],
    short: [['', AND('<L>', '[a|an]?', '<X>', '<O>', '<N?>', '<E>', '<T>')], ['.2', AND('<L>', '<D>', '<O>', '<N?>', '<X><E>', '<T>')]],
    state: [['', AND('<L>', '[$lang.shape.prefer]?', '<D>', '<O>', '<N?>', '[$lang.shape.cop]', '[a|an]?', '<X><E>', '<T>')]],
    opts: [['', AND('<L>', '[what|which|wat]', '<NP>', '[can|could|may|might|do|does|are|is]', '<D>', '<O>', '[$lang.shape.be|have|take]', '<T>')]],
  },
  do: {
    imp: [['', AND('<L>', '<V>', '<D>', '<O><E>', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.wishto]', '<V>', '<D>', '<O><E>', '<T>')]],
    ind: [['', AND('[$lang.shape.ind]', '<V>', '<D>', '<O><E>', '<T>')]],
    q: [['', AND('<L>', '[$lang.shape.can]', '[i|we|you|u|ya]', '<V>', '<D>', '<O><E>', '<T>')]],
    short: [['', AND('<L>', '<D>', '<O><E>', '<V>', '<T>')]],
  },
  'ask.value': {
    q: [['', AND('<L>', '[$lang.shape.what]', '<N>', '[are|r|is|was|were|do|does|did]?', '<R>', '<DO>', '<O>', NOW, '<T>')],
      ['.2', AND('<L>', '[$lang.shape.whatis]', '<D>', '<N>', '<OFM>', '<DO>', '<O>', NOW, '<T>')]],
    imp: [['', AND('<L>', '[$lang.shape.tellme]', '[what|which]?', '<D>', '<N>', '<OFO>', '<DO>', '<O>', '[is|are]?', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.know]', '[what|which]?', '<D>', '<N>', '<OFO>', '<DO>', '<O>', '[is|are]?', '<T>')]],
    ind: [['', AND('[$lang.shape.indask]', '[what|which]?', '<D>', '<N>', '<OFO>', '<DO>', '<O>', '[is|are]?', '<T>')]],
    order: [['', AND('<L>', '<D>', '<N>', '<OFM>', '<DO>', '<O>', NOW, '<T>')],
      ['.2', AND('<L>', '<DO>', '<O>', '[is|are]?', '[what|which|wat]', '<N>', '<T>')],
      ['.poss', AND('<L>', '[$lang.shape.whatis]?', '<O>', "'s", '<N>', '<T>')]],
    short: [['', AND('<L>', '<O>', '<N>', '<T>')]],
    opts: [['', AND('<L>', '[what|which|wat]', '<NP>', '[can|could|may|might|do|does|are|is]', '<DO>', '<O>', '[$lang.shape.be|have|take]', '<T>')]],
  },
  'ask.count': {
    q: [['', AND('<L>', '[$lang.shape.howmany]', '<O>', '[do|does|are|is|can|could|did|have|has|will|would]?', '[you|u|ya|there|i|we|they]?', '<V?>', NOW, '<T>')],
      ['.2', AND('<L>', '[$lang.shape.whatis]', '[$lang.shape.numberof]', '<D>', '<O>', NOW, '<T>')]],
    imp: [['', AND('<L>', '[$lang.shape.tellme]', '[$lang.shape.howmany|$lang.shape.numberof]', '<D>', '<O>', '[you|u|ya|there|i|we]?', '<V?>', '<T>')],
      ['.2', AND('<L>', '<V>', '<D>', '<O>', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.know]', '[$lang.shape.howmany|$lang.shape.numberof]', '<D>', '<O>', '[you|u|ya|there|i|we]?', '<V?>', '<T>')]],
    ind: [['', AND('[$lang.shape.indask]', '[$lang.shape.howmany|$lang.shape.numberof]', '<D>', '<O>', '[you|u|ya|there|i|we]?', '<V?>', '<T>')]],
    short: [['', AND('<L>', '<D>', '<O>', '[count|total|number|amount]', '<T>')]],
  },
  'ask.exists': {
    q: [['', AND('<L>', '[do|does|did|have|has|can|could|r|are|is]', '[you|u|ya|we|i|they]', '<V>', '[a|an|any|some|the]?', '<O>', '[on|too|also|now|currently|right_now]?', '<T>')],
      ['.2', AND('<L>', '[is|are|was|were]', 'there', '[a|an|any|some|the]?', '<O>', '[on|in|here|too|now|currently|right_now]?', '<T>')]],
    imp: [['', AND('<L>', '[$lang.shape.tellme]', '[if|whether]', '[you|u|ya|there|we|i]', '[<VL>|is|are|has|have]', '[a|an|any|some|the]?', '<O>', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.know]', '[if|whether]', '[you|u|ya|there|we|i]', '[<VL>|is|are|has|have]', '[a|an|any|some|the]?', '<O>', '<T>')]],
    ind: [['', AND('[$lang.shape.indask]', '[if|whether]?', '[you|u|ya|there|we|i]', '[<VL>|is|are|has|have]', '[a|an|any|some|the]?', '<O>', '<T>')]],
    short: [['', AND('<L>', '[you|u|ya]?', '<V>', '[a|an|any|some]?', '<O>', '[or_not]', '<T>')]],
  },
  list: {
    imp: [['', AND('<L>', '<V>', '[me|us]?', '[all|every|each]?', '[of_the|of_your|of_ur]?', '<D>', '<O>', '<E>', '<T>')]],
    q: [['', AND('<L>', '[what|which|wat]', '<O>', '[do|does|are|is|can|could|may|might|did]', '[you|u|ya|there|i|we|they]?', '[have|got|offer|know|support|available|choose|pick|use|see|exist|here]?', '[for_me|here|now|available]?', '<T>')]],
    wish: [['', AND('<L>', '[$lang.shape.seeall|$lang.shape.know]', '[all|every|each]?', '<D>', '<O>', '<E>', '<T>')]],
    ind: [['', AND('[$lang.shape.ind]', '<V>', '[me|us]?', '[all|every|each]?', '<D>', '<O>', '<E>', '<T>')]],
    short: [['', AND('<L>', '[all|every|each]', '<O>', '<T>')], ['.2', AND('<L>', '<O>', '[list|options|choices|available|types|kinds]', '<T>')]],
    opts: [['', AND('<L>', '[what|which|wat]', '[kinds_of|kind_of|types_of|type_of|sorts_of|options_for|choices_for|options_of|choices_of|variants_of]', '<D>', '<O>', '[are_there|do_you_have|can_i_choose|can_i_pick|are_available|exist]?', '<T>')]],
  },
};

/**
 * Shapes without an object slot (`obj` absent, `noun` given): the noun IS the thing ("set the tempo to 90", "what is the key"). `set` uses its
 * own templates with `<O>` = the noun group (word order and the first short form are left out); `ask.value` has the templates below.
 */
const NOOBJ_ASK_VALUE = {
  q: [['', AND('<L>', '[$lang.shape.what]', '<N>', '[are|r|is|do|does|did]?', '<PR>', NOW, '<T>')],
    ['.2', AND('<L>', '[$lang.shape.whatis]', '<D>', '<N>', NOW, '<T>')]],
  imp: [['', AND('<L>', '[$lang.shape.tellme]', '[what|which]?', '<D>', '<N>', '[is|are]?', '<T>')]],
  wish: [['', AND('<L>', '[$lang.shape.know]', '[what|which]?', '<D>', '<N>', '[is|are]?', '<T>')]],
  ind: [['', AND('[$lang.shape.indask]', '[what|which]?', '<D>', '<N>', '[is|are]?', '<T>')]],
  short: [['', AND('<L>', '<N>', '<T>')]],
};

/**
 * `ask.count` with a container slot (`cont`): "how many days are in a week" (object = the counted part, container = the whole it is counted in).
 * The templates of the family are replaced by these.
 */
const CONT_ASK_COUNT = {
  q: [['', AND('<L>', '[$lang.shape.howmany]', '<O>', '[are|is|does|do|did|will|has|have|fit|go|make|per]?', '[there]?', '[in|per|inside|within|of|make_up]?', '<DO>', '<C>', '<CV>', '<T>')]],
  imp: [['', AND('<L>', '[$lang.shape.tellme|count|name]', '[$lang.shape.howmany]?', '<D>', '<O>', '[are|is|does|do|did|will|has|have|fit|go|make]?', '[there]?', '[in|per|inside|within]?', '<DO>', '<C>', '<CV>', '<T>')]],
  wish: [['', AND('<L>', '[$lang.shape.know]', '[$lang.shape.howmany]', '<O>', '[are|is|does|do|did|will|has|have|fit|go|make]?', '[there]?', '[in|per|inside|within]?', '<DO>', '<C>', '<CV>', '<T>')]],
  ind: [['', AND('[$lang.shape.indask]', '[$lang.shape.howmany]', '<O>', '[are|is|does|do|did|will|has|have|fit|go|make]?', '[there]?', '[in|per|inside|within]?', '<DO>', '<C>', '<CV>', '<T>')]],
  order: [['', AND('<L>', '<DO>', '<C>', '[has|have|is|contains|equals|lasts|are|make|have_got]?', '[how_many|many]', '<O>', '<T>')]],
  short: [['', AND('<L>', '<O>', '[in|per]', '<DO>', '<C>', '<T>')]],
};

const slotText = (spec, optional = false) => (spec ? `{${spec.replace(/\?$/, '')}${optional || spec.endsWith('?') ? '?' : ''}}` : '');
const group = (alts, optional) => `[${alts.split('|').map((a) => a.trim()).filter(Boolean).join('|')}]${optional ? '?' : ''}`;
const trimWords = (s) => s.split(/\s+/).filter(Boolean).join(' ');

/** Default pieces the shape fields fill in. */
const DEFAULTS = { det: 'the|your|ur|my', link: 'to|into|be|as' };

/**
 * Generate the pattern objects of one shape. Returns `[{ id, form, match, emit, kind, priority, example: [] }]`. Forms the family
 * does not have, forms listed in `skip`, templates that need a field the shape lacks and `opts` without `emitOpts` are not generated.
 * @param {object} shape  { id (without `shape.`), family, verb, obj, val, noun, det, link, extra, emit, emitOpts, forms, skip, priority, kind, example }
 */
export function expandShape(shape, { phrases = null, lexicons = null } = {}) {
  const family = shape.family;
  const table = TEMPLATES[family];
  if (!table) throw new Error(`shape '${shape.id}': unknown family '${family}' (${Object.keys(TEMPLATES).join(', ')})`);
  const known = FAMILY_FORMS[family];
  const want = shape.forms ? shape.forms.split(',').map((s) => s.trim()).filter(Boolean) : known;
  const skip = new Set((shape.skip ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  for (const f of [...want, ...skip]) if (!known.includes(f)) throw new Error(`shape '${shape.id}': form '${f}' does not exist in family '${family}' (${known.join(', ')})`);
  if (!shape.emit) throw new Error(`shape '${shape.id}': no emit`);
  const noObj = !shape.obj && !!shape.noun && (family === 'set' || family === 'ask.value' || family === 'do');
  const verbs = shape.verb ? group(shape.verb) : null;
  const nounAlts = shape.noun ?? null;
  const nounPlural = nounAlts ? [...new Set(nounAlts.split('|').flatMap((n) => [n, n + 's']))].join('|') : null;
  const fields = {
    '<V>': verbs, '<V?>': verbs ? group(shape.verb, true) : null,
    '<VL>': shape.verb ? shape.verb.split('|').join('|') : null,
    '<D>': shape.obj || shape.noun ? group(shape.det ?? DEFAULTS.det, true) : '',
    '<O>': shape.obj ? (shape.objmod ? (shape.objmod.includes(':') ? slotText(shape.objmod) : group(shape.objmod, true)) + ' ' : '') + slotText(shape.obj) : (noObj ? group(shape.noun) : ''),
    '<X>': shape.val ? (shape.mod ? (shape.mod.includes(':') ? slotText(shape.mod) : group(shape.mod, true)) + ' ' : '') + slotText(shape.val) : '',
    '<N>': nounAlts ? group(nounAlts) : null, '<N?>': nounAlts && !noObj ? group(nounAlts, true) : '',
    '<NP>': nounPlural ? group(nounPlural) : null,
    '<K>': group(shape.link ?? DEFAULTS.link, true) + ' [a|an|the]?', '<E>': shape.extra ? ' ' + (shape.extra.startsWith('[') ? shape.extra : slotText(shape.extra)) : '',
    '<DO>': shape.objdet === 'none' ? '' : (shape.obj || shape.noun ? group(shape.det ?? DEFAULTS.det, true) : ''),
    '<R>': shape.rel ? group(shape.rel) : '', '<OFM>': shape.rel ? group(shape.rel) : OF, '<OFO>': shape.rel ? group(shape.rel) : OF + '?',
    '<C>': slotText(shape.cont),
    '<CV>': group(shape.verb ?? 'have|has|got', true),
    '<PR>': group(shape.pron ?? 'it|this|that|we|you|u|i', true),
    '<L>': LEAD, '<T>': TAIL,
  };
  const needs = { set: ['verb', 'obj', 'val'], do: ['verb', 'obj'], 'ask.value': ['obj', 'noun'], 'ask.count': ['obj'], 'ask.exists': ['obj', 'verb'], list: ['obj', 'verb'] }[family];
  for (const k of needs) if (!shape[k] && !(noObj && k === 'obj')) throw new Error(`shape '${shape.id}': family '${family}' needs '${k}'`);
  const sample = Object.fromEntries((shape.sample ?? '').split(/[;,]/).map((x) => x.trim().split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const out = [];
  for (const form of want) {
    if (skip.has(form)) continue;
    if (form === 'opts' && (!shape.emitOpts || noObj)) continue;
    for (const [suffix, tpl] of (noObj && family === 'ask.value' ? NOOBJ_ASK_VALUE[form] : shape.cont && family === 'ask.count' ? CONT_ASK_COUNT[form] : table[form]) ?? []) {
      if (suffix === '.poss' && shape.poss !== 'true') continue;
      if (noObj && family === 'set' && (form === 'order' || (form === 'short' && suffix === ''))) continue;
      if (shape.rel && family === 'ask.value' && ((form === 'order' && suffix === '.2') || form === 'short' || form === 'opts')) continue;
      const tokens = [...new Set(tpl.match(/<\w+\??>/g) ?? [])];
      if (tokens.some((t) => fields[t] === null)) continue;
      if (!shape.obj && form === 'short' && family === 'do') continue;
      let match = tpl;
      for (const t of tokens) match = match.split(t).join(fields[t]);
      match = trimWords(match);
      const short = form === 'short';
      const kind = shape.kind ?? (family.startsWith('ask') || (family === 'list' && (form === 'q' || form === 'opts')) ? 'question' : 'request');
      const basePriority = Number(shape.priority ?? 10);
      const p = {
        id: `${shape.id}.${form}${suffix}`, form, match, emit: form === 'opts' ? shape.emitOpts : shape.emit, kind,
        priority: short ? basePriority - SHORT_PENALTY : basePriority,
        example: [],
      };
      p.example = exampleSentences(match, { phrases, lexicons, sample, det: shape.obj || noObj ? (shape.det ?? DEFAULTS.det) : null, objdet: shape.objdet, noun: nounAlts && (family !== 'set' || noObj) && !(noObj && /^(it|them|this|that|these|those)(\||$)/.test(nounAlts)) ? nounAlts : null, nounDet: noObj ? 'det' : 'the', link: shape.link ?? DEFAULTS.link, extra: shape.extra?.startsWith('[') ? shape.extra.slice(1, -2) : null, cv: shape.cont ? (shape.verb ?? 'have|has|got') : null });
      out.push(p);
    }
  }
  // explicit examples of the shape go to the imperative (first) pattern so that hints show a natural sentence
  if (shape.example?.length && out.length) out[0].example = [...new Set([...shape.example, ...out[0].example])].slice(0, 6);
  return out;
}

/** Sample word of a slot class: first word of its lexicon (or a number); null when unknown. */
function sampleWord(cls, lexicons) {
  if (cls === 'number') return '3';
  if (cls === 'word' || cls === 'noun') return 'x';
  const lx = lexicons?.get(cls);
  if (!lx) return null;
  const first = [...(lx.words ?? [])].find((w) => w && !/[^\w' -]/.test(w));
  return first ? String(first).toLowerCase() : null;
}

/**
 * Natural example sentences of a generated match string: first the sentence with the determiner before the object ("Make your eyes blue."),
 * (the shortest one, all optionals omitted, when the sentence has no determiner). Other optional words (links, nouns, lead-ins) are never added: they make unnatural sentences.
 */
export function exampleSentences(match, { phrases = null, lexicons = null, sample = {}, det = null, noun = null, link = null, cv = null, extra = null, nounDet = 'the' } = {}) {
  const parts = match.split(/\s+/);
  const make = (withDet) => {
    const words = [];
    for (let k = 0; k < parts.length; k++) {
      const part = parts[k];
      let m;
      if ((m = part.match(/^\{(\w+):([\w.-]+?)(?:\([^()]*\))?(\?)?\}$/))) {
        if (m[3]) continue;
        const w = sample[m[1]] ?? sampleWord(m[2], lexicons);
        if (w == null) return null;
        words.push(w);
      } else if ((m = part.match(/^\[([^\[\]]*)\](\?)?$/))) {
        const alts = m[1].split('|');
        if (m[2]) {
          const before = /^\{\w+:/.test(parts[k + 1] ?? '');
          if (withDet && before && det && m[1] === det) words.push(alts[0]);
          else if (withDet && det && m[1] === det && noun && parts[k + 1] === `[${noun}]`) words.push(nounDet === 'the' ? 'the' : alts[0]);
          else if (m[1] === OF_ALTS) words.push('of');
          else if (withDet && link && m[1] === link) words.push(alts[0]);
          else if (cv && m[1] === cv) words.push(alts[0]);
          else if (extra && m[1] === extra) words.push(alts[0]);
          continue;
        }
        let first = alts[0];
        if (first.startsWith('$')) {
          const ph = phrases?.get(first.slice(1));
          if (!ph) return null;
          first = ph.alts[0].join('_');
        }
        words.push(first.replace(/_/g, ' '));
      } else if (part === "'s" && words.length) words[words.length - 1] += "'s";
      else words.push(part.replace(/_/g, ' '));
    }
    return words.join(' ');
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const out = [];
  for (const withDet of [true, false]) {
    const s = make(withDet);
    if (s && !out.length) out.push(s);   // the determiner version when there is one, else the shortest
  }
  return out.map((s) => cap(s) + (/^(what|which|how|is|are|do|does|can|could|would|will)\b/i.test(s) ? '?' : '.'));
}
