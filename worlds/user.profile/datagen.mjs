// Generator of training examples for user.profile (spec 08, spec 12). Browser-safe, imports nothing.
// Roles, interests, tools, subjects, languages and field words come from the world's lexicons (`context.lexicons`) with small embedded fallbacks.
// The expected circuit of every text is known independently of the formalizer: one core.request with the action and the arguments the matching
// pattern family emits (in emit order). Negatives are sentences of other worlds that this world must not take.
export const version = '1';

const pick = (r, a) => a[Math.floor(r() * a.length)];
const chance = (r, p) => r() < p;
const q = (s) => JSON.stringify(String(s));
const sp = (w) => String(w).replace(/_/g, ' ');
const an = (w) => (/^[aeiou]/i.test(w) && !/^(?:uni|use|eu)/i.test(w) ? `an ${w}` : `a ${w}`);
/** The singular lemma the formalizer puts in an atom (spec 03). */
const lemma = (w) => {
  const p = String(w).split('_'); let l = p.pop();
  if (l.length > 4 && l.endsWith('ies')) l = `${l.slice(0, -3)}y`;
  else if (l.length > 4 && /(ses|xes|ches|shes)$/.test(l)) l = l.slice(0, -2);
  else if (l.length > 3 && l.endsWith('s') && !/(ss|us|is)$/.test(l)) l = l.slice(0, -1);
  return [...p, l].join('_');
};
const E = (action, args = {}) => `@x1 core.request action=prof.${action}${Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => ` arg.${k}=${v}`).join('')}`;

const FB = {
  roles: ['nurse', 'software_engineer', 'teacher', 'designer', 'chef', 'lawyer', 'accountant', 'electrician', 'photographer', 'pharmacist', 'data_scientist', 'plumber'],
  fields: ['healthcare', 'finance', 'education', 'tech', 'law', 'design', 'engineering', 'science', 'hospitality', 'retail'],
  interests: ['hiking', 'jazz', 'chess', 'reading', 'cooking', 'gardening', 'photography', 'football', 'tennis', 'painting', 'cycling', 'yoga'],
  tools: ['python', 'sql', 'excel', 'docker', 'figma', 'git', 'linux', 'tableau', 'javascript', 'photoshop'],
  subjects: ['physics', 'law', 'biology', 'history', 'economics', 'chemistry', 'architecture', 'psychology', 'medicine', 'literature'],
  langs: ['romanian', 'english', 'french', 'german', 'spanish', 'italian'],
  styles: ['short', 'brief', 'concise', 'detailed', 'formal', 'casual', 'informal'],
  fieldwords: ['job', 'name', 'hobbies', 'skills', 'education', 'city', 'goals', 'tools'],
  names: ['Andy', 'Maria', 'Tom', 'Ioana', 'Sam', 'Lena', 'Dan', 'Priya', 'Omar', 'Anna'],
  orgs: ['Acme', 'Globex', 'Initech', 'Contoso', 'Umbrella', 'Stark', 'Wayne', 'Hooli'],
  cities: ['Cluj', 'Berlin', 'Lisbon', 'Madrid', 'Toronto', 'Vienna', 'Oslo', 'Prague'],
  universities: ['Cluj', 'Oxford', 'Warsaw', 'Porto', 'Leiden', 'Uppsala'],
  goals: ['Rust', 'public speaking', 'French', 'machine learning', 'guitar', 'cooking'],
};
const STYLE_ALONE = new Set(['short', 'brief', 'concise', 'detailed', 'formal', 'casual', 'informal']);

export function generate({ rng: r, count = 300, context } = {}) {
  const lx = (id, fb) => { const w = context?.lexicons?.[`lex.user.profile.${id}`]; return (w?.length ? w : fb).filter((x) => /^[a-z]+(?:_[a-z]+)*$/.test(x)); };
  const roles = lx('roles', FB.roles).filter((w) => !['student', 'owner', 'trader'].includes(w) && lemma(w) === w);
  const fields = lx('fields', FB.fields).filter((w) => lemma(w) === w && w !== 'it' && !w.includes('_'));
  const interests = lx('interests', FB.interests).filter((w) => lemma(w) === w && !w.includes('-'));
  const tools = lx('tools', FB.tools).filter((w) => lemma(w) === w && !['go', 'r'].includes(w));
  const subjects = lx('subjects', FB.subjects).filter((w) => lemma(w) === w);
  const langs = lx('langs', FB.langs);
  const styles = lx('styles', FB.styles);
  const fw = lx('fieldwords', FB.fieldwords).filter((w) => lemma(w) === w);
  const T = [];
  const add = (group, ph, make) => T.push({ group, ph, make });
  const role = () => pick(r, roles), org = () => pick(r, FB.orgs), name = () => pick(r, FB.names);
  const numYears = () => 1 + Math.floor(r() * 35);

  add('role', 'statement', () => { const x = role(); return { text: pick(r, [`I am ${an(sp(x))}.`, `I work as ${an(sp(x))}.`, `My job is ${sp(x)}.`, `I'm ${an(sp(x))}.`]), expect: E('tell', { kind: 'role', role: x }) }; });
  add('role.org', 'multi-slot', () => { const x = role(), o = org(); return { text: pick(r, [`I am ${an(sp(x))} at ${o}.`, `I work as ${an(sp(x))} for ${o}.`, `I'm ${an(sp(x))} with ${o}.`]), expect: E('tell', { kind: 'role', role: x, org: q(o) }) }; });
  add('rolefield', 'multi-slot', () => { const x = role(), f = pick(r, fields); return { text: `I work in ${sp(f)} as ${an(sp(x))}.`, expect: E('tell', { kind: 'rolefield', f, role: x }) }; });
  add('field', 'statement', () => { const f = pick(r, fields); return { text: pick(r, [`I work in ${sp(f)}.`, `My field is ${sp(f)}.`, `I am in ${sp(f)}.`, `My industry is ${sp(f)}.`]), expect: E('tell', { kind: 'field', f }) }; });
  add('org', 'statement', () => { const o = org(); return { text: pick(r, [`I work at ${o}.`, `I work for ${o}.`]), expect: E('tell', { kind: 'org', org: q(o) }) }; });
  add('years', 'statement', () => { const n = numYears(); return pick(r, [
    { text: `I have 12 years of experience.`.replace('12', n), expect: E('tell', { kind: 'years', n }) },
    { text: `I have worked for ${n} years.`, expect: E('tell', { kind: 'years', n }) },
    { text: `I've been ${pick(r, ['teaching', 'nursing', 'coding', 'designing', 'cooking'])} for ${n} years.`, expect: null },
  ]); });
  add('years.been', 'statement', () => { const n = numYears(), v = pick(r, ['teaching', 'nursing', 'coding', 'designing', 'cooking', 'working', 'painting']); return { text: `I've been ${v} for ${n} years.`, expect: E('tell', { kind: 'years', v, n }) }; });
  add('edu', 'statement', () => { const s = pick(r, subjects), u = pick(r, FB.universities); return pick(r, [
    { text: `I studied ${sp(s)} at ${u}.`, expect: E('tell', { kind: 'edu', s: lemma(s), u: q(u) }) },
    { text: `I studied ${sp(s)}.`, expect: E('tell', { kind: 'edu', s: lemma(s) }) },
    { text: `I graduated in ${sp(s)} from ${u}.`, expect: E('tell', { kind: 'edu', s: lemma(s), u: q(u) }) },
    { text: `I have a degree in ${sp(s)}.`, expect: E('tell', { kind: 'edu', s: lemma(s) }) },
  ]); });
  const lead = () => pick(r, ['I love', 'I like', 'I enjoy', 'I really like', 'I am into', 'My hobbies are']);
  add('interests', 'statement', () => { const a = pick(r, interests); return { text: `${lead()} ${sp(a)}.`, expect: E('tell', { kind: 'interests', a: lemma(a) }) }; });
  add('interests.two', 'coordination', () => { const [a, b] = [pick(r, interests), pick(r, interests)]; if (a === b) return null; return { text: `${lead()} ${sp(a)} and ${sp(b)}.`, expect: E('tell', { kind: 'interests', a: lemma(a), b: lemma(b) }) }; });
  add('interests.three', 'coordination', () => { const [a, b, c] = [pick(r, interests), pick(r, interests), pick(r, interests)]; if (new Set([a, b, c]).size < 3) return null; return { text: `${lead()} ${sp(a)}, ${sp(b)} and ${sp(c)}.`, expect: E('tell', { kind: 'interests', a: lemma(a), b: lemma(b), c: lemma(c) }) }; });
  const tl = () => pick(r, ['Mostly', 'I use', 'I mostly use', 'I work with', 'I code in', 'My stack is']);
  add('tools', 'statement', () => { const a = pick(r, tools); return { text: `${tl()} ${sp(a)}.`, expect: E('tell', { kind: 'tools', a: lemma(a) }) }; });
  add('tools.two', 'coordination', () => { const [a, b] = [pick(r, tools), pick(r, tools)]; if (a === b) return null; return { text: `${tl()} ${sp(a)} and ${sp(b)}.`, expect: E('tell', { kind: 'tools', a: lemma(a), b: lemma(b) }) }; });
  add('tools.three', 'coordination', () => { const [a, b, c] = [pick(r, tools), pick(r, tools), pick(r, tools)]; if (new Set([a, b, c]).size < 3) return null; return { text: `${tl()} ${sp(a)}, ${sp(b)} and ${sp(c)}.`, expect: E('tell', { kind: 'tools', a: lemma(a), b: lemma(b), c: lemma(c) }) }; });
  add('name', 'statement', () => { const n = name(); return { text: pick(r, [`Call me ${n}.`, `You can call me ${n}.`, `My name is ${n}.`, `Just call me ${n}.`, `People call me ${n}.`, `I go by ${n}.`]), expect: E('tell', { kind: 'name', name: q(n) }) }; });
  add('location', 'statement', () => { const c = pick(r, FB.cities); return { text: pick(r, [`I live in ${c}.`, `I am based in ${c}.`, `I am from ${c}.`, `I come from ${c}.`]), expect: E('tell', { kind: 'location', city: q(c) }) }; });
  add('learn', 'statement', () => { const g = pick(r, FB.goals); return { text: pick(r, [`I want to learn ${g}.`, `I would like to learn ${g}.`, `I am learning ${g}.`]), expect: E('tell', { kind: 'learn', g: q(g) }) }; });
  add('pref', 'statement', () => { const p = pick(r, styles); return pick(r, [{ text: `I prefer ${p} answers.`, expect: E('tell', { kind: 'pref', p }) }, { text: `Keep it ${p}.`, expect: E('tell', { kind: 'pref', p }) }, { text: `I like ${p} explanations.`, expect: E('tell', { kind: 'pref', p }) }]); });
  add('lang', 'statement', () => { const l = pick(r, langs); return { text: `I prefer answers in ${sp(l)}.`, expect: E('tell', { kind: 'lang', l }) }; });
  add('previous', 'statement', () => { const x = role(); return { text: pick(r, [`Before that I was ${an(sp(x))}.`, `I used to be ${an(sp(x))}.`, `Previously I was ${an(sp(x))}.`]), expect: E('tell', { kind: 'previous', role: x }) }; });
  add('fix.role', 'correction', () => { const x = role(); return { text: pick(r, [`No, I am ${an(sp(x))}.`, `Actually I am ${an(sp(x))}.`, `Sorry, I am ${an(sp(x))}.`, `I mean ${sp(x)}.`]), expect: E('tell', { kind: 'role', role: x, fix: 'true' }) }; });
  add('fix.years', 'correction', () => { const n = numYears(); return { text: pick(r, [`Actually ${n} years.`, `No, it is ${n} years.`, `Sorry, about ${n} years.`]), expect: E('tell', { kind: 'years', n, fix: 'true' }) }; });
  add('fix.name', 'correction', () => { const n = name(); return { text: `Actually call me ${n}.`, expect: E('tell', { kind: 'name', name: q(n), fix: 'true' }) }; });
  add('start', 'request', () => ({ text: pick(r, ['Interview me.', 'Ask me something.', 'Ask me a question.', 'Get to know me.', 'Let us get to know me.', 'Start the interview.', 'Can you interview me?', 'Let us play get to know me.', 'Quiz me about myself.', 'Resume the interview.']), expect: E('start') }));
  add('pause', 'request', () => ({ text: pick(r, ['Pause the interview.', 'Stop the interview.', 'End the game.', 'No more questions.', 'Stop the questions.']), expect: E('pause') }));
  add('know', 'question', () => ({ text: pick(r, ['What do you know about me?', 'What have you learned about me?', 'Tell me what you know about me.', 'What is in my profile?', 'Who am I?']), expect: E('know') }));
  add('progress', 'question', () => ({ text: pick(r, ['How much do you know about me?', 'How far are we?', 'How many questions are left?']), expect: E('progress') }));
  add('forget', 'request', () => { const w = pick(r, fw); return { text: pick(r, [`Forget my ${w}.`, `Delete my ${w}.`, `Remove my ${w}.`, `Erase the ${w}.`, `Forget what I said about my ${w}.`]), expect: E('forget', { w }) }; });
  add('delete', 'request', () => pick(r, [{ text: pick(r, ['Delete my profile.', 'Erase my profile.', 'Wipe my profile.', 'Forget everything about me.']), expect: E('delete') }, { text: pick(r, ['Delete my profile for good.', 'Erase my profile now.', 'Wipe my profile permanently.']), expect: E('delete', { now: 'true' }) }]));
  add('export', 'request', () => pick(r, [
    { text: pick(r, ['Export my profile.', 'Download my profile.', 'Save my profile.']), expect: E('export', { fmt: 'json' }) },
    { text: pick(r, ['Export my profile as JSON.', 'Download my profile as a JSON file.']), expect: E('export', { fmt: 'json' }) },
    { text: pick(r, ['Export my profile as a CV.', 'Download my CV.', 'Export my CV.', 'Save my resume.']), expect: E('export', { fmt: 'md' }) },
  ]));
  add('confirm', 'request', () => { const w = pick(r, ['field', 'industry', 'job', 'role']); return { text: `Confirm my ${w}.`, expect: E('confirm', { w }) }; });
  add('mention', 'request', () => { const w = pick(r, fw); return { text: pick(r, [`Ask me about my ${w}.`, `Quiz me about my ${w}.`]), expect: E('mention', { w }) }; });
  add('sensitive', 'statement', () => { const n = 18 + Math.floor(r() * 60); return pick(r, [
    { text: `I am ${n} years old.`, expect: E('sensitive', { cat: 'age', text: q(String(n)) }) },
    { text: `Remember that I am ${n} years old.`, expect: E('sensitive', { cat: 'age', text: q(`age ${n}`), remember: 'true' }) },
    { text: pick(r, ['I have diabetes.', 'I have asthma.', 'I suffer from anxiety.']), expect: null },
  ]); });

  const NEG = ['Tom has 5 apples.', 'How many apples does Tom have?', 'What is the capital of France?', 'Show me Paris.', 'How many legs does a spider have?', 'Play tic tac toe.', 'Give yourself visor eyes.', 'Make a bar chart of what everyone has.',
    'Add a heading Shopping.', 'Make the second paragraph bold.', 'Zoom in.', 'Draw a red house.', 'Play C D E F G.', 'Stop dictation.', 'What is half of 10?', 'Is a whale a fish?', 'Show me the editor.', 'Who is the main character?',
    'Summarize the story.', 'Is it a mammal?', 'Open the map.', 'What time is it?', 'I give up.', 'Move the knight to f3.', 'Add milk to my shopping list.'];
  add('negative', 'out-of-domain', () => ({ text: pick(r, NEG), expect: null, negative: true }));

  const out = [], seen = new Set();
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const t = T[tries % T.length];
    const ex = t.make();
    if (!ex || (!ex.expect && !ex.negative)) continue;
    let text = ex.text;
    if (!ex.negative && chance(r, 0.12)) text = pick(r, ['Hi, ', 'Well, ', 'Oh, ', 'By the way, ']) + text.charAt(0).toLowerCase() + text.slice(1);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, expect: ex.negative ? null : ex.expect, group: t.group, phenomenon: t.ph, ...(ex.negative ? { negative: true } : {}) });
  }
  return out;
}
