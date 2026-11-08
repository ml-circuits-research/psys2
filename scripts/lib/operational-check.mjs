/**
 * Expectation vocabulary of the operational set (training/eval/operational.jsonl), a superset of tests.sop:
 *   state item   "[world:]path<op>value"   op one of  =  !=  <  >  <=  >=  ~ (contains, case-insensitive)  == (equal ignoring case and final punctuation)
 *                path = dot path into the world state (array indexes and `length` work) with an optional selector
 *                `objects[kind=circle]` (first element whose field equals the value) or `objects[last]`.
 *                The world defaults to the case's world. Values compare as strings (numbers numerically for < > <= >=).
 *   answer item  a substring that must appear (case-insensitive) in the reply text of the message.
 *   effect item  the name of an effect the message must have produced.
 *   status       the status of the last answer ("supported", "unsupported", ...).
 * Pure functions, no imports (browser-safe).
 */

const SEL = /^([^[\]]+)\[(?:([\w.]+)=([^\]]*)|(last|first))\]$/;

/** Value at a dot path of `state`, with selectors; undefined when absent. */
export function statePath(state, path) {
  let v = state;
  for (const part of path.split('.')) {
    if (v === null || v === undefined) return undefined;
    const m = part.match(SEL);
    if (m) {
      const arr = v[m[1]];
      if (!Array.isArray(arr)) return undefined;
      if (m[4]) v = m[4] === 'last' ? arr.at(-1) : arr[0];
      else v = arr.find((x) => String(statePath(x, m[2])) === m[3]);
    } else v = v[part];
  }
  return v;
}

export function parseStateItem(spec, defaultWorld) {
  // optional "world.id:" prefix, a path (selectors may contain "="), an operator, the value
  const m = String(spec).match(/^(?:([a-z]\w*\.[\w.]*?):)?((?:\[[^\]]*\]|[^<>=!~:[\]])+?)\s*(<=|>=|!=|==|=|<|>|~)\s*(.*)$/);
  if (!m) return null;
  return { world: m[1] ?? defaultWorld, path: m[2].trim(), op: m[3], value: m[4] };
}

const show = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));

export function checkState(states, item) {
  const actual = statePath(states[item.world] ?? {}, item.path);
  const a = show(actual);
  // a value starting with "@" is another path of the same world ("objects[kind=circle].y<@objects[kind=square].y")
  const want = item.value.startsWith('@') ? show(statePath(states[item.world] ?? {}, item.value.slice(1))) : item.value;
  let ok;
  if (item.op === '=') ok = a === want;
  else if (item.op === '==') { const n = (x) => x.toLowerCase().replace(/[\s.!?]+$/g, '').trim(); ok = n(a) === n(want); }   // equal ignoring case and final punctuation
  else if (item.op === '~') ok = a.toLowerCase().includes(want.toLowerCase());   // contains, case-insensitive
  else if (item.op === '!=') ok = a !== want;
  else {
    const x = Number(actual), y = Number(want);
    ok = actual !== undefined && !Number.isNaN(x) && !Number.isNaN(y) && (item.op === '<' ? x < y : item.op === '>' ? x > y : item.op === '<=' ? x <= y : x >= y);
  }
  return { ok, actual: a };
}

/** Compare a state item with several path/value pairs at once: `before` and `after` are full state maps. */
export function evaluateCase(c, { before, after, replyText, effects, statuses, unparsedAll }) {
  const items = [];
  for (const spec of c.expect?.state ?? []) {
    const it = parseStateItem(spec, c.world);
    if (!it) { items.push({ kind: 'state', spec, ok: false, bad: true }); continue; }
    const pre = checkState(before, it), post = checkState(after, it);
    items.push({ kind: 'state', spec, ok: post.ok, trivial: pre.ok, actual: post.actual, changed: pre.actual !== post.actual });
  }
  for (const spec of c.expect?.forbid_state ?? []) {
    const it = parseStateItem(spec, c.world);
    const post = it ? checkState(after, it) : { ok: false };
    items.push({ kind: 'forbid', spec, ok: !post.ok, actual: post.actual });
  }
  const low = (replyText ?? '').toLowerCase();
  // a purely numeric expectation matches a whole number only ("5" is not found in "15" or "5.5"); anything else is a case-insensitive substring
  const has = (s) => {
    const t = String(s).toLowerCase();
    return /^-?\d+(\.\d+)?$/.test(t) ? new RegExp(`(?<![\\d.])${t.replace('.', '\\.')}(?![\\d]|\\.\\d)`).test(low) : low.includes(t);
  };
  for (const sub of c.expect?.answer ?? []) items.push({ kind: 'answer', spec: sub, ok: has(sub) });
  for (const sub of c.expect?.answer_any ? [c.expect.answer_any] : []) items.push({ kind: 'answer', spec: sub.join(' | '), ok: sub.some(has) });
  for (const name of c.expect?.effects ?? []) items.push({ kind: 'effect', spec: name, ok: effects.some((e) => e.name === name) });
  if (c.expect?.status) items.push({ kind: 'status', spec: c.expect.status, ok: statuses.at(-1) === c.expect.status });
  return items;
}

/**
 * Outcome of one case: right | partly | wrong | not_understood.
 *   right           every counted expectation holds (items already true before the message are not counted, unless they are the only ones)
 *   not_understood  the message produced nothing: every segment unparsed, or nothing supported and no state change
 *   partly          something was understood and at least one expectation holds, but not all and nothing contradicts
 *   wrong           it acted or answered, and no expectation holds or something contradicts (a forbidden state, or a state changed to another value)
 * Negative cases (`expect.none`): right when nothing was understood or done; wrong when it acted.
 */
export function classify(c, items, { statuses, unparsedAll, stateChanged, effects }) {
  if (c.expect?.none) {
    const acted = stateChanged || effects.length > 0 || statuses.some((s) => s === 'supported');
    return acted ? 'wrong' : 'right';
  }
  const counted = items.filter((x) => !x.trivial || items.every((y) => y.trivial || y.kind !== 'state'));
  const failing = counted.filter((x) => !x.ok);
  if (!failing.length) return 'right';
  const acted = stateChanged || effects.length > 0 || statuses.some((s) => s === 'supported');
  if (unparsedAll || !acted) return 'not_understood';
  const contradicts = failing.some((x) => x.kind === 'forbid' || (x.kind === 'state' && x.changed));
  const passes = counted.filter((x) => x.ok).length;
  if (passes && !contradicts) return 'partly';
  return 'wrong';
}
