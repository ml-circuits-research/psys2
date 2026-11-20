#!/usr/bin/env python3
"""Write the expected semantic outcome of each human-benchmark item as a gold semantic frame (sop.semantic-frame/1).

The benchmark's `expect.effects` name kinds, objects, properties, relations and directions (never tools); each effect
becomes one clause. This is the input of the oracle study (frame/oracle.mjs): what a perfect frame reader would say.
Property names are normalised to frame concepts by a small table (spelling, not meaning: "color" -> colour, "title" ->
name); everything else keeps its own words as the concept, so unbound concepts stay visible as unbound.

usage: python3 bench_to_frame.py ITEMS.jsonl > FRAMES.jsonl
"""
import json, re, sys

FORMAT = 'sop.semantic-frame/1'
CONCEPT = {'color': 'colour', 'title': 'name', 'series name': 'name', 'label colour': 'text_colour', 'font colour': 'text_colour',
           'font size': 'font_size', 'line colour': 'colour', 'line width': 'width', 'outline colour': 'outline', 'shape': 'kind',
           'x axis': 'axis.x.title', 'y axis': 'axis.y.title', 'x_axis': 'axis.x.title', 'y_axis': 'axis.y.title', 'colour_by': 'colour_by',
           'background colour': 'background', 'labels': 'labels', 'values': 'values', 'size': 'size', 'kind': 'kind', 'label': 'label', 'name': 'name'}
# the reader's value bank for size (the official labels' majority normalisation of degree words)
SIZE_BANK = {'large': 'big', 'medium': 'default', 'little': 'small', 'giant': 'huge', 'enormous': 'huge', 'massive': 'huge', 'regular': 'default', 'normal': 'default', 'medium-sized': 'default', 'medium sized': 'default'}
VAGUE = {'some', 'several', 'few', 'many', 'couple', 'handful', 'dozen'}
DIRECTIONS = {'up', 'down', 'left', 'right', 'closer', 'apart', 'forward', 'backward'}
REGION_WORDS = ('top', 'bottom', 'left', 'right', 'center', 'centre', 'middle', 'corner', 'background', 'foreground', 'sky', 'ground')


def concept(name):
    n = str(name).strip().lower().replace('_', ' ')
    return CONCEPT.get(n, n.replace(' ', '_'))


def quantity(count):
    if count is None or count == 1:
        return None
    if isinstance(count, int):
        return {'number': count}
    s = str(count).strip().lower()
    m = re.match(r'^(\d+)', s)
    if m:
        return {'number': int(m.group(1))}
    if s in VAGUE:
        return {'vague': s}
    return {'vague': 'some'}


def region_of(pos):
    p = str(pos).lower()
    if any(w in p for w in REGION_WORDS):
        words = [w for w in ('top', 'bottom', 'left', 'right', 'center', 'middle', 'corner', 'background', 'foreground') if w in p]
        if 'centre' in p:
            words.append('center')
        if 'sky' in p:
            words.append('top')
        if 'ground' in p and 'background' not in p and 'foreground' not in p:
            words.append('bottom')
        return '_'.join(dict.fromkeys(words)) or None
    return None


def mention_for(target, existing, role='theme'):
    """An existing object named by its name, else a description by kind word; 'all' is the population."""
    t = str(target or '').strip()
    low = t.lower()
    if low in ('all', 'everything', 'all elements', 'all nodes', 'the diagram', 'diagram', 'elements', 'nodes'):
        return {'role': role, 'reference': 'population', 'quantity': {'all': True}, **({'head': 'node'} if 'node' in low else {})}
    for o in existing:
        if o.get('name') and o['name'].lower() == low:
            return {'role': role, 'reference': 'name', 'name': o['name'], 'head': o.get('kind')}
    words = re.sub(r'^(the|a|an)\s+', '', low)
    ordinal = re.match(r'^(?:shape|node|box|item)\s+(\d+)$', words)
    if ordinal:
        return {'role': role, 'reference': 'ordinal', 'ordinal': [int(ordinal.group(1))], 'head': words.split()[0]}
    code = re.match(r'^([a-z]\d+)$', words)
    if code:
        return {'role': role, 'reference': 'code', 'code': code.group(1)}
    return {'role': role, 'reference': 'description', 'determiner': 'definite', 'head': words}


def clause_for(eff, it):
    existing = (it.get('context') or {}).get('existing') or []
    t = eff['type']
    if t == 'create':
        kind = eff.get('kind', 'thing')
        attrs = dict(eff.get('attrs') or {})
        head = kind
        if kind == 'chart' and attrs.get('chart'):
            head = f"{attrs.pop('chart')} chart"
        m = {'role': 'theme', 'reference': 'new', 'determiner': 'indefinite', 'head': head}
        q = quantity(eff.get('count'))
        if q:
            m['quantity'] = q
        c = {'action': {'act': 'make', 'mood': 'do'}, 'mentions': [m]}
        for k, v in attrs.items():
            if k in ('position', 'region'):
                r = region_of(v)
                if r:
                    c.setdefault('spatial', []).append({'theme': 0, 'region': r, 'span': str(v)})
                else:
                    c.setdefault('attributes', []).append({'theme': 0, 'concept': 'position', 'value': str(v)})
            elif k == 'size':
                c.setdefault('attributes', []).append({'theme': 0, 'concept': 'size', 'value': SIZE_BANK.get(str(v).lower(), str(v).lower()), 'value_span': str(v), 'operator': 'degree'})
            else:
                c.setdefault('attributes', []).append({'theme': 0, 'concept': concept(k), 'value': v if isinstance(v, (str, int, float)) else json.dumps(v)})
        rel = eff.get('relation')
        if rel and rel.get('landmark'):
            c['mentions'].append(mention_for(rel['landmark'], existing, 'landmark'))
            c.setdefault('spatial', []).append({'theme': 0, 'relation': rel.get('rel', 'near'), 'landmark': len(c['mentions']) - 1})
        return c
    if t in ('change', 'move'):
        m = mention_for(eff.get('target'), existing)
        c = {'action': {'act': 'change' if t == 'change' else 'place', 'mood': 'do'}, 'mentions': [m]}
        if t == 'change':
            prop = concept(eff.get('property', 'value'))
            if prop == 'kind':
                c['goal'] = [{'theme': 0, 'concept': 'kind', 'value': eff.get('value')}]
            else:
                a = {'theme': 0, 'concept': prop, 'value': eff.get('value')}
                if prop in ('size', 'width', 'height') and str(eff.get('value', '')).lower() in ('bigger', 'larger', 'smaller', 'wider', 'taller', 'shorter'):
                    a.update({'operator': 'delta', 'step': 'less' if str(eff['value']).lower() in ('smaller', 'shorter') else 'more'})
                c['attributes'] = [a]
        else:
            rel = eff.get('relation')
            if rel and rel.get('landmark'):
                c['mentions'].append(mention_for(rel['landmark'], existing, 'landmark'))
                c['spatial'] = [{'theme': 0, 'relation': rel.get('rel', 'near'), 'landmark': len(c['mentions']) - 1}]
            d = eff.get('direction')
            if d in DIRECTIONS:
                c['motion'] = [{'theme': 0, 'direction': d}]
            v = eff.get('value')
            if v and region_of(v) and not d:
                c.setdefault('spatial', []).append({'theme': 0, 'region': region_of(v), 'span': str(v)})
            elif v and region_of(v) and d:
                c['motion'][0]['amount'] = {'degree': 'much', 'span': str(v)}
            elif v:
                pos = re.search(r'position (\d+)', str(v))
                c.setdefault('attributes', []).append({'theme': 0, 'concept': 'order' if pos else 'position', 'value': pos.group(1) if pos else str(v)})
        return c
    if t == 'remove':
        return {'action': {'act': 'remove', 'mood': 'do'}, 'mentions': [mention_for(eff.get('target'), existing)]}
    if t == 'connect':
        c = {'action': {'act': 'connect', 'mood': 'do'}, 'mentions': [{'role': 'theme', 'reference': 'new', 'head': 'line'}], 'attributes': []}
        for end in ('from', 'to'):
            v = eff.get(end)
            if str(v).lower() in ('all', 'each', 'every'):
                c['mentions'][0]['quantity'] = {'all': True}
                c['attributes'].append({'theme': 0, 'concept': end, 'value': 'all', 'value_type': 'reference'})
            else:
                c['attributes'].append({'theme': 0, 'concept': end, 'value': v, 'value_type': 'reference'})
        for k, v in (eff.get('attrs') or {}).items():
            c['attributes'].append({'theme': 0, 'concept': concept(k), 'value': v})
        return c
    if t == 'layout':
        m = mention_for(eff.get('target') or 'all', existing)
        arrangement = str(eff.get('arrangement') or '')
        c = {'action': {'act': 'arrange', 'mood': 'do'}, 'mentions': [m]}
        if arrangement.lower() in ('better', 'natural', 'different', 'nicer'):
            c['manner'] = [{'theme': 0, 'objective': arrangement.lower()}]
        else:
            c['goal'] = [{'theme': 0, 'concept': 'layout', 'value': arrangement}]
        return c
    if t == 'query':
        about = str(eff.get('about') or '')
        qtype = 'why' if about.startswith('why') else 'where' if about.startswith('where') else 'describe'
        return {'action': {'act': 'answer', 'mood': 'ask'}, 'mentions': [mention_for(re.sub(r'^(why|where)\s+(the\s+)?', '', about).split(' is')[0] or 'all', existing)],
                'question': {'type': qtype}}
    if t == 'no_change':
        return {'action': {'act': 'converse', 'mood': 'do'}, 'mentions': [], 'discourse': 'thanks'}
    return None


def main():
    for line in open(sys.argv[1]):
        if not line.strip():
            continue
        it = json.loads(line)
        clauses = [c for c in (clause_for(e, it) for e in it['expect']['effects']) if c]
        frame = {'format': FORMAT, 'text': it['text'], 'area': it.get('area', it['tab']), 'clauses': clauses}
        if len(clauses) > 1:
            frame['structure'] = {'relations': [{'type': 'sequence', 'from': i, 'to': i + 1} for i in range(len(clauses) - 1)]}
        print(json.dumps({'id': it['id'], 'tab': it['tab'], 'frame': frame}))


if __name__ == '__main__':
    main()
