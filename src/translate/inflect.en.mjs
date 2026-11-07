// English inflection helpers (browser-safe).

const IRREG_PLURAL = {
  man: 'men', woman: 'women', child: 'children', person: 'people', foot: 'feet', tooth: 'teeth',
  mouse: 'mice', goose: 'geese', sheep: 'sheep', fish: 'fish', deer: 'deer', leaf: 'leaves',
  wolf: 'wolves', knife: 'knives', life: 'lives', wife: 'wives', shelf: 'shelves', half: 'halves',
  loaf: 'loaves', ox: 'oxen', scissors: 'scissors', glasses: 'glasses', pants: 'pants',
};

export function pluralEn(noun) {
  const parts = noun.split(' ');
  const last = parts.pop();
  let pl;
  if (IRREG_PLURAL[last]) pl = IRREG_PLURAL[last];
  else if (/[^aeiou]y$/.test(last)) pl = last.slice(0, -1) + 'ies';
  else if (/(s|x|z|ch|sh)$/.test(last)) pl = last + 'es';
  else if (/[^aeiou]o$/.test(last) && ['potato', 'tomato', 'hero'].includes(last)) pl = last + 'es';
  else pl = last + 's';
  return [...parts, pl].join(' ');
}

export function thirdPersonEn(verb) {
  const SPECIAL = { have: 'has', be: 'is', do: 'does', go: 'goes' };
  if (SPECIAL[verb]) return SPECIAL[verb];
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh|o)$/.test(verb)) return verb + 'es';
  return verb + 's';
}

export function pastEn(verb) {
  if (verb === 'be') return 'was';
  if (/e$/.test(verb)) return verb + 'd';
  if (/[^aeiou]y$/.test(verb)) return verb.slice(0, -1) + 'ied';
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(verb) && verb.length <= 4 && !/^(open|visit)/.test(verb)) return verb + verb.slice(-1) + 'ed';
  return verb + 'ed';
}

export function ingEn(verb) {
  if (/ie$/.test(verb)) return verb.slice(0, -2) + 'ying';
  if (/[^e]e$/.test(verb)) return verb.slice(0, -1) + 'ing';
  return verb + 'ing';
}

/** Indefinite article for the word that follows. */
export function aAn(word) {
  const w = String(word).toLowerCase();
  if (/^(honest|hour|heir)/.test(w)) return 'an';
  if (/^(uni|use|usu|eu|one|once|ubiq)/.test(w)) return 'a';
  if (/^[aeiou]/.test(w)) return 'an';
  if (/^(8|11|18)(\D|$)/.test(w)) return 'an';
  return 'a';
}

/**
 * Build the words of an English verb group.
 * verb: { base, past, pp, post?, modal? }  (modal verbs: can, must)
 * opts: { tense: pres|past|fut|cond|imp|inf, person: 1|2|3, number: sg|pl, neg, question }
 * Returns [{ w, role: 'aux'|'neg'|'main'|'post' }] in statement order.
 * With question=true the first element is always an 'aux' to be placed before the subject
 * ("does X have", "is X", "can X").
 */
export function verbWords(verb, opts) {
  const { tense, person = 3, number = 'sg', neg = false, question = false } = opts;
  const base = verb.base;
  const out = [];
  const third = person === 3 && number === 'sg';
  const doAux = (t) => (t === 'past' ? 'did' : third ? 'does' : 'do');
  const push = (w, role) => out.push({ w, role });
  const post = () => { if (verb.post) push(verb.post, 'post'); };

  if (tense === 'inf') {
    if (neg) { push('not', 'neg'); }
    push('to', 'aux'); push(base, 'main'); post();
    if (neg) { const n = out.shift(); out.splice(1, 0, n); }
    return out;
  }
  if (tense === 'imp') {
    if (neg) { push('do', 'aux'); push('not', 'neg'); }
    push(base, 'main'); post();
    return out;
  }
  if (base === 'be') {
    let w;
    if (tense === 'past') w = person === 1 && number === 'sg' ? 'was' : person === 3 && number === 'sg' ? 'was' : person === 2 || number === 'pl' ? 'were' : 'was';
    else if (tense === 'fut') w = 'will';
    else if (tense === 'cond') w = 'would';
    else w = person === 1 && number === 'sg' ? 'am' : third ? 'is' : 'are';
    push(w, 'aux');
    if (neg) push('not', 'neg');
    if (tense === 'fut' || tense === 'cond') push('be', 'main');
    post();
    return out;
  }
  if (verb.modal) {
    const m = tense === 'past' ? (verb.modal === 'can' ? 'could' : 'must') : tense === 'cond' ? (verb.modal === 'can' ? 'could' : 'should') : verb.modal;
    if (tense === 'fut') {
      push('will', 'aux'); if (neg) push('not', 'neg');
      push(verb.modal === 'can' ? 'be able to' : 'have to', 'main');
      return out;
    }
    push(m, 'aux');
    if (neg) push('not', 'neg');
    return out;
  }
  if (tense === 'fut' || tense === 'cond') {
    push(tense === 'fut' ? 'will' : 'would', 'aux');
    if (neg) push('not', 'neg');
    push(base, 'main'); post();
    return out;
  }
  if (tense === 'past') {
    if (neg || question) {
      push('did', 'aux');
      if (neg) push('not', 'neg');
      push(base, 'main');
    } else push(verb.past || pastEn(base), 'main');
    post();
    return out;
  }
  // present
  if (neg || question) {
    push(doAux('pres'), 'aux');
    if (neg) push('not', 'neg');
    push(base, 'main');
  } else push(third ? (verb.third || thirdPersonEn(base)) : base, 'main');
  post();
  return out;
}

/** "does X have" style question frame helper: returns the English words for aux + verb. */
export function questionFrame({ wh, subject, verb, tense = 'pres', person = 3, number = 'sg' }) {
  const words = verbWords(verb, { tense, person, number, question: true });
  const aux = words.find((x) => x.role === 'aux');
  const rest = words.filter((x) => x !== aux);
  return [wh, aux?.w, subject, ...rest.map((x) => x.w)].filter(Boolean).join(' ');
}

export const NUMBER_WORDS_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
