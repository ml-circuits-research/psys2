// SPDX-License-Identifier: AGPL-3.0-only
// The shared module `acts` (specs/21-acts-and-schemas.md): about twelve universal acts with six roles, the schema of a doing world, the generic executor
// (apply an act to a schema-described state, undo, the difference, the reply, the why-answer) and the graded fallback. Browser-safe, imports only the knowledge tier's colour reader: SOP Lang
// wires come from the caller (`parseSchema(wires)`), knowledge and the other worlds come in as hooks; the only import is the colour reader of the knowledge tier.
//
//   ACTS, ROLES, FORMS            the acts, their roles, the English forms written once
//   parseSchema(wires)            schema.sop wires -> schema { id, noun, acts, limits, kinds, attrs }
//   generate(schema, ns)          the lexicons, patterns, operations and templates of a world (scripts/build-schema-world.mjs writes them)
//   examples(schema) / sentences(schema)   help examples; one generated sentence per act x kind (the coverage grid, A5)
//   card(schema)                  the words for the meta.worlds card
//   createExecutor(schema, hooks) { run(state, req), operation(ctx, act, args), interceptInput(ctx, text), init(state) }
//
// hooks (all optional, all synchronous; the host fills them from sopworld std.focus / std.fill and the knowledge catalog when they are wired):
//   know.kind(word)        -> { kind } a schema kind for a synonym, or { standIn, as } for a kind the schema takes from knowledge, or null
//   know.usualPlace(kind)  -> text of a usual place, or null          know.attrDefault(kind, attr) -> a default value or undefined
//   know.colour(word)      -> true for a colour word the schema does not list
//   focus(state)           -> { ids, place, act } the dialogue focus (default: state.focus)
//   whereKind(word)        -> [{ world, say? }] worlds where the word is a thing        whereAct(act) -> [{ world }]
//   send(items, target)    -> true when the other world took them
//   unread(ctx, text)      -> a reply string when the world can read a sentence the forms did not (its own reader), else undefined
//   domain.<act>(ctx, req) -> { status, value | note } | undefined   the world's own effect for an act over its own state (the generic executor is used when it returns undefined)

import { ACT_VERBS } from './verbs.generated.mjs?v=b363aaaa66';
import { FLAGS_MORE, TURN_WORDS } from './forms.more.mjs?v=75b22014a6';
import { FLAGS_DATA } from './forms.data.mjs?v=54c931cc9e';   // more forms (flags `valued`, `ordered`): named values said without their name
import { matrixSop, matrixTemplates } from './matrix.mjs?v=2e52cfd9a6';
import { createEffects, EFFECT_ACTS } from './effects.mjs?v=6e66f89116';   // sopworld std.schema.effect: the host's acts as library effects (sentences all or nothing, the difference)

export { ACT_VERBS };
import { colourName } from '../../lib/knowledge/values.mjs?v=a137742733';   // the one colour reader (k.values)
import { en } from '../../lib/lang/en.mjs?v=061a6ba9b3';
import { resolvePhrase } from './np-lib.mjs?v=ee98a42367';   // sopworld resolve(phrase) over std.grammar (0.31): the executor's things as wires, the library reads the phrase
import { foldRelative } from '../../lib/lang/np-resolve.mjs?v=e6ea6f1de7';   // the relative clause folded into modifiers; the rest of noun phrases is the library's (np-lib.mjs)   // English: determiners, pronouns, ordinals, number words, plurals, coordination (facts of handover/lang.en)
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

// ---- the acts and their roles ---------------------------------------------------------------------------------------------------------------------------
export const ROLES = ['thing', 'set', 'attribute', 'value', 'place', 'amount'];
/** act -> { roles needed (R), optional (O), mutates, verb used in replies and refusals }. */
export const ACTS = {
  make: { R: ['thing'], O: ['value', 'place', 'amount'], mutates: true, verb: 'add' },
  remove: { R: ['thing'], O: ['place'], mutates: true, verb: 'remove' },
  change: { R: ['thing'], O: ['attribute', 'value', 'amount'], mutates: true, verb: 'change', modes: ['set', 'more', 'less', 'next', 'prev', 'other', 'be', 'same'] },
  place: { R: ['thing', 'place'], O: [], mutates: true, verb: 'move' },
  connect: { R: ['thing', 'place'], O: [], mutates: true, verb: 'connect' },
  group: { R: ['thing'], O: [], mutates: true, verb: 'group', modes: ['group', 'apart'] },
  pick: { R: ['thing'], O: [], mutates: false, verb: 'select', modes: ['pick', 'none'] },
  ask: { R: [], O: ['thing', 'attribute', 'place'], mutates: false, verb: 'tell', modes: ['what', 'count', 'where', 'why', 'last', 'has', 'options', 'describe', 'state', 'exists'] },
  copy: { R: ['thing'], O: [], mutates: true, verb: 'copy' },
  send: { R: ['thing', 'place'], O: [], mutates: false, verb: 'send' },
  undo: { R: [], O: [], mutates: false, verb: 'undo' },
  redo: { R: [], O: [], mutates: false, verb: 'redo' },
  own: { R: [], O: ['rest'], mutates: false, verb: 'do' },   // the world's own reader took the sentence (flag `reader`): hooks.domain.own runs it, hooks.accepts decides whether it is the world's
  save: { R: [], O: ['value'], mutates: false, verb: 'save' },
  load: { R: [], O: ['value'], mutates: true, verb: 'load' },
};

// ---- small text helpers --------------------------------------------------------------------------------------------------------------------------------
const DET = en.words('det', 'acts');
const PRONOUN = en.words('pron', 'acts');
const ORD = en.ordinals('acts');
const NUMW = en.numerals('acts');
const toks = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9\s'-]+/g, ' ').split(/\s+/).filter(Boolean);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const plural = (n, one, many) => (n === 1 ? one : many ?? `${one}s`);
const num = (s) => { const t = String(s ?? '').trim().toLowerCase(); if (t === '') return NaN; if (Object.hasOwn(NUMW, t)) return NUMW[t]; return Number(t); };
/** One slip (insert, delete, substitute, swap) for words of 4 letters or more; exact otherwise. */
export function near(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let d = 0, at = -1;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d++; if (d === 1) at = i; }
    if (d === 1) return true;
    return d === 2 && a[at] === b[at + 1] && a[at + 1] === b[at] && a.slice(at + 2) === b.slice(at + 2);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0; for (let j = 0; j < s.length; j++) { if (s[j] !== l[j]) break; i++; }
  return s.slice(i) === l.slice(i + 1);
}
const same = (a, b) => a === b || near(a, b);
const singular = (w) => en.singular(w, 'act');

// ---- the schema ------------------------------------------------------------------------------------------------------------------------------------------
const vals = (w, k) => w.entries.filter((e) => e.key === k).map((e) => e.value.v);
const val = (w, k) => w.entries.find((e) => e.key === k)?.value.v;
const yes = (v) => v === 'yes' || v === 'true';
/** schema.sop wires (`acts.schema`, `acts.kind`, `acts.attr`) -> a schema object. Throws on a wrong schema (the generator and the test report it). */
export function parseSchema(wires) {
  const sw = wires.find((w) => w.type === 'acts.schema');
  if (!sw) throw new Error('schema.sop has no acts.schema wire');
  const flags = Object.fromEntries(['self', 'dir', 'be', 'has', 'bare', 'name', 'layout', 'rel', 'thingask', 'matrix', 'reader', 'tabUndo', 'claim', 'signal', 'opencolour', ...FLAGS_MORE, ...FLAGS_DATA].filter((f) => yes(val(sw, f))).map((f) => [f, true]));
  const schema = { id: sw.id, noun: val(sw, 'noun') ?? sw.id, acts: new Set(vals(sw, 'acts')), limits: { items: 100, history: 30, ...Object.fromEntries(sw.entries.filter((e) => e.key.startsWith('limit.')).map((e) => [e.key.slice(6), Number(e.value.v)])) }, kinds: {}, attrs: {}, doc: val(sw, 'doc') ?? '', tabOnly: val(sw, 'tabOnly') === 'yes' };
  for (const a of schema.acts) if (!Object.hasOwn(ACTS, a)) throw new Error(`unknown act '${a}' in ${sw.id}`);
  if (Object.keys(flags).length) schema.flags = flags;   // self: the world is a character ("yourself"); dir: direction words for place; be: "be / look X"; has: "do you have X"; bare: a bare thing is a request
  if (val(sw, 'boost')) schema.boost = Number(val(sw, 'boost'));
  if (val(sw, 'sample')) schema.sample = val(sw, 'sample');
  if (vals(sw, 'thing').length) schema.things = vals(sw, 'thing').map((t) => { const [path, kind, id, name, only] = String(t).split(':'); return { path, kind, ...(id ? { id } : {}), ...(name ? { name } : {}), ...(String(only ?? '').split('+').includes('dice') ? { diceOnly: true } : {}), ...(/(?:^|\+)active=(\w+)/.exec(only ?? '') ? { active: /(?:^|\+)active=(\w+)/.exec(only)[1] } : {}) }; });   // thing=<state path>:<kind>[:<id key>[:<name key>]]: where the world keeps the things a person can point at when they are not `state.items` (spec 25: the referents are derived from the schema and the state, the same way in every world)
  if (vals(sw, 'canonical').length) schema.canonical = vals(sw, 'canonical');   // frame-id prefixes whose examples are offered as help (a reader's "Add a document." is a true but useless example): `canonical=r.` marks the frames of the set that names its own
  if (val(sw, 'hooks')) schema.hooks = val(sw, 'hooks');   // a sibling module with the world's hooks (knowledge, domain effects, projection): host code the schema cannot say
  if (vals(sw, 'own').length) schema.own = vals(sw, 'own');   // "<export>:<action>": operations of the world that are not acts (a name, a moment of the stage), exported by own.mjs
  const vw = wires.find((x) => x.type === 'acts.view');   // the world is a VIEW of the session's things (spec 23): the aspects it shows and the words that name it
  if (vw) schema.view = { aspects: vals(vw, 'aspects'), words: vals(vw, 'word') };
  for (const w of wires.filter((x) => x.type === 'acts.kind')) {
    const name = w.id.slice(sw.id.length + 1);
    schema.kinds[name] = { name, plural: val(w, 'plural') ?? `${name}s`, numbered: yes(val(w, 'numbered')), named: yes(val(w, 'named')), max: val(w, 'max') ? Number(val(w, 'max')) : null, in: val(w, 'in') ?? null, capacity: val(w, 'capacity') ?? null, acts: vals(w, 'acts'), any: val(w, 'any') === 'knowledge', words: vals(w, 'word'), ...(vals(w, 'catalog').length ? { catalog: vals(w, 'catalog') } : {}), ...(vals(w, 'aspect').length ? { aspects: vals(w, 'aspect') } : {}), ...(vals(w, 'dice.not').length ? { diceNot: vals(w, 'dice.not') } : {}), ...(vals(w, 'know').length ? { know: vals(w, 'know').map((t) => { const [list, verb] = String(t).split(':'); return { list, ...(verb ? { verb } : {}) }; }) } : {}) };   // know=<list>[:<verb>]: the dice names this kind from the knowledge list the world (or the host) publishes under that name (spec 25): "Show Lima." (verb show), "Add a giraffe." (no verb); verb * = the entries are whole sentences   // aspect=: what a thing of this kind has (spec 23); dice.not=<act>: acts the dice (std.sample) must not frame for this kind (it needs words, a second thing, data: spec 25)
  }
  for (const w of wires.filter((x) => x.type === 'acts.attr')) {
    const name = w.id.slice(sw.id.length + 1);
    const a = { name, of: vals(w, 'of'), type: val(w, 'type') ?? 'text', values: vals(w, 'values'), min: val(w, 'min') != null ? Number(val(w, 'min')) : null, max: val(w, 'max') != null ? Number(val(w, 'max')) : null, def: val(w, 'default'), more: vals(w, 'more'), less: vals(w, 'less'), stepMore: vals(w, 'step_more'), stepLess: vals(w, 'step_less'), reset: vals(w, 'reset'), words: vals(w, 'word'), step: val(w, 'step') ? Number(val(w, 'step')) : 1 };
    if (!['number', 'enum', 'colour', 'text', 'bool'].includes(a.type)) throw new Error(`attribute ${name}: unknown type '${a.type}'`);
    if (a.type === 'enum' && !a.values.length) throw new Error(`attribute ${name}: an enum needs values`);
    for (const k of a.of) if (!schema.kinds[k]) throw new Error(`attribute ${name}: unknown kind '${k}'`);
    if (val(w, 'know')) a.know = val(w, 'know');   // the values of the attribute come from this knowledge list (colours of k.values), not from a list of ours
    schema.attrs[name] = a;
  }
  for (const k of Object.values(schema.kinds)) {
    if (k.in && !schema.kinds[k.in]) throw new Error(`kind ${k.name}: unknown container kind '${k.in}'`);
    if (k.capacity && !schema.attrs[k.capacity]) throw new Error(`kind ${k.name}: unknown capacity attribute '${k.capacity}'`);
  }
  return schema;
}
const allowedActs = (schema, kind) => (kind && schema.kinds[kind]?.acts.length ? new Set(schema.kinds[kind].acts) : schema.acts);

// ---- the English forms, written once --------------------------------------------------------------------------------------------------------------
// Notation: L lead-in, D determiner, V.<act> verb group (phrase `acts.verb.<act>` of the module), REL {rel:lex.acts.rel}, ATTR / VALUE / MORE / LESS the world's generated lexicons.
// `args` are the role arguments the emit carries; `mode` the act's mode. `if` limits a form to worlds that have what it needs. priority: the more specific, the higher.
export const FORMS = en.frames('acts');   // the forms are facts of the catalog world w.lang.en (shards frames-acts, -more, -data; en.local.mjs for what it lacks), read through src/lang/en.mjs

/** The verbs of every act: from the knowledge world k.actions (worlds/acts/verbs.generated.mjs, generated by scripts/build-acts-lexicon.mjs). No local seed. */

export const REL_WORDS = [...en.words('prep', 'acts.rel')];
export const DET_WORDS = [...en.words('det', 'acts.lexicon')];
/** Direction words of a move (flag `dir`; the words of the space module): closer together, apart, higher, lower ... */
/** Words of an arrangement (flag layout): the names of the layouts of k.layouts (generated, layouts.generated.mjs) and the adverbs of a line-up. */
export const LAYOUT_ADVERBS = ['horizontally', 'vertically', 'evenly', 'neatly', 'in_a_row', 'in_a_line', 'in_a_column', 'in_a_circle', 'diagonally'];
export const DIR_WORDS = ['closer', 'closer_together', 'together', 'apart', 'further_apart', 'wider_apart', 'higher', 'lower', 'up', 'down', 'left', 'right', 'to_the_front', 'to_the_back', 'to_front', 'to_back', 'forward', 'backward'];

// ---- generation from the schema ----------------------------------------------------------------------------------------------------------------------
const anyColour = (s) => Object.values(s.attrs).some((a) => a.type === 'colour' && !a.values.length);
const valueWords = (s) => [...new Set(Object.values(s.attrs).flatMap((a) => (a.type === 'enum' ? a.values : a.type === 'colour' ? a.values : a.type === 'bool' ? ['on', 'off'] : [])))];
const cmpWords = (s, k) => [...new Set(Object.values(s.attrs).flatMap((a) => a[k]))].filter((w) => !w.includes(' '));
function conditions(s) {
  return {
    in: Object.values(s.kinds).some((k) => k.in), named: Object.values(s.kinds).some((k) => k.named), attrs: Object.keys(s.attrs).length > 0,
    name: !!s.flags?.name, layout: !!s.flags?.layout, rel: !!s.flags?.rel, thingask: !!s.flags?.thingask, self: !!s.flags?.self, dir: !!s.flags?.dir, be: !!s.flags?.be, has: !!s.flags?.has, bare: !!s.flags?.bare,
    ...Object.fromEntries([...FLAGS_MORE, ...FLAGS_DATA].map((f) => [f, !!s.flags?.[f]])), reader: !!s.flags?.reader, values: valueWords(s).length > 0 || anyColour(s), number: Object.values(s.attrs).some((a) => a.type === 'number'), more: cmpWords(s, 'more').length > 0, less: cmpWords(s, 'less').length > 0,
  };
}
const attrWords = (s) => [...new Set(Object.values(s.attrs).flatMap((a) => [a.name, ...a.words]))];
// the reader looks a plural up by its singular, so the lexicon carries the singular of every word (cheeks -> cheek)
const kindWords = (s) => [...new Set(Object.values(s.kinds).flatMap((k) => [k.name, k.plural, ...k.words]).flatMap((w) => [w, singular(w)]))];
/** The forms a world gets: those whose condition the schema meets and whose act the world declares. */
export function formsFor(schema) {
  const c = conditions(schema);
  return en.frames().filter((f) => schema.acts.has(f.act) && (!f.if || c[f.if]));
}
// every form may start with a filler ("pls", "so") and end with one ("please", "from now on"): a free capture at the end stops before the tail
/** Forms whose words say "yourself" / "the avatar" themselves: they claim the sentence for their world on any tab (pattern tabClaim). */
const CLAIMING = new Set(['make.self', 'make.on', 'change.self', 'change.be.self', 'change.should.self', 'change.call', 'change.call.2', 'change.name.is', 'change.name.called', 'ask.name']);
const expandMatch = (m, ns) => `[$lang.lead.filler|pls|plz]? [$lang.lead.filler|pls|plz]? ${expandCore(m, ns)} [$lang.tail.filler|from_now_on|from_now|from_today|from_here_on|please]?`;
const expandCore = (m, ns) => m.replace(/\[V\.(\w+)\|/g, '[$acts.verb.$1|').replace(/\{(\w+):words\}$/, '{$1:rest}').replace(/\bL\b/g, '[$lang.lead.polite]?').replace(/\bD\b/g, '[$acts.det]?').replace(/\bV\.(\w+)/g, '[$acts.verb.$1]')
  .replace(/\bREL\b/g, '{rel:lex.acts.rel}').replace(/\{(\w+):ATTR(\??)\}/g, `{$1:lex.${ns}.attrs$2}`).replace(/\{(\w+):VALUE(\??)\}/g, `{$1:lex.${ns}.values$2}`)
  .replace(/\{(\w+):KIND(\??)\}/g, `{$1:lex.${ns}.kinds$2}`).replace(/\{(\w+):MORE\}/g, `{$1:lex.${ns}.more}`).replace(/\{(\w+):LESS\}/g, `{$1:lex.${ns}.less}`)
  .replace(/\{(\w+):TURN(\??)\}/g, `{$1:lex.${ns}.turn$2}`).replace(/\{(\w+):FACTOR\}/g, `{$1:lex.${ns}.factor}`).replace(/\bNOUN\?/g, `{noun:lex.${ns}.nouns?}`).replace(/\bNOUN\b/g, `{noun:lex.${ns}.nouns}`);
const wordsLex = (id, doc, words, cls = 'modifier', extend = null, open = null) => `@${id} core.lexicon\n    class=${cls}\n    doc=${JSON.stringify(doc)}\n${extend ? `    extends=${extend}\n` : ''}${open?.[0] === '@colour' ? '    open=colour\n' : open?.length ? `    open=knowledge\n${open.map((c) => `    catalog=${c}\n`).join('')}` : ''}${words.map((w) => `    word=${w.replace(/\s+/g, '_')}`).join('\n')}\n`;

/** The generated files of a schema world: { 'lexicon.sop', 'patterns.sop', 'operations.sop', 'templates.sop' } as text. `ns` is the world's namespace. */
/** An example is offered to people only when every noun of the seating plan it was written with is a word of this schema (a form written about seats is not shown in a world with none). */
const sayable = (schema, ex) => [...ex.matchAll(/\b(seats?|guests?|tables?)\b/gi)].every((m) => [...kindWords(schema), ...attrWords(schema)].some((w) => w.toLowerCase() === m[1].toLowerCase()));
export function generate(schema, ns, actsUrl = '../acts/acts.mjs', isCanon = () => false) {
  const note = `@gen.${ns}.note core.note\n    text="Generated from schema.sop by scripts/build-schema-world.mjs (spec 21). Never edited by hand; tests/acts.test.mjs fails when it is stale."\n`;
  const lex = [note,
    wordsLex(`lex.${ns}.kinds`, 'Kinds of things of this world (from schema.sop)', kindWords(schema), 'noun', null, [...new Set(Object.values(schema.kinds).flatMap((k) => k.catalog ?? []))]),
    ...(Object.keys(schema.attrs).length ? [wordsLex(`lex.${ns}.attrs`, 'Attributes (from schema.sop)', attrWords(schema))] : []),
    ...(valueWords(schema).length || anyColour(schema) ? [wordsLex(`lex.${ns}.values`, 'Values the attributes take (from schema.sop; a colour attribute with no listed values takes the shared colour lexicon)', valueWords(schema), 'modifier', anyColour(schema) ? '$lex.lang.colour' : null, schema.flags?.opencolour ? ['@colour'] : null)] : []),
    ...(cmpWords(schema, 'more').length ? [wordsLex(`lex.${ns}.more`, 'Comparatives that mean more of an attribute', cmpWords(schema, 'more'))] : []),
    ...(cmpWords(schema, 'less').length ? [wordsLex(`lex.${ns}.less`, 'Comparatives that mean less of an attribute', cmpWords(schema, 'less'))] : []),
    ...([...FLAGS_MORE, ...FLAGS_DATA].some((f) => schema.flags?.[f]) ? [wordsLex(`lex.${ns}.nouns`, 'The words for the whole thing the world holds (the picture, the drawing)', [...new Set([schema.noun, ...(schema.view?.words ?? []), ...(schema.kinds[schema.noun]?.words ?? [])])])] : []),
    ...(schema.flags?.turn ? [wordsLex(`lex.${ns}.turn`, 'How a thing is turned (forms.more.mjs)', TURN_WORDS)] : []),
    ...(schema.flags?.scale ? [wordsLex(`lex.${ns}.factor`, 'Factors of a size (twice as big)', ['twice', 'double', 'triple', 'thrice', 'half', 'two_times', 'three_times', 'four_times', 'ten_times'])] : []),
  ].join('\n');
  const forms = formsFor(schema);
  const pats = [note];
  const boost = Number(schema.boost ?? 0);   // a world whose signals (named shapes, arrows, chart words) beat the open tab of another world
  for (const f of forms) {
    const emit = `@{_} core.request action=${ns}.${f.act}${f.mode ? ` arg.mode=${f.mode}` : ''}${Object.entries(f.lit ?? {}).map(([k, v]) => ` arg.${k}=\\"${v}\\"`).join('')}${f.args.map((a) => ` arg.${a}=\\"{${a}}\\"`).join('')} arg.text=\\"{segment}\\"`;
    pats.push(`@pat.${ns}.${f.id} core.pattern\n    match="${expandMatch(f.match, ns)}"\n    emit="${emit}"\n    kind=${f.act === 'ask' ? 'question' : 'request'}\n    priority=${f.priority + boost}\n    tabPriority=${(f.tabPriority ?? f.priority + 8) + boost}\n${schema.flags?.signal ? "    signal=true\n" : ""}${CLAIMING.has(f.id) || schema.flags?.claim ? '    tabClaim=true\n' : ''}${(f.tabOnly ?? (schema.tabOnly || (schema.flags?.tabUndo && (f.act === 'undo' || f.act === 'redo')))) ? "    tabOnly=true\n" : ""}    example=${JSON.stringify(exampleOf(schema, f))}\n${isCanon(exampleOf(schema, f)) && sayable(schema, exampleOf(schema, f)) && (!schema.canonical || schema.canonical.some((x) => f.id.startsWith(x))) ? `    canonical=${JSON.stringify(exampleOf(schema, f))}\n` : ''}`);
  }
  const used = [...new Set(forms.map((f) => f.act))];
  const own = (schema.own ?? []).map((o) => o.split(':'));
  const viewOpsSop = schema.view ? ['view', 'adopt'].map((fn) => `@op.${ns}.${fn} core.operation\n    impl=${fn}\n    semantics=action\n    action=${ns}.${fn}\n    doc=${JSON.stringify(fn === 'view' ? 'The declaration of this world as a view of the session things (spec 23): its aspects and words.' : 'Takes a thing of the session store into this world: the act make, then change for each attribute (spec 23).')}\n`) : [];
  const ownOps = own.map(([fn, action]) => `@op.${ns}.${fn} core.operation\n    impl=${fn}\n    semantics=action\n    action=${action}\n    doc=${JSON.stringify(`An operation of this world that is not an act (own.mjs: ${fn}).`)}\n`);
  const ops = [note, ...ownOps, ...viewOpsSop, ...used.map((a) => `@op.${ns}.${a} core.operation\n    impl=${a}\n    semantics=action\n    action=${ns}.${a}\n    doc=${JSON.stringify(`The act '${a}' (spec 21), applied by the generic executor to this world's schema.`)}\n`)].join('\n');
  const tpl = [note, ...used.map((a) => `@tpl.${ns}.${a} core.template\n    for=action.${ns}.${a}\n    text="{note}"\n`)].join('\n');
  const opsMjs = `// GENERATED from schema.sop by scripts/build-schema-world.mjs (spec 21). Never edited by hand.\nimport { createExecutor, deserializeSchema } from '${actsUrl}';\n${schema.view ? `import { withView, viewOps } from '${actsUrl.replace(/acts\/acts\.mjs$/, 'session.things/view.mjs')}';\n` : ''}${schema.hooks ? `import { hooks } from './${schema.hooks}';\n` : ''}${own.length ? `export * from './own.mjs';\n` : ''}const SCHEMA = ${JSON.stringify(serializeSchema(schema))};\n${schema.view ? `const H = withView(SCHEMA, '${ns}', ${schema.hooks ? 'hooks' : '{}'});\n` : ''}const X = createExecutor(deserializeSchema(SCHEMA)${schema.view ? ', H' : schema.hooks ? ', hooks' : ''});\n${used.map((a) => `export const ${a} = (ctx, args = {}) => X.operation(ctx, '${a}', args);`).join('\n')}\nexport const interceptInput = (ctx, text) => X.interceptInput(ctx, text);\nexport const outOfScope = (ctx, a = {}) => X.outOfScope(ctx, a.text);\n${schema.hooks ? "export const accepts = (info) => X.accepts(info);\n" : ''}export const referents = (ctx) => X.referents(ctx);\nexport const executor = X;\n${schema.view ? `export const { view, adopt } = viewOps(X, SCHEMA, '${ns}', H);\n` : ''}`;
  const files = { 'lexicon.sop': lex, 'patterns.sop': pats.join('\n'), 'operations.sop': ops, 'templates.sop': tpl, 'ops.mjs': opsMjs };
  if (schema.flags?.matrix) {   // the matrix reasoner runs the world natively (worlds/acts/matrix.mjs): the items are wires, the rules of the schema refuse what cannot be
    files['matrix.sop'] = matrixSop(schema, ns);
    files['matrix.templates.sop'] = matrixTemplates(schema, ns);
    files['fns.mjs'] = `// GENERATED from schema.sop by scripts/build-schema-world.mjs (spec 21 section 9). Never edited by hand.\nimport { createMatrixFns } from '${actsUrl.replace(/acts\.mjs$/, 'matrix.mjs')}';\nimport { deserializeSchema } from '${actsUrl}';\nconst schema = deserializeSchema(${JSON.stringify(serializeSchema(schema))});\nexport const { toState, adopt, stateKey, isView } = createMatrixFns(schema, ${JSON.stringify(ns)});\n`;
  }
  return files;
}
export const serializeSchema = (s) => ({ ...s, acts: [...s.acts] });
export const deserializeSchema = (j) => ({ ...j, acts: new Set(j.acts) });

/** Help examples of a world, one per form it has (the canonical examples of its generated patterns). */
/** The example of a form for this world: the forms are written about tables; `sample=<kind>` says which kind a world uses in its examples. */
const exampleOf = (schema, f) => (schema.sample ? f.example.replace(/\btables\b/gi, (m) => (schema.kinds[schema.sample]?.plural ?? `${schema.sample}s`)).replace(/\btable( \d+)?\b/gi, schema.sample) : f.example);
export const examples = (schema) => formsFor(schema).map((f) => exampleOf(schema, f));
/** The words of the `meta.worlds` card: act words, thing words (kinds and attributes), the frame words. Generated, so a schema world needs no hand-made card. */
export function card(schema) {
  const acts = [...new Set(formsFor(schema).map((f) => f.act))];
  const verbs = [...new Set(acts.flatMap((a) => (ACT_VERBS[a] ?? []).filter((v) => !v.includes('_'))))];
  return { acts, act: verbs, thing: [...kindWords(schema), ...attrWords(schema)], noun: schema.noun };
}
/** Coverage sentences (A5): for every act of the world and every kind it can apply to, one sentence built from the same forms. { act, kind, text }. */
export function sentences(schema) {
  const out = [];
  const kinds = Object.values(schema.kinds);
  const attrOf = (k) => Object.values(schema.attrs).find((a) => a.of.includes(k.name));
  const lab = (k) => (k.named ? `${k.name} Zed` : k.numbered ? `${k.name} 1` : `the ${k.name}`);
  for (const k of kinds) {
    const al = allowedActs(schema, k.name), a = attrOf(k);
    if (al.has('make')) out.push({ act: 'make', kind: k.name, text: `Add a ${k.name}.` });
    if (al.has('remove')) out.push({ act: 'remove', kind: k.name, text: `Remove ${lab(k)}.` });
    if (al.has('pick')) out.push({ act: 'pick', kind: k.name, text: `Select ${lab(k)}.` });
    if (al.has('copy')) out.push({ act: 'copy', kind: k.name, text: `Copy ${lab(k)}.` });
    if (al.has('ask')) out.push({ act: 'ask', kind: k.name, text: `How many ${k.plural} are there?` });
    if (al.has('change') && a) {
      const v = a.type === 'number' ? String(Math.max(a.min ?? 1, Math.min(a.max ?? 9, 3))) : a.type === 'enum' ? a.values[0] : a.type === 'colour' ? 'red' : 'ok';
      out.push({ act: 'change', kind: k.name, text: `Set ${lab(k)} ${a.name} to ${v}.` });
    }
  }
  return out;
}


// ---- several things in one role -----------------------------------------------------------------------------------------------------------------------
/** "a sun, a cloud and a man next to the house" -> [{ head: 'sun', tail: '' }, ...]: a coordination of noun phrases in the head of a role (before its first preposition); every part after the first starts with a determiner or a number, so "red and blue house" stays one part. The rule is `lang.en` (coordination). */
export const splitThings = (text) => en.splitThings(text, (site) => budget.tick(site));

// ---- the executor ----------------------------------------------------------------------------------------------------------------------------------------
/** The executor of one schema. All state is in the `state` object given to `run`, so the host owns persistence and the engine's snapshot/undo of sessions works. */
export function createExecutor(schema, hooks = {}) {
  const kinds = Object.values(schema.kinds);
  const know = hooks.know ?? {};
  const kindByWord = (w) => {
    for (const k of kinds) { budget.tick('acts.kind'); if (w === k.name || w === k.plural || k.words.includes(w) || same(singular(w), k.name) || same(w, k.plural)) return { kind: k, plural: w === k.plural || (singular(w) !== w && singular(w) === k.name) || (w !== k.name && same(w, k.plural)) }; }
    const hit = know.kind?.(w) ?? know.kind?.(singular(w));
    if (hit?.kind && schema.kinds[hit.kind]) return { kind: schema.kinds[hit.kind], plural: singular(w) !== w, via: 'knowledge', word: w };
    const any = kinds.find((k) => k.any);
    if (any && hit?.standIn) return { kind: any, plural: singular(w) !== w, via: 'knowledge', word: w, as: hit.standIn };
    if (any && know.kind?.(w)?.kind === any.name) return { kind: any, plural: false, via: 'knowledge', word: w };
    return null;
  };
  const attrByWord = (w, kind) => {
    for (const a of Object.values(schema.attrs)) if (same(w, a.name) || a.words.some((x) => same(w, x)) || same(singular(w), a.name)) return a;
    return null;
  };
  const attrsOf = (kind) => Object.values(schema.attrs).filter((a) => a.of.includes(kind.name));
  const defaultOf = (kind, a) => { const d = know.attrDefault?.(kind.name, a.name); if (d !== undefined) return d; if (a.def !== undefined) return a.type === 'number' ? Number(a.def) : a.type === 'bool' ? yes(a.def) : a.def; return a.type === 'number' ? (a.min ?? 0) : a.type === 'enum' ? a.values[0] : undefined; };

  /**
   * The focus of the dialogue (hook `focus`, else the state's own; M1): when the world's own focus holds nothing, the thing the dialogue module last named in this
   * world (words, `ctx.dialogueFocus()`) is resolved against the items: "it" after a turn of another tab still means the last thing talked about.
   */
  const live = { dlg: null, busy: false };
  const focusOf = (st) => {
    const own = hooks.focus?.(st) ?? st.focus;
    if (own.ids?.length || !live.dlg || live.busy) return own;
    live.busy = true;
    try {
      const d = live.dlg();
      const r = d?.thing ? resolveOne(st, d.thing, { allowEmpty: true }) : null;
      if (r?.ids?.length) return { ids: r.ids, place: own.place ?? null, act: own.act ?? null };
    } catch { /* the world's own focus stands */ } finally { live.busy = false; }
    return own;
  };

  function init(state) {
    state.items ??= []; state.counter ??= {}; state.history ??= []; state.future ??= []; state.saved ??= {}; state.log ??= []; state.links ??= []; state.groups ??= {}; state.focus ??= { ids: [], place: null, act: null }; state.outbox ??= [];
    return state;
  }
  const snapshot = (st) => JSON.parse(JSON.stringify({ items: st.items, counter: st.counter, links: st.links, groups: st.groups, focus: st.focus }));
  const restore = (st, s) => { st.items = s.items; st.counter = s.counter; st.links = s.links; st.groups = s.groups; st.focus = s.focus; };

  // ---- labels and replies ----
  const label = (it, withThe = false) => { const k = schema.kinds[it.kind]; if (it.name) return `${k?.named ? `${it.kind} ` : ''}${it.name}`; if (k?.numbered || k?.named) return `${it.kind} ${it.n}`; return `${withThe ? 'the ' : ''}${it.kind}`; };
  const labels = (items) => {
    if (items.length === 1) return label(items[0], true);
    const ks = [...new Set(items.map((i) => i.kind))];
    const k0 = schema.kinds[ks[0]];
    if (ks.length === 1 && (items.length > 3 || (k0 && !k0.named && !k0.numbered))) return `${items.length} ${k0?.plural ?? `${ks[0]}s`}`;
    return joinAnd(items.map((i) => label(i, false)));
  };
  const attrText = (a, v) => (a.type === 'bool' ? (v ? a.name : `not ${a.name}`) : String(v));

  // ---- referents ----
  /**
   * The things a phrase names: { ids } | { ask } | { none, kindWord } | { unknownKind } with `source` (said | focus | scene) and `guess`.
   * The library reads the whole phrase (sopworld 0.40 `resolve` through `np-lib.mjs`: coordination, a choice that is asked, a part of a set, "the other one", ordinals, numbers, names, pronouns);
   * the relative clause is folded first ("the table that is red" is "red table"). What it does not read is the host's: the parts of a coordination one by one (so that the part that fails says why),
   * a bare name, the failure classes of the replies (`resolveHost`).
   */
  function resolve(st, text, opts = {}) {
    text = foldRelative(text);
    const lib = viaLibrary(st, text);
    if (lib) return lib;
    const np = en.nounPhrase(text);
    const parts = np.choice ? np.choice.map((p) => p.text) : en.splitList(text);
    if (parts.length < 2) return resolveHost(st, text, opts);
    const ids = []; let kind = null;
    for (let p of parts) {
      budget.tick('acts.coord');
      if (kind && en.bareDistributes(p)) p = `${kind} ${p}`;   // "tables 2 and 9": the part that fails says so
      const r = resolve(st, p, opts);
      if (!r.ids) return r;
      kind ??= r.kind;
      for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
    }
    if (np.choice && ids.length > 1) return asked(st, { ask: ids, how: 'choice', kind });
    return { ids, source: 'said', kind };
  }
  const asked = (st, r) => {
    const names = joinAnd(r.ask.map((id) => label(st.items.find((i) => i.id === id))).filter(Boolean));
    if (r.how === 'choice') return { ask: `Which do you mean: ${r.ask.map((id) => label(st.items.find((i) => i.id === id))).join(' or ')}?`, candidates: r.ask };
    if (r.how === 'part') return { ask: `Which ${r.n != null ? `${r.n} of` : 'ones of'} ${names}? Say their names or numbers.`, candidates: r.ask };
    return { ask: `Which ${r.kind ?? 'one'}: ${names}?`, candidates: r.ask };
  };
  function viaLibrary(st, text) {
    const t = toks(text).filter((w) => !DET.has(w) || PRONOUN.has(w));
    if (!t.length || !st.items.length) return null;
    budget.tick('acts.np-lib');
    const pron = t.find((w) => PRONOUN.has(w));
    const vals = new Set(st.items.flatMap((i) => Object.values(i.attrs ?? {})).map((v) => String(v).toLowerCase()));
    let r;
    try {
      r = resolvePhrase(st.items, text, {
        kindOf: (w) => { const h = kindByWord(w); return h ? { kind: h.kind.name, plural: h.plural } : null; },
        valueOf: (w) => { if (vals.has(w)) return w; for (const a of Object.values(schema.attrs)) if (a.type === 'enum' || a.type === 'colour') { const v = valueOf(a, w); if (v !== undefined) return v; } return undefined; },
        nameOf: (w) => st.items.find((i) => i.name && (i.name.toLowerCase() === w || same(i.name.toLowerCase(), w)))?.name ?? null,
        focus: focusOf(st).ids.filter((id) => st.items.some((i) => i.id === id)),   // a pronoun and "the other one" read it (np-lib.mjs); "the tables" with one in focus is still every table
      });
    } catch (e) { if (e?.name === 'BudgetExceeded') throw e; return null; }   // a budget stop is the host's; a phrase the library cannot read is the host's to read
    if (!r) return null;
    const item = (id) => st.items.find((i) => i.id === id);
    if (r.missing) return { missing: true };
    if (r.none) return { none: true, kind: r.kind, kindWord: 'other' };
    if (r.ask) return asked(st, r);
    if (r.other) {   // "the other one": what is not in focus; one is taken (and said), several are asked unless "the others" was said
      const kind = st.items.find((i) => i.id === r.ids[0])?.kind;
      if (r.other.plural || r.ids.length === 1) return { ids: r.ids, source: 'focus', kind, guess: `I took ${labels(r.ids.map(item))} as the other one` };
      return { ask: `Which other ${kind}: ${joinAnd(r.ids.map((id) => label(item(id))))}?`, candidates: r.ids };
    }
    if (r.tier === 'focus') return pron ? { ids: r.ids, source: 'focus', guess: `I took "${pron}" to mean ${labels(r.ids.map(item))}, the thing we just talked about` } : null;
    return { ids: r.ids, source: 'said', kind: r.kind ?? undefined };
  }
  function resolveHost(st, text, { allowEmpty = false } = {}) {
    const t = toks(text).filter((w) => !DET.has(w) || PRONOUN.has(w));
    if (!t.length) return allowEmpty ? { ids: [] } : { missing: true };
    if ((t.length === 1 || t.at(-2) === 'of') && PRONOUN.has(t.at(-1))) return { missing: true };   // "two of them" with nothing in focus   // a pronoun with something in focus was read by the library (`viaLibrary`); with nothing in focus there is nothing to name
    let all = false, ord = null, n = null; const rest = [];
    for (const w of t) {
      if (w === 'all' || w === 'every' || w === 'each' || w === 'both' || w === 'everything') all = true;
      else if (Object.hasOwn(ORD, w)) ord = ORD[w];
      else if (/^\d+$/.test(w)) n = Number(w);
      else rest.push(w);
    }
    if (w0(rest) === 'everything') return { ids: st.items.map((i) => i.id), source: 'said' };
    let kindHit = null, plural = false; const other = [];
    for (const w of rest) { if (!kindHit) { const h = kindByWord(w); if (h) { kindHit = h; plural = h.plural; continue; } } other.push(w); }
    let pool = st.items;
    if (kindHit) pool = pool.filter((i) => i.kind === kindHit.kind.name);
    const nameWords = other;
    let named = [];
    if (nameWords.length) {
      const nm = nameWords.join(' ');
      named = pool.filter((i) => i.name && (i.name.toLowerCase() === nm || same(i.name.toLowerCase(), nm)));
      if (!named.length) {   // the other words may be a value of an attribute ("the blue table")
        const vs = nameWords.filter((w) => Object.values(schema.attrs).some((a) => valueOf(a, w) !== undefined));
        if (vs.length === nameWords.length) pool = pool.filter((i) => vs.every((w) => Object.entries(i.attrs).some(([an, av]) => valueOf(schema.attrs[an], w) !== undefined && String(av).toLowerCase() === String(valueOf(schema.attrs[an], w)).toLowerCase())));
        else if (!kindHit) return { unknownKind: nm };
        else if (!n && !ord) { const unk = nameWords[0]; return kindHit.kind ? { none: true, kind: kindHit.kind.name, word: unk, kindWord: nm } : { unknownKind: nm }; }
      } else pool = named;
    }
    if (n != null) pool = pool.filter((i) => i.n === n);
    if (!kindHit && !named.length && !nameWords.length && n == null && !ord && !all) return { missing: true };
    if (!kindHit && n != null && !named.length && !nameWords.length) return { missing: true };
    if (ord) { const i = ord === -1 ? pool.length - 1 : ord - 1; pool = pool[i] ? [pool[i]] : []; }
    if (!pool.length) return { none: true, kind: kindHit?.kind.name, kindWord: kindHit ? kindHit.kind.name : nameWords.join(' '), n, hit: kindHit };
    const base = { ids: pool.map((i) => i.id), source: 'said', kind: kindHit?.kind.name };
    if (pool.length > 1 && !all && !plural && n == null && !ord) {
      if (pool.every((i) => i.kind === pool[0].kind) && !nameWords.length) return { ask: `Which ${pool[0].kind}: ${joinAnd(pool.map((i) => label(i)))}?`, candidates: pool.map((i) => i.id) };
    }
    return base;
  }
  const w0 = (a) => (a.length === 1 ? a[0] : null);
  function valueOf(a, text) {
    const raw = String(text ?? '').trim(); const low = raw.toLowerCase();
    if (!raw) return undefined;
    if (a.type === 'number') { const v = num(raw); return Number.isFinite(v) ? v : undefined; }
    if (a.type === 'enum') { const hit = a.values.find((x) => x.toLowerCase() === low) ?? a.values.find((x) => same(x.toLowerCase(), low)); return hit; }
    if (a.type === 'colour') { if (!a.values.length) return colourName(low) ?? (know.colour?.(low) ? low : undefined); return a.values.find((x) => x === low) ?? a.values.find((x) => same(x, low)); }   // a colour attribute with no listed values takes any colour of the catalog (the one reader)
    if (a.type === 'bool') return ['yes', 'on', 'true'].includes(low) ? true : ['no', 'off', 'false'].includes(low) ? false : undefined;
    return raw;
  }

  // ---- bookkeeping ----
  const rec = (st, req, res) => { st.log.push({ act: req.act, mode: req.mode ?? null, text: req.text ?? null, roles: roleView(req), diff: res.diff ?? null, reply: res.note, guesses: res.guesses ?? [] }); if (st.log.length > 50) st.log.shift(); st.lastAct = st.log[st.log.length - 1]; };
  const roleView = (r) => Object.fromEntries(['thing', 'attribute', 'value', 'place', 'amount', 'rel', 'rest'].filter((k) => r[k] != null && r[k] !== '').map((k) => [k, r[k]]));
  const say = (note, extra = {}) => ({ status: 'supported', note, ...extra });
  const guessLine = (g) => (g.length ? ` (${cap(joinAnd(g))}.)` : '');

  // ---- fallback pieces (A4) ----
  const kindsLine = () => `I can work with ${joinAnd(kinds.map((k) => k.plural.replace(/_/g, ' ')))}${Object.keys(schema.attrs).length ? `; they have ${joinAnd(Object.keys(schema.attrs))}` : ''}.`;
  function notHere(word, act) {
    const where = hooks.whereKind?.(word) ?? [];
    const attr = attrByWord(word);
    if (attr && attr.of.length) return say(`${cap(joinAnd(attr.of.map((k) => `a ${k}`)))} ${attr.of.length > 1 ? 'have' : 'has'} ${attr.name}; I have nothing like that here. ${kindsLine()}`);
    const w = where.length ? ` The ${joinAnd(where.map((x) => x.world))} ${where.length > 1 ? 'have' : 'has'} ${word}.` : '';
    return say(`There is no ${word} in the ${schema.noun}.${w} ${kindsLine()}`, { fallback: 'not-here', where });
  }
  function ask(st, question, pending) { st.pending = pending; st.inputMode = 'confirm'; return say(question, { fallback: 'question', asked: pending?.guess ?? null }); }

  // ---- the acts ----
  function run(state, req) {
    const st = init(state);
    budget.tick('acts.run');
    const spec = ACTS[req.act];
    if (!spec) return say(`I do not know the act "${req.act}".`);
    if (!schema.acts.has(req.act)) {
      const where = hooks.whereAct?.(req.act) ?? [];
      return say(`I cannot ${spec.verb} things in the ${schema.noun}.${where.length ? ` The ${joinAnd(where.map((x) => x.world))} can.` : ''} ${kindsLine()}`, { fallback: 'not-here' });
    }
    if (req.act === 'undo') return doUndo(st);
    if (req.act === 'redo') return doRedo(st);
    const before = spec.mutates ? snapshot(st) : null, logLen = st.log.length;
    const fn = { make, remove, change, place, connect, group, pick, ask: askAct, copy, send, save, load, own: () => say('I could not read that here.') }[req.act];
    const res = fn(st, req);
    if (res.diff && (res.diff.added.length || res.diff.removed.length || res.diff.changed.length || res.diff.moved?.length || res.diff.linked?.length) && spec.mutates) {
      st.history.push({ snap: before, logLen, reply: res.note, act: req.act }); if (st.history.length > schema.limits.history) st.history.shift(); st.future = [];
    } else if (spec.mutates) restore(st, before);   // nothing changed: nothing to undo, and a failed act leaves no half-done state
    if (!res.fallback && req.act !== 'ask') rec(st, req, res);   // the log is what was done; a question about it is not an act
    return res;
  }
  const emptyDiff = () => ({ added: [], removed: [], changed: [], moved: [], linked: [] });
  const newItem = (st, kind, extra = {}) => {
    st.counter[kind.name] = (st.counter[kind.name] ?? 0) + 1;
    const it = { id: `${kind.name}-${st.counter[kind.name]}`, kind: kind.name, n: st.counter[kind.name], name: extra.name ?? null, attrs: {}, place: null };
    for (const a of attrsOf(kind)) { const d = defaultOf(kind, a); if (d !== undefined) it.attrs[a.name] = d; }
    return it;
  };

  /** The thing role of an act with the graded fill: said > focus > scene > knowledge > default; returns { items } | { reply }. */
  function target(st, req, { many = true, act } = {}) {
    const guesses = [];
    let r = req.thing ? resolve(st, req.thing) : { missing: true };
    if (r.missing) {
      const f = focusOf(st).ids.map((id) => st.items.find((i) => i.id === id)).filter(Boolean);
      if (f.length && !req.thing) { r = { ids: f.map((i) => i.id), source: 'focus' }; guesses.push(`I took ${labels(f)}, the thing we just talked about`); }
      else if (st.items.length === 1) { r = { ids: [st.items[0].id], source: 'scene' }; guesses.push(`I took ${label(st.items[0], true)}, the only thing here`); }
      else if (req.thing) return { reply: say(`${st.items.length ? `Which one do you mean by "${req.thing}"?` : `There is nothing here yet.`} Say it again with a name or a number${st.items.length ? `: ${joinAnd(st.items.slice(0, 4).map((i) => label(i)))}` : ''}.`, { fallback: 'question' }) };
      else return { reply: ask(st, `${cap(ACTS[act].verb)} what? Name the thing (${joinAnd(st.items.slice(0, 4).map((i) => label(i))) || 'there is nothing here yet'}).`, { type: 'role', role: 'thing', req: { ...req }, guess: `${ACTS[act].verb}` }) };
    }
    if (r.unknownKind) return { reply: notHere(r.unknownKind, act) };
    if (r.none) {
      if (r.kind) return { reply: say(`There is no ${r.kindWord === r.kind ? r.kind : r.kindWord}${r.n != null ? ` ${r.n}` : ''}${r.kindWord === r.kind || r.n != null ? '' : ` ${r.kind}`} here${st.items.some((i) => i.kind === r.kind) ? `; I have ${joinAnd(st.items.filter((i) => i.kind === r.kind).map((i) => label(i)))}` : ''}.`, { fallback: 'none' }) };
      return { reply: notHere(r.kindWord, act) };
    }
    if (r.ask) return { reply: ask(st, r.ask, { type: 'role', role: 'thing', req: { ...req }, guess: ACTS[act].verb, candidates: r.candidates }) };
    if (r.guess) guesses.push(r.guess);
    const items = r.ids.map((id) => st.items.find((i) => i.id === id)).filter(Boolean);
    if (!many && items.length > 1) return { reply: ask(st, `Which one: ${joinAnd(items.map((i) => label(i)))}?`, { type: 'role', role: 'thing', req: { ...req }, guess: ACTS[act].verb, candidates: items.map((i) => i.id) }) };
    return { items, guesses };
  }

  function make(st, req) {
    const kk = allowedKinds(req);
    let t = toks(req.thing).filter((w) => !DET.has(w)); let amount = req.amount != null ? num(req.amount) : null; const guesses = [];
    if (t.length && /^\d+$/.test(t[0]) && amount == null) amount = Number(t.shift());
    if (t.length && NUMW[t[0]] !== undefined && amount == null && t.length > 1) amount = NUMW[t.shift()];
    let hit = null; const before = [], after = [];
    for (const w of t) { if (!hit) { const h = kindByWord(w); if (h) { hit = h; continue; } before.push(w); } else after.push(w); }
    if (!hit) return notHere(t.join(' ') || 'thing', 'make');
    const k = hit.kind;
    if (kk && !kk.has(k.name)) return say(`I cannot add ${k.plural} here.`, { fallback: 'not-here' });
    if (amount == null) amount = 1;
    if (!Number.isInteger(amount) || amount < 1) return say(`I can only add a whole number of ${k.plural}, from 1 up.`, { fallback: 'limit' });
    const have = st.items.filter((i) => i.kind === k.name).length;
    if (k.max != null && have + amount > k.max) return say(`I can have at most ${k.max} ${k.plural}; there ${have === 1 ? 'is' : 'are'} ${have} now${have < k.max ? `, so I can add ${k.max - have} more` : ''}.`, { fallback: 'limit' });
    if (st.items.length + amount > schema.limits.items) return say(`The ${schema.noun} holds at most ${schema.limits.items} things.`, { fallback: 'limit' });
    const diff = emptyDiff(); let name = req.value ? String(req.value).trim() : null;
    if (!name && k.named && after.length) name = after.join(' ');
    if (name) name = name.replace(/\b\w/g, (c) => c.toUpperCase());
    const mods = [...before, ...(!k.named ? after : [])];
    const known = (w) => attrsOf(k).some((a) => a.type !== 'text' && valueOf(a, w) !== undefined);
    const left = mods.filter((w) => !known(w) && !/^\d+$/.test(w) && !IGNORE.has(w));
    if (left.length) return ask(st, `I did not catch "${left.join(' ')}". Shall I just add ${amount === 1 ? `a ${k.name}` : `${amount} ${k.plural}`}?`, { type: 'confirm', req: { ...req, thing: k.name, amount }, guess: `add ${amount === 1 ? `a ${k.name}` : `${amount} ${k.plural}`}` });
    if (mods.some((w) => /^\d+$/.test(w)) && k.numbered) guesses.push(`I numbered it in order, not ${mods.find((w) => /^\d+$/.test(w))}`);
    if (name && st.items.some((i) => i.kind === k.name && i.name?.toLowerCase() === name.toLowerCase())) return say(`There is already a ${k.name} ${name}; a name is used once.`, { fallback: 'limit' });
    if (hit.via === 'knowledge' && hit.as) guesses.push(`I have no ${hit.word}, so I used a ${hit.as}`);
    const made = [];
    for (let i = 0; i < amount; i++) {
      const it = newItem(st, k, { name: amount === 1 ? name : null });
      if (hit.via === 'knowledge') it.word = hit.word;
      for (const w of mods) for (const a of attrsOf(k)) { const v = valueOf(a, w); if (v !== undefined && (a.type !== 'text')) { it.attrs[a.name] = v; break; } }
      st.items.push(it); made.push(it); diff.added.push(it.id);
    }
    // place: said (rel + place), else scene (the only container with room), else knowledge (usual place), else nothing
    let where = '';
    if (k.in) {
      let c = null;
      if (req.place) { const r = resolve(st, req.place); if (r.ids?.length === 1) c = st.items.find((i) => i.id === r.ids[0]); else if (r.ask) { for (const m of made) { st.items.pop(); } return ask(st, r.ask, { type: 'role', role: 'place', req: { ...req }, guess: 'add' }); } else if (r.none || r.unknownKind) { for (const m of made) st.items.pop(); return say(`There is no ${req.place} to put them at.`, { fallback: 'none' }); } }
      else { const cs = st.items.filter((i) => i.kind === k.in && hasRoom(st, i, made.length)); if (cs.length === 1) { c = cs[0]; guesses.push(`I put ${made.length > 1 ? 'them' : 'it'} at ${label(c)}, the only ${k.in} with room`); } }
      if (c && req.rel && !AT.has(req.rel)) guesses.push(`I read "${String(req.rel).replace(/_/g, ' ')}" as "at": ${k.plural} go at a ${k.in}`);
      if (c) { const room = roomOf(st, c); if (room != null && room < made.length) { st.items.splice(st.items.length - made.length, made.length); return say(`${cap(label(c))} has room for ${room} more ${room === 1 ? k.name : k.plural}, not ${made.length}.`, { fallback: 'limit' }); } for (const m of made) { m.place = { rel: 'at', ref: c.id }; } where = ` at ${label(c)}`; }
    }
    st.focus = { ids: made.map((m) => m.id), place: made[0].place?.ref ?? st.focus.place, act: 'make' };
    const what = labels(made);
    return say(`I added ${what}${where}.${guessLine(guesses)}`, { diff, guesses, value: made.map((m) => m.id) });
  }
  const allowedKinds = (req) => null;
  const IGNORE = new Set(['for', 'me', 'please', 'pls', 'now', 'too', 'also', 'there', 'here', 'again', 'thanks', 'more', 'new', 'of', 'to', 'with']);
  const AT = new Set(['at', 'on', 'in', 'into', 'onto', 'to', 'inside', 'with', 'by']);
  function roomOf(st, c) { const ck = schema.kinds[c.kind]; const inner = kinds.find((k) => k.in === c.kind && k.capacity); if (!inner) return null; const cap = c.attrs[inner.capacity]; if (typeof cap !== 'number') return null; return cap - st.items.filter((i) => i.place?.ref === c.id).length; }
  const hasRoom = (st, c, n) => { const r = roomOf(st, c); return r == null || r >= n; };

  function remove(st, req) {
    const t = target(st, req, { act: 'remove' }); if (t.reply) return t.reply;
    let items = t.items; const diff = emptyDiff();
    if (req.place) { const r = resolve(st, req.place); if (r.ids?.length) items = items.filter((i) => r.ids.includes(i.place?.ref)); if (!items.length) return say(`Nothing like that is at ${req.place}.`, { fallback: 'none' }); }
    for (const it of items) { diff.removed.push(it.id); }
    st.items = st.items.filter((i) => !diff.removed.includes(i.id));
    for (const i of st.items) if (i.place && diff.removed.includes(i.place.ref)) { diff.moved.push({ id: i.id, from: i.place, to: null }); i.place = null; }
    st.links = st.links.filter((l) => !diff.removed.includes(l.a) && !diff.removed.includes(l.b));
    st.focus = { ids: [], place: st.focus.place, act: 'remove' };
    return say(`I removed ${labels(items)}.${guessLine(t.guesses)}`, { diff, guesses: t.guesses, removed: items.map((i) => ({ ...i })) });
  }

  function change(st, req) {
    const mode = req.mode ?? 'set';
    const t = target(st, req, { act: 'change' }); if (t.reply) return t.reply;
    const items = t.items, guesses = [...t.guesses], diff = emptyDiff();
    let attr = null;
    if (req.attribute) { attr = attrByWord(toks(req.attribute).join(' ')) ?? attrByWord(toks(req.attribute).pop()); if (!attr) return notHere(toks(req.attribute).join(' '), 'change'); }
    let value = req.value;
    if (mode !== 'set' && !attr && value) {   // "make it bigger": the attribute that declares the comparative
      const w = toks(value)[0]; attr = Object.values(schema.attrs).find((a) => (mode === 'more' ? a.more : a.less).includes(w) && items.every((i) => a.of.includes(i.kind)));
      if (!attr) return ask(st, `I do not know what "${value}" means for ${labels(items)}. ${cap(items[0].kind)} has ${joinAnd(attrsOf(schema.kinds[items[0].kind]).map((a) => a.name))}; which one do you want changed?`, { type: 'role', role: 'attribute', req: { ...req }, guess: `change the ${items[0].kind}` });
      value = null;
    }
    if (!attr && mode === 'set' && value) {   // the attribute is implied by the value ("make table 2 blue")
      const cands = Object.values(schema.attrs).filter((a) => items.every((i) => a.of.includes(i.kind)) && valueOf(a, value) !== undefined && a.type !== 'text');
      if (cands.length === 1) attr = cands[0];
      else if (cands.length > 1) return ask(st, `"${value}" could be the ${joinAnd(cands.map((c) => c.name))} of ${labels(items)}. Which one?`, { type: 'role', role: 'attribute', req: { ...req }, guess: `change ${labels(items)}` });
      else { const a = Object.values(schema.attrs).find((x) => items.some((i) => x.of.includes(i.kind))); return say(`${cap(items[0].kind)} cannot be "${value}". ${a ? `It has ${joinAnd(attrsOf(schema.kinds[items[0].kind]).map((x) => x.name))}.` : ''}`, { fallback: 'none' }); }
    }
    if (!attr) return ask(st, `Change what of ${labels(items)}? It has ${joinAnd(attrsOf(schema.kinds[items[0].kind]).map((a) => a.name))}.`, { type: 'role', role: 'attribute', req: { ...req }, guess: `change ${labels(items)}` });
    const bad = items.filter((i) => !attr.of.includes(i.kind));
    if (bad.length) { const owner = attr.of; return say(`${cap(`a ${bad[0].kind}`)} has no ${attr.name}; ${joinAnd(owner.map((k) => `a ${k}`))} ${owner.length > 1 ? 'have' : 'has'}.`, { fallback: 'not-here' }); }
    for (const it of items) {
      const cur = it.attrs[attr.name]; let nv;
      if (mode === 'set') {
        if (value == null || value === '') return ask(st, `What should the ${attr.name} of ${labels(items)} be?`, { type: 'role', role: 'value', req: { ...req, attribute: attr.name }, guess: `change the ${attr.name} of ${labels(items)}` });
        nv = valueOf(attr, value);
        if (nv === undefined) return say(`${cap(String(value))} is not a ${attr.name} I know${attr.type === 'enum' ? `; it can be ${joinAnd(attr.values)}` : attr.type === 'number' ? `; it is a number${attr.min != null ? ` from ${attr.min}` : ''}${attr.max != null ? ` to ${attr.max}` : ''}` : ''}.`, { fallback: 'limit' });
      } else if (attr.type === 'number') {
        let step = req.amount != null ? num(req.amount) : null; if (step == null || !Number.isFinite(step)) { step = attr.step ?? 1; guesses.push(`I assumed ${step}`); }
        nv = (cur ?? 0) + (mode === 'more' ? step : -step);
      } else if (attr.type === 'enum') {
        const i = attr.values.indexOf(cur), j = i + (mode === 'more' ? 1 : -1);
        if (j < 0 || j >= attr.values.length) return say(`The ${attr.name} of ${label(it, true)} is already ${cur}, the ${mode === 'more' ? 'highest' : 'lowest'} there is.`, { fallback: 'limit' });
        nv = attr.values[j];
      } else return say(`"${mode === 'more' ? 'More' : 'Less'}" does not mean anything for the ${attr.name}.`, { fallback: 'limit' });
      if (attr.type === 'number' && ((attr.min != null && nv < attr.min) || (attr.max != null && nv > attr.max))) return say(`The ${attr.name} of ${label(it, true)} can only be ${attr.min != null ? `from ${attr.min}` : ''}${attr.max != null ? ` to ${attr.max}` : ''}; it stays ${cur}.`, { fallback: 'limit' });
      const k = schema.kinds[it.kind]; const inner = kinds.find((x) => x.in === it.kind && x.capacity === attr.name);
      if (inner && nv < st.items.filter((i) => i.place?.ref === it.id).length) return say(`${cap(label(it))} has ${st.items.filter((i) => i.place?.ref === it.id).length} ${inner.plural} now, so the ${attr.name} cannot go below that.`, { fallback: 'limit' });
      if (cur !== nv) { diff.changed.push({ id: it.id, attr: attr.name, from: cur, to: nv }); it.attrs[attr.name] = nv; }
    }
    st.focus = { ids: items.map((i) => i.id), place: st.focus.place, act: 'change' };
    if (!diff.changed.length) return say(`${cap(labels(items))} ${items.length > 1 ? 'are' : 'is'} already ${attr.type === 'bool' ? attrText(attr, items[0].attrs[attr.name]) : `${attr.name} ${items[0].attrs[attr.name]}`}; nothing changed.`, { diff, guesses });
    const one = diff.changed[0];
    const msg = mode === 'set' ? (attr.type === 'colour' || attr.type === 'enum' && false ? `I made ${labels(items)} ${one.to}` : `I set the ${attr.name} of ${labels(items)} to ${attrText(attr, one.to)}`) + (one.from !== undefined && items.length === 1 ? ` (it was ${attrText(attr, one.from)})` : '')
      : `${cap(labels(items))} now ${items.length > 1 ? 'have' : 'has'} ${one.to} ${attr.name}${typeof one.from === 'number' ? `, ${Math.abs(one.to - one.from)} ${mode === 'more' ? 'more' : 'fewer'} than before` : ''}`;
    return say(`${msg}.${guessLine(guesses)}`, { diff, guesses });
  }

  function place(st, req) {
    const t = target(st, req, { act: 'place' }); if (t.reply) return t.reply;
    const items = t.items, guesses = [...t.guesses], diff = emptyDiff();
    let ptxt = req.place; let c = null;
    if (!ptxt) { const f = focusOf(st).place; if (f) { c = st.items.find((i) => i.id === f); if (c) guesses.push(`I used ${label(c)}, the place we just talked about`); } }
    if (!c) {
      if (!ptxt) return ask(st, `Where should I put ${labels(items)}?`, { type: 'role', role: 'place', req: { ...req, thing: items.map((i) => label(i)).join(' and ') }, guess: `put ${labels(items)}` });
      const r = resolve(st, ptxt);
      if (r.ask) return ask(st, r.ask, { type: 'role', role: 'place', req: { ...req }, guess: `put ${labels(items)}` });
      if (r.unknownKind) return notHere(r.unknownKind, 'place');
      if (r.none) return say(`There is no ${ptxt} here${st.items.some((i) => i.kind === r.kind) ? `; I have ${joinAnd(st.items.filter((i) => i.kind === r.kind).map((i) => label(i)))}` : ''}.`, { fallback: 'none' });
      if (!r.ids?.length) return ask(st, `Where should I put ${labels(items)}?`, { type: 'role', role: 'place', req: { ...req }, guess: `put ${labels(items)}` });
      if (r.ids.length > 1) return ask(st, `Which one: ${joinAnd(r.ids.map((id) => label(st.items.find((i) => i.id === id))))}?`, { type: 'role', role: 'place', req: { ...req }, guess: `put ${labels(items)}` });
      c = st.items.find((i) => i.id === r.ids[0]);
    }
    if (req.rel && !AT.has(req.rel) && items.every((i) => schema.kinds[i.kind].in === c.kind)) guesses.push(`I read "${String(req.rel).replace(/_/g, ' ')}" as "at": ${schema.kinds[items[0].kind].plural} go at a ${c.kind}`);
    const bad = items.filter((i) => schema.kinds[i.kind].in !== c.kind);
    if (bad.length) { const bk = schema.kinds[bad[0].kind]; return say(bk.in ? `${cap(bk.plural)} go at a ${bk.in}, not at ${label(c)}.` : `${cap(bk.plural)} are not put anywhere in the ${schema.noun}${kinds.some((k) => k.in === c.kind) ? `; ${kinds.filter((k) => k.in === c.kind).map((k) => k.plural).join(' and ')} go at ${c.kind === bk.name ? 'them' : `a ${c.kind}`}` : ''}.`, { fallback: 'limit' }); }
    const room = roomOf(st, c); const moving = items.filter((i) => i.place?.ref !== c.id);
    if (room != null && room < moving.length) return say(`${cap(label(c))} has ${room === 0 ? 'no seat left' : `room for ${room} more`}; ${room === 0 ? `all its ${schema.kinds[items[0].kind].plural} are taken` : `I cannot fit ${moving.length}`}.${other(st, c, items)}`, { fallback: 'limit' });
    for (const it of items) { if (it.place?.ref === c.id) continue; diff.moved.push({ id: it.id, from: it.place, to: { rel: 'at', ref: c.id } }); it.place = { rel: 'at', ref: c.id }; }
    st.focus = { ids: items.map((i) => i.id), place: c.id, act: 'place' };
    if (!diff.moved.length) return say(`${cap(labels(items))} ${items.length > 1 ? 'are' : 'is'} already at ${label(c)}.`, { diff, guesses });
    return say(`I put ${labels(items)} at ${label(c)}.${guessLine(guesses)}`, { diff, guesses });
  }
  const other = (st, c, items) => { const free = st.items.filter((i) => i.kind === c.kind && i.id !== c.id && hasRoom(st, i, items.length)); return free.length ? ` ${cap(joinAnd(free.map((i) => label(i))))} ${free.length > 1 ? 'have' : 'has'} room.` : ''; };

  function connect(st, req) {
    const a = target(st, req, { act: 'connect' }); if (a.reply) return a.reply;
    const r = req.place ? resolve(st, req.place) : { missing: true };
    if (r.missing) return ask(st, `Connect ${labels(a.items)} to what?`, { type: 'role', role: 'place', req: { ...req }, guess: `connect ${labels(a.items)}` });
    if (r.none || r.unknownKind) return say(`There is no ${req.place} to connect to.`, { fallback: 'none' });
    if (r.ask) return ask(st, r.ask, { type: 'role', role: 'place', req: { ...req }, guess: `connect ${labels(a.items)}` });
    const b = r.ids.map((id) => st.items.find((i) => i.id === id)); const diff = emptyDiff();
    for (const x of a.items) for (const y of b) { if (x.id === y.id || st.links.some((l) => (l.a === x.id && l.b === y.id) || (l.a === y.id && l.b === x.id))) continue; st.links.push({ a: x.id, b: y.id }); diff.linked.push([x.id, y.id]); }
    if (!diff.linked.length) return say(`That arrow already connects ${labels(a.items)} and ${labels(b)}.`, { diff, fallback: 'limit' });   // a duplicate link is refused with the reason, in every world on the executor
    st.focus = { ids: a.items.map((i) => i.id), place: st.focus.place, act: 'connect' };
    return say(`I connected ${labels(a.items)} to ${labels(b)}.${guessLine(a.guesses)}`, { diff, guesses: a.guesses });
  }

  function group(st, req) {
    const t = target(st, req, { act: 'group' }); if (t.reply) return t.reply;
    const diff = emptyDiff();
    if (req.mode === 'apart') {
      const gs = [...new Set(t.items.map((i) => i.group).filter(Boolean))];
      if (!gs.length) return say(`${cap(labels(t.items))} ${t.items.length > 1 ? 'are' : 'is'} not in a group.`, { diff });
      for (const i of st.items) if (gs.includes(i.group)) { diff.changed.push({ id: i.id, attr: 'group', from: i.group, to: null }); i.group = null; }
      return say(`I took the group apart: ${labels(t.items)} ${t.items.length > 1 ? 'are' : 'is'} free again.${guessLine(t.guesses)}`, { diff, guesses: t.guesses });
    }
    if (t.items.length < 2) return say(`A group needs at least two things; I have only ${labels(t.items)}.`, { fallback: 'limit' });
    const gid = `g${(st.counter.__group = (st.counter.__group ?? 0) + 1)}`;
    for (const i of t.items) { diff.changed.push({ id: i.id, attr: 'group', from: i.group ?? null, to: gid }); i.group = gid; }
    return say(`I grouped ${labels(t.items)}.${guessLine(t.guesses)}`, { diff, guesses: t.guesses });
  }

  function pick(st, req) {
    const t = target(st, req, { act: 'pick' }); if (t.reply) return t.reply;
    st.focus = { ids: t.items.map((i) => i.id), place: st.focus.place, act: 'pick' };
    return say(`I selected ${labels(t.items)}.${guessLine(t.guesses)}`, { guesses: t.guesses, value: st.focus.ids });
  }

  function copy(st, req) {
    const t = target(st, req, { act: 'copy' }); if (t.reply) return t.reply;
    const diff = emptyDiff(); const made = [];
    if (st.items.length + t.items.length > schema.limits.items) return say(`The ${schema.noun} holds at most ${schema.limits.items} things.`, { fallback: 'limit' });
    for (const it of t.items) {
      const k = schema.kinds[it.kind]; const have = st.items.filter((i) => i.kind === k.name).length;
      if (k.max != null && have + 1 > k.max) return say(`I can have at most ${k.max} ${k.plural}.`, { fallback: 'limit' });
      const c = newItem(st, k, { name: it.name ? `${it.name} copy` : null }); c.attrs = { ...it.attrs }; c.place = null; st.items.push(c); made.push(c); diff.added.push(c.id);
    }
    st.focus = { ids: made.map((m) => m.id), place: st.focus.place, act: 'copy' };
    return say(`I copied ${labels(t.items)}: ${made.length === 1 ? `the copy is ${label(made[0])}` : `the copies are ${joinAnd(made.map((m) => label(m)))}`}.${guessLine(t.guesses)}`, { diff, guesses: t.guesses });
  }

  function send(st, req) {
    const t = target(st, req, { act: 'send' }); if (t.reply) return t.reply;
    const to = toks(req.place).filter((w) => !DET.has(w)).join(' ');
    if (!to) return ask(st, `Send ${labels(t.items)} where?`, { type: 'role', role: 'place', req: { ...req }, guess: `send ${labels(t.items)}` });
    const ok = hooks.send?.(t.items.map((i) => ({ ...i })), to);
    if (typeof ok === 'string') return say(ok, { fallback: 'none' });   // the view says plainly why it cannot take them (spec 23)
    if (ok && typeof ok === 'object' && ok.say) { st.outbox.push({ to, ids: t.items.map((i) => i.id) }); return say(`${ok.say}${guessLine(t.guesses)}`, { guesses: t.guesses, effect: { type: 'send', to } }); }
    if (!ok) return say(`I cannot reach the ${to} from here, so I sent nothing; ${labels(t.items)} ${t.items.length > 1 ? 'stay' : 'stays'} where ${t.items.length > 1 ? 'they are' : 'it is'}.`, { fallback: 'none' });
    st.outbox.push({ to, ids: t.items.map((i) => i.id) });
    return say(`I sent ${labels(t.items)} to the ${to}.${guessLine(t.guesses)}`, { guesses: t.guesses, effect: { type: 'send', to } });
  }

  function save(st, req) {
    const name = toks(req.value).filter((w) => !DET.has(w)).join(' ') || 'saved'; const guesses = req.value ? [] : ['I saved it as "saved"'];
    st.saved[name] = snapshot(st);
    return say(`I saved the ${schema.noun} as "${name}".${guessLine(guesses)}`, { guesses });
  }
  function load(st, req) {
    const name = toks(req.value).filter((w) => !DET.has(w)).join(' ') || 'saved';
    const s = st.saved[name] ?? st.saved[Object.keys(st.saved).find((k) => same(k, name)) ?? ''];
    if (!s) return say(`I have nothing saved as "${name}"${Object.keys(st.saved).length ? `; I have ${joinAnd(Object.keys(st.saved).map((k) => `"${k}"`))}` : ''}.`, { fallback: 'none' });
    const diff = emptyDiff(); diff.changed.push({ id: '*', attr: 'state', from: 'current', to: name });
    restore(st, JSON.parse(JSON.stringify(s)));
    const counts = kinds.map((k) => [k, st.items.filter((i) => i.kind === k.name).length]).filter(([, n]) => n);
    return say(`I loaded "${name}": ${counts.length ? joinAnd(counts.map(([k, n]) => `${n} ${plural(n, k.name, k.plural)}`)) : 'it is empty'}.`, { diff });
  }

  function askAct(st, req) {
    const mode = req.mode ?? 'what';
    if (mode === 'last') { const l = st.lastAct; return say(l ? `${l.reply}` : 'I have not done anything yet.'); }
    if (mode === 'why') return why(st, req);
    if (mode === 'count') {
      let r = req.thing ? resolve(st, req.thing, { allowEmpty: true }) : { ids: [] };
      let pool;
      const kw = toks(req.thing).map((w) => kindByWord(w)).find(Boolean);
      if (r.unknownKind || (!kw && r.none)) return notHere(r.unknownKind ?? r.kindWord, 'ask');
      pool = kw ? st.items.filter((i) => i.kind === kw.kind.name) : st.items;
      if (req.place) { const p = resolve(st, req.place); if (p.ids?.length) pool = pool.filter((i) => p.ids.includes(i.place?.ref)); else return say(`There is no ${req.place} here.`, { fallback: 'none' }); }
      const nm = kw ? (pool.length === 1 ? kw.kind.name : kw.kind.plural) : 'things';
      return say(`There ${pool.length === 1 ? 'is' : 'are'} ${pool.length} ${nm}${req.place ? ` at ${req.place.replace(/^(the|a)\s+/, '')}` : ''}.`);
    }
    if (mode === 'where') {
      const t = target(st, req, { act: 'ask' }); if (t.reply) return t.reply;
      return say(t.items.map((i) => { const c = i.place && st.items.find((x) => x.id === i.place.ref); return c ? `${cap(label(i, true))} is at ${label(c)}.` : `${cap(label(i, true))} is not placed anywhere yet.`; }).join(' ') + guessLine(t.guesses));
    }
    // what: an attribute of a thing, or what is at a place
    if (req.place && !req.thing) {
      const p = resolve(st, req.place);
      if (p.none || p.unknownKind || p.missing) return say(`There is no ${req.place} here.`, { fallback: 'none' });
      if (p.ask) return ask(st, p.ask, { type: 'role', role: 'place', req: { ...req }, guess: 'tell what is there' });
      const at = st.items.filter((i) => p.ids.includes(i.place?.ref));
      const pl = labels(p.ids.map((id) => st.items.find((i) => i.id === id)));
      return say(at.length ? `At ${pl}: ${joinAnd(at.map((i) => label(i)))}.` : `Nothing is at ${pl}.`);
    }
    const t = target(st, req, { act: 'ask' }); if (t.reply) return t.reply;
    const attr = req.attribute ? attrByWord(toks(req.attribute).join(' ')) ?? attrByWord(toks(req.attribute).pop()) : null;
    if (!attr) return say(`${cap(labels(t.items))}: ${joinAnd(Object.entries(t.items[0].attrs).map(([k, v]) => `${k} ${v}`)) || 'nothing special'}.`);
    if (!attr.of.includes(t.items[0].kind)) return say(`${cap(`a ${t.items[0].kind}`)} has no ${attr.name}; ${joinAnd(attr.of.map((k) => `a ${k}`))} ${attr.of.length > 1 ? 'have' : 'has'}.`, { fallback: 'not-here' });
    return say(`${t.items.map((i) => (attr.type === 'number' ? `${cap(label(i, true))} has ${i.attrs[attr.name]} ${attr.name}.` : `The ${attr.name} of ${label(i, true)} is ${attrText(attr, i.attrs[attr.name])}.`)).join(' ')}${guessLine(t.guesses)}`);
  }

  /** The why-answer: from the act log, never invented. */
  function why(st, req) {
    const words = toks(req.rest).filter((w) => !DET.has(w) || PRONOUN.has(w));
    const rest = words.join(' ');
    if (/^(you (do|say|did|said) (that|it|this)|that|it|you)$/.test(rest) || !words.length) {
      const l = st.lastAct; return l ? say(`Because ${l.text ? `you said "${l.text}"` : 'you asked'}: ${strip(l.reply)}.${l.guesses.length ? ` ${cap(joinAnd(l.guesses))}.` : ''}`) : say('I have not done anything yet, so there is nothing to explain.');
    }
    // the thing: the longest run of words that names something
    const isVal = (w) => Object.values(schema.attrs).some((a) => same(w, a.name) || a.words.includes(w) || (valueOf(a, w) !== undefined && a.type !== 'text' && a.type !== 'number'));
    const nouns = words.filter((w) => !isVal(w) || kindByWord(w));
    let ids = null;
    for (let len = nouns.length; len >= 1 && !ids; len--) for (let at = 0; at + len <= nouns.length && !ids; at++) { budget.tick('acts.why'); const r = resolve(st, nouns.slice(at, at + len).join(' ')); if (r.ids?.length && r.source === 'said') ids = r.ids; }
    const left = words.filter((w) => isVal(w) && !kindByWord(w));
    let it = ids ? st.items.find((i) => i.id === ids[0]) : null;
    if (!it && left.length) { const f = focusOf(st).ids.map((id) => st.items.find((i) => i.id === id)).find(Boolean); if (f) it = f; }   // no thing named: the focus ("why is it blue")
    const attrHit = Object.values(schema.attrs).find((a) => left.some((w) => same(w, a.name) || a.words.includes(w) || valueOf(a, w) !== undefined && a.type !== 'text' && a.type !== 'number'));
    if (!it) return say(`I do not know what "${req.rest}" is about. ${st.lastAct ? `The last thing I did: ${strip(st.lastAct.reply)}, because ${st.lastAct.text ? `you said "${st.lastAct.text}"` : 'you asked'}.` : 'I have not done anything yet.'}`);
    if (attrHit && it.attrs[attrHit.name] !== undefined) {
      const w = left.find((x) => valueOf(attrHit, x) !== undefined && !same(x, attrHit.name));
      const cur = it.attrs[attrHit.name];
      if (w !== undefined && String(valueOf(attrHit, w)).toLowerCase() !== String(cur).toLowerCase()) return say(`${cap(label(it))} is not ${w}: its ${attrHit.name} is ${attrText(attrHit, cur)}.`);
      const ch = [...st.log].reverse().find((l) => l.diff?.changed.some((c) => c.id === it.id && c.attr === attrHit.name));
      if (ch) return say(`Because ${ch.text ? `you said "${ch.text}"` : 'you asked me to'}: ${strip(ch.reply)}.`);
      const born = [...st.log].reverse().find((l) => l.diff?.added.includes(it.id));
      return say(`Nothing I did changed that: ${label(it)} has ${attrHit.name} ${attrText(attrHit, cur)} because that is the default of a ${it.kind}${born ? ` and I added it${born.text ? ` when you said "${born.text}"` : ''}` : ''}.`);
    }
    const hit = [...st.log].reverse().find((l) => l.diff && (l.diff.added.includes(it.id) || l.diff.changed.some((c) => c.id === it.id) || l.diff.moved?.some((m) => m.id === it.id) || l.diff.linked?.some((p) => p.includes(it.id))));
    if (hit) return say(`Because ${hit.text ? `you said "${hit.text}"` : 'you asked me to'}: ${strip(hit.reply)}.`);
    return say(`I have no record of why; ${label(it, true)} is just there.`);
  }

  const strip = (r) => String(r).replace(/\s*\(.*$/, '').replace(/\.$/, '');
  const past = (r) => { const b = strip(r); return /^I \w+/.test(b) ? b.replace(/^I /, 'I had ') : b[0].toLowerCase() + b.slice(1); };
  function doUndo(st) {
    const h = st.history.pop();
    if (!h) return say('There is nothing to undo.');
    st.future.push({ snap: snapshot(st), reply: h.reply, act: h.act, logLen: h.logLen });
    restore(st, h.snap); st.log.length = Math.min(st.log.length, h.logLen); st.lastAct = st.log[st.log.length - 1] ?? null;
    return say(`I undid that: ${past(h.reply)}.`, { diff: emptyDiff(), undone: h.act });
  }
  function doRedo(st) {
    const f = st.future.pop();
    if (!f) return say('There is nothing to redo.');
    st.history.push({ snap: snapshot(st), logLen: st.log.length, reply: f.reply, act: f.act });
    restore(st, f.snap);
    return say(`I did it again: ${strip(f.reply)}.`, { redone: f.act });
  }

  /** The last resort of a world when no form read the sentence (the engine's hook `outOfScope`): the guessed act and thing, one question; never a bare "not understood". */
  function lastResort(state, text) {
    const st = { items: [], ...state }; const t = toks(text);   // read only: a guess never initialises the state
    const verb = t.find((w) => Object.entries(ACT_VERBS).some(([a, vs]) => vs.includes(w) || same(w, vs.find((x) => !x.includes('_') && x.length > 3) ?? '')));
    const act = verb ? Object.entries(ACT_VERBS).find(([a, vs]) => vs.includes(verb))?.[0] : null;
    const kw = t.map((w) => kindByWord(w)).find(Boolean);
    const thing = kw ? (st.items.find((i) => i.kind === kw.kind.name) ? label(st.items.find((i) => i.kind === kw.kind.name)) : kw.kind.name) : null;
    const actOk = act && schema.acts.has(act === 'set' ? 'change' : act === 'apart' ? 'group' : act) ? (act === 'set' ? 'change' : act === 'apart' ? 'group' : act) : null;
    const verbs = joinAnd([...schema.acts].filter((a) => ACTS[a].verb && !['undo', 'redo'].includes(a)).map((a) => ACTS[a].verb).slice(0, 6));
    const q = actOk && thing ? `Do you want me to ${ACTS[actOk].verb} ${thing}? Say it with a name or a number, for example "${examples(schema).find((e) => new RegExp(`^${cap(ACTS[actOk].verb)}`).test(e)) ?? examples(schema)[0]}".`
      : thing ? `I did not catch what to do with ${thing}. I can ${verbs}; for example "${examples(schema)[0]}".`
      : actOk ? `I did not catch what to ${ACTS[actOk].verb}. ${kindsLine()} For example "${examples(schema).find((e) => new RegExp(`^${cap(ACTS[actOk].verb)}`).test(e)) ?? examples(schema)[0]}".`
      : `I did not catch that. ${kindsLine()} I can ${verbs}; for example "${examples(schema)[0]}".`;
    return { say: q, suggest: examples(schema).slice(0, 3), guess: { act: actOk, thing } };
  }

  // ---- the engine's door ----
  /** The engine's door; a view's hooks (spec 23) see the request before (`before`: may rewrite the roles, knows the ctx) and the result after (`after`: publishes the things). */
  function operation(ctx, act, args = {}) {
    const req0 = { ...args };
    hooks.before?.(ctx, act, req0);
    // ONE UNDO STEP PER ACT GROUP: an act group ("put on a hat and make it red" asked as one request) is several acts; the world's history (`hooks.history(state)`, else `state.history`) keeps the snapshot taken before the FIRST of them, so one "undo" takes the message back (spec 21 section 9)
    const hist = () => { const h = hooks.history ? hooks.history(ctx.state) : ctx.state.history; return Array.isArray(h) ? h : null; };
    // (only an explicit act group, `actGroup`, is one step: the requests of a message are one step each, spec 15 "one step per request", and "undo the whole message" takes them all)
    const turn = /^grp\d+_/.test(String(args.request?.id ?? '')) ? String(args.request.id).split('_')[0] : null;
    const g = ctx.state.stepGroup, H0 = hist();
    const base = g && turn && g.turn === turn && H0 && g.base <= H0.length ? g.base : (H0?.length ?? 0);
    if (turn) ctx.state.stepGroup = { turn, base };
    const done = () => { const H = hist(); if (turn && H && H.length > base + 1 && !['undo', 'redo'].includes(act)) { H.splice(base + 1); hooks.afterGroup?.(ctx.state); } };
    let r = operationParts(ctx, act, req0);
    done();
    return hooks.after?.(ctx, act, req0, r) ?? r;
  }
  /**
   * AN ACT GROUP: several acts that one sentence asked for ("put on a hat and make it red") are ONE undo step and one reply, whoever calls them, and ALL OR NOTHING: the library's
   * `act([...])` (sopworld std.schema.effect, `effects.mjs`) runs them and, when one is not done, undoes the earlier ones (a snapshot of the state), so a refused sentence changes nothing.
   * The English reply stays the host's (specs/21 section 10); the failure says which step was not done and why.
   */
  let effects = null;
  const fx = () => (effects ??= createEffects(schema.id, hooks));
  let groupSeq = 0;
  function actGroup(ctx, steps) {
    const turn = `grp${++groupSeq}`;
    const done = (r) => r.status === 'supported' && !r.fallback;
    const s = fx().sentence(ctx, steps.map((x) => x.act), steps.map((x, i) => () => { budget.tick('acts.group'); return operation(ctx, x.act, { ...x.args, request: { id: `${turn}_w${i + 1}` } }); }), done);
    const results = s.results, notes = results.map((r) => String(r.note ?? '').replace(/\.$/, ''));
    if (!s.ok) { const r = results[s.failed], say = `${notes[s.failed]}. I changed nothing.`; return { status: r.status === 'supported' ? 'missing' : r.status, note: say, value: say, results, failed: s.failed }; }   // the earlier steps were undone: say so, not what they would have done
    const note = `${notes.join('. ')}.`;
    return { status: 'supported', note, value: note, results, diff: s.diff };
  }
  /** SEVERAL THINGS IN ONE ACT ("draw a sun, a cloud and a man", "remove the tree and the house"): the whole phrase is tried first (the world may read a coordination itself); when that is not a supported reply and the thing role is a coordination of noun phrases, each one is run as its own act with the other roles, as one step, and the replies are joined. */
  function operationParts(ctx, act, req0) {
    const r = operation0(ctx, act, req0);
    if (r.status === 'supported' && !r.fallback && !/^(?:I (?:could not|can not|do not|don't)|What |Which |There is no|I can draw)/.test(String(r.note ?? ''))) return r;
    const parts = splitThings(req0.thing);
    if (parts.length < 2 || !['make', 'remove', 'change', 'pick', 'copy', 'group', 'place'].includes(act)) return r;
    const heads = parts.map((part) => ({ ...req0, thing: part.head, ...(part.tail && act === 'make' ? { thing: `${part.head} ${part.tail}` } : {}) }));
    const s = fx().sentence(ctx, heads.map(() => act), heads.map((h) => () => { budget.tick('acts.parts'); return operation0(ctx, act, h); }), (one) => one.status === 'supported' && !one.fallback);
    if (!s.ok) return r;   // all or nothing: the library undid the parts that were done
    const notes = s.results.map((one) => String(one.note ?? '').replace(/\s*\(.*\)\.?$/, '').replace(/\.$/, '')), last = s.results.at(-1);
    const note = `${joinAnd(notes.map((n, i) => (i ? n.replace(/^I (?:drew|added|made|put|moved|removed|changed|took)\b\s*/i, '') : n)))}.`;
    return { ...last, note, value: note };
  }
  function operation0(ctx, act, args = {}) {
    const st = ctx.state;
    live.dlg = ctx.dialogueFocus ?? null;
    if (st.inputMode === 'confirm') { st.pending = null; st.inputMode = null; }   // a new request cancels an open question
    const req = { act, ...args };
    if (args.amount != null) req.amount = args.amount;
    req.text ??= ctx.segment?.text ?? ctx.text ?? null;
    const dom = hooks.domain?.[act];   // the world's own effect for this act (host code over its own state): a result of { status, value | note }, or undefined to use the generic executor
    if (dom) {
      // a mutating act is a library effect (all or nothing inside a sentence, with the difference); a question or history act (ask, pick, undo, redo, save ...) is called as it is
      const lib = EFFECT_ACTS.includes(act) ? fx().sentence(ctx, [act], [() => dom(ctx, req) ?? { declined: true }], (o) => o.declined || o.status === 'supported') : null;
      const r = lib ? (lib.results[0]?.declined ? undefined : lib.results[0]) : dom(ctx, req);
      if (r) {
        if (!hooks.noState) init(st);   // `noState`: the world keeps its own state shape (the map's `focus` is a place, not the executor's selection) and no act log
        if (r.status === 'supported' && !hooks.noState) { st.log.push({ act, mode: req.mode ?? null, text: req.text, roles: roleView(req), diff: null, reply: String(r.value ?? r.note ?? ''), guesses: [] }); if (st.log.length > 50) st.log.shift(); st.lastAct = st.log[st.log.length - 1]; }
        return r.status === 'supported' ? { status: 'supported', note: r.value ?? r.note, value: r.value ?? r.note, ...(r.effect ? { effect: r.effect } : {}), ...(lib?.diff ? { diff: lib.diff } : {}) } : { status: r.status, note: r.note ?? r.value, value: r.note ?? r.value };
      }
    }
    if (hooks.noState) return { status: 'missing', note: `I cannot do that on the ${schema.noun}.`, value: `I cannot do that on the ${schema.noun}.` };   // a world with its own state answers every act through its domain hooks
    const res = run(st, req);
    return { status: 'supported', note: res.note, value: res.note, ...(res.effect ? { effect: res.effect } : {}), fallback: res.fallback, diff: res.diff };
  }
  const VERBS = new Set(Object.values(ACT_VERBS).flat().filter((v) => !v.includes('_')).concat(['undo', 'redo', 'why', 'what', 'how', 'where', 'who', 'which', 'select', 'delete']));
  const looksLikeCommand = (t) => { const w = toks(t).filter((x) => !['please', 'can', 'you', 'could'].includes(x)); return w.length > 0 && VERBS.has(w[0]) && !kindByWord(w[0]); };
  /** The one question the executor asked: a role (the answer is the role) or a guessed act (yes / no). */
  function interceptInput(ctx, text) {
    const own = hooks.intercept?.(ctx, text);   // a world with its own modal input (the editor's dictation) reads the message first
    if (own?.handled) return own;
    const st = ctx.state;
    if (st.inputMode !== 'confirm' || !st.pending) return { handled: false };
    const p = st.pending; st.pending = null; st.inputMode = null;
    const t = String(text ?? '').trim();
    const yn = ctx.lang?.yesNo?.(t) ?? (/^(no|nope|cancel|stop)$/i.test(t) ? 'no' : /^(yes|yeah|ok|okay|sure)$/i.test(t) ? 'yes' : null);
    if (yn === 'no') return { handled: true, reply: `OK, I did nothing: no ${p.guess}.` };
    if (!p.req) return { handled: false };
    const req = { ...p.req };
    if (p.type === 'confirm' && yn !== 'yes') return { handled: false };   // only yes / no answer a guessed act
    if (yn !== 'yes' && looksLikeCommand(t)) return { handled: false };   // a new request cancels the question and is read normally
    if (yn === 'yes') { /* "yes" confirms the guess: run as asked */ }
    else if (p.role === 'thing' && p.candidates) { const hit = p.candidates.map((id) => st.items.find((i) => i.id === id)).filter(Boolean).find((i) => toks(t).some((w) => w === String(i.n) || (i.name && w === i.name.toLowerCase()) || ORD[w] === p.candidates.indexOf(i.id) + 1)); if (!hit) return { handled: false }; req.thing = label(hit); }
    else if (p.role === 'attribute') { const a = attrByWord(toks(t).pop() ?? ''); if (!a) { const v = Object.values(schema.attrs).find((x) => valueOf(x, t) !== undefined); if (v) { req.attribute = v.name; req.value = t; } else return { handled: false }; } else req.attribute = a.name; }
    else if (p.role === 'value' || p.role === 'place' || p.role === 'thing') { if (t.split(/\s+/).length > 4 || /[?]/.test(t)) return { handled: false }; req[p.role] = t; }
    const res = run(init(st), req);
    return { handled: true, reply: res.note };
  }
  /** What the engine's hook outOfScope gets: the world's own reader first (hooks.unread(ctx, text) -> a reply string), else the graded last resort. */
  function outOfScope(ctx, text) {
    const u = hooks.unread?.(ctx, text);
    if (typeof u === 'string' && u) return { say: u };
    const r = lastResort(ctx.state, text);
    return r.guess?.thing ? r : undefined;   // no clue of an act or a thing of this world: the engine's own "I did not understand" (it quotes the words and offers examples)
  }
  /** DECLINE: the formalizer asks before routing whether this world owns a reading ({ action, mode, roles, text, state }); hooks.accepts says no when the words are not of this world. */
  // FULL SUPPORT (spec 20, arbitration rule 2): a role phrase that coordinates things ("everything and fork the plimp") is supported only when EVERY conjunct is, so a world never claims a sentence whose
  // second half is words it does not know; the sentence then goes unread and the leniency stage reads the clauses one by one ("I understood the first, not the second").
  const accepts = (info) => {
    if (!hooks.accepts) return true;
    const ask = (i) => hooks.accepts({ ...i, kindWord: (w) => !!kindByWord(String(w ?? '').toLowerCase()) });
    // a bare form ("{pre} {thing}") is the catch-all for modifiers ("big red house"); a pre that starts with a value verb and goes on "to" ("change vatar to a" man) is that act's sentence, which did not read: not the bare form's
    const first = String(info.roles?.pre ?? '').toLowerCase().split(/\s+/)[0];
    if (info.mode === 'bare' && first && ACT_VERBS.set.includes(first) && !ACT_VERBS.make.includes(first) && /\bto\b/i.test(info.roles.pre)) return false;   // (the verbs of the act that takes a value: change, modify, replace ...)
    const v = ask(info);
    const said = String(info.roles?.thing ?? '');
    if (v === false || !/\band\b|,/i.test(said) || !['remove', 'change', 'place', 'copy', 'group', 'pick'].includes(String(info.action ?? '').split('.').pop())) return v === 'focus' || v === 'refuse' ? v : v !== false;   // 'focus' (the world holds the focus of the dialogue: the open tab owns its acts first) reaches the formalizer, which then does not make the reading yield
    // a conjunct that opens with a word that continues the noun phrase before it ("Romania and its neighbours": the joiner `keep` facts of the language) is part of that phrase, not a thing of its own
    const keeps = en.joinerKeeps(), parts = [];
    for (const c of said.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean)) { if (parts.length && keeps.has(c.toLowerCase().split(/\s+/)[0])) parts[parts.length - 1] += ` and ${c}`; else parts.push(c); }
    return parts.length < 2 || parts.every((c) => ask({ ...info, roles: { ...info.roles, thing: c }, text: c }) !== false) ? v : false;
  };   // kindWord: a word the schema says is one of its kinds (its lexicon, the catalog vocabulary included)
  /** What a person can point at (the discourse hook `referents`, M1): the items, the focused ones salient. */
  function referents(ctx) {
    if (hooks.referents) return hooks.referents(ctx);   // a world whose things are not `state.items` (the drawing board) names its own
    const st = ctx.state;   // a reading never changes the state: no init here
    if (schema.things?.length) return [...stateItems(st), ...schema.things.flatMap((d) => thingsAt(st, d))];
    return stateItems(st);
  }
  /** The things at one `thing=` declaration of the schema: an array (or one object) of the state; the kind is the entry's own `kind` when the schema has it; the attributes are the schema's, taken from the entry. */
  function thingsAt(st, d) {
    const at = d.path.split('.').reduce((o, k) => (o == null ? o : o[k]), st);
    const list = Array.isArray(at) ? at : at && typeof at === 'object' ? [at] : [];
    const out = [];
    const only = d.active ? st[d.active] : null;   // a world that works on one of its things at a time (the open chart): only that one is pointed at
    const single = list.length === 1;
    for (const [i, e] of list.entries()) {
      budget.tick('acts.things');
      if (!e || typeof e !== 'object') continue;
      if (d.active && String(e[d.id ?? 'id']) !== String(only)) continue;
      const kind = schema.kinds[e.kind] ? e.kind : d.kind;
      const name = schema.kinds[kind]?.named ? (d.name ? e[d.name] : e.name ?? e.title) : null;   // a numbered kind is pointed at by its number
      const id = String(e[d.id ?? 'id'] ?? name ?? kind);
      const attrs = {};
      for (const a of Object.values(schema.attrs)) if (a.of.includes(kind) && ['string', 'number', 'boolean'].includes(typeof e[a.name])) attrs[a.name] = e[a.name];
      out.push({ id, kind, noun: kind, n: i + 1, words: [kind, schema.kinds[kind]?.plural].filter(Boolean), name: name ? String(name) : undefined, ...(d.diceOnly ? { pointer: false } : {}), ...(single && !schema.kinds[kind]?.numbered ? { say: `the ${kind}` } : {}), attrs, salient: false, sig: JSON.stringify(e) });
    }
    if (d.active && out.length === 1) out[0].say = `the ${out[0].kind}`;   // the one thing the world works on is "the chart", not a number
    return out;
  }
  function stateItems(st) {
    const sal = new Set(st.focus?.ids ?? []);
    return (st.items ?? []).map((i) => ({ id: i.id, kind: i.kind, noun: schema.kinds[i.kind]?.name ?? i.kind, words: [i.kind, schema.kinds[i.kind]?.plural].filter(Boolean), attrs: {}, salient: sal.has(i.id), sig: JSON.stringify([i.kind, i.n, i.name, i.attrs, i.place]) }));
  }
  /** Does the world take a coordination in the thing of this reading as ONE act ("show Paris and Rome", "pin Paris, Rome and Madrid")? Then the formalizer keeps the whole reading and does not distribute the act clause by clause. */
  const coordinates = (info) => !!hooks.coordinates?.(info);
  /** The knowledge lists the world names things from, for the dice (spec 25): { list: [text | { text, act }] }, from the world's own knowledge (its hook `sampleKnowledge`). Read-only. */
  const sampleKnowledge = (ctx) => { try { return hooks.sampleKnowledge?.(ctx) ?? {}; } catch { return {}; } };
  return { run, operation, group: actGroup, sampleKnowledge, interceptInput, lastResort, outOfScope, accepts, coordinates, init, resolve, labels, schema, referents };
}
