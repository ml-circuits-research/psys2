// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Static loop scanner behind tests/loop-guard.test.mjs (spec 06 "Compute budgets").
 * A loop is *guarded* when its body calls `budget.tick(` (or it is verifiably finite, see below). A `// bounded: <reason>` comment is a claim, not a guard:
 * it excuses nothing (the freeze of 2026-11-10 sat behind a false one). `scan(text, { strict: false })` restores the old behaviour for tooling only.
 * Checked constructs:
 *   - every `while`, `do ... while` and `for (;;)`;
 *   - a C-style `for` unless it is a plain counting loop (`i < bound`, `i++` / `i--` / `i += k`, the body does not assign `i` nor grow the bounded collection);
 *   - `for (x of|in C)` when the body grows C (`C.push/add/unshift/splice/set(`): a worklist;
 *   - every function that calls itself (declarations, `const f = ...`, and class methods through `this.f(`).
 * Each report carries `comment`: the line of a `// bounded:` comment near the loop (scripts/audit-bounded.mjs lists them).
 * A loop whose body awaits (`await` every pass) yields to the event loop and cannot freeze the thread: not checked. A recursion whose self-calls are all inside
 * callbacks that run later (setTimeout, addEventListener, `on...` handlers, promise callbacks) is not synchronous: not checked. A recursion with a depth cap
 * (`depth > 7` ... self-calls pass `depth + 1`) is accepted.
 * Regex loops (`while ((m = re.exec(s)))`, also do/for) are never excused by a tick or a comment. They are accepted only when
 *   (a) the regex provably cannot match the empty string (`minLen`, conservative: every top-level alternative must consume at least one character), or
 *   (b) the loop body advances `lastIndex` (`re.lastIndex++`, `+= n`, `= ... + 1`) so an empty match moves on;
 * everything else must be converted to `matchAll` / `replace`. A non-global regex driving a `while` is an endless loop and is refused. Also refused:
 * `matchAll` / `replaceAll` with a regex that is not global (they throw).
 * `scan(text)` returns [{ line, kind, snippet, at, bodyFrom, bodyTo, comment }] for the unguarded ones.
 */

/** Minimum number of characters a regex source can match (conservative: unknown constructs count as 0). */
export function minLen(src) {
  const alts = splitAlts(src);
  return Math.min(...alts.map(minLenAlt));
}
function skipClass(s, i) {   // i at '[': returns the index after the closing ']'
  i++; if (s[i] === '^') i++;
  for (; i < s.length; i++) { if (s[i] === '\\') i++; else if (s[i] === ']') return i + 1; }
  return s.length;
}
function skipGroup(s, i) {   // i at '(': returns the index of the matching ')'
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') k++;
    else if (c === '[') k = skipClass(s, k) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return k;
  }
  return s.length;
}
function splitAlts(s) {
  const out = []; let from = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') k++;
    else if (c === '[') k = skipClass(s, k) - 1;
    else if (c === '(') k = skipGroup(s, k);
    else if (c === '|') { out.push(s.slice(from, k)); from = k + 1; }
  }
  out.push(s.slice(from));
  return out;
}
function minLenAlt(s) {
  let i = 0, total = 0;
  while (i < s.length) {
    const c = s[i];
    let width = 1;
    if (c === '\\') {
      const e = s[i + 1];
      if (e === 'b' || e === 'B' || e === 'k' || (e >= '1' && e <= '9')) width = 0;
      i += 2;
      if ((e === 'p' || e === 'P') && s[i] === '{') i = s.indexOf('}', i) + 1 || s.length;
      else if (e === 'u' && s[i] === '{') i = s.indexOf('}', i) + 1 || s.length;
      else if (e === 'k' && s[i] === '<') i = s.indexOf('>', i) + 1 || s.length;
    } else if (c === '[') { i = skipClass(s, i); }
    else if (c === '(') {
      const close = skipGroup(s, i);
      let inner = s.slice(i + 1, close);
      if (/^\?(?:=|!|<=|<!)/.test(inner)) width = 0;
      else {
        inner = inner.replace(/^\?(?:<[^>]+>|[a-z-]*:)/, '');
        width = Math.min(...splitAlts(inner).map(minLenAlt));
      }
      i = close + 1;
    } else if (c === '^' || c === '$') { width = 0; i++; }
    else i++;
    // quantifier
    const q = s[i];
    if (q === '*' || q === '?') { width = 0; i++; }
    else if (q === '+') i++;
    else if (q === '{') {
      const m = /^\{(\d+)(?:,\d*)?\}/.exec(s.slice(i));
      if (m) { width *= Number(m[1]); i += m[0].length; }
    }
    if (s[i] === '?' && (q === '*' || q === '+' || q === '?' || q === '}')) i++;   // lazy
    total += width;
  }
  return total;
}


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
      const body = src.slice(i + 1, j); j++;
      let f = j; while (/[a-z]/.test(src[f] ?? '')) f++;
      out += '/' + blank(body) + '/' + src.slice(j, f); i = f; last = '/'; continue;   // the flags stay (the regex checks read them)
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

export function scan(src, { strict = true } = {}) {
  const { code, comments } = strip(src);
  const bounded = comments.filter((c) => /bounded:/.test(c.text));
  const boundedBetween = (l1, l2) => bounded.find((c) => c.line >= l1 && c.line <= l2);   // callers pass the loop line - 1 .. its first body line
  const hasBoundedBetween = (l1, l2) => !strict && !!boundedBetween(l1, l2);
  const found = [];
  const snippetAt = (idx) => src.split('\n')[lineOf(code, idx) - 1].trim().slice(0, 110);
  const report = (idx, kind, bodyFrom, bodyTo) => found.push({
    line: lineOf(code, idx), kind, snippet: snippetAt(idx), at: idx, bodyFrom, bodyTo,
    comment: bodyTo === undefined ? undefined : boundedBetween(lineOf(code, idx) - 1, Math.min(lineOf(code, bodyTo), lineOf(code, bodyFrom) + 1))?.line,
  });
  /** Guarded: tick in [from,to) of the code, or a bounded comment on line-1 .. last body line. */
  const guarded = (idx, bodyFrom, bodyTo) => {
    if (/\bbudget\.tick\(/.test(code.slice(bodyFrom, bodyTo))) return true;
    if (/\bawait\b/.test(code.slice(bodyFrom, bodyTo))) return true;   // yields to the event loop every pass: it cannot freeze the thread
    return hasBoundedBetween(lineOf(code, idx) - 1, Math.min(lineOf(code, bodyTo), lineOf(code, bodyFrom) + 1));
  };

  // ---- regex loops and matchAll
  /** The regex literal (source, flags) that `recv` names: an inline literal ending at `litEnd`, or `const NAME = /.../flags` in this file; null when unknown. */
  const litAt = (from) => {   // `from` at the opening '/' of a (blanked) literal in code
    const e = code.indexOf('/', from + 1);
    if (e < 0) return null;
    let f = e + 1; while (/[a-z]/.test(code[f] ?? '')) f++;
    return { source: src.slice(from + 1, e), flags: code.slice(e + 1, f), end: f };
  };
  const resolveName = (name, before = code.length) => {   // the closest definition above the use
    const esc = name.replace(/[.$]/g, '\\$&');
    const defs = [...code.matchAll(new RegExp(`(?<![\\w$.])(?:(?:const|let|var)\\s+)?${esc}\\s*=\\s*(?=/[^/*])`, 'g'))].filter((m) => m.index < before);
    const m = defs.at(-1);
    return m ? litAt(m.index + m[0].length) : null;
  };
  const matchWhileHead = (doEnd) => {   // [open, close] of the `while (...)` that closes a do-loop whose body ends at doEnd
    const m = /^\s*while\s*\(/.exec(code.slice(doEnd, doEnd + 40));
    if (!m) return null;
    const open = doEnd + m[0].length - 1;
    return [open, matchClose(code, open, '(', ')')];
  };
  /** Regex loops: every \`X.exec(\` in the loop (head, body, or the while-head of a do-loop) needs a regex that cannot match the empty string or a body that advances lastIndex. */
  const execCheck = (at, from, to, head) => {
    const region = code.slice(from, to);
    const seenAt = new Set();
    for (const m of region.matchAll(/(?<![\w$])((?:[\w$]+\.)*[\w$]+|\/ *\/[a-z]*)\.exec\s*\(/g)) {
      const idx = from + m.index;
      if (seenAt.has(idx)) continue; seenAt.add(idx);
      const recv = m[1];
      const lit = recv.startsWith('/') ? litAt(idx) : resolveName(recv, idx);
      const inHead = head ? idx >= head[0] && idx <= head[1] : false;
      const advances = /\.lastIndex\s*(?:\+\+|\+=|=[^=][^;]*\+\s*1)/.test(code.slice(from, to));
      let why = null;
      if (!lit) why = 'regex not resolvable here';
      else if (!/[gy]/.test(lit.flags)) { if (inHead) why = 'non-global regex in a loop condition never advances'; }
      else if (minLen(lit.source) < 1) why = 'the regex can match the empty string';
      if (why && !(why !== 'non-global regex in a loop condition never advances' && advances)) report(idx, `exec loop: ${why}; use matchAll`);
    }
  };
  for (const m of code.matchAll(/\.(?:matchAll|replaceAll)\s*\(\s*(?=\/|[\w$])/g)) {
    const start = m.index + m[0].length;
    let lit = null;
    if (code[start] === '/') lit = litAt(start);
    else { const id = /^[\w$.]+/.exec(code.slice(start))[0]; if (/^[\w$.]+\s*[,)]/.test(code.slice(start, start + id.length + 3))) lit = resolveName(id, m.index); }
    if (lit && !lit.flags.includes('g')) report(m.index, `${/matchAll/.test(m[0]) ? 'matchAll' : 'replaceAll'} with a non-global regex throws`);
  }

  // while / do / for
  for (const m of code.matchAll(/(?<![\w$.])(while|do|for)\b\s*(?=[({]|\w)/g)) {
    const kw = m[1], at = m.index;
    if (kw === 'do') {
      const after = at + 2;
      if (!/^\s*[{\w([]/.test(code.slice(after, after + 4)) ) continue;
      const end = stmtEnd(code, after);
      execCheck(at, after, end, matchWhileHead(end));
      if (!guarded(at, after, end + 80)) report(at, 'do-while', after, end + 80);
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
      execCheck(at, p, end, [p, close]);
      if (!guarded(at, close + 1, end)) report(at, 'while', close + 1, end);
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
      if (!simple) execCheck(at, p, end, null);
      if (!simple && !guarded(at, close + 1, end)) report(at, cond ? 'for(;;) custom' : 'for(;;)', close + 1, end);
    } else {
      // for-of / for-in over a finite collection ends whatever exec() returns; only a worklist (below) can grow
      const m2 = /\b(?:of|in)\b\s*([\w$.]+)\s*$/.exec(head);
      if (m2) {
        const coll = m2[1].replace(/[.$]/g, '\\$&');
        if (new RegExp(`(?<![\\w$.])${coll}\\.(?:push|unshift|splice|add|set)\\(`).test(body) && !guarded(at, close + 1, end)) report(at, 'for-of worklist', close + 1, end);
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
  /** The function body without the callbacks that run later (timers, event handlers, promise callbacks): a call in there is not a synchronous recursion. */
  const syncPart = (body) => {
    const blank = (from, to) => { body = body.slice(0, from) + body.slice(from, to).replace(/[^\n]/g, ' ') + body.slice(to); };
    for (const m of body.matchAll(/(?:(?<![\w$])(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask|addEventListener)|\.(?:then|catch|finally))\s*\(/g)) {
      const open = m.index + m[0].length - 1;
      blank(open, matchClose(body, open, '(', ')') + 1);
    }
    for (const m of body.matchAll(/(?<![\w$])on[a-z]+\s*[:=]\s*(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>\s*/g)) {
      const at = m.index + m[0].length;
      blank(at, body[at] === '{' ? matchClose(body, at, '{', '}') + 1 : stmtEnd(body, at));
    }
    return body;
  };
  /** Recursion with a depth cap: the body returns when `depth > N` and every self-call passes `depth + 1`. */
  const depthCapped = (body, call) => {
    if (!/\b(?:depth|level)\s*(?:>=?)\s*\d+/.test(body)) return false;
    const re = new RegExp(call.source, 'g');
    for (const m of body.matchAll(re)) {
      const open = m.index + m[0].length - 1;
      if (!/\b(?:depth|level)\s*\+\s*1\b|\+\+\s*(?:depth|level)\b/.test(body.slice(open, matchClose(body, open, '(', ')')))) return false;
    }
    return true;
  };
  const seen = new Set();
  for (const f of fnDefs) {
    const body = syncPart(code.slice(f.from, f.to));
    const call = f.method ? new RegExp(`\\bthis\\.${f.name.replace(/\$/g, '\\$')}\\s*\\(`) : new RegExp(`(?<![\\w$.])${f.name.replace(/\$/g, '\\$')}\\s*\\(`);
    // the name inside nested function definitions of the same name does not count; good enough
    if (!call.test(body)) continue;
    const key = `${lineOf(code, f.at)}:${f.name}`;
    if (seen.has(key)) continue; seen.add(key);
    if (depthCapped(body, call)) continue;
    if (/\bbudget\.tick\(/.test(body) || hasBoundedBetween(lineOf(code, f.at) - 1, Math.min(lineOf(code, f.to), lineOf(code, f.from) + 1))) continue;
    found.push({ line: lineOf(code, f.at), kind: `recursion ${f.name}`, snippet: src.split('\n')[lineOf(code, f.at) - 1].trim().slice(0, 110), at: f.at, bodyFrom: f.from, bodyTo: f.to, comment: boundedBetween(lineOf(code, f.at) - 1, Math.min(lineOf(code, f.to), lineOf(code, f.from) + 1))?.line });
  }
  const uniq = found.filter((v, i) => found.findIndex((w) => w.line === v.line && w.kind === v.kind) === i);   // an exec inside nested loops is reported once
  return uniq.sort((a, b) => a.line - b.line);
}
