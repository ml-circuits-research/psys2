// Understanding what the user says about themselves (spec 12). Browser-safe, imports nothing.
//
// Pure functions over plain text and a lexicon accessor `lex(id) -> string[]` (the words of `lex.user.profile.<id>`). They are the rule
// layer behind the interview: patterns.sop recognises the statements that are clear enough to act on without a pending question, this
// module reads free answers while the interview (or a confirmation) is waiting for one. Nothing here uses a model.
//
// extract(text, env) -> { items, deny, sens }
//   items: [{ key, value, entry?, how }]   one per profile field found (value: string, or string[] for card=many fields)
//   env:   { lex, industries: [{ id, label, words }], pending: key | null, plan: { [key]: { card } } }

const STOP_FILLER = new Set(['please', 'ok', 'okay', 'well', 'so', 'um', 'uh', 'hmm', 'hey', 'oh', 'yeah', 'yes', 'and', 'then', 'also', 'just', 'maybe', 'probably', 'mostly', 'mainly']);
const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const SPECIAL = {
  python: 'Python', sql: 'SQL', javascript: 'JavaScript', typescript: 'TypeScript', java: 'Java', rust: 'Rust', ruby: 'Ruby', php: 'PHP', kotlin: 'Kotlin', swift: 'Swift', matlab: 'MATLAB',
  excel: 'Excel', powerpoint: 'PowerPoint', figma: 'Figma', photoshop: 'Photoshop', illustrator: 'Illustrator', jira: 'Jira', git: 'Git', docker: 'Docker', kubernetes: 'Kubernetes',
  linux: 'Linux', aws: 'AWS', azure: 'Azure', tableau: 'Tableau', power_bi: 'Power BI', sap: 'SAP', salesforce: 'Salesforce', autocad: 'AutoCAD', solidworks: 'SolidWorks', react: 'React',
  django: 'Django', pandas: 'pandas', tensorflow: 'TensorFlow', pytorch: 'PyTorch', notion: 'Notion', slack: 'Slack', bash: 'Bash', html: 'HTML', css: 'CSS', postgres: 'Postgres',
  mysql: 'MySQL', mongodb: 'MongoDB', ai: 'AI', hr_manager: 'HR manager', ceo: 'CEO', qa_engineer: 'QA engineer', ml_engineer: 'ML engineer', ux_designer: 'UX designer', ui_designer: 'UI designer',
  ux_researcher: 'UX researcher', it_manager: 'IT manager', phd_student: 'PhD student', devops_engineer: 'DevOps engineer', 'k-pop': 'K-pop', 'sci-fi': 'sci-fi', hiv: 'HIV',
  english: 'English', romanian: 'Romanian', french: 'French', german: 'German', spanish: 'Spanish', italian: 'Italian', portuguese: 'Portuguese', dutch: 'Dutch', polish: 'Polish', hungarian: 'Hungarian',
  russian: 'Russian', ukrainian: 'Ukrainian', turkish: 'Turkish', greek: 'Greek', arabic: 'Arabic', hindi: 'Hindi', chinese: 'Chinese', mandarin: 'Mandarin', japanese: 'Japanese', korean: 'Korean',
  swedish: 'Swedish', norwegian: 'Norwegian', danish: 'Danish', finnish: 'Finnish', czech: 'Czech', bulgarian: 'Bulgarian', serbian: 'Serbian', croatian: 'Croatian',
  computer_science: 'computer science', maths: 'maths',
};
/** Display form of a lexicon entry. */
export const pretty = (entry) => SPECIAL[entry] ?? String(entry).replace(/_/g, ' ');
const titleCase = (s) => String(s).replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
const sentenceCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const singular = (w) => {
  w = String(w).toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
};

// ---- normalisation ---------------------------------------------------------------------------------------------------------
/** Lowercase, expanded contractions, number words as digits, punctuation to spaces (apostrophes and hyphens inside words kept). */
export function norm(text) {
  let t = String(text ?? '').toLowerCase().replace(/[‘’]/g, "'");
  t = t.replace(/\bi'm\b/g, 'i am').replace(/\bi've\b/g, 'i have').replace(/\bi'd\b/g, 'i would').replace(/\bi'll\b/g, 'i will').replace(/\bit's\b/g, 'it is').replace(/\bthat's\b/g, 'that is')
    .replace(/\bdon't\b/g, 'do not').replace(/\bcan't\b/g, 'can not').replace(/\bwon't\b/g, 'will not').replace(/\bwhat's\b/g, 'what is').replace(/\bname's\b/g, 'name is');
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b(?= (?:\+ )?(?:years?|yrs?)\b)/g,
    (_m, a, b) => String((NUM_WORDS[a] ?? 0) + (b ? NUM_WORDS[b] : 0)));
  t = t.replace(/\ba decade\b/g, '10 years').replace(/\bhalf a decade\b/g, '5 years');
  return t.replace(/[^a-z0-9'+#\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const toks = (n) => (n ? n.split(' ') : []);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/^[\s,;:.!?-]+|[\s,;:.!?-]+$/g, '').trim();
const words = (s) => clean(s).split(' ').filter(Boolean);

// ---- lexicon matching ------------------------------------------------------------------------------------------------------
/** Longest-first matches of lexicon entries (multi-word entries use `_`) in the tokens, singular or plural. */
export function findEntries(tokens, entries) {
  entries = entries.filter((e) => !entries.includes(`${e}s`));   // lemma variants of words that end in s (physic, physics) are for the pattern slots only
  const parts = entries.map((e) => ({ e, p: e.split('_') })).sort((a, b) => b.p.length - a.p.length);
  const hits = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const { e, p } of parts) {
      if (i + p.length > tokens.length) continue;
      let ok = true;
      for (let j = 0; j < p.length && ok; j++) {
        const t = tokens[i + j];
        ok = t === p[j] || (j === p.length - 1 && singular(t) === singular(p[j]));
      }
      if (ok) { hits.push({ entry: e, start: i, end: i + p.length }); i += p.length - 1; break; }
    }
  }
  return hits;
}
const hasWord = (n, re) => re.test(` ${n} `);

// ---- small recognisers -----------------------------------------------------------------------------------------------------
export const YES = /^(?:yes|yeah|yep|yup|sure|right|correct|exactly|indeed|absolutely|of course|uh huh|mhm|ok|okay|that is right|that is correct|thats right|you got it|spot on)\b/;
export const NO = /^(?:no|nope|nah|not really|wrong|incorrect|not quite|not exactly|that is wrong|thats wrong|not at all)\b/;
export const STOPWORDS = /^(?:pause|stop|enough|that is enough|thats enough|lets stop|let us stop|not now|never mind|nevermind|forget it|cancel|drop it|end|quit|exit|stop the interview|pause the interview|end the interview|stop asking|i am done|im done|that will do|later)\b/;
export const SKIPWORDS = /^(?:skip|next|pass|skip it|skip that|skip this|next one|next question|another one|something else|ask something else|i would rather not(?: say| answer)?|i would rather not talk about it|rather not|id rather not|prefer not(?: to say)?|i prefer not(?: to say)?|no comment|i do not want to say|i dont want to say|not telling|none of your business|private|i do not know|i dont know|dont know|not sure|no idea|do not know|n a|nothing|none|nope|no|nah|not really|i have none|i do not have any|i dont have any|i do not have one|i dont have one|nothing special)\b/;
const DECLINE = /\b(?:rather not|prefer not|no comment|do not want to say|dont want to say|not telling|none of your business|private)\b/;
export const isDecline = (n) => DECLINE.test(n);
export const isSkip = (n) => SKIPWORDS.test(n) && n.split(' ').length <= 8;
export const isStop = (n) => STOPWORDS.test(n) && n.split(' ').length <= 6;
const CORRECTION = /^(?:no|nope|nah|not quite|actually|sorry|wait|oops|i mean|i meant|correction|that is wrong|thats wrong|make that|rather|or rather|no wait|wait no|well actually)\b[,;:]?\s*/;
export const correctionRest = (n) => { const m = CORRECTION.exec(n); return m ? n.slice(m[0].length) : null; };

const NOT_ROLE = new Set(['tired', 'happy', 'fine', 'good', 'great', 'ok', 'okay', 'sorry', 'from', 'interested', 'not', 'just', 'here', 'going', 'trying', 'learning', 'studying', 'looking', 'afraid', 'sure',
  'ready', 'new', 'bit', 'little', 'big', 'huge', 'fan', 'lover', 'person', 'human', 'guy', 'girl', 'man', 'woman', 'bot', 'robot', 'very', 'really', 'also', 'still', 'now', 'currently', 'kind', 'sort',
  'lot', 'beginner', 'bad', 'busy', 'bored', 'curious', 'excited', 'nervous', 'working', 'doing', 'having', 'getting', 'being', 'in', 'at', 'on', 'the', 'my', 'your', 'our', 'his', 'her', 'its', 'one',
  'friend', 'parent', 'mother', 'father', 'dad', 'mom', 'mum', 'son', 'daughter', 'husband', 'wife', 'brother', 'sister', 'child', 'kid']);
const NOT_NAME = new Set(['me', 'you', 'back', 'later', 'something', 'crazy', 'a', 'an', 'the', 'it', 'when', 'if', 'now', 'maybe', 'tomorrow', 'today', 'tonight', 'soon', 'anything', 'whatever', 'nothing', 'yes', 'no', 'ok', 'okay',
  'please', 'sir', 'madam', 'boss', 'dude', 'man', 'robot', 'bot', 'mister', 'friend', 'buddy', 'pal', 'names', 'name', 'what', 'who', 'that', 'this', 'everything', 'stop', 'quit', 'anyone', 'whenever']);
const TITLES = /^(?:dr|mr|mrs|ms|miss|prof|professor|sir|madam|mx)\.?$/i;
const ORG_BAD = new Set(['home', 'night', 'nights', 'weekends', 'weekend', 'work', 'times', 'it', 'least', 'most', 'all', 'once', 'a', 'an', 'the', 'moment', 'present', 'hours', 'day', 'days', 'some', 'any', 'least', 'last', 'first', 'bit', 'lot']);
const BAD_ADVERB = /^(?:also|still|now|currently|just|really|actually|basically|mostly|mainly|usually|always|sometimes|full|part)\b/;

// ---- sensitive content -----------------------------------------------------------------------------------------------------
/**
 * Volunteered sensitive content (health, religion, politics, sexuality, money, address, age). Returns { cat, remember } or null.
 * The system never asks for any of this and keeps it only when the user says remember.
 */
export function sensitive(text, lex) {
  const n = norm(text);
  if (!n) return null;
  const remember = /\b(?:remember|keep|note|save|store)\b/.test(n) && !/\b(?:do not|dont|don t|not) (?:remember|keep|save|store)\b/.test(n);
  if (/\b(\d{1,3}) years? old\b/.test(n) || /^i am (\d{2})$/.test(n) || /\bmy age is\b/.test(n) || /\bi am (?:in my )?(?:\d0s|\d{2}) /.test(n) && /\bold\b/.test(n)) return { cat: 'age', remember };
  if (/\b\d{1,4}\s+[a-z]+\s+(?:street|st|road|rd|avenue|ave|lane|boulevard|blvd|drive)\b/.test(n) || /\bmy (?:home )?address\b/.test(n)) return { cat: 'address', remember };
  const first = /\b(?:i am|i have|i had|i suffer|i take|i follow|i practice|i practise|i identify|i vote|i voted|i earn|i make|i was diagnosed|i am diagnosed|i belong|i believe|i support|my)\b/.test(n);
  if (!first) return null;
  const t = toks(n);
  for (const cat of ['health', 'religion', 'politics', 'sexuality', 'money', 'address']) {
    const hits = findEntries(t, lex(`sensitive.${cat}`) ?? []);
    if (!hits.length) continue;
    if (cat === 'money' && !/\b(?:my|i earn|i make)\b/.test(n)) continue;
    if (cat === 'address' && !/\bmy\b/.test(n)) continue;
    return { cat, remember };
  }
  if (/\bmy (?:religion|salary|income|health|diagnosis|politics|political|orientation|illness|medication)\b/.test(n)) return { cat: 'other', remember };
  return null;
}

// ---- field extractors ------------------------------------------------------------------------------------------------------
function roleCandidates(n, t, lex) {
  const hits = findEntries(t, lex('roles') ?? []);
  return hits.map((h) => ({ ...h, before: t.slice(Math.max(0, h.start - 3), h.start).join(' ') }));
}
const ROLE_MARK = /\b(?:i am|i work as|i am working as|i worked as|i have a job as|my job is|my role is|my profession is|my title is|i do|as|working as|i became|i have become)\s*(?:a|an|the|senior|junior|lead|head of)?\s*$/;
const PAST_MARK = /\b(?:before that|previously|formerly|in the past|used to be|used to work as|i was|i worked as|earlier i was|i have been|i had been)\b/;

function guessOrg(n, rest) {
  const m = /\b(?:at|for|with)\s+(?:the\s+)?([a-z0-9&.'-]+(?:\s+(?:[a-z0-9&.'-]+|of|and|&)){0,4}?)(?=\s+(?:and|but|since|where|because|in|as|now|currently|for|these|on|so)\b|$)/.exec(rest);
  if (!m) return null;
  const org = clean(m[1]);
  const w = org.split(' ');
  if (!org || ORG_BAD.has(w[0]) || w.length > 5) return null;
  if (/^\d+\s*(?:years?|yrs?)/.test(org)) return null;
  return org;
}
/** Original-case slice of the sentence for a normalized phrase (so company names keep their capitals). */
function original(raw, phrase) {
  if (!phrase) return phrase;
  const re = new RegExp(phrase.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s,]+'), 'i');
  const m = re.exec(raw);
  return m ? m[0].replace(/\s+/g, ' ') : phrase;
}
const orgPretty = (raw, org) => { const o = original(raw, org); return /[A-Z]/.test(o) ? o : /^[a-z]/.test(o) && o.split(' ').length <= 2 ? titleCase(o) : o; };

function industryOf(entry, lex, industries) {
  for (const ind of industries) if ((lex(`role.${ind.id}`) ?? []).includes(entry)) return ind;
  return null;
}
function industryByWord(tokens, lex, industries) {
  const hits = findEntries(tokens, lex('fields') ?? []);
  for (const h of hits) { const ind = industries.find((i) => i.words.includes(h.entry)); if (ind) return { ind, hit: h }; }
  return null;
}

function listItems(raw, lead = null) {
  let s = String(raw ?? '');
  const leads = /^(?:\s*(?:well|so|um|hmm|oh|yeah|yes|and|also|just|maybe|probably|mostly|mainly|usually|i would say|i guess|i think|let me think|i love|i really love|i like|i really like|i enjoy|i am into|i am a big fan of|i am a fan of|i am passionate about|i am interested in|i have|my hobbies are|my hobby is|my interests are|my favou?rites? (?:are|is|would be)|my skills are|i am good at|i am pretty good at|i am great at|i use|i mostly use|i mainly use|i work with|i code in|i program in|i write|i know|my stack is|i am learning|i want to learn|i would like to learn|i like to|i love to|i love|like|love|enjoy|some|a bit of|lots of|a lot of|mostly|mainly|things like|stuff like|such as|for example|e g)\b[\s,:]*)+/i;
  s = s.replace(/[‘’]/g, "'").replace(/\bI'm\b/gi, 'I am').replace(/\bI've\b/gi, 'I have');
  s = s.replace(leads, '');
  s = s.replace(/\b(?:and|etc|mostly|mainly|too|as well|a lot|lots|really|pretty much|of course|obviously)\s*[.!?]*$/i, '');
  const parts = s.split(/\s*(?:,|;|\band\b|&|\/|\bplus\b|\bas well as\b)\s*/i).map((x) => clean(x).replace(/^(?:the|a|an|some|my|to|also|maybe)\s+/i, '')).filter(Boolean);
  return parts.filter((p) => p.split(' ').length <= 5 && p.length <= 48 && !/^(?:etc|stuff|things|more|others|all)$/i.test(p));
}
const canonItem = (item, lexicons) => {
  const t = toks(norm(item));
  for (const lx of lexicons) {
    const hits = findEntries(t, lx);
    if (hits.length === 1 && hits[0].start === 0 && hits[0].end === t.length) return pretty(hits[0].entry);
  }
  return /[A-Z]/.test(item) ? item : item.toLowerCase();
};

function parseYears(n) {
  let m = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b(?!\s*old)/.exec(n);
  if (m) return Number(m[1]);
  m = /\b(?:over|about|around|almost|nearly|roughly|more than|for)?\s*(\d{1,2})\b\s*(?:years?)?$/.exec(n);
  if (m && /^(?:about |around |roughly |almost |nearly |over |more than |for |it is |it s )?\d{1,2}(?: years?| yrs?)?$/.test(n)) return Number(m[1]);
  return null;
}

/**
 * Read what the user said about themselves. `pending` is the field of the question that is waiting for an answer (short answers
 * like "nurse" or "12 years" are read as answers to it). Returns the fields found; `deny` is true for a clear "no".
 */
// ---- plausibility: does a value fit the type of its field? -------------------------------------------------------------------
const CLAUSE_LEAD = new Set(['i', 'my', 'we', 'he', 'she', 'they', 'it', 'you', 'his', 'her', 'our', 'their', 'there', 'that', 'this', 'because', 'when', 'if', 'but', 'then', 'what', 'how', 'why']);
const CLAUSE_VERB = new Set(['was', 'were', 'did', 'took', 'went', 'got', 'had', 'am', 'is', 'are', 'told', 'said', 'made', 'gave', 'let']);
/** True for a clause or a story ("my dad took me", "it was fun"): never a value of a profile field. */
export function clauseLike(v) {
  const t = toks(norm(Array.isArray(v) ? v.join(' ') : v));
  return t.length > 0 && (CLAUSE_LEAD.has(t[0]) || t.slice(1).some((w) => CLAUSE_VERB.has(w)) || CLAUSE_VERB.has(t[0]));
}
const MAX_WORDS = { learning: 8, skills: 6, tools: 6, hobbies: 6, topics: 6, media: 8, sports: 6, previous: 6, role: 7, org: 7, field: 6, location: 5, education: 10, name: 3, address: 5, career: 16, year: 16, length: 3, tone: 3, language: 3 };
/** Type check per field: an activity/skill/topic noun phrase, a role, an organisation, a number of years, a place ... and never a clause. */
export function fits(key, value) {
  const s = clean(Array.isArray(value) ? value.join(' ') : value);
  if (!s) return false;
  if (key === 'years') return /\d/.test(s) && !clauseLike(s.replace(/\d+\+?/g, '')) ;
  if (clauseLike(s)) return false;
  if (key === 'career' || key === 'year') return words(s).length <= MAX_WORDS[key];
  if (/\b(?:i|me|we|you)\b/i.test(s)) return false;
  if (key === 'location' && /\d/.test(s)) return false;
  return words(s).length <= (MAX_WORDS[key] ?? 12);
}
/** A value that is safe to repeat in an acknowledgement (short, and not a clause). */
export const echoable = (v) => { const s = clean(Array.isArray(v) ? v.join(' ') : v); return !!s && words(s).length <= 8 && !clauseLike(s) && !/\b(?:i|me|we|you)\b/i.test(s); };

export function extract(text, env) {
  const { lex = () => [], industries = [], pending = null } = env ?? {};
  const raw = String(text ?? '').trim();
  let n = norm(raw);
  const out = { items: [], deny: false, yes: false, sens: null, correction: false, rest: n };
  if (!n) return out;
  const rest = correctionRest(n);
  if (rest !== null) { out.correction = true; if (rest === '') { out.deny = NO.test(n); return out; } n = rest; }
  out.rest = n;
  out.yes = YES.test(n);
  out.deny = NO.test(n) && !out.correction;
  const t = toks(n);
  const put = (key, value, extra = {}) => { if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return; const i = out.items.findIndex((x) => x.key === key); if (i >= 0) out.items.splice(i, 1); out.items.push({ key, value, ...extra }); };
  const short = t.length <= 6;
  const bareAnswer = pending !== null;

  // ---- name ---------------------------------------------------------------------------------------------------------
  {
    const m = /\b(?:call me|you can call me|just call me|please call me|my name is|my name's|name is|i am called|people call me|everyone calls me|friends call me|i go by|they call me|call me by)\s+(?:the\s+)?([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*)?)/iu.exec(raw.replace(/[‘’]/g, "'"));
    if (m) {
      const parts = m[1].split(/\s+/).filter((w) => !NOT_NAME.has(w.toLowerCase()) || TITLES.test(w));
      const first = parts[0];
      if (first && !NOT_NAME.has(first.toLowerCase()) && !/^(?:a|an|the|my|your|our)$/i.test(first)) {
        const nm = parts.slice(0, TITLES.test(first) ? 2 : 1).map((w) => sentenceCase(w)).join(' ');
        if (!findEntries([first.toLowerCase()], lex('roles') ?? []).length || /[A-Z]/.test(first)) put('name', nm, { how: 'name' });
      }
    } else if (/^i am ([A-Z][\p{L}'-]+)(?: ([A-Z][\p{L}'-]+))?$/u.test(raw.replace(/[‘’]/g, "'").replace(/\bI'm\b/g, 'I am').replace(/[.!]+$/, '')) && pending === 'name') {
      const mm = /^i am ([A-Z][\p{L}'-]+)(?: ([A-Z][\p{L}'-]+))?$/u.exec(raw.replace(/\bI'm\b/g, 'I am').replace(/[.!]+$/, ''));
      if (mm && !NOT_NAME.has(mm[1].toLowerCase())) put('name', mm[2] ? `${mm[1]} ${mm[2]}` : mm[1], { how: 'name' });
    }
  }

  // ---- role (current and previous), organisation, field --------------------------------------------------------------
  const roleHits = roleCandidates(n, t, lex);
  let roleDone = false;
  const pastHit = PAST_MARK.test(n);
  const selfRole = /\b(?:i am|i was|i worked as|used to be|i work as|i am working as|i have a job as|my job is|my role is|my profession is|my title is|i do|working as|i became|as)\b/.test(n);
  if (roleHits.length && (selfRole || (pending === 'role' && short) || (pending === 'previous'))) {
    const marked = roleHits.find((h) => ROLE_MARK.test(`${h.before} `.replace(/^.*?((?:i am|i work as|i am working as|my job is|my role is|do|as|working as)\s*.*)$/, '$1'))) ?? roleHits[0];
    const prev = pending === 'previous' || (pastHit && !/\bi (?:am|work as|am working as)\b/.test(n));
    if (prev) put('previous', roleHits.map((h) => pretty(h.entry)), { how: 'previous', entry: roleHits[0].entry });
    else {
      // "senior software engineer": keep the words in front of the role that are modifiers
      const mods = [];
      for (let i = marked.start - 1; i >= 0 && mods.length < 2; i--) if (/^(?:senior|junior|lead|principal|chief|head|staff|freelance|part-time|full-time|former|trainee)$/.test(t[i])) mods.unshift(t[i]); else break;
      put('role', [...mods, pretty(marked.entry)].join(' '), { how: 'role', entry: marked.entry });
    }
    roleDone = true;
  }
  if (!roleDone && /\bi (?:am|work as|am working as)\s+(?:a |an )?/.test(n) && !pastHit) {
    const m = /\bi (?:am|work as|am working as)\s+(?:a |an |the )?([a-z][a-z-]*(?: [a-z][a-z-]*){0,3}?)(?=\s+(?:at|for|with|in|and|but|since|from|who|where|because|so|now|currently)\b|$)/.exec(n);
    if (m) {
      const phrase = clean(m[1]);
      const w = phrase.split(' ');
      if (!NOT_ROLE.has(w[0]) && !BAD_ADVERB.test(phrase) && !sensitive(raw, lex) && !(findEntries(t, lex('interests') ?? []).length && /\bfan of\b/.test(n))) put('role', phrase, { how: 'role-free' });
    }
  }
  if (!roleDone && pending === 'role' && !out.items.length && short && !isSkip(n) && !YES.test(n) && !/\d/.test(n)) {
    const phrase = clean(n.replace(/^(?:i am|i work as|i am working as|i do|my job is|my role is|it is|just|currently|a|an|the)\s+/g, '').replace(/^(?:a|an|the)\s+/, ''));
    if (phrase && !NOT_ROLE.has(phrase.split(' ')[0])) put('role', phrase, { how: 'role-bare', entry: findEntries(toks(phrase), lex('roles') ?? [])[0]?.entry });
  }
  // activity ("I have been teaching for 12 years")
  const years = parseYears(n);
  if (/\bi have been\s+(?:\w+ )?(?:ing|[a-z]+ing)\b/.test(n) || /\bfor \d+ years?\b/.test(n)) {
    const am = /\bi have been (?:working as (?:a |an )?)?([a-z]+ing)\b/.exec(n);
    if (am && !out.items.some((x) => x.key === 'role') && env.activities?.[am[1]]) put('role', env.activities[am[1]], { how: 'activity', guessed: true });
  }

  // organisation
  const cur = out.items.find((x) => x.key === 'role');
  if (/\b(?:myself|self employed|self-employed|freelanc\w*|my own (?:company|business|firm|boss))\b/.test(n) && (cur || pending === 'org' || /\bwork\b/.test(n))) put('org', 'Self-employed', { how: 'org' });
  else if ((cur && !pastHit) || /\bi work (?:at|for|with)\b/.test(n) || pending === 'org') {
    let org = null;
    const startIdx = cur ? n.search(/\b(?:at|for|with)\b/) : 0;
    if (cur || /\bi work (?:at|for|with)\b/.test(n)) org = guessOrg(n, startIdx >= 0 ? n.slice(startIdx) : '');
    if (!org && pending === 'org' && short && !out.items.some((x) => x.key !== 'role')) org = clean(n.replace(/^(?:i work (?:at|for|with)|at|for|with|it is|the|i am at|i am with|it s)\s+/g, '').replace(/^the\s+/, '')) || null;
    if (org && !isSkip(org) && !YES.test(org) && org.split(' ').length <= 5) put('org', orgPretty(raw, org), { how: 'org' });
  }

  // field (industry)
  {
    const m = /\b(?:work in|working in|i am in|in the|my field is|my industry is|field is|industry is|in)\b\s*(?:the\s+)?/.exec(n);
    const fh = industryByWord(t, lex, industries);
    if (fh && ((m && /\b(?:work(?:ing)? in|i am in|my field|my industry|field is|industry is|field|industry|sector)\b/.test(n)) || (pending === 'field' && short))) put('field', fh.ind.label, { how: 'field', id: fh.ind.id });
    else if (pending === 'field' && short && !out.items.length && !isSkip(n) && !YES.test(n) && !/\d/.test(n)) {
      const phrase = clean(n.replace(/^(?:i work in|i am in|in the|in|it is|the|mostly|mainly|it s)\s+/g, ''));
      if (phrase && phrase.split(' ').length <= 4) put('field', sentenceCase(phrase), { how: 'field-free' });
    }
  }

  // "R&D", "R and D", "research and development": a department / field, never a hobby
  if (/^(?:(?:the |our |in |it is |its |my )*)(?:r d|r and d|rnd|r n d|research and development)(?: department| team| dept)?$/.test(n)) put('field', 'Research and development', { how: 'field', id: 'rnd' });

  // ---- years of experience -----------------------------------------------------------------------------------------------
  if (years !== null && years >= 0 && years <= 60) {
    const isAge = /\b\d{1,3} years? old\b/.test(n);
    if (!isAge && (/\b(?:years?|yrs?)\b/.test(n) || pending === 'years')) put('years', String(years), { how: 'years' });
  }

  // ---- education ---------------------------------------------------------------------------------------------------------
  {
    const trig = /\b(?:studied|study|studying|graduated|degree|bachelor|bachelors|master|masters|phd|msc|bsc|mba|majored|major|diploma|educated|trained|qualified)\b/.test(n);
    if (trig || (pending === 'education' && !isSkip(n))) {
      const sub = findEntries(t, lex('subjects') ?? [])[0];
      const level = /\bphd\b|\bdoctorate\b/.test(n) ? 'PhD' : /\b(?:master|masters|msc|mba)\b/.test(n) ? "Master's" : /\b(?:bachelor|bachelors|bsc)\b/.test(n) ? "Bachelor's" : /\bdiploma\b/.test(n) ? 'Diploma' : null;
      let school = null;
      const rawFix = raw.replace(/[‘’]/g, "'");
      const sm = /\b(?:at|from)\s+((?:the\s+)?(?:[A-Z][\p{L}'.-]*)(?:\s+(?:of|de|and|[A-Z][\p{L}'.-]*)){0,5})/u.exec(rawFix.replace(/^(?:[a-z])/, (c) => c));
      if (sm) school = clean(sm[1]);
      else { const sm2 = /\b(?:at|from)\s+(?:the\s+)?([a-z]+(?: [a-z]+){0,3}?(?:university|college|school|institute|academy))\b/.exec(n); if (sm2) school = titleCase(sm2[1]); }
      let subject = sub ? pretty(sub.entry) : null;
      if (!subject && trig) {
        const fm = /\b(?:studied|study|studying|degree in|degree of|majored in|major in|graduated in|trained in|qualified in|bachelor(?:s)? in|master(?:s)? in|phd in|msc in|bsc in|diploma in)\s+(?:a |an |the )?([a-z]+(?: [a-z]+){0,2}?)(?=\s+(?:at|from|in|and|but|before|then|back)\b|$)/.exec(n);
        if (fm) subject = clean(fm[1]);
      }
      if (!subject && !school && pending === 'education' && short && !out.items.length) subject = clean(n.replace(/^(?:i studied|i study|i am studying|i did|i have a degree in|it is|just)\s+/g, ''));
      if (subject || school) {
        const base = subject ? (level ? `${level} in ${subject}` : sentenceCase(subject)) : (level ?? 'Studied');
        put('education', school && !(subject && new RegExp(`\\b${school.toLowerCase()}\\b`).test(subject)) ? `${base} at ${school}` : base, { how: 'education', entry: sub?.entry });
      }
    }
  }

  // ---- location ----------------------------------------------------------------------------------------------------------
  {
    const rawFix = raw.replace(/[‘’]/g, "'");
    const m = /\b(?:i live in|i now live in|now i live in|i moved to|i have moved to|i just moved to|i relocated to|we moved to|i am living in|i am based in|i am based near|i am from|i come from|i grew up in|born and raised in|i am located in|based in|living in|i stay in|i reside in)\s+((?:the\s+)?[\p{L}][\p{L}'.-]*(?:[\s,]+(?:of|de|and|[\p{L}][\p{L}'.-]*)){0,3})/iu.exec(rawFix.replace(/\bI'm\b/g, 'I am'));
    if (m) {
      let loc = clean(m[1]).replace(/\s+(?:and|but|where|since|because|now|currently|at|for|with|so|lol|haha|please|pls|thanks|thx|anyway|though|tho|lmao)\b.*$/i, '');
      if (loc && !/\d/.test(loc) && loc.split(/[\s,]+/).length <= 4 && !/\b(?:house|home|flat|apartment|village|town|city|country|countryside|suburbs|place|world|dream|apartment)\b/i.test(loc.split(/\s+/)[0] ?? '')) put('location', loc.split(/(\s+|,\s*)/).map((w) => (/^[a-z]/.test(w) && !/^(?:of|de|and|the)$/.test(w) && w.trim() ? sentenceCase(w) : w)).join('').replace(/\s*,\s*/g, ', '), { how: 'location' });
    } else if (pending === 'location' && short && !out.items.length && !isSkip(n) && !YES.test(n) && !/\d/.test(n)) {
      const phrase = clean(rawFix.replace(/^(?:i live in|i am in|i am based in|i am from|i'm from|from|in|near|around|it is|just|somewhere in|outside)\s+/i, '').replace(/\bI'm\b/g, '')).replace(/\s*,\s*/g, ', ');
      if (phrase && phrase.split(/[\s,]+/).length <= 5) put('location', titleCase(phrase), { how: 'location' });
    }
  }

  // ---- skills, tools, interests -----------------------------------------------------------------------------------------
  const listKeys = new Set(['skills', 'tools', 'hobbies', 'topics', 'media', 'sports', 'previous', 'learning']);
  const interestTrig = /\b(?:love|like|enjoy|adore|into|fan of|passionate about|hobbies|hobby|interested in|interests|favou?rite|spend (?:my )?(?:free )?time|in my free time|play|playing|watch|watching|listen to|listening to|read|reading)\b/.test(n);
  const toolTrig = /\b(?:use|using|work with|code in|program in|write|know|stack|mostly|mainly|tools?|languages?|software|experience with|proficient in|comfortable with)\b/.test(n) || (pending === 'tools' || pending === 'skills');
  const skillTrig = /\b(?:good at|great at|skilled|skills?|strong in|strength|experienced in|expert in|best at)\b/.test(n);
  const inter = findEntries(t, lex('interests') ?? []);
  const med = findEntries(t, lex('music') ?? []).concat(findEntries(t, lex('media') ?? []));
  const ab = findEntries(t, lex('abilities') ?? []);
  const toolHits = findEntries(t, lex('tools') ?? []);
  const skillHits = findEntries(t, lex('skills') ?? []);
  const wantsList = pending && listKeys.has(pending) && !/^\d+$/.test(n);
  const alreadyRole = out.items.some((x) => x.key === 'role' || x.key === 'previous');
  if (!alreadyRole || wantsList) {
    // tools
    if (toolHits.length && (toolTrig || pending === 'tools' || pending === 'skills') && (pending !== 'hobbies')) {
      const key = pending === 'skills' && !toolHits.length ? 'skills' : 'tools';
      put(key === 'tools' ? 'tools' : 'tools', toolHits.map((h) => pretty(h.entry)), { how: 'tools' });
    }
    if (skillHits.length && (skillTrig || pending === 'skills') && !(toolHits.length && pending === 'tools')) put('skills', skillHits.map((h) => pretty(h.entry)), { how: 'skills' });
    // interests: classify every hit
    const interestCtx = interestTrig || ['hobbies', 'topics', 'media', 'sports'].includes(pending);
    if (inter.length && interestCtx && !toolHits.length) {
      const bucket = { hobbies: [], sports: [], topics: [], media: [] };
      const sportsL = lex('sports') ?? [], hobL = lex('hobbies') ?? [], topL = lex('topics') ?? [], musL = lex('music') ?? [];
      for (const h of inter) {
        const e = h.entry;
        let key = ['hobbies', 'sports', 'topics', 'media'].includes(pending) && ((pending === 'sports' && sportsL.includes(e)) || (pending === 'hobbies' && hobL.includes(e)) || (pending === 'topics' && topL.includes(e)) || (pending === 'media' && (musL.includes(e)))) ? pending
          : musL.includes(e) ? 'media' : hobL.includes(e) ? 'hobbies' : sportsL.includes(e) ? 'sports' : 'topics';
        if (/\b(?:play|playing|team|match)\b/.test(n) && sportsL.includes(e)) key = 'sports';
        bucket[key].push(pretty(e));
      }
      for (const [k, v] of Object.entries(bucket)) if (v.length) put(k, [...new Set(v)], { how: 'interest', entry: inter.find((h) => pretty(h.entry) === v[0])?.entry });
    }
    if (med.length && !out.items.some((x) => x.key === 'media') && interestCtx && !inter.length) put('media', med.map((h) => pretty(h.entry)), { how: 'interest' });
  }
  // bare list answers to a pending list question
  if (wantsList && !out.items.length && !isSkip(n) && !YES.test(n) && !(out.deny)) {
    const lists = { skills: [lex('skills'), lex('tools')], tools: [lex('tools')], hobbies: [lex('hobbies'), lex('music'), lex('sports')], topics: [lex('topics')], media: [lex('music'), lex('media')], sports: [lex('sports')], previous: [lex('roles')], learning: [lex('abilities'), lex('langs'), lex('topics'), lex('hobbies')] };
    const items = listItems(raw).map((x) => canonItem(x, (lists[pending] ?? []).map((l) => l ?? [])));
    if (items.length && items.length <= 8 && t.length <= 24 && !(pending !== 'learning' && /\b(?:i am|i work|i live|i have been)\b/.test(n))) put(pending, [...new Set(items)], { how: 'list' });
  }

  // ---- goals ------------------------------------------------------------------------------------------------------------
  {
    const strip = (s) => clean(s.replace(/^(?:i want to|i would like to|i wanna|i hope to|i plan to|i am planning to|i am hoping to|my goal is to|my goal is|my plan is to|i intend to|i will|i am going to|i would love to|i want|to)\s+/g, '').replace(/^(?:learn|study)\s+/, ''));
    const raw1 = n.replace(/^(?:well |so |um |hmm |yes |maybe |probably )+/, '');
    if (/\b(?:i want to learn|i would like to learn|i wanna learn|i am learning|i am trying to learn|i would love to learn|i hope to learn|teach myself|i want to study|i plan to learn)\b/.test(n) && !pending?.match(/^(?:career|year)$/)) {
      const v = clean(n.replace(/^.*?\b(?:learn(?:ing)?|study|teach myself)\s+/, ''));
      if (v && v.split(' ').length <= 8) put('learning', [canonItem(clean(raw.replace(/^.*?\b(?:learn(?:ing)?|study|teach myself)\s+/i, '')), [lex('abilities') ?? [], lex('langs') ?? [], lex('topics') ?? []])], { how: 'goal' });
    } else if (/\b(?:this year|by december|by the end of the year|in 20\d\d)\b/.test(n) && /\b(?:i want|goal|plan|aim|hope|will|going to|would like)\b/.test(n) && pending !== 'career') {
      const v = strip(raw1.replace(/\b(?:this year|by december|by the end of the year)\b[,]?/g, '').replace(/\bmy goal\b/, 'my goal'));
      if (v && v.split(' ').length <= 16) put('year', original(raw, v), { how: 'goal' });
    } else if (/\b(?:i want to become|i would like to become|my goal is to become|i hope to become|i aim to become|i want to be a|i would like to be a|i dream of becoming|i want a promotion|i want to lead|i want to start my own)\b/.test(n) && !pending?.match(/^(?:learning|year)$/)) {
      put('career', original(raw, strip(raw1)), { how: 'goal' });
    } else if (['learning', 'career', 'year'].includes(pending) && !out.items.length && !isSkip(n) && !YES.test(n) && t.length <= 24) {
      const v = strip(raw1);
      if (v && !(pending === 'learning' && listItems(raw).length > 1 && false)) {
        if (pending === 'learning') put('learning', listItems(original(raw, v)).map((x) => canonItem(x, [lex('abilities') ?? [], lex('langs') ?? [], lex('topics') ?? []])).slice(0, 6), { how: 'goal' });
        else put(pending, sentenceCase(original(raw, v)), { how: 'goal' });
      }
    }
  }

  // ---- preferences and address ---------------------------------------------------------------------------------------------
  {
    const talk = /\b(?:answers?|replies|reply|responses?|explanations?|keep it|be |prefer|like it|talk|speak|write|sound)\b/.test(n);
    const shortW = /\b(?:short|brief|concise|quick|to the point|tldr|tl dr|crisp|snappy)\b/.test(n);
    const longW = /\b(?:detailed|long|thorough|in depth|in-depth|full|elaborate|explain everything|more detail|lots of detail|details)\b/.test(n);
    if ((pending === 'length' || talk) && (shortW !== longW)) put('length', shortW ? 'short' : 'detailed', { how: 'pref' });
    const formal = /\b(?:formal|formally|professional|polite|proper)\b/.test(n) && !/\binformal\b/.test(n);
    const casual = /\b(?:casual|informal|relaxed|friendly|chill|laid back|laid-back|easygoing|casually)\b/.test(n);
    if ((pending === 'tone' || talk) && formal !== casual && pending !== 'address') put('tone', formal ? 'formal' : 'casual', { how: 'pref' });
    if (pending === 'address' && !isSkip(n)) {
      const dm = /\b(dr|mr|mrs|ms|miss|prof|professor|sir|madam)\.?\s+([\p{L}][\p{L}'-]*)/iu.exec(raw);
      if (dm) put('address', `${sentenceCase(dm[1].toLowerCase())}. ${sentenceCase(dm[2])}`, { how: 'address' });
      else if (/\bfirst name|casual|informal|relaxed|nickname|friendly|just my name|by my name|on a first\b/.test(n)) put('address', 'first name', { how: 'address' });
      else if (/\bformal|formally|politely|proper|respectful|sir|madam|title|surname|last name\b/.test(n)) put('address', 'formal', { how: 'address' });
      else if (short) put('address', clean(n), { how: 'address' });
    }
    const lh = findEntries(t, lex('langs') ?? []);
    const langCtx = /\b(?:in|speak|reply|answer|prefer|language|talk|write)\b/.test(n);
    if (lh.length && ((pending === 'language' && short) || (langCtx && /\b(?:answers?|replies|reply|respond|prefer|speak to me|talk to me|language is|in)\b/.test(n) && /\b(?:prefer|reply|answer|respond|speak to me|talk to me|language is|answers? in|replies in|write to me)\b/.test(n)))) put('language', pretty(lh[0].entry), { how: 'pref' });
    else if (pending === 'language' && short && !isSkip(n) && !YES.test(n) && !out.items.length) put('language', titleCase(clean(n.replace(/^(?:in|i prefer|prefer|it is|mostly)\s+/g, ''))), { how: 'pref' });
  }
  if (pending === 'name' && !out.items.length && short && !isSkip(n) && !YES.test(n)) {
    const cleaned = clean(raw.replace(/[‘’]/g, "'").replace(/\bI'm\b/gi, 'I am').replace(/^(?:it is|it's|i am|my name is|the name is|they call me|i go by|just|please|hi|hello|hey|call me|you can call me|well|so|um)[\s,]+/gi, '').replace(/[.!]+$/, ''));
    const w = cleaned.split(/\s+/).filter(Boolean);
    if (w.length >= 1 && w.length <= 3 && w.every((x) => /^[\p{L}][\p{L}'.-]*$/u.test(x)) && !NOT_NAME.has(w[0].toLowerCase()) && !(w.length === 1 && lex('roles').includes(w[0].toLowerCase()))) put('name', w.map(sentenceCase).join(' '), { how: 'name-bare' });
  }
  out.items = out.items.map((it) => {
    const vals = Array.isArray(it.value) ? it.value : [it.value];
    const ok = vals.filter((x) => fits(it.key, x));
    return ok.length === vals.length ? it : ok.length ? { ...it, value: ok } : null;
  }).filter(Boolean);
  out.sens = sensitive(raw, lex);
  return out;
}

// ---- helpers shared with ops -----------------------------------------------------------------------------------------------
export { titleCase, sentenceCase, findEntries as _findEntries };
export function fieldForRole(entry, lex, industries) { return entry ? industryOf(entry, lex, industries) : null; }
export function fieldForRoleText(text, lex, industries) {
  const t = toks(norm(text));
  for (const h of findEntries(t, lex('roles') ?? [])) { const ind = industryOf(h.entry, lex, industries); if (ind) return ind; }
  return null;
}
export const withArticle = (s) => { const w = String(s ?? ''); return /^(?:[aeiou]|hour|honest|heir)/i.test(w) && !/^(?:uni|use|eu|one)/i.test(w) ? `an ${w}` : `a ${w}`; };
