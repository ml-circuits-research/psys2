// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Static loop scanner behind tests/loop-guard.test.mjs (spec 06 "Compute budgets").
 * A loop is *guarded* when its body calls `budget.tick(`, or when a `// bounded: <reason>` comment sits on its line, the line above, or inside its body.
 * Checked constructs:
 *   - every `while`, `do ... while` and `for (;;)`;
 *   - a C-style `for` unless it is a plain counting loop (`i < bound`, `i++` / `i--` / `i += k`, the body does not assign `i` nor grow the bounded collection);
 *   - `for (x of|in C)` when the body grows C (`C.push/add/unshift/splice/set(`): a worklist;
 *   - every function that calls itself (declarations, `const f = ...`, and class methods through `this.f(`).
 * `scan(text)` returns [{ line, kind, snippet }] for the unguarded ones.
 */

/** Source with strings, template literals, regex literals and comments blanked (same length, newlines kept), and the comments apart: [{ line, text }]. */
export function strip(src) {
  let out = '';
  const comments = [];
  let i = 0, line = 1;
  const n = src.length;
  let last = '';   // last significant char, to tell a regex from a division
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const tplStack = [];
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { out += c; line++; i++; continue; }
    if (c === '/' && d === '/') {
      let j = i; while (j < n && src[j] !== '\n') j++;
      comments.push({ line, text: src.slice(i, j) }); out += blank(src.slice(i, j)); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      const text = src.slice(i, j);
      comments.push({ line, text, endLine: line + (text.match(/\n/g)?.length ?? 0) });
      out += blank(text); line += text.match(/\n/g)?.length ?? 0; i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      out += c + blank(src.slice(i + 1, j)) + c; i = j + 1; last = c; continue;
    }
    if (c === '`') {
      // template literal: blank the text, keep `${ ... }` code
      let j = i + 1; out += '`';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { out += '  '; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          let depth = 1, k = j + 2;
          while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
          out += '${' + blank(src.slice(j + 2, k - 1)) + '}'; line += src.slice(j, k).match(/\n/g)?.length ?? 0; j = k; continue;
        }
        if (src[j] === '\n') line++;
        out += src[j] === '\n' ? '\n' : ' '; j++;
      }
      out += '`'; i = j + 1; last = '`'; continue;
    }
    if (c === '/' && (last === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(last) || /(?:^|[^\w$])(?:return|typeof|case|in|of)$/.test(out.slice(-8).replace(/\s+$/, '') ))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n' && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++; while (/[a-z]/.test(src[j] ?? '')) j++;
      out += '/' + blank(src.slice(i + 1, j - 1)) + '/'; i = j; last = '/'; continue;
    }
    out += c; if (!/\s/.test(c)) last = c; i++;
  }
  return { code: out, comments };
}

const matchClose = (s, i, open, close) => {   // i at the opening char; returns the index of its closing char
  let depth = 0;
  for (let k = i; k < s.length; k++) { if (s[k] === open) depth++; else if (s[k] === close && --depth === 0) return k; }
  return s.length - 1;
};
const lineOf = (s, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (s.charCodeAt(k) === 10) l++; return l; };
/** End index (exclusive) of the statement starting at `i` (a block or a single statement ending at `;` at depth 0). */
const stmtEnd = (s, i) => {
  while (/\s/.test(s[i])) i++;
  if (s[i] === '{') return matchClose(s, i, '{', '}') + 1;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (--depth < 0) return k; }
    else if (c === ';' && depth === 0) return k + 1;
    else if (c === '\n' && depth === 0 && /\b(?:for|while|if)\b/.test(s.slice(i, k)) === false && /[})\]\w'"`]\s*$/.test(s.slice(i, k)) && !/^\s*[.?:+\-*/&|,]/.test(s.slice(k + 1, k + 40)) && !/[,+\-*/&|?:=(]\s*$/.test(s.slice(i, k))) return k;
  }
  return s.length;
};

const SIMPLE_STEP = /^\s*(?:\+\+\s*(\w+)|(\w+)\s*\+\+|--\s*(\w+)|(\w+)\s*--|(\w+)\s*(?:\+|-)=\s*[\w.]+)\s*$/;

export function scan(src) {
  const { code, comments } = strip(src);
  const bounded = comments.filter((c) => /bounded:/.test(c.text));
  const hasBoundedBetween = (l1, l2) => bounded.some((c) => c.line >= l1 && c.line <= l2);   // callers pass the loop line - 1 .. its first body line
  const found = [];
  const snippetAt = (idx) => src.split('\n')[lineOf(code, idx) - 1].trim().slice(0, 110);
  const report = (idx, kind) => found.push({ line: lineOf(code, idx), kind, snippet: snippetAt(idx) });
  /** Guarded: tick in [from,to) of the code, or a bounded comment on line-1 .. last body line. */
  const guarded = (idx, bodyFrom, bodyTo) => {
    if (/\bbudget\.tick\(/.test(code.slice(bodyFrom, bodyTo))) return true;
    return hasBoundedBetween(lineOf(code, idx) - 1, Math.min(lineOf(code, bodyTo), lineOf(code, bodyFrom) + 1));
  };

  // while / do / for
  for (const m of code.matchAll(/(?<![\w$.])(while|do|for)\b\s*(?=[({]|\w)/g)) {
    const kw = m[1], at = m.index;
    if (kw === 'do') {
      const after = at + 2;
      if (!/^\s*[{\w([]/.test(code.slice(after, after + 4)) ) continue;
      const end = stmtEnd(code, after);
      if (!guarded(at, after, end + 80)) report(at, 'do-while');
      continue;
    }
    let p = at + kw.length; while (/\s/.test(code[p])) p++;
    if (kw === 'for' && code.slice(p, p + 5) === 'await') { p += 5; while (/\s/.test(code[p])) p++; }
    if (code[p] !== '(') continue;
    const close = matchClose(code, p, '(', ')');
    const head = code.slice(p + 1, close);
    const end = stmtEnd(code, close + 1);
    const body = code.slice(close + 1, end);
    if (kw === 'while') {
      if (/^\s*;/.test(body) && /\}\s*$/.test(code.slice(Math.max(0, at - 5), at))) continue;   // the tail of a do-while
      if (!guarded(at, close + 1, end)) report(at, 'while');
      continue;
    }
    // for
    const parts = head.split(';');
    if (parts.length === 3) {
      const [init, cond, step] = parts.map((x) => x.trim());
      let simple = false;
      const sm = SIMPLE_STEP.exec(step);
      const v = sm && (sm[1] || sm[2] || sm[3] || sm[4] || sm[5]);
      if (v && init && cond && new RegExp(`\\b${v}\\b`).test(cond) && /[<>]=?|!==?/.test(cond)) {
        const assigns = new RegExp(`(?<![\\w$.])${v}\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*${v}\\b`).test(body);
        const bound = /[<>]=?\s*([\w$.]+)\.length\b/.exec(cond)?.[1] ?? /\b([\w$.]+)\.length\s*[<>]/.exec(cond)?.[1];
        const grows = bound && new RegExp(`(?<![\\w$])${bound.replace(/[.$]/g, '\\$&')}\\.(?:push|unshift|splice|add|set)\\(`).test(body);
        simple = !assigns && !grows;
      }
      if (!cond) simple = false;
      if (!simple && !guarded(at, close + 1, end)) report(at, cond ? 'for(;;) custom' : 'for(;;)');
    } else {
      const m2 = /\b(?:of|in)\b\s*([\w$.]+)\s*$/.exec(head);
      if (m2) {
        const coll = m2[1].replace(/[.$]/g, '\\$&');
        if (new RegExp(`(?<![\\w$.])${coll}\\.(?:push|unshift|splice|add|set)\\(`).test(body) && !guarded(at, close + 1, end)) report(at, 'for-of worklist');
      }
    }
  }

  // self-recursive functions
  const fnDefs = [];
  for (const m of code.matchAll(/(?<![\w$.])function\s*\*?\s*([\w$]+)\s*\(/g)) {
    const open = code.indexOf('{', matchClose(code, m.index + m[0].length - 1, '(', ')'));
    fnDefs.push({ name: m[1], at: m.index, from: open, to: matchClose(code, open, '{', '}') });
  }
  for (const m of code.matchAll(/(?<![\w$.])(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function\b[^(]*\([^)]*\)\s*\{|\([^()]*(?:\([^()]*\)[^()]*)*\)\s*=>|[\w$]+\s*=>)/g)) {
    let from = m.index + m[0].length;
    if (!m[0].endsWith('{')) { while (/\s/.test(code[from])) from++; }
    const isBlock = m[0].endsWith('{') || code[from] === '{';
    const open = m[0].endsWith('{') ? from - 1 : from;
    const to = isBlock ? matchClose(code, open, '{', '}') : stmtEnd(code, from);
    fnDefs.push({ name: m[1], at: m.index, from, to });
  }
  for (const m of code.matchAll(/^[ \t]+(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?\*?([\w$]+)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\{/gm)) {
    if (/^(?:if|for|while|switch|catch|function|return)$/.test(m[1])) continue;
    const open = m.index + m[0].length - 1;
    fnDefs.push({ name: m[1], at: m.index, from: open, to: matchClose(code, open, '{', '}'), method: true });
  }
  const seen = new Set();
  for (const f of fnDefs) {
    const body = code.slice(f.from, f.to);
    const call = f.method ? new RegExp(`\\bthis\\.${f.name.replace(/\$/g, '\\$')}\\s*\\(`) : new RegExp(`(?<![\\w$.])${f.name.replace(/\$/g, '\\$')}\\s*\\(`);
    // the name inside nested function definitions of the same name does not count; good enough
    if (!call.test(body)) continue;
    const key = `${lineOf(code, f.at)}:${f.name}`;
    if (seen.has(key)) continue; seen.add(key);
    if (/\bbudget\.tick\(/.test(body) || hasBoundedBetween(lineOf(code, f.at) - 1, Math.min(lineOf(code, f.to), lineOf(code, f.from) + 1))) continue;
    found.push({ line: lineOf(code, f.at), kind: `recursion ${f.name}`, snippet: src.split('\n')[lineOf(code, f.at) - 1].trim().slice(0, 110) });
  }
  return found.sort((a, b) => a.line - b.line);
}
