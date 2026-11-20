#!/usr/bin/env python3
"""Build human-adapted-v1/diagram/examples.jsonl and gaps.jsonl from authored.jsonl (deterministic, no network).

authored.jsonl holds one record per adapted corpus line (or structural fill): provenance (corpus, source id, licence,
original line), context, previous turn, construction tags (primary usage class first), the adaptation note, and either
the labels as inline markup (`markup`) or a gap record (`gap`), or both (a labelled example whose remaining meaning the
inventory cannot express).

Markup:
  [@HEADER ...]   one request span. HEADER = act[:mood[:ask]][/type][fill][,opt...] and ends at the first space.
                  act from the request bank; mood do (default) | ask | check | propose; ask = question.ask.
                  type: node (default; link for connect, group for group, sketch for undo/redo/repeat) | link | chart |
                  group | series | point | diagram | sketch | page.
                  fill: '+' new (default for make/connect/group), '=desc' description, '=ctx' context (default otherwise),
                  '=name' written name, '=all' population, '=step' journal step, '=prev' previous reply.
                  opts: def / indef (determiner), ord=<ordinal>, q=<quantifier>, ak=<asked key>.
  ^words^         trigger
  *noun*          kind span (kind = singular lemma); *noun|lemma* overrides the lemma
  $name$          name span
  #two#           target count span (count = digits)
  ~phrase~        description span
  {key:value|span}  constraint. key = 'type.key' or a bare key of the target type. value omitted ({key|span}):
                  span/fill+span/bankless candidate keys copy the phrase, number keys take the numeral, class keys stay
                  a mention without value; '{key:|span}' forces no value. value '+', '++', '-', '--' = comparative
                  (operator delta, step more/much_more/less/much_less, no value).
                  modifiers after the key: .sel (selector phase) .res (result phase) .neg (negative polarity)
                  .pref (preference) .unit=<unit> .name (the phrase is also the target's name_span). anchor/ids/id/point.chart/sketch.* are selectors by default.
A backslash makes the next character literal (for marker characters that occur in the text).
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
INV = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())['diagram']
NUM = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve'.split())}
STEP = {'+': 'more', '++': 'much_more', '-': 'less', '--': 'much_less'}
TYPES = {'node', 'link', 'chart', 'group', 'series', 'point', 'diagram', 'sketch', 'page'}
SELECTOR_KEYS = {'node.anchor', 'node.ids', 'link.ids', 'group.id', 'chart.id', 'point.chart', 'sketch.nodes', 'sketch.links'}
PROVENANCE = 'human-adapted-v1 (corpus line adapted by a coding agent; labels hand-authored, official Validator clean)'
IRREGULAR = {'boxes': 'box', 'people': 'person', 'children': 'child', 'arrows': 'arrow', 'axes': 'axis', 'series': 'series',
             'diagrams': 'diagram', 'diamonds': 'diamond', 'ellipses': 'ellipse', 'bars': 'bar', 'slices': 'slice',
             'circles': 'circle', 'lines': 'line', 'shapes': 'shape', 'nodes': 'node', 'squares': 'square',
             'rectangles': 'rectangle', 'triangles': 'triangle', 'stars': 'star', 'hexagons': 'hexagon', 'clouds': 'cloud',
             'items': 'item', 'objects': 'object', 'figures': 'figure', 'elements': 'element', 'edges': 'edge',
             'links': 'link', 'connections': 'connection', 'labels': 'label', 'charts': 'chart', 'steps': 'step',
             'blocks': 'block', 'ovals': 'oval', 'arraws': 'arrow', 'cirles': 'circle', 'things': 'thing', 'pieces': 'piece'}


def lemma(word):
    w = word.lower()
    last = w.split()[-1]
    if last in IRREGULAR:
        return ' '.join(w.split()[:-1] + [IRREGULAR[last]])
    if w.endswith('ies') and len(w) > 4:
        return w[:-3] + 'y'
    if w.endswith(('ches', 'shes', 'xes', 'sses')):
        return w[:-2]
    if w.endswith('s') and not w.endswith(('ss', 'us', 'is')) and len(w) > 3:
        return w[:-1]
    return w


def number_of(surface):
    m = re.search(r'\d+(?:\.\d+)?', surface)
    if m:
        return m.group(0)
    for tok in re.findall(r'[a-z]+', surface.lower()):
        if tok in NUM:
            return NUM[tok]
    return None


def parse(markup):
    out, reqs, cur, open_mark = [], [], None, {}
    pos = lambda: sum(len(s) for s in out)
    i, n = 0, len(markup)
    while i < n:
        ch = markup[i]
        if ch == '\\':  # escaped marker character
            out.append(markup[i + 1]); i += 2; continue
        if ch == '[' and markup[i + 1:i + 2] == '@':
            j = markup.index(' ', i)
            cur = {'header': markup[i + 2:j], 'start': pos(), 'kind': None, 'name': None, 'count': None, 'trigger': None,
                   'desc': None, 'cons': []}
            i = j + 1
            continue
        if ch == ']' and cur is not None:
            cur['end'] = pos(); reqs.append(cur); cur = None; i += 1; continue
        if ch == '*':
            close = markup.index('*', i + 1)
            surface, _, lem = markup[i + 1:close].partition('|')
            out.append(surface); cur['kind'] = (surface, lem or None); i = close + 1; continue
        if ch in '^$#~':
            field = {'^': 'trigger', '$': 'name', '#': 'count', '~': 'desc'}[ch]
            if ch in open_mark:
                start = open_mark.pop(ch)
                cur[field] = ''.join(out)[start:]
            else:
                open_mark[ch] = pos()
            i += 1
            continue
        if ch == '{':
            bar = markup.index('|', i)
            close = markup.index('}', bar)
            surface = markup[bar + 1:close]
            out.append(surface); cur['cons'].append((markup[i + 1:bar], surface)); i = close + 1; continue
        out.append(ch)
        i += 1
    if open_mark or cur is not None:
        raise ValueError('unbalanced markup: ' + markup)
    text = ''.join(out)
    # Trailing sentence punctuation is not part of a request span ('?' stays: question spans keep it).
    return text, [build_request(r, text[r['start']:r['end']].rstrip(' .,;!')) for r in reqs]


def key_spec(full):
    typ, _, name = full.partition('.')
    return INV.get(typ, {}).get('keys', {}).get(name)


def build_request(r, span):
    head, *opts = r['header'].split(',')
    fill = None
    for f in ('=desc', '=ctx', '=name', '=all', '=step', '=prev', '+'):
        if head.endswith(f):
            fill, head = f, head[:-len(f)]
            break
    head, _, ttype = head.partition('/')
    bits = head.split(':')
    act = bits[0]
    mood = bits[1] if len(bits) > 1 and bits[1] else 'do'
    ask = bits[2] if len(bits) > 2 and bits[2] else None
    if not ttype:
        ttype = {'connect': 'link', 'group': 'group', 'undo': 'sketch', 'redo': 'sketch', 'repeat': 'sketch'}.get(act, 'node')
    assert ttype in TYPES, ttype
    if fill is None:
        fill = '+' if act in ('make', 'connect', 'group') else ('=step' if act in ('undo', 'redo', 'repeat') else '=ctx')
    q = {'span': span}
    if r['trigger']:
        q['trigger'] = r['trigger']
    q['act'], q['mood'] = act, mood
    t = {'type': ttype}
    if fill == '+':
        t['mode'] = 'new'
        t['determiner'] = 'definite' if 'def' in opts else 'indefinite'
    else:
        t['mode'] = 'existing'
        t['determiner'] = 'indefinite' if 'indef' in opts else 'definite'
        t['fill'] = {'=desc': 'description', '=ctx': 'context', '=name': 'written', '=all': 'all', '=step': 'journal_step',
                     '=prev': 'previous_reply'}[fill]
    if r['kind']:
        surface, lem = r['kind']
        t['kind'], t['kind_span'] = lem or lemma(surface), surface
    if r['name']:
        t['name_span'] = r['name']
    if r['desc']:
        t['description_span'] = r['desc']
    if r['count']:
        t['count'], t['count_span'] = number_of(r['count']), r['count']
    question = {}
    for o in opts:
        k, _, v = o.partition('=')
        if k == 'ord':
            t['ordinal'] = v
        elif k == 'q':
            t['quantifier'] = v
        elif k == 'ak':
            question['asked_key'] = v
    q['target'] = t
    if ask:
        q['question'] = {'ask': ask, **question}
    cons = []
    for spec, surface in r['cons']:
        k, has_value, v = spec.partition(':')
        mods = k.split('.')
        if len(mods) > 1 and mods[0] in TYPES and mods[1] not in ('sel', 'res', 'neg', 'pref', 'name') and not mods[1].startswith('unit='):
            key, mods = mods[0] + '.' + mods[1], mods[2:]
        else:
            key, mods = ttype + '.' + mods[0], mods[1:]
        spec_k = key_spec(key)
        assert spec_k is not None, 'unknown key ' + key
        c = {'key': key, 'value_span': surface}
        name = key.split('.')[1]
        if v in STEP:
            op, c['step'], v = 'delta', STEP[v], ''
        elif name in ('position', 'anchor') or key == 'node.relation':
            op = 'relation'
        elif name == 'at':
            op = 'region'
        elif key in ('node.size', 'group.size') and (v or not has_value):
            op = 'degree'
        else:
            op = 'eq'
        if not has_value:
            head_k = spec_k['head']
            if head_k.startswith('number'):
                v = number_of(surface) or ''
            elif head_k in ('span', 'fill+span') or (head_k == 'candidate' and not spec_k.get('values')):
                v = surface
            else:
                v = ''
        if v:
            c['value'] = v
        phase = 'selector' if ('sel' in mods or (key in SELECTOR_KEYS and 'res' not in mods)) else 'result'
        c.update({'operator': op, 'phase': phase, 'polarity': 'negative' if 'neg' in mods else 'positive',
                  'character': 'preference' if 'pref' in mods else 'requirement'})
        for m in mods:
            if m.startswith('unit='):
                c['unit'] = m[5:]
            if m == 'name':
                t['name_span'] = surface
        cons.append(c)
    q['constraints'] = cons
    return q


def main():
    rows, gaps = [], []
    for line in (HERE / 'authored.jsonl').read_text().splitlines():
        if not line.strip():
            continue
        a = json.loads(line)
        src = {'corpus': a['corpus'], 'id': a['source_id'], 'licence': a['licence'], **({'original': a['original']} if a.get('original') else {'original_withheld': a.get('original_withheld', 'withheld')})}
        ctx = {'existing': a['context'], 'previous': a.get('previous')}
        text = None
        if a.get('markup'):
            text, requests = parse(a['markup'])
            rows.append({'format': 'psys2.human-adapted-example/1', 'id': f'human-adapted-diagram-{len(rows) + 1:04d}',
                         'world': 'diagram', 'text': text, 'context': ctx, 'requests': requests, 'style': a['style'],
                         'tier': 'equivalent', 'source': src, 'adaptation': a['adaptation'], 'construction': a['tags'],
                         'provenance': PROVENANCE})
        if a.get('gap'):
            gaps.append({'text': text or a['text'], 'class': a['tags'][0], 'source': src, 'needs': a['gap'],
                         'adaptation': a['adaptation'], 'style': a['style'], 'context': ctx,
                         'labelled_as_example': bool(a.get('markup'))})
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=True) + '\n' for r in rows))
    (HERE / 'gaps.jsonl').write_text(''.join(json.dumps(g, ensure_ascii=True) + '\n' for g in gaps))
    print(json.dumps({'examples': len(rows), 'gaps': len(gaps)}))


if __name__ == '__main__':
    main()
