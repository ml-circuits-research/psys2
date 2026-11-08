import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { extract, sensitive, norm } from '../worlds/user.profile/understand.mjs';
import { PLAN_FALLBACK, SECTIONS_FALLBACK, buildView, toMarkdown, toJson } from '../worlds/user.profile/cv.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const world = engine.set.get('user.profile');
const lexOf = (id) => world.lexicons.find((l) => l.id === `lex.user.profile.${id}`)?.words ?? [];
const lex = (id) => [...lexOf(id)];
const env = (pending = null) => ({
  lex, pending, activities: { teaching: 'teacher' },
  industries: [{ id: 'tech', label: 'Tech', words: ['tech', 'software', 'it'] }, { id: 'healthcare', label: 'Healthcare', words: ['healthcare', 'medicine'] }],
});
const items = (text, pending) => Object.fromEntries(extract(text, env(pending)).items.map((i) => [i.key, i.value]));

test('the plan in kb.sop and PLAN_FALLBACK of cv.mjs agree', async () => {
  const sop = readFileSync(fileURLToPath(new URL('../worlds/user.profile/kb.sop', import.meta.url)), 'utf8');
  const fields = [...sop.matchAll(/^@f\.(\w+) user\.profile\.field\n((?:    .*\n)+)/gm)].map((m) => {
    const body = m[2];
    const get = (k) => body.match(new RegExp(`^    ${k}=("(?:[^"\\\\]|\\\\.)*"|\\S+)`, 'm'))?.[1]?.replace(/^"|"$/g, '');
    return { id: m[1], section: get('section'), label: get('label'), prio: Number(get('prio')), card: get('card'), q: [...body.matchAll(/^    q=/gm)].length, ack: [...body.matchAll(/^    ack=/gm)].length, sens: get('sens'), follow: get('follow'), example: get('example') };
  });
  assert.equal(fields.length, PLAN_FALLBACK.length);
  for (const f of fields) {
    const p = PLAN_FALLBACK.find((x) => x.id === f.id);
    assert.ok(p, `${f.id} missing in PLAN_FALLBACK`);
    assert.deepEqual([p.section, p.label, p.prio, p.card], [f.section, f.label, f.prio, f.card], f.id);
    assert.ok(f.q >= 3, `${f.id}: at least 3 phrasings`);
    assert.ok(f.ack >= 3 && f.follow && f.example, `${f.id}: ack, follow-up and example`);
    assert.ok(['none', 'low'].includes(f.sens), `${f.id}: never ask sensitive things`);
  }
  assert.deepEqual(SECTIONS_FALLBACK.map((s) => s.id), ['basics', 'professional', 'education', 'skills', 'interests', 'goals', 'preferences']);
});

test('no planned field is sensitive and sensitive words are not asked about', () => {
  const sop = readFileSync(fileURLToPath(new URL('../worlds/user.profile/kb.sop', import.meta.url)), 'utf8');
  for (const w of ['religion', 'diabetes', 'salary', 'income', 'politic', 'sexual', 'street address', 'how old']) assert.ok(!new RegExp(`q=.*${w}`, 'i').test(sop), w);
});

test('extraction: statements', () => {
  assert.deepEqual(items("I'm a software engineer at Acme"), { role: 'software engineer', org: 'Acme' });
  assert.equal(items('I work in healthcare as a nurse').role, 'nurse');
  assert.equal(items('I work in healthcare as a nurse').field, 'Healthcare');
  assert.equal(items("I've been teaching for 12 years").years, '12');
  assert.equal(items('I studied physics at Cluj').education, 'Physics at Cluj');
  assert.deepEqual(items('I love hiking and jazz'), { hobbies: ['hiking'], media: ['jazz'] });
  assert.deepEqual(items('mostly Python and SQL').tools, ['Python', 'SQL']);
  assert.equal(items('call me Andy').name, 'Andy');
  assert.equal(items('I live in Cluj, Romania').location, 'Cluj, Romania');
  assert.equal(items('I have been a nurse for twelve years').years, '12');
  assert.equal(items('about a decade').years, '10');
  assert.equal(items('I have worked for a decade').years, '10');
});

test('extraction: short answers go to the pending field', () => {
  assert.equal(items('nurse', 'role').role, 'nurse');
  assert.equal(items('12 years', 'years').years, '12');
  assert.equal(items('12', 'years').years, '12');
  assert.deepEqual(items('hiking', 'hobbies').hobbies, ['hiking']);
  assert.deepEqual(items('football, tennis', 'sports').sports, ['football', 'tennis']);
  assert.equal(items('Andy', 'name').name, 'Andy');
  assert.equal(items("it's Maria", 'name').name, 'Maria');
  assert.equal(items('short', 'length').length, 'short');
  assert.equal(items('casual please', 'tone').tone, 'casual');
  assert.equal(items('Berlin', 'location').location, 'Berlin');
  assert.equal(items('lead a team', 'career').career, 'Lead a team');
  assert.equal(items('Romanian', 'language').language, 'Romanian');
  assert.deepEqual(items('skip', 'role'), {});
});

test('extraction: corrections replace and are flagged', () => {
  const a = extract("no, I'm a designer", env());
  assert.ok(a.correction);
  assert.equal(a.items.find((i) => i.key === 'role').value, 'designer');
  assert.equal(items('actually 10 years').years, '10');
  assert.ok(extract('no', env()).deny);
});

test('extraction does not take commands or other talk as answers about the user', () => {
  assert.deepEqual(items('show me Paris'), {});
  assert.deepEqual(items('Tom has 5 apples'), {});
  assert.deepEqual(items('I am tired'), {});
  assert.deepEqual(items('I am a bit tired today'), {});
  assert.deepEqual(items('I am a big fan of jazz').role, undefined);
});

test('sensitive content is detected and never extracted as a field', () => {
  assert.equal(sensitive("I'm 34 years old", lex)?.cat, 'age');
  assert.equal(sensitive('I have diabetes', lex)?.cat, 'health');
  assert.equal(sensitive('I am a democrat, remember that', lex)?.remember, true);
  assert.equal(sensitive('I live at 12 Baker Street', lex)?.cat, 'address');
  assert.equal(sensitive('I am a nurse', lex), null);
  assert.equal(sensitive('I work in healthcare', lex), null);
});

test('norm expands contractions and number words before years', () => {
  assert.equal(norm("I've been a nurse for twenty-one years!"), 'i have been a nurse for 21 years');
});

test('cv: view, markdown and json', () => {
  const state = { fields: { name: { v: 'Andy', src: 'said' }, role: { v: 'nurse', src: 'said' }, field: { v: 'Healthcare', src: 'guessed' }, hobbies: { v: ['hiking', 'jazz'], src: 'said', note: 'since school' } }, skipped: { sports: 'skip' }, sensitive: [] };
  const v = buildView(state);
  assert.equal(v.name, 'Andy');
  assert.equal(v.headline, 'Nurse · Healthcare');
  assert.equal(v.counts.known, 4);
  assert.equal(v.counts.skipped, 1);
  const md = toMarkdown(state);
  assert.match(md, /^# Andy/);
  assert.match(md, /Hiking, Jazz/);
  assert.match(md, /since school/);
  const json = JSON.parse(toJson(state));
  assert.equal(json.fields.role.value, 'nurse');
  assert.equal(json.fields.field.source, 'guessed');
});

test('the world declares the Profile tab and the plugin is built', () => {
  assert.equal(world.tab.id, 'profile');
  assert.equal(world.tab.title, 'Profile');
  const plugin = readFileSync(fileURLToPath(new URL('../docs/webchat/ui/tabs/profile.mjs', import.meta.url)), 'utf8');
  assert.match(plugin, /id: 'profile'/);
  assert.match(plugin, /world: WORLD/);
});

test('world loads without problems', () => {
  assert.deepEqual(engine.problems().filter((p) => p.startsWith('user.profile')), []);
});
