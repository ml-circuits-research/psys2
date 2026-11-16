// Training-only lossless labels for a published single-command std.request graph.
// No language interpretation, model heads, instance resolution or execution.
import { World, parse, str, inspectRequest } from '../../src/vendor/sopworld/sopworld.mjs';
export const LABEL_FORMAT = 'psys2.request-labels/1';
export const LABEL_LIMITS = Object.freeze({ nodes: 256, values: 8192, characters: 262144, unresolved: 256, candidates: 64 });
const TYPES = new Set(['std.request', ...['source', 'target', 'constraint', 'not', 'group', 'quant', 'value'].map((x) => 'std.request.' + x)]);
const schemaWorld = new World(); schemaWorld.load('@use core.use world=std.request');
const schemas = new Map([...TYPES].map((type) => [type, schemaWorld.schema(type)]));
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export class LabelCodecError extends Error {
  constructor(code, detail) { super(`${code}${detail ? ': ' + detail : ''}`); this.code = code; }
}
const fail = (code, detail) => { throw new LabelCodecError(code, detail); };
function record(value, allowed) {
  if (!plain(value) || Object.keys(value).some((key) => !allowed.includes(key))) fail('malformed_record');
}
const array = (v, max) => {
  if (!Array.isArray(v) || v.length > max || Object.keys(v).length !== v.length) fail('invalid_or_oversized_array');
  for (let i = 0; i < v.length; i++) if (!Object.hasOwn(v, i)) fail('sparse_array');
};
const index = (i, size) => { if (!Number.isSafeInteger(i) || i < 0 || i >= size) fail('invalid_table_index'); return i; };
function budget() {
  let values = 0, characters = 0;
  return (text) => {
    if (typeof text !== 'string' || text.length === 0) fail('invalid_label_string');
    values++; characters += text.length;
    if (values > LABEL_LIMITS.values || characters > LABEL_LIMITS.characters) fail('label_budget_exceeded');
  };
}
const project = (w) => ({ id: w.id, type: w.type, attrs: w.attrs });
const serialize = (wires) => wires.map((w) => `@${w.id} ${w.type}` + Object.entries(w.attrs).flatMap(([k, vs]) => vs.map((v) => ` ${k}=${v}`)).join('')).join('\n');

function checkGraph(graph) {
  record(graph, ['request', 'wires', 'unresolved']);
  const count = budget(); count(graph.request);
  array(graph.wires, LABEL_LIMITS.nodes);
  const unresolved = graph.unresolved ?? []; array(unresolved, LABEL_LIMITS.unresolved);
  const byId = new Map(); let roots = 0;
  for (const wire of graph.wires) {
    record(wire, ['id', 'type', 'attrs']); count(wire.id); count(wire.type);
    if (byId.has(wire.id)) fail('duplicate_identity', wire.id);
    if (!TYPES.has(wire.type)) fail('unsupported_record_type', wire.type);
    if (wire.type === 'std.request') roots++;
    if (!plain(wire.attrs)) fail('malformed_attributes');
    const slots = schemas.get(wire.type).keys;
    for (const [key, values] of Object.entries(wire.attrs)) {
      if (!Object.hasOwn(slots, key)) fail('unknown_field', key);
      array(values, LABEL_LIMITS.values);
      if (!values.length) fail('empty_occurrence_list', key);
      if (!slots[key].many && values.length !== 1) fail('repeated_scalar_field', key);
      count(key); values.forEach(count);
    }
    byId.set(wire.id, wire);
  }
  if (roots !== 1 || byId.get(graph.request)?.type !== 'std.request') fail('expected_single_request');
  const root = byId.get(graph.request), mood = root.attrs.mood?.[0];
  if (mood !== undefined && !['do', 'propose'].includes(mood)) fail('unsupported_request_profile', mood);
  for (const wire of graph.wires) for (const values of Object.values(wire.attrs)) for (const token of values)
    if (token.startsWith('$') && !byId.has(token.slice(1))) fail('external_or_dangling_reference', token);
  const text = serialize(graph.wires);
  let reparsed;
  try { reparsed = parse(text); } catch { fail('invalid_sop_token'); }
  if (reparsed.some((w) => w.pattern) || JSON.stringify(reparsed.map(project)) !== JSON.stringify(graph.wires.map(project))) fail('non_lossless_sop_tokens');
  const unresolvedKeys = new Set();
  for (const item of unresolved) {
    record(item, ['wire', 'field', 'source', 'start', 'end', 'reason', 'candidates']);
    for (const key of ['wire', 'field', 'source', 'reason']) count(item[key]);
    const wire = byId.get(item.wire), source = byId.get(item.source);
    if (!wire || !Object.hasOwn(schemas.get(wire.type).keys, item.field)) fail('unknown_unresolved_field');
    if (Object.hasOwn(wire.attrs, item.field)) fail('unresolved_and_present_field');
    const key = JSON.stringify([item.wire, item.field]);
    if (unresolvedKeys.has(key)) fail('duplicate_unresolved_field'); unresolvedKeys.add(key);
    const token = source?.attrs.text?.[0];
    if (source?.type !== 'std.request.source' || !token?.startsWith('"')) fail('invalid_unresolved_source');
    const chars = [...str(token)];
    if (chars.some((c) => c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff)) fail('invalid_source_unicode');
    if (!Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > chars.length) fail('invalid_unresolved_span');
    array(item.candidates, LABEL_LIMITS.candidates); item.candidates.forEach(count);
  }
  if (!unresolved.length) {
    const world = new World(); world.load('@use core.use world=std.request');
    const result = world.tell(text);
    if (!result.ok) fail('invalid_request_graph', JSON.stringify(result.violations || result));
    const inspected = inspectRequest(world, graph.request);
    if (!inspected.ok) fail('invalid_request_graph', JSON.stringify(inspected.issues));
  }
  // Diagnostic labels are not claimed to be valid public graphs. Full validation is mandatory once resolved.
  return { byId, unresolved, text };
}

export function requestGraphFromSop(text, request) {
  if (typeof text !== 'string' || text.length > LABEL_LIMITS.characters) fail('source_budget_exceeded');
  const wires = parse(text);
  if (wires.some((w) => w.pattern)) fail('patterns_are_not_request_labels');
  return { request, wires: wires.map(project), unresolved: [] };
}

export function encodeRequestGraph(graph) {
  const { unresolved } = checkGraph(graph), ids = graph.wires.map((w) => w.id);
  const pointers = new Map(ids.map((id, i) => [id, i])), tokens = [], tokenMap = new Map();
  const token = (value) => {
    if (!tokenMap.has(value)) { tokenMap.set(value, tokens.length); tokens.push(value); }
    return tokenMap.get(value);
  };
  const nodes = graph.wires.map((wire) => ({ type: wire.type,
    fields: Object.entries(wire.attrs).map(([key, values]) => ({ key, values: values.map((value) => value.startsWith('$') ? { ref: pointers.get(value.slice(1)) } : { token: token(value) }) })) }));
  const diagnostics = unresolved.map((u) => ({ node: pointers.get(u.wire), field: u.field, source: pointers.get(u.source), start: u.start, end: u.end,
    reason: token(u.reason), candidates: u.candidates.map(token) }));
  return { format: LABEL_FORMAT, profile: 'single-command', contract: 'std.request@0.183.0', state: diagnostics.length ? 'unresolved' : 'complete',
    request: pointers.get(graph.request), ids, tokens, nodes, unresolved: diagnostics };
}

export function decodeRequestLabels(labels) {
  record(labels, ['format', 'profile', 'contract', 'state', 'request', 'ids', 'tokens', 'nodes', 'unresolved']);
  if (labels.format !== LABEL_FORMAT || labels.profile !== 'single-command' || labels.contract !== 'std.request@0.183.0') fail('unsupported_label_format');
  array(labels.ids, LABEL_LIMITS.nodes); array(labels.nodes, LABEL_LIMITS.nodes); array(labels.tokens, LABEL_LIMITS.values); array(labels.unresolved, LABEL_LIMITS.unresolved);
  if (labels.ids.length !== labels.nodes.length || new Set(labels.ids).size !== labels.ids.length || new Set(labels.tokens).size !== labels.tokens.length) fail('invalid_identity_or_token_table');
  const count = budget(); labels.ids.forEach(count); labels.tokens.forEach(count);
  if (labels.state !== (labels.unresolved.length ? 'unresolved' : 'complete')) fail('unresolved_state_mismatch');
  const used = new Set(), token = (n) => { index(n, labels.tokens.length); used.add(n); return labels.tokens[n]; };
  const ref = (n) => labels.ids[index(n, labels.ids.length)];
  const expanded = budget(); expanded(ref(labels.request));
  const wires = labels.nodes.map((node, i) => {
    record(node, ['type', 'fields']); array(node.fields, LABEL_LIMITS.values);
    expanded(labels.ids[i]); expanded(node.type);
    if (!TYPES.has(node.type)) fail('unsupported_record_type', node.type);
    const attrs = {};
    for (const field of node.fields) {
      record(field, ['key', 'values']);
      if (typeof field.key !== 'string' || Object.hasOwn(attrs, field.key) || field.key === '__proto__') fail('invalid_or_duplicate_field');
      expanded(field.key);
      array(field.values, LABEL_LIMITS.values);
      attrs[field.key] = field.values.map((value) => {
        if (!plain(value) || Object.keys(value).length !== 1) fail('malformed_label_value');
        if (Object.hasOwn(value, 'ref')) { const v = '$' + ref(value.ref); expanded(v); return v; }
        if (Object.hasOwn(value, 'token')) { const v = token(value.token); if (v.startsWith('$')) fail('reference_encoded_as_literal'); expanded(v); return v; }
        fail('unknown_label_value_kind');
      });
    }
    return { id: labels.ids[i], type: node.type, attrs };
  });
  const unresolved = labels.unresolved.map((u) => {
    record(u, ['node', 'field', 'source', 'start', 'end', 'reason', 'candidates']); array(u.candidates, LABEL_LIMITS.candidates);
    const out = { wire: ref(u.node), field: u.field, source: ref(u.source), start: u.start, end: u.end, reason: token(u.reason), candidates: u.candidates.map(token) };
    for (const key of ['wire', 'field', 'source', 'reason']) expanded(out[key]); out.candidates.forEach(expanded);
    return out;
  });
  if (used.size !== labels.tokens.length) fail('unused_token_table_entry');
  const graph = { request: ref(labels.request), wires, unresolved };
  checkGraph(graph);
  return graph;
}

export function requestLabelsToSop(labels) {
  const graph = decodeRequestLabels(labels);
  if (graph.unresolved.length) fail('unresolved_labels_are_not_public_requests');
  return serialize(graph.wires);
}
