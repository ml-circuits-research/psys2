#!/usr/bin/env python3
"""Import the Diagram/Drawing data drops (management/data-drop/<batch>/*.jsonl, format of
management/DATA-REQUEST-diagram-drawing.md) into this folder for official-dataset/build.py.

A batch is imported only when its DONE marker file exists and matches its files (see signed()); imported batches are
frozen (frozen/<batch>.jsonl) and never re-read. Per batch: normalise the few request-format differences to the trainer's label inventory (act ask -> answer, operator count -> eq on
node.n / drawn.count; determiners and `needs` are kept as written),
validate every row (world, request fields, label banks and keys of the merged inventory, verbatim spans, references present
in context.existing, official Validator and row conversions, duplicates against the official dataset and earlier drops) and
write management/data-drop/<batch>/FEEDBACK.md (accepted/rejected counts with reasons and examples, normalisations).
Accepted rows of all batches go to accepted.jsonl.gz (source `data-drop-v1` of the official build); `needs` of all batches are
summarised in management/data-drop/NEEDS-SUMMARY.md for the compilation stream. Deterministic; re-run after every drop:
    python3 import.py && python3 ../../../../official-dataset/build.py
"""
import collections
import copy
import gzip
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
DROP = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(os.environ.get('DATA_DROP') or REPO.parent / 'management' / 'data-drop')  # DATA_DROP: the shared folder when run from another checkout
sys.path.insert(0, str(REPO / 'training' / 'sop-bert' / 'data' / 'ui-diagram-v2'))
from engine import merged_inventory  # noqa: E402  (official inventory + the Diagram keys of ui-diagram-v2)

spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
INVENTORY = merged_inventory()
for _area, _types in json.loads((HERE / 'inventory.json').read_text()).items():  # keys only the drops use so far (drawn.facing)
    for _typ, _definition in _types.items():
        _keys = INVENTORY.setdefault(_area, {}).setdefault(_typ, {'keys': {}})['keys']
        for _k, _spec in _definition['keys'].items():  # merged as the official build merges: values are added, never replaced
            _prior = _keys.get(_k) or {}
            _keys[_k] = {**_prior, **_spec, **({'values': list(dict.fromkeys([*_prior.get('values', []), *_spec.get('values', [])]))} if 'values' in _spec or 'values' in _prior else {})}
INV = official.Inventory(INVENTORY)
VALIDATOR = official.Validator(INV)
_, LEMMAS = official.kind_vocabulary()
WORLDS = {'diagram', 'drawing', 'avatar'}
DETERMINERS = {'definite': 'definite', 'indefinite': 'indefinite', 'demonstrative': 'definite', 'possessive': 'definite', 'quantified': 'definite'}
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|chart:\d+|seg-\d+)\b')
REF_KEYS = {'node.ids', 'link.ids', 'group.id', 'group.ids', 'drawn.ids', 'drawn.id', 'drawn.anchor', 'node.anchor', 'chart.id'}  # part.owner may name a part of an object ("the roof")
POPULATION = re.compile(r'\b(all|every|each|everything|them|these|those|it|its|this|that|selected|selection|one|ones|both|other|others|rest|her|him|his|she|he|they|their)\b', re.I)
WRAP = re.compile(r"^(hey|please|quick one|hmm|one more thing|ok|okay|so|um|uh|can you|could you|would you)[,:—\- ]+|[,— ]+(please|thanks|thank you|go on|if you can|cheers|pls)[.!?]*$", re.I)
STRICT = True  # quality review 2026-11-20: target/act words missing from the text reject the row (labels missing drop the label)
HOLD_RATE = 0.05  # quality gate (coordinator, 2026-11-20): a batch rejecting more than 5% of its rows is held
QUAL = {'some', 'a few', 'few', 'several', 'many', 'lots', 'a lot of', 'a couple of', 'more', 'a handful of'}


def norm(t):
    return ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def official_texts():
    seen = set()
    for p in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        path = REPO / 'official-dataset' / p
        with (gzip.open(path, 'rt') if p.endswith('.gz') else open(path)) as s:
            for line in s:
                o = json.loads(line)
                if o['source'] != 'data-drop-v1':
                    seen.add((o['world'], norm(o['text'])))
    return seen


def one_edit(a, b):
    if abs(len(a) - len(b)) > 1 or min(len(a), len(b)) < 4:
        return False
    if len(a) == len(b):
        d = [i for i in range(len(a)) if a[i] != b[i]]
        return len(d) == 1 or (len(d) == 2 and d[1] == d[0] + 1 and a[d[0]] == b[d[1]] and a[d[1]] == b[d[0]])
    if len(a) > len(b):
        a, b = b, a
    return any(b[:i] + b[i + 1:] == a for i in range(len(b)))


def ref_in_context(surface, existing):
    low = re.sub(r'^(the|a|an|this|that|these|those|my|our)\s+', '', surface.lower().strip(' "\'')).strip()
    if not low or POPULATION.search(low):
        return True
    words = set(re.findall(r'[a-z0-9?]+', low))
    for e in existing:
        for f in ('name', 'kind', 'id'):
            v = str(e.get(f, '')).lower()
            if v and (v == low or low in v or v in low or (words & set(re.findall(r'[a-z0-9?]+', v)) - {'the', 'a', 'of', 'to'})):
                return True
            if v and any(one_edit(w, x) for w in words for x in re.findall(r'[a-z0-9?]+', v)):
                return True  # a typo of a visible name ("Chek" for Check)
    return False


def split_merged(needs, text, stats):
    """'drawn.action+part.owner' with value 'hold; girl' and one span -> one entry per frame."""
    out = []
    for n in needs:
        if isinstance(n, dict) and '+' in str(n.get('frame', '')):
            frames = str(n['frame']).split('+')
            values = [v.strip() for v in str(n.get('value', '')).split(';')]
            stats['merged needs frame split ("a+b" -> a, b)'] += 1
            for i, f in enumerate(frames):
                v = values[i] if i < len(values) else None
                span = n.get('span') if (v and n.get('span') and v.lower() in str(n['span']).lower()) or f.endswith('owner') else \
                    (v if v and re.search(r'(?<!\w)' + re.escape(v) + r'(?!\w)', text, re.I) else None)
                out.append({'frame': f, 'value': v, 'span': span})
        else:
            out.append(n)
    return out


FACING_CUE = re.compile(r'\b(facing|faces|face|faced|looking|looks|look|turned|turn|turns|oriented|staring|gazing|glancing|pointed|aimed)\b(?:\W+\w+){0,2}\W+$', re.I)
MOTION_CUE = re.compile(r'\b(move|moves|moving|drive|drives|driving|run|runs|running|walk|walks|walking|slide|go|goes|going|head|heads|heading|fly|flies|flying|swim|swims|swimming|shift|push|drag|nudge|travel|travels)\b(?:\W+\w+){0,3}\W+$', re.I)


def facing_keys(world, q, stats):
    """A static orientation ("a dog facing left", "turned to the left") is drawn.facing; motion or pointing stays drawn.direction;
    when the words around the value say neither, the worker's label stays."""
    if world != 'drawing':
        return
    span = q.get('span') or ''
    for c in q.get('constraints') or []:
        if c.get('key') != 'drawn.direction' or c.get('value') not in ('left', 'right') or not isinstance(c.get('value_span'), str):
            continue
        at = span.find(c['value_span'])
        before = span[:at] if at >= 0 else ''
        if FACING_CUE.search(before) and not MOTION_CUE.search(before):
            c['key'] = 'drawn.facing'; stats['drawn.direction in a static sense (facing/looking/turned) -> drawn.facing'] += 1


# The drops' chart frames that have a declared reader key (inventory.json; bound by execution-policy.sop
# app.execution.keyBinding to the Diagram's chart group, chart make or page): frame -> key. The said value stays as the
# worker wrote it unless a normaliser below says otherwise (the key's declared said values cover the drops' forms);
# a value that is "same" (a reference to another object's setting) stays a need.
CHART_FRAMES = {
    'chart.dimension': 'chart.dimension', 'chart.font.size': 'chart.fontSize', 'chart.axis.position': 'chart.axisSide',
    'chart.axis.invert': 'chart.invert', 'chart.line.style': 'chart.lineStyle', 'chart.pie.precision': 'chart.precision',
    'chart.tick.precision': 'chart.precision', 'chart.tick.format': 'chart.tickFormat', 'chart.bar.width': 'chart.barWidth',
    'chart.bar.height': 'chart.barHeight', 'chart.bar.gap': 'chart.barGap', 'chart.line.width': 'chart.lineWidth',
    'chart.axis.scale': 'chart.axisScale', 'chart.marker.size': 'chart.markerSize', 'chart.marker.edge': 'chart.markerEdge',
    'chart.pie.radius': 'chart.pieRadius', 'chart.grid.style': 'chart.gridStyle', 'chart.title.position': 'chart.titlePosition',
    'chart.errorbar': 'chart.errorBars', 'chart.errorbar.cap': 'chart.errorCap', 'chart.legend.position': 'chart.legend', 'chart.position': 'chart.at',
}
NUMBER_WORDS = {'whole': 0, 'zero': 0, 'no': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4}


def chart_value(frame, value, nspan):
    """The key and value a chart frame's said value becomes, or None when the key cannot hold it (it stays a need)."""
    v = str(value or '').strip().lower()
    if not v or v.startswith('same'):
        return None
    key = CHART_FRAMES.get(frame)
    if frame == 'chart.axis.position':
        side = v.split()[-1]
        if v.startswith('x') and side in ('top', 'bottom'):
            return 'chart.xAxis', side
        return (key, side) if v.startswith('y') and side in ('left', 'right') else None
    if frame == 'chart.errorbar':
        return (key, {'show': 'show', 'remove': 'hide', 'hide': 'hide'}[v]) if v in ('show', 'remove', 'hide') else None
    if frame == 'chart.legend.position':
        return (key, v) if v in ('top right', 'right', 'bottom') else None
    if frame == 'chart.position':
        words = set(re.findall(r'[a-z]+', v))
        region = ('center' if words & {'center', 'centre', 'centered', 'middle'} else 'bottom' if words & {'bottom', 'below', 'beneath', 'under'}
                  else 'top' if words & {'top', 'above'} else 'left' if 'left' in words else 'right' if 'right' in words else None)
        return (key, region) if region else None
    if frame in ('chart.pie.precision', 'chart.tick.precision'):
        words = re.findall(r'[a-z]+|\d+', v)
        n = next((int(w) if w.isdigit() else NUMBER_WORDS[w] for w in words if w.isdigit() or w in NUMBER_WORDS), None)
        return (key, str(n)) if n is not None and 0 <= n <= 4 else None
    if frame == 'chart.title.position':
        return (key, v.replace(' ', '_')) if v in ('top', 'top left', 'bottom') else None
    canonical = {'chart.tick.format': {'powers of ten': 'power', 'magnitudes': 'magnitude'}, 'chart.line.style': {'dash-dot': 'dash_dot'},
                 'chart.axis.scale': {'both log': 'log'}, 'chart.axis.invert': {'off': 'none'}}.get(frame)
    if canonical is not None:
        v = canonical.get(v, v)
    if frame == 'chart.marker.edge' and v in ('off', 'none'):
        return key, 'off'
    if frame == 'chart.titleStyle':
        return None
    return (key, v) if key else None


_COMPARATIVES = None
# The chart keys whose values are numbers: a comparative of them ("bigger", "thinner") is a step (operator delta), as the
# reader writes comparatives everywhere; a word for none of the marker edge is its number 0.
NUMBER_CHART_KEYS = {'chart.fontSize', 'chart.lineWidth', 'chart.markerSize', 'chart.markerEdge', 'chart.barWidth', 'chart.barHeight', 'chart.pieRadius', 'chart.errorCap'}


def comparatives():
    """{word: 'more'|'less'} from the comparatives of k.values at the catalog pin (the site copy), way up or down."""
    global _COMPARATIVES
    if _COMPARATIVES is None:
        pin = re.search(r"commit: '([0-9a-f]{40})'", (REPO / 'src/knowledge/catalog-pin.mjs').read_text()).group(1)
        text = (REPO / 'docs/webchat/catalog' / pin / 'k.values' / 'shards' / 'scales.sop').read_text()
        _COMPARATIVES = {m.group(1).strip('"'): ('more' if m.group(2) == 'up' else 'less')
                         for m in re.finditer(r' k\.values\.comparative text=("[^"]*"|\S+) scale=\S+ way=(up|down) degree=comparative', text)}
    return _COMPARATIVES


def chart_keys(world, q, n, place):
    """Constraints for a chart, title-style, background or page-title need; [] when the need stays."""
    frame, value, nspan = n.get('frame'), n.get('value'), n.get('span')
    surface = nspan if place(nspan) else (str(value) if place(str(value)) else None)
    if world != 'diagram' or not surface:
        return []
    target = q.get('target') or {}
    if frame == 'chart.titleStyle':
        v = str(value or '').strip().lower()
        out = [('chart.titleWeight', 'bold')] if 'bold' in v.split() else []
        colour = ' '.join(w for w in v.split() if w != 'bold')
        if colour and colour in official_colours():
            out.append(('chart.titleColour', colour))
        return [{'key': k, 'value': x, 'value_span': surface, 'operator': 'eq', 'phase': 'result'} for k, x in out]
    if frame in ('diagram.background', 'page.title'):
        if q.get('act') != 'change' or target.get('fill') in ('description', 'all') or str(value or '').lower().startswith('same'):
            return []   # several pages or another object's setting: the Diagram tab has one page
        if frame == 'diagram.background':
            if str(value).lower() not in catalog_colours():
                return []   # not a colour the catalog knows ("a nice background"): stays a need
            key = 'page.background' if target.get('type') == 'page' else 'diagram.background'
            return [{'key': key, 'value': str(value).lower(), 'value_span': surface, 'operator': 'eq', 'phase': 'result'}]
        return [{'key': 'page.title', 'value': str(value), 'value_span': surface, 'operator': 'eq', 'phase': 'result'}]
    kv = chart_value(frame, value, nspan)
    if not kv:
        return []
    if kv[0] == 'chart.at' and (q.get('act') not in ('change', 'place') or target.get('mode') == 'new'):
        return []   # a chart made at a region: its size is not known before it is drawn; stays a need
    if kv[0] in NUMBER_CHART_KEYS:
        words = re.findall(r'[a-z]+', kv[1])
        step = next((comparatives()[w] for w in words if w in comparatives()), None)
        if step:
            return [{'key': kv[0], 'operator': 'delta', 'step': step, 'value_span': surface, 'phase': 'result'}]
        if kv[1] in ('off', 'none'):
            return [{'key': kv[0], 'value': '0', 'value_span': surface, 'operator': 'eq', 'phase': 'result'}]
        if not re.fullmatch(r'\d+(\.\d+)?', kv[1]):
            return []   # "medium", "as before": no number and no step; stays a need
    return [{'key': kv[0], 'value': kv[1], 'value_span': surface, 'operator': 'eq', 'phase': 'result'}]


_COLOURS = None
_CATALOG_COLOURS = None


def catalog_colours():
    """The colour names of k.colours at the catalog pin (the site copy docs/webchat/catalog/<pin>/), which the page's
    background rules look up."""
    global _CATALOG_COLOURS
    if _CATALOG_COLOURS is None:
        pin = re.search(r"commit: '([0-9a-f]{40})'", (REPO / 'src/knowledge/catalog-pin.mjs').read_text()).group(1)
        names = set()
        for shard in sorted((REPO / 'docs/webchat/catalog' / pin / 'k.colours' / 'shards').glob('*.sop')):
            names.update(m.strip('"').lower() for m in re.findall(r' k\.colours\.colour name=("[^"]*"|\S+)', shard.read_text()))
        _CATALOG_COLOURS = names
    return _CATALOG_COLOURS


def official_colours():
    """Colour names the official inventory's diagram colour keys accept, and the catalog's two-word names the drops use."""
    global _COLOURS
    if _COLOURS is None:
        names = set()
        for typ in INVENTORY.get('diagram', {}).values():
            for k in (typ.get('keys') or {}).values():
                if k.get('concept') == 'colour':
                    names.update(k.get('values') or [])
        _COLOURS = names | {'dark blue', 'dark red', 'dark green', 'dark orange', 'navy', 'teal', 'black', 'red'}
    return _COLOURS


def needs_to_keys(world, q, needs, stats):
    """Needs whose meaning has a declared key become that constraint (the worker's recurring frames); the rest stay needs."""
    span = q.get('span') or ''
    keep = []
    for n in split_merged(needs, span, stats):
        if not isinstance(n, dict):
            keep.append(n); continue
        if not (isinstance(n.get('span'), str) and n['span'] and n['span'].lower() in span.lower()):
            stats['need without its words in the request (internal code) rejected'] += 1
            continue
        frame, value, nspan = n.get('frame'), n.get('value'), n.get('span')
        if frame == 'drawn.emotion':
            frame = n['frame'] = 'drawn.expression'; stats['needs drawn.emotion folded into drawn.expression'] += 1
            if n.get('cause'):
                keep.append({'frame': 'drawn.expression.cause', 'value': n.pop('cause'), 'span': None})
        def place(surface):
            return isinstance(surface, str) and surface and bool(official.find_all(span, surface) or surface in span)
        c = None
        if world == 'drawing' and frame == 'drawn.becomes' and value:
            surface = value if place(value) else nspan
            if place(surface):
                c = {'key': 'drawn.kind', 'value': value, 'value_span': surface, 'operator': 'eq', 'phase': 'result'}
        elif world == 'drawing' and frame == 'part.owner' and place(nspan):
            c = {'key': 'part.owner', 'value': nspan, 'value_span': nspan, 'operator': 'eq', 'phase': 'selector'}
        elif world == 'drawing' and frame == 'drawn.facing' and str(value).lower() in ('left', 'right') and (place(nspan) or place(str(value))):
            c = {'key': 'drawn.facing', 'value': str(value).lower(), 'value_span': nspan if place(nspan) else str(value), 'operator': 'eq', 'phase': 'result'}
        elif world == 'drawing' and frame == 'drawn.region' and place(nspan):
            c = {'key': 'drawn.at', 'value': value, 'value_span': nspan, 'operator': 'region', 'phase': 'result'}
        garment = None
        if not c and world == 'drawing' and frame == 'part.garment':
            v = str(value or '').lower()
            if v in ('off', 'remove', 'take off', 'without'):
                if q.get('act') != 'remove':
                    q['act'] = 'remove'
                stats['needs part.garment off -> remove the part (drawing.part.remove)'] += 1
                continue
            if (q.get('target') or {}).get('type') == 'part':
                stats['needs part.garment on -> the part made on its owner (part target + part.owner)'] += 1
                continue
            if (q.get('target') or {}).get('type') == 'drawn' and place(nspan):
                c = {'key': 'drawn.wear', 'value': nspan, 'value_span': nspan, 'operator': 'eq', 'phase': 'result'}
        if not c and world == 'drawing' and frame == 'drawn.occlusion' and isinstance(nspan, str):
            m = re.search(r'\bbehind\s+((?:the|a|an|that|this)\s+[\w-]+)', nspan)
            if m and place(m.group(1)):
                c = {'key': 'drawn.behind', 'value': m.group(1), 'value_span': m.group(1), 'operator': 'relation', 'phase': 'selector'}
        if not c and world == 'drawing' and frame == 'drawn.action' and re.match(r'hold', str(value or ''), re.I):
            m = re.search(r'\bhold(?:s|ing)?\s+((?:the|a|an|her|his|their)\s+[\w-]+)', span)
            if m:
                c = {'key': 'drawn.holds', 'value': m.group(1), 'value_span': m.group(1), 'operator': 'eq', 'phase': 'result'}
        cs = [c] if c else chart_keys(world, q, n, place)
        if not cs and isinstance(frame, str):
            # A frame naming a declared key (or its dotted spelling) becomes that constraint (person, scene, preference, page keys).
            typ, _, rest = frame.partition('.')
            parts = [x for x in rest.split('.') if x]
            name = parts[0] + ''.join(x[:1].upper() + x[1:] for x in parts[1:]) if parts else ''
            spec = INVENTORY.get(world, {}).get(typ, {}).get('keys', {}).get(name)
            if spec and (place(nspan) or place(str(value or ''))):
                surface = nspan if place(nspan) else str(value)
                vals = [str(v) for v in spec.get('values') or []]
                low = str(value or '').lower().replace('_', ' ')
                val = next((v for v in vals if v.lower() == low), value) if vals else (surface if spec['head'] in ('span', 'fill+span') else value)
                g = {'key': f'{typ}.{name}', 'value': val, 'value_span': surface, 'operator': 'eq', 'phase': 'result'}
                if spec['head'].startswith('number'):
                    nums = re.findall(r'\d+(?:\.\d+)?', surface)
                    g = {**g, 'value': nums[0]} if len(nums) == 1 else None
                cs = [g] if g else []
        if cs:
            for c in cs:
                c.update({'polarity': 'positive', 'character': 'requirement'})
                q.setdefault('constraints', []).append(c)
                stats[f'needs {frame} -> constraint {c["key"]}'] += 1
        else:
            keep.append(n)
    return keep


PREF_DIAGRAM = re.compile(r'^(link|node|chart|palette|diagram|group|series)', re.I)
PREF_DRAWING = re.compile(r'^(placement|drawn|drawing|part|scene|page)', re.I)
DIAGRAM_KINDS = {'node', 'link', 'box', 'circle', 'rectangle', 'diamond', 'arrow', 'chart', 'group', 'ellipse', 'text'}


def preference_world(row, stats):
    """w.preferences rows (the worker's preference tab) belong to the tab whose preference or figure they set: the avatar
    figure (face.figure.*) is the avatar's figure family; a standing preference goes to the area its key names (link.style,
    palette -> diagram; placement.side -> drawing), else to the area its context shows."""
    reqs = row.get('requests') or []
    keys = [str(c.get('key', '')) for q in reqs for c in q.get('constraints') or []]
    pref_keys = [str(c.get('value', '')) for q in reqs for c in q.get('constraints') or [] if c.get('key') == 'preference.key']
    if any(k.startswith('face.figure.') for k in keys) or any((q.get('target') or {}).get('type') == 'avatar' for q in reqs) or any(v.startswith('avatar') for v in pref_keys):
        world = 'avatar'
    elif any((q.get('target') or {}).get('type') in ('diagram', 'node', 'link', 'chart', 'series', 'point', 'sketch') for q in reqs):
        world = 'diagram'  # a request in the same message acts on a Diagram object
    elif any((q.get('target') or {}).get('type') in ('drawn', 'part') for q in reqs):
        world = 'drawing'
    elif any(PREF_DIAGRAM.match(v) for v in pref_keys):
        world = 'diagram'
    elif any(PREF_DRAWING.match(v) for v in pref_keys):
        world = 'drawing'
    else:
        kinds = {str(e.get('kind', '')).lower() for e in (row.get('context') or {}).get('existing') or []}
        world = 'diagram' if kinds & DIAGRAM_KINDS else 'drawing'
    for q in reqs:
        t = q.get('target') or {}
        if t.get('type') == 'avatar':
            t['type'] = 'figure'
        for c in q.get('constraints') or []:
            if str(c.get('key', '')).startswith('face.figure.'):
                c['key'] = 'figure.' + c['key'].split('.', 2)[2]
    stats[f'w.preferences row -> {world} tab'] += 1
    row['world'] = world


def normalise(row, stats):
    if row.get('world') == 'w.preferences':
        preference_world(row, stats)
    world = row['world']
    if row.get('tier') in ('robustness', 'fragment'):
        row[row['tier']] = True
        stats[f'tier {row["tier"]} -> flag {row["tier"]}, real tier kept'] += 1
        row['tier'] = row.get('_family_tier') or 'equivalent'
    for q in row.get('requests') or []:
        if q.get('act') == 'ask':
            q['act'] = 'answer'; stats['act ask -> answer'] += 1
            q.setdefault('mood', 'ask')
            q.setdefault('question', {'ask': 'describe'})
        moved = []
        kept = []
        for c in q.get('constraints') or []:
            if isinstance(c, dict) and c.get('operator') == 'count':
                stats['operator count -> eq'] += 1
                c['operator'] = 'eq'
                if world == 'diagram' and c.get('key') in ('node.count', 'node.n'):
                    c['key'] = 'node.n'
                if c.get('value') is not None and not re.fullmatch(r'\d+(\.\d+)?', str(c['value'])):
                    c.pop('value', None); c['qualitative'] = True; stats['vague quantity kept as a mention without value'] += 1
            if isinstance(c, dict) and c.get('key') == 'node.rotate':
                c['key'] = 'node.rotation'; stats['node.rotate -> node.rotation (declared parameter name)'] += 1
            typ, _, name = str(c.get('key', '')).partition('.') if isinstance(c, dict) else ('', '', '')
            bad_meta = isinstance(c, dict) and any(f in c and c[f] not in INVENTORY['request']['constraint']['keys'][f]['values']
                                                   for f in ('operator', 'phase', 'polarity', 'character'))
            if isinstance(c, dict) and 'key' in c and c['key'] != 'question.ask' and (name not in INVENTORY.get(world, {}).get(typ, {}).get('keys', {}) or bad_meta):
                moved.append({'frame': c['key'] + (' (' + ', '.join(f'{f}={c[f]}' for f in ('operator', 'character') if f in c) + ')' if bad_meta else ''),
                              'value': c.get('value'), 'span': c.get('value_span')})
                stats['constraint with an undeclared key or meta value kept as needs (row kept)'] += 1
                continue
            if isinstance(c, dict) and 'key' not in c and ('frame' in c or 'span' in c):
                moved.append(c); stats['`needs` written inside constraints (no key) moved to needs'] += 1
            elif isinstance(c, dict) and c.get('key') == 'question.ask':
                q['question'] = {'ask': c.get('value') or 'describe'}
                if q.get('act') != 'answer':
                    q['act'] = 'answer'
                q['mood'] = q.get('mood') if q.get('mood') in ('ask', 'check') else 'ask'
                if not q.get('trigger') and isinstance(c.get('value_span'), str):
                    q['trigger'] = c['value_span']
                stats['question.ask written as a constraint moved to question.ask'] += 1
            elif isinstance(c, dict) and c.get('key') in ('chart.labels', 'group.labels') and isinstance(c.get('value_span'), str) and \
                    re.search(r'\b(by|per|for each|across)\s+(the\s+)?' + re.escape(c['value_span']) + r'\b', q.get('span') or '', re.I):
                moved.append({'frame': 'chart.dimension', 'value': c.get('value'), 'span': c['value_span']})
                stats['category dimension ("by month") labelled as chart.labels moved to needs chart.dimension'] += 1
            elif isinstance(c, dict) and c.get('character') == 'discard':
                stats['constraint with character discard (an old value) removed'] += 1
            else:
                kept.append(c)
        q['constraints'] = kept
        facing_keys(world, q, stats)
        if moved:
            q['needs'] = (q.get('needs') if isinstance(q.get('needs'), list) else [q['needs']] if q.get('needs') else []) + moved
        t = q.get('target') or {}
        for f in [f for f, v in t.items() if v is None]:
            del t[f]; stats[f'target {f}: null removed'] += 1
        if q.get('trigger') is None and 'trigger' in q:
            del q['trigger']
        if t.get('fill') == 'new' and t.get('mode') == 'new':
            del t['fill']; stats['target fill new on a new target removed (mode new says it)'] += 1
        if t.get('fill') == 'pronoun':
            t['fill'] = 'context'; stats['target fill pronoun -> context'] += 1
        if t.get('fill') == 'ordinal':
            t['fill'] = 'description'; stats['target fill ordinal -> description (ordinal kept)'] += 1
        span = q.get('span') if isinstance(q.get('span'), str) else ''
        if span:
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if isinstance(t.get(f), str) and not (official.find_all(span, t[f]) or t[f] in span):
                    if STRICT and f in ('kind_span', 'name_span'):
                        row['_strict_reject'] = f'target-{f}-not-in-text'  # strict import: the target's words must be in the text
                    else:
                        del t[f]; stats[f'target {f} not in the request text removed (row kept)'] += 1
            if STRICT and isinstance(q.get('trigger'), str) and q['trigger'] and q['trigger'] not in span:
                row['_strict_reject'] = 'trigger-not-in-text'
            before = len(q.get('constraints') or [])
            q['constraints'] = [c for c in q.get('constraints') or [] if not (isinstance(c, dict) and isinstance(c.get('value_span'), str)
                                                                             and not (official.find_all(span, c['value_span']) or c['value_span'] in span))]
            if len(q['constraints']) < before:
                stats['constraint whose words are not in the request text removed (row kept)'] += before - len(q['constraints'])
        # determiners are stored as said (demonstrative, possessive, quantified); prepare-official maps them for the current trainer
        for c in q.get('constraints') or []:
            if c.get('operator') == 'count':
                stats['operator count -> eq'] += 1
                c['operator'] = 'eq'
                if world == 'diagram' and c.get('key') in ('node.count', 'node.n'):
                    c['key'] = 'node.n'
                if str(c.get('value', '')).lower() in QUAL or not re.search(r'\d', str(c.get('value', ''))):
                    if c.get('value') is not None and not str(c['value']).isdigit():
                        c.pop('value', None); c['qualitative'] = True; stats['vague quantity kept as a mention without value'] += 1
            if c.get('key') == 'chart.type' and isinstance(c.get('value_span'), str):
                m = re.search(re.escape(c['value_span']) + r'(\s+(?:chart|graph|plot|diagram))\b', q.get('span') or '')
                if m:
                    c['value_span'] = c['value_span'] + m.group(1)
                    stats['chart.type span extended to the whole kind phrase ("bar" -> "bar chart")'] += 1
            for f in ('anchor_fill', 'anchor_kind', 'typo_of', 'alias_of'):
                c.pop(f, None)
        needs = q.get('needs')  # kept in the stored labels (request field) for the semantic-frame migration; also summarised
        if needs:
            q['needs'] = needs_to_keys(world, q, needs if isinstance(needs, list) else [needs], stats)
            if not q['needs']:
                del q['needs']
            else:
                yield q['needs']


def check(row, seen, official_seen):
    errs = []
    world, text = row.get('world'), row.get('text')
    if world not in WORLDS:
        return ['world-not-diagram-or-drawing']
    if not isinstance(text, str) or not text.strip():
        return ['empty-text']
    if SLOT_ID.search(text):
        errs.append('tool-or-slot-id-in-text')
    k = (world, norm(text), json.dumps(row.get('context'), sort_keys=True))
    if k in official_seen:
        errs.append('text-already-in-official-dataset')
    elif k in seen:
        errs.append('duplicate-text')
    existing = (row.get('context') or {}).get('existing') or []
    if not isinstance(existing, list) or not all(isinstance(e, dict) and e.get('kind') for e in existing):
        errs.append('context-existing-malformed')
    reqs = row.get('requests')
    if not isinstance(reqs, list):
        return errs + ['requests-missing']
    # objects made by the same message can be referred to by its later requests ("a lake, a boat on it, a house beside the lake")
    existing = existing + [{'kind': (q.get('target') or {}).get('kind') or '', 'name': (q.get('target') or {}).get('kind_span') or ''}
                           for q in reqs if isinstance(q, dict) and (q.get('target') or {}).get('mode') == 'new']
    for q in reqs:
        span = q.get('span')
        if not isinstance(span, str) or span not in text:
            errs.append('request-span-not-verbatim'); continue
        t = q.get('target') or {}
        for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
            if f in t and (not isinstance(t[f], str) or t[f] not in span):
                errs.append(f'target-{f}-not-verbatim-in-span')
        if t.get('mode') == 'existing' and t.get('fill') in ('written', 'description') and not existing:
            errs.append('reference-with-empty-context')
        if t.get('fill') == 'written' and t.get('name_span') and not ref_in_context(t['name_span'], existing):
            errs.append('name-not-in-context')
        for c in q.get('constraints') or []:
            vs = c.get('value_span')
            if isinstance(vs, str) and vs not in span:
                errs.append('value-span-not-verbatim-in-span')
            if isinstance(c.get('anchor_span'), str) and c['anchor_span'] not in span:
                errs.append('anchor-span-not-verbatim-in-span')
            if c.get('key') in REF_KEYS and c.get('phase') == 'selector' and isinstance(vs, str) and not ref_in_context(vs, existing):
                errs.append('selector-not-in-context')
            if isinstance(c.get('anchor_span'), str) and not ref_in_context(c['anchor_span'], existing):
                errs.append('anchor-not-in-context')
    if errs:
        return errs
    probe = {'text': text, 'world': world, 'context': copy.deepcopy(row.get('context') or {'existing': [], 'previous': None}),
             'requests': copy.deepcopy(reqs)}
    e, w, f = VALIDATOR.check(probe)
    return ['official:' + (x if x.startswith(('unregistered-key', 'act-not', 'target-type', 'question-ask', 'operator', 'character', 'phase')) else x.split(':')[0]) for x in e]


FROZEN = HERE / 'frozen'  # batches already consumed (imported once; their folders are never re-read): pilot, dg-batch-01 phase A


def signed(batch):
    """A batch is imported only when the worker's DONE marker file (written last) exists in data-drop/<batch>/ and every
    data file it lists exists with the listed row count; the batch's .jsonl files must all be listed. management/staging/
    is never read. Returns (ok, reason)."""
    marker = batch / 'DONE'
    if not marker.is_file():
        return False, 'no DONE marker'
    text = marker.read_text()
    listed = dict.fromkeys(re.findall(r'([\w.-]+\.jsonl)', text))
    if not listed:
        return False, 'DONE marker lists no .jsonl file'
    present = {p.name for p in batch.glob('*.jsonl')}
    if set(listed) != present:
        return False, f'DONE lists {sorted(listed)} but the folder holds {sorted(present)}'
    total = sum(sum(1 for line in (batch / name).read_text().splitlines() if line.strip()) for name in listed)
    m = re.search(r'^rows:\s*(\d[\d,]*)', text, re.M)
    if m and int(m.group(1).replace(',', '')) != total:
        return False, f'DONE says rows {m.group(1)}, the files hold {total}'
    for name in listed:
        rows = sum(1 for line in (batch / name).read_text().splitlines() if line.strip())
        m = re.search(re.escape(name) + r'\D{0,40}?(\d[\d,]*)', text)
        if m and int(m.group(1).replace(',', '')) != rows:
            return False, f'{name}: DONE says {m.group(1)} rows, the file has {rows}'
    return True, 'signed'


def marker_stamp(batch):
    marker = batch / 'DONE'
    if not marker.is_file():
        return None
    m = re.search(r'^timestamp:\s*(\S+)', marker.read_text(), re.M)
    return m.group(1) if m else marker.read_text()


def residual_marker(batch):
    """A marker for the residual rows of a batch whose bulk was consumed earlier (the bulk stays imported)."""
    return 'residual' in (batch / 'DONE').read_text().lower()


POPULATION_WORDS = re.compile(r'^(all|every|each|both)\b|\b(everything|all of them)\b', re.I)


COLOUR_WORDS = ['red', 'orange', 'yellow', 'gold', 'golden', 'lime', 'green', 'teal', 'cyan', 'blue', 'navy', 'indigo', 'purple', 'violet',
                'magenta', 'pink', 'brown', 'gray', 'grey', 'black', 'white', 'beige', 'silver', 'turquoise', 'maroon', 'olive', 'crimson',
                'light blue', 'dark blue', 'light green', 'dark green', 'dark red', 'light grey', 'dark grey', 'sky blue']
COLOUR_KEY = {('drawing', 'drawn'): 'drawn.colour', ('drawing', 'part'): 'part.colour', ('diagram', 'node'): 'node.colour', ('diagram', 'link'): 'link.colour',
              ('diagram', 'group'): 'group.colour'}
COLOUR_BEFORE = re.compile(r'(?<![\w-])(' + '|'.join(sorted((re.escape(c) for c in COLOUR_WORDS), key=len, reverse=True)) + r')\s+(?:[a-z]+\s+)?$', re.I)


def colour_label(row, q, t, span, stats):
    """A colour adjective that directly modifies the target noun ("a red car", "the blue small box") and has no colour label
    gets one: the colour of a new thing, or the selector of an existing one. Anything else is left alone."""
    key = COLOUR_KEY.get((row.get('world'), t.get('type')))
    kind_span = t.get('kind_span')
    if not key or not isinstance(kind_span, str) or kind_span not in span:
        return
    if any(str(c.get('key', '')).endswith(('colour', 'color')) for c in q.get('constraints') or []):
        return
    m = COLOUR_BEFORE.search(span[:span.index(kind_span)])
    if not m:
        return
    word = m.group(1)
    q.setdefault('constraints', []).append({'key': key, 'value': word.lower().replace('grey', 'gray'), 'value_span': word, 'operator': 'eq',
                                            'phase': 'result' if t.get('mode') == 'new' else 'selector', 'polarity': 'positive', 'character': 'requirement'})
    stats['colour adjective on the target noun without a colour label -> colour label'] += 1


def reference_ids(row, q, t, stats):
    """Selector ids name the things the request acts on (official contract, real-use v10/v11 diagnosis 2026-11-21):
    - an id that repeats the request's anchor is the reference point, not a selected thing ("send Flask on top of
      Sample": Sample is the anchor only);
    - an id whose value is a cut-short context name ("Supplier" when the text and the context say "Supplier A") is left
      out rather than kept truncated;
    - an answer about a named context thing that is a chart asks about the chart (target type chart, key chart.id)."""
    cons = q.get('constraints') or []
    if not cons:
        return
    fam = lambda c: str(c.get('key', '')).rsplit('.', 1)[0]
    tail = lambda c: str(c.get('key', '')).rsplit('.', 1)[-1]
    anchors = {(fam(c), str(c.get('value'))) for c in cons if tail(c) == 'anchor'}
    existing = (row.get('context') or {}).get('existing') or []
    names = {str(e.get('name')): str(e.get('kind') or '') for e in existing if e.get('name')}
    text = row.get('text') or ''
    kept = []
    for c in cons:
        if tail(c) in ('ids', 'id'):
            v = str(c.get('value'))
            if (fam(c), v) in anchors:
                stats['selector id repeating the anchor dropped'] += 1
                continue
            longer = [n for n in names if n != v and len(n) > len(v) and n.lower().startswith(v.lower()) and not n[len(v)].isalpha()
                      and n.lower() in text.lower()]
            if v not in names and longer:
                stats['cut-short name id left out'] += 1
                continue
        kept.append(c)
    if len(kept) != len(cons):
        q['constraints'] = kept
    if q.get('act') == 'answer' and t.get('type') == 'node' and row.get('world') == 'diagram':
        named = [str(c.get('value')) for c in kept if c.get('key') == 'node.ids']
        if named and all('chart' in names.get(v, '') for v in named):
            t['type'] = 'chart'
            for c in kept:
                if c.get('key') == 'node.ids':
                    c['key'] = 'chart.id'
            stats['answer about a named chart relabelled to the chart'] += 1


def official_contract(row, stats):
    """The official label contract on every imported row (frozen batches included): an existing target always states how it is
    given (written name or code, kind description, population, the context, a journal step), as the rest of the official data
    does; a chart type spans the whole kind phrase ("bar chart")."""
    for q in row.get('requests') or []:
        t = q.get('target') or {}
        if t.get('mode') == 'existing' and not t.get('fill'):
            if q.get('act') in ('undo', 'redo'):
                fill = 'journal_step'
            elif t.get('name_span'):
                fill = 'written'
            elif t.get('quantifier') or POPULATION_WORDS.search(str(t.get('description_span') or '')):
                fill = 'all'
            elif t.get('kind_span') or t.get('description_span'):
                fill = 'description'
            else:
                fill = 'context'
            t['fill'] = fill
            stats[f'existing target without fill -> {fill}'] += 1
        span = q.get('span') or ''
        colour_label(row, q, t, span, stats)
        reference_ids(row, q, t, stats)
        for c in q.get('constraints') or []:
            if c.get('key') == 'chart.type' and isinstance(c.get('value_span'), str):
                m = re.search(re.escape(c['value_span']) + r'(\s+(?:chart|graph|plot|diagram))\b', span)
                if m and not c['value_span'].endswith(('chart', 'graph', 'plot', 'diagram')):
                    c['value_span'] += m.group(1); stats['chart.type span extended to the whole kind phrase'] += 1
    return row


def main():
    frozen = {p.stem: [json.loads(l) for l in p.read_text().splitlines() if l.strip()] for p in sorted(FROZEN.glob('*.jsonl'))
              if not p.name.endswith(('.needs.jsonl', '.residual.jsonl'))}
    metas = {p.name[:-len('.meta.json')]: json.loads(p.read_text()) for p in FROZEN.glob('*.meta.json')}
    # A frozen batch keeps its rows, but needs whose frame has gained a declared key since it was imported become that
    # constraint (needs_to_keys is idempotent on what it already moved); the frozen file and its needs are rewritten.
    for name, rows in frozen.items():
        upgraded = collections.Counter()
        for r in rows:
            for q in r.get('requests') or []:
                if not q.get('needs'):
                    continue
                needs = q['needs'] if isinstance(q['needs'], list) else [q['needs']]
                kept = needs_to_keys(r['world'], q, needs, upgraded)
                if len(kept) != len(needs):
                    q['needs'] = kept
                    if not kept:
                        del q['needs']
        if upgraded:
            (FROZEN / f'{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
            needs_path = FROZEN / f'{name}.needs.jsonl'
            if needs_path.exists():
                left = collections.Counter((row['text'], n.get('frame')) for row in rows for q in row.get('requests') or [] for n in (q.get('needs') or []) if isinstance(n, dict))
                kept_rows = []
                for line in needs_path.read_text().splitlines():
                    if not line.strip():
                        continue
                    nr = json.loads(line)
                    if left[(nr.get('text'), nr.get('frame'))] > 0:
                        left[(nr.get('text'), nr.get('frame'))] -= 1
                        kept_rows.append(nr)
                needs_path.write_text(''.join(json.dumps(nr, ensure_ascii=False) + '\n' for nr in kept_rows))
            print(f'{name}: needs upgraded to keys {dict(upgraded)}', file=sys.stderr)
    # A frozen batch is not re-read unless the worker re-signed it (a DONE marker newer than the import): then its rows are
    # replaced by the re-signed files, or, for a residual marker, the residual rows are added beside the consumed bulk.
    resigned = {}
    for name in list(frozen):
        batch = DROP / name
        stamp = marker_stamp(batch) if batch.is_dir() else None
        if stamp and stamp != metas.get(name, {}).get('marker') and signed(batch)[0]:
            resigned[name] = 'residual' if residual_marker(batch) else 'replace'
            if resigned[name] == 'replace':
                del frozen[name]
    candidates = sorted(p for p in DROP.iterdir() if p.is_dir() and not p.name.startswith(('_', '.')) and (p.name not in frozen or resigned.get(p.name) == 'residual')) if DROP.exists() else []
    # Coordinator exception (2026-11-21): the worker signed these batches (DONE markers) but could not move them out of
    # management/staging/; they are read there, through the same checks, and their feedback says so.
    STAGED = {'dg-batch-21', 'pref-batch-01', 'dw-batch-19'}
    staging = DROP.parent / 'staging'
    candidates += sorted(staging / n for n in STAGED if (staging / n).is_dir() and n not in frozen and not (DROP / n).is_dir())
    batches, waiting = [], {}
    for p in candidates:
        ok, why = signed(p) if len(sys.argv) == 1 else (True, 'dry run')
        if ok:
            batches.append(p)
        else:
            waiting[p.name] = why
    official_seen = set()  # owner decision 2026-11-20: rows are never rejected for being in the official dataset or a benchmark; the build keeps one copy of identical texts
    seen, accepted, needs_all, needs_count = set(), [], collections.defaultdict(list), collections.Counter()
    summary = {}
    for batch in batches:
        files = sorted(batch.glob('*.jsonl'))
        rejected, reasons, examples, stats = 0, collections.Counter(), collections.defaultdict(list), collections.Counter()
        kept, total, per_world, per_class = 0, 0, collections.Counter(), collections.Counter()
        batch_needs = collections.Counter()
        batch_needs_rows = []
        fam_tiers = collections.defaultdict(collections.Counter)
        for path in files:
            for line in path.read_text().splitlines():
                try:
                    r0 = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r0.get('tier') not in ('robustness', 'fragment', None):
                    fam_tiers[r0.get('family')][r0['tier']] += 1
        for path in files:
            for i, line in enumerate(path.read_text().splitlines(), 1):
                if not line.strip():
                    continue
                total += 1
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    rejected += 1; reasons['invalid-json'] += 1; continue
                row = copy.deepcopy(row)
                if isinstance(row, dict) and fam_tiers.get(row.get('family')):
                    row['_family_tier'] = fam_tiers[row['family']].most_common(1)[0][0]
                needs = [n for group in normalise(row, stats) for n in group] if isinstance(row.get('requests'), list) else []
                errs = check(row, seen, official_seen)
                if row.get('_strict_reject'):
                    errs = (errs or []) + [row.pop('_strict_reject')]
                for n in needs:
                    frame = str((n or {}).get('frame', 'unspecified')) if isinstance(n, dict) else str(n)
                    batch_needs_rows.append({'batch': batch.name, 'text': row.get('text'), 'frame': frame,
                                             **({k: n.get(k) for k in ('value', 'span')} if isinstance(n, dict) else {'need': n})})
                    batch_needs[frame] += 1
                    needs_count[frame] += 1
                    if len(needs_all[frame]) < 8:
                        needs_all[frame].append({'batch': batch.name, 'text': row.get('text'), **(n if isinstance(n, dict) else {'need': n})})
                if errs:
                    rejected += 1
                    for e in sorted(set(errs)):
                        reasons[e] += 1
                        if len(examples[e]) < 5:
                            examples[e].append(f'{path.name}:{i} {row.get("text")!r}')
                    continue
                seen.add((row['world'], norm(row['text']), json.dumps(row.get('context'), sort_keys=True)))
                kept += 1
                per_world[row['world']] += 1
                for c in row.get('classes') or []:
                    per_class[c] += 1
                fam = str(row.get('family') or hashlib.sha256(row['text'].encode()).hexdigest()[:12])
                accepted.append({'id': f'{batch.name}-{"residual-" if resigned.get(batch.name) == "residual" else ""}{path.stem}-{i:05d}', 'world': row['world'], 'text': row['text'],
                                 'context': row.get('context') or {'existing': [], 'previous': None}, 'requests': row['requests'],
                                 'style': 'drop-' + str(row.get('tier') or 'equivalent') + ''.join('-' + f for f in ('robustness', 'fragment') if row.get(f)),
                                 'tier': row.get('tier'), **{f: True for f in ('robustness', 'fragment') if row.get(f)}, 'phase': 'direct',
                                 'cohort': {'recipeFamily': f'drop:{batch.name}:{fam}', 'classes': row.get('classes') or []}})
        cores = collections.defaultdict(set)
        for path in files:
            for line in path.read_text().splitlines():
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                t = r.get('text') or ''
                for _ in range(3):
                    t = WRAP.sub('', t.strip())
                cores[r.get('family')].add(norm(t))
        distinct = sum(len(v) for v in cores.values())
        summary[batch.name] = {'rows': total, 'accepted': kept, 'rejected': rejected, 'distinctCoresAfterWrappers': distinct}
        held = total and rejected / total > HOLD_RATE
        if held:  # a batch losing more than 5% of its rows is held back whole until the worker fixes it
            accepted = [r for r in accepted if r['cohort']['recipeFamily'].split(':')[1] != batch.name]
            summary[batch.name]['held'] = True
        lines = [f'# Import feedback: {batch.name}', '',
                 *(['Read from management/staging/ under the coordinator\'s exception of 2026-11-21 (signed by the worker, not moved to data-drop/).', '']
                   if batch.parent.name == 'staging' else []),
                 f'Rows {total}: **accepted {kept}**, rejected {rejected} ({100 * rejected / max(1, total):.1f}%) (importer `psys2/training/sop-bert/data/data-drop-v1/import.py`).'
                 + (' **Batch HELD: more than 5% of its rows were rejected; none of it is imported until a fixed re-signed batch arrives.**' if held else ''),
                 f'Accepted per tab: {dict(per_world)}; per class: {dict(per_class.most_common())}.',
                 f'Paraphrase variety: {distinct} distinct texts once greeting/politeness wrappers ("hey,", "quick one —", "please", ", thanks", "— go on") '
                 f'are removed, over {len(cores)} families ({total} rows). Wrappers are robustness, not paraphrases: each family needs 20+ real '
                 'rewordings (other verbs, word order, references, omissions, register), with wrappers as ~10% extra variants.', '']
        if reasons:
            lines += ['## Rejected rows by reason (a row can have several reasons)', '', '| reason | rows | examples |', '| --- | ---: | --- |']
            lines += [f'| {r} | {n} | {"<br>".join(e.replace("|", "/") for e in examples[r])} |' for r, n in reasons.most_common()]
            lines.append('')
        if stats:
            lines += ['## Normalised on import (not an error; the trainer label inventory differs from the request format)', '']
            lines += [f'- {k}: {v}' for k, v in stats.most_common()] + ['']
        if batch_needs:
            lines += ['## `needs` received (collected for the compilation stream, kept in the stored labels as `request.needs`)', '']
            lines += [f'- {k}: {v}' for k, v in batch_needs.most_common()] + ['']
        lines += ['## Systematic issues to fix in the next batches', '',
                  '- A `name_span` must be the words of the text. "turn the car into a truck" with `name_span: "Car"` (the context name) is a '
                  'definite description: `fill: description`, `kind: car`, `kind_span: car`; names are only real names or visible codes.',
                  '- A request `span` must cover every span of its labels: a value span outside the request span ("if Test passes ... — draw both arrows" '
                  'with span "draw both arrows") is rejected; make the span the clause that holds all of them (or the whole sentence).',
                  '- `needs` belong in `request.needs`, not in `constraints` (moved on import this time); a question kind is `question: {ask: ...}`, '
                  'not a `question.ask` constraint (moved on import this time); a replaced old value ("from 30 to 40") gets no constraint, '
                  'not `character: discard`.',
                  '- Target types are `chart`, `node`, ... exactly: typo variants belong in the text, never in label fields (`chhart`).',
                  '- A relation anchor must name an object of `context.existing` (or a new object of the same message: put the anchor on the '
                  'request that creates it only after the creating request, and keep it in the text verbatim).',
                  '- `chart.type` spans the whole kind phrase ("bar chart", "pie chart", "line graph"), as the Diagram corpus does (extended on '
                  'import this time). A list of categories is one `chart.labels` mention per category ("year 1", "year 2"), not one mention for the list.',
                  '- Category dimensions ("a pie chart of the staff by rank") are not category labels: `chart.labels` holds the category '
                  'words themselves ("Q1", "North"); a dimension stays unlabelled or in `needs` (`chart.dimension`).', '']
        lines += ['## Notes for the next batch', '',
                  '- acts: `answer` (with `mood: ask|check` and `question.ask`) is the trainer form of `ask`; `link.style` is the dash/dot key '
                  '(`link.pattern` is chain/cycle/star/all); determiners are `definite` / `indefinite`.',
                  '- Diagram conventions: psys2/training/sop-bert/data/ui-diagram-v2/README.md (populations, connect patterns, charts, '
                  'improvement intent, container words).', '']
        (batch / 'FEEDBACK.md').write_text('\n'.join(lines))
        if len(sys.argv) == 1:
            mine = [r for r in accepted if r['cohort']['recipeFamily'].split(':')[1] == batch.name]
            suffix = '.residual' if resigned.get(batch.name) == 'residual' else ''
            (FROZEN / f'{batch.name}{suffix}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in mine))
            (FROZEN / f'{batch.name}{suffix}.needs.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in batch_needs_rows))
            (FROZEN / f'{batch.name}.meta.json').write_text(json.dumps({'marker': marker_stamp(batch), 'rows': len(mine), 'mode': resigned.get(batch.name, 'new')}) + '\n')
    if len(sys.argv) > 1:
        print(json.dumps({'batches': summary, 'accepted': len(accepted), 'dryRun': True}, indent=1))
        return
    imported = {r['cohort']['recipeFamily'].split(':')[1] for r in accepted}
    keep_frozen = {n: rows for n, rows in frozen.items() if not (n in imported and resigned.get(n) != 'residual')}
    residuals = [json.loads(l) for p in sorted(FROZEN.glob('*.residual.jsonl')) if p.name[:-len('.residual.jsonl')] not in imported
                 for l in p.read_text().splitlines() if l.strip()]
    for r in residuals:  # residual rows share line numbers with their batch's consumed bulk: their ids say residual
        b = r['cohort']['recipeFamily'].split(':')[1]
        if not r['id'].startswith(b + '-residual-'):
            r['id'] = r['id'].replace(b + '-', b + '-residual-', 1)
    accepted = [r for rows in keep_frozen.values() for r in rows] + residuals + accepted
    contract, per_batch = collections.Counter(), collections.defaultdict(collections.Counter)
    for r in accepted:
        official_contract(r, per_batch[r['cohort']['recipeFamily'].split(':')[1]])
    for name, counts in per_batch.items():
        contract.update(counts)
        fb = DROP / name / 'FEEDBACK.md'
        if fb.exists() and len(sys.argv) == 1:  # the contract applied to every imported row, logged per batch
            text = fb.read_text().split('\n## Official label contract applied on import')[0].rstrip('\n')
            fb.write_text(text + '\n\n## Official label contract applied on import (all imported rows of this batch)\n\n'
                          + ''.join(f'- {k}: {v}\n' for k, v in counts.most_common()))
    ids = collections.Counter(r['id'] for r in accepted)
    if any(n > 1 for n in ids.values()):
        raise SystemExit('duplicate imported row ids: ' + ', '.join(k for k, n in ids.items() if n > 1)[:300])
    summary['officialContract'] = dict(contract)
    summary.update({name: {'frozen': len(rows)} for name, rows in keep_frozen.items() if name not in summary})
    for name, mode in resigned.items():
        summary.setdefault(name, {})['resigned'] = mode
    summary.update({name: {'waiting': why} for name, why in waiting.items()})
    import gzip  # over 100 MB as text (GitHub's file limit): stored gzipped, deterministic (no name, mtime 0)
    with open(HERE / 'accepted.jsonl.gz', 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as z:
        z.write(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in accepted).encode())
    (HERE / 'accepted.jsonl').unlink(missing_ok=True)
    every = [json.loads(l) for p in sorted(FROZEN.glob('*.needs.jsonl')) for l in p.read_text().splitlines() if l.strip()]
    if every:
        by = collections.defaultdict(list)
        for r in every:
            by[r['frame']].append(r)
        out = ['# Meanings without a key (data drops)', '', 'Collected from `needs` of every imported batch by the importer; frame -> requests and examples.', '']
        for frame, rs in sorted(by.items(), key=lambda x: -len(x[1])):
            out.append(f'## {frame} ({len(rs)} requests; batches {sorted({r["batch"] for r in rs})})')
            out += [f'- {r["batch"]}: {r["text"]!r} value={r.get("value")!r} span={r.get("span")!r}' for r in rs[:8]]
            out.append('')
        (DROP / 'NEEDS-SUMMARY.md').write_text('\n'.join(out))
    print(json.dumps({'batches': summary, 'accepted': len(accepted)}, indent=1))


if __name__ == '__main__':
    main()
