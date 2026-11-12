/**
 * Expectation vocabulary of the operational set (training/eval/operational.jsonl), a superset of tests.sop:
 *   state item   "[world:]path<op>value"   op one of  =  !=  <  >  <=  >=  ~ (contains, case-insensitive)  == (equal ignoring case and final punctuation)
 *                path = dot path into the world state (array indexes and `length` work) with an optional selector
 *                `objects[kind=circle]` (first element whose field equals the value) or `objects[last]`.
 *                The world defaults to the case's world. Values compare as strings (numbers numerically for < > <= >=).
 *   relative value `$+N` / `$-N`: the value of the path before the message plus N (`objects.length>=$+1`).
 *   answer item  a substring that must appear (case-insensitive) in the ANSWER part of the reply text of the message (quoted echoes of the user's own words do not count, see answerPart); `forbid_answer` lists substrings that must NOT appear.
 *   effect item  the name of an effect the message must have produced.
 *   status       the status of the last answer ("supported", "unsupported", ...).
 * Pure functions, no imports (browser-safe).
 */

const NUMERIC = /^[-+]?\d+(?:\.\d+)?$/;
/** Complete numbers of a text as values: "-7" is -7 (a sign counts when it is attached to the digits and not preceded by a word character: "3-5" is 3 and 5), "45.5" is one number, "1,500" is 1500. */
export function numbersInText(text) {
  const out = [];
  for (const m of String(text).matchAll(/(?<![\w.])([-\u2212]?)(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\w]|\.\d)/g)) out.push(Number(`${m[1] ? '-' : ''}${m[2].replace(/,/g, '')}`));
  return out;
}

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
  const empty = (x) => x === 'null' || x === '';   // an empty cell is null or "" (the tic-tac-toe board stores "")
  const same = a === want || (empty(a) && empty(want));
  if (item.op === '=') ok = same;
  else if (item.op === '==') { const n = (x) => x.toLowerCase().replace(/[\s.!?]+$/g, '').trim(); ok = n(a) === n(want); }   // equal ignoring case and final punctuation
  else if (item.op === '~') ok = a.toLowerCase().includes(want.toLowerCase());   // contains, case-insensitive
  else if (item.op === '!=') ok = !same;
  else {
    const x = Number(actual), y = Number(want);
    ok = actual !== undefined && !Number.isNaN(x) && !Number.isNaN(y) && (item.op === '<' ? x < y : item.op === '>' ? x > y : item.op === '<=' ? x <= y : x >= y);
  }
  return { ok, actual: a };
}

const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/**
 * The ANSWER part of a reply: the reply with every quoted echo of the user's own words removed (`I did not understand "I give Ana 10 lei".`),
 * so an expected value is never found inside the echoed question. A quote counts as an echo when its text is a part of `message`
 * (letters and digits only, case-insensitive); other quotes (a name, a label the reply made up, an example sentence) stay.
 */
export function answerPart(replyText, message) {
  const m = ` ${norm(message ?? '')} `;
  if (m.trim() === '') return String(replyText ?? '');
  return String(replyText ?? '').replace(/"([^"]+)"|\u201c([^\u201d]+)\u201d|\u201e([^\u201d\u201c]+)[\u201d\u201c]/g, (all, a, b, c) => {
    const q = norm(a ?? b ?? c);
    return q && m.includes(` ${q} `) ? ' ' : all;
  });
}

/** Compare a state item with several path/value pairs at once: `before` and `after` are full state maps. */
export function evaluateCase(c, { before, after, replyText: fullReply, message, effects, statuses, unparsedAll, values = [] }) {
  const replyText = answerPart(fullReply, message ?? c.message);
  const items = [];
  for (const spec of c.expect?.state ?? []) {
    const it = parseStateItem(spec, c.world);
    if (!it) { items.push({ kind: 'state', spec, ok: false, bad: true }); continue; }
    // "$+N": N more than the value before the message ("objects.length>=$+2": at least two objects were added), so a long dialogue does not cascade one miss into later counts
    const rel = it.value.match(/^\$([+-]\d+)$/);
    if (rel) it.value = String(Number(statePath(before[it.world] ?? {}, it.path) ?? 0) + Number(rel[1]));
    const pre = checkState(before, it), post = checkState(after, it);
    items.push({ kind: 'state', spec, ok: post.ok, trivial: pre.ok, actual: post.actual, changed: pre.actual !== post.actual });
  }
  for (const spec of c.expect?.forbid_state ?? []) {
    const it = parseStateItem(spec, c.world);
    const post = it ? checkState(after, it) : { ok: false };
    items.push({ kind: 'forbid', spec, ok: !post.ok, actual: post.actual });
  }
  const low = (replyText ?? '').toLowerCase();
  // a purely numeric expectation is a VALUE: it matches a complete number of the reply (signed, decimal) or a typed result value of an answer, never a
  // fragment ("7" is not found in "-7", "15" or "7.5"; "5" is not "0.5"); anything else is a case-insensitive substring
  const nums = [...numbersInText(replyText ?? ''), ...values.filter((v) => typeof v === 'number' && Number.isFinite(v))];
  const has = (s) => {
    const t = String(s).trim().toLowerCase();
    return NUMERIC.test(t) ? nums.some((n) => n === Number(t)) : low.includes(t);
  };
  for (const sub of c.expect?.answer ?? []) items.push({ kind: 'answer', spec: sub, ok: has(sub) });
  for (const sub of c.expect?.answer_any ? [c.expect.answer_any] : []) items.push({ kind: 'answer', spec: sub.join(' | '), ok: sub.some(has) });
  for (const sub of c.expect?.forbid_answer ?? []) items.push({ kind: 'forbid', spec: `answer without "${sub}"`, ok: !low.includes(String(sub).trim().toLowerCase()) });
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
