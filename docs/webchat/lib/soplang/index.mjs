/**
 * SOP Lang v1.1 parser and serializer (spec 01). Browser-safe: no node:* imports.
 *
 * Wire  = { id, type, entries: [{ key, value }], span: { start, end, line }, source }
 * value = { kind: 'atom' | 'string' | 'ref' | 'var', v: string }
 *   ref `$id` has v = 'id'; `$?x` (the wire whose id the variable ?x holds) has v = '?x'; var `?name` has v = 'name'.
 */
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$/;
const REFID = /^\??[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_][A-Za-z0-9_-]*)*$/;
const WS = /\s/;
/** Characters that end an identifier-like token (ids, types, keys, references, variables). */
const DELIM = new Set(['"', '@', '$', '=', '\\']);

/** True when `s` is a valid SOP Lang identifier. */
export function isIdentifier(s) {
  return typeof s === 'string' && IDENT.test(s);
}

/** Thrown by parseOrThrow; `errors` holds every ParseError. */
export class SopSyntaxError extends Error {
  constructor(errors) {
    const first = errors[0];
    const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : '';
    super(`${first.source ? first.source + ':' : ''}${first.line}:${first.column}: ${first.message}${more}`);
    this.name = 'SopSyntaxError';
    this.errors = errors;
  }
}

/** Build a value object. */
export const atom = (v) => ({ kind: 'atom', v: String(v) });
export const str = (v) => ({ kind: 'string', v: String(v) });
export const ref = (v) => ({ kind: 'ref', v: String(v).replace(/^\$/, '') });
export const variable = (v) => ({ kind: 'var', v: String(v).replace(/^\?/, '') });

/** Build a wire programmatically from [key, value] pairs. */
export function makeWire(id, type, pairs = [], extra = {}) {
  return { id, type, entries: pairs.map(([key, value]) => ({ key, value })), ...extra };
}

/**
 * Parse SOP Lang text. Never throws; returns the wires that parsed and every error found.
 * @returns {{ wires: object[], errors: object[] }}
 */
export function parse(text, { source } = {}) {
  const src = String(text);
  const n = src.length;
  const wires = [];
  const errors = [];
  const seen = new Set();

  // line starts for offset -> line/column
  const lineStarts = [0];
  for (let k = 0; k < n; k++) if (src[k] === '\n') lineStarts.push(k + 1);
  const pos = (offset) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      budget.tick('index.pos');
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
  };
  const fail = (message, offset) => {
    errors.push({ message, offset, ...pos(offset), source });
    return null;
  };

  let i = 0;
  /** Skip white space and `#` comments (a comment starts where a token could start and runs to the end of the line). */
  const skipWs = () => {
    while (i < n) {
      budget.tick('index.skipWs');
      if (WS.test(src[i])) i++;
      else if (src[i] === '#') { while (i < n && src[i] !== '\n') { budget.tick('index.comment'); i++; } }
      else break;
    }
  };
  /** Read a run of characters that are not whitespace or delimiters. */
  const run = () => {
    const s = i;
    while (i < n && !WS.test(src[i]) && !DELIM.has(src[i])) { budget.tick('index.run'); i++; }
    return src.slice(s, i);
  };
  /** Read the run of an unquoted value: everything up to white space, a quote or a backslash. */
  const atomRun = () => {
    const s = i;
    while (i < n && !WS.test(src[i]) && src[i] !== '"' && src[i] !== '\\') { budget.tick('index.atomRun'); i++; }
    return src.slice(s, i);
  };
  /** Skip to the next '@' that starts a token (error recovery). */
  const resync = () => { while (i < n && !(src[i] === '@' && (i === 0 || WS.test(src[i - 1]) || src[i - 1] === '"'))) { budget.tick('index.resync'); i++; } };
  const atBoundary = () => i >= n || WS.test(src[i]) || src[i] === '@';

  /** Scan a quoted string starting at src[i] === '"'. Returns the decoded value or null. */
  const readString = () => {
    const start = i;
    i++;
    while (i < n && src[i] !== '"') {
      budget.tick('index.readString');
      const c = src[i];
      if (c === '\\') {
        const e = src[i + 1];
        if (e === undefined) break;
        if ('"\\/bfnrt'.includes(e)) { i += 2; continue; }
        if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) return fail('bad \\u escape in string', i);
          i += 6; continue;
        }
        return fail(`bad escape '\\${e}' in string`, i);
      }
      i++;
    }
    if (i >= n) return fail('unterminated string', start);
    const raw = src.slice(start, i + 1);
    i++;
    // a line end, a tab or any other control character may stand in a string as it is; the stored text is the same
    return JSON.parse(/[\u0000-\u001f]/.test(raw) ? raw.replace(/[\u0000-\u001f]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) : raw);
  };

  const readValue = () => {
    const c = src[i];
    if (c === '"') {
      const v = readString();
      if (v === null) return null;
      if (!atBoundary()) return fail('unexpected character after string', i);
      return { kind: 'string', v };
    }
    if (c === '$') {
      const s = i;
      i++;
      const id = run();
      if (!REFID.test(id)) return fail(`invalid reference '$${id}'`, s);
      if (!atBoundary()) return fail('unexpected character after reference', i);
      return { kind: 'ref', v: id };
    }
    if (c === '?') {
      const s = i;
      i++;
      const id = run();
      if (!IDENT.test(id)) return fail(`invalid variable '?${id}'`, s);
      if (!atBoundary()) return fail('unexpected character after variable', i);
      return { kind: 'var', v: id };
    }
    const s = i;
    const v = atomRun();
    if (v === '') return fail(`unexpected '${c}' in value`, s);
    if (!atBoundary()) return fail(`character '${src[i]}' is not allowed in an unquoted value (quote the string)`, i);
    return { kind: 'atom', v };
  };

  /** Parse one declaration starting at src[i] === '@'. */
  const readWire = () => {
    const start = i;
    i++; // '@'
    const idPos = i;
    const id = run();
    if (id === '') return fail('declaration without id', idPos);
    if (!IDENT.test(id)) return fail(`invalid wire id '${id}'`, idPos);
    if (!atBoundary()) return fail(`unexpected '${src[i]}' after wire id`, i);
    skipWs();
    const typePos = i;
    if (i >= n || src[i] === '@') return fail('declaration without type', typePos);
    const type = run();
    if (type === '') return fail('declaration without type', typePos);
    if (src[i] === '=') return fail('declaration without type (found key=value)', typePos);
    if (!IDENT.test(type)) return fail(`invalid wire type '${type}'`, typePos);
    if (!atBoundary()) return fail(`unexpected '${src[i]}' after wire type`, i);
    if (seen.has(id)) return fail(`duplicate wire id '${id}'`, idPos);

    const entries = [];
    for (;;) {
      budget.tick('soplang.entry');
      skipWs();
      if (i >= n || src[i] === '@') break;
      const kPos = i;
      const key = run();
      if (key === '' || src[i] !== '=') return fail(`expected key=value, found '${src.slice(kPos, Math.min(n, kPos + 20)).split(/\s/)[0]}'`, kPos);
      if (!IDENT.test(key)) return fail(`invalid key '${key}'`, kPos);
      i++; // '='
      if (atBoundary()) return fail(`empty value for key '${key}'`, i);
      const value = readValue();
      if (value === null) return null;
      entries.push({ key, value });
    }
    seen.add(id);
    return { id, type, entries, span: { start, end: i, line: pos(start).line }, source };
  };

  skipWs();
  if (i < n && src[i] !== '@') {
    fail('text before the first declaration (expected "@")', i);
    resync();
  }
  while (i < n) {
    budget.tick('soplang.wire');
    if (src[i] !== '@') { resync(); continue; }
    const w = readWire();
    if (w) wires.push(w); else resync();
  }
  return { wires, errors };
}

/** Parse and throw SopSyntaxError if there is any error. */
export function parseOrThrow(text, opts) {
  const { wires, errors } = parse(text, opts);
  if (errors.length) throw new SopSyntaxError(errors);
  return wires;
}

/** Serialize a value object back to SOP text. */
export function formatValue(value) {
  if (value.kind === 'string') return JSON.stringify(value.v);
  if (value.kind === 'ref') return '$' + value.v;
  if (value.kind === 'var') return '?' + value.v;
  return value.v;
}

/**
 * Serialize wires. With `canonical`, entries are sorted by key (stable for repeated keys).
 * Blocks are separated by a blank line; output ends with a newline.
 */
export function serialize(wires, { canonical = false } = {}) {
  const blocks = wires.map((w) => {
    let entries = w.entries;
    if (canonical) {
      entries = entries.map((e, idx) => ({ e, idx }))
        .sort((a, b) => (a.e.key < b.e.key ? -1 : a.e.key > b.e.key ? 1 : a.idx - b.idx))
        .map((x) => x.e);
    }
    return [`@${w.id} ${w.type}`, ...entries.map((e) => `    ${e.key}=${formatValue(e.value)}`)].join('\n');
  });
  return blocks.length ? blocks.join('\n\n') + '\n' : '';
}

/** First value of `key` in a wire, or undefined. */
export function get(wire, key) {
  for (const e of wire.entries) if (e.key === key) return e.value;
  return undefined;
}

/** All values of `key` in a wire, in order. */
export function getAll(wire, key) {
  return wire.entries.filter((e) => e.key === key).map((e) => e.value);
}

/** Convenience: first value's text (`v`) or undefined. */
export function getText(wire, key) {
  return get(wire, key)?.v;
}
