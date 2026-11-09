// Canonical example sentences (RD6). A canonical example is a clean, natural sentence a person would really say: it is what "help",
// "what can I say here?" and "Did you mean ...?" offer. Pattern examples that are fragments ("Hair colors list?"), slang or
// typos ("Bolt is ur name.") stay in the world as training and test material but are never shown to people.
//
// Marking in a world (patterns.sop):
//   core.pattern   canonical=true               every example= line of the pattern is canonical
//                  canonical="Some sentence."   this sentence is canonical (it is also an example of the pattern)
//   core.shape     example="Some sentence."     the explicit examples of a request shape are canonical (spec 03, request-shape kernel)
// `isCanonicalSentence` is the quality gate the marking script and the tests apply; the loader trusts the marks.
// Browser-safe, no imports.

const SLANG = new Set(['ur', 'u', 'r', 'pls', 'plz', 'wat', 'gonna', 'wanna', 'gimme', 'lemme', 'im', 'dont', 'cant', 'thx', 'thnks', 'ya', 'yo', 'ok', 'idk', 'gg', 'um', 'uh', 'hm',
  'ah', 'oh', 'ugh', 'hey', 'fyi', 'tldr', 'th', 'st', 'nd', 'rd', 'nxt', 'prev', 'dupe', 'rm', 'whr', 'wher', 'wheres', 'whats', 'whos', 'thats', 'ive', 'ill', 'havent', 'lvl', 'hw', 'nf',
  'ditch', 'flush', 'scrap', 'crank', 'blow', 'bump', 'nudge', 'oops', 'yay', 'nope', 'nop', 'altogether', 'gotta', 'dumb', 'bolden', 'hilight', 'wordcount', 'qxd', 'exd', 'mov', 'bb']);
const STARTERS = new Set(('what how which who whom whose where why when is are am was were can could do does did would will may might shall should has have had there this that these those it ' +
  'i my we you your the a an if please let lets let\'s what\'s who\'s where\'s how\'s ' +
  'tell show make play add go give take turn list put read change count delete try remove undo redo select move clear start set zoom draw copy cut paste stop describe check switch get open ' +
  'mark highlight pay use say download call remember explain sort underline italicize embolden rename save export pick write scroll summarize look find display increase decrease raise ' +
  'lower reset restart resign create compare search close keep speak sketch paint fill erase rotate flip duplicate insert join split replace align justify promote castle capture drop ' +
  'enlarge shrink wear hide swap spread divide multiply subtract mute unmute loop pause continue compose transpose sing hit press choose forget introduce teach ask repeat help guess ' +
  'run begin quit stack label title use name wipe jump undo reload refresh load analyze extract narrate suggest recommend evaluate assess offer concede unhighlight uncheck check tick ' +
  'surprise thank thanks goodbye giving confirm black follow open import print share send stick pin deselect finish simplify rewrite fix locate measure magnify wait come hear listen').split(/\s+/));
const SECOND = new Set(['is', 'are', 'was', 'were', 'has', 'have', 'had', 'got', 'can', 'could', 'will', 'would', 'does', 'did', 'do', 'am', 'needs', 'wants', 'likes', 'lost', 'gave', 'bought', 'ate', 'sold', 'spent', 'found', 'paid', 'saved', 'picked', 'put']);

/** True when `s` is a clean natural sentence: capitalised, punctuated, 2-14 words, no slang or typos, and it starts like a sentence. */
export function isCanonicalSentence(s) {
  const t = String(s ?? '').trim();
  if (!/^[A-Z]/.test(t) || !/[.?!]$/.test(t)) return false;
  const words = t.replace(/[.?!,;:"]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 14) return false;
  if (words.length === 1 && !/^(redo|undo|goodbye|thanks|hello|help)$/i.test(words[0])) return false;
  const low = words.map((w) => w.toLowerCase().replace(/^'+|'+$/g, ''));
  if (low.some((w) => SLANG.has(w))) return false;
  if (/[a-z]{2,}[A-Z]|\s{2,}|\.\.|\?\?|!!|[<>_#]/.test(t)) return false;
  return STARTERS.has(low[0]) || SECOND.has(low[1]);
}

/** Canonical examples of a pattern as the interpreter exposes it ({ examples, canonical }). */
export const canonicalOf = (p) => (Array.isArray(p?.canonical) ? p.canonical : []);

/** The operation a pattern stands for: its action, or the wire type (with `type`/`seek` for questions). Help covers every operation with a canonical example. */
export function operationKey(p) {
  const e = String(p?.emit ?? '');
  const a = /\baction=([^\s"]+)/.exec(e)?.[1];
  if (a) return a;
  const t = /@\{_\}\s+(\S+)/.exec(e)?.[1] ?? /@\S+\s+(\S+)/.exec(e)?.[1] ?? e.slice(0, 40);
  const type = /\btype=([^\s"]+)/.exec(e)?.[1], seek = /\bseek=([^\s"{]+)/.exec(e)?.[1];
  return type ? `${t}:${type}${seek ? `/${seek.replace(/^can_.*/, 'can')}` : ''}` : t;
}
