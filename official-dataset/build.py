#!/usr/bin/env python3
"""Build the official SOP-BERT reader dataset from its source corpora.

Deterministic: the same sources produce byte-identical outputs. Run from anywhere:

    python3 official-dataset/build.py

Reads only the source corpora listed in SOURCES (and two knowledge files for
vocabulary), validates every row, converts the main synthetic set to the reader's
label format, removes what cannot be fixed correctly, deduplicates, caps dominant
operations, splits by paraphrase family and writes train/dev/test plus the audit
documents next to this file. See README.md for the format.
"""
import collections
import copy
import gzip
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
WORKSPACE = REPO.parent
SOPBERT = REPO / 'training' / 'sop-bert'
DATA = SOPBERT / 'data'
KNOWLEDGE = WORKSPACE / 'sop-knowledge-worlds' / 'docs' / 'worlds'

# Priority order: when two sources carry the same text, the earlier source wins.
SOURCES = [
    ('ui-natural-v1', DATA / 'ui-natural-v1' / 'authored.jsonl', 'C1 commands executed through the editors (natural, synonym, elliptical, omission)'),
    ('ui-human-v1', DATA / 'ui-human-v1' / 'examples.jsonl', 'human paraphrases (equivalent/complex/simplified) of executed ui-natural seeds'),
    ('ui-coverage-v2', DATA / 'ui-coverage-v2' / 'examples.jsonl', 'case coverage of every tab operation, at least 20 rows per case (build.py)'),
    ('ui-tiers-v1', DATA / 'ui-tiers-v1' / 'examples.jsonl', 'tier and near-miss supplements of ui-coverage-v2 cases (build.py)'),
    ('ui-relations-v1', DATA / 'ui-relations-v1' / 'examples.jsonl', 'relative-position placement requests (generate.py)'),
    ('ui-comparatives-v1', DATA / 'ui-comparatives-v1' / 'examples.jsonl', 'comparative changes of existing objects (generate.py)'),
    ('ui-features-v1', DATA / 'ui-features-v1' / 'examples.jsonl', 'avatar part features: length (absolute and comparative) and feel (generate.py)'),
    ('ui-diagram-v2', DATA / 'ui-diagram-v2' / 'examples.jsonl', 'voice/chat control of the Diagram editor: every operation x parameter x reference form, robustness variants, compounds, questions (generate.py)'),
    ('ui-diagram-v2-voice', DATA / 'ui-diagram-v2' / 'heldout-voice.jsonl', "the Diagram voice set with the owner's session sentences (heldout.py); trained on per the owner's decision that benchmark contamination is irrelevant"),
    ('ui-drawing-style-v1', DATA / 'ui-drawing-style-v1' / 'examples.jsonl', 'Drawing turns, mirrors, facing, leans, opacity, effects, fills, outlines, writing and filters (generate.py)'),
    ('ui-quantities-v1', DATA / 'ui-quantities-v1' / 'examples.jsonl', 'coordination of make requests and quantities (generate.py)'),
    ('human-adapted-v1-drawing', DATA / 'human-adapted-v1' / 'drawing' / 'examples.jsonl', 'real human utterances adapted to the Drawing tab (specs/human-utterance-benchmark.md)'),
    ('data-drop-v1', DATA / 'data-drop-v1' / 'accepted.jsonl', 'Diagram/Drawing rows of the data-request drops, validated and normalised by data-drop-v1/import.py'),
    ('human-adapted-v1-diagram', DATA / 'human-adapted-v1' / 'diagram' / 'examples.jsonl', 'real human utterances adapted to the Diagram tab (specs/human-utterance-benchmark.md)'),
    ('demo-tool-profile', DATA / 'demo-tool-profile' / 'active.jsonl.gz', 'the corpus of the deployed reader: haiku-v1/v2 authored data plus demo tool supplements'),
    ('main-synthetic', REPO / 'main-synthetic-dataset' / 'examples.jsonl', 'owner synthetic set (generate-reader-datasets skill); converted, mostly dropped'),
]
# Sources still being authored by other workstreams are included once their file exists.
SOURCES = [src for src in SOURCES if src[1].exists() or not src[0].startswith(('human-adapted', 'data-drop'))]
SPLIT_SHARES = [('train', 94), ('dev', 4), ('test', 2)]  # owner phase rule 2026-11-20: random rows; dev monitors training, test keeps report continuity
# Balance caps on (source, operation) and per family for the main synthetic set.
MS_CAP_PER_OPERATION = 2500
MS_CAP_PER_FAMILY = 6
MS_EDIT_CAP_PER_FAMILY = 3
# Human-written variants (paraphrases, hard questions) are the valuable part: wider caps, and they are taken first.
MS_HUMAN_CAP_PER_FAMILY = 40
MS_HUMAN_EDIT_CAP_PER_FAMILY = 8

PLACEHOLDERS = {'Plan', 'Backup', 'Core', 'Main Track', 'Second Pass', 'Kickoff', 'Draft', 'North Area', 'Idea', 'Notes',
                'Open Items', 'Goal', 'Sketch', 'Deep Dive', 'Status', 'Follow-up', 'Roadmap', 'Rough', 'Proposal', 'Hub',
                'Review', 'Take 2', 'Roundup', 'Summary', 'Intro', 'Main', 'Second'}
NAME_KEYS = {'name', 'label', 'title', 'text', 'notes', 'topic', 'genre', 'items', 'parent', 'rows', 'labels', 'values'}
NUMBER_WORDS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split())}
NUMBER_WORDS.update({'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'a': 1, 'an': 1, 'half': 0.5})
OPEN_DETERMINERS = {'demonstrative', 'possessive', 'quantified'}  # stored as said; prepare-official maps them to definite for the current trainer
REQUEST_FIELDS = {'span', 'trigger', 'act', 'mood', 'target', 'constraints', 'question', 'turn', 'spanOrigin', 'needs'}


def sha(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def read_jsonl(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def git_commit(path):
    try:
        return subprocess.run(['git', 'log', '-1', '--format=%H', '--', str(path)], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip() or None
    except (OSError, subprocess.CalledProcessError):
        return None


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------- inventory

def build_inventory():
    union = load_module('ui_union', SOPBERT / 'prepare-ui-natural-union.py')
    old = json.loads((DATA / 'demo-tool-profile' / 'inventory.json').read_text())
    new = json.loads((DATA / 'ui-natural-v1' / 'inventory.json').read_text())
    inventory = union.merge_inventory(old, new)
    # Declared avatar part features with their own key (part.length, values read from the catalog by generate.py).
    inventory = union.merge_inventory(inventory, json.loads((DATA / 'ui-features-v1' / 'inventory.json').read_text()))
    # Diagram styles, layout, alignment, connection patterns and the new node/link acts (specs/diagram-capabilities.md).
    inventory = union.merge_inventory(inventory, json.loads((DATA / 'ui-diagram-v2' / 'inventory.json').read_text()))
    # Keys the data drops use that no other source declares yet (drawn.facing).
    inventory = union.merge_inventory(inventory, json.loads((DATA / 'data-drop-v1' / 'inventory.json').read_text()))
    # Drawing transforms, writing, effects, fills and filters (catalog b89b4541).
    inventory = union.merge_inventory(inventory, json.loads((DATA / 'ui-drawing-style-v1' / 'inventory.json').read_text()))
    shared = union.load_preparer()
    families = shared.target_families(inventory)
    inventory['request']['target']['keys']['type']['values'] = sorted({t for types in families.values() for t in types})
    return inventory


class Inventory:
    def __init__(self, inventory):
        self.raw = inventory
        self.req = inventory['request']
        self.families = {area: set(types) for area, types in inventory.items() if area not in ('request', 'conversation')}

    def bank(self, group, key):
        return self.req[group]['keys'][key].get('values')

    def key(self, world, key):
        typ, _, name = key.partition('.')
        return self.raw.get(world, {}).get(typ, {}).get('keys', {}).get(name)


# ---------------------------------------------------------------- text helpers

WORD = re.compile(r"[\w']", re.UNICODE)


def find_all(text, needle, word=True):
    if not needle:
        return []
    found, start = [], 0
    low, n = text.lower(), needle.lower()
    while True:
        at = low.find(n, start)
        if at < 0:
            return found
        end = at + len(n)
        start = at + 1
        if word and ((at > 0 and WORD.match(text[at - 1]) and WORD.match(n[0])) or (end < len(text) and WORD.match(text[end]) and WORD.match(n[-1]))):
            continue
        found.append(at)


def occurs(text, needle):
    """Exact (case-sensitive) substring occurrence count."""
    return text.count(needle) if needle else 0


def numbers_in(surface):
    values = [float(x) for x in re.findall(r'(?<![\w.])[-+]?\d+(?:\.\d+)?', surface)]
    words = re.findall(r'[a-z]+', surface.lower())
    total, current, seen = 0, 0, False
    for w in words + ['.']:
        if w in NUMBER_WORDS and w not in ('a', 'an'):
            current += NUMBER_WORDS[w]; seen = True
        elif w == 'hundred' and seen:
            current *= 100
        elif w == 'thousand' and seen:
            total += current * 1000; current = 0
        elif seen:
            values.append(float(total + current)); total = current = 0; seen = False
    return values


def as_number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- vocabularies from knowledge and corpora

def knowledge_texts(path):
    rows = []
    for line in path.read_text().splitlines():
        if not line.startswith('@'):
            continue
        texts = re.findall(r'text=(?:"([^"]+)"|(\S+))', line)
        rows.append((line.split()[0][1:], [a or b for a, b in texts], dict(re.findall(r' (act|means)=(\S+)', line))))
    return rows


def verb_lexicon(corpus_rows):
    lexicon = collections.defaultdict(set)
    for path in sorted((KNOWLEDGE / 'k.actions' / 'shards').glob('verbs-*.sop')):
        for _, texts, attrs in knowledge_texts(path):
            for t in texts:
                if attrs.get('act'):
                    lexicon[t.lower()].add(attrs['act'])
    observed = collections.Counter()
    for row in corpus_rows:
        for q in row.get('requests') or []:
            t = q.get('trigger')
            if isinstance(t, str) and t and q.get('act') and len(t) < 30:
                observed[(t.lower(), q['act'])] += 1
    # Reviewed corpus triggers that k.actions lacks; rare ones are often nouns or pronouns picked by authors.
    stop = {'i', 'face', 'mouth', 'avatar', 'what', 'which', "what's", 'how many', 'let', 'what is'}
    for (t, act), n in observed.items():
        if n >= 8 and t not in stop:
            lexicon[t].add(act)
    forms = collections.defaultdict(set)
    for verb, acts in lexicon.items():
        head, _, rest = verb.partition(' ')
        tails = {head, head + 's', head + 'es', head + 'ed', head + 'd', head + 'ing', (head[:-1] + 'ing') if head.endswith('e') else head}
        for form in tails:
            forms[(form + (' ' + rest if rest else '')).strip()] |= acts
    return dict(forms)


def avatar_part_words():
    words = {}
    for ident, texts, _ in knowledge_texts(KNOWLEDGE / 'w.face' / 'shards' / 'words.sop'):
        slot = ident.rsplit('.', 1)[1]
        if texts:
            words[slot] = texts
    return words


# ---------------------------------------------------------------- source normalisation

def family_union(rows):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[max(a, b)] = min(a, b)
    return find, union


def ui_row(source, raw, index):
    cohort = raw.get('cohort') or {}
    families = cohort.get('recipeFamilies') or [cohort.get('recipeFamily') or raw.get('source_id') or raw.get('id')]
    return {
        'id': f'{source}:{raw.get("source_id") or raw.get("id")}', 'source': source, 'source_id': raw.get('source_id') or raw['id'],
        'world': raw['world'], 'text': raw['text'], 'context': raw.get('context') or {'existing': [], 'previous': None},
        'requests': copy.deepcopy(raw['requests']), 'families': [f'ui:{f}' for f in families],
        'operation': cohort.get('operation') or ('compound' if len(raw['requests']) > 1 else None),
        'style': raw.get('style') or raw.get('tier') or raw.get('phase'), 'phase': raw.get('phase'),
    }


def old_row(raw):
    first = (raw['requests'][0]['span'] if raw['requests'] else raw['text']).strip().lower()
    tools = raw.get('expectedTools') or []
    return {
        'id': f'demo-tool-profile:{raw["source_path"]}:{raw["source_id"]}', 'source': 'demo-tool-profile', 'source_id': raw['source_id'],
        'world': raw['world'], 'text': raw['text'], 'context': raw.get('context') or {'existing': [], 'previous': None},
        'requests': copy.deepcopy(raw['requests']), 'families': [f'old:{raw["world"]}:{first}'],
        'operation': tools[0]['operation'] if len(tools) == 1 else ('compound' if len(tools) > 1 else None),
        'style': raw['source_path'].split('/')[1] if '/' in raw['source_path'] else raw['source_path'], 'phase': raw.get('phase'),
        'source_path': raw['source_path'],
    }


def anchors_fix(row, stats, inv):
    """A relation's anchor phrase becomes the inventory's own anchor mention (<type>.anchor or <type>.relation_anchor),
    which the per-key preparer can supervise; relation classes use the bank's names (left -> left_of)."""
    rename = {'left': 'left_of', 'right': 'right_of'}
    for q in row['requests']:
        extra = []
        for c in q.get('constraints') or []:
            spec = inv.key(row['world'], c['key'])
            if c['key'].endswith('.relation') and spec and c.get('value') in rename and c['value'] not in spec.get('values', []) and rename[c['value']] in spec.get('values', []):
                c['value'] = rename[c['value']]; stats['relation-value-renamed-to-bank'] += 1
            if c.get('anchor_span'):
                typ = c['key'].split('.')[0]
                key = next((typ + '.' + k for k in ('anchor', 'relation_anchor') if inv.key(row['world'], typ + '.' + k)), None)
                if not key:
                    continue
                extra.append({'key': key, 'value': c['anchor_span'], 'value_span': c['anchor_span'], 'operator': 'relation', 'phase': 'selector',
                              'polarity': 'positive', 'character': 'requirement', **({'anchor_kind': c['anchor_kind']} if c.get('anchor_kind') else {}),
                              **({'anchor_fill': c['anchor_fill']} if c.get('anchor_fill') else {})})
                stats['anchor-span-as-anchor-mention'] += 1
                for f in ('anchor_span', 'anchor_fill', 'anchor_kind'):
                    c.pop(f, None)
        q['constraints'] = (q.get('constraints') or []) + extra
    return row


DETERMINERS = ('the', 'this', 'that', 'these', 'those')
# A possessive before a kind word is a definite description too ("her hair", "his nose": the avatar's own part).
POSSESSIVES = ('her', 'his', 'its', 'their', 'my', 'your', 'our')


def kind_vocabulary():
    """Kind words the runtime grounds (the deployed reader bindings: published k.* kinds and their core.word texts)."""
    deployment = json.loads((REPO / 'docs/webchat/models/sop-bert/deployment.json').read_text())
    path = REPO / 'docs/webchat' / (deployment['artifactBase'] + deployment['bindingsArtifact']['path'])
    lemmas = collections.defaultdict(set)
    for k in json.loads(path.read_text())['kinds']:
        lemmas[k['area']].add(k['lemma'].lower())
    return path, lemmas


def definite_description_fix(row, stats, lemmas):
    """"the house" is a definite description: the target is described by its kind, not named. The name label and the
    identity selector that repeats the same phrase become target kind/kind_span. Proper names stay names."""
    kinds = {str(e.get('kind', '')).lower().replace('_', ' ') for e in (row['context'] or {}).get('existing', [])} | lemmas.get(row['world'], set())
    for q in row['requests']:
        t = q.get('target') or {}
        name = t.get('name_span')
        if not name or t.get('mode') != 'existing' or 'kind' in t:
            continue
        words = name.split()
        if words[0].lower() in DETERMINERS + POSSESSIVES and len(words) > 1:
            noun = ' '.join(words[1:])
        else:
            noun = name
            at = q['span'].find(name)
            before = q['span'][:at].split()[-1:] if at > 0 else []
            if not before or before[0].lower() not in DETERMINERS:
                continue
        if not noun[:1].islower() or noun.lower() not in kinds:
            continue
        selectors = [c for c in q.get('constraints') or [] if c.get('phase') == 'selector' and c['key'].split('.')[-1] in ('id', 'ids')]
        if len(selectors) > 1 or (selectors and selectors[0]['value_span'] not in (name, noun)):
            continue
        if q['span'].count(noun) != 1:
            continue
        q['constraints'] = [c for c in q.get('constraints') or [] if c not in selectors]
        del t['name_span']
        t.update({'kind': noun, 'kind_span': noun, 'fill': 'description', 'determiner': 'definite'})
        stats['definite-description-name-to-kind'] += 1
    return row


COMPARATIVES = {'bigger': 'more', 'larger': 'more', 'wider': 'more', 'taller': 'more', 'longer': 'more', 'higher': 'more', 'thicker': 'more', 'huger': 'more',
                'smaller': 'less', 'tinier': 'less', 'narrower': 'less', 'shorter': 'less', 'lower': 'less', 'thinner': 'less'}
ABSOLUTE_DEGREES = {'big', 'small', 'large', 'tiny', 'huge', 'little', 'medium', 'giant', 'smallish', 'biggish'}
DEGREE_KEY = re.compile(r'\.(size|width|height|scale|length)$')


def degree_fix(row, stats):
    """Comparatives are changes relative to the current value: operator delta, step more/less (much_ when intensified),
    the comparative word as value_span and no value. Bare absolute degree words (big, small) are degree conditions."""
    for q in row['requests']:
        for c in q.get('constraints') or []:
            vs = c.get('value_span') or ''
            if not DEGREE_KEY.search(c['key']):
                continue
            words = re.findall(r"[a-z]+", vs.lower())
            comps = [w for w in words if w in COMPARATIVES]
            if len(comps) == 1 and not re.search(r'\d', vs) and c.get('operator') != 'factor' or (len(comps) == 1 and c.get('operator') == 'factor' and not c.get('measure')):
                word = re.search(r'\b' + comps[0] + r'\b', vs, re.I).group(0)
                if q['span'].count(word) != 1:
                    continue
                before = re.findall(r"[a-z]+", q['span'][:q['span'].index(word)].lower())[-2:]
                intensified = any(w in ('much', 'lot', 'way', 'far', 'considerably') for w in words + before)
                step = ('much_' if intensified else '') + COMPARATIVES[comps[0]]
                if (c.get('operator'), c.get('step'), c.get('value_span'), 'value' in c) != ('delta', step, word, False):
                    if 'value' in c:
                        c['raw_value'] = c.pop('value')
                    c.update({'operator': 'delta', 'step': step, 'value_span': word})
                    stats['comparative-as-delta-step'] += 1
            elif vs.lower() in ABSOLUTE_DEGREES and c.get('operator') == 'eq':
                c['operator'] = 'degree'; stats['absolute-degree-word-as-degree'] += 1
    return row


# One label per intent across corpora (majority of the old corpus and the coverage corpus).
ACT_BY_OPERATION = {'diagram.link.make': ('link', 'connect'), 'diagram.node.layout': ('node', 'arrange'), 'diagram.group.layout': ('group', 'arrange'),
                    'diagram.selection.remove': ('sketch', 'remove'), 'diagram.group.make': ('group', 'group'), 'diagram.group.ungroup': ('group', 'ungroup')}
KEY_RENAMES = {('calendar', 'meeting.duration'): 'meeting.length', ('drawing', 'drawn.color'): 'drawn.colour', ('drawing', 'part.color'): 'part.colour'}


def length_steps():
    """The ordered feature `length` of avatar parts: its steps as the catalog's k.values scale declares them."""
    text = (KNOWLEDGE / 'k.values' / 'shards' / 'scales.sop').read_text()
    return {m.group(1) for m in re.finditer(r'k\.values\.step scale=length name=(\w+) rank=\d+', text)}


LENGTH_STEPS = length_steps()


def harmonise(row, stats):
    for c in (c for q in row['requests'] for c in q.get('constraints') or []):
        new = KEY_RENAMES.get((row['world'], c['key']))
        if new:
            stats[f'key-{c["key"]}-as-{new}'] += 1; c['key'] = new
    # A part length said as a feature value ("long", property "length") is the ordinal key part.length (ui-features-v1).
    if row['world'] == 'avatar':
        for q in row['requests']:
            cs = q.get('constraints') or []
            values = [c for c in cs if c['key'] == 'part.value' and c.get('value') in LENGTH_STEPS]
            prop = [c for c in cs if c['key'] == 'part.property' and c.get('value') in (None, 'length')]
            if values and all(c.get('value') in (None, 'length') for c in cs if c['key'] == 'part.property'):
                for c in values:
                    c['key'] = 'part.length'; c['operator'] = 'degree'
                q['constraints'] = [c for c in cs if c not in prop]
                stats['avatar-length-value-as-part.length'] += len(values)
    # A chart type spans the whole kind phrase ("bar chart", "pie chart"), in every source.
    for q in row['requests']:
        for c in q.get('constraints') or []:
            if c.get('key') == 'chart.type' and isinstance(c.get('value_span'), str) and not c['value_span'].endswith(('chart', 'graph', 'plot')):
                m = re.search(re.escape(c['value_span']) + r'(\s+(?:chart|graph|plot))\b', q.get('span') or '')
                if m:
                    c['value_span'] += m.group(1); stats['chart.type-span-as-whole-kind-phrase'] += 1
    # The count of new diagram nodes is the native parameter n (node.n), as in the executed and coverage corpora.
    if row['world'] == 'diagram':
        for q in row['requests']:
            t = q.get('target') or {}
            if t.get('type') == 'node' and t.get('mode') == 'new' and t.get('count_span') and not any(c['key'] == 'node.n' for c in q.get('constraints') or []):
                c = {'key': 'node.n', 'value_span': t.pop('count_span'), 'operator': 'eq', 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'}
                if t.get('count'):
                    c['value'] = t.pop('count')
                q['constraints'] = (q.get('constraints') or []) + [c]
                stats['diagram-new-node-count-as-node.n'] += 1
    if len(row['requests']) != 1:
        return row
    q = row['requests'][0]
    typ_act = ACT_BY_OPERATION.get(row.get('operation'))
    if typ_act and q['target'].get('type') == typ_act[0] and q['act'] != typ_act[1]:
        q['act'] = typ_act[1]; stats[f'act-{typ_act[1]}-for-{row["operation"]}'] += 1
    if row.get('operation') == 'document.write' and q['target'].get('type') == 'document':
        q['target']['type'] = 'text'
        for c in q.get('constraints') or []:
            if c['key'].startswith('document.'):
                c['key'] = 'text.' + c['key'].split('.', 1)[1]
        stats['text-target-for-document.write'] += 1
    return row


def qualitative_fix(row, stats):
    """A vague value has no gold canonical value: keep its source phrase as the BIO mention, no class/value label."""
    for q in row['requests']:
        for c in q['constraints']:
            if c.get('qualitative'):
                c.pop('value', None); stats['qualitative-value-unlabelled'] += 1
    return row


# ---------------------------------------------------------------- main synthetic conversion

class MainSynthetic:
    OBSERVE = {'drawn.observe', 'node.observe', 'block.observe', 'meeting.observe', 'part.observe'}
    MAKE = {'drawing.object.make': 'drawn', 'drawing.catalog.make': 'drawn', 'diagram.node.make': 'node'}
    ASK = {'count': 'count', 'exists': 'exists', 'values': 'list', 'colour': 'what'}

    def __init__(self, inv, verbs, templates, contexts, part_words, attested_pairs, selector_keys):
        self.inv, self.verbs, self.templates, self.contexts = inv, verbs, templates, contexts
        self.part_words, self.attested, self.selector_keys = part_words, attested_pairs, selector_keys

    def trigger(self, span, act, skip=()):
        best = None
        for form, acts in self.verbs.items():
            if act not in acts:
                continue
            for at in find_all(span, form):
                if any(a <= at < b for a, b in skip):
                    continue
                cand = (at, -len(form))
                if best is None or cand < best[0]:
                    best = (cand, span[at:at + len(form)])
        return best[1] if best else None

    def surfaces(self, text, q):
        a, b = q['span']
        span = text[a:b]
        out = []
        for c in q['constraints']:
            s, e = c['value_span']
            if text[s:e] != c['surface']:
                raise ValueError('span-offset-mismatch')
            out.append((c, c['surface'], (s - a, e - a)))
        kind = None
        if q['target'].get('kind_span'):
            s, e = q['target']['kind_span']
            kind = text[s:e]
        return span, out, kind

    def convert(self, r):
        op, tier, text = r['cohort']['operation'], r['tier'], r['text']
        if len(r['requests']) != 1:
            return self.compound(r)
        q = r['requests'][0]
        try:
            span, cons, kind_surface = self.surfaces(text, q)
        except ValueError as e:
            return None, str(e)
        world = r['world']
        if op in self.OBSERVE:
            return self.question(r, q, world, span, cons, kind_surface)
        if op in self.MAKE:
            return self.make(r, q, world, span, cons, op)
        if op == 'avatar.face.preset':
            return self.preset(r, q, span, cons)
        if op == 'avatar.part.add':
            return self.part_add(r, q, span, cons)
        if op in ('avatar.part.change', 'avatar.part.resize', 'avatar.part.move'):
            return self.avatar_edit(r, q, span, cons, op)
        if op.startswith('avatar.'):
            return None, 'avatar-label-or-text-nonsense'
        # Repair instead of drop (owner phase rule 2026-11-20): terse/mechanical texts and operations whose usual target
        # is not a written name are converted like human edits whenever the selector is written in the text.
        tmpl = self.templates.get(op) or ({'type': op.split('.')[1], 'act': 'change', 'mood': 'do', 'fill': 'written'}
                                         if op.split('.')[1] in self.inv.families.get(world, ()) else None)
        if not tmpl:
            return None, 'operation-without-target-template'
        return self.edit(r, q, world, span, cons, op, tmpl)

    def avatar_edit(self, r, q, span, cons, op):
        """Avatar part edits whose selector is a document label ("make the Intro long straight"): the label is replaced by the
        w.face word of the part slot the variant belongs to ("make the hair long straight"); the variant is the result."""
        sel = [(c, s) for c, s, _ in cons if c['phase'] == 'selector']
        kinds = [(c, s) for c, s, _ in cons if c['key'] == 'part.kind']
        if len(sel) != 1 or len(kinds) != 1:
            return None, 'avatar-label-or-text-nonsense'
        (sc, ss), (kc, ks) = sel[0], kinds[0]
        slots = sorted(slot for variant, slot in self.attested if variant == kc['value'])
        words = self.part_words.get(slots[0]) if slots else None
        if not words or occurs(r['text'], ss) != 1:
            return None, 'avatar-label-without-part-slot'
        word = words[0]
        text, span = r['text'].replace(ss, word), span.replace(ss, word)
        if occurs(span, word) != 1:
            return None, 'avatar-rewritten-span-ambiguous'
        out = []
        variant_bank = self.inv.key('avatar', 'part.variant')['values']
        for c, s, _ in cons:
            if c is sc:
                continue
            if c is kc:
                if kc['value'] != 'part' and occurs(span, ks) >= 1:
                    v = kc['value'] if kc['value'] in variant_bank else kc['value']
                    out.append(self.constraint('avatar', 'part.variant', v, ks, {**kc, 'phase': 'result'}))
                continue
            try:
                key = 'part.' + c['key'].split('.', 1)[1]
                value = self.map_value('avatar', key, c, s)
            except ValueError:
                continue
            if value is not None and occurs(span, s) >= 1:
                out.append(self.constraint('avatar', key, value, s, c))
        act = 'place' if op == 'avatar.part.move' else 'change'
        req = {'span': span, 'act': act, 'mood': 'do', 'target': {'type': 'part', 'mode': 'existing', 'determiner': 'definite', 'fill': 'description',
                                                                    'kind': word, 'kind_span': word}, 'constraints': out}
        trig = self.trigger(span, act)
        if trig:
            req['trigger'] = trig
        row = self.base(r, 'avatar', span, [req], copy.deepcopy(self.contexts['avatar']), ':edit')
        row['text'] = text
        row['rewrite'] = {'from': ss, 'to': word, 'reason': 'document label used as an avatar part name replaced by the part word of its variant slot'}
        return row, None

    def compound(self, r):
        """Each request of a two-intent message is converted with the operation of its own seed; all must convert."""
        seeds = self.compound_seeds.get(r['text'])
        if not seeds or len(seeds) != len(r['requests']):
            return None, 'compound-without-seed-alignment'
        parts = []
        for q, seed in zip(r['requests'], seeds):
            op = self.seed_ops.get(seed)
            if not op:
                return None, 'compound-seed-unknown'
            row, reason = self.convert({**r, 'requests': [q], 'cohort': {**r['cohort'], 'operation': op, 'seed': seed}})
            if row is None:
                return None, 'compound-part-' + reason
            if row.get('rewrite') or row['world'] != r['world']:
                return None, 'compound-part-rewritten-or-cross-area'
            parts.append(row)
        row = parts[0]
        row['requests'] = [p['requests'][0] for p in parts]
        row['families'] = ['ms:' + '+'.join(seeds)]
        row['operation'] = 'compound'
        row['context'] = max((p['context'] for p in parts), key=lambda c: len(c['existing']))
        return row, None

    def base(self, r, world, span, requests, context, family_tag):
        return {'id': 'main-synthetic:' + r['id'], 'source': 'main-synthetic', 'source_id': r['id'], 'world': world, 'text': r['text'],
                'context': context, 'requests': requests, 'families': ['ms:' + r['cohort']['seed'] + family_tag],
                'operation': r['cohort']['operation'], 'style': r['tier'], 'phase': 'direct'}

    def constraint(self, world, key, value, surface, src):
        c = {'key': key, 'value': value, 'value_span': surface}
        for f in ('operator', 'phase', 'polarity', 'character'):
            c[f] = src[f]
        return c

    def map_value(self, world, key, c, surface):
        """Value convention of the reader corpora: span-copy keys carry the surface, class keys the bank value, numbers as text."""
        spec = self.inv.key(world, key)
        if spec is None:
            raise ValueError('unregistered-key:' + world + '.' + key)
        value = c['value']
        short = key.split('.', 1)[1]
        if isinstance(value, str) and value in PLACEHOLDERS and short not in NAME_KEYS:
            return None  # a placeholder is no evidence: the constraint is left out, the row is kept
        if spec['head'].startswith('number') or isinstance(value, (int, float)):
            n = as_number(value)
            if n is None or n not in numbers_in(surface):
                nums = numbers_in(surface)
                if len(nums) != 1:
                    return None  # the text's number is the value; without one the constraint is left out
                n = nums[0]
            return str(int(n)) if float(n).is_integer() else str(n)
        if spec.get('values'):
            return value  # outside the bank it stays an open value (Validator reports the bank extension)
        return surface

    def question(self, r, q, world, span, cons, kind_surface):
        ops = [(c, s) for c, s, _ in cons if c['key'].endswith('.operation')]
        if len(ops) != 1 or len(cons) != 1:
            return None, 'question-shape'
        c, surface = ops[0]
        ask = self.ASK.get(c['value'])
        kind = q['target'].get('kind')
        typ = {'drawing': 'drawn', 'diagram': 'node', 'document': 'block'}.get(world)
        if world == 'calendar':
            typ = kind if kind in self.inv.families['calendar'] else None
        if world == 'avatar':
            return None, 'avatar-question-about-face-or-preset-not-parts'
        if not ask or not typ or typ not in self.inv.families.get(world, ()):
            return None, 'question-target-type-not-in-area'
        if not kind_surface or occurs(span, kind_surface) != 1:
            return None, 'question-kind-span-missing-or-ambiguous'
        if c['value'] == 'colour':
            target = {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'written', 'name_span': kind_surface}
        else:
            target = {'type': typ, 'mode': 'existing', 'determiner': q['target'].get('determiner', 'definite'), 'fill': 'all', 'kind': kind_surface, 'kind_span': kind_surface}
        question = {'ask': ask}
        if c['value'] == 'colour':
            if not self.inv.key(world, typ + '.colour'):
                return None, 'question-asked-key-unregistered'
            question['asked_key'] = typ + '.colour'
        req = {'span': span, 'trigger': surface, 'act': 'answer', 'mood': 'check' if ask == 'exists' else 'ask', 'target': target, 'constraints': [], 'question': question}
        return self.base(r, world, span, [req], copy.deepcopy(self.contexts[world]), ''), None

    def make(self, r, q, world, span, cons, op):
        typ = self.MAKE[op]
        kinds = [(c, s) for c, s, _ in cons if c['key'].endswith('.kind')]
        if len(kinds) != 1:
            return None, 'make-without-single-kind'
        kc, ksurface = kinds[0]
        if kc['value'] in PLACEHOLDERS or occurs(span, ksurface) != 1:
            return None, 'make-kind-placeholder-or-ambiguous'
        out = []
        try:
            for c, s, _ in cons:
                if c is kc:
                    continue
                short = c['key'].split('.', 1)[1]
                if short == 'x' and len(numbers_in(s)) == 2 and re.fullmatch(r'\s*\d+\s*,\s*\d+\s*', s):
                    x, y = [p.strip() for p in s.split(',')]
                    out.append(self.constraint(world, typ + '.x', x, x, c)); out.append(self.constraint(world, typ + '.y', y, y, c))
                    continue
                key = typ + '.' + short
                value = self.map_value(world, key, c, s)
                if value is not None:
                    out.append(self.constraint(world, key, value, s, c))
        except ValueError as e:
            return None, str(e).split(':')[0]
        for c in out:
            if not self.inv.key(world, c['key']):
                return None, 'unregistered-key'
            if occurs(span, c['value_span']) < 1:
                return None, 'value-span-not-in-request'
        req = {'span': span, 'act': 'make', 'mood': 'do', 'target': {'type': typ, 'mode': 'new', 'determiner': 'indefinite', 'kind': ksurface, 'kind_span': ksurface}, 'constraints': out}
        trig = self.trigger(span, 'make')
        if trig:
            req['trigger'] = trig
        return self.base(r, world, span, [req], copy.deepcopy(self.contexts[world]), ''), None

    def preset(self, r, q, span, cons):
        bank = self.inv.key('avatar', 'face.preset')['values']
        presets = [(c, s) for c, s, _ in cons if c['key'] == 'face.kind']
        sel = [(c, s) for c, s, _ in cons if c['key'] == 'face.id']
        if len(presets) != 1 or len(sel) != 1 or len(cons) != 2:
            return None, 'avatar-preset-shape'
        (pc, ps), (sc, ss) = presets[0], sel[0]
        if occurs(span, ss) != 1 or ss.lower() not in ('face', 'avatar'):
            return None, 'avatar-selector-not-face'
        req = {'span': span, 'act': 'change', 'mood': 'do', 'target': {'type': 'face', 'mode': 'existing', 'determiner': 'definite', 'fill': 'written', 'name_span': ss},
               'constraints': [self.constraint('avatar', 'face.preset', pc['value'], ps, pc), self.constraint('avatar', 'face.id', 'face', ss, sc)]}
        trig = self.trigger(span, 'change', skip=[])
        if trig:
            req['trigger'] = trig
        return self.base(r, 'avatar', span, [req], copy.deepcopy(self.contexts['avatar']), ''), None

    def part_add(self, r, q, span, cons):
        d = {c['key']: (c, s) for c, s, _ in cons}
        if set(d) != {'part.kind', 'part.id'}:
            return None, 'avatar-part-shape'
        (vc, vs), (ic, is_) = d['part.kind'], d['part.id']
        words = self.part_words.get(ic['value'])
        human = is_ if '_' not in is_ else (words[0] if words else None)
        if not human or vc['value'] not in self.inv.key('avatar', 'part.variant')['values']:
            return None, 'avatar-slot-without-human-word'
        text = r['text'].replace(is_, human)
        span = span.replace(is_, human)
        if occurs(span, human) != 1 or occurs(span, vs) != 1:
            return None, 'avatar-rewritten-span-ambiguous'
        req = {'span': span, 'act': 'make', 'mood': 'do', 'target': {'type': 'part', 'mode': 'new', 'determiner': 'indefinite'},
               'constraints': [self.constraint('avatar', 'part.id', ic['value'], human, {**ic, 'phase': 'result'}), self.constraint('avatar', 'part.variant', vc['value'], vs, vc)]}
        trig = self.trigger(span, 'make')
        if trig:
            req['trigger'] = trig
        row = self.base(r, 'avatar', span, [req], copy.deepcopy(self.contexts['avatar']), '')
        row['text'] = text
        row['rewrite'] = {'from': is_, 'to': human, 'reason': 'slot id replaced by its w.face word'}
        return row, None

    def edit(self, r, q, world, span, cons, op, tmpl):
        typ = tmpl['type']
        selectors = [(c, s) for c, s, _ in cons if c['phase'] == 'selector']
        sel_key = self.selector_keys.get(op) or next((typ + '.' + k for k in ('ids', 'id') if self.inv.key(world, typ + '.' + k)), None)
        if selectors and not sel_key:
            return None, 'edit-selector-key-unknown'
        out = []
        try:
            for c, s, _ in cons:
                short = c['key'].split('.', 1)[1]
                if short in ('kind', 'operation'):
                    continue
                if c['phase'] == 'selector':
                    if not isinstance(c['value'], str):
                        continue  # a numeric selector with no referent is left out; the row is kept
                    out.append(self.constraint(world, sel_key, s, s, c)); continue
                if short == 'x' and re.fullmatch(r'\s*\d+\s*,\s*\d+\s*', s):
                    x, y = [p.strip() for p in s.split(',')]
                    out.append(self.constraint(world, typ + '.x', x, x, c)); out.append(self.constraint(world, typ + '.y', y, y, c)); continue
                key = typ + '.' + short
                value = self.map_value(world, key, c, s)
                if value is not None:
                    out.append(self.constraint(world, key, value, s, c))
        except ValueError as e:
            return None, str(e).split(':')[0]
        for c in out:
            if not self.inv.key(world, c['key']):
                return None, 'unregistered-key'
            if occurs(span, c['value_span']) < 1:
                return None, 'value-span-missing'
        target = {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'written', 'name_span': selectors[0][1]} if selectors else \
            {'type': typ, 'mode': 'existing', 'determiner': 'definite', 'fill': 'context'}  # no written selector: the target is the one in focus
        req = {'span': span, 'act': tmpl['act'], 'mood': tmpl['mood'], 'target': target, 'constraints': out}
        trig = self.trigger(span, tmpl['act'])
        if trig:
            req['trigger'] = trig
        context = copy.deepcopy(self.contexts[world])
        kind = q['target'].get('kind')
        for _, s in selectors:
            context['existing'].insert(0, {'kind': kind if kind and kind not in (typ, 'object', 'node', 'block', 'part') else self.contexts[world]['existing'][0]['kind'], 'name': s})
        return self.base(r, world, span, [req], context, ':edit'), None


class MainSyntheticFiles:
    """The generator's own inputs: seeds (labels) and variant files (texts). examples.jsonl is their assembly;
    variant texts it lacks are assembled here from their seed, copying the request frame of an assembled sibling."""

    def __init__(self, examples):
        base = REPO / 'main-synthetic-dataset'
        self.base = base
        self.seeds = {}
        self.seed_files = [base / 'seeds-full.jsonl', base / 'seeds-all.jsonl', base / 'seeds-trigger.jsonl', *sorted((base / 'agent-seeds').glob('*.jsonl'))]
        for path in self.seed_files:
            for s in read_jsonl(path):
                self.seeds.setdefault(s['seedId'], s)
        self.seed_ops = {k: v['operation'] for k, v in self.seeds.items()}
        self.variant_files = [*sorted((base / 'variants').glob('*.jsonl')), base / 'mech-variants.jsonl']
        by_text = {r['text']: r for r in examples}
        sibling = {}
        for r in examples:
            if len(r['requests']) == 1:
                sibling.setdefault(r['cohort'].get('seed'), r)
        self.compound_seeds, self.assembled, self.rows = {}, [], {}
        made = set(by_text)
        for path in self.variant_files:
            entries = []
            for i, v in enumerate(read_jsonl(path)):
                text = v.get('text') or ' '.join(v.get('segments', []))
                entry = {'text': text, 'tier': v.get('tier')}
                if v.get('seedIds'):
                    self.compound_seeds.setdefault(text, v['seedIds'])
                if text in by_text:
                    entry['example'] = by_text[text]['id']
                elif text in made:
                    entry['reason'] = 'duplicate-of-another-variant'
                else:
                    row, reason = self.assemble(path, i, v, text, sibling)
                    if row:
                        self.assembled.append(row); entry['example'] = row['id']; made.add(text)
                    else:
                        entry['reason'] = reason
                entries.append(entry)
            self.rows[path] = entries
        self.seed_usage = collections.Counter()
        for r in examples:
            self.seed_usage[r['cohort'].get('seed')] += 1

    def assemble(self, path, index, v, text, sibling):
        seed = self.seeds.get(v.get('seedId'))
        if not seed:
            return None, 'seed-not-found' if v.get('seedId') else 'compound-variant-not-in-examples'
        frame = sibling.get(seed['seedId'])
        if not frame:
            return None, 'no-assembled-sibling-for-seed'
        surfaces = v.get('surfaces') or {}

        def locate(sur):
            if isinstance(sur, dict):
                sur = sur.get('typo')
            if not isinstance(sur, str) or text.count(sur) != 1:
                return None, None
            at = text.index(sur)
            return sur, [at, at + len(sur)]
        constraints = []
        for sc in seed['constraints']:
            sur = surfaces.get(str(sc['n']))
            if sur is None:
                if sc.get('optional'):
                    continue
                return None, 'mandatory-surface-missing'
            surface, span = locate(sur)
            if not span:
                return None, 'surface-missing-or-not-unique'
            constraints.append({'key': sc['key'], 'value': sc['value'], 'value_span': span, 'surface': surface,
                                **{f: sc[f] for f in ('operator', 'phase', 'polarity', 'character')}})
        q = copy.deepcopy(frame['requests'][0])
        q.update({'span': [0, len(text)], 'constraints': constraints})
        q['target'].pop('kind_span', None)
        if 'kind' in surfaces:
            surface, span = locate(surfaces['kind'])
            if not span:
                return None, 'kind-surface-missing-or-not-unique'
            q['target']['kind_span'] = span
        return {'id': f'variant:{path.name}:{index}', 'world': frame['world'], 'text': text, 'context': {'existing': [], 'previous': None},
                'requests': [q], 'tier': v.get('tier'), 'cohort': {**frame['cohort']}}, None

    def accounting(self, fate):
        out = []
        for path in self.seed_files:
            seeds = read_jsonl(path)
            used = sum(1 for s in seeds if self.seed_usage[s['seedId']])
            out.append({'path': str(path.relative_to(REPO)), 'gitCommit': git_commit(path), 'kind': 'seeds (labels)', 'rowsIn': len(seeds),
                        'seedsWithAssembledExamples': used, 'note': 'labels reach the dataset through examples.jsonl or assembled variants'})
        for path, entries in self.rows.items():
            reasons = collections.Counter()
            already = sum(1 for e in entries if e.get('example', '').startswith('syn-') or ('example' in e and not e['example'].startswith('variant:')))
            assembled = sum(1 for e in entries if e.get('example', '').startswith('variant:'))
            kept = 0
            for e in entries:
                if 'example' in e:
                    f = fate.get(e['example'], 'not-converted')
                    if f == 'kept':
                        kept += 1
                    else:
                        reasons[f] += 1
                else:
                    reasons['not-assembled:' + e['reason']] += 1
            out.append({'path': str(path.relative_to(REPO)), 'gitCommit': git_commit(path), 'kind': 'variants (texts)', 'rowsIn': len(entries),
                        'alreadyInExamples': already, 'assembledHere': assembled, 'kept': kept, 'dropped': len(entries) - kept,
                        'dropReasons': dict(reasons.most_common())})
        return out


# ---------------------------------------------------------------- validation

class Validator:
    def __init__(self, inv):
        self.inv = inv
        self.banks = {f: inv.bank('target', f) for f in ('mode', 'determiner', 'fill')}
        self.banks.update({f: inv.bank('constraint', f) for f in ('operator', 'phase', 'polarity', 'character', 'scope')})
        self.acts, self.moods = inv.bank('request', 'act'), inv.bank('request', 'mood')
        self.asks = inv.raw['request']['question']['keys']['ask']['values']

    def check(self, row):
        """Returns (errors, warnings, fixes). Fixes are applied in place and are correct by construction."""
        errors, warnings, fixes = [], [], []
        text, world = row['text'], row['world']
        if not isinstance(text, str) or not text.strip():
            return ['empty-text'], warnings, fixes
        names = [str(e.get(k, '')).lower().replace('_', ' ') for e in (row['context'] or {}).get('existing', []) for k in ('name', 'kind', 'id')]
        for qi, q in enumerate(row['requests']):
            for f in q:
                if f not in REQUEST_FIELDS:
                    warnings.append('unknown-request-field:' + f)
            span = q.get('span')
            if not isinstance(span, str) or occurs(text, span) < 1:
                errors.append('request-span-not-in-text'); continue
            trig = q.get('trigger')
            if trig is not None:
                if not isinstance(trig, str) or not find_all(span, trig):
                    if isinstance(trig, str) and trig == q.get('act'):
                        errors.append('trigger-is-canonical-act-not-span')
                    else:
                        del q['trigger']; fixes.append('trigger-not-in-span-removed')
                elif occurs(span, trig) == 0:
                    pass
            if q.get('act') not in self.acts:
                errors.append('act-not-in-bank:' + str(q.get('act')))
            if q.get('mood') not in self.moods:
                errors.append('mood-not-in-bank:' + str(q.get('mood')))
            t = q.get('target') or {}
            if t.get('type') not in self.inv.families.get(world, ()):
                errors.append('target-type-not-in-area:' + f'{world}.{t.get("type")}')
            for f in ('mode', 'determiner', 'fill'):
                if f in t and t[f] not in self.banks[f]:
                    if f == 'determiner' and t[f] in OPEN_DETERMINERS:
                        warnings.append('determiner-kept-open:' + t[f])
                    else:
                        errors.append(f'target-{f}-not-in-bank:{t[f]}')
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if f in t and (not isinstance(t[f], str) or occurs(span, t[f]) < 1):
                    errors.append(f'target-{f}-not-in-span')
                elif f in t and len(find_all(span, t[f])) > 1:
                    warnings.append(f'target-{f}-ambiguous')
            if 'kind' in t and 'kind_span' not in t and isinstance(t['kind'], str) and occurs(span, t['kind']) < 1:
                warnings.append('target-kind-without-source-span')
            question = q.get('question')
            if question and question.get('ask') not in self.asks:
                errors.append('question-ask-not-in-bank')
            for c in q.get('constraints') or []:
                key = world + '.' + c.get('key', '')
                spec = self.inv.key(world, c.get('key', ''))
                if spec is None:
                    errors.append('unregistered-key:' + key); continue
                vs = c.get('value_span')
                if not isinstance(vs, str) or occurs(span, vs) < 1:
                    q['constraints'] = [x for x in q['constraints'] if x is not c]; fixes.append('constraint-with-span-outside-request-removed'); continue
                if len(find_all(span, vs)) > 1:
                    warnings.append('value-span-ambiguous')
                for f in ('measure_span', 'anchor_span'):
                    if f in c and (not isinstance(c[f], str) or occurs(span, c[f]) < 1):
                        del c[f]; fixes.append(f'{f}-outside-request-removed')
                for f in ('operator', 'phase', 'polarity', 'character', 'scope'):
                    if f in c and c[f] not in self.banks[f]:
                        errors.append(f'{f}-not-in-bank:{c[f]}')
                if 'value' in c and spec.get('values') and c['value'] not in spec['values']:
                    # The source phrase stays a mention; its normalisation has no declared class (README: open contracts).
                    c['open_value'] = True; warnings.append(f'bank-extension-needed:{key}={c["value"]}')
                if 'value' in c and (spec['head'].startswith('number')) and c.get('operator') == 'eq':
                    n = as_number(c['value'])
                    if n is not None and n not in numbers_in(vs) and not c.get('measure'):
                        warnings.append('numeric-value-not-in-surface:' + key)
                if c.get('phase') == 'selector' and isinstance(c.get('value_span'), str):
                    probe = re.sub(r'^(the|a|an|this|that)\s+', '', vs.lower()).replace('_', ' ').strip()
                    if names and not any(probe and (probe in n or n in probe) for n in names if n):
                        warnings.append('selector-not-in-context')
                    elif not names:
                        warnings.append('selector-with-empty-context')
        return errors, warnings, fixes


def label_signature(row):
    def norm(q):
        t = q.get('target') or {}
        return [q.get('act'), q.get('mood'), t.get('type'), t.get('mode'), sorted((c['key'], json.dumps(c.get('value'))) for c in q.get('constraints') or [])]
    return json.dumps([norm(q) for q in row['requests']], sort_keys=True)


# ---------------------------------------------------------------- build

def main():
    inventory = build_inventory()
    inv = Inventory(inventory)
    validator = Validator(inv)
    raw = {name: read_jsonl(path) for name, path, _ in SOURCES}
    manifest_sources = []
    stats = collections.defaultdict(collections.Counter)  # source -> reason counts
    fixes = collections.defaultdict(collections.Counter)
    warnings = collections.defaultdict(collections.Counter)
    raw_issues = collections.defaultdict(collections.Counter)  # validation of the untouched sources

    # Validate every source row as delivered (before conversion), in the reader format where it has one.
    for name, rows in raw.items():
        for r in rows:
            if name == 'main-synthetic':
                q0 = r['requests'][0]
                text = r['text']
                for q in r['requests']:
                    if isinstance(q.get('trigger'), str) and not find_all(text, q['trigger']):
                        raw_issues[name]['trigger-not-a-text-span'] += 1
                    if isinstance(q.get('span'), list):
                        raw_issues[name]['spans-are-offset-arrays'] += 1
                    if q['target'].get('type') not in inv.families.get(r['world'], ()):
                        raw_issues[name]['target-type-not-in-area'] += 1
                    if q.get('act') not in validator.acts:
                        raw_issues[name]['act-not-in-bank'] += 1
                    for c in q['constraints']:
                        if inv.key(r['world'], c['key']) is None:
                            raw_issues[name]['unregistered-key'] += 1
                        if c['phase'] == 'selector':
                            raw_issues[name]['selector-with-empty-context'] += not r['context']['existing']
                            if r['world'] == 'avatar' and c['key'] in ('part.ids', 'part.id') and c['value'] in PLACEHOLDERS:
                                raw_issues[name]['avatar-part-selector-is-a-document-label'] += 1
                        if isinstance(c['value'], str) and c['value'] in PLACEHOLDERS and c['key'].split('.')[-1] not in NAME_KEYS and c['phase'] != 'selector':
                            raw_issues[name]['placeholder-value-for-non-name-key'] += 1
                        if isinstance(c['value'], (int, float)) and c['value'] not in numbers_in(c['surface']):
                            raw_issues[name]['numeric-value-not-in-surface'] += 1
                        if '_' in c['surface'] and r['world'] == 'avatar':
                            raw_issues[name]['avatar-slot-id-written-in-text'] += 1
                if not r['context']['existing']:
                    raw_issues[name]['empty-context'] += 1
                continue
            probe = copy.deepcopy(r)
            row = {'text': probe['text'], 'world': probe['world'], 'context': probe.get('context') or {}, 'requests': probe['requests']}
            e, w, f = validator.check(row)
            for x in e:
                raw_issues[name][x.split(':')[0]] += 1
            for x in f:
                raw_issues[name][x] += 1
            for x in w:
                raw_issues[name]['warning:' + x.split(':')[0]] += 1

    # Normalise and convert.
    templates, contexts, selector_keys, attested = {}, {}, {}, set()
    tvotes, ctxvotes, selvotes = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    for name in ('ui-natural-v1', 'ui-human-v1'):
        for r in raw[name]:
            op = (r.get('cohort') or {}).get('operation')
            if len(r['requests']) != 1 or not op:
                continue
            q = r['requests'][0]; t = q['target']
            tvotes[op][json.dumps({'act': q['act'], 'mood': q['mood'], 'type': t['type'], 'fill': t.get('fill')})] += 1
            ctxvotes[r['world']][json.dumps(r['context'], sort_keys=True)] += 1
            for c in q['constraints']:
                if c['phase'] == 'selector':
                    selvotes[op][c['key']] += 1
            if r['world'] == 'avatar':
                d = {c['key']: c['value'] for c in q['constraints']}
                if 'part.variant' in d and 'part.id' in d:
                    attested.add((d['part.variant'], d['part.id']))
    templates = {op: json.loads(v.most_common(1)[0][0]) for op, v in tvotes.items()}
    contexts = {w: json.loads(v.most_common(1)[0][0]) for w, v in ctxvotes.items()}
    selector_keys = {op: v.most_common(1)[0][0] for op, v in selvotes.items()}
    verbs = verb_lexicon([r for n in ('ui-natural-v1', 'ui-human-v1', 'demo-tool-profile') for r in raw[n]])
    ms = MainSynthetic(inv, verbs, templates, contexts, avatar_part_words(), attested, selector_keys)
    kind_path, kind_lemmas = kind_vocabulary()

    extras = MainSyntheticFiles(raw['main-synthetic'])
    ms.compound_seeds, ms.seed_ops = extras.compound_seeds, extras.seed_ops
    raw['main-synthetic'] = raw['main-synthetic'] + extras.assembled
    fate = {}
    candidates = []
    for name, rows in raw.items():
        for i, r in enumerate(rows):
            if name == 'main-synthetic':
                row, reason = ms.convert(r)
                if row is None:
                    stats[name]['dropped:' + reason] += 1; fate[r['id']] = reason; continue
                fixes[name]['converted:' + r['cohort']['operation'].split('.')[0]] += 1
                if 'trigger' in row['requests'][0]:
                    fixes[name]['trigger-replaced-by-verb-span'] += 1
                else:
                    fixes[name]['trigger-removed-no-verb-in-text'] += 1
            elif name == 'demo-tool-profile':
                row = anchors_fix(old_row(r), fixes[name], inv)
            else:
                row = anchors_fix(ui_row(name, r, i), fixes[name], inv)
                if name == 'ui-human-v1':
                    row = qualitative_fix(row, fixes[name])
            row = harmonise(degree_fix(definite_description_fix(row, fixes[name], kind_lemmas), fixes[name]), fixes[name])
            e, w, f = validator.check(row)
            for x in f:
                fixes[name][x] += 1
            for x in w:
                warnings[name][x.split(':')[0]] += 1
            if e:
                stats[name]['dropped:' + e[0].split(':')[0]] += 1
                if name == 'main-synthetic':
                    fate[r['id']] = e[0].split(':')[0]
                continue
            candidates.append(row)

    # Deduplicate identical texts (case/space-insensitive); keep the higher-priority source, record label conflicts.
    order = {name: i for i, (name, _, _) in enumerate(SOURCES)}
    seen, kept, conflicts = {}, [], collections.Counter()
    for row in sorted(candidates, key=lambda r: (order[r['source']], r['id'])):
        k = (row['world'], ' '.join(row['text'].lower().split()), json.dumps(row['context'], sort_keys=True, ensure_ascii=False))
        if k in seen:
            first = seen[k]
            if label_signature(first) != label_signature(row):
                conflicts[f'{first["source"]}<-{row["source"]}'] += 1
                stats[row['source']]['dropped:conflicting-label-for-identical-text'] += 1
                fate[row['source_id']] = 'conflicting-label-for-identical-text'
            else:
                stats[row['source']]['dropped:duplicate-text'] += 1
                fate[row['source_id']] = 'duplicate-text'
            continue
        seen[k] = row; kept.append(row)

    # Balance: cap the main synthetic set per family and per operation (deterministic hash order).
    balanced, per_family, per_op = [], collections.Counter(), collections.Counter()
    for row in sorted(kept, key=lambda r: (order[r['source']], not str(r['style']).startswith('human'), sha(r['id']))):
        if row['source'] == 'main-synthetic':
            fam = row['families'][0]
            human = str(row['style']).startswith('human')
            cap = (MS_HUMAN_EDIT_CAP_PER_FAMILY if human else MS_EDIT_CAP_PER_FAMILY) if fam.endswith(':edit') else (MS_HUMAN_CAP_PER_FAMILY if human else MS_CAP_PER_FAMILY)
            # no cap (owner phase rule 2026-11-20): every repairable row is kept; prepare-official weights sources instead
            per_family[fam] += 1; per_op[row['operation']] += 1
            fate[row['source_id']] = 'kept'
        balanced.append(row)

    # Paraphrase families: union families that share a normalised request span across sources, then split by stratum.
    find, union = family_union(balanced)
    for row in balanced:
        for f in row['families'][1:]:
            union(row['families'][0], f)
        for q in row['requests']:
            union(row['families'][0], 'span:' + row['world'] + ':' + ' '.join(q['span'].lower().split()))
    groups = collections.defaultdict(list)
    for row in balanced:
        row['family'] = sha(find(row['families'][0]))[:16]
        groups[row['family']].append(row)
    strata = collections.defaultdict(list)
    for fam, rows in groups.items():
        first = min(rows, key=lambda r: (order[r['source']], r['id']))
        strata[(first['world'], (first['operation'] or 'none').split('.')[0] + '.' + str(first['requests'][0]['act'] if first['requests'] else 'none'))].append(fam)
    split_of = {}
    for stratum in sorted(strata):
        fams = sorted(strata[stratum], key=lambda f: sha('split:' + f))
        filled = collections.Counter()
        total = sum(len(groups[f]) for f in fams)
        for f in fams:
            # Give the family to the split furthest below its share.
            target = min(SPLIT_SHARES, key=lambda s: (filled[s[0]] / max(1, total) - s[1] / 100, s[0]))[0]
            split_of[f] = target; filled[target] += len(groups[f])
    outputs = collections.defaultdict(list)
    for row in sorted(balanced, key=lambda r: (order[r['source']], r['id'])):
        cut = int(sha('split:' + row['id']), 16) % 100
        record = {'id': row['id'], 'split': 'dev' if cut < SPLIT_SHARES[1][1] else 'test' if cut < SPLIT_SHARES[1][1] + SPLIT_SHARES[2][1] else 'train', 'world': row['world'], 'text': row['text'], 'context': row['context'],
                  'requests': row['requests'], 'family': row['family'], 'source': row['source'], 'source_id': row['source_id'],
                  'operation': row['operation'], 'style': row['style'], 'phase': row['phase']}
        if row.get('rewrite'):
            record['rewrite'] = row['rewrite']
        outputs[record['split']].append(record)

    # Labels hold only what the reader predicts; author metadata (typo_of, anchor_kind, raw_value, …) stays in the sources.
    reader_fields = {'open_value', 'key', 'value', 'value_span', 'operator', 'phase', 'polarity', 'character', 'scope', 'step', 'measure', 'measure_span', 'unit', 'variety', 'group'}
    stripped = collections.Counter()
    for split_rows in outputs.values():
        for r in split_rows:
            for q in r['requests']:
                for c in q.get('constraints') or []:
                    for f in [f for f in c if f not in reader_fields]:
                        del c[f]; stripped[f] += 1
                for f in [f for f in q.get('target', {}) if f in ('typo_of', 'alias_of', 'alias_unverified')]:
                    del q['target'][f]; stripped['target.' + f] += 1

    # Previous-message invariance: a quarter of the single-turn rows also appear with an unrelated previous message of
    # the same tab and split; the labels come from the text only, so they are unchanged.
    augmented = collections.Counter()
    for split in list(outputs):
        pool = collections.defaultdict(list)
        for r in outputs[split]:
            pool[r['world']].append(r['text'])
        extra = []
        for r in outputs[split]:
            if r['source'] == 'demo-tool-profile' or r['context'].get('previous') is not None or not r['requests']:
                continue
            if any((q.get('target') or {}).get('fill') in ('journal_step', 'context', 'previous_reply') for q in r['requests']):
                continue
            if int(sha('prev:' + r['id']), 16) % 4:
                continue
            texts = pool[r['world']]
            prev = texts[int(sha('pick:' + r['id']), 16) % len(texts)]
            if prev == r['text']:
                continue
            copyrow = copy.deepcopy(r)
            copyrow['id'] += ':with-previous'
            copyrow['context']['previous'] = prev
            copyrow['augmentation'] = 'previous-message-invariance'
            extra.append(copyrow); augmented[r['source']] += 1
        outputs[split].extend(extra)

    # Final validation of the written rows: zero errors is a build requirement.
    final_errors = collections.Counter()
    for split, rows in outputs.items():
        for r in rows:
            e, _, f = validator.check(copy.deepcopy(r))
            final_errors.update(e + f)
    leak = collections.defaultdict(set)
    for split, rows in outputs.items():
        for r in rows:
            leak[r['family']].add(split)
    leaked = sum(len(s) > 1 for s in leak.values())  # reported only: random rows, families may cross splits (owner phase rule)
    ids = collections.Counter(r['id'] for rows in outputs.values() for r in rows)
    final_errors.update({'duplicate-row-id': n - 1 for k, n in ids.items() if n > 1} if any(n > 1 for n in ids.values()) else {})
    if final_errors:
        raise SystemExit(f'final validation failed: {dict(final_errors)} leaked families={leaked}')

    write_outputs(outputs, inventory)
    in_counts = {name: len(rows) for name, rows in raw.items()}
    kept_counts = collections.Counter(r['source'] for rows in outputs.values() for r in rows if not r.get('augmentation'))
    for name, path, desc in SOURCES:
        manifest_sources.append({'name': name, 'path': str(path.relative_to(REPO)), 'description': desc, 'gitCommit': git_commit(path),
                                 'sha256': sha(path.read_bytes()), 'rowsIn': in_counts[name], 'rowsKept': kept_counts[name],
                                 'rowsDropped': in_counts[name] - kept_counts[name], 'dropReasons': dict(sorted(stats[name].items())),
                                 'fixes': dict(sorted(fixes[name].items()))})
    vocab = [{'path': str(p.relative_to(WORKSPACE)), 'gitCommit': None, 'sha256': sha(p.read_bytes())} for p in [KNOWLEDGE / 'w.face' / 'shards' / 'words.sop', *sorted((KNOWLEDGE / 'k.actions' / 'shards').glob('verbs-*.sop'))]]
    files = {}
    for p in sorted(HERE.iterdir()):
        if p.is_file() and p.name not in ('MANIFEST.json', 'README.md', 'build.py'):
            files[p.name] = {'sha256': sha(p.read_bytes()), 'bytes': p.stat().st_size}
    ms_files = extras.accounting(fate)
    manifest = {'format': 'psys2.official-reader-dataset/1', 'mainSyntheticFiles': ms_files, 'builder': 'official-dataset/build.py', 'builderSha256': sha(Path(__file__).read_bytes()),
                'sources': manifest_sources, 'vocabularyInputs': vocab,
                'splits': {s: len(outputs[s]) for s, _ in SPLIT_SHARES}, 'families': len(groups), 'leakedFamilies': leaked,
                'labelConflictsResolvedByPriority': dict(conflicts), 'previousMessageAugmentation': dict(augmented), 'nonReaderLabelFieldsRemoved': dict(stripped),
                'kindVocabulary': {'path': str(kind_path.relative_to(REPO)), 'sha256': sha(kind_path.read_bytes())}, 'files': files,
                'policy': {'priority': [s[0] for s in SOURCES], 'splitShares': dict(SPLIT_SHARES), 'mainSyntheticCapPerOperation': MS_CAP_PER_OPERATION,
                           'mainSyntheticCapPerFamily': MS_CAP_PER_FAMILY, 'mainSyntheticEditCapPerFamily': MS_EDIT_CAP_PER_FAMILY,
                           'mainSyntheticHumanCapPerFamily': MS_HUMAN_CAP_PER_FAMILY, 'mainSyntheticHumanEditCapPerFamily': MS_HUMAN_EDIT_CAP_PER_FAMILY}}
    (HERE / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    write_validation(raw_issues, stats, fixes, warnings, conflicts, final_errors, leaked, in_counts, kept_counts)
    write_stats(outputs)
    write_audit(outputs)
    print(json.dumps({'splits': manifest['splits'], 'kept': dict(kept_counts), 'in': in_counts}, indent=1))


def write_outputs(outputs, inventory):
    (HERE / 'inventory.json').write_text(json.dumps(inventory, indent=1, ensure_ascii=False, sort_keys=True) + '\n')
    for split, _ in SPLIT_SHARES:
        body = ''.join(json.dumps(r, ensure_ascii=False, sort_keys=True) + '\n' for r in outputs[split]).encode()
        if split == 'train':
            path = HERE / 'train.jsonl.gz'
            with open(path, 'wb') as raw_file, gzip.GzipFile(fileobj=raw_file, mode='wb', filename='', mtime=0) as stream:
                stream.write(body)
        else:
            (HERE / f'{split}.jsonl').write_bytes(body)


def table(counter, header, total=None, limit=None):
    rows = counter.most_common(limit)
    lines = [f'| {header} | rows |', '| --- | ---: |']
    lines += [f'| {k} | {v:,} |' for k, v in rows]
    if limit and len(counter) > limit:
        lines.append(f'| … {len(counter) - limit} more | {sum(counter.values()) - sum(v for _, v in rows):,} |')
    return '\n'.join(lines)


def write_validation(raw_issues, stats, fixes, warnings, conflicts, final_errors, leaked, in_counts, kept_counts):
    out = ['# Validation', '', 'Produced by `build.py`; every number below is measured on this build.', '',
           '## Checks', '',
           '- every labelled surface (request span, trigger, kind/name/description/count span, value span, measure/anchor span) occurs verbatim in the text (request span) or in its request span (the others);',
           '- the trigger is a span of the request, not the canonical act;',
           '- act, mood, target type (per area), mode, determiner, fill, operator, phase, polarity, character, scope and question kind belong to the trainer\'s label inventory (`inventory.json`), every constraint key is registered for its area, and class-bank values are in their bank;',
           '- numbers: a numeric value occurs in its surface (digits or number words);',
           '- selectors: a selector phrase matches an object of the row context (name or kind);',
           '- identical texts carry identical labels; duplicates are removed;',
           '- after the split no paraphrase family appears in two splits.', '',
           '## Sources as delivered', '', 'Issue counts on the untouched source rows (per request or constraint where the issue is local). `warning:` rows are reported, not errors.', '']
    for name in in_counts:
        out += [f'### {name} ({in_counts[name]:,} rows)', '', table(raw_issues[name], 'issue') if raw_issues[name] else 'No issue found.', '']
    out += ['## What the build did', '']
    for name in in_counts:
        out += [f'### {name}: {in_counts[name]:,} in, {kept_counts[name]:,} kept', '']
        if fixes[name]:
            out += ['Fixed or converted:', '', table(fixes[name], 'fix'), '']
        if stats[name]:
            out += ['Dropped:', '', table(stats[name], 'reason'), '']
        if warnings[name]:
            out += ['Kept with a warning (not an error; see README):', '', table(warnings[name], 'warning'), '']
    out += ['## Final check of the written splits', '', f'- unresolved errors: **{sum(final_errors.values())}**',
            f'- families present in more than one split: **{leaked}**',
            f'- label conflicts between identical texts, resolved by source priority: {dict(conflicts) or "none"}', '']
    (HERE / 'VALIDATION.md').write_text('\n'.join(out))


def write_stats(outputs):
    rows = [r for s, _ in SPLIT_SHARES for r in outputs[s]]
    out = ['# Statistics', '', f'{len(rows):,} messages; ' + ', '.join(f'{s} {len(outputs[s]):,}' for s, _ in SPLIT_SHARES) + '.', '']
    by = lambda f: collections.Counter(f(r) for r in rows)
    out += ['## Tab (world) × split', '', '| world | train | dev | test | total |', '| --- | ---: | ---: | ---: | ---: |']
    for w, n in by(lambda r: r['world']).most_common():
        out.append(f'| {w} | ' + ' | '.join(f"{sum(1 for r in outputs[s] if r['world'] == w):,}" for s, _ in SPLIT_SHARES) + f' | {n:,} |')
    out += ['', '## Source', '', table(by(lambda r: r['source']), 'source'), '']
    reqs = [(r, q) for r in rows for q in r['requests']]
    out += ['## Requests per message', '', table(by(lambda r: str(len(r['requests']))), 'requests'), '']
    out += ['## Act', '', table(collections.Counter(q['act'] for _, q in reqs), 'act'), '']
    out += ['## Target type', '', table(collections.Counter(f"{r['world']}.{q['target'].get('type')}" for r, q in reqs), 'world.type'), '']
    out += ['## Operation (top 60)', '', table(by(lambda r: r['operation'] or 'none'), 'operation', limit=60), '']
    out += ['## Relation', '', table(collections.Counter(c['value'] for _, q in reqs for c in q['constraints'] if c['key'].endswith('.relation') and 'value' in c), 'relation'), '']
    out += ['## Constraint keys (top 60)', '', table(collections.Counter(f"{r['world']}.{c['key']}" for r, q in reqs for c in q['constraints']), 'key', limit=60), '']
    out += ['## Style (top 40)', '', table(by(lambda r: str(r['style'])), 'style', limit=40), '']
    lengths = sorted(len(r['text']) for r in rows)
    words = sorted(len(r['text'].split()) for r in rows)
    pct = lambda xs, p: xs[min(len(xs) - 1, int(p * len(xs)))]
    out += ['## Text length', '', '| measure | min | median | p90 | max |', '| --- | ---: | ---: | ---: | ---: |',
            f'| characters | {lengths[0]} | {pct(lengths, .5)} | {pct(lengths, .9)} | {lengths[-1]} |',
            f'| words | {words[0]} | {pct(words, .5)} | {pct(words, .9)} | {words[-1]} |', '']
    (HERE / 'STATS.md').write_text('\n'.join(out))


def render(q):
    t = q['target']
    head = f"**{q['act']}**/{q['mood']}" + (f" trigger=“{q['trigger']}”" if 'trigger' in q else ' (no trigger)')
    tgt = f"target {t.get('type')} {t.get('mode')} {t.get('determiner')}" + ''.join(f' {k}=“{t[k]}”' if k.endswith('_span') else f' {k}={t[k]}' for k in ('fill', 'kind', 'kind_span', 'name_span', 'description_span', 'ordinal', 'count') if k in t)
    lines = [f'  - span “{q["span"]}”: {head}; {tgt}']
    if q.get('question'):
        lines.append(f"    - question {json.dumps(q['question'])}")
    for c in q['constraints']:
        lines.append(f"    - {c['key']} = {json.dumps(c.get('value', '(unlabelled)'))} from “{c['value_span']}” [{c['operator']}, {c['phase']}" + (', ' + c['polarity'] if c['polarity'] != 'positive' else '') + ']')
    return lines


def write_audit(outputs):
    rows = [r for s, _ in SPLIT_SHARES for r in outputs[s]]
    strata = collections.defaultdict(list)
    for r in rows:
        strata[(r['world'], r['source'])].append(r)
    picked, keys = [], sorted(strata)
    per = max(1, 100 // len(keys))
    for k in keys:
        picked += sorted(strata[k], key=lambda r: sha('audit:' + r['id']))[:per]
    rest = sorted((r for r in rows if r not in picked), key=lambda r: sha('audit2:' + r['id']))
    picked = (picked + rest)[:100]
    out = ['# Audit sample', '', '100 rows, stratified by tab and source (fixed hash order). Each row: text, context names, then the labels per request.', '']
    for i, r in enumerate(sorted(picked, key=lambda r: (r['world'], r['source'], r['id'])), 1):
        names = ', '.join(str(e.get('name') or e.get('kind')) for e in (r['context'] or {}).get('existing', [])[:6])
        out.append(f"{i}. [{r['world']} · {r['source']} · {r['split']} · {r['operation']}] “{r['text']}”  — context: {names or '(empty)'}")
        for q in r['requests']:
            out += render(q)
        out.append('')
    (HERE / 'audit-sample.md').write_text('\n'.join(out))


if __name__ == '__main__':
    main()
