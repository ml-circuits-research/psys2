// SPDX-License-Identifier: AGPL-3.0-only
// The shared module `acts` (specs/21-acts-and-schemas.md): about twelve universal acts with six roles, the schema of a doing world, the generic executor
// (apply an act to a schema-described state, undo, the difference, the reply, the why-answer) and the graded fallback. Browser-safe, NO imports: SOP Lang
// wires come from the caller (`parseSchema(wires)`), knowledge and the other worlds come in as hooks.
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

import { ACT_VERBS } from './verbs.generated.mjs';

export { ACT_VERBS };
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

// ---- the acts and their roles ---------------------------------------------------------------------------------------------------------------------------
export const ROLES = ['thing', 'set', 'attribute', 'value', 'place', 'amount'];
/** act -> { roles needed (R), optional (O), mutates, verb used in replies and refusals }. */
export const ACTS = {
  make: { R: ['thing'], O: ['value', 'place', 'amount'], mutates: true, verb: 'add' },
  remove: { R: ['thing'], O: ['place'], mutates: true, verb: 'remove' },
  change: { R: ['thing'], O: ['attribute', 'value', 'amount'], mutates: true, verb: 'change', modes: ['set', 'more', 'less', 'next', 'prev', 'other', 'be'] },
  place: { R: ['thing', 'place'], O: [], mutates: true, verb: 'move' },
  connect: { R: ['thing', 'place'], O: [], mutates: true, verb: 'connect' },
  group: { R: ['thing'], O: [], mutates: true, verb: 'group', modes: ['group', 'apart'] },
  pick: { R: ['thing'], O: [], mutates: false, verb: 'select' },
  ask: { R: [], O: ['thing', 'attribute', 'place'], mutates: false, verb: 'tell', modes: ['what', 'count', 'where', 'why', 'last', 'has', 'options', 'describe', 'state'] },
  copy: { R: ['thing'], O: [], mutates: true, verb: 'copy' },
  send: { R: ['thing', 'place'], O: [], mutates: false, verb: 'send' },
  undo: { R: [], O: [], mutates: false, verb: 'undo' },
  redo: { R: [], O: [], mutates: false, verb: 'redo' },
  save: { R: [], O: ['value'], mutates: false, verb: 'save' },
  load: { R: [], O: ['value'], mutates: true, verb: 'load' },
};

// ---- small text helpers --------------------------------------------------------------------------------------------------------------------------------
const DET = new Set(['a', 'an', 'the', 'another', 'my', 'this', 'that', 'these', 'those', 'one', 'some', 'our', 'your']);
const PRONOUN = new Set(['it', 'them', 'that', 'those', 'these', 'this', 'him', 'her', 'they', 'there']);
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
export const COLOURS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gray', 'gold', 'silver'];
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
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

// ---- the schema ------------------------------------------------------------------------------------------------------------------------------------------
const vals = (w, k) => w.entries.filter((e) => e.key === k).map((e) => e.value.v);
const val = (w, k) => w.entries.find((e) => e.key === k)?.value.v;
const yes = (v) => v === 'yes' || v === 'true';
/** schema.sop wires (`acts.schema`, `acts.kind`, `acts.attr`) -> a schema object. Throws on a wrong schema (the generator and the test report it). */
export function parseSchema(wires) {
  const sw = wires.find((w) => w.type === 'acts.schema');
  if (!sw) throw new Error('schema.sop has no acts.schema wire');
  const flags = Object.fromEntries(['self', 'dir', 'be', 'has', 'bare', 'name', 'layout'].filter((f) => yes(val(sw, f))).map((f) => [f, true]));
  const schema = { id: sw.id, noun: val(sw, 'noun') ?? sw.id, acts: new Set(vals(sw, 'acts')), limits: { items: 100, history: 30, ...Object.fromEntries(sw.entries.filter((e) => e.key.startsWith('limit.')).map((e) => [e.key.slice(6), Number(e.value.v)])) }, kinds: {}, attrs: {}, doc: val(sw, 'doc') ?? '', tabOnly: val(sw, 'tabOnly') === 'yes' };
  for (const a of schema.acts) if (!Object.hasOwn(ACTS, a)) throw new Error(`unknown act '${a}' in ${sw.id}`);
  if (Object.keys(flags).length) schema.flags = flags;   // self: the world is a character ("yourself"); dir: direction words for place; be: "be / look X"; has: "do you have X"; bare: a bare thing is a request
  if (val(sw, 'sample')) schema.sample = val(sw, 'sample');
  if (val(sw, 'hooks')) schema.hooks = val(sw, 'hooks');   // a sibling module with the world's hooks (knowledge, domain effects, projection): host code the schema cannot say
  if (vals(sw, 'own').length) schema.own = vals(sw, 'own');   // "<export>:<action>": operations of the world that are not acts (a name, a moment of the stage), exported by own.mjs
  for (const w of wires.filter((x) => x.type === 'acts.kind')) {
    const name = w.id.slice(sw.id.length + 1);
    schema.kinds[name] = { name, plural: val(w, 'plural') ?? `${name}s`, numbered: yes(val(w, 'numbered')), named: yes(val(w, 'named')), max: val(w, 'max') ? Number(val(w, 'max')) : null, in: val(w, 'in') ?? null, capacity: val(w, 'capacity') ?? null, acts: vals(w, 'acts'), any: val(w, 'any') === 'knowledge', words: vals(w, 'word') };
  }
  for (const w of wires.filter((x) => x.type === 'acts.attr')) {
    const name = w.id.slice(sw.id.length + 1);
    const a = { name, of: vals(w, 'of'), type: val(w, 'type') ?? 'text', values: vals(w, 'values'), min: val(w, 'min') != null ? Number(val(w, 'min')) : null, max: val(w, 'max') != null ? Number(val(w, 'max')) : null, def: val(w, 'default'), more: vals(w, 'more'), less: vals(w, 'less'), words: vals(w, 'word'), step: val(w, 'step') ? Number(val(w, 'step')) : 1 };
    if (!['number', 'enum', 'colour', 'text', 'bool'].includes(a.type)) throw new Error(`attribute ${name}: unknown type '${a.type}'`);
    if (a.type === 'enum' && !a.values.length) throw new Error(`attribute ${name}: an enum needs values`);
    for (const k of a.of) if (!schema.kinds[k]) throw new Error(`attribute ${name}: unknown kind '${k}'`);
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
export const FORMS = [
  { id: 'make', act: 'make', match: 'L V.make D {thing:words}', args: ['thing'], priority: 10, example: 'Add a table.' },
  { id: 'make.place', act: 'make', match: 'L V.make D {thing:words} REL D {place:words}', args: ['thing', 'rel', 'place'], priority: 12, if: 'in', example: 'Add a guest at table 1.' },
  { id: 'make.n', act: 'make', match: 'L V.make {amount:number} {thing:words}', args: ['amount', 'thing'], priority: 12, example: 'Add 3 tables.' },
  { id: 'make.name', act: 'make', match: 'L V.make D {thing:words} [called|named] {value:words}', args: ['thing', 'value'], priority: 13, if: 'named', example: 'Add a guest called Ann.' },
  { id: 'make.name.place', act: 'make', match: 'L V.make D {thing:words} [called|named] {value:words} REL D {place:words}', args: ['thing', 'value', 'rel', 'place'], priority: 14, if: 'in', example: 'Add a guest called Ann at table 1.' },
  { id: 'remove', act: 'remove', match: 'L V.remove D {thing:words}', args: ['thing'], priority: 10, example: 'Remove the guest Ann.' },
  { id: 'remove.out', act: 'remove', match: 'L [kick|throw|take|send|get|put] D {thing:words} [out|away|off_the_list]', args: ['thing'], priority: 11, example: 'Kick the guest Ann out.' },
  { id: 'remove.place', act: 'remove', match: 'L V.remove D {thing:words} [from|out_of|off] D {place:words}', args: ['thing', 'place'], priority: 12, if: 'in', example: 'Remove the guests from table 1.' },
  { id: 'change.of', act: 'change', mode: 'set', match: 'L V.set D {attribute:ATTR} of D {thing:words} [to|be|as|into]? D {value:words}', args: ['attribute', 'thing', 'value'], priority: 14, if: 'attrs', example: 'Change the colour of table 2 to red.' },
  { id: 'change.attr', act: 'change', mode: 'set', match: 'L V.set D {thing:words} {attribute:ATTR} [to|be|as|into] D {value:words}', args: ['thing', 'attribute', 'value'], priority: 13, if: 'attrs', example: 'Set table 2 seats to 6.' },
  { id: 'change.value', act: 'change', mode: 'set', match: 'L V.set D {thing:words} [to|be|as|into]? {value:VALUE}', args: ['thing', 'value'], priority: 12, if: 'values', example: 'Make table 2 blue.' },
  { id: 'change.add', act: 'change', mode: 'more', match: 'L V.make {amount:number} {attribute:ATTR} to D {thing:words}', args: ['amount', 'attribute', 'thing'], priority: 14, if: 'number', example: 'Add 2 seats to table 1.' },
  { id: 'change.add1', act: 'change', mode: 'more', match: 'L V.make {attribute:ATTR} to D {thing:words}', args: ['attribute', 'thing'], priority: 13, if: 'number', example: 'Add a seat to table 1.' },
  { id: 'change.less', act: 'change', mode: 'less', match: 'L V.remove {amount:number} {attribute:ATTR} from D {thing:words}', args: ['amount', 'attribute', 'thing'], priority: 14, if: 'number', example: 'Remove 2 seats from table 1.' },
  { id: 'change.less1', act: 'change', mode: 'less', match: 'L V.remove D {attribute:ATTR} from D {thing:words}', args: ['attribute', 'thing'], priority: 13, if: 'number', example: 'Remove a seat from table 1.' },
  { id: 'change.cmp.more', act: 'change', mode: 'more', match: 'L V.set D {thing:words} {value:MORE}', args: ['thing', 'value'], priority: 12, if: 'more', example: 'Make table 1 bigger.' },
  { id: 'change.cmp.less', act: 'change', mode: 'less', match: 'L V.set D {thing:words} {value:LESS}', args: ['thing', 'value'], priority: 12, if: 'less', example: 'Make table 1 smaller.' },
  { id: 'place', act: 'place', match: 'L V.place D {thing:words} REL D {place:words}', args: ['thing', 'rel', 'place'], priority: 11, if: 'in', example: 'Put the guest Ann at table 2.' },
  { id: 'connect', act: 'connect', match: 'L V.connect D {thing:words} [to|with|and] D {place:words}', args: ['thing', 'place'], priority: 11, example: 'Connect table 1 to table 2.' },
  { id: 'group', act: 'group', mode: 'group', match: 'L V.group D {thing:words} [together]?', args: ['thing'], priority: 10, example: 'Group the tables.' },
  { id: 'apart', act: 'group', mode: 'apart', match: 'L V.apart D {thing:words}', args: ['thing'], priority: 10, example: 'Take the tables apart.' },
  { id: 'apart.2', act: 'group', mode: 'apart', match: 'L [take|break|pull|split] D {thing:words} [apart|up]', args: ['thing'], priority: 11, example: 'Take the tables apart.' },
  { id: 'place.bare', act: 'place', match: 'L V.place D {thing:words}', args: ['thing'], priority: 5, if: 'in', example: 'Move the guest.' },
  { id: 'change.bare', act: 'change', mode: 'set', match: 'L [change|colour|color|paint|turn|switch|edit] D {thing:words}', args: ['thing'], priority: 5, if: 'attrs', example: 'Change table 2.' },
  { id: 'connect.bare', act: 'connect', match: 'L V.connect D {thing:words}', args: ['thing'], priority: 5, example: 'Connect table 1.' },
  { id: 'send.bare', act: 'send', match: 'L V.send D {thing:words}', args: ['thing'], priority: 5, example: 'Send table 1.' },
  { id: 'pick', act: 'pick', match: 'L V.pick D {thing:words}', args: ['thing'], priority: 10, example: 'Select table 2.' },
  { id: 'copy', act: 'copy', match: 'L V.copy D {thing:words}', args: ['thing'], priority: 10, example: 'Copy table 2.' },
  { id: 'send', act: 'send', match: 'L V.send D {thing:words} to D {place:words}', args: ['thing', 'place'], priority: 11, example: 'Send table 2 to the diagram.' },
  { id: 'ask.what', act: 'ask', mode: 'what', match: '[what|which] [is|are] D {attribute:ATTR} of D {thing:words}', args: ['attribute', 'thing'], priority: 12, if: 'attrs', example: 'What is the colour of table 2?' },
  { id: 'ask.what.is', act: 'ask', mode: 'what', match: '[what|which] {attribute:ATTR} [is|are] D {thing:words}', args: ['attribute', 'thing'], priority: 12, if: 'attrs', example: 'What colour is table 2?' },
  { id: 'change.should', act: 'change', mode: 'set', match: 'D {thing:words} [should|must|has_to|needs_to] [be|become|turn] {value:VALUE}', args: ['thing', 'value'], priority: 12, if: 'values', example: 'Table 2 should be blue.' },
  { id: 'change.needs', act: 'change', mode: 'set', match: 'L [i_want|i_need|make|let|give]? D {thing:words} [needs|to_have|should_have|must_have|has|gets] {value:number} {attribute:ATTR}', args: ['thing', 'value', 'attribute'], priority: 12, if: 'number', example: 'Table 1 needs 6 seats.' },
  { id: 'ask.at', act: 'ask', mode: 'what', match: '[what|who] [is|are|sits|sit|stands|stand] [there]? REL D {place:words}', args: ['rel', 'place'], priority: 12, if: 'in', example: 'Who is at table 1?' },
  { id: 'ask.count.attr', act: 'ask', mode: 'what', match: 'how_many {attribute:ATTR} [does|do|has|have] D {thing:words} [have|has|got]?', args: ['attribute', 'thing'], priority: 14, if: 'number', example: 'How many seats does table 1 have?' },
  { id: 'ask.count', act: 'ask', mode: 'count', match: 'how_many {thing:words} [are|do_i_have|have_i_got|is]? [there]?', args: ['thing'], priority: 12, example: 'How many tables are there?' },
  { id: 'ask.count.at', act: 'ask', mode: 'count', match: 'how_many {thing:words} [are|is]? [there]? REL D {place:words}', args: ['thing', 'rel', 'place'], priority: 13, if: 'in', example: 'How many guests are at table 1?' },
  { id: 'ask.where', act: 'ask', mode: 'where', match: 'where [is|are] D {thing:words}', args: ['thing'], priority: 12, if: 'in', example: 'Where is Ann?' },
  { id: 'ask.why', act: 'ask', mode: 'why', match: 'why [is|are|did|do|was|were|does] {rest:words}', args: ['rest'], priority: 11, example: 'Why is table 2 blue?' },
  { id: 'ask.last', act: 'ask', mode: 'last', match: 'what [did|have] you [just]? [do|done|change|changed]', args: [], priority: 11, example: 'What did you just do?' },
  { id: 'undo', act: 'undo', match: '[undo|undo_that|undo_it|undo_the_last_thing|undo_the_last_change|take_that_back|go_back|step_back|revert_that]', args: [], priority: 11, example: 'Undo that.' },
  { id: 'redo', act: 'redo', match: '[redo|redo_that|redo_it|do_that_again|do_it_again]', args: [], priority: 11, example: 'Redo that.' },
  { id: 'save', act: 'save', match: 'L V.save [it|this|everything]? [as|under|called]? {value:words}', args: ['value'], priority: 10, example: 'Save it as lunch.' },
  { id: 'load', act: 'load', match: 'L V.load D {value:words}', args: ['value'], priority: 10, example: 'Load lunch.' },
  // forms of a character-like world (flag `self`) and the open-valued ones (be / has / dir / bare): written once, used by every world that sets the flag
  { id: 'make.self', act: 'make', match: 'L V.make [me|yourself|myself] D {thing:words}', args: ['thing'], priority: 11, if: 'self', example: 'Give yourself a beard.' },
  { id: 'make.put', act: 'make', match: 'L [put|place|stick|draw|give] [him|her|it|the_avatar|me|yourself|myself]? D {thing:words}', args: ['thing'], priority: 9, if: 'self', example: 'Give him a beard.' },
  { id: 'make.on', act: 'make', match: 'L [put|place|add|stick|draw] D {thing:words} [on_yourself|on_your_face|on_your_head|to_yourself|to_your_face|on_you|on_ur_face]', args: ['thing'], priority: 12, if: 'self', example: 'Add glasses to your face.' },
  { id: 'remove.off', act: 'remove', match: 'L [take|put|get|pull] D {thing:words} [off|away|off_yourself|off_your_face|off_your_head]', args: ['thing'], priority: 12, if: 'self', example: 'Take the glasses off.' },
  { id: 'remove.without', act: 'remove', match: 'L [make|be|look|draw|show_me]? [yourself|me|it|the_face]? [without|with_no] D {thing:words}', args: ['thing'], priority: 11, if: 'self', example: 'Without a hat.' },
  { id: 'change.another', act: 'change', mode: 'other', match: 'L [try|show|give_me|let_me_see|i_want|have|use|put_on|wear]? [another|a_different|a_new|another_one] {thing:words}', args: ['thing'], priority: 12, if: 'self', example: 'Try a different hat.' },
  { id: 'change.next', act: 'change', mode: 'next', match: 'L [try|show|give_me|let_me_see|use|go_to|switch_to|change_to]? D [next|following|one_more] {thing:words}', args: ['thing'], priority: 12, if: 'self', example: 'Try the next hat.' },
  { id: 'change.prev', act: 'change', mode: 'prev', match: 'L [try|show|give_me|let_me_see|use|go_to|switch_to|change_to|go_back_to]? D [previous|prior|one_before] {thing:words}', args: ['thing'], priority: 12, if: 'self', example: 'Previous nose.' },
  { id: 'change.swap', act: 'change', mode: 'set', match: 'L [swap|change|switch|replace|exchange] D {thing:words} [for|with|to|into|by] D {value:words}', args: ['thing', 'value'], priority: 11, if: 'be', example: 'Change the hat to a crown.' },
  { id: 'change.self', act: 'change', mode: 'set', match: 'L [make|turn|change|paint] [yourself|urself|the_avatar|the_face|your_face|ur_face] {value:words}', args: ['value'], priority: 12, if: 'self', example: 'Paint yourself green.' },
  { id: 'change.be', act: 'change', mode: 'be', match: 'L [be|become|look|feel|turn_into|change_into|transform_into|morph_into|look_like|act_like] D {value:words}', args: ['value'], priority: 10, if: 'be', example: 'Look happy.' },
  { id: 'change.be.self', act: 'change', mode: 'be', match: 'L [make|let|get] [yourself|urself|myself|me] {value:words}', args: ['value'], priority: 11, if: 'be', example: 'Make yourself happy.' },
  { id: 'place.dir', act: 'place', match: 'L [move|put|bring|push|pull|take|shift|raise|lower|make] D {thing:words} {rel:lex.acts.dir}', args: ['thing', 'rel'], priority: 13, if: 'dir', example: 'Move the eyes closer together.' },
  { id: 'place.dir.bare', act: 'place', match: 'D {thing:words} {rel:lex.acts.dir}', args: ['thing', 'rel'], priority: 6, if: 'dir', example: 'Eyes closer together.' },
  { id: 'ask.has', act: 'ask', mode: 'has', match: '[do|did|can|could] [you|u] [have|got|wear|see|has] D {thing:words}', args: ['thing'], priority: 12, if: 'has', example: 'Do you have glasses?' },
  { id: 'ask.has.2', act: 'ask', mode: 'has', match: '[have|are] [you|u] [got|wearing|having] D {thing:words}', args: ['thing'], priority: 12, if: 'has', example: 'Are you wearing a hat?' },
  { id: 'ask.options', act: 'ask', mode: 'options', match: '[what|which] {thing:words} [are_there|can_you_have|can_you_wear|can_i_pick|can_i_choose|can_you_draw|can_you_put_on|can_i_try|can_you_show]', args: ['thing'], priority: 12, if: 'self', example: 'What hats are there?' },
  { id: 'ask.options.all', act: 'ask', mode: 'options', match: '[what|which] [can|could] [i|you|u] [change|customize|customise|modify|adjust|tweak|wear|put_on] [about_you|about_yourself|on_you]?', args: [], priority: 12, if: 'self', example: 'What can I change?' },
  { id: 'ask.state', act: 'ask', mode: 'state', match: '[how_do_you_feel|how_are_you_feeling|what_is_your_mood|what_is_your_expression|what_mood_are_you_in|how_are_you_looking|how_do_you_look_now]', args: [], priority: 12, if: 'be', example: 'What is your expression?' },
  { id: 'ask.describe', act: 'ask', mode: 'describe', match: 'L [describe_yourself|describe_you|what_do_you_look_like|what_do_you_look_like_now|what_are_you_wearing|what_do_you_have_on|how_do_you_look|tell_me_what_you_look_like|describe_your_face|describe_your_look|describe_your_avatar|what_do_you_look_like_today]', args: [], priority: 12, if: 'self', example: 'What are you wearing?' },
  { id: 'make.random', act: 'make', mode: 'random', match: 'L [surprise|surprise_me|shuffle_yourself|randomise_yourself|randomize_yourself|make_a_random_face|a_random_face|something_random]', args: [], priority: 11, if: 'self', example: 'Surprise me.' },
  { id: 'remove.reset', act: 'remove', mode: 'all', match: 'L [reset|reset_yourself|start_over|start_again|clear_your_face|go_back_to_normal|go_default]', args: [], priority: 11, if: 'self', example: 'Reset.' },
  { id: 'change.call', act: 'change', mode: 'set', lit: { attribute: 'name' }, match: 'L [call|name|rename] [yourself|urself|the_avatar|you|me]? [to|as]? {value:rest}', args: ['value'], priority: 12, if: 'name', example: 'Call yourself Robi.' },
  { id: 'change.call.2', act: 'change', mode: 'set', lit: { attribute: 'name' }, match: 'L [i_will_call_you|i_am_calling_you|i_call_you|we_will_call_you|from_now_on_i_will_call_you|call_you] {value:rest}', args: ['value'], priority: 12, if: 'name', example: 'I will call you Robi.' },
  { id: 'change.name.is', act: 'change', mode: 'set', lit: { attribute: 'name' }, match: 'L [from_now_on]? [your|ur] name [is|will_be|shall_be] {value:rest}', args: ['value'], priority: 12, if: 'name', example: 'Your name is Robi.' },
  { id: 'change.name.called', act: 'change', mode: 'set', lit: { attribute: 'name' }, match: 'L [from_now_on]? [you|u] [are|r] [called|named] {value:rest}', args: ['value'], priority: 12, if: 'name', example: 'You are called Ziggy.' },
  { id: 'ask.name', act: 'ask', mode: 'what', lit: { attribute: 'name', thing: 'yourself' }, match: 'L [what_is_your_name|what_are_you_called|who_are_you|what_do_i_call_you|what_is_ur_name|tell_me_your_name]', args: [], priority: 12, if: 'name', example: 'What is your name?' },
  { id: 'place.layout', act: 'place', mode: 'layout', match: 'L [V.place|arrange|lay_out|space_out|distribute|tidy|organise|organize] D {thing:words} [out|up]? [in|into|as|on|along|across]? D {rel:lex.acts.layout}', args: ['thing', 'rel'], priority: 13, if: 'layout', example: 'Line up the circles horizontally.' },
  { id: 'place.layout.all', act: 'place', mode: 'layout', match: 'L [arrange|lay_out|tidy|organise|organize|space_out|distribute|align] D {thing:words} [out|up]?', args: ['thing'], priority: 8, if: 'layout', example: 'Tidy up the circles.' },
  { id: 'bare', act: 'make', mode: 'bare', match: 'L D {thing:KIND} [at_me|a_little|twice]?', args: ['thing'], priority: 3, if: 'bare', example: 'Glasses.' },
];

/** The verbs of every act: from the knowledge world k.actions (worlds/acts/verbs.generated.mjs, generated by scripts/build-acts-lexicon.mjs). No local seed. */

export const REL_WORDS = ['at', 'on', 'in', 'into', 'onto', 'to', 'next_to', 'near', 'beside', 'by', 'under', 'above', 'below', 'inside', 'with', 'around', 'between'];
export const DET_WORDS = ['a', 'an', 'the', 'another', 'my', 'this', 'that', 'one', 'some', 'our', 'your', 'ur'];
/** Direction words of a move (flag `dir`; the words of the space module): closer together, apart, higher, lower ... */
/** Words of an arrangement (flag layout): the names of the layouts of k.layouts (generated, layouts.generated.mjs) and the adverbs of a line-up. */
export const LAYOUT_ADVERBS = ['horizontally', 'vertically', 'evenly', 'neatly', 'in_a_row', 'in_a_line', 'in_a_column', 'in_a_circle', 'diagonally'];
export const DIR_WORDS = ['closer', 'closer_together', 'together', 'apart', 'further_apart', 'wider_apart', 'higher', 'lower', 'up', 'down', 'left', 'right'];

// ---- generation from the schema ----------------------------------------------------------------------------------------------------------------------
const valueWords = (s) => [...new Set(Object.values(s.attrs).flatMap((a) => (a.type === 'enum' ? a.values : a.type === 'colour' ? (a.values.length ? a.values : COLOURS) : a.type === 'bool' ? ['on', 'off'] : [])))];
const cmpWords = (s, k) => [...new Set(Object.values(s.attrs).flatMap((a) => a[k]))].filter((w) => !w.includes(' '));
function conditions(s) {
  return {
    in: Object.values(s.kinds).some((k) => k.in), named: Object.values(s.kinds).some((k) => k.named), attrs: Object.keys(s.attrs).length > 0,
    name: !!s.flags?.name, layout: !!s.flags?.layout, self: !!s.flags?.self, dir: !!s.flags?.dir, be: !!s.flags?.be, has: !!s.flags?.has, bare: !!s.flags?.bare,
    values: valueWords(s).length > 0, number: Object.values(s.attrs).some((a) => a.type === 'number'), more: cmpWords(s, 'more').length > 0, less: cmpWords(s, 'less').length > 0,
  };
}
const attrWords = (s) => [...new Set(Object.values(s.attrs).flatMap((a) => [a.name, ...a.words]))];
// the reader looks a plural up by its singular, so the lexicon carries the singular of every word (cheeks -> cheek)
const kindWords = (s) => [...new Set(Object.values(s.kinds).flatMap((k) => [k.name, k.plural, ...k.words]).flatMap((w) => [w, singular(w)]))];
/** The forms a world gets: those whose condition the schema meets and whose act the world declares. */
export function formsFor(schema) {
  const c = conditions(schema);
  return FORMS.filter((f) => schema.acts.has(f.act) && (!f.if || c[f.if]));
}
const expandMatch = (m, ns) => m.replace(/\{(\w+):words\}$/, '{$1:rest}').replace(/\bL\b/g, '[$lang.lead.polite]?').replace(/\bD\b/g, '[$acts.det]?').replace(/\bV\.(\w+)/g, '[$acts.verb.$1]')
  .replace(/\bREL\b/g, '{rel:lex.acts.rel}').replace(/\{(\w+):ATTR\}/g, `{$1:lex.${ns}.attrs}`).replace(/\{(\w+):VALUE\}/g, `{$1:lex.${ns}.values}`)
  .replace(/\{(\w+):KIND\}/g, `{$1:lex.${ns}.kinds}`).replace(/\{(\w+):MORE\}/g, `{$1:lex.${ns}.more}`).replace(/\{(\w+):LESS\}/g, `{$1:lex.${ns}.less}`);
const wordsLex = (id, doc, words, cls = 'modifier') => `@${id} core.lexicon\n    class=${cls}\n    doc=${JSON.stringify(doc)}\n${words.map((w) => `    word=${w.replace(/\s+/g, '_')}`).join('\n')}\n`;

/** The generated files of a schema world: { 'lexicon.sop', 'patterns.sop', 'operations.sop', 'templates.sop' } as text. `ns` is the world's namespace. */
export function generate(schema, ns, actsUrl = '../acts/acts.mjs') {
  const note = `@gen.${ns}.note core.note\n    text="Generated from schema.sop by scripts/build-schema-world.mjs (spec 21). Never edited by hand; tests/acts.test.mjs fails when it is stale."\n`;
  const lex = [note,
    wordsLex(`lex.${ns}.kinds`, 'Kinds of things of this world (from schema.sop)', kindWords(schema), 'noun'),
    ...(Object.keys(schema.attrs).length ? [wordsLex(`lex.${ns}.attrs`, 'Attributes (from schema.sop)', attrWords(schema))] : []),
    ...(valueWords(schema).length ? [wordsLex(`lex.${ns}.values`, 'Values the attributes take (from schema.sop)', valueWords(schema))] : []),
    ...(cmpWords(schema, 'more').length ? [wordsLex(`lex.${ns}.more`, 'Comparatives that mean more of an attribute', cmpWords(schema, 'more'))] : []),
    ...(cmpWords(schema, 'less').length ? [wordsLex(`lex.${ns}.less`, 'Comparatives that mean less of an attribute', cmpWords(schema, 'less'))] : []),
  ].join('\n');
  const forms = formsFor(schema);
  const pats = [note];
  for (const f of forms) {
    const emit = `@{_} core.request action=${ns}.${f.act}${f.mode ? ` arg.mode=${f.mode}` : ''}${Object.entries(f.lit ?? {}).map(([k, v]) => ` arg.${k}=\\"${v}\\"`).join('')}${f.args.map((a) => ` arg.${a}=\\"{${a}}\\"`).join('')} arg.text=\\"{segment}\\"`;
    pats.push(`@pat.${ns}.${f.id} core.pattern\n    match="${expandMatch(f.match, ns)}"\n    emit="${emit}"\n    kind=${f.act === 'ask' ? 'question' : 'request'}\n    priority=${f.priority}\n    tabPriority=${f.priority + 8}\n${schema.tabOnly ? "    tabOnly=true\n" : ""}    example=${JSON.stringify(exampleOf(schema, f))}\n`);
  }
  const used = [...new Set(forms.map((f) => f.act))];
  const own = (schema.own ?? []).map((o) => o.split(':'));
  const ownOps = own.map(([fn, action]) => `@op.${ns}.${fn} core.operation\n    impl=${fn}\n    semantics=action\n    action=${action}\n    doc=${JSON.stringify(`An operation of this world that is not an act (own.mjs: ${fn}).`)}\n`);
  const ops = [note, ...ownOps, ...used.map((a) => `@op.${ns}.${a} core.operation\n    impl=${a}\n    semantics=action\n    action=${ns}.${a}\n    doc=${JSON.stringify(`The act '${a}' (spec 21), applied by the generic executor to this world's schema.`)}\n`)].join('\n');
  const tpl = [note, ...used.map((a) => `@tpl.${ns}.${a} core.template\n    for=action.${ns}.${a}\n    text="{note}"\n`)].join('\n');
  const opsMjs = `// GENERATED from schema.sop by scripts/build-schema-world.mjs (spec 21). Never edited by hand.\nimport { createExecutor, deserializeSchema } from '${actsUrl}';\n${schema.hooks ? `import { hooks } from './${schema.hooks}';\n` : ''}${own.length ? `export * from './own.mjs';\n` : ''}const SCHEMA = ${JSON.stringify(serializeSchema(schema))};\nconst X = createExecutor(deserializeSchema(SCHEMA)${schema.hooks ? ', hooks' : ''});\n${used.map((a) => `export const ${a} = (ctx, args = {}) => X.operation(ctx, '${a}', args);`).join('\n')}\nexport const interceptInput = (ctx, text) => X.interceptInput(ctx, text);\nexport const outOfScope = (ctx, a = {}) => X.outOfScope(ctx, a.text);\n${schema.hooks ? "export const accepts = (info) => X.accepts(info);\n" : ''}export const referents = (ctx) => X.referents(ctx);\nexport const executor = X;\n`;
  return { 'lexicon.sop': lex, 'patterns.sop': pats.join('\n'), 'operations.sop': ops, 'templates.sop': tpl, 'ops.mjs': opsMjs };
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
  /** The things a phrase names: { ids } | { ask } | { none, kindWord } | { unknownKind } with `source` (said | focus | scene) and `guess`. */
  function resolve(st, text, opts = {}) {
    const parts = String(text ?? '').split(/\s*,\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return resolveOne(st, text, opts);
    const ids = []; let kind = null;
    for (let p of parts) {
      budget.tick('acts.coord');
      if (kind && /^(\d+|first|second|third|fourth|last)$/i.test(p)) p = `${kind} ${p}`;   // "tables 1 and 2"
      const r = resolveOne(st, p, opts);
      if (!r.ids) return r;
      kind ??= r.kind;
      for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
    }
    return { ids, source: 'said', kind };
  }
  function resolveOne(st, text, { allowEmpty = false } = {}) {
    const t = toks(text).filter((w) => !DET.has(w) || PRONOUN.has(w));
    if (!t.length) return allowEmpty ? { ids: [] } : { missing: true };
    if (t.length === 1 && PRONOUN.has(t[0])) { const f = focusOf(st).ids.filter((id) => st.items.some((i) => i.id === id)); return f.length ? { ids: f, source: 'focus', guess: `I took "${t[0]}" to mean ${labels(f.map((id) => st.items.find((i) => i.id === id)))}, the thing we just talked about` } : { missing: true }; }
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
    if (a.type === 'colour') { const list = a.values.length ? a.values : COLOURS; return list.find((x) => x === low) ?? (list === COLOURS && know.colour?.(low) ? low : list.find((x) => same(x, low))); }
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
    const fn = { make, remove, change, place, connect, group, pick, ask: askAct, copy, send, save, load }[req.act];
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
    if (!diff.linked.length) return say(`${cap(labels(a.items))} and ${labels(b)} are already connected.`, { diff });
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
    const st = init(state); const t = toks(text);
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
  function operation(ctx, act, args = {}) {
    const st = ctx.state;
    live.dlg = ctx.dialogueFocus ?? null;
    if (st.inputMode === 'confirm') { st.pending = null; st.inputMode = null; }   // a new request cancels an open question
    const req = { act, ...args };
    if (args.amount != null) req.amount = args.amount;
    req.text ??= ctx.segment?.text ?? ctx.text ?? null;
    const dom = hooks.domain?.[act];   // the world's own effect for this act (host code over its own state): a result of { status, value | note }, or undefined to use the generic executor
    if (dom) {
      const r = dom(ctx, req);
      if (r) {
        init(st);
        if (r.status === 'supported') { st.log.push({ act, mode: req.mode ?? null, text: req.text, roles: roleView(req), diff: null, reply: String(r.value ?? r.note ?? ''), guesses: [] }); if (st.log.length > 50) st.log.shift(); st.lastAct = st.log[st.log.length - 1]; }
        return r.status === 'supported' ? { status: 'supported', note: r.value ?? r.note, value: r.value ?? r.note, ...(r.effect ? { effect: r.effect } : {}) } : { status: r.status, note: r.note ?? r.value, value: r.note ?? r.value };
      }
    }
    const res = run(st, req);
    return { status: 'supported', note: res.note, value: res.note, ...(res.effect ? { effect: res.effect } : {}), fallback: res.fallback, diff: res.diff };
  }
  const VERBS = new Set(Object.values(ACT_VERBS).flat().filter((v) => !v.includes('_')).concat(['undo', 'redo', 'why', 'what', 'how', 'where', 'who', 'which', 'select', 'delete']));
  const looksLikeCommand = (t) => { const w = toks(t).filter((x) => !['please', 'can', 'you', 'could'].includes(x)); return w.length > 0 && VERBS.has(w[0]) && !kindByWord(w[0]); };
  /** The one question the executor asked: a role (the answer is the role) or a guessed act (yes / no). */
  function interceptInput(ctx, text) {
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
  function outOfScope(ctx, text) { const u = hooks.unread?.(ctx, text); return typeof u === 'string' && u ? { say: u } : lastResort(ctx.state, text); }
  /** DECLINE: the formalizer asks before routing whether this world owns a reading ({ action, mode, roles, text, state }); hooks.accepts says no when the words are not of this world. */
  const accepts = (info) => (hooks.accepts ? hooks.accepts(info) !== false : true);
  /** What a person can point at (the discourse hook `referents`, M1): the items, the focused ones salient. */
  function referents(ctx) {
    const st = init(ctx.state);
    const sal = new Set(st.focus.ids);
    return st.items.map((i) => ({ id: i.id, kind: i.kind, noun: schema.kinds[i.kind]?.name ?? i.kind, words: [i.kind, schema.kinds[i.kind]?.plural].filter(Boolean), attrs: {}, salient: sal.has(i.id), sig: JSON.stringify([i.kind, i.n, i.name, i.attrs, i.place]) }));
  }
  return { run, operation, interceptInput, lastResort, outOfScope, accepts, init, resolve, labels, schema, referents };
}
