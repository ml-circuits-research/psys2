"""Core of the ui-diagram-v2 generator: inline span markup, scenes with observed codes, robustness noise and row assembly.

Markup (inside one message template):
  <<...>>                 one request span (only needed when a message holds more than one request)
  [t:words]               trigger: the words that carry the act
  [k:words|lemma]         target kind span (lemma optional: derived from KIND_LEMMA)
  [n:words|value]         a written reference (label or visible code); first one is the target name_span, every one is a
                          selector constraint of the operation's selector key (value defaults to the words)
  [d:words]               description span of a population target ("all elements", "everything")
  [q:words]               count span of the target ("three")
  [p:words]               plain words that carry no label but must keep their spelling ("much" before "bigger")
  [c:key|words|value|opts] constraint; value '' = derived (bank value equal to the words, number in the words or the words),
                          '?' = qualitative, '-' = mention without value; opts comma list: sel delta:<step> degree region relation
                          factor neg pref
Request attributes come from the frame (operation, ordinal, quantifier, question, explicit fill)."""
import hashlib
import json
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]


def merged_inventory():
    """The official reader inventory plus this corpus's additions (inventory.json, merged as official-dataset/build.py does)."""
    import copy
    inv = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
    for area, types in json.loads((HERE / 'inventory.json').read_text()).items():
        for typ, definition in types.items():
            target = inv.setdefault(area, {}).setdefault(typ, {'keys': {}})
            for key, field in definition['keys'].items():
                prior = target['keys'].get(key)
                result = {**(prior or {}), **copy.deepcopy(field)}
                if 'values' in field or prior and 'values' in prior:
                    result['values'] = list(dict.fromkeys([*(prior or {}).get('values', []), *field.get('values', [])]))
                target['keys'][key] = result
    return inv


INVENTORY = merged_inventory()

NUMBER_WORDS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve'.split())}
NUMBER_WORDS.update({'a pair of': 2, 'a couple of': 2, 'couple of': 2, 'a few': 3, 'both': 2, 'twice': 2, 'double': 2, 'half': 0.5, 'triple': 3})

# Operation label templates: act, mood, target type, mode, selector key, default fill for an existing target without reference.
OPS = {
    'diagram.make': ('make', 'do', 'diagram', 'new', None, None),
    'diagram.improve': ('arrange', 'do', 'diagram', 'existing', None, 'context'),
    'diagram.improve.link': ('arrange', 'do', 'link', 'existing', 'link.ids', 'context'),
    'diagram.improve.node': ('arrange', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.make': ('make', 'do', 'node', 'new', None, None),
    'diagram.node.change': ('change', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.select': ('select', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.remove': ('remove', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.place': ('place', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.resize': ('change', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.layout': ('arrange', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.link.make': ('connect', 'do', 'link', 'new', None, None),
    'diagram.link.select': ('select', 'do', 'link', 'existing', 'link.ids', 'context'),
    'diagram.link.change': ('change', 'do', 'link', 'existing', 'link.ids', 'context'),
    'diagram.link.remove': ('remove', 'do', 'link', 'existing', 'link.ids', 'context'),
    'diagram.selection.remove': ('remove', 'do', 'sketch', 'existing', None, 'context'),
    'diagram.page.clear': ('remove', 'do', 'sketch', 'existing', None, 'all'),
    'diagram.ids.show': ('change', 'do', 'page', 'existing', None, 'context'),
    'diagram.observe': ('answer', 'ask', 'sketch', 'existing', None, 'context'),
    'diagram.observe.node': ('answer', 'ask', 'node', 'existing', 'node.ids', 'context'),
    'diagram.observe.link': ('answer', 'ask', 'link', 'existing', 'link.ids', 'context'),
    'diagram.check.node': ('answer', 'check', 'node', 'existing', 'node.ids', 'context'),
    'diagram.check.link': ('answer', 'check', 'link', 'existing', 'link.ids', 'context'),
    'diagram.check': ('answer', 'check', 'sketch', 'existing', None, 'context'),
    'diagram.undo': ('undo', 'do', 'sketch', 'existing', None, 'journal_step'),
    'diagram.redo': ('redo', 'do', 'sketch', 'existing', None, 'journal_step'),
    'diagram.group.make': ('group', 'do', 'group', 'new', None, None),
    'diagram.group.select': ('select', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.change': ('change', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.layout': ('arrange', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.resize': ('change', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.place': ('place', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.remove': ('remove', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.ungroup': ('ungroup', 'do', 'group', 'existing', 'group.id', 'context'),
    'diagram.group.chart.make': ('make', 'do', 'group', 'new', None, None),
    'diagram.group.chart.adopt': ('make', 'do', 'group', 'new', None, None),
    'diagram.group.chart': ('make', 'do', 'chart', 'new', None, None),
    'diagram.chart.make': ('make', 'do', 'chart', 'new', None, None),
    'diagram.chart.change': ('change', 'do', 'chart', 'existing', 'chart.id', 'context'),
    'diagram.chart.sort': ('arrange', 'do', 'chart', 'existing', 'chart.id', 'context'),
    'diagram.chart.ask': ('answer', 'ask', 'chart', 'existing', 'chart.id', 'context'),
    'diagram.point.make': ('make', 'do', 'point', 'new', None, None),
    'diagram.point.change': ('change', 'do', 'point', 'existing', 'chart.labels', 'context'),
    'diagram.point.remove': ('remove', 'do', 'point', 'existing', 'chart.labels', 'context'),
    'diagram.series.make': ('make', 'do', 'series', 'new', None, None),
    'diagram.series.change': ('change', 'do', 'series', 'existing', 'series.label', 'context'),
    'diagram.series.remove': ('remove', 'do', 'series', 'existing', 'series.label', 'context'),
    'diagram.style.apply': ('change', 'do', 'diagram', 'existing', None, 'context'),
    'diagram.style.nodes': ('change', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.colour.by': ('change', 'do', 'diagram', 'existing', None, 'context'),
    'diagram.layout': ('arrange', 'do', 'diagram', 'existing', None, 'context'),
    'diagram.nodes.align': ('arrange', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.nodes.distribute': ('arrange', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.steps.number': ('change', 'do', 'diagram', 'existing', None, 'context'),
    'diagram.links.connect': ('connect', 'do', 'node', 'existing', 'node.ids', 'context'),  # a population of existing nodes joined (specs/diagram-reading-analysis.md)
    'diagram.link.reverse': ('reverse', 'do', 'link', 'existing', 'link.ids', 'context'),
    'diagram.node.duplicate': ('copy', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.insert': ('make', 'do', 'node', 'new', None, None),
    'diagram.node.merge': ('merge', 'do', 'node', 'existing', 'node.ids', 'context'),
    'diagram.node.split': ('split', 'do', 'node', 'existing', 'node.ids', 'context'),
}

KIND_LEMMA = {
    'circle': 'circle', 'circles': 'circle', 'round node': 'circle', 'round nodes': 'circle', 'round shape': 'circle', 'bubble': 'circle', 'bubbles': 'circle',
    'rectangle': 'rectangle', 'rectangles': 'rectangle', 'rect': 'rectangle', 'box': 'box', 'boxes': 'box', 'square': 'square', 'squares': 'square',
    'diamond': 'diamond', 'diamonds': 'diamond', 'rhombus': 'diamond', 'decision': 'diamond', 'decisions': 'diamond', 'decision box': 'diamond',
    'ellipse': 'ellipse', 'ellipses': 'ellipse', 'oval': 'ellipse', 'ovals': 'ellipse', 'triangle': 'triangle', 'triangles': 'triangle',
    'hexagon': 'hexagon', 'hexagons': 'hexagon', 'star': 'star', 'stars': 'star', 'text': 'text', 'text label': 'text', 'text box': 'text',
    'label': 'text', 'node': 'node', 'nodes': 'node', 'shape': 'shape', 'shapes': 'shape', 'element': 'element', 'elements': 'element',
    'step': 'step', 'steps': 'step', 'item': 'item', 'items': 'item', 'thing': 'thing', 'things': 'thing', 'object': 'object', 'objects': 'object',
    'arrow': 'arrow', 'arrows': 'arrow', 'line': 'line', 'lines': 'line', 'link': 'link', 'links': 'link', 'connection': 'connection',
    'connections': 'connection', 'connector': 'connector', 'connectors': 'connector', 'edge': 'edge', 'edges': 'edge', 'connecting line': 'line',
    'group': 'group', 'groups': 'group', 'chart': 'chart', 'bar chart': 'chart', 'pie chart': 'chart', 'diagram': 'diagram', 'flowchart': 'flowchart',
    'flow chart': 'flowchart', 'org chart': 'org_chart', 'mind map': 'mind_map', 'tree': 'tree', 'network': 'network', 'timeline': 'timeline',
    'process diagram': 'flowchart', 'graph': 'network', 'chart diagram': 'diagram', 'state machine': 'state_machine', 'venn diagram': 'venn',
}


def spec(key):
    typ, _, name = key.partition('.')
    return INVENTORY['diagram'].get(typ, {}).get('keys', {}).get(name)


def number(surface):
    digits = re.findall(r'(?<![\w.])[-+]?\d+(?:\.\d+)?', surface)
    if len(digits) == 1:
        v = float(digits[0])
        return str(int(v)) if v.is_integer() else str(v)
    if digits:
        return None
    low = surface.lower()
    for phrase in sorted(NUMBER_WORDS, key=len, reverse=True):
        if re.search(r'\b' + re.escape(phrase) + r'\b', low):
            v = float(NUMBER_WORDS[phrase])
            return str(int(v)) if v.is_integer() else str(v)
    return None


# ------------------------------------------------------------------ scenes (observed diagram state)
LABELS = ['Start', 'End', 'Login', 'Sign up', 'Checkout', 'Payment', 'Shipping', 'Review', 'Approve', 'Reject', 'Draft', 'Publish',
          'Archive', 'Idea', 'Research', 'Design', 'Build', 'Test', 'Deploy', 'Monitor', 'Client', 'Server', 'Database', 'Cache', 'API',
          'Queue', 'Worker', 'Frontend', 'Backend', 'Auth', 'CEO', 'Sales', 'Marketing', 'Support', 'Finance', 'Input', 'Output', 'Process',
          'Retry', 'Done', 'Home', 'Settings', 'Cart', 'Order', 'Invoice', 'Stock', 'Supplier', 'Planning', 'Launch', 'Feedback', 'Error',
          'Valid?', 'Paid?', 'Customer', 'Warehouse', 'Report', 'Inbox', 'Triage', 'Fix', 'Release', 'Budget', 'Hiring', 'Onboarding']
NODE_KINDS = ['rectangle'] * 5 + ['circle'] * 4 + ['diamond'] * 2 + ['ellipse', 'square', 'triangle', 'hexagon', 'star', 'text']
GROUP_LABELS = ['Approval steps', 'Backend services', 'Team', 'Phase 1', 'Phase 2', 'Departments', 'Checkout flow', 'Data layer', 'Leadership', 'Sprint']


class Scene:
    """An observed Diagram: nodes n1.. (kind, optional label), links e1.. (from, to), groups g1.. (label, members)."""

    def __init__(self, rng, size=None, labelled=0.75, links=True, groups=True, kinds=None):
        n = size if size is not None else rng.randint(3, 8)
        labels = rng.sample(LABELS, n)
        kinds = kinds or NODE_KINDS
        self.nodes = [{'code': f'n{i + 1}', 'kind': rng.choice(kinds), 'label': labels[i] if rng.random() < labelled else None} for i in range(n)]
        self.links = []
        if links and n > 1:
            for i in range(1, n):
                if rng.random() < 0.7:
                    j = rng.randrange(0, i)
                    self.links.append({'code': f'e{len(self.links) + 1}', 'from': self.nodes[j]['code'], 'to': self.nodes[i]['code']})
        self.groups = []
        if groups and n >= 3 and rng.random() < 0.35:
            members = rng.sample([x['code'] for x in self.nodes], 2)
            self.groups.append({'code': 'g1', 'label': rng.choice(GROUP_LABELS), 'members': members})

    @staticmethod
    def empty():
        s = Scene.__new__(Scene)
        s.nodes, s.links, s.groups = [], [], []
        return s

    def node(self, code):
        return next(x for x in self.nodes if x['code'] == code)

    def name(self, code):
        x = self.node(code)
        return x['label'] or code

    def existing(self):
        """context.existing as the reader receives it: kind, visible name (label, else the visible code) and the code."""
        rows = []
        for x in self.nodes:
            rows.append({'kind': x['kind'], 'name': x['label'] or x['code'], 'id': x['code']})
        for e in self.links:
            rows.append({'kind': 'link', 'name': f'{self.name(e["from"])} to {self.name(e["to"])}', 'id': e['code']})
        for g in self.groups:
            rows.append({'kind': 'group', 'name': g['label'], 'id': g['code']})
        for c in getattr(self, 'charts', []):
            rows.append({'kind': 'chart', 'name': c['name'], 'id': c['code']})
            rows += [{'kind': 'point', 'name': x} for x in c['categories']] + [{'kind': 'series', 'name': x} for x in c['series']]
        return rows

    def kinds_unique(self):
        c = {}
        for x in self.nodes:
            c[x['kind']] = c.get(x['kind'], 0) + 1
        return [k for k, v in c.items() if v == 1]

    def kinds_plural(self):
        c = {}
        for x in self.nodes:
            c[x['kind']] = c.get(x['kind'], 0) + 1
        return [k for k, v in c.items() if v >= 2]


# ------------------------------------------------------------------ markup
TOKEN = re.compile(r'<<|>>|\[(t|k|n|d|q|c|p):([^\]]*)\]')


def parse(markup):
    """Markup -> segments (text, tag, payload, request index or None) and the number of requests."""
    segs, current, n = [], None, 0
    explicit = '<<' in markup
    pos = 0
    for m in TOKEN.finditer(markup):
        if m.start() > pos:
            segs.append((markup[pos:m.start()], None, None, current if explicit else 0))
        tok = m.group(0)
        if tok == '<<':
            current = n
            n += 1
        elif tok == '>>':
            current = None
        else:
            tag, body = m.group(1), m.group(2)
            parts = body.split('|')
            if tag == 'c':
                payload = {'key': parts[0], 'value': parts[2] if len(parts) > 2 else '', 'opts': parts[3] if len(parts) > 3 else ''}
                segs.append((parts[1], 'c', payload, current if explicit else 0))
            else:
                segs.append((parts[0], tag, {'value': parts[1] if len(parts) > 1 else ''}, current if explicit else 0))
        pos = m.end()
    if pos < len(markup):
        segs.append((markup[pos:], None, None, current if explicit else 0))
    if explicit and current is not None:
        raise ValueError('unclosed request in ' + markup)
    return segs, (n if explicit else 1)


# ------------------------------------------------------------------ robustness noise
KEYBOARD = {c: n for c, n in zip('qwertyuiopasdfghjklzxcvbnm', ['wa', 'qes', 'wrd', 'etf', 'ryg', 'tuh', 'yij', 'uok', 'ipl', 'ol', 'qsz', 'awdx',
                                                                  'sefc', 'drgv', 'fthb', 'gyjn', 'hukm', 'jilm', 'kop', 'asx', 'zsdc', 'xdfv',
                                                                  'cfgb', 'vghn', 'bhjm', 'njk'])}
ASR = {
    'add': ['ad', 'at', 'and'], 'to': ['two', 'too'], 'two': ['to', 'too'], 'four': ['for'], 'for': ['four'], 'right': ['write'],
    'red': ['read'], 'blue': ['blew'], 'node': ['note', 'no'], 'nodes': ['notes', 'nose'], 'box': ['books', 'blocks'], 'boxes': ['boxers', 'books'],
    'arrow': ['aero', 'error'], 'arrows': ['errors', 'arose'], 'line': ['lion', 'lane'], 'lines': ['lions', 'lanes'], 'circle': ['circa', 'circles'],
    'circles': ['circle', 'surgeries'], 'connect': ['connected', 'connects'], 'delete': ['the lead', 'deleted'], 'remove': ['removed'],
    'the': ['a', 'da'], 'make': ['made', 'may'], 'them': ['him', 'em'], 'each': ['itch'], 'all': ['ol', 'awl'], 'there': ['their'],
    'diagram': ['diagrams', 'die a gram'], 'label': ['level', 'table'], 'rename': ['we name', 'renamed'], 'group': ['grip', 'groups'],
    'bigger': ['big', 'figure'], 'smaller': ['small'], 'green': ['grain'], 'yellow': ['hello'], 'one': ['won'], 'eight': ['ate'],
    'layout': ['lay out', 'layer'], 'move': ['moves', 'moo'], 'select': ['selects', 'collect'], 'undo': ['and do', 'un do'], 'redo': ['re do'],
    'dashed': ['dash', 'dashes'], 'square': ['squared'], 'oval': ['over'], 'star': ['start'], 'link': ['lean', 'linked'],
}
FILLERS = ['uh', 'um', 'uhm', 'er', 'like', 'you know', 'so', 'okay', 'ok so', 'alright', 'hmm', 'well', 'I mean', 'basically', 'right']
TYPO_TAGS = {'t', 'k', 'd'}  # tagged segments whose words may carry typos; names, codes and numbers never do


def typo_word(rng, w):
    if len(w) < 3 or not w.isalpha():
        return w
    i = rng.randrange(1, len(w)) if len(w) > 3 else rng.randrange(0, len(w))
    op = rng.random()
    if op < 0.3:  # deletion
        return w[:i] + w[i + 1:]
    if op < 0.55 and i < len(w) - 1:  # transposition
        return w[:i] + w[i + 1] + w[i] + w[i + 2:]
    if op < 0.75:  # doubling
        return w[:i] + w[i] + w[i:]
    c = w[i].lower()
    if c in KEYBOARD:  # neighbour key
        return w[:i] + rng.choice(KEYBOARD[c]) + w[i + 1:]
    return w


def words_map(text, fn):
    return re.sub(r"[A-Za-z]+", lambda m: fn(m.group(0)), text)


def noise_segment(rng, text, tag, payload, mode, rate):
    if tag == 'p':  # protected words (intensifiers the label depends on) keep their characters
        return text
    if tag in ('n',):  # names and codes keep their characters; voice may lowercase labels
        return text.lower() if mode in ('asr', 'terse') and rng.random() < 0.4 and not re.search(r'\d', text) else text
    if tag == 'c':
        key = payload['key']
        if spec(key) and (spec(key).get('values') or key.endswith('colour')) and mode in ('typo', 'nospace') and not re.search(r'\d', text):
            return words_map(text, lambda w: typo_word(rng, w) if rng.random() < rate else w)
        if spec(key) and (spec(key).get('values') or key.endswith('colour')) and mode == 'asr':
            return words_map(text, lambda w: rng.choice(ASR[w.lower()]) if w.lower() in ASR and rng.random() < rate else w)
        return text
    if tag is not None and tag not in TYPO_TAGS:
        return text
    if mode in ('typo', 'nospace'):
        out = words_map(text, lambda w: typo_word(rng, w) if rng.random() < rate else w)
        if (tag is None or tag == 'd') and rng.random() < 0.3:  # a slipped word boundary: "all elements" -> "alle lements"
            ws = list(re.finditer(r'[a-z]{3,} [a-z]{3,}', out))
            if ws:
                m = rng.choice(ws)
                a, b = m.group(0).split(' ')
                out = out[:m.start()] + a + b[0] + ' ' + b[1:] + out[m.end():]
        if mode == 'nospace' and tag is None:
            inner = [m.start() for m in re.finditer(r'(?<=[a-z]) (?=[a-z])', out)]
            if inner:
                i = rng.choice(inner)
                out = out[:i] + out[i + 1:]
        return out
    if mode == 'asr':
        out = words_map(text, lambda w: rng.choice(ASR[w.lower()]) if w.lower() in ASR and rng.random() < rate else w)
        return out
    return text


CODE_ASR = [lambda c: c.upper(), lambda c: c[0] + ' ' + c[1:], lambda c: c[0].upper() + ' ' + c[1:],
            lambda c: c[0] + ' ' + ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][int(c[1:])] if c[1:].isdigit() and int(c[1:]) < 10 else c]


def apply_noise(rng, segs, mode, single):
    """segs: (text, tag, payload, req). Inserted words belong to the request when the message holds one request."""
    rate = {'typo': 0.18, 'nospace': 0.12, 'asr': 0.4}.get(mode, 0)
    edge = 0 if single else None
    out = []
    for text, tag, payload, req in segs:
        t = noise_segment(rng, text, tag, payload, mode, rate) if rate else text
        if mode == 'asr' and tag == 'n' and re.fullmatch(r'[neg]\d{1,2}', text) and rng.random() < 0.7:
            t = rng.choice(CODE_ASR)(text)
        if tag == 'n' and t != text and not payload.get('value'):
            payload = {**payload, 'value': text}  # the selector value stays the visible code / label as written on the canvas
        out.append((t, tag, payload, req))
    if mode == 'asr':  # voice transcripts: no final punctuation, mostly lower case
        if out and out[-1][1] is None:
            t, tag, p, r = out[-1]
            out[-1] = (t.rstrip('.!'), tag, p, r)
        if out and out[0][1] is None:
            t, tag, p, r = out[0]
            out[0] = (t[:1].lower() + t[1:], tag, p, r)
    if mode == 'filler':
        f = rng.choice(FILLERS)
        out.insert(0, (f + (', ' if rng.random() < 0.5 else ' '), None, None, edge))
        plain = [i for i, (t, tag, p, r) in enumerate(out) if tag is None and i > 1 and t.startswith(' ') and r is not None]
        if plain and rng.random() < 0.6:
            i = rng.choice(plain)
            t, tag, p, r = out[i]
            out[i] = (' ' + rng.choice(['uh', 'um', 'like', 'er']) + t, None, None, r)
    return out


POLITE_PRE = ['please ', 'could you ', 'can you ', 'can you please ', 'would you ', 'I want you to ', "I'd like you to ", 'hey, ',
              'hey can you ', 'okay, ', 'go ahead and ', 'kindly ']
POLITE_POST = [' please', ', thanks', ', thank you', ' pls', ' thx', ' for me', ' if you can', ', cheers']


def politeness(rng, segs, single):
    segs = list(segs)
    edge = 0 if single else None
    first = next((sg for sg in segs if sg[0].strip()), None)
    if rng.random() < 0.6 and first is not None and first[1] == 't':
        segs.insert(0, (rng.choice(POLITE_PRE), None, None, edge))
    else:
        segs.append((rng.choice(POLITE_POST), None, None, edge if single else None))
    return segs


# ------------------------------------------------------------------ assembly
class FrameError(Exception):
    pass


def constraint(key, surface, value, opts, phase='result'):
    s = spec(key)
    if s is None:
        raise FrameError(f'unregistered key diagram.{key}')
    c = {'key': key, 'value_span': surface, 'operator': 'eq', 'phase': phase, 'polarity': 'positive', 'character': 'requirement'}
    for o in [x for x in opts.split(',') if x]:
        if o == 'sel':
            c['phase'] = 'selector'
        elif o.startswith('delta'):
            c['operator'] = 'delta'
            c['step'] = o.split(':')[1] if ':' in o else 'more'
        elif o in ('degree', 'region', 'relation', 'factor'):
            c['operator'] = o
        elif o == 'neg':
            c['polarity'] = 'negative'
        elif o == 'pref':
            c['character'] = 'preference'
        elif o in ('op<', 'op>'):
            c['operator'] = 'less.equal' if o == 'op<' else 'greater.equal'
        elif o.startswith('scope:'):
            c['scope'] = o.split(':')[1]
        else:
            raise FrameError('unknown option ' + o)
    if value == '?':
        c['qualitative'] = True
    elif value == '-':
        c['mention'] = True
    elif c['operator'] == 'delta' and not value:
        pass  # comparative: step only, no value
    else:
        if not value:
            head, bank = s['head'], s.get('values')
            if bank:
                value = next((b for b in bank if b.lower() == surface.lower()), None)
                if value is None and head.startswith('number'):
                    value = number(surface)
                if value is None:
                    raise FrameError(f'{key}: {surface!r} is not a bank value; give the value')
            elif head.startswith('number'):
                value = number(surface)
                if value is None:
                    raise FrameError(f'{key}: no number in {surface!r}')
            else:
                value = surface
        if s.get('values') and value not in s['values']:
            raise FrameError(f'{key}: value {value!r} outside bank')
        c['value'] = value
    return c


def build_request(segs, offsets, text, index, attrs):
    op = attrs['op']
    act, mood, ttype, mode, sel, default_fill = OPS[op]
    ttype = attrs.get('type', ttype)
    mine = [i for i, sg in enumerate(segs) if sg[3] == index]
    if not mine:
        raise FrameError(f'request {index} has no segments')
    lo, hi = offsets[mine[0]][0], offsets[mine[-1]][1]
    raw = text[lo:hi]
    span = raw.strip(' ,;:-')
    t = {'type': ttype, 'mode': attrs.get('mode', mode), 'determiner': 'indefinite' if attrs.get('mode', mode) == 'new' else 'definite'}
    if 'determiner' in attrs:
        t['determiner'] = attrs['determiner']
    q = {'span': span}
    cons, names, kinds, descs, counts = [], [], [], [], []
    trigger = None
    for i in mine:
        s, tag, p, _ = segs[i]
        if tag == 't':
            trigger = s if trigger is None else trigger
        elif tag == 'k':
            kinds.append((s, p['value']))
        elif tag == 'n':
            names.append((s, p['value'] or s))
        elif tag == 'd':
            descs.append(s)
        elif tag == 'q':
            counts.append(s)
        elif tag == 'c':
            cons.append(constraint(p['key'], s, p['value'], p['opts']))
    selkey = attrs.get('sel', sel)
    if t['mode'] == 'existing':
        fill = attrs.get('fill')
        if names:
            fill = fill or 'written'
            t['name_span'] = names[0][0]
            if selkey and not attrs.get('nosel'):
                cons = [constraint(selkey, s, v, 'sel', 'selector') for s, v in names] + cons
        elif descs:
            fill = fill or 'all'
            t['description_span'] = descs[0]
        elif kinds:
            fill = fill or 'description'
        t['fill'] = fill or default_fill
        if descs and 'description_span' not in t:
            t['description_span'] = descs[0]
    elif names:
        raise FrameError('a written reference on a new target needs a constraint key, not [n:]')
    if kinds:
        s, lemma = kinds[0]
        t['kind'] = lemma or KIND_LEMMA.get(attrs.get('clean', {}).get(s, s).lower()) or s.lower()
        t['kind_span'] = s
    if counts:
        t['count_span'] = counts[0]
        n = attrs.get('count') or number(attrs.get('clean', {}).get(counts[0], counts[0]))
        if n:
            t['count'] = n
    for f in ('ordinal', 'quantifier'):
        if f in attrs:
            t[f] = attrs[f]
    if trigger:
        q['trigger'] = trigger
    q.update({'act': attrs.get('act', act), 'mood': attrs.get('mood', mood), 'target': t, 'constraints': cons})
    if q['act'] == 'answer':
        q['question'] = {'ask': attrs.get('q', 'describe')}
        if attrs.get('asked_key'):
            q['question']['asked_key'] = attrs['asked_key']
    return q


def assemble(segs, n_requests, attrs_list):
    text, offsets = '', []
    for s, tag, p, r in segs:
        offsets.append((len(text), len(text) + len(s)))
        text += s
    lead = len(text) - len(text.lstrip())
    text = text.strip()
    offsets = [(max(0, a - lead), max(0, b - lead)) for a, b in offsets]
    if len(attrs_list) != n_requests:
        raise FrameError(f'{n_requests} request spans but {len(attrs_list)} attribute sets')
    return text, [build_request(segs, offsets, text, i, at) for i, at in enumerate(attrs_list)]


def family(case, text):
    return f'{case}#{int(hashlib.sha256(text.encode()).hexdigest(), 16) % 4}'
