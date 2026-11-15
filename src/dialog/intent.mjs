// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE INTENT STEP (spec 03 section 7.9f; reviewer 2026-11-15 10:00 items 2, 4, 5): when the open world's reading of a turn is weak (a clause unread, a request it
 * could not carry out, nothing changed), propose what the user may mean and choose the most plausible reading. Nothing here is keyed to sentences:
 *
 *   candidates = the clause itself
 *              + the open world's acts for the kind of reading the words say (phrase groups `lang.intent.*` of worlds/lang.common: improve, arrange, a complaint that
 *                there is too much, a correction that puts a thing back, a pointing word, a kind of text, a bare noun)
 *              x the things now in the open world (names, groups of things) x the dialogue state (the previous turn's words, the last thing changed)
 *   each candidate is read by the open world dry (`understands`: points of trouble of its reading on a copy of the session), and the library's `choose` decides with
 *   the criteria of kind `intent` (data: INTENT_CRITERIA below, std.decide facts): reads, covers, fits the previous turn, cost.
 *
 * The step returns the English to carry out (clause by clause, the chosen readings) and what was assumed, which the reply says first; talk about the assistant gets
 * a calm reply and what the open tab can do, without any change. It runs only after a weak first reading and never keeps a candidate that reads worse than the clause.
 */
import { budget } from './budget.mjs';

/** The criteria of a choice of kind `intent` (std.decide facts: the library's `choose` reads them from a World). Lower is better unless dir=max. */
export const INTENT_CRITERIA = `
@std.decide.c.intent.1 std.decide.criterion of=intent n=1 name=reads measure=issues dir=min about="points of trouble of the open world's dry reading (unread 3, partial 2, refused 2, another world 2)"
@std.decide.c.intent.2 std.decide.criterion of=intent n=2 name=covers measure=uncovered dir=min about="content words of the clause the reading neither uses nor explains"
@std.decide.c.intent.3 std.decide.criterion of=intent n=3 name=previous measure=previous dir=max about="it names a thing of the previous turn or continues its act"
@std.decide.c.intent.4 std.decide.criterion of=intent n=4 name=cost measure=cost dir=min about="how far the reading is from the words said"
`;

const STOP = new Set('a an the of to in on at for with and or but is are was were be been it its this that these those there here i you he she we they me my your our his her their them us do does did not no yes so then too very more most some any all please just also what which who where how why when can could would should will shall may might must have has had am'.split(' '));
const words = (t) => String(t ?? '').toLowerCase().replace(/n't\b/g, ' not').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'s\b/g, ' is').match(/[a-z0-9]+/g) ?? [];
const has = (text, alts) => { const t = ` ${words(text).join(' ')} `; return alts.find((a) => t.includes(` ${a} `)) ?? null; };
const DIRECTION = /^(?:up|down|upwards|downwards|left|right|above|below|over|under|higher|lower|top|bottom|middle|centre|center|back|forward|further|more|less)$/;
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const plural = (n) => (/(?:s|sh|ch|x|z)$/.test(n) ? `${n}es` : /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : /fish$/.test(n) ? n : `${n}s`);

/** The clauses of an English message with the text between them (kept so that the message can be put back together). */
export function splitClauses(english) {
  const out = [];
  const re = /\s*(?:[,;]|(?<=[?!.]))\s+/g;
  let at = 0, m;
  while ((m = re.exec(english))) { out.push({ text: english.slice(at, m.index), sep: m[0] }); at = m.index + m[0].length; }
  out.push({ text: english.slice(at), sep: '' });
  return out.filter((c) => c.text.trim() || c.sep);
}

/** Is the first reading weak: some clause the open world did not read or could not do, or a request that changed nothing. */
export function weakReading(reply) {
  if (!reply || typeof reply !== 'object') return false;
  const st = reply.statuses ?? [];
  const en = String(reply.trace?.replyEnglish ?? '');
  if (/^(?:I did not understand|Nothing changed)/.test(en)) return true;
  return st.some((s) => s === 'unparsed' || s === 'missing' || s === 'unsupported');
}

/** The things of a world's state with a name (shapes, objects, markers ...): [{ name, kind }]. */
function thingsOf(state) {
  const out = [];
  for (const v of Object.values(state ?? {})) {
    if (!Array.isArray(v)) continue;
    for (const o of v) if (o && typeof o === 'object' && (o.thing || o.kind || o.shape || o.name)) out.push({ name: o.name ? String(o.name).replace(/_/g, ' ') : null, kind: String(o.thing ?? o.kind ?? o.shape ?? '').replace(/_/g, ' '), label: o.label ?? null });
  }
  return out;
}

/** The candidates of one clause: [{ text, via, cost, cue }] (`cue`: the words the kind of reading explains). */
function proposals(clause, { phrase, lang, state, previous, worldWords, known }) {
  const out = [];
  const add = (text, via, cost, cue = [], say = null) => { if (text && !out.some((c) => c.text === text)) out.push({ text, via, cost, cue, say }); };
  const ws = words(clause);
  const nouns = worldWords.nouns;
  // improve: "make the diagram more beautiful", "make it tidier"
  const imp = has(clause, phrase('lang.intent.improve'));
  if (imp) for (const n of nouns) { add(`improve the ${n}`, 'improve', 1, imp.split(' ')); add(`tidy the ${n}`, 'improve', 2, imp.split(' ')); }
  // arrange: a verb that means the arrange act, the rest kept ("sit the items like a hexagon" -> "arrange the items like a hexagon")
  const arr = has(clause, phrase('lang.intent.arrange'));
  if (arr && ` ${ws.join(' ')} `.startsWith(` ${arr} `)) add(` ${ws.join(' ')} `.replace(` ${arr} `, ' arrange ').trim(), 'arrange', 1, [arr]);   // the verb first: an imperative, not a word inside a sentence
  // a complaint that there is too much: about half of each group of the open world goes (groups of four or more, else of two or more)
  const over = has(clause, phrase('lang.intent.overdo'));
  if (over) {
    const groups = new Map();
    for (const t of thingsOf(state)) if (t.kind && !t.name) groups.set(t.kind, (groups.get(t.kind) ?? 0) + 1);
    for (const t of thingsOf(state)) if (t.kind && t.name && !groups.has(t.kind)) groups.set(`#${t.kind}`, (groups.get(`#${t.kind}`) ?? 0) + 1);
    const kinds = [...groups].filter(([k]) => !k.startsWith('#')), one = kinds.filter(([k]) => !k.includes(' '));
    // groups of four or more, else of two or more; a thing of one word first ("the fourth water lily and ..." is cut by the readers into clauses at the second noun)
    const pick = [one.filter(([, n]) => n >= 4), one.filter(([, n]) => n >= 2), kinds.filter(([, n]) => n >= 4), kinds.filter(([, n]) => n >= 2)].find((g) => g.length) ?? [];
    // one candidate per group; the groups the world reads are put together into one request (intentStep)
    // the things are named one by one by their place in the group (the world asks "which 2?" for a bare count: it never guesses, the step names them)
    // a thing of one word first: "the fourth water lily and ..." is cut by the readers into clauses at the second noun
    for (const [k, n] of pick.filter(([, n]) => n <= ORDINAL.length).sort((a, b) => (a[0].includes(' ') - b[0].includes(' ')) || b[1] - a[1]).slice(0, 4)) {   // the biggest group first: one group per turn, the user can say it again
      const m = Math.max(1, Math.floor(n / 2)), ones = Array.from({ length: m }, (_, i) => `the ${ORDINAL[n - m + i]} ${k}`);
      add(`remove ${ones.length > 1 ? `${ones.slice(0, -1).join(', ')} and ${ones.at(-1)}` : ones[0]}`, 'reduce', 2 + out.filter((c) => c.via === 'reduce').length, [...over.split(' '), ...ws]);
    }
  }
  // a request the translator put in the third person ("he moves problems up"): the imperative
  if (/^(?:he|she|it|they)$/.test(ws[0]) && /[a-z]s$/.test(ws[1] ?? '') && ws.length > 2) add([ws[1].replace(/(?:sh|ch|x|ss)es$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1'), ...ws.slice(2)].join(' '), 'imperative', 1, [ws[0]]);
  // a correction: a leading "wrong" / "no" says the last result was wrong; the rest is the request ("wrong, he moves X up" -> "move X up")
  const wr = phrase('lang.intent.wrong').find((w) => ws[0] === w);
  if (wr && ws.length > 2) {
    let rest = ws.slice(1);
    if (/^(?:he|she|it|they)$/.test(rest[0]) && /s$/.test(rest[1] ?? '')) rest = [rest[1].replace(/(?:sh|ch|x|ss)es$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, '$1'), ...rest.slice(2)];
    add(rest.join(' '), 'correction', 1, [wr, ...(ws[1] === rest[0] ? [] : [ws[1]])]);
  }
  // a thing put back where it was: the newest undo snapshot where it stood elsewhere gives the place
  const back = has(clause, phrase('lang.intent.back'));
  if (back) {
    const named = thingsOf(state).filter((t) => t.name && near(ws, t.name));
    for (const t of named.slice(0, 2)) {
      const was = placeBefore(state, t.name);
      if (was) add(`move ${t.name} to ${was.x},${was.y}`, 'back', 1, [...back.split(' '), ...ws], `put ${t.name} back where it was`);
    }
  }
  // a pointing word stands for a thing of the previous turn ("put the fish in that" after "where is the water?"); a translation that dropped the word leaves "in the" at the end
  const ptr = has(clause, phrase('lang.intent.pointer'));
  const dangling = /\b(?:in|into|on|onto|to|under|next to|near|by)\s+(?:the|that|this|it)?\s*$/i.exec(clause.trim().replace(/[.!?]+$/, ''));
  if ((ptr || dangling) && previous.length) {
    for (const np of previous.slice(0, 3)) {
      const t = ptr ? ` ${ws.join(' ')} `.replace(` ${ptr} `, ` ${ptr.split(' ')[0]} the ${np} `).trim() : `${clause.trim().replace(/[.!?]+$/, '').replace(/\s+(?:the|that|this|it)?\s*$/i, '')} the ${np}`;
      add(t, 'pointer', 1, ptr ? ptr.split(' ') : []);
    }
  }
  // a continuation with only a direction ("lower", "even higher", "a bit to the left"): the same move again for the thing the previous turn moved
  const DIRS = { up: 'up', upwards: 'up', higher: 'up', above: 'up', top: 'up', down: 'down', downwards: 'down', lower: 'down', below: 'down', bottom: 'down', left: 'left', right: 'right' };
  const dirWord = ws.find((w) => DIRS[w]);
  if (dirWord && ws.every((w) => DIRS[w] || STOP.has(w) || /^(?:even|bit|little|further|farther|still|again|lot|much)$/.test(w)) && previous.thingNames?.length) {
    for (const n of previous.thingNames.slice(0, 2)) add(`move ${n} ${DIRS[dirWord]}`, 'continue', 1, ws);
  }
  // a kind of text with any verb ("make me a story about a lake", "<non-word> a story with 3 chapters about a lake"): the open world's write act
  const txt = has(clause, phrase('lang.intent.text'));
  if (txt) {
    const about = /\babout\s+(.+?)(?:\s+(?:where|with|that|which|in which)\b.*)?$/i.exec(clause.replace(/[.!?]+$/, ''));
    if (about) add(`write a ${txt} about ${about[1]}`, 'text', 1, ws);
    add(`write a ${txt}`, 'text', 3, ws);
  }
  // a bare name on a tab ("Tenerife" on the Map): the requests it may stand for, in the order of lang.intent.bare
  const content = ws.filter((w) => !STOP.has(w));
  const raw = clause.trim().replace(/[.!?]+$/, '');
  if (ws.length === 1 && /^[\p{Lu}][\p{L}'-]+$/u.test(raw) && !known(ws[0]) && !DIRECTION.test(ws[0]) && !lang.position?.(ws[0])) {   // one capitalised word no world and no English dictionary knows: a name
    phrase('lang.intent.bare').forEach((lead, i) => { if (worldWords.verbs.has(lead.split(' ')[0])) add(`${lead} ${clause.trim().replace(/[.!?]+$/, '')}`, 'bare', 1 + i, ws); });   // only requests the open world itself makes (a lead of its own examples)
  }
  return out;
}

/** Where a named thing stood before its last move: the newest snapshot of the world's own undo history where it stood elsewhere ({ x, y } or null). */
function placeBefore(state, name) {
  const key = String(name).replace(/ /g, '_').toLowerCase();
  const find = (st) => { for (const v of Object.values(st ?? {})) if (Array.isArray(v)) for (const o of v) if (o && typeof o === 'object' && String(o.name ?? '').toLowerCase() === key && Number.isFinite(o.x) && Number.isFinite(o.y)) return o; return null; };
  const now = find(state);
  if (!now) return null;
  for (const snap of [...(state.undo ?? state.history ?? [])].reverse()) {
    const o = find(snap?.state ?? snap);
    if (o && (o.x !== now.x || o.y !== now.y)) return { x: Math.round(o.x), y: Math.round(o.y) };
  }
  return null;
}

/** A word of the clause is the name (or a slip of the name: one letter missing or wrong in five) of a thing. */
function near(ws, name) {
  const n = words(name);
  if (!n.length) return false;
  return n.every((p) => ws.some((w) => w === p || (p.length >= 5 && w.length >= 4 && (p.startsWith(w.slice(0, 3)) && Math.abs(p.length - w.length) <= 3))));
}

/** The nouns of the previous turn the open world may point back to, newest first ("where is the water?" -> water). */
function previousNouns(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/\b(?:the|a|an)\s+([a-z]+(?:\s+[a-z]+)?)/gi)) {
    const np = m[1].toLowerCase().split(/\s+/).filter((w) => !STOP.has(w));
    if (np.length) out.unshift(np.join(' '));
  }
  return [...new Set(out)];
}

/**
 * Propose and choose. `dialog` is the DialogSession (its state is the one before the turn), `english` the first reading's English. Returns null (keep the first reading),
 * or { english, assumed: [{ said, as }], say?, log }.
 */
export async function intentStep(dialog, english, { understand, known = () => false }) {
  const { engine } = dialog;
  const lang = engine.interp.lang, lib = engine.sopworld;
  if (!lib?.choose || !lib?.World) return null;
  const phrase = (id) => (lang.phrase(id) ?? []).map((a) => String(a).toLowerCase());
  const ctx = dialog.context();
  const tabWorld = ctx.tabWorld;
  const state = tabWorld ? dialog.isession.state[tabWorld] ?? {} : {};
  // talk about the assistant: a calm reply and what the open tab can do; nothing changes
  const self = has(english, phrase('lang.intent.about_you')) ?? (/^(?:are|r)\s+(?:you|u)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+)?\s*\?*\s*$/iu.test(english.trim()) ? 'are you' : null);   // a short "are you X?" with no thing of the world: about the assistant
  if (self) return { english, say: aboutYou(dialog, tabWorld), assumed: [], log: [{ via: 'about-you', cue: self }] };
  const worldWords = worldWordsOf(engine.set, tabWorld);
  const prevRec = dialog.dialogue?.log?.at?.(-1);
  const previous = previousNouns(prevRec?.text ?? '');
  previous.thingNames = thingsOf(state).filter((t) => t.name && near(words(prevRec?.text ?? ''), t.name)).map((t) => t.name);   // the things of the open world the previous turn named
  const world = new lib.World();
  try { world.load(INTENT_CRITERIA); } catch { return null; }
  const clauses = splitClauses(english);
  const log = [];
  let changed = false;
  const assumed = [];
  const wrongs = phrase('lang.intent.wrong');
  // a clause that is only "wrong" / "no" (with at most a name) before a request: the request is what the user wants; the word is not a request of its own
  if (clauses.length > 1) for (const c of clauses) {
    const ws = words(c.text);
    if (ws.length && wrongs.includes(ws[0]) && ws.length <= 2 && clauses.some((o) => o !== c && words(o.text).length > 2)) { log.push({ clause: c.text, dropped: 'wrong' }); c.text = ''; c.sep = ''; changed = true; }
  }
  // a request the translator put in the third person ("he moves problems up", the Romanian imperative read as "he moves"): the imperative, before any reading
  for (const c of clauses) {
    const m = /^(?:he|she|it)\s+([a-z]+s)\s+(\S.*)$/i.exec(c.text.trim());
    if (m) {
      const verb = m[1].toLowerCase().replace(/(sh|ch|x|ss)es$/, '$1').replace(/([^s])s$/, '$1');
      const t = `${verb} ${m[2]}`;
      if ((await understand(t)).issues <= (await understand(c.text)).issues) { log.push({ clause: c.text, imperative: t }); c.text = t; changed = true; }
    }
  }
  for (const c of clauses) {
    budget.tick('intent.clause');
    if (!c.text.trim()) continue;
    const props = proposals(c.text, { phrase, lang, state, previous, worldWords, known });
    if (!props.length) continue;
    const content = words(c.text).filter((w) => !STOP.has(w));
    const score = async (text, via, cost, cue) => {
      const u = await understand(text);
      const tw = new Set(words(text));
      const uncovered = content.filter((w) => !tw.has(w) && !cue.includes(w)).length;
      const prevHit = previous.some((p) => words(p).every((w) => tw.has(w))) ? 1 : 0;
      return { text, via, cost, issues: u.issues, uncovered, previous: prevHit };
    };
    const cands = [await score(c.text, 'self', 0, [])];
    if (cands[0].issues === 0) { log.push({ clause: c.text, kept: 'self' }); continue; }
    for (const p of props.slice(0, 12)) cands.push(await score(p.text, p.via, p.cost, p.cue));
    const r = lib.choose(world, 'intent', cands, { seed: null });
    const best = r.best;
    // two different kinds of reading as good as each other on every criterion but cost: ONE concrete question with the two options (a message of one clause)
    const second = r.order.find((x) => x !== best && x.via !== 'self' && x.via !== best.via);
    if (clauses.filter((x) => x.text.trim()).length === 1 && best.via !== 'self' && second && best.issues === 0 && second.issues === 0 && second.uncovered === best.uncovered && second.previous === best.previous && Math.abs(second.cost - best.cost) < 1) {
      const sayOf = (x) => props.find((p) => p.text === x.text)?.say ?? x.text;
      log.push({ clause: c.text, ask: [best.text, second.text] });
      return { english, say: `Do you mean "${sayOf(best)}" or "${sayOf(second)}"?`, assumed: [], log };
    }
    log.push({ clause: c.text, chosen: best.text, via: best.via, cands: cands.map((x) => [x.text, x.via, x.issues, x.uncovered, x.cost]) });
    if (best.via !== 'self' && best.issues < cands[0].issues) {
      changed = true;
      assumed.push({ said: c.text, as: props.find((p) => p.text === best.text)?.say ?? best.text, via: best.via });
      c.text = best.text;
      c.read = true;
    }
  }
  if (!changed) return null;
  // do the part that is read and name the rest: a clause no reading reads at all (a garbled word) is left out, said, and does not hold back the clauses that are read
  const left = [];
  if (assumed.length) for (const c of clauses) {
    if (!c.text.trim() || c.read) continue;
    if ((await understand(c.text)).issues >= 3) { left.push(c.text); log.push({ clause: c.text, left: true }); c.text = ''; }
  }
  const kept = clauses.filter((c) => c.text.trim());
  if (!kept.length) return null;
  return { english: kept.map((c, i) => c.text + (i < kept.length - 1 ? c.sep || ', ' : '')).join(''), assumed, left, log };
}

const TAB_NOUNS = ['diagram', 'picture', 'drawing', 'document', 'chart', 'map', 'song', 'list', 'timeline', 'calendar', 'plan'];
const worldCache = new WeakMap();
/** The nouns the open world calls its whole thing by (words of its patterns), and the verbs of its patterns. */
function worldWordsOf(set, id) {
  const w = id ? set.get(id) : null;
  if (!w) return { nouns: [], verbs: new Set() };
  if (worldCache.has(w)) return worldCache.get(w);
  const text = (w.patterns ?? []).map((p) => `${p.match ?? ''} ${(p.canonical ?? []).join(' ')}`).join(' ').toLowerCase();
  const nouns = TAB_NOUNS.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
  const verbs = new Set((w.patterns ?? []).flatMap((p) => (p.canonical ?? []).map((c) => words(c)[0])).filter(Boolean));
  const r = { nouns: nouns.length ? nouns.slice(0, 2) : [], verbs };
  worldCache.set(w, r);
  return r;
}

/** The calm reply to talk about the assistant: it says so plainly and offers what the open tab can do (two of its own examples). */
function aboutYou(dialog, tabWorld) {
  const set = dialog.engine.set;
  const w = tabWorld ? set.get(tabWorld) : null;
  const ex = [];
  for (const p of w?.patterns ?? []) for (const c of (p.canonical ?? []).slice(0, 1)) if (ex.length < 2 && !ex.includes(c) && !/\?$/.test(c)) ex.push(c);
  const tab = dialog.isession.state['ui.shell']?.activeTab;
  const here = tab ? `On the ${tab === 'draw' ? 'Drawing' : tab === 'editor' ? 'Documents' : tab.charAt(0).toUpperCase() + tab.slice(1)} tab` : 'Here';
  return `Sorry, I did not get some of what you said. ${here} I can, for example: ${ex.map((e) => `"${e.replace(/[.!]+$/, '')}"`).join(' or ') || '"help"'}. Tell me what you want in a short sentence and I will do it.`;
}
