#!/usr/bin/env python3
"""Comparative requests for the reader (C1 authoring; labels in the ui-natural format).

"make the house bigger", "make it a bit smaller", "make Box wider", "make the eyes much larger", "make the meeting
shorter". A comparative is a change relative to the current value: operator `delta`, `step` more / much_more /
less / much_less, the comparative word as `value_span`, no value and no measure (the library turns it into a
factor condition on the declared concept). Targets are existing objects of each tab's fixture, referred to by a
definite description (kind), a pronoun (context) or a name. Not execution-verified (`nativeTool: null`).
"""
import collections
import json
import pathlib
import random

here = pathlib.Path(__file__).parent
CONTEXTS = {
    'drawing': [{'kind': 'house', 'name': 'House'}, {'kind': 'rectangle', 'name': 'Box'}, {'kind': 'circle', 'name': 'Circle'}, {'kind': 'tree', 'name': 'Tree'},
                {'kind': 'sun', 'name': 'Sun'}, {'kind': 'lake', 'name': 'Lake'}, {'kind': 'cloud', 'name': 'Cloud'}],
    'diagram': [{'kind': 'rectangle', 'name': 'Start'}, {'kind': 'circle', 'name': 'Finish'}, {'kind': 'diamond', 'name': 'Decision'}],
    'avatar': [{'kind': 'face', 'name': 'Avatar'}, {'kind': 'eyes', 'name': 'eyes'}, {'kind': 'nose', 'name': 'nose'}, {'kind': 'mouth', 'name': 'mouth'},
               {'kind': 'ears', 'name': 'ears'}, {'kind': 'eyebrows', 'name': 'eyebrows'}, {'kind': 'glasses', 'name': 'glasses'}, {'kind': 'head', 'name': 'head'}],
    'calendar': [{'kind': 'meeting', 'name': 'Review'}, {'kind': 'meeting', 'name': 'Planning'}, {'kind': 'calendar', 'name': 'Calendar'}],
}
# world -> (target type, kind words used in definite descriptions, names, {key: (more-words, less-words)})
TABS = {
    'drawing': ('drawn', ['house', 'tree', 'sun', 'lake', 'cloud', 'circle', 'box'], ['Box', 'Circle', 'House'],
                {'drawn.size': (['bigger', 'larger'], ['smaller', 'tinier']), 'drawn.width': (['wider'], ['narrower', 'thinner']), 'drawn.height': (['taller', 'higher'], ['shorter', 'lower'])}),
    'diagram': ('node', ['box', 'circle', 'diamond', 'node', 'shape'], ['Start', 'Finish', 'Decision'],
                {'node.size': (['bigger', 'larger'], ['smaller']), 'node.width': (['wider'], ['narrower']), 'node.height': (['taller'], ['shorter'])}),
    'avatar': ('part', ['eyes', 'nose', 'mouth', 'ears', 'eyebrows', 'glasses', 'head'], [],
               {'part.size': (['bigger', 'larger'], ['smaller', 'tinier'])}),
    'calendar': ('meeting', ['meeting', 'event'], ['Review', 'Planning'],
                 {'meeting.length': (['longer'], ['shorter'])}),
}
SELECTOR = {'drawing': 'drawn.ids', 'diagram': 'node.ids', 'calendar': 'meeting.ids'}
MODIFIERS = [('', ''), ('a bit ', ''), ('a little ', ''), ('slightly ', ''), ('a little bit ', ''), ('much ', 'much_'), ('a lot ', 'much_'), ('way ', 'much_')]
FRAMES = ['make {t} {m}{c}', 'can you make {t} {m}{c}', 'please make {t} {m}{c}', 'could you make {t} {m}{c}', 'I want {t} {m}{c}', '{t} should be {m}{c}',
          'make {t} {m}{c}, please', 'Make {t} {m}{c}.', 'turn {t} {m}{c}', 'can {t} be {m}{c}']


def target(world, typ, ref, kind_or_name):
    if ref == 'kind':
        return {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'description', 'kind': kind_or_name, 'kind_span': kind_or_name}, f'the {kind_or_name}', []
    if ref == 'it':
        return {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'context'}, 'it', []
    t = {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'written', 'name_span': kind_or_name}
    sel = [{'key': SELECTOR[world], 'value': kind_or_name, 'value_span': kind_or_name, 'operator': 'eq', 'phase': 'selector', 'polarity': 'positive', 'character': 'requirement'}]
    return t, kind_or_name, sel


def main():
    rng = random.Random(20261120)
    rows, seen = [], set()
    for world, (typ, kinds, names, keys) in TABS.items():
        refs = [('kind', k) for k in kinds] + [('name', n) for n in names] + [('it', None)] * 3
        for key, (more, less) in keys.items():
            for direction, words in (('more', more), ('less', less)):
                for word in words:
                    for ref, value in refs:
                        for _ in range(3):
                            frame = rng.choice(FRAMES)
                            mod, prefix = rng.choice(MODIFIERS)
                            tgt, phrase, selectors = target(world, typ, ref, value)
                            text = frame.format(t=phrase, m=mod, c=word)
                            if frame.startswith('{t}'):
                                text = text[0].upper() + text[1:]
                            if text.lower() in seen:
                                continue
                            seen.add(text.lower())
                            trig = 'should be' if ' should be ' in text else next((w for w in ('make', 'Make', 'turn', 'want', 'be') if f' {w} ' in f' {text} '), None)
                            constraint = {'key': key, 'value_span': word, 'operator': 'delta', 'step': prefix + direction, 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'}
                            request = {'span': text, 'act': 'change', 'mood': 'do', 'target': tgt, 'constraints': selectors + [constraint]}
                            if trig:
                                request['trigger'] = trig
                            rows.append({'format': 'psys2.ui-comparatives-example/1', 'id': f'ui-comparatives-{len(rows):05d}', 'world': world, 'text': text,
                                         'context': {'existing': CONTEXTS[world], 'previous': None}, 'requests': [request], 'style': 'comparative-natural',
                                         'cohort': {'operation': f'{world}.{key}.delta', 'recipeFamily': f'{world}-{key}-{direction}-{ref}-{value}'},
                                         'nativeTool': None, 'provenance': 'C1: ui-comparatives-v1/generate.py'})
    bad = [r['id'] for r in rows for q in r['requests'] for s in [q.get('trigger'), q['target'].get('kind_span'), q['target'].get('name_span')] + [c['value_span'] for c in q['constraints']]
           if s and s not in q['span']]
    assert not bad, bad[:5]
    with open(here / 'examples.jsonl', 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    report = {'examples': len(rows), 'byWorld': dict(collections.Counter(r['world'] for r in rows)),
              'byStep': dict(collections.Counter(r['requests'][0]['constraints'][-1]['step'] for r in rows)),
              'byKey': dict(collections.Counter(r['world'] + '.' + r['requests'][0]['constraints'][-1]['key'] for r in rows))}
    json.dump(report, open(here / 'report.json', 'w'), indent=1)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
