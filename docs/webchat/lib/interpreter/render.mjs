/**
 * Rendering (spec 04): world templates turn result envelopes into English. Browser-safe.
 * The renderer never adds facts absent from the envelope or the wires it is given.
 *
 * Decisions beyond the spec:
 *  - A template without `mode` renders mode=value questions only; `mode=exists|list|count`
 *    selects templates for the other modes.
 *  - `:plural` pluralizes unless the context number (`value`, else `count`, `n`) equals 1.
 *  - A template whose placeholders cannot all be resolved is skipped (next candidate or fallback).
 */
import { lexIndex } from '../worlds/lexicon.mjs?v=d722b1e7d1';
import { pluralize } from '../formalizer/rules/lemma.mjs?v=9112f6feee';

const PLACEHOLDER = /\{([A-Za-z_][\w.]*)((?::[a-z]+)*)\}/g;

// Article exceptions for `:a`. Vowel-initial words that start with a consonant sound take "a"
// (a unicorn, a university, a European, a one-eyed pirate); silent-h words take "an" (an hour, an honest man, an heir).
const A_EXCEPTIONS = /^(uni(?:c|f|l|o|p|q|t|v|s)|use[ds]?\b|usu|uti|eu|one\b|once\b|ubiq|ura[ln])/i;
const AN_EXCEPTIONS = /^(hour|honest|honou?r|heir)/i;
export function withArticle(x) {
  const an = AN_EXCEPTIONS.test(x) || (/^[aeiou]/i.test(x) && !A_EXCEPTIONS.test(x));
  return (an ? 'an ' : 'a ') + x;
}

const words = (s) => String(s).replace(/_/g, ' ');

/** "a, b and c" */
export function listText(items) {
  const a = items.map(words);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

function formatNumber(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 10 }) : String(s);
}

/** Renderer bound to a WorldSet and a memory (for entity names). */
export class Renderer {
  constructor(set) {
    this.set = set;
    this.lex = lexIndex(set);
    this.templates = set.list().flatMap((w) => w.templates);
  }

  /** Display name of an entity or id. */
  nameOf(memory, id) {
    if (id === 'e.user') return 'you';
    const w = memory.get(id);
    if (!w) return words(id);
    const n = w.entries.find((e) => e.key.endsWith('.name') || e.key === 'name');
    return n ? n.value.v : words(id);
  }

  /**
   * Does every `when` condition of template `t` hold for `vars`? A condition is `<name><op><value>` with op one of
   * `= != > >= < <=` (`value=true`, `value=0`, `value>1`); numbers compare numerically, anything else as text.
   * A condition on a placeholder that has no value does not hold.
   */
  holds(t, vars) {
    for (const c of t.when ?? []) {
      const m = String(c).match(/^\s*([A-Za-z_][\w.]*)\s*(!=|>=|<=|=|>|<)\s*(.*?)\s*$/);
      if (!m) return false;
      const v = vars[m[1]];
      const left = v ? (v.raw !== undefined ? v.raw : v.text) : undefined;
      if (left === undefined) return false;
      const a = String(left), b = m[3];
      const numeric = a.trim() !== '' && b !== '' && Number.isFinite(Number(a)) && Number.isFinite(Number(b));
      const cmp = numeric ? Number(a) - Number(b) : (a < b ? -1 : a > b ? 1 : 0);
      const ok = { '=': cmp === 0, '!=': cmp !== 0, '>': cmp > 0, '>=': cmp >= 0, '<': cmp < 0, '<=': cmp <= 0 }[m[2]];
      if (!ok) return false;
    }
    return true;
  }

  /** Select the first templates for any of `fors` with the status and mode (and, given `vars`, whose `when` holds). */
  pick(fors, status, mode, vars = null) {
    for (const f of fors) {
      if (!f) continue;
      const t = this.templates.filter((x) => x.for === f && x.status === status && x.mode === mode && (!vars || this.holds(x, vars)));
      if (t.length) return t;
    }
    return [];
  }

  /**
   * Fill a template text. `vars`: name -> { text?, raw?, ref?, items? }.
   * Returns null when a placeholder cannot be resolved.
   */
  fill(text, vars, memory) {
    let ok = true;
    const num = ['value', 'count', 'n'].map((k) => vars[k]).find((v) => v && v.raw !== undefined && v.raw !== '' && !Number.isNaN(Number(v.raw)));
    const out = text.replace(PLACEHOLDER, (_all, name, filters) => {
      const v = this.lookup(vars, name, memory);
      if (v === undefined) { ok = false; return ''; }
      let s = v;
      for (const f of filters.split(':').filter(Boolean)) s = this.filter(f, s, num);
      return Array.isArray(s) ? listText(s) : s;
    });
    return ok ? out : null;
  }

  lookup(vars, name, memory) {
    const [head, ...rest] = name.split('.');
    const v = vars[head];
    if (!v) return undefined;
    if (rest.length) {
      if (!v.ref) return undefined;
      const w = memory.get(v.ref);
      const key = rest.join('.');
      const e = w?.entries.find((x) => x.key === key || x.key.endsWith('.' + key));
      return e ? (e.value.kind === 'ref' ? this.nameOf(memory, e.value.v) : words(e.value.v)) : undefined;
    }
    if (v.items) return v.items.map((i) => (i.ref ? this.nameOf(memory, i.ref) : words(i.text)));
    if (v.ref) return this.nameOf(memory, v.ref);
    return words(v.text);
  }

  filter(f, s, num) {
    const one = (x) => {
      switch (f) {
        case 'plural': return num && Number(num.raw) === 1 ? x : pluralize(x, this.lex.plurals);
        case 'singular': return this.lex.lemma(x.replace(/ /g, '_')).replace(/_/g, ' ');
        case 'cap': return x.charAt(0).toUpperCase() + x.slice(1);
        case 'a': return withArticle(x);
        case 'number': return formatNumber(x);
        // verb agreement with a rendered subject: "you have", "Tom has", "you are", "Tom is"
        case 'has': return x.toLowerCase() === 'you' ? 'have' : 'has';
        case 'is': return x.toLowerCase() === 'you' ? 'are' : 'is';
        default: return x;
      }
    };
    if (f === 'list') return Array.isArray(s) ? s : [s];
    return Array.isArray(s) ? s.map(one) : one(s);
  }
}

/** Plain-text fallback for an envelope (spec 04). */
export function fallbackText(env, { mode = 'value', ask } = {}) {
  const val = (x) => words(x);
  // An operation's own note is the reply for missing / unsupported (replaces per-operation `{note}` templates). Interpreter-made
  // notes (reason unsupported_operation, execution_error) are technical and never shown.
  if (env.note && (env.status === 'missing' || (env.status === 'unsupported' && env.reason !== 'unsupported_operation'))) return String(env.note);
  switch (env.status) {
    case 'supported': {
      if (mode === 'exists') return env.value === 'yes' ? 'Yes.' : 'No.';
      if (env.values && env.value === undefined) return env.values.length ? listText(env.values) + '.' : 'None.';
      const u = env.unit ? ' ' + env.unit : '';
      return `${val(env.value)}${u}`;
    }
    case 'missing': return `I don't know yet.${ask ? ' ' + ask : ''}`;
    case 'conflicting': return `I have conflicting information: ${listText((env.alternatives ?? []).map(String))}.`;
    case 'ambiguous': return `That is ambiguous: ${listText((env.alternatives ?? []).map(String))}.`;
    case 'unsupported': return "I can't do that yet.";
    case 'budget': return 'That needed more effort than I am allowed to spend.';
    default: return 'Something went wrong while I worked on that.';
  }
}
