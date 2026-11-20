#!/usr/bin/env python3
"""Build human-adapted-v1/drawing/examples.jsonl and gaps.jsonl from authored.jsonl (deterministic, no network).

authored.jsonl holds one record per adapted corpus line: provenance (corpus, source id, licence, original line), the
context, the previous turn, construction tags, the adaptation note and the labels as inline markup:

  [@act ...]        one request span. Header after '[': '@' act, optional ':mood' (default do), optional ':ask' for
                    act=answer (question.ask), '/part' for a part target, then the target fill: '+' new (default for
                    make), '=desc' definite description, '=ctx' context (pronoun / implicit), '=name' written name,
                    '=all' population; ',def' definite new target; ',ord=<ordinal>'. The header ends at the first space.
  ^words^           trigger
  *noun*            kind span (kind = singular lemma); *noun|lemma* overrides the lemma
  $name$            name span (written fill)
  ~words~           description span (selector words of an existing target, e.g. 'in the red shirt')
  #two#             count span (count = digits)
  {key:value|span}  constraint; value optional ({key:|span} = mention without class value). Keys: size colour at rel
                    anchor dir dg dist name label count(=drawn.count) pcolour(=part.colour) owner(=part.id selector)
                    index(=part.index) kind(=drawn.kind, a kind change of an existing object). Suffix '.sel' = selector phase, '.neg' = negative polarity. size values
                    '+','++','-','--' are comparatives (operator delta, step more/much_more/less/much_less).
Marker characters never occur in the final text.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
NUM = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve'.split())}
KEYS = {'size': 'drawn.size', 'colour': 'drawn.colour', 'at': 'drawn.at', 'rel': 'drawn.relation', 'anchor': 'drawn.anchor',
        'dir': 'drawn.direction', 'dg': 'drawn.distanceGrade', 'dist': 'drawn.distance', 'name': 'drawn.name',
        'label': 'drawn.label', 'count': 'drawn.count', 'pcolour': 'part.colour', 'owner': 'part.id', 'index': 'part.index', 'kind': 'drawn.kind'}
STEP = {'+': 'more', '++': 'much_more', '-': 'less', '--': 'much_less'}
PROVENANCE = 'human-adapted-v1 (corpus line adapted by a coding agent; labels hand-authored, official Validator clean)'


def lemma(word):
    w = word.lower()
    for a, b in (('ies', 'y'), ('ches', 'ch'), ('shes', 'sh'), ('xes', 'x'), ('sses', 'ss')):
        if w.endswith(a) and len(w) > len(a) + 1:
            return w[:-len(a)] + b
    irregular = {'men': 'man', 'women': 'woman', 'children': 'child', 'people': 'person', 'kids': 'kid', 'fish': 'fish',
                 'sheep': 'sheep', 'mice': 'mouse', 'geese': 'goose', 'teeth': 'tooth', 'feet': 'foot', 'leaves': 'leaf',
                 'glasses': 'glasses', 'sunglasses': 'sunglasses', 'clothes': 'clothes', 'boots': 'boot', 'grass': 'grass'}
    last = w.split()[-1]
    if last in irregular:
        return ' '.join(w.split()[:-1] + [irregular[last]])
    if w.endswith('s') and not w.endswith('ss') and not w.endswith('us') and len(w) > 3:
        return w[:-1]
    return w


def parse(markup):
    """Returns (text, requests)."""
    out = []
    reqs, cur = [], None
    i, n = 0, len(markup)
    open_mark = {}

    def pos():
        return sum(len(s) for s in out)
    while i < n:
        ch = markup[i]
        if ch == '[':
            j = markup.index(' ', i)
            header = markup[i + 1:j]
            cur = {'header': header, 'start': pos(), 'kind': None, 'name': None, 'count': None, 'trigger': None, 'description': None, 'cons': []}
            i = j + 1
            continue
        if ch == ']':
            cur['end'] = pos(); reqs.append(cur); cur = None; i += 1; continue
        if ch in '^*$#~':
            if ch in open_mark:
                start, extra = open_mark.pop(ch)
                seg = ''.join(out)[start:]
                field = {'^': 'trigger', '*': 'kind', '$': 'name', '#': 'count', '~': 'description'}[ch]
                cur[field] = (seg, extra)
                i += 1
                continue
            # opening: kind may carry |lemma before the closing star
            if ch == '*':
                close = markup.index('*', i + 1)
                body = markup[i + 1:close]
                surface, _, lem = body.partition('|')
                s = pos(); out.append(surface)
                cur['kind'] = (surface, lem or None)
                i = close + 1
                continue
            open_mark[ch] = (pos(), None)
            i += 1
            continue
        if ch == '{':
            bar = markup.index('|', i)
            close = markup.index('}', bar)
            spec = markup[i + 1:bar]
            surface = markup[bar + 1:close]
            out.append(surface)
            cur['cons'].append((spec, surface))
            i = close + 1
            continue
        out.append(ch)
        i += 1
    if open_mark or cur is not None:
        raise ValueError('unbalanced markup: ' + markup)
    text = ''.join(out)
    requests = []
    for r in reqs:
        span = text[r['start']:r['end']]
        requests.append(build_request(r, span))
    return text, requests


def build_request(r, span):
    header = r['header']
    assert header.startswith('@'), header
    opts = header[1:].split(',')
    main = opts[0]
    fill = None
    for f in ('=desc', '=ctx', '=name', '=all', '+'):
        if main.endswith(f):
            fill = f; main = main[:-len(f)]; break
    ttype = 'drawn'
    if main.endswith('/part'):
        ttype = 'part'; main = main[:-5]
    bits = main.split(':')
    act = bits[0]
    mood = bits[1] if len(bits) > 1 and bits[1] else 'do'
    ask = bits[2] if len(bits) > 2 else None
    if fill is None:
        fill = '+' if act == 'make' else '=ctx'
    q = {'span': span}
    if r['trigger']:
        q['trigger'] = r['trigger'][0]
    q['act'] = act
    q['mood'] = mood
    t = {'type': ttype}
    if fill == '+':
        t['mode'] = 'new'
        t['determiner'] = 'definite' if 'def' in opts else 'indefinite'
    else:
        t['mode'] = 'existing'
        t['determiner'] = 'indefinite' if 'indef' in opts else 'definite'
        t['fill'] = {'=desc': 'description', '=ctx': 'context', '=name': 'written', '=all': 'all'}[fill]
    if r['kind']:
        surface, lem = r['kind']
        t['kind'] = lem or lemma(surface)
        t['kind_span'] = surface
    if r['name']:
        t['name_span'] = r['name'][0]
    if r['description']:
        t['description_span'] = r['description'][0]
    if r['count']:
        c = r['count'][0]
        t['count'] = NUM.get(c.lower(), c)
        t['count_span'] = c
    for o in opts[1:]:
        if o.startswith('ord='):
            t['ordinal'] = o[4:]
    q['target'] = t
    if ask:
        q['question'] = {'ask': ask}
    cons = []
    for spec, surface in r['cons']:
        k, _, v = spec.partition(':')
        mods = k.split('.')
        k = mods[0]
        key = KEYS[k]
        c = {'key': key, 'value_span': surface}
        phase = 'selector' if ('sel' in mods or k in ('anchor', 'owner')) else 'result'
        if k in ('rel', 'anchor'):
            op = 'relation'
        elif k == 'at':
            op = 'region'
        elif k == 'size' and v in STEP:
            op = 'delta'; c['step'] = STEP[v]; v = ''
        elif k in ('size', 'dg') and v and not v.isdigit():
            op = 'degree'
        elif k in ('size', 'dg') and not v:
            op = 'degree'
        else:
            op = 'eq'
        if k == 'anchor':
            v = surface
        if k == 'owner':
            v = surface
        if v:
            c['value'] = v
        c.update({'operator': op, 'phase': phase, 'polarity': 'negative' if 'neg' in mods else 'positive', 'character': 'requirement'})
        cons.append(c)
    q['constraints'] = cons
    return q


def main():
    rows, gaps = [], []
    n = 0
    for line in (HERE / 'authored.jsonl').read_text().splitlines():
        if not line.strip():
            continue
        a = json.loads(line)
        src = {'corpus': a['corpus'], 'id': a['source_id'], 'licence': a['licence'], **({'original': a['original']} if a.get('original') else {'original_withheld': a.get('original_withheld', 'withheld')})}
        if a.get('gap'):
            gaps.append({'text': a['text'], 'class': a['class'], 'source': src, 'needs': a['needs'], 'adaptation': a['adaptation'],
                         'context': {'existing': a['context'], 'previous': a.get('previous')}, 'labelled_as_example': a.get('labelled_as_example', False)})
            continue
        text, requests = parse(a['markup'])
        n += 1
        rows.append({'format': 'psys2.human-adapted-example/1', 'id': f'human-adapted-drawing-{n:04d}', 'world': 'drawing',
                     'text': text, 'context': {'existing': a['context'], 'previous': a.get('previous')},
                     'requests': requests, 'style': 'human-adapted', 'tier': 'equivalent', 'source': src,
                     'adaptation': a['adaptation'], 'construction': a['tags'], 'provenance': PROVENANCE})
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=True) + '\n' for r in rows))
    (HERE / 'gaps.jsonl').write_text(''.join(json.dumps(g, ensure_ascii=True) + '\n' for g in gaps))
    print(json.dumps({'examples': len(rows), 'gaps': len(gaps)}))


if __name__ == '__main__':
    main()
