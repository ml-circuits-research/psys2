// Operations of user.profile (spec 12): a game-like interview that gets to know the user, and a CV-like profile built from the answers.
// Browser-safe; imports only files of this world.
//
// State (ctx.state): { v, fields: { <field>: { v: string | string[], src: 'said' | 'guessed', note?, at } }, skipped: { <field>: 'skip' | 'declined' | 'unclear' | 'forgotten' },
//   asks: { <field>: n }, followed: { <field>: true }, sensitive: [{ cat, text }] (only what the user asked to remember), pending: null | { kind: 'ask' | 'follow' | 'confirm' | 'delete', key?, ... },
//   question: string (the question waiting for an answer), active: bool (interview running), inputMode: null | 'interview' | 'confirm', turns, lastKey, lastSection, lastFollow,
//   phrase: { <field>: last phrasing index }, plan: compact plan for the tab, counts: { known, total, skipped }, n (change counter), focus: { key, n } }
// The plan (fields, priorities, sensitivity, phrasings, follow-ups) is read from the knowledge base (kb.sop); answers are read by understand.mjs.
// Modal input: while `inputMode` is set, the engine offers every message to interceptInput(); clear commands for other worlds and this world's own
// commands pass through (handled: false), everything else is read as the answer. Effects: file.download { filename, text, mime }.
import { extract, likesItems, clauseLike, echoable, norm, isSkip, isStop, isDecline, YES, NO, sensitive, fieldForRole, fieldForRoleText, pretty, sentenceCase, withArticle, _findEntries as findEntries } from './understand.mjs?v=14c199815e';
import { toJson, toMarkdown, counts, PLAN_FALLBACK, SECTIONS_FALLBACK } from './cv.mjs?v=28a6cad39b';

const TAB = 'profile';
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function initialState() {
  return { v: 1, fields: {}, skipped: {}, asks: {}, followed: {}, sensitive: [], pending: null, question: '', active: false, inputMode: null, turns: 0, lastKey: null, lastSection: null, lastFollow: false, phrase: {}, resumeKey: null, plan: null, counts: null, n: 0, focus: null };
}

// ---- knowledge base: the plan -----------------------------------------------------------------------------------------
function planOf(ctx) {
  const wires = ctx.find('user.profile.field');
  if (!wires.length) return PLAN_FALLBACK.map((p) => ({ ...p, q: [], ack: [], follow: '', followKey: '', followMode: 'unclear', sens: 'none', askable: p.askable !== false }));
  return wires.map((w) => ({
    id: String(w.id).replace(/^f\./, ''), section: ctx.val(w, 'section'), label: ctx.val(w, 'label'), prio: Number(ctx.val(w, 'prio') ?? 1), card: ctx.val(w, 'card') ?? 'one',
    sens: ctx.val(w, 'sens') ?? 'none', want: ctx.val(w, 'want') ?? '', example: ctx.val(w, 'example') ?? '', q: ctx.vals(w, 'q'), follow: ctx.val(w, 'follow') ?? '',
    followKey: ctx.val(w, 'followKey') ?? '', followMode: ctx.val(w, 'followMode') ?? 'unclear', ack: ctx.vals(w, 'ack'), needs: ctx.val(w, 'needs') ?? '',
    askable: String(ctx.val(w, 'askable') ?? 'true') !== 'false',
  }));
}
function sectionsOf(ctx) {
  const w = ctx.find('user.profile.section');
  return w.length ? w.map((x) => ({ id: String(x.id).replace(/^sec\./, ''), label: ctx.val(x, 'label'), order: Number(ctx.val(x, 'order') ?? 1) })).sort((a, b) => a.order - b.order) : SECTIONS_FALLBACK;
}
function envOf(ctx, pending = null) {
  const industries = ctx.find('user.profile.industry').map((w) => ({ id: String(w.id).replace(/^ind\./, ''), label: ctx.val(w, 'label'), words: ctx.vals(w, 'word') }));
  const activities = {};
  for (const w of ctx.find('user.profile.activity')) activities[ctx.val(w, 'word')] = ctx.val(w, 'role');
  return { lex: (id) => ctx.lexicon(`lex.user.profile.${id}`), industries, activities, pending };
}
function reactionFor(ctx, kind, word) {
  const w = ctx.find('user.profile.reaction').find((r) => ctx.val(r, 'kind') === kind && ctx.val(r, 'word') === word);
  return w ? ctx.val(w, 'text') : null;
}

// ---- state helpers -----------------------------------------------------------------------------------------------------
function st(ctx) {
  const s = ctx.state;
  const f = initialState();
  for (const k of Object.keys(f)) if (s[k] === undefined) s[k] = f[k];
  return s;
}
const known = (s, key) => list(s.fields[key]?.v).length > 0;
const isOpen = (s, key) => !known(s, key) && !s.skipped[key];
function sync(ctx, plan) {
  const s = st(ctx);
  plan ??= planOf(ctx);
  s.plan = plan.map((p) => ({ id: p.id, section: p.section, label: p.label, prio: p.prio, card: p.card, want: p.want, example: p.example, needs: p.needs || undefined }));
  s.counts = counts(s, s.plan);
  s.inputMode = s.active ? 'interview' : s.pending && ['confirm', 'delete'].includes(s.pending.kind) ? 'confirm' : null;
  if (!s.pending) s.question = s.question && s.active ? s.question : '';
}
const W = (fn) => (ctx, args) => { const r = fn(ctx, args ?? {}); sync(ctx); return r; };
const meter = (s, plan) => { const c = counts(s, plan); return `(${c.known} of ${c.total} known)`; };
const display = (v) => joinAnd(list(v).map((x) => String(x)));
const toTab = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may be absent */ } };

// ---- applying what was understood ----------------------------------------------------------------------------------------
function applyItems(ctx, s, plan, env, items, correction) {
  const changes = [];
  for (const it of items) {
    const pl = plan.find((p) => p.id === it.key);
    if (!pl) continue;
    const prev = s.fields[it.key];
    if (it.guessed && prev && prev.src === 'said') continue;
    const incoming = list(it.value).map(String).filter(Boolean);
    if (!incoming.length) continue;
    let v;
    if (pl.card === 'many') {
      const old = list(prev?.v);
      const merged = correction ? incoming : [...old, ...incoming.filter((x) => !old.some((o) => o.toLowerCase() === x.toLowerCase()))];
      v = merged;
    } else v = incoming[0];
    const same = JSON.stringify(v) === JSON.stringify(prev?.v);
    s.fields[it.key] = { v, src: it.guessed ? 'guessed' : 'said', at: ++s.n, ...(same && prev?.note ? { note: prev.note } : {}) };
    delete s.skipped[it.key];
    s.focus = { key: it.key, n: s.n };
    changes.push({ key: it.key, value: pl.card === 'many' ? incoming : incoming[0], prev: prev?.v, entry: it.entry, how: it.how, id: it.id, added: pl.card === 'many' ? incoming.filter((x) => !list(prev?.v).some((o) => o.toLowerCase() === x.toLowerCase())) : [incoming[0]], same });
  }
  // a guessed field from the role
  let guess = null;
  const roleCh = changes.find((c) => c.key === 'role');
  if (roleCh) {
    const ind = fieldForRole(roleCh.entry, env.lex, env.industries) ?? fieldForRoleText(list(s.fields.role.v)[0], env.lex, env.industries);
    const cur = s.fields.field;
    if (ind && !changes.some((c) => c.key === 'field') && (!cur || cur.src === 'guessed') && !(s.skipped.field)) {
      s.fields.field = { v: ind.label, src: 'guessed', at: ++s.n };
      guess = { key: 'field', value: ind.label, role: list(s.fields.role.v)[0] };
    } else if (!ind && cur?.src === 'guessed' && correction) delete s.fields.field;
  }
  return { changes, guess };
}

function ackText(ctx, s, plan, changes, correction, turn) {
  const pending = changes.find((c) => c.how && c.key !== 'field' && c.key !== 'org' && c.key !== 'years') ?? changes[0];
  if (!changes.length) return '';
  const pl = (k) => plan.find((p) => p.id === k);
  if (correction) {
    const c = changes[0];
    const label = pl(c.key)?.label?.toLowerCase() ?? c.key;
    return c.prev !== undefined && list(c.prev).length && JSON.stringify(c.prev) !== JSON.stringify(s.fields[c.key]?.v)
      ? `Got it: your ${label} is ${display(s.fields[c.key].v)}, not ${display(c.prev)}.` : `Got it: your ${label} is ${display(s.fields[c.key]?.v)}.`;
  }
  const c = pending;
  const kind = c.key === 'role' ? 'role' : c.key === 'field' ? 'field' : ['hobbies', 'sports'].includes(c.key) ? 'hobby' : null;
  const word = c.key === 'role' ? c.entry : c.key === 'field' ? c.id : c.entry;
  let text = kind && word ? reactionFor(ctx, kind, word) : null;
  if (!text) {
    const tpl = pl(c.key)?.ack ?? [];
    const val = display(c.added?.length ? c.added : c.value);
    text = !echoable(val) ? 'Thanks, noted.' : tpl.length ? tpl[turn % tpl.length].replace('{A}', sentenceCase(withArticle(val))).replace('{V}', sentenceCase(val)).replace('{v}', val) : `Noted: ${val}.`;
  }
  const extras = changes.filter((x) => x !== c && !x.same).slice(0, 2).map((x) => `${(pl(x.key)?.label ?? x.key).toLowerCase()}: ${display(x.added?.length ? x.added : x.value)}`);
  return extras.length ? `${text} I also noted ${joinAnd(extras)}.` : text;
}
const MILESTONES = [[0.25, 'A quarter of the way there!'], [0.5, 'Halfway there!'], [0.75, 'Three quarters done!']];
function milestone(before, after, total) {
  for (const [r, t] of MILESTONES) if (before / total < r && after / total >= r) return t;
  return '';
}

// ---- choosing and asking the next question -------------------------------------------------------------------------------------
const CONNECT = ['Next: ', 'Now, ', 'Okay, ', 'And ', ''];
function candidates(s, plan) {
  return plan.filter((p) => p.askable && ['none', 'low'].includes(p.sens) && isOpen(s, p.id) && (s.asks[p.id] ?? 0) < 2
    && (!p.needs || known(s, p.needs) || (s.skipped[p.needs] && ['field', 'career', 'address'].includes(p.id))))
    .map((p, i) => ({ p, i, score: p.prio * 10 - (p.section === s.lastSection ? 6 : 0) - (s.asks[p.id] ? 8 : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.p);
}
function askField(s, plan, p, prefix = '') {
  const q = p.q.length ? p.q : [`What is your ${p.label.toLowerCase()}?`];
  let idx = ((s.asks[p.id] ?? 0) * 2 + s.turns) % q.length;
  if (idx === s.phrase[p.id]) idx = (idx + 1) % q.length;
  s.phrase[p.id] = idx;
  s.asks[p.id] = (s.asks[p.id] ?? 0) + 1;
  s.pending = { kind: 'ask', key: p.id };
  s.lastKey = p.id; s.lastSection = p.section; s.lastFollow = false;
  if (p.id === 'years') s.lastNumeric = { key: 'years', turn: s.turns };
  const text = `${prefix}${prefix && /[?!.]$/.test(q[idx]) ? q[idx] : q[idx]} ${meter(s, plan)}`;
  s.question = text;
  return text;
}
function nextQuestion(s, plan, withAck) {
  const c = candidates(s, plan);
  s.turns++;
  if (!c.length) {
    s.active = false; s.pending = null; s.question = '';
    return `${withAck ? '' : ''}That is everything I wanted to ask for now, thank you! You can see what I learned on this tab, or ask "what do you know about me?".`.trim();
  }
  const p = c[0];
  const conn = withAck ? CONNECT[s.turns % CONNECT.length] : '';
  const q = askField(s, plan, p);
  return conn ? `${conn}${q.charAt(0).toLowerCase() === q.charAt(0) || /^(?:I|Dr|Ms|Mr)\b/.test(q) ? q : conn.endsWith(': ') || conn.endsWith(', ') || conn === 'And ' ? q.charAt(0).toLowerCase() + q.slice(1) : q}` : q;
}
function sayFollow(s, plan, p, retry) {
  s.pending = { kind: 'follow', key: p.id, followKey: retry ? '' : p.followKey || '', retry: !!retry };
  s.followed[p.id] = true; s.lastFollow = true;
  if (!p.followKey && !retry) s.lastFollowNote = { key: p.id, turn: s.turns };
  const q = p.follow;
  s.question = q;
  return q;
}

// ---- recognising commands of other worlds and of this one ------------------------------------------------------------------
const META = /\b(?:forget|erase|wipe)\b.*\b(?:my|the|about)\b|\bdelete (?:my|the|everything)\b|\bexport\b|\bdownload my\b|\bwhat do you know\b|\bwhat have you learned\b|\bshow (?:me )?my (?:profile|cv)\b|^confirm my\b|^ask me about my\b|\bhow (?:well|much) do you know me\b|\binterview\b|\bget to know me\b|^ask me (?:something|a question|anything)\b|\b(?:clear|remove) my\b/;
const OTHER_STRONG = /^(?:please |can you |could you |hey |ok |okay )*(?:open|go to|go back|show|let us play|lets play|zoom|draw|add|create|insert|undo|redo|start dictation|stop dictation|new game|i give up|hint|how many|how much|how far|how old|how do|how does|what is|what are|what was|what can|what do|what does|who is|who was|where is|where are|when is|when was|why|which|tell me|find|search|summari[sz]e|calculate|compute|convert|become|turn on|turn off|turn into|switch|dance|wave|spin|nod|shake|read|speak|say|move|select|copy|download|save|print|sing|surprise|reset|slower|faster|help|zoom)\b/;
const OTHER_WEAK = /^(?:please |can you |could you )*(?:play|make|use|give|take|look|change|set|start|be)\b/;
function looksOther(n, raw) {
  if (META.test(n)) return true;
  if (OTHER_STRONG.test(n)) return true;
  if (/\?\s*$/.test(String(raw).trim())) return true;
  return false;
}

// ---- the interview turn -------------------------------------------------------------------------------------------------------
function pauseReply(s, plan) { s.resumeKey = s.pending?.kind === 'ask' ? s.pending.key : null; s.active = false; s.pending = null; s.question = ''; return `No problem, we can pick this up whenever you say "interview me". ${meter(s, plan)}`; }

const ex0Deny = (n) => NO.test(n) || isSkip(n);
/** A short answer made of capitalised words that is not a common word (a company, a product, a name): "Axiologic", "Starship Navigation". */
function properName(raw) {
  if (/\?\s*$/.test(String(raw ?? ''))) return false;   // GAPS-1b: a question is not a name
  const w = String(raw ?? '').trim().replace(/[.!]+$/, '').split(/\s+/);
  return w.length >= 1 && w.length <= 4 && w.every((x) => /^[\p{Lu}][\p{L}0-9&'.-]*$/u.test(x)) && !/^(?:I|Yes|No|Ok|Okay|Sure|Hello|Hi|Hey|Nothing|None|Skip|Stop|Next|Which|Who|Whom|Whose|What|Where|When|Why|How|Do|Does|Did|Can|Could|Would|Should|Is|Are)$/i.test(w[0]);
}

function interceptTurn(ctx, text) {
  const s = st(ctx);
  const plan = planOf(ctx);
  if (!s.inputMode) return { handled: false };
  const tab = ctx.peek('ui.shell')?.activeTab;
  if (tab && tab !== TAB) { s.resumeKey = s.pending?.kind === 'ask' ? s.pending.key : null; s.active = false; s.pending = null; s.question = ''; return { handled: false }; }
  const raw = String(text ?? '');
  const n = norm(raw);
  const p = s.pending;
  if (META.test(n) && !(p?.kind === 'delete' && (YES.test(n) || NO.test(n)))) { if (p && ['confirm', 'delete'].includes(p.kind)) { s.pending = null; } return { handled: false }; }
  // a clear command or question for another world passes through, unless it also says something about the user
  const envPlain = envOf(ctx, null);
  const interestKeys = ['hobbies', 'sports', 'media', 'topics', 'skills', 'tools', 'learning', 'career', 'year', 'previous'];
  const waiting = p?.kind === 'ask' ? p.key : p?.kind === 'follow' ? (p.followKey || p.key) : null;
  const other = !YES.test(n) && !NO.test(n) && !isSkip(n) && !isStop(n) && (looksOther(n, raw) || (OTHER_WEAK.test(n) && !interestKeys.includes(waiting)));
  if (other && !extract(raw, envPlain).items.length && !sensitive(raw, envPlain.lex)) { if (p && ['confirm', 'delete'].includes(p.kind)) s.pending = null; return { handled: false }; }

  if (p?.kind === 'delete') {
    if (YES.test(n)) return { handled: true, reply: wipe(ctx) };
    s.pending = null;
    if (NO.test(n) || isSkip(n) || isStop(n)) return { handled: true, reply: 'OK, I kept everything.' };
    return { handled: false };
  }
  const env = envOf(ctx, null);
  if (p?.kind === 'confirm') {
    const key = p.key;
    if (YES.test(n) && !NO.test(n)) {
      if (s.fields[key]) s.fields[key].src = 'said';
      s.pending = null; s.focus = { key, n: ++s.n };
      return { handled: true, reply: s.active ? `Great, thanks. ${nextQuestion(s, plan, true)}` : 'Great, thanks, I noted that.' };
    }
    // a non-yes/no answer answers what it fits: a proper name to "So you work in science, right?" is the organisation, not the field
    if (key === 'field' && !ex0Deny(n)) {
      const nm = properName(raw);
      if (nm && !findEntries(n.split(' '), env.lex('fields') ?? []).length && !extract(raw, { ...env, pending: 'field' }).items.some((i) => i.how === 'field')) {
        const org = extract(raw, { ...env, pending: 'org' });
        const items = org.items.filter((i) => i.key === 'org');
        if (items.length) {
          const { changes } = applyItems(ctx, s, plan, env, items, false);
          const again = !p.reasked && s.fields.field?.src === 'guessed';
          s.pending = again ? { ...p, reasked: true } : null;
          const ack = ackText(ctx, s, plan, changes, false, s.turns);
          if (again) { s.question = `And is it right that you work in ${String(s.fields.field.v).toLowerCase()}?`; return { handled: true, reply: `${ack} ${s.question}` }; }
          return { handled: true, reply: `${ack}${s.active ? ` ${nextQuestion(s, plan, true)}` : ''}` };
        }
      }
    }
    const ex = extract(raw, { ...env, pending: key });
    if (ex.deny || ex.items.some((i) => i.key === key)) {
      if (s.fields[key]?.src === 'guessed') delete s.fields[key];
      s.pending = null;
      if (ex.items.length) {
        const { changes } = applyItems(ctx, s, plan, env, ex.items, true);
        const tail = s.active ? ` ${nextQuestion(s, plan, true)}` : '';
        return { handled: true, reply: `${ackText(ctx, s, plan, changes, false, s.turns)}${tail}` };
      }
      if (s.active) { const field = plan.find((x) => x.id === key); s.skipped[key] && delete s.skipped[key]; return { handled: true, reply: `OK, I dropped that guess. ${askField(s, plan, field, 'Which one is it then? ')}`.replace('Which one is it then? Which', 'Which') }; }
      return { handled: true, reply: 'OK, I dropped that guess.' };
    }
    s.pending = null;
    if (!s.active) return { handled: false };
  }

  // from here on the interview is active
  const cur = s.pending;
  if (isStop(n)) return { handled: true, reply: pauseReply(s, plan) };
  const askKey = cur?.kind === 'ask' ? cur.key : cur?.kind === 'follow' ? (cur.retry ? cur.key : cur.followKey || null) : null;
  const sens = sensitive(raw, env.lex);
  if (sens) return { handled: true, reply: sensitiveReply(s, plan, sens, raw, cur) };
  let ex = extract(raw, { ...env, pending: askKey });
  // a bare number answers the last numeric question (years of experience) when the current question is not numeric
  const ln = s.lastNumeric;
  if (/^\d{1,2}$/.test(n) && askKey !== ln?.key && ln && !s.fields[ln.key] && s.turns - ln.turn <= 4) {
    const yrs = Number(n);
    if (yrs >= 0 && yrs <= 60) { ex = { ...ex, items: [{ key: ln.key, value: String(yrs), how: 'years' }] }; delete s.skipped[ln.key]; }
  }
  const field = cur?.key ? plan.find((x) => x.id === cur.key) : null;

  if (!ex.items.length && isSkip(n) && cur) {
    const decl = isDecline(n);
    if (cur.kind === 'ask' || (cur.kind === 'follow' && cur.retry)) s.skipped[cur.key] = decl ? 'declined' : 'skip';
    else if (cur.kind === 'follow' && cur.followKey) { s.skipped[cur.followKey] = decl ? 'declined' : 'skip'; }
    const lead = decl ? 'Of course, I will not ask about that again.' : /\b(?:next|skip|pass)\b/.test(n) ? 'Sure, skipping it.' : 'No problem.';
    return { handled: true, reply: `${lead} ${nextQuestion(s, plan, true)}` };
  }
  if (!ex.items.length && cur?.kind === 'follow' && !cur.followKey && !cur.retry && !looksOther(n, raw) && n.split(' ').length <= 40) {
    const f = s.fields[cur.key];
    if (f && !YES.test(n) && !NO.test(n)) f.note = clean(raw).slice(0, 160);
    s.pending = null; s.focus = { key: cur.key, n: ++s.n };
    const thanks = ['Thanks for sharing that.', 'That is good to know.', 'I like that.'][s.turns % 3];
    return { handled: true, reply: `${thanks} ${nextQuestion(s, plan, true)}` };
  }
  if (!ex.items.length) {
    if (looksOther(n, raw) || !cur) return { handled: false };
    // a clause or a story is never a value: it may belong to the previous follow-up (kept as a note), else it is acknowledged politely and the question is asked again once
    if (cur.kind === 'ask' && field && clauseLike(raw) && n.split(' ').length <= 40) {
      const lf = s.lastFollowNote;
      if (lf && lf.key !== field.id && s.turns - lf.turn <= 5 && s.fields[lf.key] && !s.fields[lf.key].note) {
        s.fields[lf.key].note = clean(raw).slice(0, 160); s.lastFollowNote = null;
        s.asks[field.id] = Math.max(0, (s.asks[field.id] ?? 1) - 1);
        return { handled: true, reply: `Thanks, I added that to your ${(plan.find((x) => x.id === lf.key)?.label ?? lf.key).toLowerCase()} notes. ${askField(s, plan, field)}` };
      }
      if (!(s.storied ??= {})[field.id]) {
        s.storied[field.id] = true;
        s.asks[field.id] = Math.max(0, (s.asks[field.id] ?? 1) - 1);
        return { handled: true, reply: `Nice story! ${askField(s, plan, field, 'And ').replace(/^And (?!I\b)([A-Z])/, (m, c) => `And ${c.toLowerCase()}`)}` };
      }
    }
    if (n.split(' ').length > 8) return { handled: false };
    // not understood
    if (cur.kind === 'ask' && field?.follow && !s.followed[field.id]) return { handled: true, reply: `Hmm, I am not sure I got that. ${sayFollow(s, plan, field, true)}` };
    if (cur.kind === 'follow' && cur.followKey) { s.pending = null; return { handled: true, reply: `Okay. ${nextQuestion(s, plan, true)}` }; }
    s.skipped[cur.key] = 'unclear';
    return { handled: true, reply: `No worries, we can leave that one. ${nextQuestion(s, plan, true)}` };
  }

  const before = counts(s, plan).known;
  const { changes, guess } = applyItems(ctx, s, plan, env, ex.items, ex.correction);
  const after = counts(s, plan).known;
  const ack = ackText(ctx, s, plan, changes, ex.correction, s.turns);
  const ms = milestone(before, after, plan.length);
  const answered = cur?.key && changes.some((c) => c.key === (cur.kind === 'follow' && cur.followKey ? cur.followKey : cur.key));
  s.pending = null;
  const head = [ack, ms].filter(Boolean).join(' ');
  if (guess) {
    const lab = String(guess.value).toLowerCase();
    s.pending = { kind: 'confirm', key: 'field', value: guess.value };
    s.lastFollow = false;
    s.question = `So you work in ${lab}, right?`;
    return { handled: true, reply: `${head} ${s.question}` };
  }
  const pl = changes.find((c) => c.key === field?.id) ? field : null;
  if (cur?.kind === 'ask' && pl && pl.follow && pl.followMode === 'always' && !s.followed[pl.id] && !s.lastFollow && (!pl.followKey || isOpen(s, pl.followKey)) && !ex.correction) {
    return { handled: true, reply: `${head} ${sayFollow(s, plan, pl, false)}` };
  }
  s.lastFollow = false;
  void answered;
  return { handled: true, reply: `${head} ${nextQuestion(s, plan, true)}` };
}
export const interceptInput = W(interceptTurn);

function sensitiveReply(s, plan, sens, raw, cur) {
  let lead;
  if (sens.remember) {
    s.sensitive.push({ cat: sens.cat, text: clean(raw).slice(0, 160) });
    lead = 'OK, I will remember that. It stays in this browser, you can see it in the tab and delete it any time.';
  } else lead = 'Thanks for telling me. I do not keep things like that unless you say "remember", so I have not stored it.';
  if (s.active && cur?.kind === 'ask') { const p = plan.find((x) => x.id === cur.key); return `${lead} Back to my question: ${p?.q[0] ?? s.question}`; }
  return lead;
}

// ---- operations ---------------------------------------------------------------------------------------------------------------
export const start = W((ctx, { field }) => {
  const s = st(ctx);
  const plan = planOf(ctx);
  toTab(ctx);
  const was = s.active;
  s.active = true; s.pending = null;
  const c = counts(s, plan);
  let intro = '';
  if (field) {
    const p = plan.find((x) => x.id === field);
    if (!p) { s.active = was; return no('unsupported', 'I do not know that part of your profile.'); }
    delete s.skipped[p.id]; s.asks[p.id] = Math.min(s.asks[p.id] ?? 0, 1);
    intro = 'Sure. ';
    return ok(`${intro}${askField(s, plan, p)}`);
  }
  if (was && s.question) { s.pending = { kind: 'ask', key: s.lastKey }; return ok(`We are already playing. ${s.question}`); }
  intro = c.known === 0
    ? 'Great, let us play "get to know me"! I will ask one thing at a time. Say "skip" for anything you would rather not answer, or "stop" whenever you like. '
    : `Welcome back${s.fields.name ? `, ${list(s.fields.name.v)[0]}` : ''}! Let us continue where we left off. `;
  const rk = plan.find((x) => x.id === s.resumeKey);
  s.resumeKey = null;
  if (rk && isOpen(s, rk.id) && (s.asks[rk.id] ?? 0) < 2) { s.turns++; return ok(`${intro}${askField(s, plan, rk)}`); }
  const q = nextQuestion(s, plan, false);
  return ok(s.active ? `${intro}${q}` : q);
});
export const pause = W((ctx) => {
  const s = st(ctx);
  const plan = planOf(ctx);
  if (!s.active) return ok(`We are not in the middle of an interview. Say "interview me" to start one. ${meter(s, plan)}`);
  return ok(pauseReply(s, plan));
});
export const mention = W((ctx, { w }) => {
  const keys = keysOf(w);
  if (!keys.length) return no('unsupported', 'I do not know that part of your profile.');
  return start(ctx, { field: keys[0] });
});

function know(ctx) {
  const s = st(ctx);
  const plan = planOf(ctx);
  const lines = plan.filter((p) => known(s, p.id)).map((p) => `${p.label.toLowerCase()}: ${display(s.fields[p.id].v)}${s.fields[p.id].src === 'guessed' ? ' (a guess, please confirm)' : ''}`);
  if (!lines.length) return `I do not know anything about you yet. Say "interview me" and we can change that. ${meter(s, plan)}`;
  const skipped = plan.filter((p) => s.skipped[p.id] && !known(s, p.id) && s.skipped[p.id] !== 'unclear').map((p) => p.label.toLowerCase());
  const priv = s.sensitive.length ? ` I also keep ${s.sensitive.length} private ${s.sensitive.length === 1 ? 'note' : 'notes'} you asked me to remember.` : '';
  return `Here is what I know about you: ${lines.join('; ')}. ${meter(s, plan)}${skipped.length ? ` You preferred not to talk about ${joinAnd(skipped)}, so I will not ask.` : ''}${priv}`;
}
export const knowAction = W((ctx) => ok(know(ctx)));
export { knowAction as know };
export const progress = W((ctx) => {
  const s = st(ctx); const plan = planOf(ctx); const c = counts(s, plan);
  return ok(`I know ${c.known} of ${c.total} things about you${c.skipped ? `, and ${c.skipped} you preferred to skip` : ''}.${c.known < c.total ? ' Say "interview me" to add more.' : ''}`);
});

/** A statement about oneself, rebuilt as a sentence from the pattern's slots and read by the same rules as an interview answer. */
export const tell = W((ctx, a) => {
  const s = st(ctx);
  const plan = planOf(ctx);
  const env = envOf(ctx, null);
  const sp = (x) => String(x ?? '').replace(/_/g, ' ');
  const quoted = (x) => String(x ?? '');
  const text = {
    role: () => `I am ${withArticle(sp(a.role))}${a.org ? ` at ${quoted(a.org)}` : ''}`,
    rolefield: () => `I work in ${sp(a.f)} as ${withArticle(sp(a.role))}`,
    field: () => `I work in ${sp(a.f)}`,
    org: () => `I work at ${quoted(a.org)}`,
    years: () => `I have been ${a.v ? sp(a.v) : 'working'} for ${a.n} years`,
    edu: () => `I studied ${sp(a.s)}${a.u ? ` at ${quoted(a.u)}` : ''}`,
    interests: () => `I love ${[a.a, a.b, a.c].filter(Boolean).map(sp).join(' and ')}`,
    tools: () => `I use ${[a.a, a.b, a.c].filter(Boolean).map(sp).join(' and ')}`,
    name: () => `call me ${quoted(a.name)}`,
    location: () => `I live in ${quoted(a.city)}`,
    learn: () => `I want to learn ${quoted(a.g)}`,
    pref: () => `I prefer ${sp(a.p)} answers`,
    lang: () => `I prefer answers in ${sp(a.l)}`,
    previous: () => `Before that I was ${withArticle(sp(a.role))}`,
    age: () => `I am ${a.n} years old`,
    children: () => `I have ${a.n} ${Number(a.n) === 1 ? 'child' : 'children'}`,
    likes: () => `I like ${quoted(a.l)}`,
  }[a.kind]?.();
  if (!text) return no('unsupported', 'I did not catch what to note.');
  const ex = extract(text, env);
  let items = ex.items.length ? ex.items : [];
  if (a.kind === 'likes') {   // "I like chess, music and maps": what the lexicon classified stays, every other item of the list is a hobby
    const lc = (x) => String(x).toLowerCase();
    const covered = new Set(items.flatMap((i) => list(i.value).map(lc)));
    const rest = likesItems(String(a.l ?? ''), env.lex).filter((x) => !covered.has(lc(x)));
    if (rest.length && rest.length <= 6) {
      const h = items.find((i) => i.key === 'hobbies');
      items = h ? items.map((i) => (i === h ? { ...h, value: [...list(h.value), ...rest] } : i)) : [...items, { key: 'hobbies', value: rest, how: 'interest' }];
    }
  }
  if (!items.length) return no('missing', 'I did not quite catch that. Could you say it another way?');
  const fix = a.fix === true || a.fix === 'true';
  const { changes, guess } = applyItems(ctx, s, plan, env, items, fix);
  toTab(ctx);
  const ack = ackText(ctx, s, plan, changes, fix, s.turns++);
  if (guess) {
    s.pending = { kind: 'confirm', key: 'field', value: guess.value };
    s.question = `So you work in ${String(guess.value).toLowerCase()}, right?`;
    return ok(`${ack} ${s.question}`);
  }
  return ok(ack);
});

const FIELD_WORDS = {
  job: ['role'], role: ['role'], position: ['role'], profession: ['role'], work: ['role'], occupation: ['role'], career: ['career'], name: ['name'], nickname: ['name'],
  city: ['location'], country: ['location'], location: ['location'], hometown: ['location'], company: ['org'], employer: ['org'], organisation: ['org'], organization: ['org'],
  years: ['years'], experience: ['years'], education: ['education'], degree: ['education'], studies: ['education'], study: ['education'], skills: ['skills'], skill: ['skills'],
  tools: ['tools'], tool: ['tools'], languages: ['tools'], language: ['language'], hobbies: ['hobbies'], hobby: ['hobbies'], interests: ['hobbies', 'topics', 'media', 'sports'], interest: ['hobbies', 'topics', 'media', 'sports'],
  sports: ['sports'], sport: ['sports'], music: ['media'], books: ['media'], films: ['media'], movies: ['media'], goals: ['learning', 'career', 'year'], goal: ['learning', 'career', 'year'],
  ambitions: ['career'], previous: ['previous'], learning: ['learning'], year: ['year'], length: ['length'], media: ['media'], org: ['org'], tone: ['tone'], style: ['tone', 'length'], answers: ['length'], address: ['address'], topics: ['topics'], field: ['field'], industry: ['field'], field_: ['field'],
};
const keysOf = (w) => FIELD_WORDS[String(w ?? '').toLowerCase().replace(/ /g, '_')] ?? [];

/** The user's preferred name as one shared fact (kids.common reads and writes it here): no acknowledgement, no tab switch. */
export const setName = W((ctx, { name }) => {
  const s = st(ctx);
  const n = clean(name);
  if (!n) return no('unsupported', 'What should I call you?');
  s.fields.name = { v: n, src: 'said', at: ++s.n };
  delete s.skipped.name;
  s.focus = { key: 'name', n: s.n };
  return ok(n);
});
export const nameOf = (ctx) => ok(list(st(ctx).fields.name?.v)[0] ?? '');
/** "Where do I live?" and friends: one stored field, or an honest "I do not know yet". */
export function fieldOf(ctx, { field = 'location' } = {}) {
  const v = list(st(ctx).fields[field]?.v);
  const what = { location: 'where you live', name: 'your name', role: 'what you do', org: 'where you work' }[field] ?? `your ${field}`;
  if (!v.length) return ok(`I do not know ${what} yet. You can tell me, and I will remember it.`);
  return ok(field === 'location' ? `You live in ${v.join(', ')}.` : `${field}: ${v.join(', ')}.`);
}

export const forget = W((ctx, { w }) => {
  const s = st(ctx); const plan = planOf(ctx);
  const keys = keysOf(w);
  if (!keys.length) return no('unsupported', 'I do not know that part of your profile.');
  const gone = [];
  for (const k of keys) {
    if (known(s, k)) gone.push(`${plan.find((p) => p.id === k)?.label.toLowerCase() ?? k} (${display(s.fields[k].v)})`);
    delete s.fields[k];
    s.skipped[k] = 'forgotten';
    if (k === 'role' && s.fields.field?.src === 'guessed') { gone.push(`field (${display(s.fields.field.v)}, a guess)`); delete s.fields.field; }
  }
  s.n++;
  if (s.pending && keys.includes(s.pending.key)) s.pending = null;
  return ok(gone.length ? `OK, I forgot your ${joinAnd(gone)}. I will not ask about it again.` : `I had nothing stored about your ${String(w).replace(/_/g, ' ')}, and I will not ask about it.`);
});
export const confirm = W((ctx, { w }) => {
  const s = st(ctx);
  const keys = keysOf(w);
  const k = keys.find((x) => s.fields[x]?.src === 'guessed');
  if (!k) return no('missing', 'There is nothing to confirm there.');
  s.fields[k].src = 'said'; s.focus = { key: k, n: ++s.n };
  if (s.pending?.kind === 'confirm' && s.pending.key === k) s.pending = null;
  return ok(`Thanks, I noted your ${k} as ${display(s.fields[k].v)}.`);
});

function wipe(ctx) {
  const s = ctx.state;
  const fresh = initialState();
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, fresh, { n: 1 });
  return 'Done: I deleted everything I knew about you, including any private notes and what you asked me to skip.';
}
export const deleteProfile = W((ctx, { now }) => {
  const s = st(ctx);
  if (now === true || now === 'true') return ok(wipe(ctx));
  s.pending = { kind: 'delete' };
  return ok('Do you want me to delete your whole profile? Say "yes" to confirm, or "no" to keep it.');
});
export { deleteProfile as delete };
export const exportProfile = W((ctx, { fmt }) => {
  const s = st(ctx); const plan = planOf(ctx);
  if (!counts(s, plan).known && !s.sensitive.length) return no('missing', 'There is nothing to export yet. Say "interview me" first.');
  const f = String(fmt ?? 'json').toLowerCase();
  const name = list(s.fields.name?.v)[0]?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile';
  const out = [];
  if (f === 'json' || f === 'both') { ctx.effect('file.download', { filename: `${name}-profile.json`, text: toJson(s, plan), mime: 'application/json' }); out.push('JSON'); }
  if (f === 'md' || f === 'markdown' || f === 'cv' || f === 'both') { ctx.effect('file.download', { filename: `${name}-cv.md`, text: toMarkdown(s, plan, sectionsOf(ctx)), mime: 'text/markdown' }); out.push('Markdown CV'); }
  if (!out.length) return no('unsupported', 'I can export your profile as JSON or as a Markdown CV.');
  return ok(`I prepared your profile as ${joinAnd(out)}; your browser is downloading it. Nothing leaves this browser.`);
});
export const sensitiveAction = W((ctx, { cat, text, remember }) => {
  const s = st(ctx);
  if (remember === true || remember === 'true') {
    s.sensitive.push({ cat: cat ?? 'other', text: clean(text ?? cat).slice(0, 160) });
    return ok('OK, I will remember that. It stays in this browser, you can see it in the tab and delete it any time.');
  }
  return ok('Thanks for telling me. I do not keep things like that unless you say "remember", so I have not stored it.');
});
export { sensitiveAction as sensitive };
