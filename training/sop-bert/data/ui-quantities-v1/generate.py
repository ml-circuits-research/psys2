#!/usr/bin/env python3
"""Generate ui-quantities-v1: coordination of make requests and quantities (drawing, a few diagram rows).

Deterministic, no network. The paraphrases below are authored data in an inline markup:
  [ ... ]  one request span (a coordinated noun phrase; the first one holds the trigger)
  !draw!   trigger (surface verb)          *dogs* or *dgos|dog*  kind span (|lemma overrides the singular lemma)
  #two#    numeral count span              %near the lake%  relation + anchor tail (relation surface + anchor phrase)
  ~in a row~  diagram layout phrase
Bracket and marker characters never occur in the final text. Vague quantities (some, a few, several, many, a couple of,
a handful of) get no target.count: they stay unlabelled plural noun phrases (the runtime reads them from knowledge).
"""
import collections
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

C1 = [  # two-thing coordination
    "[!draw! a *cat*] and [a *dog*]",
    "[!add! a *boy*] and [a *girl*]",
    "please [!draw! a *house*] and [a *tree*]",
    "can you [!make! a *cat*] and [a *bird*]?",
    "[!sketch! a *sun*] and [a *cloud*]",
    "[I !want! a *dog*] and [a *cat*]",
    "[!put! a *flower*] and [a *tree*] in the picture",
    "[!give! me a *boat*] and [a *fish*]",
    "[!draw! a *car*] and [a *house*]",
    "could you [!draw! a *girl*] and [a *dog*]",
    "[!add! a *bird*] and [a *star*]",
    "[!make! a *boy*] and [a *cat*] for me",
    "[!draw! a *lake*] and [a *boat*]",
    "[I'd !like! a *sun*] and [a *flower*]",
    "[!draw! a *fish*] and [a *boat*], please",
    "[!sketch! a *tree*] and [a *bird*]",
    "[!add! a *car*] and [a *tree*]",
    "[!drw! a *kat|cat*] and [a *dog*]",
    "[!gimme! a *flower*] and [a *bee|bee*]",
    "[!draw! a *girl*] and [a *boat*] now",
    "[!put! a *cloud*] and [a *sun*] up there",
    "can you [!add! a *dog*] and [a *house*]?",
    "[!make! a *star*] and [a *cloud*]",
    "[i !want! a *boy*] and [a *dog*] pls",
    "[!draw! a *bird*] and [a *flower*]",
]

C2 = [  # coordination with a count in a conjunct
    "[!draw! a *cat*] and [#2# *dogs*]",
    "[!draw! #two# *cats*] and [a *dog*]",
    "[!add! a *sun*] and [#three# *clouds*]",
    "can you [!make! a *house*] and [#2# *trees*]?",
    "[!put! #3# *birds*] and [a *flower*]",
    "please [!sketch! a *boy*] and [#two# *dogs*]",
    "[!draw! a *tree*] and [#four# *stars*]",
    "[I !want! #two# *fish*] and [a *boat*]",
    "[!add! a *girl*] and [#2# *cats*]",
    "[!make! #three# *flowers*] and [a *tree*]",
    "[!give! me a *car*] and [#two# *houses*]",
    "[!draw! a *lake*] and [#3# *boats*]",
    "[!draw! #5# *stars*] and [a *cloud*]",
    "could you [!add! a *dog*] and [#two# *birds*]?",
    "[!sketch! a *house*] and [#three# *trees*]",
    "[!put! a *sun*] and [#2# *clouds*] in the sky",
    "[!drawn! a *cat*] and [#2# *dgos|dog*]",
    "[I'd !like! #two# *boys*] and [a *girl*]",
    "[!add! #two# *cars*] and [a *boat*]",
    "[!draw! a *bird*] and [#six# *flowers*]",
    "[!make! a *fish*] and [#3# *stars*]",
    "[!gimme! #2# *trees*] and [a *house*]",
    "[!draw! #three# *girls*] and [a *boy*]",
    "[!add! a *cloud*] and [#four# *birds*]",
    "[!draw! a *flower*] and [#two# *fish*], please",
]

C3 = [  # three-way lists
    "[!draw! a *sun*], [#three# *clouds*] and [a *bird*]",
    "[!add! a *cat*], [a *dog*] and [a *bird*]",
    "please [!draw! a *house*], [a *tree*] and [a *car*]",
    "[!make! a *boy*], [a *girl*] and [a *dog*]",
    "can you [!put! a *sun*], [#2# *clouds*] and [a *tree*]?",
    "[!sketch! a *lake*], [a *boat*] and [#two# *fish*]",
    "[I !want! a *house*], [a *tree*] and [a *flower*]",
    "[!draw! a *star*], [a *cloud*] and [a *sun*]",
    "[!add! #two# *cats*], [a *dog*] and [a *bird*]",
    "[!give! me a *car*], [a *house*] and [#3# *trees*]",
    "[!draw! a *girl*], [a *boy*] and [a *cat*]",
    "[!make! #three# *flowers*], [a *bird*] and [a *sun*]",
    "could you [!draw! a *boat*], [a *fish*] and [a *lake*]",
    "[!put! a *tree*], [a *flower*] and [a *house*] in the picture",
    "[!add! a *cloud*], [a *bird*] and [#4# *stars*]",
    "[!sketch! a *dog*], [a *cat*] and [#two# *birds*]",
    "[!drw! a *sun*], [a *tree*] and [a *cloud*]",
    "[I'd !like! a *boy*], [a *dog*] and [a *house*]",
    "[!draw! a *car*], [a *boat*] and [a *tree*], please",
    "[!make! a *fish*], [#2# *boats*] and [a *lake*]",
    "[!gimme! a *cat*], [a *flower*] and [a *star*]",
    "[!add! a *house*], [a *car*] and [#two# *trees*]",
    "can you [!draw! a *girl*], [a *bird*] and [#3# *clouds*]?",
    "[!draw! a *sun*], [a *flower*] and [a *dog*] now",
]

C4 = [  # coordination with a shared relation tail (attached to the last conjunct)
    "[!draw! a *house*] and [#two# *trees* %near the lake%]",
    "[!add! a *cat*] and [a *dog* %next to the house%]",
    "can you [!draw! a *boy*] and [a *girl* %beside the lake%]?",
    "[!put! a *tree*] and [a *flower* %near the house%]",
    "[!draw! a *bird*] and [#three# *clouds* %above the mountain%]",
    "please [!add! #two# *cats*] and [a *dog* %next to the house%]",
    "[!make! a *boat*] and [a *fish* %in the lake%]",
    "[I !want! a *car*] and [a *tree* %beside the road%]",
    "[!draw! a *sun*] and [#2# *clouds* %above the hill%]",
    "[!sketch! a *dog*] and [a *cat* %in front of the house%]",
    "[!add! a *flower*] and [#three# *trees* %close to the lake%]",
    "[!draw! a *girl*] and [a *dog* %to the left of the house%]",
    "[!put! #2# *birds*] and [a *cloud* %above the tree%]",
    "[!give! me a *boy*] and [a *cat* %behind the house%]",
    "[!draw! a *car*] and [a *house* %near the road%]",
    "could you [!draw! a *tree*] and [#two# *flowers* %next to the lake%]?",
    "[!add! a *sun*], [a *cloud*] and [a *bird* %above the hill%]",
    "[!draw! a *cat*] and [#3# *fish* %near the lake%]",
    "[!make! a *girl*] and [a *boy* %to the right of the tree%]",
    "[!drw! a *house*] and [a *tre|tree* %nex to the lake|next to%]",
    "[!put! a *dog*] and [a *bird* %below the cloud%]",
    "[I'd !like! a *boat*] and [#two# *fish* %near the house%]",
    "[!add! a *star*] and [#2# *clouds* %above the mountain%]",
    "[!draw! a *flower*] and [a *bee|bee* %beside the tree%]",
    "[!sketch! #two# *boys*] and [a *dog* %next to the road%]",
]

C5 = [  # numeral counts
    "[!draw! #three# *houses*]",
    "[!add! #5# *stars*]",
    "[#two# *trees* %left of the house%]",
    "[#three# *houses* %near the lake%]",
    "can you [!draw! #four# *clouds*]?",
    "[!make! #2# *birds*]",
    "please [!add! #three# *flowers* %beside the house%]",
    "[!put! #two# *cats* %next to the tree%]",
    "[!sketch! #6# *fish* %in the lake%]",
    "[I !want! #three# *boats* %on the lake%]",
    "[!draw! #two# *dogs* %to the right of the house%]",
    "[!give! me #4# *stars*]",
    "[!add! #two# *cars* %near the road%]",
    "[!draw! #3# *trees* %close to the mountain%]",
    "could you [!make! #two# *suns*]?",
    "[!draw! #seven# *birds* %above the hill%]",
    "[!add! #10# *flowers*]",
    "[!put! #two# *boys* %next to the house%]",
    "[I'd !like! #three# *clouds* %above the mountain%]",
    "[!draw! #2# *houses* %beside the road%]",
    "[!drw! #three# *kats|cat*]",
    "[!add! #two# *girls* %near the lake%]",
    "[!gimme! #5# *fish*]",
    "[!sketch! #three# *trees* %left of the lake%]",
    "[!make! #four# *cats* %in front of the house%]",
]

C6 = [  # vague quantities: no numeric count
    "[!draw! some *clouds*]",
    "[a few *birds* %above the house%]",
    "[!add! several *flowers*]",
    "[!draw! many *stars*]",
    "[!put! a couple of *trees*]",
    "[!draw! a handful of *fish*]",
    "can you [!make! some *birds*]?",
    "please [!add! a few *stars* %above the house%]",
    "[I !want! several *trees* %near the lake%]",
    "[!sketch! many *flowers* %beside the house%]",
    "[!draw! a couple of *clouds*]",
    "[!give! me some *fish* %in the lake%]",
    "[!add! a handful of *stars*]",
    "[!draw! a few *houses* %next to the road%]",
    "could you [!put! several *boats* %on the lake%]?",
    "[!make! some *flowers* %left of the house%]",
    "[!draw! many *birds* %above the hill%]",
    "[I'd !like! a couple of *cats*]",
    "[!add! some *trees* %near the mountain%]",
    "[!drw! a few *clouds*]",
    "[!gimme! a handful of *flowers*]",
    "[!put! many *fish* %in the lake%]",
    "[!draw! several *dogs* %next to the house%]",
    "[!sketch! some *stars* %above the mountain%]",
    "[!add! a few *cars* %beside the road%]",
]

C7 = [  # diagram counts and coordination
    "[!add! #three# *boxes* ~in a row~]",
    "[!add! a *box*] and [#two# *circles*]",
    "[!add! #3# *circles* ~in a row~]",
    "can you [!make! #two# *boxes*] and [a *circle*]?",
    "[!create! #four# *squares* ~in a row~]",
    "please [!add! a *diamond*] and [#2# *boxes*]",
    "[!draw! #three# *triangles* ~in a row~]",
    "[!add! #two# *circles*] and [a *box*]",
    "[!put! #5# *boxes* ~in a row~]",
    "[!make! a *square*] and [#three# *circles*]",
    "[I !want! #three# *boxes* ~in a row~]",
    "[!add! a *box*], [a *circle*] and [a *diamond*]",
    "[!create! a *box*] and [#2# *diamonds*]",
    "could you [!add! #four# *circles* ~in a row~]?",
    "[!add! #two# *squares*] and [#two# *circles*]",
    "[!draw! a *triangle*] and [#three# *boxes*]",
    "[!make! #2# *boxes* ~in a row~]",
    "[!ad! a *box*] and [#two# *circles*]",
    "[!gimme! #three# *diamonds* ~in a row~]",
    "[!put! a *circle*] and [#3# *squares*]",
    "[!add! #six# *boxes* ~in a row~]",
    "[!create! #two# *boxes*], [a *circle*] and [a *triangle*]",
    "[I'd !like! a *box*] and [#three# *circles* ~in a row~]",
    "[!add! #two# *triangles* ~in a row~]",
    "[!draw! a *circle*] and [#2# *boxes*]",
]

CASES = [
    ('C1-coordination-two', 'drawing', C1),
    ('C2-coordination-count', 'drawing', C2),
    ('C3-three-way-list', 'drawing', C3),
    ('C4-coordination-shared-tail', 'drawing', C4),
    ('C5-numeral-count', 'drawing', C5),
    ('C6-vague-quantity', 'drawing', C6),
    ('C7-diagram-count-coordination', 'diagram', C7),
]

CONTEXT = {
    'drawing': {'existing': [{'kind': k, 'name': k.capitalize()} for k in ('lake', 'tree', 'house', 'mountain', 'road', 'hill')], 'previous': None},
    'diagram': {'existing': [{'kind': 'rectangle', 'name': 'Box'}, {'kind': 'circle', 'name': 'Circle'}], 'previous': None},
}
NUMBERS = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine ten'.split())}
IRREGULAR = {'boxes': 'box', 'fish': 'fish'}
RELATIONS = [('to the left of', 'left_of'), ('to the right of', 'right_of'), ('in front of', 'in_front_of'), ('next to', 'next_to'),
             ('close to', 'near'), ('beside', 'next_to'), ('near', 'near'), ('left of', 'left_of'), ('right of', 'right_of'),
             ('above', 'above'), ('below', 'below'), ('behind', 'behind'), ('under', 'under'), ('in', 'in'), ('on', 'on')]
TOKEN = re.compile(r'\[|\]|!([^!]+)!|\*([^*]+)\*|#([^#]+)#|%([^%]+)%|~([^~]+)~')


def lemma(surface):
    if surface in IRREGULAR:
        return IRREGULAR[surface]
    return surface[:-1] if surface.endswith('s') and not surface.endswith('ss') else surface


def parse(markup, world):
    """Returns (text, requests). Offsets are tracked only to cut the plain text; labels are surfaces inside request spans."""
    out, pos, reqs, cur, start = [], 0, [], None, None
    for m in TOKEN.finditer(markup):
        out.append(markup[pos:m.start()])
        pos = m.end()
        tok = m.group(0)
        plain = ''.join(out)
        if tok == '[':
            assert cur is None
            cur, start = {'trigger': None, 'count': None, 'kind': None, 'tail': None, 'layout': None}, len(plain)
        elif tok == ']':
            cur['span'] = plain[start:]
            reqs.append(cur); cur = None
        else:
            if m.group(1):
                cur['trigger'] = m.group(1); out.append(m.group(1))
            elif m.group(2):
                surface, _, lem = m.group(2).partition('|')
                cur['kind'] = (surface, lem or lemma(surface)); out.append(surface)
            elif m.group(3):
                cur['count'] = m.group(3); out.append(m.group(3))
            elif m.group(4):
                phrase, _, fix = m.group(4).partition('|')
                rel = next((r for r in RELATIONS if phrase.startswith(r[0] + ' ')), None)
                if rel is None and fix:
                    rel = next(r for r in RELATIONS if r[0] == fix)
                    surf = phrase.split(' the ')[0]
                    cur['tail'] = (surf, rel[1], 'the ' + phrase.split(' the ')[1])
                else:
                    assert rel, phrase
                    cur['tail'] = (rel[0], rel[1], phrase[len(rel[0]) + 1:])
                out.append(phrase if not fix else cur['tail'][0] + ' ' + cur['tail'][2])
            elif m.group(5):
                cur['layout'] = m.group(5); out.append(m.group(5))
    out.append(markup[pos:])
    return ''.join(out), reqs


def build_request(r, world, act_prev):
    target_type = 'node' if world == 'diagram' else 'drawn'
    target = {'type': target_type, 'mode': 'new', 'determiner': 'indefinite', 'kind': r['kind'][1], 'kind_span': r['kind'][0]}
    if r['count']:
        n = NUMBERS.get(r['count'], r['count'])
        target['count'] = n
        target['count_span'] = r['count']
    cons = []
    key = lambda k: ('node.' if world == 'diagram' else 'drawn.') + k
    if r['tail']:
        surf, rel, anchor = r['tail']
        cons.append({'key': key('relation'), 'value': rel, 'value_span': surf, 'operator': 'relation', 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'})
        cons.append({'key': key('anchor'), 'value': anchor, 'value_span': anchor, 'operator': 'relation', 'phase': 'selector', 'polarity': 'positive', 'character': 'requirement'})
    if r['layout']:
        cons.append({'key': 'node.layout', 'value': 'row', 'value_span': r['layout'], 'operator': 'eq', 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'})
    q = {'span': r['span'], 'act': 'make', 'mood': 'do', 'target': target, 'constraints': cons}
    if r['trigger']:
        q = {'span': r['span'], 'trigger': r['trigger'], **{k: v for k, v in q.items() if k != 'span'}}
    return q


def main():
    rows, per_case, seen = [], collections.Counter(), set()
    for case, world, items in CASES:
        for markup in items:
            text, reqs = parse(markup, world)
            assert text not in seen, text
            seen.add(text)
            per_case[case] += 1
            rows.append({
                'format': 'psys2.ui-quantities-example/1', 'id': f'ui-quantities-{len(rows):05d}', 'world': world, 'text': text,
                'context': CONTEXT[world], 'requests': [build_request(r, world, None) for r in reqs],
                'tier': 'quantity', 'style': 'coordination' if len(reqs) > 1 else 'quantity',
                'cohort': {'case': case, 'requests': len(reqs)},
                'provenance': 'ui-quantities-v1/generate.py (authored paraphrases)',
            })
    with open(HERE / 'examples.jsonl', 'w') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    report = {'rows': len(rows), 'perCase': dict(per_case),
              'multiRequestRows': sum(len(r['requests']) > 1 for r in rows),
              'rowsWithCount': sum(any('count' in q['target'] for q in r['requests']) for r in rows)}
    (HERE / 'report.json').write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
