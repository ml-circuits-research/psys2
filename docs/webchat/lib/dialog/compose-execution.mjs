// SPDX-License-Identifier: AGPL-3.0-only
// COMPOSITION FROM KNOWLEDGE (worlds/app.project/compose-policy.sop): random, "surprise me", "another one", "simpler"
// and conversation-grounded content of the Drawing and Diagram tabs. This module is the generic host half: it states
// facts (the reading, the request, the stated preferences, what earlier turns read, the knowledge the policy declares
// to load), runs the declared rules, and executes the calls they conclude through the area's own declared operations:
// the made things placed together by the placement problem (executeNativeGroup: std.problem, Z3 where available), the
// calls of the after phase with the ids made, everything as one undoable turn. It names no scene, kind or sentence.
import { World, parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=d86f897e0e';
import POLICY from '../../worlds/app.project/compose-policy-source.mjs?v=03c2556471';
import SCHEMA from '../../worlds/app.project/compose-schema-source.mjs?v=26d40ac451';
import { NATIVE_AREAS, createAreaHost } from './app-reader-context.mjs?v=4afe6eb1e8';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';
import { executeNativeGroup } from './capability-plan-execution.mjs?v=c305284e10';
import { describeNativeControl } from './native-control-intent.mjs?v=94cc7d01b8';
import { invokeObservedNativeTool } from './native-tool-activity.mjs?v=a8b0e1d688';
import { captureHistory, recordHistory, restoreHistory } from './history-journal.mjs?v=9afff05a19';
import { budget } from './budget.mjs?v=d42dc656e7';
import { en } from '../lang/en.mjs?v=d028d63371';

const family = 'app.compose.';
const first = (row, key) => row?.attrs[key]?.[0];
const text = (row, key) => { const v = first(row, key); return v === undefined ? undefined : str(v); };
const value = (raw) => { if (raw === undefined) return undefined; const s = str(raw); return typeof s === 'string' && raw[0] !== '"' && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s; };
const fact = (id, type, attrs) => ({ id, type: family + type, attrs: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(token)])), pattern: false });
// A value as SOP writes it: numbers and booleans bare, a plain word as an atom (as the catalog writes names), else a string.
const token = (x) => typeof x === 'number' || typeof x === 'boolean' ? String(x) : /^[A-Za-z_][A-Za-z0-9_-]*$/.test(String(x)) && !['true', 'false', 'null'].includes(String(x)) ? String(x) : quote(String(x));
const META = new Set(['form', 'phase', 'operation', 'order', 'count', 'thing']);

let loaded;
function policyWorld() {
  if (!loaded) {
    const world = new World({ library: { 'app.compose': SCHEMA } });
    const told = world.tell(POLICY);
    if (!told.ok) throw Error('invalid-compose-policy');
    loaded = world;
  }
  return loaded.fork();
}
export const inspectComposePolicy = () => ({ policy: POLICY, schema: SCHEMA, loaded: !!loaded });

// The knowledge the policy declares for a form (app.compose.load), read from the catalog by declared field and keys.
async function loadKnowledge(world, knowledge, select) {
  const facts = knowledge?.base ?? knowledge;
  if (!facts?.wireSource) return { missing: true, types: [] };
  const rows = new Map(), types = [];
  for (const load of world.ofType(family + 'load').filter(select)) {
    budget.tick('compose.load');
    const type = text(load, 'type'), field = text(load, 'field');
    let keys = (load.attrs.key ?? []).map(str);
    const from = text(load, 'from');
    if (from) keys = [...new Set((rows.get(from) ?? []).flatMap((row) => (row.attrs[text(load, 'fromKey')] ?? []).map(str)))];
    if (!keys.length) { rows.set(type, []); continue; }
    let source;
    try { source = await facts.wireSource(type, { field, keys, maxBytes: 4_000_000 }); } catch { source = null; }
    const parsed = source ? parse(source) : [];
    rows.set(type, parsed);
    if (source && !world.tell(source, { factsOnly: true }).ok) throw Error('invalid-compose-knowledge:' + type);
    types.push(type);
  }
  return { types };
}

// The stated preferences of the area's instance (w.preferences.preference, source stated): the latest per key.
function statedPreferences(state) {
  const rows = typeof state?.sop === 'string' ? parse(state.sop).filter((row) => row.type === 'w.preferences.preference' && first(row, 'source') === 'stated') : [];
  const latest = new Map();
  for (const row of rows) { const key = text(row, 'key'), at = Number(first(row, 'at') ?? 0); if (key && (!latest.has(key) || latest.get(key).at <= at)) latest.set(key, { value: text(row, 'value'), at }); }
  return [...latest].map(([key, { value: v }]) => ({ key, value: v }));
}

// What earlier turns read (session.composeTurns: the reader's raw requests of each routed turn, never the text re-read):
// the things they named, the numbers they said with what they count, the steps they said in order.
export function conversationFacts(session, { limit = 8 } = {}) {
  const turns = (session.composeTurns ?? []).slice(-limit), mentions = [], numbers = [], said = [];
  for (const turn of turns) for (const request of turn.requests ?? []) {
    const target = request?.target ?? {}, kind = target.kind_span ?? target.kind;
    if (typeof kind === 'string' && kind && target.mode !== 'bound') mentions.push(kind);
    for (const c of request?.constraints ?? []) {
      const n = typeof c.value === 'number' ? c.value : typeof c.value === 'string' && /^-?\d+(\.\d+)?$/.test(c.value.trim()) ? Number(c.value) : null;
      if (n !== null) numbers.push({ value: n, label: kind ?? c.key });
    }
    if (typeof target.count === 'number' && typeof kind === 'string') numbers.push({ value: target.count, label: kind });
    if (typeof request?.span === 'string' && request.span.trim()) said.push(request.span.trim());
  }
  const unique = [...new Set(mentions)];
  return [...unique.map((thing, i) => fact('mention.' + i, 'mention', { n: i + 1, thing })),
    ...numbers.map((x, i) => fact('number.' + i, 'number', { n: i + 1, value: x.value, label: x.label })),
    ...said.map((t, i) => fact('said.' + i, 'said', { n: i + 1, text: t }))];
}

/** The reading facts of a one-request proposal: area, act, mode, type, kind word, whether it bound, its canonical kind. */
export function composeReading(proposal) {
  const raw = proposal?.raw, r = raw?.requests?.[0];
  if (!r || raw.requests.length !== 1 || typeof raw.area !== 'string') return null;
  // A reading that saw kinds it could not hold ("a cat and 2 dogs" for one target) said what to make: it is not composed.
  if ((proposal.failures ?? []).some((f) => f.detail?.reason === 'ambiguous-global-mention')) return null;
  const target = r.target ?? {}, word = target.kind_span ?? target.kind;
  const unbound = (proposal.failures ?? []).some((f) => f.reason === 'unresolved-canonical-kind-binding');
  let canonical;
  for (const candidate of proposal.candidates ?? []) {
    try { const kind = parse(candidate.wires).find((w) => w.type === 'std.request.target' && first(w, 'mode') === 'new')?.attrs.kind?.[0]; if (kind) { canonical = str(kind); break; } } catch { /* An unreadable candidate names no kind. */ }
  }
  // What else the reading says, for the declared trigger conditions: how many requests the turn has (the reader's
  // source cuts), the keys of what it specifies about the result, and the words of its own request span.
  const parts = Array.isArray(proposal.composition?.sourceCuts) ? proposal.composition.sourceCuts.length : raw.requests.length;
  // Each constraint with the value it says (a closed value the reader chose, else its span), for the declared options.
  const said = (c) => { const v = c.value ?? c.value_span; return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined; };
  const constraints = [...new Map((r.constraints ?? []).filter((c) => typeof c?.key === 'string' && c.phase !== 'selector').map((c) => [c.key + '\u0000' + (said(c) ?? ''), { key: c.key, value: said(c) }])).values()];
  const words = [...new Set([...String(r.span ?? raw.source?.text ?? '').toLowerCase().matchAll(/\p{L}+/gu)].map((m) => m[0]))];
  return { area: raw.area, act: r.act, mode: target.mode, type: target.type, word: typeof word === 'string' && word ? word.toLowerCase() : undefined, bound: word ? !unbound && !!canonical : undefined, canonical,
    parts, constraints, words };
}

// The thing a "with" phrase names: its words without the determiners and numbers of w.lang.en, the last one singular
// ("a dog" -> dog, "two cows" -> cow), as the knowledge names things.
function thingOf(phrase) {
  const det = en.words('det'), words = String(phrase).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const rest = words.filter((w, i) => !(i < words.length - 1 && (det.has(w) || /^\d+$/.test(w))));
  if (!rest.length) return phrase;
  const last = rest.at(-1), singular = en.singular(last, 'lemma');
  return [...rest.slice(0, -1), typeof singular === 'string' && singular ? singular : last].join(' ');
}

/** Does this reading start a composition? The declared trigger rules decide; the result names form, subject, variant. */
export async function composeStart(session, reading, { knowledge } = {}) {
  if (!reading?.area) return null;
  const world = policyWorld();
  if (reading.word) await loadKnowledge(world, knowledge, (load) => first(load, 'trigger') === 'true');
  const last = session.composeLast?.[reading.area];
  const { constraints = [], words = [], ...said } = reading;
  const facts = [fact('reading', 'reading', said), ...(last ? [fact('last', 'last', { area: reading.area, form: last.form })] : []),
    ...constraints.map((c, i) => fact('constraint.' + i, 'constraint', typeof c === 'string' ? { key: c } : c)), ...words.map((word, i) => fact('word.' + i, 'word', { word }))];
  if (!world.tell(serialize(facts), { factsOnly: true }).ok) return null;
  const starts = world.ofType(family + 'start');
  if (!starts.length) return null;
  const start = starts.find((row) => first(row, 'subject') !== undefined) ?? starts[0];
  // The declared options the reading says (app.compose.option: source, variant, with), first one per option.
  const options = {};
  for (const row of world.ofType(family + 'option')) { const key = text(row, 'option'); if (['source', 'variant', 'with'].includes(key) && options[key] === undefined) options[key] = text(row, 'value'); }
  return { area: reading.area, form: text(start, 'form'), subject: text(start, 'subject'), variant: text(start, 'variant') ?? options.variant,
    ...(options.source ? { source: options.source } : {}), ...(text(start, 'with') ?? options.with ? { with: thingOf(text(start, 'with') ?? options.with) } : {}) };
}

/** The calls the policy concludes for a request: { calls, lists, found, reply, level }. */
export async function composeCalls(session, request, { view, knowledge } = {}) {
  const area = NATIVE_AREAS[view];
  const world = policyWorld();
  const { missing } = request.source === 'random' ? await loadKnowledge(world, knowledge, (load) => text(load, 'form') === request.form || first(load, 'form') === request.form) : {};
  if (missing) return { reason: 'compose-knowledge-unavailable', calls: [] };
  const preferences = statedPreferences(area && session.isession.state[area.world]);
  const facts = [fact('request', 'request', { area: area?.area, form: request.form, seed: request.seed, source: request.source, subject: request.subject, with: request.with, variant: request.variant, layout: request.layout }),
    ...preferences.map((p, i) => fact('preference.' + i, 'preference', p)), ...(request.source === 'conversation' ? conversationFacts(session) : [])];
  if (!world.tell(serialize(facts), { factsOnly: true }).ok) return { reason: 'invalid-compose-request', calls: [] };
  const level = text(world.ofType(family + 'level')[0], 'level') ?? 'default';
  const detail = world.ofType(family + 'detail').find((row) => text(row, 'level') === level);
  const calls = world.ofType(family + 'call').filter((row) => text(row, 'form') === request.form).map((row) => ({
    phase: text(row, 'phase'), operation: text(row, 'operation'), order: Number(text(row, 'order') ?? 0), count: Number(text(row, 'count') ?? 1), thing: text(row, 'thing'),
    args: Object.fromEntries(Object.entries(row.attrs).filter(([key]) => !META.has(key)).map(([key, raw]) => [key, value(raw[0])])),
  })).sort((a, b) => a.order - b.order);
  const lists = world.ofType(family + 'list').filter((row) => text(row, 'form') === request.form).map((row) => ({ operation: text(row, 'operation'), parameter: text(row, 'parameter'), n: Number(text(row, 'n')), value: value(first(row, 'value')) }));
  const found = world.ofType(family + 'found').find((row) => text(row, 'form') === request.form);
  const reply = world.ofType(family + 'reply').find((row) => text(row, 'form') === request.form && text(row, 'source') === request.source);
  const none = world.ofType(family + 'reply').find((row) => text(row, 'source') === 'none');
  const limit = Number(text(detail, 'subjects') ?? text(world.ofType(family + 'limit')[0], 'subjects') ?? 16);
  const fallbacks = world.ofType(family + 'fallback').map((row) => ({ operation: text(row, 'operation'), parameter: text(row, 'parameter'), to: text(row, 'to'), as: text(row, 'as') }));
  return { calls, lists, level, limit, fallbacks, found: found ? Object.fromEntries(Object.keys(found.attrs).map((key) => [key, text(found, key)])) : null,
    reply: text(reply, 'text'), none: text(none, 'text') };
}

// A reply template's slots: {key} the value, {a key} the value with its indefinite article.
const fill = (template, values) => template.replace(/\{(a )?(\w+)\}/g, (_, article, key) => { const v = String(values[key] ?? ''); return article ? (/^[aeiou]/i.test(v) ? 'an ' : 'a ') + v : v; });
function reply(message, supported, trace = {}) {
  return { text: message, parts: [{ text: message, translate: false }], statuses: [supported ? 'supported' : 'unsupported'], answers: [], segments: [], state: {}, effects: [], newEngine: true,
    trace: { legacy: false, engine: 'new', ...trace } };
}

/**
 * Compose and execute one request ({ form, source, seed, subject?, with?, variant?, layout? }) on a tab: one undoable
 * turn, the seed recorded (session.composeLast) so "another one" is the next seed.
 */
export async function executeCompose(session, request, { view, knowledge = session.engine?.knowledge } = {}) {
  const area = NATIVE_AREAS[view];
  if (!area || !session.isession.state[area.world]) return null;
  const planned = await composeCalls(session, request, { view, knowledge });
  const trace = { compose: { request, level: planned.level, found: planned.found, calls: planned.calls.length } };
  if (!planned.calls.length || !planned.found) {
    const message = request.source === 'conversation' ? planned.none : 'I could not compose that from what I know. Nothing changed.';
    return reply(message ?? 'Nothing changed.', false, { ...trace, reason: planned.reason ?? 'compose-nothing' });
  }
  const before = structuredClone(session.isession.state), journal = captureHistory(session, false);
  const restore = () => { if (!restoreHistory(session, journal, {}, false)) throw Error('invalid-compose-history-checkpoint'); Object.assign(session.isession.state, before); };
  const host = await createAreaHost(area, { state: session.isession.state[area.world], instanceId: instanceIdFor(session, area.world), loader: session.engine?.loader, knowledge });
  const operations = new Map(host.bindings().map((op) => [op.id, op]));
  const enumOf = (op, key) => op?.params?.[key]?.enum;
  const argsOf = (call) => {
    const args = { ...call.args };
    for (const list of planned.lists.filter((l) => l.operation === call.operation)) (args[list.parameter] ??= []);
    for (const list of planned.lists.filter((l) => l.operation === call.operation).sort((a, b) => a.n - b.n)) args[list.parameter].push(list.value);
    return args;
  };
  // Make calls with scalar arguments are placed together; a kind the operation's own list lacks takes the declared fallback.
  const scalar = (v) => ['string', 'number', 'boolean'].includes(typeof v);
  const members = [], direct = [];
  let subjects = 0;
  for (const call of planned.calls.filter((c) => c.phase === 'make')) {
    let operation = call.operation, args = argsOf(call);
    const fallback = planned.fallbacks.find((f) => f.operation === operation && enumOf(operations.get(operation), f.parameter) && !enumOf(operations.get(operation), f.parameter).includes(args[f.parameter]));
    if (fallback) { const { [fallback.parameter]: moved, ...rest } = args; operation = fallback.to; args = { ...rest, [fallback.as]: moved }; }
    if (!operations.has(operation)) continue;
    if (Object.values(args).every(scalar)) {
      const repeat = Math.max(1, Math.min(call.count, planned.limit - subjects));
      if (subjects >= planned.limit) break;
      subjects += repeat;
      members.push({ candidate: null, plan: { status: 'compiled', act: 'make', operation, args, kind: call.thing ?? args.kind ?? args.name ?? operation, repeat, notes: [], skipped: [], sop: '' } });
    } else direct.push({ operation, args });
  }
  let made = [], group = null;
  try {
    if (members.length) {
      group = await executeNativeGroup(session, members, { view });
      if (!group?.statuses?.includes('supported')) { restore(); return reply(group?.text ?? 'I could not compose that. Nothing changed.', false, { ...trace, reason: group?.trace?.reason ?? 'compose-group-refused' }); }
      made = (group.trace.group?.made ?? []).map((m) => m.id).filter(Boolean);
    }
    const run = async (operation, args) => {
      const live = await createAreaHost(area, { state: session.isession.state[area.world], instanceId: instanceIdFor(session, area.world), loader: session.engine?.loader, knowledge, args });
      const op = live.bindings().find((o) => o.id === operation), observed = live.observe();
      const before = new Set(observed.objects.map((o) => o.id));
      const sop = describeNativeControl({ operation: op, args, before: observed }).wires;
      const receipt = await invokeObservedNativeTool(session, { area, host: live, expectedVersion: observed.version, sop });
      if (receipt.status !== 'changed') return { receipt, made: [] };
      session.isession.state[area.world] = live.state?.() ?? session.isession.state[area.world];
      const after = live.observe();
      return { receipt, made: after.objects.filter((o) => !before.has(o.id) && (o.in ?? o.parent) === undefined).map((o) => o.id) };
    };
    for (const { operation, args } of direct) { const r = await run(operation, args); if (r.receipt.status !== 'changed') { restore(); return reply('I could not compose that. Nothing changed.', false, { ...trace, reason: r.receipt.reason ?? 'compose-call-refused' }); } made.push(...r.made); }
    for (const call of planned.calls.filter((c) => c.phase === 'after')) {
      const args = Object.fromEntries(Object.entries(argsOf(call)).map(([key, v]) => [key, v === '@made' ? [...made] : v]));
      if (Object.values(args).some((v) => Array.isArray(v) && v.length < 2)) continue;
      if (operations.has(call.operation)) await run(call.operation, args);
    }
  } catch (error) { restore(); return reply('I could not compose that. Nothing changed.', false, { ...trace, reason: 'compose-error', error: String(error?.message ?? error) }); }
  const changed = Object.keys(session.isession.state).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(session.isession.state[key]));
  if (!changed.length) return reply('I could not compose that. Nothing changed.', false, { ...trace, reason: 'compose-no-change' });
  if (!restoreHistory(session, journal, {}, false)) throw Error('invalid-compose-history-checkpoint');
  recordHistory(session, { area: view, before: Object.fromEntries(changed.map((key) => [key, before[key]])), after: Object.fromEntries(changed.map((key) => [key, structuredClone(session.isession.state[key])])), reading: null, compose: request });
  session.composeLast = { ...session.composeLast, [area.area]: { form: request.form, seed: request.seed, subject: request.subject ?? planned.found.subject, with: request.with, topic: planned.found.topic, source: request.source } };
  const values = { ...planned.found, seed: request.seed };
  const said = planned.reply ? fill(planned.reply, values) : 'Done.';
  const createdNote = group?.text?.startsWith('Created ') ? ' ' + group.text.replace(/^Created ([^.]*)\..*$/s, 'It has $1.') : '';
  return { ...reply(said + createdNote, true, { ...trace, made, seed: request.seed, history: false }), state: Object.fromEntries(changed.map((key) => [key, structuredClone(session.isession.state[key])])),
    effects: [{ operation: 'compose', form: request.form, seed: request.seed }] };
}

/** A fresh seed (recorded with the result): from the clock and a counter, so two quick requests differ. */
export function freshSeed(session) {
  session.composeCounter = (session.composeCounter ?? 0) + 1;
  return (Math.floor(Date.now() / 7) + session.composeCounter * 7919) % 1_000_000;
}

/** The request a start describes, with the seed: "another one" is the last seed + 1 with its subject. */
export function composeRequest(session, start, { seed } = {}) {
  const last = session.composeLast?.[start.area];
  if (start.variant && last && last.form === start.form)
    return { form: start.form, source: last.source ?? 'random', seed: seed ?? (start.variant === 'another' ? last.seed + 1 : last.seed), subject: last.subject, with: last.with, variant: start.variant };
  return { form: start.form, source: start.source ?? 'random', seed: seed ?? freshSeed(session), subject: start.subject, with: start.with, variant: start.variant, layout: start.layout };
}
