#!/usr/bin/env python3
"""Relative-position requests for the reader (C1 authoring; labels in the ui-natural format).

Every combination of a drawable kind (the Drawing tool's declared `kind` enum), a relation and an anchor in a
fixed scene is written as natural requests. Which kinds may be "in" or "on" an anchor is read from the catalog
(k.layouts anchors: what each anchor holds; k.scenes `on=`), not from lists here. Values follow the existing
reader convention: key drawn.relation, value in {near, left, right, above, below, in, on}, with the anchor's
span and description fill. Coordinates are never labelled: placement is a completion requirement for the library.
"""
import json, re, random, pathlib, collections
here = pathlib.Path(__file__).parent
repo = here.parents[3]
catalog = repo.parent / 'sop-knowledge-worlds' / 'docs' / 'worlds'
coverage = json.load(open(here.parent / 'ui-natural-v1' / 'coverage.json'))
kinds = next(o for o in coverage['nativeInventory']['drawing'] if o['id'] == 'drawing.object.make')['params']['kind']['enum']
kinds = [k for k in kinds if k not in ('circle', 'oval', 'square', 'rectangle', 'triangle', 'star', 'heart', 'line', 'arrow', 'patch')]
# The runtime grounds a kind word through the deployed reader bindings (published k.* kinds and core.word texts).
deployment = json.load(open(repo / 'docs/webchat/models/sop-bert/deployment.json'))
grounded = {k['lemma'] for k in json.load(open(repo / 'docs/webchat' / (deployment['artifactBase'] + deployment['bindingsArtifact']['path'])))['kinds'] if k['area'] == 'drawing' and k['type'] == 'drawn'}

def facts(path, typ):
    out = []
    for line in open(path):
        if not line.startswith('@') or f' {typ} ' not in line: continue
        attrs = collections.defaultdict(list)
        for k, v in re.findall(r'(\w+)=("[^"]*"|\S+)', line): attrs[k].append(v.strip('"'))
        out.append(attrs)
    return out
holds = collections.defaultdict(lambda: collections.defaultdict(set))   # anchor -> anchor-kind -> held things
for f in (catalog / 'k.layouts' / 'shards').glob('*.sop'):
    for a in facts(f, 'k.layouts.anchor'):
        for h in a.get('holds', []): holds[a['of'][0]][a['kind'][0]].add(h)
on_facts, place, sizes = collections.defaultdict(set), {}, {}
for f in (catalog / 'k.scenes' / 'shards').glob('*.sop'):
    for t in facts(f, 'k.scenes.thing'):
        name = t['name'][0]
        for o in t.get('on', []): on_facts[name].add(o)
        if t.get('place'): place.setdefault(name, t['place'][0])
        if t.get('size'): sizes.setdefault(name, t['size'][0])

# Subjects beyond the tool enum: catalog scene things of the ground, sky and water that the runtime can ground,
# and everything a scene anchor holds (k.layouts).
held_things = {h for anchor in holds.values() for things in anchor.values() for h in things}
catalog_subjects = sorted(n for n, w in place.items() if w in ('ground', 'sky', 'water') and n in grounded and re.fullmatch(r'[a-z]+( [a-z]+)?', n))
kinds = sorted(set(kinds) | {h for h in held_things if h in grounded} | set(catalog_subjects))
scene = [('lake', 'Lake'), ('tree', 'Tree'), ('house', 'House'), ('mountain', 'Mountain'), ('road', 'Road'), ('hill', 'Hill')]
existing = [{'kind': k, 'name': n} for k, n in scene]
SURFACES = {
    'near': ['next to', 'beside', 'near', 'by', 'close to', 'right next to', 'alongside'],
    'left': ['to the left of', 'left of', 'on the left of', 'on the left side of', 'just left of'],
    'right': ['to the right of', 'right of', 'on the right of', 'on the right side of', 'just right of'],
    'above': ['above', 'over', 'up above', 'high above'],
    'below': ['below', 'under', 'underneath', 'beneath'],
    'in': ['in', 'inside', 'into'],
    'on': ['on', 'on top of', 'onto'],
}
VERBS = ['add', 'draw', 'put', 'place', 'sketch', 'make', 'can you add', 'could you draw', 'please put', "I'd like", 'give me', "let's add"]
ANCHOR_FORMS = ['the {k}', 'the {k}', 'the {k}', 'that {k}', 'the {k} there']

def styled(text, rng):
    """How people type: lower case, sentence case with a full stop, or a trailing please."""
    r = rng.random()
    if r < 0.35: return text[0].upper() + text[1:] + '.'
    if r < 0.45: return text + ', please'
    return text
SIZES = [('small', 'small'), ('little', 'small'), ('big', 'big'), ('large', 'big'), ('tiny', 'small')]

def plausible(subject, relation, anchor):
    """A relation is written only where the catalog makes it sensible: usual places (k.scenes) and what
    anchors hold (k.layouts)."""
    if subject == anchor: return False
    water = any(kind == 'water' for kind in holds[anchor])
    held = lambda kinds: any(subject in things for kind, things in holds[anchor].items() if kind in kinds)
    where = place.get(subject)
    if relation == 'in': return held(('water', 'inside')) or (where == 'water' and water)
    if relation == 'on': return anchor in on_facts.get(subject, ()) or held(('top', 'roof', 'surface'))
    if where == 'water': return relation in ('near', 'in') and water
    if where == 'sky': return relation in ('above', 'left', 'right')
    if relation == 'above': return False
    if relation == 'below': return sizes.get(subject) == 'small' and anchor == 'tree'
    return where == 'ground' and relation in ('near', 'left', 'right')

rng = random.Random(20261120)
rows, seen = [], set()
def example(text, request, completion, family):
    key = re.sub(r'\W+', ' ', text.lower()).strip()
    if key in seen: return
    seen.add(key)
    rows.append({'format': 'psys2.ui-relations-example/1', 'id': f'ui-relations-{len(rows):05d}', 'world': 'drawing', 'text': text,
                 'context': {'existing': existing, 'previous': None}, 'requests': [request], 'tier': 'relation', 'style': 'relation-natural',
                 'cohort': {'operation': 'drawing.object.make' if request['act'] == 'make' else 'drawing.object.place', 'recipeFamily': family},
                 'completion': {'requirements': completion, 'boundary': 'Completion values are not text-extraction gold.'}, 'nativeTool': None,
                 'provenance': 'C1: ui-relations-v1/generate.py; relation plausibility from k.layouts and k.scenes'})

def article(word): return 'an' if word[0] in 'aeiou' else 'a'
# Balance: every plausible family of the rare relations, a fixed-seed sample of the frequent ones.
FAMILY_CAP = {'near': 300, 'left': 300, 'right': 300, 'above': 150}
VARIANTS = {'near': 2, 'left': 2, 'right': 2, 'above': 4, 'below': 12, 'in': 12, 'on': 24}
families = collections.defaultdict(list)
for subject in kinds:
    for relation in SURFACES:
        for anchor, _ in scene:
            if plausible(subject, relation, anchor): families[relation].append((subject, anchor))
for relation, items in families.items():
    if relation in FAMILY_CAP and len(items) > FAMILY_CAP[relation]:
        families[relation] = sorted(random.Random('cap-' + relation).sample(items, FAMILY_CAP[relation]))
for relation, surfaces in SURFACES.items():
        for subject, anchor in families[relation]:
            family = f'{subject}-{relation}-{anchor}'
            for variant in range(VARIANTS[relation]):
                verb, surface, form = rng.choice(VERBS), rng.choice(surfaces), rng.choice(ANCHOR_FORMS).format(k=anchor)
                size = rng.choice(SIZES) if variant == 1 and rng.random() < 0.5 else None
                noun = f'{size[0]} {subject}' if size else subject
                obj = f"{article(noun)} {noun}"
                text = styled(f"{verb} {obj} {surface} {form}" if not verb.startswith("I'd") else f"I'd like {obj} {surface} {form}", rng)
                trigger = verb.split()[-1] if not verb.startswith("I'd") else 'like'
                constraints = []
                if size: constraints.append({'key': 'drawn.size', 'value': size[1], 'value_span': size[0], 'operator': 'degree', 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'})
                constraints.append({'key': 'drawn.relation', 'value': relation, 'value_span': surface, 'operator': 'relation', 'phase': 'result', 'polarity': 'positive',
                                    'character': 'requirement', 'anchor_span': form, 'anchor_fill': 'description', 'anchor_kind': anchor})
                trigger = next(w for w in text.replace(',', ' ').replace('.', ' ').split() if w.lower() == trigger)
                request = {'span': text, 'trigger': trigger, 'act': 'make', 'mood': 'do',
                           'target': {'type': 'drawn', 'mode': 'new', 'determiner': 'indefinite', 'kind': subject, 'kind_span': subject}, 'constraints': constraints}
                completion = [{'concept': 'placement', 'policy': f'solve the {relation} relation to the observed {anchor} with the page and peers (std.problem)', 'verifiedByThisDataset': False}]
                if size: completion.append({'concept': 'size', 'policy': f'{size[1]} relative to the comparison class of {subject}', 'verifiedByThisDataset': False})
                example(text, request, completion, family)
# Moving an object that is already in the scene next to another one.
MOVE = ['move', 'put', 'shift', 'bring', 'place']
for subject, name in scene:
    for relation in SURFACES:
        for anchor, _ in scene:
          if anchor == subject or not plausible(subject, relation, anchor): continue
          for variant in range(3):
            verb, surface = rng.choice(MOVE), rng.choice(SURFACES[relation])
            text = styled(f"{verb} the {subject} {surface} the {anchor}", rng)
            trigger = text.split()[0]
            request = {'span': text, 'trigger': trigger, 'act': 'place', 'mood': 'do',
                       'target': {'type': 'drawn', 'mode': 'existing', 'determiner': 'definite', 'kind': subject, 'kind_span': subject, 'fill': 'description'},
                       'constraints': [{'key': 'drawn.ids', 'value': f'the {subject}', 'value_span': f'the {subject}', 'operator': 'eq', 'phase': 'selector', 'polarity': 'positive', 'character': 'requirement'},
                                       {'key': 'drawn.relation', 'value': relation, 'value_span': surface, 'operator': 'relation', 'phase': 'result', 'polarity': 'positive',
                                        'character': 'requirement', 'anchor_span': f'the {anchor}', 'anchor_fill': 'description', 'anchor_kind': anchor}]}
            example(text, request, [{'concept': 'placement', 'policy': f'move the observed {subject} {relation} the observed {anchor}', 'verifiedByThisDataset': False}], f'move-{subject}-{relation}-{anchor}')

# Checks: every labelled surface occurs in the text.
bad = [r['id'] for r in rows for q in r['requests'] for s in [q['trigger'], q['target']['kind_span']] + [c['value_span'] for c in q['constraints']] + [c.get('anchor_span') for c in q['constraints'] if c.get('anchor_span')] if s not in r['text']]
assert not bad, bad[:5]
with open(here / 'examples.jsonl', 'w') as f:
    for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
report = {'examples': len(rows), 'byRelation': dict(collections.Counter(c['value'] for r in rows for q in r['requests'] for c in q['constraints'] if c['key'] == 'drawn.relation')),
          'byAct': dict(collections.Counter(q['act'] for r in rows for q in r['requests'])), 'subjects': len(kinds), 'anchors': [a for a, _ in scene]}
json.dump(report, open(here / 'report.json', 'w'), indent=1)
print(json.dumps(report))
