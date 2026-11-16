// Trusted construction interpretation, expressed with the existing composition
// template API. It declares only the currently published property-change family.
const get = (...path) => ({ $get: ['node', 'value', ...path] });
const literal = value => ({ kind: 'literal', value });
const ref = value => ({ kind: 'ref', value });
const string = value => ({ kind: 'string', value });
const variant = definite => {
  const target = { mode: get('target', 'mode'), kind: get('target', 'kind'), ...(definite ? { determiner: get('target', 'determiner') } : {}) };
  const condition = Object.fromEntries(['concept', 'operator', 'value', 'character', 'polarity', 'evidence'].map(key => [key, get('constraint', key)]));
  const record = { act: get('act'), mood: get('mood'), target, constraint: condition, evidence: get('evidence') };
  const graph = {
    request: 'r', source: 'source',
    nodes: [
      { id: 'source', type: 'std.request.source', attrs: { text: [string({ $get: ['node', 'source', 'text'] })] } },
      { id: 'r', type: 'std.request', attrs: { act: [literal(get('act'))], mood: [literal(get('mood'))], source: [ref('source')], root: [ref('condition')] } },
      { id: 'target', type: 'std.request.target', attrs: { request: [ref('r')], mode: [literal(target.mode)], kind: [literal(target.kind)], ...(definite ? { determiner: [literal(target.determiner)] } : {}) } },
      { id: 'condition', type: 'std.request.constraint', attrs: { request: [ref('r')], target: [ref('target')], concept: [literal(condition.concept)], operator: [literal(condition.operator)], value: [string(condition.value)], character: [literal(condition.character)], polarity: [literal(condition.polarity)] } },
    ],
    evidence: { command: get('evidence'), nodes: [{ id: 'condition', source: 'source', ranges: condition.evidence }] },
  };
  const guards = [{ left: get(), right: record }, ...[
    [get('mood'), 'do'], [target.mode, 'existing'], [condition.operator, 'eq'],
    [condition.character, 'requirement'], [condition.polarity, 'positive'],
  ].map(([left, right]) => ({ left, right }))];
  return { graph, guards };
};
const bare = variant(false), definite = variant(true);
export const PROPERTY_CHANGE_REQUEST_PROFILE = {
  rules: { bare: bare.graph, definite: definite.graph },
  guards: { bare: bare.guards, definite: definite.guards },
};
