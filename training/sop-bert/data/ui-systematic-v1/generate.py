#!/usr/bin/env python3
"""Systematic canonical rows for every declared function of the five editor tabs (ui-systematic-v1).

The rows are CANONICAL ANCHORS, not paraphrases: one plain, uniform English command per
(operation x parameter x representative value x target form), plus parameter combinations, compounds, follow-ups and the
UI controls of specs/ui-parity.md. Every row has gold reader labels (the official row shape) and the exact tool intent
(operation, arguments) with the canonical intent text and wires of describeNativeControl (the UI training-pair
mechanism, src/dialog/native-control-intent.mjs).

Sources (nothing is hand-listed per sentence):
- declarations.json: the live declared native interfaces, dumped by `node declarations.mjs dump` (host.bindings() of
  each editor area: operations, parameters, types, enums, min/max/defaults);
- official-dataset/inventory.json: the reader keys and class banks; a parameter maps to a reader key through the
  ui-coverage-v2 case catalogue (cases.py) when it names a registered key, else through the importer's generic rule
  `<target type>.<parameter>` (data-drop-v1/import.py), else it is reported as unmapped (README);
- ui-coverage-v2/contexts.py: the named page contexts (objects with human names), extended with the codes the
  Show-IDs overlay displays;
- specs/ui-parity.md: the UI controls (gesture -> operation {arguments}).

Target forms: new (make), name, code (only in tabs that declare an ids.show operation), description, pronoun (a
follow-up: context.previous holds the turn that introduced the referent), population (only for operations that take
several ids), selection (UI controls acting on the current selection) and context (page/document/avatar-level
operations).

Run: node declarations.mjs dump > declarations.json && python3 generate.py && python3 validate.py
"""
import collections
import hashlib
import itertools
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
COV = HERE.parent / 'ui-coverage-v2'
sys.path.insert(0, str(COV))
import cases as C  # noqa: E402
import build as B  # noqa: E402  (ui-coverage-v2/build.py: request(), completion(), constraint())

INV = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
DECL = json.loads((HERE / 'declarations.json').read_text())
ACTS = set(INV['request']['request']['keys']['act']['values'])
TABS = ['drawing', 'diagram', 'document', 'calendar', 'avatar']
VIEW = {t: DECL[t]['view'] for t in TABS}
MAX_ENUM = 30          # closed enums: every value up to this many (an even spread above it)
MAX_PAIRS = 30         # parameter pairs per operation
MAX_TRIPLES = 8        # parameter triples per operation
WEIGHT = 0.2           # suggested training weight of a canonical anchor (README)


def spec(world, key):
    typ, _, name = key.partition('.')
    return INV.get(world, {}).get(typ, {}).get('keys', {}).get(name)


def words(s):
    return re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', str(s)).replace('_', ' ').replace('.', ' ').lower().strip()


def plural(w):
    if w.endswith(('s', 'x', 'ch', 'sh')):
        return w + 'es'
    if w.endswith('y') and w[-2:-1] not in 'aeiou':
        return w[:-1] + 'ies'
    return w + 's'


def article(w):
    return 'an' if w[:1] in 'aeiou' else 'a'


# ------------------------------------------------------------------ contexts (human names + Show-IDs codes)

def contexts():
    from contexts import CONTEXTS
    ctx = {}
    d = [dict(e) for e in CONTEXTS['drawing.scene'] + CONTEXTS['drawing.shapes']] + [{'kind': 'tree', 'name': 'Young pine'}, {'kind': 'cloud', 'name': 'Small cloud'}]
    for i, e in enumerate(d, 1):
        e['id'] = f'o{i}'
    ctx['drawing'] = d
    ctx['drawing.part'] = [dict(e) for e in CONTEXTS['drawing.parts']]
    g = [dict(e) for e in CONTEXTS['diagram.flow'] + CONTEXTS['diagram.charts'] if e['kind'] != 'rectangle' or e['name'] not in ('North', 'South')]
    n = collections.Counter()
    for e in g:
        p = {'arrow': 'e', 'group': 'g', 'chart': 'c'}.get(e['kind'], 'n')
        n[p] += 1
        e['id'] = f'{p}{n[p]}'
    ctx['diagram'] = g
    ctx['calendar'] = [dict(e) for e in CONTEXTS['calendar.week']]
    ctx['document'] = [dict(e) for e in CONTEXTS['document.notes']]
    a = [dict(e) for e in CONTEXTS['avatar.face']]
    slot = {'hair': 'hair_front', 'back hair': 'hair_back', 'shoulders': 'clothes'}
    for e in a:
        e['id'] = slot.get(e['kind'], e['kind'].replace(' ', '_'))
    ctx['avatar'] = a
    return ctx


CTX = contexts()
CODE_TABS = {t for t in TABS if any(o['id'].endswith('.ids.show') for o in DECL[t]['operations'])}
# Which context objects a target type refers to.
TYPE_KINDS = {
    ('drawing', 'drawn'): lambda e: e['kind'] not in ('group',), ('drawing', 'group'): lambda e: e['kind'] == 'group',
    ('diagram', 'node'): lambda e: e['kind'] not in ('arrow', 'group', 'chart'), ('diagram', 'link'): lambda e: e['kind'] == 'arrow',
    ('diagram', 'group'): lambda e: e['kind'] == 'group', ('diagram', 'chart'): lambda e: e['kind'] == 'chart',
    ('calendar', 'calendar'): lambda e: e['kind'] == 'calendar', ('calendar', 'person'): lambda e: e['kind'] == 'person',
    ('calendar', 'room'): lambda e: e['kind'] == 'room', ('calendar', 'meeting'): lambda e: e['kind'] in ('meeting', 'event'),
    ('document', 'section'): lambda e: e['kind'] in ('chapter', 'subchapter'), ('document', 'block'): lambda e: e['kind'] in ('paragraph', 'quote', 'list', 'table', 'heading'),
    ('avatar', 'part'): lambda e: e['kind'] != 'avatar', ('drawing', 'part'): lambda e: e['kind'] in ('roof', 'door', 'window', 'chimney', 'wheel', 'trunk', 'crown'),
}
TYPE_NOUN = {'page': {'drawing': 'drawing', 'diagram': 'diagram'}, 'sketch': 'diagram', 'document': 'document', 'face': 'avatar', 'text': 'document',
             'figure': 'avatar', 'preference': 'preferences', 'series': 'series', 'point': 'point', 'calendar': 'calendar'}


def context_for(world, typ):
    return CTX['drawing.part'] if (world, typ) == ('drawing', 'part') else CTX[world]


def objects_of(world, typ):
    f = TYPE_KINDS.get((world, typ))
    return [e for e in context_for(world, typ) if f and f(e)]


def noun(world, typ):
    n = TYPE_NOUN.get(typ, typ)
    return n.get(world, typ) if isinstance(n, dict) else n


# ------------------------------------------------------------------ operation templates and parameter -> key mapping

ON_TYPE = {'object': 'drawn'}


def template(world, d):
    name = d['id']
    if name in C.OPS:
        o = dict(C.OPS[name])
        if o.get('sel') and not spec(world, o['sel']):
            alt = o['sel'] + 's' if not o['sel'].endswith('s') else o['sel'][:-1]
            o['sel'] = alt if spec(world, alt) else None
            if not o['sel'] and o['mode'] == 'existing':
                o['fill'] = o.get('fill') or 'written'
        C.OPS[name] = {**C.OPS[name], 'sel': o.get('sel'), 'fill': o.get('fill')}
        if o['act'] not in ACTS:
            o['act'] = {'pick': 'select', 'ask': 'answer'}.get(d['act'], d['act']) if d['act'] in ACTS or d['act'] in ('pick', 'ask') else 'change'
        return o, True
    typ = ON_TYPE.get(d['on'].split('.')[-1], d['on'].split('.')[-1])
    if 'preference' in name:
        typ = 'preference'
    elif name.startswith('avatar.figure'):
        typ = 'figure'
    elif d['on'] == 'time.calendar':
        typ = 'calendar'
    elif name.startswith('chart.'):
        typ = {'series': 'series', 'point': 'point'}.get(name.split('.')[1], 'chart')
    if typ not in INV[world]:
        typ = {'drawing': 'drawn', 'diagram': 'node', 'document': 'block', 'calendar': 'meeting', 'avatar': 'face'}[world]
    act = {'pick': 'select', 'ask': 'answer'}.get(d['act'], d['act'])
    if act not in ACTS:
        act = 'change'
    params = d.get('params') or {}
    mode = 'new' if act == 'make' else 'existing'
    sel = None
    if mode == 'existing':
        for p in ('ids', 'id'):
            if p in params and spec(world, f'{typ}.{p}'):
                sel = f'{typ}.{p}'
                break
    fill = None if sel or mode == 'new' else 'context'
    mood = 'ask' if act == 'answer' else 'do'
    cases = [('describe', ['?describe'])] if mood == 'ask' else [('core', [])]
    return C.op(world, act, typ, mode, sel=sel, params={}, cases=cases, mood=mood, fill=fill), False


ALIAS = {'color': ['colour', 'color'], 'kind': ['kind', 'shape'], 'textColour': ['textColour', 'text_colour'], 'label': ['label', 'name'],
         'title': ['title', 'name'], 'capacity': ['seats', 'capacity'], 'participants': ['people', 'participants'], 'duration': ['length', 'duration']}


def map_param(world, opname, o, pname, p, catalogued):
    """Reader key(s) for a declared parameter: '@ref' (the target), '@kind' (the new target's kind), a registered key, or None."""
    if catalogued and pname in C.OPS[opname]['params']:
        keys = C.OPS[opname]['params'][pname]
        if not keys:
            return None, 'excluded in ui-coverage-v2/cases.py'
        if keys[0][0] in '@#':
            return keys[0], 'cases.py'
        good = [k for k in keys if spec(world, re.split('[@=]', k)[0])]
        if good:
            return good[0], 'cases.py'
    if C.excluded(opname, pname):
        return None, 'excluded in ui-coverage-v2/cases.py'
    if pname in ('id', 'ids') and o['mode'] == 'existing':
        return '@ref', 'target reference'
    if pname == 'kind' and o['mode'] == 'new':
        return '@kind', 'new target kind'
    typ = o['type']
    for cand in ALIAS.get(pname, [pname]) + [re.sub(r'([a-z])([A-Z])', r'\1_\2', pname).lower()]:
        if spec(world, f'{typ}.{cand}'):
            return f'{typ}.{cand}', 'importer rule <type>.<parameter>'
    if pname in ('id', 'ids'):
        return None, 'technical identifier generated by the tool'
    return None, f'no reader key {typ}.{pname} in official-dataset/inventory.json'


# ------------------------------------------------------------------ representative values

OPEN_TEXT = {
    'label': ['Review', 'Approved'], 'name': ['Main', 'Backup plan'], 'title': ['Quarterly plan', 'Team lunch'], 'text': ['Hello there', 'See you soon'],
    'caption': ['Figure one'], 'notes': ['bring the slides'], 'location': ['second floor'], 'topic': ['solar energy'], 'about': ['solar energy'],
    'source': ['sales data'], 'category': ['North'], 'xLabel': ['Month'], 'yLabel': ['Revenue'], 'font': ['serif'], 'material': ['wood'],
    'wear': ['a red scarf'], 'holds': ['an umbrella'], 'toward': ['the house'], 'behind': ['the house'], 'near': ['the lake'], 'seat': ['the bench'],
    'cause': ['the rain'], 'effect': ['shadow'], 'fill': ['stripes'], 'gradient': ['blue to white'], 'outline': ['black'], 'turn': ['left'],
    'unit': ['metres'], 'grade': ['steep'], 'trait': ['tall'], 'pose': ['sitting'], 'expression': ['happy'], 'variant': ['modern'], 'frame': ['round'],
    'calendar': ['Work'], 'room': ['Cedar room'], 'theme': ['ocean'], 'palette': ['pastel'], 'dimension': ['region'], 'measure': ['sales'],
    'only': ['North'], 'from': ['Start'], 'to': ['Review'], 'genre': ['report'], 'tone': ['formal'], 'value': ['bold'], 'property': ['tone'], 'key': ['link.style'], 'field': ['colour'],
    'scope': ['links'], 'color': ['teal', 'orange'], 'colour': ['teal', 'orange'], 'at': ['the top'], 'node': ['Review'], 'link': ['the arrow from Start to Review'], 'chart': ['Sales by region'], 'age': ['old'], 'sex': ['female'], 'person': ['a teacher'], 'traits': ['tall'], 'without': ['glasses'],
}
CATALOG_KINDS = {'drawing': ['giraffe', 'lighthouse', 'bicycle', 'windmill', 'castle', 'tractor'], 'document': ['paragraph', 'heading', 'quote']}
LISTS = {'items': ('milk, eggs and bread', ['milk', 'eggs', 'bread']), 'labels': ('North, South and East', ['North', 'South', 'East']),
         'values': ('3, 5 and 8', [3, 5, 8]), 'rows': ('Name, Age; Ana, 30', [['Name', 'Age'], ['Ana', '30']]),
         'blocks': ('one paragraph', [{'kind': 'paragraph', 'text': 'one paragraph'}]), 'cells': ('A, B; C, D', [['A', 'B'], ['C', 'D']]),
         'participants': ('Ana and Lee', ['Ana', 'Lee']), 'datasets': ('2023 and 2024', ['2023', '2024'])}
NUMBERS = {'index': [1, 2], 'x': [120, 300], 'y': [80, 240], 'width': [180, 60], 'height': [90, 40], 'size': [80, 30], 'scale': [1.5, 0.75], 'duration': [30, 45],
           'n': [3, 5], 'value': [42, 7], 'level': [2, 3], 'words': [300, 800], 'chapters': [3, 5], 'capacity': [8, 20], 'rotation': [45, 90],
           'opacity': [0.5, 0.8], 'fontSize': [18, 12], 'corner': [8, 0], 'factor': [2, 0.5], 'offset': [20, 40], 'stroke': [3, 8]}


def humanize(v):
    if isinstance(v, bool):
        return 'on' if v else 'off'
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return words(v) if isinstance(v, str) else str(v)


def spread(vals, k):
    if len(vals) <= k:
        return list(vals)
    step = len(vals) / k
    return [vals[int(i * step)] for i in range(k)]


def V(arg, surface, lab, phrase=None, extra=None):
    """One representative value: tool argument (None = resolved by the world), text surface, label value (None = derived),
    optional phrase containing the surface, optional extra constraints [key, surface, label] of the same parameter."""
    return {'arg': arg, 'surface': surface, 'lab': lab, 'phrase': phrase, 'extra': extra or []}


# Values of reader keys whose surface is not the tool argument (a calendar start is a day and a clock time; a mark's
# from/to are a text range the world locates from the quoted words).
KEY_VALUES = {
    'meeting.day': lambda: [V(None, 'Monday', 'Monday', 'on Monday at 10:00', [['meeting.time', '10:00', '10:00']]),
                            V(None, 'tomorrow', 'tomorrow', 'tomorrow at 15:30', [['meeting.time', '15:30', '15:30']])],
    'block.text@selector': lambda: [V(None, 'deadline', 'deadline', 'on the word deadline')],
    'section.text@selector': lambda: [V(None, 'deadline', 'deadline', 'on the word deadline')],
}
POSITIVE = {'on', 'show', 'true', 'yes', 'visible', 'shown', 'enabled'}


import datetime as _dt
_ms = lambda *a: int(_dt.datetime(*a, tzinfo=_dt.timezone.utc).timestamp() * 1000)
REFERENCE = {'Monday': _ms(2026, 11, 23, 10, 0), 'tomorrow': _ms(2026, 11, 22, 15, 30)}  # resolved against the generation day 2026-11-21 (Saturday)
KEY_PHRASE = {'link.from': 'from {}', 'link.to': 'to {}', 'block.from': 'from character {}', 'block.to': 'to character {}',
              'section.from': 'from character {}', 'section.to': 'to character {}'}


def values_for(world, key, pname, p):
    out = [x if isinstance(x, dict) else V(*x) for x in values_raw(world, key, pname, p)]
    fmt = (p.get('_intent') or {}).get(pname, {}).get('format')
    base = re.split('[@=]', key or '')[0]
    for v in out:
        if fmt == 'duration-ms' and isinstance(v['arg'], (int, float)):
            unit, mult = ('minutes', 60000) if world == 'calendar' else ('seconds', 1000)
            v['phrase'], v['arg'] = f"for {v['surface']} {unit}", v['arg'] * mult
        elif fmt == 'unix-ms' and v['arg'] is None:
            v['arg'] = REFERENCE.get(v['surface'])
        elif base in KEY_PHRASE and not v['phrase']:
            v['phrase'] = KEY_PHRASE[base].format(v['surface'])
    return out


def values_raw(world, key, pname, p):
    """[(arg value, surface, label value)] for one parameter; label value None = derived by build.constraint()."""
    if key in KEY_VALUES:
        return KEY_VALUES[key]()
    if key and key.endswith('@negative'):
        mark = key.split('@')[0]
        bank = (spec(world, mark) or {}).get('values') or ['bold']
        return [V(True, '', None), V(False, bank[0], bank[0], f'not {bank[0]}')]
    s = spec(world, re.split('[@=]', key)[0]) if key and key[0] not in '@#' else None
    bank = (s or {}).get('values')
    enum = p.get('enum')
    out = []
    if p.get('type') == 'boolean':
        pos = next((b for b in bank or [] if str(b).lower() in POSITIVE), None)
        neg = next((b for b in bank or [] if b != pos), None)
        return [(True, 'on', pos or 'true'), (False, 'off', neg or 'false')] if pos or not bank else [(True, str(bank[0]), bank[0])]
    if key == '@kind' and not enum:
        enum = C.DRAW_KINDS if world == 'drawing' and 'catalog' not in str(p.get('_op')) else CATALOG_KINDS.get(world, [])
    if enum:
        for v in spread([v for v in enum if v not in ('', None)], MAX_ENUM):
            lab = next((b for b in bank if str(b).lower() == str(v).lower()), v) if bank else (None if (s or {}).get('head', '').startswith('number') else str(v))
            out.append((v, humanize(v), lab))
        return out
    if bank:
        num = p.get('type') in ('number', 'integer')
        cast = lambda v: (int(float(v)) if p.get('type') == 'integer' or float(v).is_integer() else float(v)) if num and re.fullmatch(r'-?\d+(\.\d+)?', str(v)) else v
        return [(cast(v), humanize(v), v) for v in spread(bank, MAX_ENUM)]
    t = p.get('type')
    if t in ('number', 'integer'):
        lo, hi = p.get('min'), p.get('max')
        if pname in NUMBERS:
            vals = NUMBERS[pname]
        elif lo is not None and hi is not None:
            vals = [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.75]
        else:
            vals = [40, 15]
        res = []
        for v in vals:
            if lo is not None and v < lo:
                v = lo
            if hi is not None and v > hi:
                v = hi
            v = int(round(v)) if t == 'integer' or float(v).is_integer() else round(v, 2)
            res.append((v, str(v), str(v)))
        return list(dict.fromkeys(res))
    if t == 'array' and pname in LISTS:
        surface, arg = LISTS[pname]
        return [(arg, surface, surface)]
    if t == 'array':
        return []
    texts = OPEN_TEXT.get(pname) or [words(pname).title() + ' one']
    return [(v, v, v) for v in texts]


# ------------------------------------------------------------------ canonical phrasing

VERB = {'make': 'add', 'change': 'set', 'place': 'move', 'remove': 'delete', 'select': 'select', 'group': 'group', 'ungroup': 'ungroup',
        'connect': 'connect', 'arrange': 'arrange', 'undo': 'undo', 'redo': 'redo', 'copy': 'duplicate', 'merge': 'merge', 'split': 'split',
        'reverse': 'reverse', 'answer': 'describe', 'show': 'show', 'reset': 'reset', 'set': 'set', 'disconnect': 'disconnect'}
GENERIC_SEGMENTS = {'make', 'add', 'change', 'select', 'remove', 'place', 'move', 'resize', 'transform', 'clear', 'observe', 'chart', 'value',
                    'format', 'state', 'compose', 'preset', 'expression', 'name', 'feature', 'default', 'describe', 'write', 'parts', 'pose',
                    'vary', 'hold', 'new', 'adopt', 'rename', 'by', 'apply', 'connect', 'extract', 'layout', 'scale', 'reorder', 'mark', 'align', 'highlight', 'sort', 'show', 'number'}
OWN_VERB = {'drawing.part.extract': 'extract', 'diagram.layout.improve': 'tidy', 'diagram.link.improve': 'tidy', 'diagram.nodes.swap': 'swap',
            'diagram.node.insert': 'insert', 'diagram.nodes.align': 'align', 'diagram.nodes.distribute': 'distribute', 'diagram.chart.sort': 'sort',
            'diagram.chart.highlight': 'highlight', 'diagram.steps.number': 'number', 'document.block.reorder': 'move', 'document.section.reorder': 'move',
            'document.rewrite': 'rewrite', 'document.compose': 'compose', 'document.write': 'write', 'drawing.ids.show': 'show', 'diagram.ids.show': 'show',
            'avatar.ids.show': 'show', 'diagram.link.detach': 'detach', 'diagram.link.attach': 'attach', 'avatar.preference.reset': 'reset',
            'diagram.preference.reset': 'reset', 'diagram.page.new': 'start'}


def verb_for(opname, o):
    if opname in OWN_VERB:
        return OWN_VERB[opname]
    last = opname.split('.')[-1]
    if last not in GENERIC_SEGMENTS and o['act'] in ('change', 'place', 'make', 'arrange', 'merge', 'split', 'copy', 'reverse', 'remove'):
        return {'duplicate': 'duplicate', 'reverse': 'reverse', 'merge': 'merge', 'split': 'split', 'distribute': 'distribute', 'ungroup': 'ungroup'}.get(last, VERB.get(o['act'], 'set'))
    return VERB.get(o['act'], 'set')


class Skip(Exception):
    pass


def target_phrase(world, o, form, objs):
    """(text, seed target, args ref value, previous turn)."""
    typ = o['type']
    if form == 'new':
        return None, {}, None, None
    if form == 'context':
        n = noun(world, typ)
        return f'the {n}', {'ctx': True}, None, None
    if form == 'selection':
        ref = (objs[0].get('id') or objs[0]['name']) if objs else None
        return 'the selection', {'ctx': True}, ref, (f"select {objs[0]['name']}" if objs else None)
    if not objs:
        if form == 'description':
            n = noun(world, typ)
            return f'the {n}', {'kind': n}, None, None
        raise Skip('no context objects of this type')
    e = objs[0]
    ref = e.get('id') or e['name']
    if form == 'name':
        return e['name'], {'name': e['name']}, ref, None
    if form == 'code':
        if world not in CODE_TABS or not e.get('id'):
            raise Skip('no code')
        return e['id'], {'name': e['id']}, ref, None
    if form == 'description':
        kinds = collections.Counter(x['kind'] for x in context_for(world, typ))
        uniq = next((x for x in objs if kinds[x['kind']] == 1), None)
        if not uniq:
            raise Skip('no unique kind')
        return f"the {uniq['kind']}", {'kind': uniq['kind']}, uniq.get('id') or uniq['name'], None
    if form == 'pronoun':
        return 'it', {'ctx': True}, ref, f"select {e['name']}"
    if form == 'population':
        kinds = collections.Counter(x['kind'] for x in objs)
        k, cnt = kinds.most_common(1)[0]
        if cnt < 2:
            raise Skip('no population')
        refs = [x.get('id') or x['name'] for x in objs if x['kind'] == k]
        return f'all the {plural(k)}', {'all': f'all the {plural(k)}', '_kind': k, '_kind_span': plural(k)}, refs, None
    raise Skip(form)


def forms_for(world, o, declared):
    if o['mode'] == 'new':
        return ['new']
    if o.get('fill') in ('context', 'journal_step', 'all', 'description') and not o.get('sel'):
        return ['context']
    forms = ['name', 'code', 'description', 'pronoun']
    if o.get('sel', '') and o['sel'].endswith('ids') or 'ids' in declared:
        forms.append('population')
    return forms


def join_parts(parts):
    phr = [s for pw, s, ph in parts if ph]
    wit = [f'{pw} {s}' for pw, s, ph in parts if not ph]
    return (' ' + ' '.join(phr) if phr else '') + (' with ' + ' and '.join(wit) if wit else '')


def assemble(world, opname, o, form, params, objs, kind=None):
    """params: [(pname, key, (arg, surface, labval))]. Returns (text, seed, args, previous)."""
    verb = verb_for(opname, o)
    tphrase, tgt, ref, previous = target_phrase(world, o, form, objs)
    cons, args, parts = [], {}, []
    for pname, key, val in params:
        arg, surface, lab = val['arg'], val['surface'], val['lab']
        if key in ('@ref', '@all'):
            continue
        if key == '@kind':
            kind = surface
            args[pname] = arg
            continue
        if surface == '':
            args[pname] = arg
            continue
        base, _, oper = key.partition('@')
        base = base.split('=')[0]
        opts = []
        if oper in ('region', 'relation', 'degree', 'delta', 'factor'):
            opts.append(oper)
        elif oper == 'negative':
            opts.append('neg')
        elif oper == 'selector':
            opts.append('sel')
        if oper == 'negative':
            opts = ['neg']
        cons.append([base, surface, lab, opts] if lab is not None else [base, surface, opts])
        for ek, es, el in val['extra']:
            cons.append([ek, es, el, []])
        if arg is not None:
            args[pname.split('[')[0]] = arg
        args.update(val.get('extra_args') or {})
        parts.append((PARAM_WORDS.get(pname, words(pname.split('[')[0])), val['phrase'] or surface, bool(val['phrase'])))
    if ref is not None:
        decl_params = DECLARED[world][opname].get('params') or {}
        if 'ids' in decl_params:
            args['ids'] = ref if isinstance(ref, list) else [ref]
        elif 'id' in decl_params:
            args['id'] = ref[0] if isinstance(ref, list) else ref
    if o['mode'] == 'new':
        kind = kind or noun(world, o['type'])
        head = f"{verb} {article(kind)} {kind}"
        text = head + join_parts(parts)
        tgt = {'kind': kind}
    elif o['mood'] == 'ask':
        text = f"{verb} {tphrase}"
        if verb != 'describe':
            text = f"describe {tphrase}"
            verb = 'describe'
    elif verb == 'set' and parts:
        own = 'its' if form == 'pronoun' else None
        def one(pw, s, ph, first):
            if ph:
                return (f"change {tphrase} " if first else ' and ') + s
            if first:
                return f"set {own} {pw} to {s}" if own else f"set the {pw} of {tphrase} to {s}"
            return f" and the {pw} to {s}"
        text = ''.join(one(*x, i == 0) for i, x in enumerate(parts))
        if parts[0][2]:
            verb = 'change'
    elif verb == 'set':
        text = f"change {tphrase}"
        verb = 'change'
    else:
        text = f"{verb} {tphrase}" + join_parts(parts)
    seed = {'target': {k: v for k, v in tgt.items() if not k.startswith('_')}, 'c': cons, 'trigger': verb}
    if o['mood'] == 'ask':
        seed['q'] = next((k[1:] for _, ks in o['cases'] for k in ks if k.startswith('?')), 'describe')
    return text, seed, args, previous, tgt


PARAM_WORDS = {'n': 'count', 'ids': 'objects'}
DECLARED = {t: {d['id']: d for d in DECL[t]['operations']} for t in TABS}


def make_row(world, opname, o, form, params, objs, kind_hint=None, extra=None):
    text, seed, args, previous, tgt = assemble(world, opname, o, form, params, objs, kind_hint)
    for c in seed['c']:
        if c[1].lower() not in text.lower():
            raise Skip('surface lost')
    q = B.request(world, opname, seed, text)
    if form == 'population':
        q['target'].update({'kind': tgt['_kind'], 'kind_span': tgt['_kind_span']})
    if q['target'].get('fill') == 'description' and 'kind' in q['target'] and o['mode'] == 'existing':
        pass
    comp = B.completion(opname, [], q, seed)
    existing = context_for(world, o['type'])
    return {
        'world': world, 'text': text, 'context': {'existing': [dict(e) for e in existing], 'previous': previous}, 'requests': [q],
        'completion': comp, 'nativeTool': {'operation': opname, 'args': args}, **(extra or {}),
    }


# ------------------------------------------------------------------ UI controls (specs/ui-parity.md)

def ui_controls():
    out, tab = [], None
    names = {'Avatar': 'avatar', 'Drawing': 'drawing', 'Diagram': 'diagram', 'Calendar': 'calendar', 'Documents': 'document', 'Document': 'document'}
    for line in (REPO / 'specs' / 'ui-parity.md').read_text().splitlines():
        m = re.match(r'^##\s+(\w+)', line)
        if m:
            tab = names.get(m.group(1), tab)
            continue
        if not line.startswith('|') or not tab or line.startswith('| ---') or line.startswith('| Old control'):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) < 3:
            continue
        for op, argtext in re.findall(r'`([a-z]+(?:\.[a-z]+)+)\s*\{([^}`]*)\}`', ' '.join(cells[2:4])):
            if op in DECLARED.get(tab, {}):
                params = [a.split(':')[0].strip() for a in argtext.split(',') if a.strip()]
                out.append((tab, cells[0].replace('`', ''), op, [p for p in params if re.match(r'^[A-Za-z]+$', p)]))
                break
    for t in TABS:
        for c in C.parse_controls(C.TABS[t]):
            if c['operation'] in DECLARED[t]:
                out.append((t, c['label'] + ' (area control)', c['operation'], [c['param']] if c['param'] else []))
    seen, uniq = set(), []
    for c in out:
        k = (c[0], c[1], c[2])
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq


# ------------------------------------------------------------------ main

def main():
    rows, functions, unmapped, skipped = [], [], [], collections.Counter()
    for world in TABS:
        for d in DECL[world]['operations']:
            opname = d['id']
            o, catalogued = template(world, d)
            if not catalogued:
                C.OPS[opname] = o
            B.INTERFACES.setdefault(world, {})[opname] = {'params': {k: {'required': bool(v.get('required'))} for k, v in (d.get('params') or {}).items()}}
            mapped = []
            for pname, p in (d.get('params') or {}).items():
                key, why = map_param(world, opname, o, pname, p, catalogued)
                if key is None:
                    unmapped.append({'tab': world, 'operation': opname, 'parameter': pname, 'type': p.get('type'), 'reason': why})
                    functions.append({'tab': world, 'operation': opname, 'parameter': pname, 'key': None, 'values': 0})
                    continue
                vals = [] if key in ('@ref', '@all') else values_for(world, key, pname, {**p, '_op': opname, '_intent': (d.get('intent') or {}).get('parameters') or {}})
                if key not in ('@ref', '@all') and not vals:
                    unmapped.append({'tab': world, 'operation': opname, 'parameter': pname, 'type': p.get('type'), 'reason': 'no representative value (structured array)'})
                mapped.append((pname, key, vals))
                functions.append({'tab': world, 'operation': opname, 'parameter': pname, 'key': key, 'values': len(vals)})
            pv = (d.get('params') or {}).get('property', {}).get('enum')
            if pv and 'value' in (d.get('params') or {}) and all(spec(world, f"{o['type']}.{x}") for x in pv):
                mapped = [m for m in mapped if m[0] not in ('property', 'value')]
                for x in pv:
                    vals = values_for(world, f"{o['type']}.{x}", 'value', {'type': 'string'})
                    for v in vals:
                        v['extra_args'] = {'property': x}
                    mapped.append((f'value[{x}]', f"{o['type']}.{x}", vals))
            if not d.get('params'):
                functions.append({'tab': world, 'operation': opname, 'parameter': None, 'key': None, 'values': 0})
            o_live = C.OPS[opname] if not catalogued else o
            if catalogued:
                C.OPS[opname] = {**C.OPS[opname], 'act': o['act']}
            required = {k: bool(v.get('required')) for k, v in (d.get('params') or {}).items()}
            objs = objects_of(world, o['type'])
            forms = forms_for(world, o, d.get('params') or {})
            kinds = [v for pn, k, vs in mapped if k == '@kind' for v in vs]
            kind_hint = kinds[0]['surface'] if kinds else None
            valued = [(pn, k, vs) for pn, k, vs in mapped if vs and k not in ('@kind',)]
            kind_param = [(pn, k, vs) for pn, k, vs in mapped if k == '@kind']

            def emit(form, params, kind_pv=None, combo='single', parameters=None, value=None):
                ps = list(params)
                have = {re.split('[@=]', x[1])[0] for x in ps} | {x[0] for x in ps}
                for pn2, k2, vs2 in valued:  # a canonical command always carries the operation's required parameters
                    if required.get(pn2) and pn2 not in have and re.split('[@=]', k2)[0] not in have and (o_live['mode'] == 'new' or (spec(world, re.split('[@=]', k2)[0]) or {}).get('concept') not in ('id', 'ids', 'ordinal', 'index')):
                        ps.append((pn2, k2, vs2[0]))
                        have |= {pn2, re.split('[@=]', k2)[0]}
                if kind_pv:
                    ps = [kind_pv] + ps
                try:
                    r = make_row(world, opname, o_live, form, ps, objs, kind_hint if not kind_pv else None)
                except (Skip, B.SeedError) as e:
                    skipped[f'{opname}:{form}:{type(e).__name__}:{str(e)[:40]}'] += 1
                    return
                r['cohort'] = {'operation': opname, 'parameters': parameters or [p[0] for p in params], 'form': form, 'combination': combo,
                               **({'value': value} if value is not None else {})}
                rows.append(r)
            kp = (kind_param[0][0], '@kind', kind_param[0][2][0]) if kind_param and kind_param[0][2] else None
            # the operation alone, in every target form
            for form in forms:
                emit(form, [], kp, 'operation', [])
            # operation x parameter x value x form: every value once (forms rotate), the first value in every form
            for pn, k, vs in valued:
                for i, v in enumerate(vs):
                    fs = forms if i == 0 else [forms[i % len(forms)]]
                    for form in fs:
                        emit(form, [(pn, k, v)], kp, 'single', [pn], v['surface'])
            # kind spread for make operations
            for pn, k, vs in kind_param:
                for v in vs[1:]:
                    emit('new', [], (pn, k, v), 'single', [pn], v['surface'])
            # combinations of 2 and 3 parameters (first value each), name form (or the operation's only form)
            base_form = 'name' if 'name' in forms else forms[0]
            pairs = list(itertools.combinations(valued, 2))
            pairs = [p for p in pairs if len({x[1].split('@')[0].split('=')[0] for x in p}) == len(p)]
            for pair in spread(pairs, MAX_PAIRS):
                emit(base_form, [(pn, k, vs[0]) for pn, k, vs in pair], kp, 'pair', [x[0] for x in pair])
            triples = [t for t in itertools.combinations(valued, 3) if len({x[1].split('@')[0].split('=')[0] for x in t}) == 3]
            for tri in spread(triples, MAX_TRIPLES):
                emit(base_form, [(pn, k, vs[0]) for pn, k, vs in tri], kp, 'triple', [x[0] for x in tri])
    # compounds: two operations of the same tab in one message (each operation once as the first request)
    by_world = collections.defaultdict(list)
    for r in rows:
        if r['cohort']['combination'] == 'single' and r['cohort']['form'] in ('name', 'new', 'context'):
            by_world[r['world']].append(r)
    for world, rs in by_world.items():
        firsts = {}
        for r in rs:
            firsts.setdefault(r['cohort']['operation'], r)
        ops = list(firsts.values())
        for i, a in enumerate(ops):
            b = ops[(i * 7 + 3) % len(ops)]
            if b is a or a['context']['existing'] != b['context']['existing']:
                continue
            text = f"{a['text']}, then {b['text']}"
            qa, qb = json.loads(json.dumps(a['requests'][0])), json.loads(json.dumps(b['requests'][0]))
            qa['span'], qb['span'] = a['text'], b['text']
            rows.append({'world': world, 'text': text, 'context': a['context'], 'requests': [qa, qb], 'completion': a['completion'] + b['completion'],
                         'nativeTool': [a['nativeTool'], b['nativeTool']],
                         'cohort': {'operation': 'compound', 'operations': [a['cohort']['operation'], b['cohort']['operation']],
                                    'parameters': a['cohort']['parameters'] + b['cohort']['parameters'], 'form': 'compound', 'combination': 'compound'}})
    # UI controls: the gesture's operation with the control's parameters, on the selection (or new / context)
    controls = ui_controls()
    for tab, label, opname, cparams in controls:
        d = DECLARED[tab][opname]
        o = C.OPS[opname]
        ps = []
        for pn in cparams:
            p = (d.get('params') or {}).get(pn)
            if not p:
                continue
            key, _ = map_param(tab, opname, o, pn, p, opname in C.OPS and pn in C.OPS[opname]['params'])
            if key and key not in ('@ref', '@all', '@kind'):
                vs = values_for(tab, key, pn, p)
                if vs:
                    ps.append((pn, key, vs[0]))
        form = 'new' if o['mode'] == 'new' else ('name' if o['act'] == 'select' else 'selection' if o.get('sel') else 'context')
        try:
            r = make_row(tab, opname, o, form, ps, objects_of(tab, o['type']))
        except (Skip, B.SeedError) as e:
            skipped[f'control:{opname}:{type(e).__name__}'] += 1
            continue
        r['cohort'] = {'operation': opname, 'parameters': [p[0] for p in ps], 'form': form, 'combination': 'control', 'control': label}
        rows.append(r)
    # dedupe texts, ids, families, describeNativeControl text/wires
    seen, out = set(), []
    for r in rows:
        k = (r['world'], r['text'].lower(), r['context']['previous'])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    describe(out)
    per = collections.Counter()
    final = []
    for r in out:
        per[r['world']] += 1
        fam = int(hashlib.sha256(r['text'].encode()).hexdigest(), 16) % 4
        c = r['cohort']
        final.append({'format': 'psys2.ui-systematic-example/1', 'id': f"ui-systematic-v1-{r['world']}-{per[r['world']]:05d}", 'world': r['world'],
                      'text': r['text'], 'context': r['context'], 'requests': r['requests'], 'style': 'canonical', 'tier': 'canonical', 'canonical': True,
                      'weight': WEIGHT, 'phase': 'direct',
                      'cohort': {**c, 'recipeFamily': f"{c['operation']}:{'+'.join(c.get('parameters') or []) or 'op'}#{fam}"},
                      'completion': {'requirements': r['completion'], 'boundary': B.BOUNDARY}, 'nativeTool': r['nativeTool'],
                      'provenance': 'canonical anchor generated by ui-systematic-v1/generate.py from the declared native interfaces; not a paraphrase; labels mark only what the text says'})
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in final))
    templates = {}
    for f in functions:
        o = C.OPS[f['operation']]
        t = templates.setdefault(f['operation'], {'tab': f['tab'], 'act': o['act'], 'type': o['type'], 'mode': o['mode'], 'mood': o['mood'], 'keys': {}})
        if f['parameter']:
            t['keys'][f['parameter']] = f['key']
    (HERE / 'functions.json').write_text(json.dumps({'templates': templates, 'functions': functions, 'unmapped': unmapped, 'controls': [list(c) for c in controls],
                                                     'skipped': dict(skipped.most_common())}, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'rows': len(final), 'perTab': dict(per), 'functions': len(functions), 'unmapped': len(unmapped), 'controls': len(controls),
                      'skippedKinds': len(skipped)}))


def describe(rows):
    """Attach describeNativeControl's canonical intent text and wires (exact declared tool command) to each tool call."""
    calls, where = [], []
    for i, r in enumerate(rows):
        tools = r['nativeTool'] if isinstance(r['nativeTool'], list) else [r['nativeTool']]
        for j, t in enumerate(tools):
            calls.append({'view': VIEW[r['world']], 'operation': t['operation'], 'args': t['args']})
            where.append((i, j))
    res = subprocess.run(['node', str(HERE / 'declarations.mjs'), 'describe'], input=json.dumps(calls), capture_output=True, text=True, check=True)
    for (i, j), d in zip(where, json.loads(res.stdout)):
        r = rows[i]
        t = r['nativeTool'][j] if isinstance(r['nativeTool'], list) else r['nativeTool']
        t.update({'intentText': d.get('text'), 'wires': d.get('wires'), 'validArguments': d.get('validArguments'), 'argumentIssue': d.get('argumentIssue') or d.get('error'),
                  'executed': False})




README_HEAD = """# UI systematic, version 1: canonical anchors for every declared editor function

**These rows are canonical, not paraphrases.** Every row has `style: "canonical"`, `tier: "canonical"`, `canonical: true` and a
suggested training weight `weight: 0.2` (`prepare-official.py` SOURCE_WEIGHTS). They anchor the label of every declared
function in one plain, uniform English command; human paraphrases (20-30 per function: equivalent, complex, simplified)
come from the data worker (`management/COVERAGE-MATRIX.md`, `management/tasks-worker.md`).

## What is enumerated (nothing hand-listed per sentence)

- **Operations and parameters**: the live declared native interfaces of the five editor areas, `declarations.json`
  (`node declarations.mjs dump`: `host.bindings()` of Drawing, Diagram, Documents, Calendar, Avatar), with types, enums,
  min/max/defaults and declared formats.
- **Reader keys**: a parameter maps to a key of `official-dataset/inventory.json` through the ui-coverage-v2 case
  catalogue (`cases.py`) when that names a registered key, else through the importer's rule `<target type>.<parameter>`
  (`data-drop-v1/import.py`); parameters without a key are listed in `functions.json` (`unmapped`) and in the coverage
  matrix as "no reader key".
- **Values**: every value of a closed enum (an even spread of 30 above that), the class bank of the key otherwise, two
  representative numbers inside the declared range, representative text for open strings; calendar starts are a day
  and a clock time resolved against 2026-11-21; durations follow the declared `duration-ms` format.
- **Target forms**: new (make), by name, by code (only tabs that declare an `ids.show` operation: the Show-IDs codes),
  by description, by pronoun (a follow-up: `context.previous` holds the turn that introduced the referent), population
  ("all the arrows", operations taking several ids), selection (UI controls) and context (page/document/avatar level).
- **Combinations**: up to 30 parameter pairs and 8 triples per operation; required parameters are always included;
  compounds (two operations of a tab in one message); the UI controls of `specs/ui-parity.md` and the area controls of
  `worlds/*/area.sop` (gesture -> operation and its parameters).
- **Gold**: reader labels in the official row shape (built with ui-coverage-v2 `build.request()`/`completion()`), and
  `nativeTool`: the exact operation and arguments with the canonical intent text and wires of `describeNativeControl`
  (the UI training-pair mechanism). `executed: false`: the calls are not run; `validArguments: false` marks calls whose
  identity, parent, part index or generated id the world resolves (counted in `validation.json`).

Rebuild: `node declarations.mjs dump > declarations.json && python3 generate.py && python3 validate.py && python3 coverage.py`
(`coverage.py` writes `coverage.json` and `management/COVERAGE-MATRIX.md`). `validate.py` runs the official builder's
Validator and its UI-source conversion on every row (exit 1 on any error).

"""


def write_readme():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines()]
    fx = json.loads((HERE / 'functions.json').read_text())
    md = [README_HEAD, '## Counts', '']
    by_tab = collections.Counter(r['world'] for r in rows)
    fun = collections.Counter(f['tab'] for f in fx['functions'])
    ops = collections.Counter(f['tab'] for f in fx['functions'] if True)
    nops = {t: len({f['operation'] for f in fx['functions'] if f['tab'] == t}) for t in TABS}
    unm = collections.Counter(u['tab'] for u in fx['unmapped'])
    md += [f'{len(rows):,} rows over {sum(nops.values())} operations and {sum(1 for f in fx["functions"] if f["parameter"])} declared parameters '
           f'({len(fx["unmapped"])} without a reader key or representative value), {len(fx["controls"])} UI controls.', '',
           '| tab | operations | declared parameters | unmapped | rows | operation alone | single parameter | pair | triple | compound | control |',
           '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    comb = collections.defaultdict(collections.Counter)
    forms = collections.defaultdict(collections.Counter)
    per_op = collections.defaultdict(collections.Counter)
    for r in rows:
        comb[r['world']][r['cohort']['combination']] += 1
        forms[r['world']][r['cohort']['form']] += 1
        per_op[r['cohort']['operation']][r['cohort']['combination']] += 1
    for t in TABS:
        c = comb[t]
        md.append(f"| {t} | {nops[t]} | {sum(1 for f in fx['functions'] if f['tab'] == t and f['parameter'])} | {unm[t]} | {by_tab[t]:,} | {c['operation']} | {c['single']} | {c['pair']} | {c['triple']} | {c['compound']} | {c['control']} |")
    md += ['', '| tab | ' + ' | '.join(['new', 'name', 'code', 'description', 'pronoun', 'population', 'selection', 'context']) + ' |', '| --- |' + ' ---: |' * 8]
    for t in TABS:
        md.append(f'| {t} | ' + ' | '.join(str(forms[t][f]) for f in ['new', 'name', 'code', 'description', 'pronoun', 'population', 'selection', 'context']) + ' |')
    md += ['', '## Rows per operation', '', '| tab | operation | parameters (declared / with key) | rows | single | pairs + triples | controls |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
    for t in TABS:
        for op in dict.fromkeys(f['operation'] for f in fx['functions'] if f['tab'] == t):
            ps = [f for f in fx['functions'] if f['operation'] == op and f['parameter']]
            c = per_op[op]
            md.append(f"| {t} | `{op}` | {len(ps)} / {sum(1 for f in ps if f['key'])} | {sum(c.values())} | {c['single'] + c['operation']} | {c['pair'] + c['triple']} | {c['control']} |")
    md += ['', '## Unmapped declared parameters', '', '| tab | operation | parameter | reason |', '| --- | --- | --- | --- |']
    md += [f"| {u['tab']} | `{u['operation']}` | {u['parameter']} | {u['reason']} |" for u in fx['unmapped']]
    (HERE / 'README.md').write_text('\n'.join(md) + '\n')


if __name__ == '__main__':
    main()
    write_readme()
