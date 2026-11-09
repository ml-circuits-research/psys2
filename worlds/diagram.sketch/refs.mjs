// SPDX-License-Identifier: AGPL-3.0-only
// Reference layer of diagram.sketch (DIAG3, spec 14): turns what a person says about arrows, short ids and layouts into the forms the source engine's
// rules reader understands. Browser-safe, no imports. Pure functions of (text, state):
//   fixTypos      "lable arraw" -> "label arrow", "reactanle1" -> "rectangle1" (the known words and the names on the canvas)
//   rewriteRefs   "a1", "the previous link", "the arrow labeled uses", "link between c1 and r1" -> "the arrow from c1 to r1"
//   rewriteLayout "change the layout to a column", "switch to a grid" -> "arrange everything in a column"
// The engine reads "the arrow from A to B" (from=, to=) for every edge operation (label, set style / colour / arrowhead, resize, reverse, disconnect).

const EDGE_NOUN = '(?:arrow|link|connection|line|edge|connector)';
const KNOWN = ['arrow', 'arrows', 'label', 'labels', 'labeled', 'labelled', 'connection', 'connections', 'connect', 'connected', 'connecting', 'link', 'links', 'edge', 'edges', 'connector',
  'thicker', 'thinner', 'dashed', 'dotted', 'layout', 'diagram', 'diagrams', 'shape', 'shapes', 'rectangle', 'rectangles', 'circle', 'circles', 'square', 'squares', 'triangle', 'triangles',
  'diamond', 'diamonds', 'ellipse', 'ellipses', 'hexagon', 'hexagons', 'between', 'previous', 'bigger', 'smaller', 'column', 'columns', 'arrange', 'delete', 'remove', 'reverse', 'highlight',
  'flowchart', 'pyramid', 'funnel', 'timeline', 'hierarchy', 'organization', 'cycle', 'process', 'radial', 'layers', 'tidy', 'untangle', 'straighten', 'arrowhead', 'arrowheads', 'recolor', 'recolour'];
const EXPLICIT = { liek: 'like', lable: 'label', lables: 'labels', labal: 'label', arraw: 'arrow', arow: 'arrow', aarow: 'arrow', arrwo: 'arrow', arrows: 'arrows', conection: 'connection', conncetion: 'connection',
  conection2: 'connection', conect: 'connect', conenct: 'connect', linke: 'link', linc: 'link', diagarm: 'diagram', digram: 'diagram', diagramm: 'diagram', thiker: 'thicker', thicer: 'thicker', thiner: 'thinner',
  dahsed: 'dashed', dashd: 'dashed', doted: 'dotted', layuot: 'layout', laout: 'layout', colum: 'column', colomn: 'column' };
const KIND_WORDS = ['circle', 'rectangle', 'square', 'diamond', 'ellipse', 'triangle', 'hexagon', 'star', 'text', 'box', 'rect', 'oval', 'rhombus'];
const LAYOUTS = ['row', 'column', 'grid', 'circle', 'tree', 'layers', 'radial', 'line', 'ring', 'pyramid', 'hierarchy', 'star', 'stack'];

/** Damerau-Levenshtein distance (adjacent transpositions count one). */
export function dist(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
/** Applies fn to the unquoted pieces of a sentence only (quoted text is the person's own words). */
export function mapUnquoted(text, fn) {
  return String(text).split(/("[^"]*"|“[^”]*”)/).map((p, i) => (i % 2 ? p : fn(p))).join('');
}

/** Corrects typos of the edge and diagram words and of names on the canvas. `names` = every token that names a shape (names, ids, long aliases). */
export function fixTypos(text, names = []) {
  const known = new Set(names.map((x) => String(x).toLowerCase()));
  const nameList = [...known];
  return mapUnquoted(text, (piece) => piece.replace(/[A-Za-z][A-Za-z0-9]*/g, (tok) => {
    const l = tok.toLowerCase();
    if (known.has(l)) return tok;
    const num = /^([a-z]+)(\d+)$/.exec(l);
    if (num) {   // an unknown name with a number: the nearest name or alias with the same number
      if (num[1].length < 4) return tok;
      let best = null, bd = 99;
      for (const k of nameList) { const m = /^([a-z]+)(\d+)$/.exec(k); if (!m || m[2] !== num[2] || !KIND_WORDS.includes(m[1])) continue;   // only the long aliases (circle1, rectangle2): never another name the person gave
        const dd = dist(num[1], m[1]); if (dd < bd) { bd = dd; best = k; } }
      return best && bd <= (num[1].length >= 8 ? 2 : 1) ? best : tok;
    }
    if (/\d/.test(l)) return tok;
    if (EXPLICIT[l] !== undefined && EXPLICIT[l] !== l) return tok === l ? EXPLICIT[l] : EXPLICIT[l];
    if (KNOWN.includes(l) || l.length < 5) return tok;
    if (tok[0] !== tok[0].toLowerCase() && piece.indexOf(tok) > 0) return tok;   // a capitalised word inside a sentence is a name
    const lim = 1;
    let best = null, bd = 99;
    for (const k of KNOWN) { if (Math.abs(k.length - l.length) > lim) continue; const dd = dist(l, k); if (dd < bd) { bd = dd; best = k; } }
    return best && bd <= lim ? best : tok;
  }));
}

const edgeEnds = (e) => `the arrow from ${e.from} to ${e.to}`;
const verbs = '(?:label|caption|name|title|tag|delete|remove|erase|reverse|flip|select|highlight|pick|choose|recolou?r|colou?r|paint|make|turn|change|set|give|thicken|thin|dash|dot|straighten|swap)';

/** Rewrites every way of pointing at an arrow into "the arrow from X to Y". `s` = { edges, shapes }. */
export function rewriteRefs(text, s) {
  const edges = s.edges ?? [];
  if (!edges.length && !new RegExp(`\\b${EDGE_NOUN}\\b`, 'i').test(text)) return text;
  const byId = (id) => edges.find((e) => e.id.toLowerCase() === id.toLowerCase());
  const last = edges[edges.length - 1];
  return mapUnquoted(text, (p) => {
    // 1. ids: "arrow a1", "the a1 arrow", "a1"
    p = p.replace(new RegExp(`\\b(?:the\\s+)?${EDGE_NOUN}\\s+(a\\d+)\\b|\\b(?:the\\s+)?(a\\d+)\\s+${EDGE_NOUN}\\b|\\b(a\\d+)\\b`, 'gi'), (m, x, y, z) => { const e = byId(x ?? y ?? z); return e ? edgeEnds(e) : m; });
    // 2. by label: "the arrow labeled uses", "the arrow called uses"
    p = p.replace(new RegExp(`\\b(?:the\\s+)?${EDGE_NOUN}\\s+(?:labell?ed|called|named|saying|that\\s+says|with\\s+the\\s+(?:label|text))\\s+([\\w-]+(?:\\s+[\\w-]+)?)`, 'gi'), (m, lab) => {
      const words = lab.split(/\s+/), L = (x) => String(x).toLowerCase();
      for (const n of [words.length, 1]) { const q = L(words.slice(0, n).join(' ')); const e = edges.find((x) => x.label && L(x.label) === q); if (e) return edgeEnds(e) + (n < words.length ? ` ${words.slice(n).join(' ')}` : ''); }
      return m;
    });
    // 3. with ends: "the link between A and B" -> "the arrow between A and B"
    p = p.replace(new RegExp(`\\b(?:(the|that|this|an?)\\s+)?(${EDGE_NOUN})(s?)\\s+(between|from|connecting)\\b`, 'gi'), (m, art, noun, pl, w) => (art && /^an?$/i.test(art)) || (!art && /^line$/i.test(noun)) ? m : `${art && !/^an?$/i.test(art) ? art : pl ? 'the' : 'the'} arrow${pl} ${/connecting/i.test(w) ? 'between' : w}`);
    // 4. recency: "the previous / last / that link", a bare "link" after a verb, "the arrow" with no ends
    if (last) {
      const rec = '(?:previous|last|latest|most\\s+recent|newest|prior|current|recent|final)';
      p = p.replace(new RegExp(`\\b(?:the|that|this|my|our)?\\s*${rec}\\s+${EDGE_NOUN}\\b(?!\\s+(?:between|from|labell?ed))`, 'gi'), (m) => ` ${edgeEnds(last)}`);
      p = p.replace(new RegExp(`\\b(${verbs})\\s+(?:(?:the|that|this)\\s+)?${EDGE_NOUN}\\b(?!s)(?!\\s+(?:between|from|labell?ed|called|named|at|of|with))`, 'gi'), (m, v) => `${v} ${edgeEnds(last)}`);
      p = p.replace(new RegExp(`\\b(that|this)\\s+${EDGE_NOUN}\\b(?!s)(?!\\s+(?:between|from))`, 'gi'), () => edgeEnds(last));
    }
    return p.replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
  });
}

/** "change the layout to a column", "switch to a grid", "use a circle layout" -> "arrange everything in a column". */
export function rewriteLayout(text) {
  const L = `(?:${LAYOUTS.join('|')})`;
  let t = String(text).trim().replace(/[.!?]+$/, '');
  let m = new RegExp(`^(?:please\\s+)?(?:can you\\s+|could you\\s+)?(?:change|switch|set|make|turn|convert|put|use)\\s+(?:the\\s+|this\\s+|my\\s+)?(?:diagram\\s+|whole\\s+)?(?:layout|arrangement|diagram)\\s+(?:of\\s+(?:the\\s+)?(?:diagram|shapes|everything|them)\\s+)?(?:to|into|as|a|an)\\s+(?:an?\\s+|the\\s+)?(${L})(?:\\s+layout|\\s+arrangement|\\s+shape)?(?:\\s+please)?$`, 'i').exec(t);
  if (!m) m = new RegExp(`^(?:please\\s+)?(?:switch|change|go|move)\\s+to\\s+(?:an?\\s+|the\\s+)?(${L})(?:\\s+layout|\\s+arrangement)?(?:\\s+please)?$`, 'i').exec(t);
  if (!m) m = new RegExp(`^(?:please\\s+)?(?:use|try)\\s+(?:an?\\s+|the\\s+)?(${L})\\s+(?:layout|arrangement)$`, 'i').exec(t);
  if (!m) return text;
  const l = m[1].toLowerCase();
  return `arrange everything in a ${l === 'hierarchy' ? 'tree' : l === 'ring' ? 'circle' : l === 'stack' ? 'column' : l}`;
}

/** Small rewrites that make the engine's reader read what it otherwise misses: "add to the diagram a tree like shape", "flowchart", "space them out", "the last two shapes". */
export function rewriteMisc(text, s = {}) {
  return mapUnquoted(text, (p) => {
    p = p.replace(/^(\s*(?:please\s+)?(?:add|draw|create|make|put|insert|build|place)\b.*?)\s+(?:to|into|in|on)\s+(?:the|this|my|our)\s+(?:diagram|drawing|canvas|sketch)\b/i, '$1');
    p = p.replace(/\bflow[\s-]?chart\b|\bflow\s+diagram\b/gi, 'process diagram');
    const items = (s.shapes ?? []).filter((x) => !x.layer && x.shape !== 'text' || (x.shape === 'text' && !x.layer)).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (items.length >= 2) {
      const [a, b] = items.slice(-2);
      p = p.replace(/\b(?:the\s+)?(?:last|latest|previous|final)\s+two\s+(?:shapes|elements|things|boxes|nodes|items|circles|squares|rectangles|ones)\b/gi, `${a.name} and ${b.name}`);
    }
    // "both", "both of them", "the two", "these two": the shapes made or named last
    const last = (s.last ?? []).length >= 2 ? s.last.slice(-2) : items.slice(-2).map((x) => x.name);
    if (last.length === 2) p = p.replace(/\b(?:both(?:\s+of\s+them)?|the\s+two|these\s+two|those\s+two|the\s+2)\b(?!\s+(?:the\s+)?[a-z]+s\b)/gi, `${last[0]} and ${last[1]}`);
    return p;
  });
}
