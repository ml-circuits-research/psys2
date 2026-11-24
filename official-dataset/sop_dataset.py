#!/usr/bin/env python3
"""The reader dataset as two-column CSV files: the message text and its SOP Lang circuit (w.request of sop-knowledge-worlds).

Layout of the dataset repository (sibling checkout `webmeet-dataset/`, or $WEBMEET_DATASET):

    <tab>/<source>.csv        columns: text, sop          (tab: drawing, diagram, document, calendar, avatar)

The `sop` cell is the circuit of the message, one wire per line:

    @prev w.request.previous text="..."                           the previous message
    @r1 w.request.request act=place mood=do words="move the house left" predicate=move      (words: when not the whole text)
    @r1.t w.request.target request=$r1 family=drawn mode=existing determiner=definite fill=description sort=house
    @r1.c1 w.request.constraint request=$r1 on=place attribute=drawn.relation value=left_of words=left operator=relation phase=result
    @r1.u1 w.request.unread request=$r1 text="on the end" note=point.position value=end      a meaning with no reader key yet

`act` is a k.actions act (checked by name). The reader's finer acts are written as the k.actions act whose verb of the
same name k.actions has, with `mode` naming the finer act (ACTS below); answer and select are k.actions' ask and pick.

Only what the message says is written: no objects of the page (the text's own words about an object are on the target),
no goes_to (the tab is the folder), no key repeating another; the previous message is kept, it is text. The rules and the checker are in webmeet-dataset (README.md, tools/check.mjs).

Usage:
    python3 official-dataset/sop_dataset.py export OUTDIR    # official-dataset JSONL -> <tab>/<source>.csv
    python3 official-dataset/sop_dataset.py check  CSVDIR    # parse the CSV back and compare with official-dataset (labels only)
    python3 official-dataset/sop_dataset.py load             # CSV -> official-dataset/{train.jsonl.gz,dev.jsonl,test.jsonl}
"""
import collections
import copy
import csv
import gzip
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DATASET = Path(os.environ.get('WEBMEET_DATASET', REPO.parent / 'webmeet-dataset'))
TABS = {'drawing': 'w.drawing', 'diagram': 'w.diagram', 'document': 'w.document', 'calendar': 'w.calendar', 'avatar': 'w.face'}
WORLD_OF = {v: k for k, v in TABS.items()}
SPLITS = [('train', 94), ('dev', 4), ('test', 2)]
PART_BYTES = 10 * 1024 * 1024
csv.field_size_limit(1 << 30)

ATOM = re.compile(r'^[A-Za-z_][A-Za-z0-9_.-]*$')
CONTEXT_FIELDS = [('kind', 'sort'), ('name', 'name'), ('id', 'code'), ('size', 'size'), ('y', 'y'), ('text', 'text')]
# `det` (a second determiner, once in the data) is written as a second `determiner` value after the first.
TARGET_FIELDS = [('type', 'family'), ('mode', 'mode'), ('determiner', 'determiner'), ('det', 'determiner'), ('fill', 'fill'), ('kind', 'sort'),
                 ('kind_span', 'sort_words'), ('name_span', 'name'), ('description_span', 'description'), ('count_span', 'count_words'),
                 ('count', 'count'), ('quantifier', 'quantifier'), ('quant', 'quantity'), ('ordinal', 'ordinal'), ('code_span', 'code_words')]
CONSTRAINT_FIELDS = [('operator', 'operator'), ('phase', 'phase'), ('character', 'character'), ('step', 'step'), ('unit', 'unit'),
                     ('measure', 'measure'), ('measure_span', 'measure_words'), ('scope', 'scope'), ('open_value', 'open_value')]
DEFAULTS = {'polarity': 'positive', 'character': 'requirement'}
# The reader's act -> (k.actions act, mode). Each k.actions act is the one its verb of the same name means in k.actions
# (verbs-*.sop: arrange... align/line up -> place, merge -> group, ungroup/split/disconnect -> take apart, reverse/set ->
# change, repeat -> copy, select -> pick, tell/answer -> ask). Acts not listed are k.actions acts as they are.
ACTS = {'answer': ('ask', None), 'select': ('pick', None), 'arrange': ('place', 'arrange'), 'merge': ('group', 'merge'),
        'ungroup': ('take apart', 'ungroup'), 'split': ('take apart', 'split'), 'disconnect': ('take apart', 'disconnect'),
        'reverse': ('change', 'reverse'), 'set': ('change', 'set'), 'repeat': ('copy', 'repeat')}
ACT_BACK = {v: k for k, v in ACTS.items()}
DATETIME = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$')


# ---------------------------------------------------------------- values

def fmt(v):
    if isinstance(v, str) and DATETIME.match(v):
        return v  # a date and time is a bare token (kind=time.datetime)
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v)
    return s if ATOM.match(s) and s not in ('true', 'false') else json.dumps(s, ensure_ascii=False)


def slots(pairs):
    return ' '.join(f'{k}={fmt(v)}' if not (isinstance(v, str) and v.startswith('$')) else f'{k}={v}' for k, v in pairs)


def on_of(c):
    key, op = c['key'], c['operator']
    if op == 'relation':
        return 'place'
    if key.endswith(('.count', '.n')):
        return 'count'
    if op in ('degree', 'delta') and key.split('.', 1)[-1] in ('size', 'scale', 'width', 'height', 'length'):
        return 'size'
    return 'attribute'


def measure(m):
    # an amount is a number (kind=number); the labels keep it as digits, read back with str()
    n = int(m) if re.fullmatch(r'-?\d+', m) else float(m)
    assert str(n) == m, m
    return n


# ---------------------------------------------------------------- grounding (what the message itself says)

def says(phrase, text, case=False):
    """`phrase` occurs in `text` as whole words (a plural -s/-es of the last word counts)."""
    if not phrase or not text:
        return False
    flags = 0 if case else re.I
    return re.search(r'(?<![\w])' + re.escape(phrase) + r'(?:e?s)?(?![\w])', text, flags) is not None


def names(e, phrase, text):
    """A context object is named by `phrase` when its name, its code or its kind occurs in it as whole words, and the
    message itself says that word (a span cut inside a misspelt word does not name it)."""
    return any(says(x, phrase) and says(x, text) for x in (e.get('name'), e.get('id'), e.get('kind')) if x and len(str(x)) > 1)


def links(r):
    """The objects of the page the message names, linked to the wires that name them: a target that is not new and whose
    words (name, description, kind words, code words, or its kind when the text says it) name the object, and a
    constraint whose words name it. Objects no wire names are left out: the circuit holds only what the text says."""
    existing = r['context']['existing']
    target_things, constraint_things = [], []
    for q in r['requests']:
        t = q.get('target') or {}
        phrases = [t.get(k) for k in ('name_span', 'description_span', 'kind_span', 'code_span') if t.get(k)]
        if t.get('kind') and says(t['kind'], q['span']):
            phrases.append(t['kind'])
        target_things.append([i for i, e in enumerate(existing) if t.get('mode') != 'new' and any(names(e, p, r['text']) for p in phrases)])
        constraint_things.append([[i for i, e in enumerate(existing) if names(e, c['value_span'], r['text'])] for c in q.get('constraints') or []])
    # No object of the page is written: whatever the text says of an object is already on the target or constraint
    # (its kind, name, code words), and anything more (another name, an id, a size) is a page state the text does not
    # give. Each example stands alone; the links are kept empty.
    return [], [[] for _ in target_things], [[[] for _ in xs] for xs in constraint_things]


def normalized(r):
    """The row as the CSV keeps it: no objects of the page; a target's kind words equal to its kind are kept
    exactly when the request's words say the kind."""
    r = copy.deepcopy(r)
    kept, _, _ = links(r)
    r['context']['existing'] = [r['context']['existing'][i] for i in kept]
    for q in r['requests']:
        t = q.get('target') or {}
        if t.get('ids'):  # an id the text does not say is a page state, not the message
            t['ids'] = [x for x in t['ids'] if x in r['text']]
            if not t['ids']:
                del t['ids']
        if t.get('kind') and t.get('kind_span') in (None, t['kind']):
            if says(t['kind'], q['span'], case=True) and t['kind'] in q['span']:
                t['kind_span'] = t['kind']
            else:
                t.pop('kind_span', None)
        if t.get('kind') and not t.get('kind_span') and not says(t['kind'], r['text']):
            del t['kind']  # a kind the text does not say
        for c in q.get('constraints') or []:  # a value that is a phrase the text does not say: the words stay
            if invented(c.get('value'), r['text']) or (isinstance(c.get('value'), list) and any(invented(x, r['text']) for x in c['value'])):
                del c['value']
        for nd in q.get('needs') or []:
            v = nd.get('value')
            if isinstance(v, list):
                v = [x for x in v if not invented(x, r['text'])]
                nd['value'] = v if len(v) > 1 else v[0] if v else None
            elif invented(v, r['text']):
                nd['value'] = None
            if nd.get('value') is None:
                nd.pop('value', None)
        add_key_words(q, r['text'])
        where = needs_lookup(q, r['context'].get('previous'))
        answers = [lk for lk in (q.pop('lookup', None) or []) if lk['key'] == 'answer']
        lookups = ([{'key': 'thing', 'from': where}] if where else []) + answers
        if lookups:
            q['lookup'] = lookups
    r['filler'] = coverage(r)[0]
    return r


# ---------------------------------------------------------------- evidence, filler and lookups

KNOWLEDGE = Path(os.environ.get('SOP_KNOWLEDGE', REPO.parent / 'sop-knowledge-worlds'))
TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:['’][A-Za-z]+)?")
GRAMMAR_CLOSED = {'determiner', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'adverb'}
FILLER_SKIP = {'politeness', 'filler', 'desire'}
_LEXICON = None


def lexicon():
    """Grammar words (expressed by the structure: determiners, pronouns, prepositions, auxiliaries ...) and filler words
    (politeness, hedges, wishes, interjections), from w.lang.en of sop-knowledge-worlds (w.lang.en.closed and
    w.lang.en.skip). Every other word of a message is content and must be the evidence of a wire."""
    global _LEXICON
    if _LEXICON is None:  # (grammar, filler, contraction endings)
        grammar, filler = set(), set()
        val = r'("(?:[^"\\]|\\.)*"|\S+)'
        for path in sorted((KNOWLEDGE / 'docs' / 'worlds' / 'w.lang.en' / 'shards').glob('*.sop')):
            for line in path.read_text().splitlines():
                parts = line.split(' ', 2)
                if len(parts) == 3 and parts[1] == 'w.lang.en.imperative.lead':  # words dropped before the verb
                    grammar.update(t.lower() for t in re.findall(r'\btext=(\S+)', line))
                    continue
                if len(parts) < 3 or parts[1] not in ('w.lang.en.closed', 'w.lang.en.skip'):
                    continue
                cls = re.search(r'\bclass=(\S+)', line).group(1)
                texts = [json.loads(t) if t.startswith('"') else t for t in re.findall(r'\btext=' + val, line)]
                into = (filler if (parts[1] == 'w.lang.en.skip' and cls in FILLER_SKIP) or cls == 'interjection'
                        else grammar if (parts[1] == 'w.lang.en.closed' and cls in GRAMMAR_CLOSED) or parts[1] == 'w.lang.en.skip' else None)
                if into is not None:
                    into.update(t.lower() for t in texts)
        if not grammar:
            raise SystemExit(f'w.lang.en not found under {KNOWLEDGE} (set SOP_KNOWLEDGE)')
        # a contraction is a grammar word when its expansion is (w.lang.en.contraction; else word + ending of
        # w.lang.en.contraction.ending: I'd = I + 'd, that'll = that + 'll)
        endings = set()
        for path in sorted((KNOWLEDGE / 'docs' / 'worlds' / 'w.lang.en' / 'shards').glob('*.sop')):
            for line in path.read_text().splitlines():
                parts = line.split(' ', 2)
                if len(parts) == 3 and parts[1] == 'w.lang.en.contraction':
                    t, e = re.search(r'\btext=("[^"]*"|\S+)', line).group(1), re.search(r'\bexpands=("[^"]*"|\S+)', line).group(1)
                    t, e = (json.loads(x) if x.startswith('"') else x for x in (t, e))
                    if all(w.lower() in grammar for w in e.split()):
                        grammar.add(t.lower())
                elif len(parts) == 3 and parts[1] == 'w.lang.en.contraction.ending':
                    endings.add(json.loads(re.search(r'\bending=("[^"]*"|\S+)', line).group(1)).lower())
        _LEXICON = grammar, filler, endings
    return _LEXICON


def evidence(q, text):
    """The phrases of the text a request's wires were read from."""
    t = q.get('target') or {}
    out = [q.get('trigger')] + q.get('asked_words', []) + t.get('name_words', []) + [t.get(k) for k in ('kind_span', 'name_span', 'description_span', 'count_span', 'code_span')]
    out += t.get('ids', []) + t.get('family_words', []) + ([t['kind']] if t.get('kind') and says(t['kind'], text) else [])
    for c in q.get('constraints') or []:
        out += [c.get('value_span'), c.get('measure_span')] + c.get('key_words', []) + ([str(c['value'])] if isinstance(c.get('value'), (str, int)) and not isinstance(c.get('value'), bool) else [])
    out += [nd.get('span') for nd in q.get('needs') or []]
    out += [lk.get('words') for lk in q.get('lookup') or []]
    return [x for x in out if x]


def coverage(r):
    """(filler phrases, uncovered content words) of a row: each word of the text is evidence of a wire, a grammar word,
    or filler; filler runs (starting and ending with a filler word) become w.request.filler wires."""
    grammar, filler, endings = lexicon()
    text = r['text']
    covered = [False] * len(text)
    spans = []
    for q in r['requests']:
        i = text.find(q['span'])
        spans.append((i, i + len(q['span'])) if i >= 0 else (0, len(text)))
    for q in r['requests']:
        for ph in evidence(q, text):
            for m in re.finditer(r'(?<![\w])' + re.escape(str(ph)) + r'(?![\w])', text, re.I):
                covered[m.start():m.end()] = [True] * (m.end() - m.start())
    for ph in sorted((f for f in filler if ' ' in f), key=len, reverse=True):  # multi-word filler ("thank you")
        for m in re.finditer(r'(?<![\w])' + re.escape(ph) + r'(?![\w])', text, re.I):
            if not any(covered[m.start():m.end()]):
                covered[m.start():m.end()] = [None] * (m.end() - m.start())
    tokens = []
    for m in TOKEN_RE.finditer(text):
        w = m.group(0).lower()
        state = covered[m.start()]
        base, _, end = w.replace('’', "'").partition("'")
        is_grammar = w in grammar or (end and base in grammar and "'" + end in endings)
        outside = not any(a <= m.start() < b for a, b in spans)  # words no request covers: said around the request
        kind = ('covered' if state is True else 'filler' if state is None or w in filler else 'grammar' if is_grammar
                else 'filler' if outside else 'content')
        zone = next((k for k, (a, b) in enumerate(spans) if a <= m.start() < b), -1)
        tokens.append((m.start(), m.end(), kind, m.group(0), zone))
    runs, cur = [], []
    for tok in tokens + [(0, 0, 'end', '', None)]:
        if cur and tok[4] != cur[-1][4]:  # a filler run stays inside one request's words, or outside every request
            while cur and cur[-1][2] != 'filler':
                cur.pop()
            if cur:
                runs.append(text[cur[0][0]:cur[-1][1]])
            cur = []
        if tok[2] in ('filler', 'grammar') and (cur or tok[2] == 'filler'):
            cur.append(tok)
            continue
        while cur and cur[-1][2] != 'filler':
            cur.pop()
        if cur:
            runs.append(text[cur[0][0]:cur[-1][1]])
        cur = [tok] if tok[2] == 'filler' else []
    return runs, [t[3] for t in tokens if t[2] == 'content']


_KEY_WORDS = None


def key_words_of(segment):
    """The words the knowledge worlds give for a key named `segment` (core.word facts of every words.sop whose `means` is
    a slot of that name that is not an id slot: w.diagram.node.label -> label, text, says, called; k.colours.colour ->
    colour, color, coloured)."""
    global _KEY_WORDS
    if _KEY_WORDS is None:
        idslots, _KEY_WORDS = set(), collections.defaultdict(set)
        worlds = KNOWLEDGE / 'docs' / 'worlds'
        for path in worlds.glob('*/schema.sop'):
            for line in path.read_text().splitlines():
                if ' core.slot ' in line and re.search(r'\bid=true\b', line):
                    idslots.add(line.split(' ', 1)[0][1:])
        for path in worlds.glob('*/shards/words.sop'):
            for line in path.read_text().splitlines():
                m = re.search(r'\bmeans=(\S+)', line) if ' core.word ' in line else None
                if not m or m.group(1) in idslots:
                    continue
                for t in re.findall(r'\btext=("(?:[^"\\]|\\.)*"|\S+)', line):
                    _KEY_WORDS[m.group(1).rsplit('.', 1)[-1]].add((json.loads(t) if t.startswith('"') else t).lower())
    return _KEY_WORDS.get(segment, set())


def name_words(name):
    """The words of a key or family name: drawn.fontSize -> font, size; chart.show_values -> show, values; colour also
    spelt color."""
    words = set(key_words_of(name.rsplit('.', 1)[-1]))
    for part in re.split(r'[._]', name):
        for w in re.findall(r'[A-Z]?[a-z]+', part):
            words.add(w.lower())
    return words | ({'color'} if 'colour' in words else set()) | ({'colour'} if 'color' in words else set())


def found_in(span, candidates, held, grammar):
    out = []
    for w in sorted(candidates, key=lambda x: (-len(x), x)):
        if len(w) > 2 and w not in held and w not in grammar:
            m = re.search(r'(?<![\w])' + re.escape(w) + r'(?:e?s|e?d|led|ing|ling)?(?![\w])', span, re.I)  # inflected: labelled, colours
            if m and not any(m.group(0).lower() in x.lower() for x in out):
                out.append(m.group(0))
    return out


def add_key_words(q, text):
    """A constraint's key_words and a target's family_words: the words of the request that name them (whole words, a
    plural counts), when no other evidence of the request already holds them."""
    span = q['span']
    grammar = lexicon()[0]
    held = ' '.join(str(x) for x in evidence(q, text)).lower()
    for c in q.get('constraints') or []:
        found = found_in(span, name_words(c['key'].split('.', 1)[-1]), held, grammar)
        if found:
            c['key_words'] = found
            held += ' ' + ' '.join(found).lower()
    t = q.get('target') or {}
    if t.get('type') and not t.get('kind'):
        found = found_in(span, name_words(t['type']), held, grammar)
        if found:
            t['family_words'] = found
            held += ' ' + ' '.join(found).lower()
    if t.get('name_span'):  # the words that introduce the name: "called", "labelled", "titled"
        found = found_in(span, key_words_of('label') | key_words_of('title') | key_words_of('name'), held + ' ' + t['name_span'].lower(), grammar)
        if found:
            t['name_words'] = found
            held += ' ' + ' '.join(found).lower()
    asked = (q.get('question') or {}).get('asked_key')
    if asked:
        found = found_in(span, name_words(asked.split('.', 1)[-1]), held, grammar)
        if found:
            q['asked_words'] = found


def needs_lookup(q, previous):
    """An existing target the message does not identify (no name, description, kind, code, count words or ids it says):
    which thing it is must be looked up, in the previous turn when there is one, else on the page."""
    t = q.get('target') or {}
    if t.get('mode') == 'new' or t.get('fill') == 'all':
        return None
    if any(t.get(k) for k in ('name_span', 'description_span', 'kind_span', 'code_span', 'count_span', 'ids')):
        return None
    return 'previous' if previous else 'page'


def invented(v, text):
    """A value that is a phrase (not a closed-bank atom, not a number) and that the text does not say."""
    return isinstance(v, str) and not ATOM.match(v) and not re.fullmatch(r'-?\d+(\.\d+)?', v) and not DATETIME.match(v) and v not in text


# ---------------------------------------------------------------- render (row -> circuit)

def render(r):
    out = []
    kept, target_things, constraint_things = links(r)
    ref = {i: f'$o{n}' for n, i in enumerate(kept, 1)}
    for n, i in enumerate(kept, 1):
        e = r['context']['existing'][i]
        out.append(f'@o{n} w.request.context ' + slots([(b, e[a]) for a, b in CONTEXT_FIELDS if e.get(a) not in (None, '')]))
    r = normalized(r)
    for j, f in enumerate(r['filler'], 1):
        out.append(f'@f{j} w.request.filler ' + slots([('text', f)]))
    if r['context'].get('previous') is not None:
        out.append('@prev w.request.previous ' + slots([('text', r['context']['previous'])]))
    if r['context'].get('clock'):
        out.append('@clock w.request.clock ' + slots([('now', r['context']['clock']['now']), ('timezone', r['context']['clock']['timezone'])]))
    for n, q in enumerate(r['requests'], 1):
        rid = f'r{n}'
        if q['act'] not in ACTS and (q['act'], None) in ACT_BACK:
            raise ValueError(f"act {q['act']} is also the k.actions act of a finer act: the circuit would not be read back")
        act, mode = ACTS.get(q['act'], (q['act'], None))
        s = [('act', act)] + ([('mode', mode)] if mode else []) + [('mood', q['mood'])]
        if q['span'] != r['text']:  # the words of the request, when it is not the whole message
            s.append(('words', q['span']))
        if q.get('trigger'):
            s.append(('predicate', q['trigger']))
        if q.get('question'):
            s.append(('question', q['question']['ask']))
            if q['question'].get('asked_key'):
                s.append(('asked', q['question']['asked_key']))
            s += [('asked_words', x) for x in q.get('asked_words', [])]
        if q.get('spanOrigin'):
            assert q['spanOrigin'] == 'surface-hull', q['spanOrigin']
            s.append(('words_origin', 'hull'))
        out.append(f'@{rid} w.request.request ' + slots(s))
        t = q.get('target') or {}
        assert t.get('det') is None or t.get('determiner') is not None
        ts = [('request', f'${rid}')] + [(b, int(t[a]) if a == 'count' else t[a]) for a, b in TARGET_FIELDS
                                        if t.get(a) is not None and not (a == 'kind_span' and t[a] == t.get('kind'))]
        ts += [('ids', x) for x in t.get('ids', [])] + [('family_words', x) for x in t.get('family_words', [])] + [('name_words', x) for x in t.get('name_words', [])]
        out.append(f'@{rid}.t w.request.target ' + slots(ts))
        for j, lk in enumerate(q.get('lookup') or [], 1):
            ls = [('request', f'${rid}'), ('key', lk['key']), ('from', lk['from'])]
            if lk['key'] == 'answer':
                if 'antecedent' in lk:
                    ls.append(('antecedent', f"$r{lk['antecedent'] + 1}"))
                ls.append(('words', lk['words']))
            else:
                ls.insert(1, ('target', f'${rid}.t'))
            out.append(f'@{rid}.l{j} w.request.lookup ' + slots(ls))
        for j, c in enumerate(q.get('constraints') or [], 1):
            cs = [('request', f'${rid}'), ('on', on_of(c)), ('attribute', c['key'])]
            v = c.get('value')
            if isinstance(v, list):
                cs += [('value', x) for x in v]
            elif 'value' in c:
                cs.append(('value', v))
            if not (isinstance(v, (str, int)) and not isinstance(v, bool) and 'value' in c and str(v) == c['value_span']):
                cs.append(('words', c['value_span']))  # the words, when they are not the value itself
            if c['polarity'] != 'positive':
                cs.append(('want', 'no') if c['polarity'] == 'negative' else ('polarity', c['polarity']))
            cs += [(b, measure(c[a]) if a == 'measure' else c[a]) for a, b in CONSTRAINT_FIELDS if a in c and c[a] != DEFAULTS.get(a)]
            cs += [('key_words', x) for x in c.get('key_words', [])]
            out.append(f'@{rid}.c{j} w.request.constraint ' + slots(cs))
        for j, nd in enumerate(q.get('needs') or [], 1):
            ns = [('request', f'${rid}'), ('text', nd['span']), ('note', nd['frame'])]
            v = nd.get('value')
            ns += [('value', x) for x in v] if isinstance(v, list) else [('value', v)] if v is not None else []
            out.append(f'@{rid}.u{j} w.request.unread ' + slots(ns))
    return '\n'.join(out)


# ---------------------------------------------------------------- parse (circuit -> row)

TOKEN = re.compile(r'\s*([A-Za-z_][A-Za-z0-9_.-]*)=("(?:[^"\\]|\\.)*"|\S+)')


def parse_value(raw):
    if raw.startswith('"'):
        return json.loads(raw)
    if raw in ('true', 'false'):
        return raw == 'true'
    if re.fullmatch(r'-?\d+', raw):
        return int(raw)
    if re.fullmatch(r'-?\d+\.\d*(e-?\d+)?|-?\d+e-?\d+', raw):
        return float(raw)
    return raw


def parse_wires(text):
    wires = []
    for line in text.split('\n'):
        line = line.removesuffix('\r')
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        head, _, rest = line.partition(' ')
        typ, _, rest = rest.partition(' ')
        attrs = []
        pos = 0
        while pos < len(rest):
            m = TOKEN.match(rest, pos)
            if not m:
                raise ValueError(f'cannot read {rest[pos:]!r} in {line!r}')
            attrs.append((m.group(1), m.group(2) if m.group(2).startswith('$') else parse_value(m.group(2))))
            pos = m.end()
        wires.append((head[1:], typ, attrs))
    return wires


def parse(text, sop, tab):
    context = {'existing': [], 'previous': None}
    requests, world, filler = {}, None, []
    back_c = {b: a for a, b in CONTEXT_FIELDS}
    back_t = {b: a for a, b in TARGET_FIELDS}
    back_k = {b: a for a, b in CONSTRAINT_FIELDS}
    wires = parse_wires(sop)
    request_positions = {wid: i for i, wid in enumerate(wid for wid, typ, _ in wires if typ == 'w.request.request')}
    for wid, typ, attrs in wires:
        d = collections.defaultdict(list)
        for k, v in attrs:
            d[k].append(v)
        one = {k: v[0] for k, v in d.items()}
        if typ == 'w.request.context':
            context['existing'].append({back_c[k]: str(v) for k, v in one.items() if k != 'thing'})
        elif typ == 'w.request.previous':
            context['previous'] = one['text']
        elif typ == 'w.request.clock':
            context['clock'] = {'now': one['now'], 'timezone': one['timezone']}
        elif typ == 'w.request.request':
            q = {'span': one.get('words', text)}
            if 'predicate' in one:
                q['trigger'] = str(one['predicate'])
            q['act'], q['mood'] = ACT_BACK.get((one['act'], one.get('mode')), one['act']), one['mood']
            q['target'], q['constraints'] = {}, []
            if 'question' in one:
                q['question'] = {'ask': one['question'], **({'asked_key': one['asked']} if 'asked' in one else {})}
            if 'asked_words' in d:
                q['asked_words'] = [str(x) for x in d['asked_words']]
            if 'words_origin' in one:
                q['spanOrigin'] = {'hull': 'surface-hull'}[one['words_origin']]
            requests[wid] = q
        elif typ == 'w.request.target':
            q = requests[one['request'][1:]]
            for k, v in one.items():
                if k in ('request', 'thing'):
                    continue
                if k in ('ids', 'family_words', 'name_words'):
                    q['target'][k] = [str(x) for x in d[k]]
                elif k == 'determiner':
                    q['target']['determiner'] = str(v)
                    if len(d['determiner']) > 1:
                        q['target']['det'] = str(d['determiner'][1])
                else:
                    q['target'][back_t[k]] = v if k in ('count', 'ordinal') else str(v)
        elif typ == 'w.request.constraint':
            q = requests[one['request'][1:]]
            c = {'key': one['attribute']}
            if 'key_words' in d:
                c['key_words'] = [str(x) for x in d['key_words']]
            if 'value' in d:
                c['value'] = d['value'] if len(d['value']) > 1 or one.get('value_list') else d['value'][0]
            c['value_span'] = str(one['words']) if 'words' in one else str(c['value'])
            c['polarity'] = 'negative' if one.get('want') == 'no' else one.get('polarity', 'positive')
            for k, v in one.items():
                if k in back_k and k != 'thing':
                    c[back_k[k]] = v if k == 'open_value' else str(v)  # measure: a number, kept as digits
            for a, dv in DEFAULTS.items():
                c.setdefault(a, dv)
            q['constraints'].append(c)
        elif typ == 'w.request.unread':
            q = requests[one['request'][1:]]
            v = d.get('value', [])
            nd = {'frame': one['note'], 'span': str(one['text'])}
            if v:
                nd['value'] = v if len(v) > 1 else v[0]
            q.setdefault('needs', []).append(nd)
        elif typ == 'w.request.lookup':
            lookup = {'key': one['key'], 'from': one.get('from', 'any')}
            if 'words' in one:
                lookup['words'] = str(one['words'])
            if 'antecedent' in one:
                lookup['antecedent'] = request_positions[one['antecedent'][1:]]
            requests[one['request'][1:]].setdefault('lookup', []).append(lookup)
        elif typ == 'w.request.filler':
            filler.append(str(one['text']))
    for q in requests.values():  # kind words left out: the kind itself, when the request's words say it
        t = q['target']
        if t.get('kind') and 'kind_span' not in t and says(t['kind'], q['span'], case=True) and t['kind'] in q['span']:
            t['kind_span'] = t['kind']
    return {'text': text, 'context': context, 'requests': list(requests.values()), 'filler': filler}, tab


# ---------------------------------------------------------------- the trainer's files (official-dataset/*.jsonl)

SPLIT_FILES = {'train': 'train.jsonl.gz', 'dev': 'dev.jsonl', 'test': 'test.jsonl'}


def sha(data):
    return hashlib.sha256(data.encode()).hexdigest()

def read_official(folder=HERE):
    rows = []
    for split, name in SPLIT_FILES.items():
        path = folder / name
        with (gzip.open(path, 'rt') if name.endswith('.gz') else open(path)) as s:
            rows += [json.loads(line) for line in s if line.strip()]
    return rows

def previous_message_copies(rows):
    """A quarter of the single-turn rows also appear with an unrelated previous message of the same tab and split (labels
    unchanged), so the reader does not copy heads from the previous turn (the rule of the former build.py)."""
    extra = []
    for split in SPLIT_FILES:
        split_rows = [r for r in rows if r['split'] == split]
        pool = collections.defaultdict(list)
        for r in split_rows:
            pool[r['world']].append(r['text'])
        for r in split_rows:
            if r['source'] == 'demo-tool-profile' or r['context'].get('previous') is not None or not r['requests']:
                continue
            if any((q.get('target') or {}).get('fill') in ('journal_step', 'context', 'previous_reply') for q in r['requests']):
                continue
            if any(lk['key'] == 'answer' and lk['from'] == 'previous'
                   for q in r['requests'] for lk in q.get('lookup', [])):
                continue
            if int(sha('prev:' + r['id']), 16) % 4:
                continue
            texts = pool[r['world']]
            prev = texts[int(sha('pick:' + r['id']), 16) % len(texts)]
            if prev == r['text']:
                continue
            c = copy.deepcopy(r)
            c['id'] += ':with-previous'
            c['context']['previous'] = prev
            c['augmentation'] = 'previous-message-invariance'
            extra.append(c)
    return extra

def write_official(rows, out=HERE):
    for split, name in SPLIT_FILES.items():
        text = ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows if r['split'] == split)
        if name.endswith('.gz'):
            with open(out / name, 'wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as z:
                z.write(text.encode())
        else:
            (out / name).write_text(text)


# ---------------------------------------------------------------- export / load

def source_file(source):
    return re.sub(r'-v\d+$', '', source).replace('human-adapted-v1-', 'human-adapted-') + '.csv'


def export(rows, out):
    files = collections.defaultdict(list)
    for r in rows:
        if r.get('augmentation'):
            continue
        files[(r['world'], r['source'])].append({'text': r['text'], 'sop': render(r)})
    for (tab, source), data in sorted(files.items()):
        (out / tab).mkdir(parents=True, exist_ok=True)
        # GitHub refuses files over 100 MB: a large source is written in parts <name>.1.csv, <name>.2.csv (one source).
        chunks, size = [[]], 0
        for d in data:
            n = len((d['text'] + d['sop']).encode()) + 8
            if chunks[-1] and size + n > PART_BYTES:
                chunks.append([]); size = 0
            chunks[-1].append(d); size += n
        for k, chunk in enumerate(chunks):
            name = source_file(source) if len(chunks) == 1 else source_file(source)[:-4] + f'.{k + 1}.csv'
            with open(out / tab / name, 'w', newline='', encoding='utf-8') as s:
                w = csv.DictWriter(s, fieldnames=['text', 'sop'], lineterminator='\n')
                w.writeheader()
                w.writerows(chunk)
            print(f'{tab}/{name}: {len(chunk)}')


def read_dataset(folder=DATASET):
    for tab in TABS:
        for path in sorted((folder / tab).glob('*.csv')) if (folder / tab).is_dir() else []:
            with open(path, newline='', encoding='utf-8') as s:
                for i, o in enumerate(csv.DictReader(s), 1):
                    yield tab, path.stem.split('.')[0], i, o  # data-drop.2.csv is part 2 of the source data-drop


def load(folder=DATASET):
    """CSV -> the trainer's rows: id from source and text, split drawn from the id (94/4/2), previous-message copies."""
    rows = []
    for tab, source, i, o in read_dataset(folder):
        row, _ = parse(o['text'], o['sop'], tab)
        rid = f'{source}:{hashlib.sha256((o["text"] + chr(0) + o["sop"]).encode()).hexdigest()[:16]}'
        bucket = int(hashlib.sha256(('split:' + rid).encode()).hexdigest(), 16) % 100
        split = 'train' if bucket < 94 else 'dev' if bucket < 98 else 'test'
        rows.append({'id': rid, 'split': split, 'world': tab, **row, 'family': rid, 'source': source, 'source_id': str(i),
                     'operation': None, 'style': '', 'phase': None})
    return rows + previous_message_copies(rows)


def comparable(r):
    r = {'text': r['text'], 'context': copy.deepcopy(r['context']), 'requests': copy.deepcopy(r['requests']), 'filler': r.get('filler', [])}
    r['context'].setdefault('previous', None)
    for e in r['context']['existing']:
        if e.get('name') == '':
            del e['name']
    for q in r['requests']:
        if q.get('trigger') is None:
            q.pop('trigger', None)
        q['target'] = {k: v for k, v in (q.get('target') or {}).items() if v is not None}
        if isinstance(q['target'].get('count'), str) and q['target']['count'].isdigit():
            q['target']['count'] = int(q['target']['count'])
    return json.dumps(r, sort_keys=True, ensure_ascii=False)


def check(folder):
    want = collections.Counter(comparable(normalized(r)) for r in read_official() if not r.get('augmentation'))
    got = collections.Counter()
    for tab, source, i, o in read_dataset(folder):
        row, world = parse(o['text'], o['sop'], tab)
        got[comparable(row)] += 1
    missing, extra = want - got, got - want
    print(f'official rows {sum(want.values())}, read {sum(got.values())}, missing {sum(missing.values())}, extra {sum(extra.values())}')
    for k in list(missing)[:2] + list(extra)[:2]:
        print('  ', k[:700])
    return not missing and not extra


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'load'
    if cmd == 'export':
        export(read_official(), Path(sys.argv[2]))
    elif cmd == 'check':
        sys.exit(0 if check(Path(sys.argv[2]) if len(sys.argv) > 2 else DATASET) else 1)
    else:
        rows = load()
        write_official(rows)
        print(f'{len(rows)} rows written to {HERE}')
