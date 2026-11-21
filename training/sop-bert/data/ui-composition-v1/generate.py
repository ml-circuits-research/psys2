#!/usr/bin/env python3
"""Generate ui-composition-v1 — PLACEHOLDER corpus (no worker data exists for these requests yet; coordinator 2026-11-21).

Requests that leave the content to the editor (specs/25-random-as-a-world.md, "Composition from knowledge"): random and
"surprise me" pictures, diagrams and charts, content grounded in the conversation, variants of the last composition
("another one", "simpler", "busier", "more like that"), things to include ("a random scene with a dog"), invented chart
values ("a chart with random values") and the standing Diagram preference compose.detail.

Label contract (proposed reader keys of spec 25, in the dataset's <type>.<key> form):
- target type `composition` (Drawing and Diagram), mode new; kind = scene name, diagram kind or chart when said;
- `composition.source` random | conversation; `composition.variant` another | similar | simpler | richer;
- `composition.with` span of the things to include (value = the thing);
- `chart.values` random | plausible on a composed chart; `chart.type` when the chart type is said;
- preference: act set, target type preference, `preference.key` = compose.detail, `preference.value` span.
Deterministic. Run: python3 generate.py && python3 validate.py"""
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEED = 20261122
PROV = 'PLACEHOLDER C1: generated paraphrase (ui-composition-v1/generate.py); replace with worker data when it exists'

DRAW_CTX = [[], [('house', 'House'), ('tree', 'Old oak')], [('sun', 'Sun'), ('cloud', 'Cloud'), ('boat', 'Sailboat')],
            [('dog', 'Dog'), ('girl', 'Girl')], [('car', 'Red car'), ('road', 'Road'), ('house', 'House')]]
DIAG_CTX = [[], [('box', 'Start'), ('box', 'Review'), ('link', 'e1')], [('chart', 'Sales'), ('point', 'A'), ('point', 'B')],
            [('oval', 'Begin'), ('diamond', 'Ready?'), ('rectangle', 'Ship')]]
SCENES = ['farm', 'beach', 'forest', 'city', 'garden', 'winter', 'park', 'harbour', 'desert', 'kitchen', 'night', 'space']
THINGS = ['a dog', 'a cat', 'two birds', 'a red car', 'a boat', 'a tree', 'some flowers', 'a girl', 'a horse', 'a balloon', 'a castle', 'three sheep']
THING_VALUE = {'a dog': 'dog', 'a cat': 'cat', 'two birds': 'bird', 'a red car': 'car', 'a boat': 'boat', 'a tree': 'tree', 'some flowers': 'flower',
               'a girl': 'girl', 'a horse': 'horse', 'a balloon': 'balloon', 'a castle': 'castle', 'three sheep': 'sheep'}
OPEN = ['', 'hey, ', 'ok ', 'please ', 'could you ', 'now ', 'go on, ', 'just ', 'can you ', 'I want you to ']
TAIL = ['', '', ' please', ', thanks', ' for me', ' now', '!', ' this time']
PREVIOUS_DRAW = ['draw something random', 'surprise me', 'draw a random farm', 'make a random picture with a dog']
PREVIOUS_DIAG = ['make a random flowchart', 'surprise me with a diagram', 'make a chart with random values', 'chart the numbers I mentioned']
CONV_PREV_DIAG = ['first we collect the orders, then we pack them, then we ship them and finally we send the invoice',
                  'we sold 40 units in March, 55 in April and 70 in May', 'the steps are: plan, build, test and release',
                  'our three teams have 12, 8 and 5 people']
CONV_PREV_DRAW = ['we talked about a picnic by the lake with my two dogs', 'my grandmother has a small house with a red door and a big garden',
                  'I went sailing last summer near a lighthouse', 'yesterday we saw horses on a farm']


def con(key, span, value, text):
    assert span in text, (span, text)
    return {'key': key, 'value_span': span, 'operator': 'eq', 'phase': 'result', 'polarity': 'positive', 'character': 'requirement', 'value': value}


def target(kind=None, kind_span=None, typ='composition'):
    t = {'type': typ, 'mode': 'new', 'determiner': 'indefinite'}
    if kind:
        t.update(kind=kind, kind_span=kind_span)
    return t


def row(world, text, trigger, act, tgt, cons, case, ctx, previous=None, mood='do'):
    assert trigger in text, (trigger, text)
    return {'format': 'psys2.ui-composition-example/1', 'world': world, 'text': text,
            'context': {'existing': [{'kind': k, 'name': n} for k, n in ctx], 'previous': previous},
            'requests': [{'span': text, 'trigger': trigger, 'act': act, 'mood': mood, 'target': tgt, 'constraints': cons}],
            'style': 'composition-placeholder', 'tier': 'equivalent', 'phase': 'follow-up' if previous else 'direct',
            'cohort': {'operation': f'{world}.compose', 'case': case, 'recipeFamily': f'{case}#1'}, 'provenance': PROV}


def cases(rng):
    out = []
    w = lambda s: rng.choice(OPEN) + s + rng.choice(TAIL)
    # Drawing: random / surprise
    for _ in range(80):
        f = rng.choice([('draw something random', 'draw', 'random'), ('surprise me', 'surprise', 'surprise me'),
                        ('draw anything you like', 'draw', 'anything'), ('make me a random picture', 'make', 'random'),
                        ('draw whatever you want', 'draw', 'whatever'), ('paint a random scene', 'paint', 'random'),
                        ('show me a surprise picture', 'show', 'surprise'), ('draw me something, anything', 'draw', 'anything')])
        text = w(f[0])
        out.append(row('drawing', text, f[1], 'make', target(), [con('composition.source', f[2], 'random', text)], 'draw:random', rng.choice(DRAW_CTX)))
    # Drawing: random scene of a kind, random scene with things
    for _ in range(80):
        sc = rng.choice(SCENES)
        f = rng.choice([(f'draw a random {sc} scene', 'draw'), (f'make a random {sc} picture', 'make'), (f'surprise me with a {sc} scene', 'surprise')])
        text = w(f[0])
        rs = 'random' if 'random' in text else 'surprise'
        out.append(row('drawing', text, f[1], 'make', target(sc, sc), [con('composition.source', rs, 'random', text)], 'draw:random-kind', rng.choice(DRAW_CTX)))
    for _ in range(100):
        th = rng.choice(THINGS)
        f = rng.choice([(f'a random scene with {th}', 'scene', 'random'), (f'draw a random picture with {th} in it', 'draw', 'random'),
                        (f'surprise me with a scene that has {th}', 'surprise', 'surprise'), (f'draw something random, but include {th}', 'draw', 'random'),
                        (f'make up a scene with {th}', 'make', 'make up')])
        text = w(f[0])
        cons = [con('composition.source', f[2], 'random', text), con('composition.with', th, THING_VALUE[th], text)]
        out.append(row('drawing', text, f[1], 'make', target(), cons, 'draw:random-with', rng.choice(DRAW_CTX)))
    # Drawing: grounded in the conversation
    for _ in range(80):
        f = rng.choice([('draw something about what we discussed', 'draw', 'what we discussed'), ('draw a picture of what we talked about', 'draw', 'what we talked about'),
                        ('illustrate what I just told you', 'illustrate', 'what I just told you'), ('can you draw what I described', 'draw', 'what I described'),
                        ('make a picture from our conversation', 'make', 'our conversation'), ('draw the scene I just described', 'draw', 'I just described')])
        text = w(f[0]) if not f[0].startswith('can') else f[0] + rng.choice(TAIL)
        out.append(row('drawing', text, f[1], 'make', target(), [con('composition.source', f[2], 'conversation', text)], 'draw:conversation',
                       rng.choice(DRAW_CTX), previous=rng.choice(CONV_PREV_DRAW)))
    # Both tabs: variants of the last composition
    VAR = [('another one', 'another', 'another', 'another'), ('give me another one', 'give', 'another', 'another'), ('do another', 'do', 'another', 'another'),
           ('a different one', 'different', 'a different one', 'another'), ('try again with a new one', 'try', 'a new one', 'another'),
           ('simpler', 'simpler', 'simpler', 'simpler'), ('make it simpler', 'make', 'simpler', 'simpler'), ('a simpler one', 'simpler', 'simpler', 'simpler'),
           ('less busy please', 'less', 'less busy', 'simpler'), ('busier', 'busier', 'busier', 'richer'), ('make it busier', 'make', 'busier', 'richer'),
           ('a busier one', 'busier', 'busier', 'richer'), ('more detail', 'more', 'more detail', 'richer'), ('more like that', 'more', 'like that', 'similar'),
           ('another one like that', 'another', 'like that', 'similar'), ('something similar', 'something', 'similar', 'similar'),
           ('one more in the same style', 'one', 'in the same style', 'similar')]
    for world, prevs in (('drawing', PREVIOUS_DRAW), ('diagram', PREVIOUS_DIAG)):
        for _ in range(110):
            f = rng.choice(VAR)
            text = rng.choice(['', 'ok, ', 'hmm, ', 'nice, ', 'no, ']) + f[0] + rng.choice(['', '', ' please', '!'])
            ctx = rng.choice(DRAW_CTX if world == 'drawing' else DIAG_CTX)
            out.append(row(world, text, f[1], 'make', target(), [con('composition.variant', f[2], f[3], text)], f'{world}:variant', ctx, previous=rng.choice(prevs)))
    # Diagram: random diagram / flowchart / cycle
    for _ in range(80):
        k = rng.choice([('flowchart', 'flowchart'), ('flowchart', 'flow chart'), ('cycle', 'cycle'), ('diagram', 'diagram'), ('chart', 'chart')])
        f = rng.choice([(f'make a random {k[1]}', 'make', 'random'), (f'surprise me with a {k[1]}', 'surprise', 'surprise'),
                        (f'draw any {k[1]} you like', 'draw', 'any'), (f'create a random {k[1]}', 'create', 'random')])
        text = w(f[0])
        cons = [con('composition.source', f[2], 'random', text)]
        out.append(row('diagram', text, f[1], 'make', target(k[0], k[1]), cons, 'diagram:random', rng.choice(DIAG_CTX)))
    # Diagram: grounded in the conversation
    for _ in range(90):
        f = rng.choice([('make a diagram of the process I just described', 'make', 'diagram', 'diagram', 'the process I just described'),
                        ('turn what I said into a flowchart', 'turn', 'flowchart', 'flowchart', 'what I said'),
                        ('draw the steps we discussed as a flowchart', 'draw', 'flowchart', 'flowchart', 'the steps we discussed'),
                        ('chart the numbers I mentioned', 'chart', 'chart', 'chart', 'the numbers I mentioned'),
                        ('make a chart of the figures I gave you', 'make', 'chart', 'chart', 'the figures I gave you'),
                        ('show those numbers as a bar chart', 'show', 'chart', 'bar chart', 'those numbers')])
        text = w(f[0])
        cons = [con('composition.source', f[4], 'conversation', text)]
        if f[3] == 'bar chart':
            cons.append(con('chart.type', 'bar', 'bar', text))
        out.append(row('diagram', text, f[1], 'make', target(f[2], f[3]), cons, 'diagram:conversation', rng.choice(DIAG_CTX), previous=rng.choice(CONV_PREV_DIAG)))
    # Diagram: invented chart values
    for _ in range(90):
        ty = rng.choice(['', 'bar ', 'pie ', 'line '])
        f = rng.choice([(f'a {ty}chart with random values', 'chart', 'random values', 'random'), (f'make a {ty}chart with random numbers', 'make', 'random numbers', 'random'),
                        (f'make up some numbers for a {ty}chart', 'make', 'make up some numbers', 'plausible'),
                        (f'a {ty}chart with plausible values', 'chart', 'plausible values', 'plausible'),
                        (f'draw a {ty}chart with realistic numbers', 'draw', 'realistic numbers', 'plausible'),
                        (f'fill a {ty}chart with sample data', 'fill', 'sample data', 'random')])
        text = w(f[0])
        cons = [con('chart.values', f[2], f[3], text)]
        if ty:
            cons.append(con('chart.type', ty.strip(), ty.strip(), text))
        out.append(row('diagram', text, f[1], 'make', target('chart', (ty + 'chart').strip()), cons, 'diagram:chart-values', rng.choice(DIAG_CTX)))
    # Diagram preference: compose.detail
    for _ in range(70):
        lv = rng.choice([('simple', 'simple'), ('minimal', 'simple'), ('rich', 'rich'), ('detailed', 'rich'), ('busy', 'rich'), ('normal', 'default')])
        f = rng.choice([(f'from now on keep the random diagrams {lv[0]}', 'keep'), (f'always make the surprise charts {lv[0]}', 'make'),
                        (f'I prefer {lv[0]} random diagrams', 'prefer'), (f'by default, make composed diagrams {lv[0]}', 'make'),
                        (f'random flowcharts should be {lv[0]} from now on', 'should')])
        text = rng.choice(['', 'ok, ', 'please ']) + f[0]
        tgt = {'type': 'preference', 'mode': 'new', 'determiner': 'indefinite'}
        cons = [{'key': 'preference.key', 'operator': 'eq', 'phase': 'result', 'polarity': 'positive', 'character': 'preference', 'value': 'compose.detail'},
                con('preference.value', lv[0], lv[1], text)]
        out.append(row('diagram', text, f[1], 'set', tgt, cons, 'diagram:preference-detail', rng.choice(DIAG_CTX)))
    return out


def main():
    rng = random.Random(SEED)
    rows, seen = [], set()
    for r in cases(rng):
        k = (r['world'], r['text'].lower(), r['context']['previous'], json.dumps(r['context']['existing']))
        if k in seen:
            continue
        seen.add(k)
        rows.append(r)
    for i, r in enumerate(rows, 1):
        r['id'] = f'ui-composition-v1-{i:05d}'
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    print(f'{len(rows)} rows')


if __name__ == '__main__':
    main()
