#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// A5 (spec 21), version 2 (2026-11-14, reviewer "the grid measures its own generator"). For every schema world sentences are GENERATED from the forms of the world (w.lang.en frames) x the verbs of
// k.actions x the kinds, attributes and values of the schema, and every sentence is a sentence somebody could say:
//   - every placeholder is filled from the schema and w.lang.en (the noun of a kind from its words, an attribute and its value from the schema, a relation from the prepositions of the form, a layout
//     from k.layouts); a sentence that still has a placeholder or an internal kind name ("freetext", "thing", REL, NOUN, {attribute:ATTR?}) is a GENERATOR ERROR: counted apart, never a case;
//   - only combinations that knowledge allows: a verb that sets an attribute class (k.actions.verb attribute=colour|size|...) goes with a kind that has that attribute and a value of it; a form is
//     built only when the act has the roles it uses (k.actions.role); "take apart" only for a kind with parts (a kind that holds other kinds, or a catalog object with parts in k.objects);
//   - a setup per cell makes the things the sentence needs (the container first, the named or numbered thing, the thing it is placed next to) and is itself judged (refused = setup "unconfirmed");
//   - the world's own tab is open; a reply of ANOTHER tab world is a cross-world capture, counted apart.
// Each sentence is said in BOTH reasoners. A cell is judged by what happened: a changing act must change the state of the world (`state`), a question must be answered with something that
// is not a refusal (`answer`), the others must not be refused (`reply`); otherwise it is a hole (`miss`). Holes are counted when the setup was confirmed.
//   node scripts/coverage-grid.mjs [--json docs/webchat/coverage-grid.json] [--per-act 4] [--world <id>] [--knowledge <catalog dir>]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as A from '../worlds/acts/acts.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const perAct = Number(arg('per-act', 4));
const only = arg('world', null);
const CATALOG = arg('knowledge', process.env.PSYS2_KNOWLEDGE ?? path.join(REPO, 'tests/fixtures/catalog'));
const roots = [path.join(REPO, 'worlds-pilot')].filter(existsSync);   // the engine loads the real worlds (DEFAULT_ROOT) and the pilots; NOT the test fixtures: a fixture world (test.seating) has no tab and answered the sentences of the other tabs
// every schema world: the pilots and the real worlds with a schema.sop (the fixture seating world is left out: the real plan.seating reads the same sentences)
const scan = [path.join(REPO, 'worlds-pilot'), path.join(REPO, 'worlds')].filter(existsSync);
const worlds = scan.flatMap((r) => readdirSync(r).filter((d) => existsSync(path.join(r, d, 'schema.sop')) && d !== 'test.seating' && d !== 'acts' && (!only || d === only)).map((d) => ({ id: d, dir: path.join(r, d) })));
const TAB_OVERRIDE = { 'docs.editor': 'editor', 'ui.avatar': 'robot' };   // worlds whose tab is declared by the host, not by world.sop
const tabWorlds = new Set();   // every world that owns a tab: a reply of one of them to the sentence of another is a cross-world capture
for (const r of [path.join(REPO, 'worlds'), path.join(REPO, 'worlds-pilot')].filter(existsSync)) for (const d of readdirSync(r)) { const f = path.join(r, d, 'world.sop'); if (existsSync(f) && (/^\s*tab=\S+/m.test(readFileSync(f, 'utf8')) || TAB_OVERRIDE[d])) tabWorlds.add(d); }
const tabOf = Object.fromEntries(worlds.map((w) => [w.id, TAB_OVERRIDE[w.id] ?? /^\s*tab=(\S+)/m.exec(readFileSync(path.join(w.dir, 'world.sop'), 'utf8'))?.[1]]).filter(([, t]) => t));
const CHANGES = new Set(['make', 'remove', 'change', 'place', 'connect', 'group', 'copy', 'load']);
const REFUSAL = /did not understand|did not catch|I can't find|I can not find|I cannot|There is no|Where should it go|Your picture is empty|not sure how|I do not know|Something went wrong|nothing to/i;
const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 10);
const NAMES = ['Zed', 'Yan', 'Xia'];

// ---- knowledge: the verbs and roles of k.actions, the objects (and their parts) of k.objects, the layouts of k.layouts ----------------------------------
const shards = (k) => { const d = path.join(CATALOG, k, 'shards'); return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.sop')).map((f) => readFileSync(path.join(d, f), 'utf8')) : []; };
const field = (line, name) => { const m = new RegExp(`\\b${name}=("[^"]*"|\\S+)`).exec(line); return m ? m[1].replace(/^"|"$/g, '') : null; };
/** `${act}:${text with underscores}` -> { attribute, value, complement, object } for every verb wire of k.actions. */
const VERB = new Map();
const ACT_ROLES = new Map();   // act -> Set of role names
for (const src of shards('k.actions')) for (const line of src.split('\n')) {
  if (line.startsWith('@k.actions.verb.')) VERB.set(`${field(line, 'act')}:${field(line, 'text').replace(/ /g, '_')}`, { attribute: field(line, 'attribute'), value: field(line, 'value'), complement: field(line, 'complement'), object: field(line, 'object') });
  else if (line.startsWith('@k.actions.act.')) ACT_ROLES.set(field(line, 'name'), new Set([...line.matchAll(/\brole=("[^"]*"|\S+)/g)].map((m) => m[1].replace(/^"|"$/g, ''))));
}
const objectNames = [], hasParts = new Set();
for (const src of shards('k.objects')) for (const line of src.split('\n')) {
  if (line.startsWith('@') && line.includes(' k.objects.object ')) objectNames.push(field(line, 'name'));
  else if (line.includes(' k.objects.part ')) hasParts.add(field(line, 'of'));
}
// the first alternative of a phrase group of worlds/lang.common ("$lang.shape.want" -> "i want")
const PHRASES = new Map();
for (const f of readdirSync(path.join(REPO, 'worlds/lang.common')).filter((x) => x.endsWith('.sop'))) {
  let cur = null;
  for (const line of readFileSync(path.join(REPO, 'worlds/lang.common', f), 'utf8').split('\n')) {
    const m = /^@phrase\.(\S+) core\.phrase/.exec(line);
    if (m) { cur = m[1]; continue; }
    if (cur && /^\s+alt=/.test(line) && !PHRASES.has(cur)) PHRASES.set(cur, line.trim().slice(4).replace(/^"|"$/g, ''));
    if (line.startsWith('@') && !m) cur = null;
  }
}
const layoutNames = [];
for (const src of shards('k.layouts')) for (const line of src.split('\n')) if (line.includes(' k.layouts.layout ') && field(line, 'kind') === 'repeating') layoutNames.push(field(line, 'name'));
const ACT_OF_GROUP = { set: 'change', apart: 'take_apart' };   // verb group of the forms -> act of k.actions
const kAct = (f) => (f.mode === 'apart' || /^apart/.test(f.id) ? 'take_apart' : f.act);
const GROUP_ACT = (key) => ACT_OF_GROUP[key] ?? key;

// ---- the kinds of a schema as people say them ----------------------------------------------------------------------------------------------------------
function kindsOf(schema) {
  const second = ['tree', 'sun', 'cloud', 'car', 'cat'].find((o) => objectNames.includes(o) && o !== schema.sample) ?? objectNames.find((o) => o !== schema.sample);
  const out = {};
  for (const k of Object.values(schema.kinds)) {
    const internal = k.any || /_/.test(k.name) || k.name === 'freetext';
    const noun = k.any ? (schema.sample ?? objectNames[0]) : internal ? (k.words.find((w) => !w.includes('_') && w !== k.name && !/s$/.test(w)) ?? k.name.replace(/_/g, ' ')) : k.name;
    const plural = k.any || internal ? (/(s|sh|ch|x)$/.test(noun) ? `${noun}es` : `${noun}s`) : k.plural;
    const children = Object.values(schema.kinds).filter((c) => c.in === k.name && c.name !== k.name);
    out[k.name] = { k, noun, plural, internal, second: k.any ? second : null, container: k.in && k.in !== k.name ? k.in : null,
      parts: children.length > 0 || k.name === 'group' || (k.any && hasParts.has(noun)),
      attrs: Object.values(schema.attrs).filter((a) => a.of.includes(k.name)) };
  }
  return out;
}
const label = (ki, i = 1) => (ki.k.numbered ? `${ki.noun} ${i}` : ki.k.named ? `${ki.noun} ${NAMES[i - 1]}` : ki.noun);
const NUMBERISH = new Set(['number']);
function valueOf(a, kind) {   // a value of the attribute the schema allows, as a word
  if (a.type === 'number') return String(Math.max(a.min ?? 1, Math.min(a.max ?? 9, 3)));
  if (a.type === 'enum') return a.values.find((v) => !v.includes('_')) ?? a.values[0];
  if (a.type === 'colour') return 'red';
  if (a.type === 'bool') return 'on';
  return 'Sam';
}
const VALUE_TYPES = new Set(['enum', 'colour', 'bool']);   // what {value:VALUE} (lex.<ns>.values) holds

/** The verbs of a group that knowledge allows with this slot: an attribute-class verb (colour, resize ...) only with an attribute of that class and an explicit value; a verb with a value of its own (enlarge, hide) never with another value. */
function verbsFor(key, ctx, f) {
  const act = GROUP_ACT(key);
  const all = (A.ACT_VERBS[key] ?? []).filter((v) => v.split('_').length < 3);
  const ok = all.filter((v) => {
    const rec = VERB.get(`${act}:${v}`);
    if (!rec) return true;
    if (rec.object === 'attribute' || rec.object === 'topic') return false;
    if (rec.value || rec.attribute) {
      if (rec.value || ctx.cmp || !ctx.hasValue || !ctx.attr) return false;
      return rec.attribute === ctx.attr.name || (rec.attribute === 'colour' && ctx.attr.type === 'colour');
    }
    return true;
  });
  if (ctx.cmp) return ok.filter((v) => v === 'make').slice(0, 1);
  const only = f.id === 'change.add' || f.id === 'change.add1' ? ok.filter((v) => v === 'add') : f.id === 'change.less' || f.id === 'change.less1' ? ok.filter((v) => v === 'remove') : ok;
  return only.slice(0, perAct);
}

/** Roles a form uses vs roles the act has in k.actions (a form for a role the act does not take is not built). */
const ROLE_MAP = { thing: ['thing', 'kind'], place: ['place', 'target', 'source', 'group'], value: ['value', 'name', 'format', 'state', 'topic'], amount: ['amount', 'number'], attribute: ['attribute', 'criterion', 'topic'] };
const rolesOk = (f) => { const have = ACT_ROLES.get(kAct(f)); return !have || (f.args ?? []).every((r) => !ROLE_MAP[r] || ROLE_MAP[r].some((x) => have.has(x))); };

/** Why a form cannot be built in this world (counted, not hidden): no source of its words in the schema or the knowledge. */
const UNFILLABLE = (f) => (f.act === 'own' ? 'reader form: any text, not an act of the schema'
  : ['send', 'save', 'load', 'undo', 'redo'].includes(f.act) ? 'host act (no state difference to judge)'
    : /^change\.(be|swap)/.test(f.id) || f.id === 'change.should.self' ? 'needs a value that is a whole thing (a character, a replacement): no source in the schema' : null);

const GENERATOR_ERROR = /[{}[\]]|\b(REL|NOUN|ATTR|VALUE|MORE|LESS|KIND|TURN|FACTOR|undefined|null|NaN)\b|\b[LDV]\.|\bV\.\w+/;

/** One sentence from a form: every placeholder filled; null when the form cannot be said for this slot. */
function expand(f, schema, KI, verb, slot) {
  const { ki, attr, value, other, plural, tail } = slot;
  const act = f.act;
  const detOf = (nextTok) => (/^\{value:/.test(nextTok ?? '') ? '' : /^\{rel:lex\.acts\.layout\}/.test(nextTok ?? '') ? 'a' : act === 'make' && /^\{thing/.test(nextTok ?? '') && !/^remove|^place/.test(f.id) ? 'a' : 'the');
  const thingText = plural ? ki.plural : act === 'make' ? ki.noun : label(ki);   // a thing that is being made has no number or name yet
  const placeText = slot.placeText ?? (other ? label(other, other === ki ? 2 : 1) : null);
  let toks = f.match.replace(/\bL\b/g, '').split(/\s+/).filter(Boolean);
  const outToks = [], optOut = [];   // optOut: positions of words that came from an optional group (dropped again when the noun they lead to is left out)
  for (let i = 0; i < toks.length; i++) {
    let t = toks[i]; const next = toks[i + 1]; let m;
    if (t === 'D') { if (/^\[(a|an|the|my|this|that|any|some|our|one_more|new)\b/.test(next ?? '')) continue; const d = detOf(next); if (d) outToks.push(d); continue; }
    if (/^\[V\.\w+\|/.test(t)) { outToks.push(verb ?? ''); continue; }
    if ((m = /^\[?\$([\w.]+)(?:\|[^\]]*)?\]?(\?)?$/.exec(t))) { if (m[2] && !/\$lang\.shape/.test(t)) continue; outToks.push(PHRASES.get(m[1]) ?? `$${m[1]}`); continue; }
    if ((m = /^\[([^\]]*)\](\?)?$/.exec(t))) {
      const alts = m[1].split('|');
      const nextIsValue = /^\{value:/.test(next ?? '') || (next === 'D' && /^\{value:/.test(toks[i + 2] ?? '')), nextIsLayout = next === 'D' && /layout/.test(toks[i + 2] ?? '');
      const keep = !m[2] || ((nextIsValue || nextIsLayout) && /^(to|in|into|as|on|along|across|be)$/.test(alts[0])) || /^(a|any|is|the|my|in|have|i)$/.test(alts[0]);
      if (!keep) continue;
      const a = alts[0];
      outToks.push(a === 'a' && /^[aeiou]/i.test(thingText) ? 'an' : a);
      if (m[2]) optOut.push(outToks.length - 1);
      continue;
    }
    if ((m = /^V\.(\w+)$/.exec(t))) { outToks.push(verb ?? ''); continue; }
    if ((m = /^\{(\w+):([^}]*)\}$/.exec(t))) {
      const [, role, cls] = m;
      let w;
      if (cls.endsWith('?') && role !== 'thing') continue;   // an optional placeholder (attribute, rest) is left out; an optional kind is kept
      if (role === 'thing') w = /^KIND/.test(cls) ? ki.noun : thingText;
      else if (role === 'attribute') w = attr?.name;
      else if (role === 'amount') w = '2';
      else if (role === 'place') w = placeText;
      else if (role === 'rel' && cls === 'lex.acts.rel') w = slot.rel;
      else if (role === 'rel' && cls === 'lex.acts.dir') w = slot.dir;
      else if (role === 'rel' && cls === 'lex.acts.layout') w = slot.layout;
      else if (role === 'value') w = cls === 'number' ? (attr?.type === 'number' ? valueOf(attr) : '3') : value;
      else if (role === 'rest') w = slot.rest;
      else if (role === 'pre') w = slot.value;
      outToks.push(w ?? `{${role}:${cls}}`);
      continue;
    }
    if (t === 'NOUN') { outToks.push(schema.noun ?? 'document'); continue; }
    if (t === 'NOUN?') { while (optOut.length && optOut.at(-1) === outToks.length - 1) { outToks.pop(); optOut.pop(); } continue; }
    if (t === 'REL') { outToks.push(slot.rel ?? 'REL'); continue; }
    outToks.push(t);
  }
  let s = outToks.join(' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  s = `${s[0].toUpperCase()}${s.slice(1)}${act === 'ask' ? '?' : '.'}`;
  return s;
}

/** The setup sentences a slot needs, container first; `need` = [{ ki, count, named }]. */
function setupFor(schema, KI, need) {
  const out = [], done = new Set();
  const add = (ki, count, best) => {
    if (ki.container && KI[ki.container]) add(KI[ki.container], 1, true);
    for (let i = 1; i <= count; i++) {
      const key = `${ki.k.name}#${i}`;
      if (done.has(key)) continue;
      done.add(key);
      const noun = ki.noun;
      out.push({ text: ki.k.named ? `Add a ${noun} called ${NAMES[i - 1]}.` : `Add a ${noun}.`, best });
    }
  };
  for (const n of need) {
    if (n.second) { if (!done.has(`s#${n.second}`)) { done.add(`s#${n.second}`); out.push({ text: `Add a ${n.second}.`, best: false }); } continue; }
    add(n.ki, n.count, false);
  }
  return out;
}

const PLURALISH = /^(group$|ask\.count$|ask\.count\.at$|ask\.options$|place\.layout|make\.n$|make\.more)/;
// The forms the generator knows how to fill. The base forms are those of worlds/acts (A.FORMS); of the extension families (wish, valued, list, textual: forms.more / forms.data) only these, whose
// every word is a role or a plain word. The others (e.g. "Bar as big", "Un type", "Chart 1 list") are a lexicon of their own and are COUNTED as skipped, not built from guesses.
const BASE_MATCH = new Set(A.FORMS.map((x) => x.match));   // by the words of the form, not its id: an extension family reuses some ids with other words
const EXTENSION_FORMS = new Set(['change.grow', 'change.shrink', 'change.factor', 'change.halve', 'change.by', 'change.by.less', 'ask.describe', 'ask.describe.whats', 'ask.describe.what', 'ask.describe.see',
  'remove.all', 'remove.all.noun', 'remove.chart', 'make.data.verb', 'pick.go', 'ask.exists', 'ask.exists.have', 'make.text', 'make.blank', 'make.kind']);
const cellsOf = (schema) => {
  const KI = kindsOf(schema);
  const kinds = Object.values(KI);
  const cells = [], errors = [], skipped = {}, seen = new Set();
  const skip = (f, why) => { const k = `${f.id}: ${why}`; skipped[k] = (skipped[k] ?? 0) + 1; };
  const kindOk = (ki, f) => !ki.k.acts.length || ki.k.acts.includes(f.act);
  for (const f of A.formsFor(schema)) {
    const spec = A.ACTS[f.act];
    const why = UNFILLABLE(f) ?? (BASE_MATCH.has(f.match) || EXTENSION_FORMS.has(f.id) ? null : 'extension form with a lexicon of its own: not generated');
    if (!spec || why) { skip(f, why ?? 'not an act'); continue; }
    if (!rolesOk(f)) { skip(f, `the act ${kAct(f)} has no such role in k.actions`); continue; }
    const roles = new Set(f.args ?? []);
    const verbKey = /\bV\.(\w+)/.exec(f.match)?.[1];
    const id = f.id;
    const cmp = /^change\.cmp/.test(id);
    const wantsNumber = /^change\.(add|less|needs|factor|halve|by|is\.number|fix\.number)/.test(id);
    const isName = /^(make\.name|change\.call|change\.name)/.test(id);
    const isText = /^(make\.text|make\.begin|change\.def|make\.numbered)/.test(id);   // the value is free text for a thing that has text
    const isData = /^make\.data/.test(id);
    const isFactor = id === 'change.factor';
    let made = 0;
    for (const ki of kinds) {
      if (made >= 3) break;
      if (!kindOk(ki, f)) continue;
      if (/^apart/.test(id) && !ki.parts) continue;
      if (id === 'make.data.verb' && (!schema.flags?.valued || schema.flags?.textual)) continue;   // the data of a chart: only a world whose values are numbers on a chart
      if ((PLURALISH.test(id) || ['place', 'connect', 'copy'].includes(f.act)) && !(ki.k.any || ki.k.numbered || ki.k.named || ki.k.in)) continue;   // a singleton (the sky, a nose) is not counted, grouped, copied or put next to another
      // attribute and value slot: the attribute is one the kind has, the value one the attribute allows
      let attr = null, value = null, rest = null;
      const attrs = ki.attrs;
      const needsAttr = roles.has('attribute') || (roles.has('value') && !isName && !isText && !isData) || id === 'ask.why' || /^change\.(grow|shrink|halve|by)/.test(id);
      if (needsAttr) {
        const pool = /^change\.(grow|shrink)/.test(id) ? attrs.filter((a) => a.type === 'number' && a.more.length) : wantsNumber ? attrs.filter((a) => a.type === 'number')
          : cmp ? attrs.filter((a) => (id === 'change.cmp.more' ? a.more : a.less).length)
            : /^(change\.(value|should|as|use|prefer|first)|ask\.why)/.test(id) || (roles.has('value') && !roles.has('attribute') && !/^change\.(swap|self)/.test(id)) ? attrs.filter((a) => VALUE_TYPES.has(a.type))
              : id.startsWith('ask.count.attr') ? attrs.filter((a) => a.type === 'number') : attrs;
        attr = pool[0] ?? null;
        if (!attr) continue;
        value = cmp ? (id === 'change.cmp.more' ? attr.more : attr.less)[0] : valueOf(attr, ki.k);
        if (isFactor) { if (!schema.flags?.scale) continue; value = 'double'; }
      }
      if (isText) { const t = attrs.find((a) => a.type === 'text'); if (!t && !/^make\.(begin|numbered)/.test(id)) continue; value = 'Hello'; }
      if (isData) { value = attr?.values?.[0] ?? 'bar'; rest = 'cats 2, dogs 7'; if (id === 'make.data.as') { const e = Object.values(schema.attrs).find((a) => a.type === 'enum'); if (!e) continue; value = valueOf(e); } }
      if (id === 'bare.mod') { if (!attrs.some((x) => x.type === 'colour')) continue; value = 'red'; }
      if (isName) value = id.startsWith('make.name') ? NAMES[1] : 'Anna';
      if (/^change\.self$/.test(id)) { const c = Object.values(schema.attrs).find((a) => a.type === 'colour'); if (!c) continue; attr = c; value = 'red'; }
      if (/^change\.(is|fix)\.number/.test(id)) rest = '3';
      if (roles.has('value') && value == null && !isName) continue;
      if (roles.has('rest') && !rest && id !== 'ask.why') { skip(f, 'a free-text role with no source in the schema'); break; }
      // place slot: a container the thing is in, or another thing next to which it goes
      let other = null, rel = null, placeText = null, dir = null, layout = null, second = null;
      if (roles.has('place')) {
        const container = ki.container ? KI[ki.container] : null;
        if (/^(make\.(place|name\.place|blank\.at)|remove\.place|ask\.at|ask\.count\.at)/.test(id)) { if (!container) continue; other = container; rel = 'in'; }
        else if (f.act === 'place' || f.act === 'connect') {
          if (container && f.act === 'place' && ki.k.in) { other = container; rel = 'in'; }
          else if (ki.k.numbered || ki.k.named) { other = ki; rel = 'next_to'; }
          else if (ki.second) { second = ki.second; placeText = ki.second; rel = 'next_to'; }
          else { other = kinds.find((o) => o !== ki && !o.container && !o.internal && !o.k.named); if (!other) continue; rel = 'next_to'; }
        } else continue;
      }
      if (/^place\.dir/.test(id)) dir = 'higher';
      if (/^place\.layout/.test(id)) { layout = layoutNames.includes('row') ? 'row' : layoutNames[0]; if (!layout) continue; }
      if (roles.has('rel') && !roles.has('place') && !dir && !layout) continue;   // a relation word the schema or the knowledge does not give
      if (id === 'ask.why') rest = `the ${label(ki)} ${value}`;
      const plural = PLURALISH.test(id) && id !== 'make.more';
      const slot = { ki, attr, value, other, plural, rel, placeText, dir, layout, rest, second };
      const verbs = verbKey ? verbsFor(verbKey, { attr, hasValue: roles.has('value') && !roles.has('attribute') && !isName && !isText, cmp }, f) : [null];
      for (const verb of verbs) {
        if (verbKey && !verb) continue;
        const text = expand(f, schema, KI, verb, slot);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        if (GENERATOR_ERROR.test(text) || kinds.some((x) => x.internal && x.k.name !== x.noun && new RegExp(`\\b${x.k.name.replace(/_/g, ' ')}\\b`, 'i').test(text))) { errors.push({ form: id, text }); continue; }
        // what the sentence needs: the things it acts on and the thing it is placed in or next to (the container first)
        const need = [];
        const count = plural || other === ki || f.act === 'connect' ? 2 : 1;
        if (f.act === 'make') { if (other) need.push({ ki: other, count: 1 }); else if (ki.container) need.push({ ki: KI[ki.container], count: 1 }); }
        else { need.push({ ki, count }); if (other && other !== ki) need.push({ ki: other, count: 1 }); if (second) need.push({ second }); }
        const bare = /\.bare$|^bare$/.test(id) && f.act !== 'make';
        cells.push({ act: f.act, mode: f.mode ?? null, form: id, verb: verb ?? null, kind: ki.k.name, noun: ki.noun, text, judge: bare ? 'reply' : null, setup: setupFor(schema, KI, need) });
      }
      made++;
    }
  }
  // verbs of k.actions that say a change by themselves ("enlarge", "blow up"): a verb with an attribute class and a value of its own x the kinds that have that attribute
  for (const ki of kinds) {
    let n = 0;
    for (const [key, rec] of VERB) {
      if (n >= 2 || !key.startsWith('change:') || !rec.attribute || !rec.value || !schema.acts.has('change')) continue;
      const a = ki.attrs.find((x) => x.name === rec.attribute || (rec.attribute === 'colour' && x.type === 'colour'));
      if (!a || ki.internal && false) continue;
      const text = `${key.slice(7).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} ${`the ${label(ki)}`}.`;
      if (seen.has(text) || /^(Show|Hide|Open|Close)/.test(text)) continue;
      seen.add(text); n++;
      cells.push({ act: 'change', mode: null, form: 'k.actions:implied', verb: key.slice(7), kind: ki.k.name, noun: ki.noun, text, judge: null, setup: setupFor(schema, KI, [{ ki, count: 1 }]) });
    }
  }
  return { cells, errors, skipped };
};

// ---- run -----------------------------------------------------------------------------------------------------------------------------------------------------
const previous = (() => {
  const f = path.join(REPO, 'docs/webchat/coverage-grid.json');
  if (!existsSync(f)) return null;
  const g = JSON.parse(readFileSync(f, 'utf8'));
  if (g.version === 2) return g.previous ?? null;
  return { generated: g.generated, worlds: g.worlds.map((w) => ({ id: w.id, total: w.cells.length, holes: w.cells.filter((c) => c.ops === 'miss' || c.matrix === 'miss').length })) };
})();
const out = { version: 2, generated: new Date().toISOString(), judged: 'by the state difference of the world (changing acts), by a non-refusal answer (questions); holes counted when the setup was confirmed', previous, worlds: [] };
if (process.argv.includes('--gen')) {   // generation only (no sessions): what would be said, the errors and the skipped forms
  for (const w of worlds) {
    const g = cellsOf(A.parseSchema(parse(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8')).wires));
    console.log(`== ${w.id} tab=${tabOf[w.id] ?? '-'}: ${g.cells.length} cells, ${g.errors.length} generator errors, skipped ${JSON.stringify(g.skipped)}`);
    for (const e of g.errors.slice(0, 5)) console.log(`   ERROR ${e.form}: ${e.text}`);
    if (process.argv.includes('--all')) for (const c of g.cells) console.log(`   ${c.form.padEnd(16)} ${c.text}   <- ${c.setup.map((x) => x.text).join(' ')}`);
  }
  process.exit(0);
}
const worldsOf = (r) => [...new Set((r.segments ?? []).map((x) => x.match?.worldId ?? x.world).filter(Boolean))];
for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [...roots, DEFAULT_ROOT] }), options: { reasoner } });
  for (const w of worlds) {
    const schema = A.parseSchema(parse(readFileSync(path.join(w.dir, 'schema.sop'), 'utf8')).wires);
    let rec = out.worlds.find((x) => x.id === w.id);
    if (!rec) {
      const g = cellsOf(schema);
      out.worlds.push(rec = { id: w.id, tab: tabOf[w.id] ?? null, cells: g.cells, generatorErrors: g.errors, skipped: g.skipped });
    }
    for (const c of rec.cells) {
      const s = engine.createSession({ language: 'en' });
      if (tabOf[w.id]) s.setWorldState('ui.shell', { activeTab: tabOf[w.id] });
      let confirmed = true;
      for (const st of c.setup) {   // a refused setup that changed nothing leaves the cell unconfirmed (a container that is simply there does not count)
        const b = hash(s.state(w.id));
        const r = await s.send(st.text);
        // confirmed: the state changed, or the reply is a plain statement (the thing is there already); a refusal or a question ("What should I add?") that changed nothing leaves the cell unconfirmed
        const ok = hash(s.state(w.id)) !== b || (!REFUSAL.test(r.text) && !/\?/.test(r.text));
        if (!ok && !st.best) confirmed = false;
      }
      const before = hash(s.state(w.id));
      const r = await s.send(c.text);
      const changed = hash(s.state(w.id)) !== before;
      const refused = REFUSAL.test(r.text);
      const verdict = c.judge === 'reply' ? (!refused ? 'reply' : 'miss')
        : CHANGES.has(c.act) ? (changed ? 'state' : 'miss') : c.act === 'ask' ? (r.text.trim() && !refused ? 'answer' : 'miss') : (!refused ? 'reply' : 'miss');
      c[reasoner] = verdict; c[`${reasoner}Reply`] = r.text.slice(0, 100); c[`${reasoner}Setup`] = confirmed;
      const wo = worldsOf(r).filter((x) => x !== w.id && tabWorlds.has(x));
      if (wo.length) c[`${reasoner}Capture`] = wo[0];
    }
  }
}
for (const w of out.worlds) {
  w.total = w.cells.length;
  const miss = (c) => c.ops === 'miss' || c.matrix === 'miss';
  const conf = (c) => c.opsSetup !== false && c.matrixSetup !== false;
  w.holes = w.cells.filter((c) => miss(c) && conf(c)).length;
  w.unconfirmed = w.cells.filter((c) => miss(c) && !conf(c)).length;
  w.captures = w.cells.filter((c) => c.opsCapture || c.matrixCapture).length;
  w.generatorErrorCount = w.generatorErrors.length;
}
if (arg('json')) writeFileSync(path.resolve(REPO, arg('json')), `${JSON.stringify(out)}\n`);
const byAct = {};
for (const w of out.worlds) for (const c of w.cells) { const k = `${w.id} ${c.act}`; (byAct[k] ??= { n: 0, miss: 0 }); byAct[k].n++; if ((c.ops === 'miss' || c.matrix === 'miss') && c.opsSetup !== false && c.matrixSetup !== false) byAct[k].miss++; }
console.log('| world act | sentences | holes |\n| --- | --- | --- |');
for (const [k, v] of Object.entries(byAct)) console.log(`| ${k} | ${v.n} | ${v.miss} |`);
console.log(out.worlds.map((w) => `${w.id}: ${w.total - w.holes - w.unconfirmed}/${w.total} judged by state or answer, ${w.holes} holes, ${w.unconfirmed} holes with setup unconfirmed, ${w.captures} captures, ${w.generatorErrorCount} generator errors, ${Object.values(w.skipped).reduce((a, n) => a + n, 0)} forms skipped`).join('\n'));
if (previous) console.log(`\nbefore (grid v1, ${previous.generated?.slice(0, 10)}): ${previous.worlds.map((w) => `${w.id} ${w.holes}/${w.total}`).join(', ')}`);
