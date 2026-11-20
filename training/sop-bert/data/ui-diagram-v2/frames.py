"""Paraphrase frames of ui-diagram-v2 per case. A frame is a template whose {slots} are filled over an observed scene; slots
produce span markup (engine.py) and request attributes. '{slot@1}' sends the slot's attributes to the second request."""
import re

from engine import Scene
from vocab import (AXES, BY, DIRECTIONS, EDGES, FONT_SIZES, NEW_SHAPES, PATTERNS, ROLES, ROUTES, SPACINGS, THEMES, ARROWS, CHART_NAMES, CHART_ROWS, CHART_TYPES, COLOURS, DIAGRAM_KINDS, GENERIC, GROUP_LAYOUTS, GROUP_SIZES, KINDS, LAYOUTS,
                   LEMMA, LINK_LABELS, LINK_LEMMA, LINK_NOUNS, NEW_LABELS, NUMS, REGIONS, RELATIONS, SHAPES, SIZES, STYLES, V, article,
                   scene_with)


class Skip(Exception):
    pass


def esc(s):
    return s.replace('[', '(').replace(']', ')').replace('|', '/')


class Slots(dict):
    def __init__(self, rng, scene, n_requests):
        super().__init__()
        self.rng, self.scene = rng, scene
        self.attrs = [{} for _ in range(n_requests)]
        self.used = set()  # node codes already referenced in this message

    def __missing__(self, key):
        name, _, idx = key.partition('@')
        i = int(idx) if idx else 0
        base = re.sub(r'\d+$', '', name)
        fn = getattr(self, 's_' + base, None)
        if fn is None:
            raise KeyError(key)
        value = fn(self.attrs[i], name)
        self[key] = value
        return value

    # ---------------------------------------------------------------- helpers
    def pick(self, seq):
        return self.rng.choice(seq)

    def fresh_node(self, labelled=None):
        cands = [x for x in self.scene.nodes if x['code'] not in self.used and (labelled is None or bool(x['label']) == labelled)]
        if not cands:
            raise Skip()
        x = self.pick(cands)
        self.used.add(x['code'])
        return x

    def node_name(self, x, code_ok=True):
        """A written reference to a node: its label, or its visible code."""
        if x['label'] and (not code_ok or self.rng.random() < 0.7):
            return esc(x['label']), False
        return x['code'], True

    # ---------------------------------------------------------------- verbs and fillers
    def s_V(self, a, name):
        raise KeyError(name)

    def verb(self, cat):
        return '[t:' + self.pick(V[cat]) + ']'

    def s_add(self, a, n): return self.verb('add')
    def s_connect(self, a, n): return self.verb('connect')
    def s_delete(self, a, n): return self.verb('delete')
    def s_make(self, a, n): return self.verb('make')
    def s_paint(self, a, n): return self.verb('paint')
    def s_move(self, a, n): return self.verb('move')
    def s_select(self, a, n): return self.verb('select')
    def s_rename(self, a, n): return self.verb('rename')
    def s_arrange(self, a, n): return self.verb('arrange')
    def s_group(self, a, n): return self.verb('group')
    def s_ungroup(self, a, n): return self.verb('ungroup')
    def s_undo(self, a, n): return self.verb('undo')
    def s_redo(self, a, n): return self.verb('redo')
    def s_show(self, a, n): return self.verb('show')
    def s_hide(self, a, n): return self.verb('hide')
    def s_clear(self, a, n): return self.verb('clear')

    def s_pol(self, a, n):
        return self.pick(['please ', 'can you ', 'could you ', "let's ", 'I want to ', 'I need you to ', 'go ahead and ', 'now ', 'ok ', 'just ',
                          'would you ', 'hey, ', '', '', '', '', '', ''])

    def s_post(self, a, n):
        return self.pick(['', '', '', '', '', ' please', ' for me', ' now', ', thanks', ' quickly', ' real quick', ' thank you'])

    def s_why(self, a, n):
        return self.pick(['so it is easier to read', 'because it looks cluttered', 'for the presentation tomorrow', 'so my boss can follow it',
                          'since the team asked for it', 'to make the flow clearer', 'before I export it', 'because it is confusing right now',
                          'so the review goes smoothly', 'for the slides', 'otherwise nobody gets it', 'to keep things tidy'])

    def s_intro(self, a, n):
        return self.pick(['ok so ', 'alright, ', 'right, ', 'next, ', 'one more thing: ', 'now ', 'hmm, ', 'so ', 'and then ', 'oh and ', 'also ',
                          'quick one: ', 'for this diagram ', 'on the canvas, ', 'in the diagram, ', 'in this chart, '])

    # ---------------------------------------------------------------- new-node values
    def kind_pair(self, plural):
        k = self.pick(list(KINDS))
        surf = self.pick(KINDS[k][1 if plural else 0])
        return surf, LEMMA[surf]

    def s_kind(self, a, n):
        s, l = self.kind_pair(False)
        return f'[k:{s}|{l}]'

    def s_akind(self, a, n):
        s, l = self.kind_pair(False)
        return f'{article(s)} [k:{s}|{l}]'

    def s_kinds(self, a, n):
        s, l = self.kind_pair(True)
        return f'[k:{s}|{l}]'

    def s_gkind(self, a, n):
        s = self.pick(GENERIC[0])
        return f'[k:{s}|{LEMMA[s]}]'

    def s_agkind(self, a, n):
        s = self.pick(GENERIC[0])
        return f'{article(s)} [k:{s}|{LEMMA[s]}]'

    def s_gkinds(self, a, n):
        s = self.pick(GENERIC[1])
        return f'[k:{s}|{LEMMA[s]}]'

    def s_colour_sel(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:node.colour|{s}|{v}|sel]'

    def s_colour(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:node.colour|{s}|{v}]'

    def s_lcolour(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:link.colour|{s}|{v}]'

    def s_gcolour(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:group.colour|{s}|{v}]'

    def s_size(self, a, n):
        s, v = self.pick(SIZES)
        return f'[c:node.size|{s}|{v}|degree]'

    def s_gsize(self, a, n):
        s, v = self.pick(GROUP_SIZES)
        return f'[c:group.size|{s}|{v}|degree]'

    def s_label(self, a, n):
        return f'[c:node.label|{self.pick(NEW_LABELS)}]'

    def s_qlabel(self, a, n):
        return f'"[c:node.label|{self.pick(NEW_LABELS)}]"'

    def s_n(self, a, n):
        s, v = self.pick(NUMS)
        return f'[c:node.n|{s}|{v}]'

    def s_layout(self, a, n):
        s, v = self.pick(LAYOUTS)
        return f'[c:node.layout|{s}|{v}]'

    def s_glayout(self, a, n):
        s, v = self.pick(GROUP_LAYOUTS)
        return f'[c:group.layout|{s}|{v}]'

    def s_region(self, a, n):
        s, v = self.pick(REGIONS)
        return f'[c:node.at|{s}|{v}|region]'

    def s_shape(self, a, n):
        s, v = self.pick(SHAPES)
        return f'[c:node.shape|{s}|{v}]'

    def s_xy(self, a, n):
        x, y = self.rng.randrange(40, 900, 10), self.rng.randrange(40, 650, 10)
        form = self.pick(['{x}, {y}', '{x},{y}', 'x {x} y {y}', 'x={x}, y={y}', '({x}, {y})', '{x} {y}', 'x {x} and y {y}'])
        return form.replace('{x}', f'[c:node.x|{x}]').replace('{y}', f'[c:node.y|{y}]')

    def s_gxy(self, a, n):
        return self.s_xy(a, n).replace('node.x', 'group.x').replace('node.y', 'group.y')

    def s_wh(self, a, n):
        w, h = self.rng.randrange(60, 400, 10), self.rng.randrange(30, 240, 10)
        form = self.pick(['[c:node.width|{w} wide|{w}] and [c:node.height|{h} tall|{h}]', '[c:node.width|{w}|{w}] by [c:node.height|{h}|{h}]',
                          '[c:node.width|{w}|{w}] x [c:node.height|{h}|{h}]', 'width [c:node.width|{w}|{w}], height [c:node.height|{h}|{h}]',
                          '[c:node.width|{w} pixels wide|{w}] and [c:node.height|{h} high|{h}]'])
        return form.replace('{w}', str(w)).replace('{h}', str(h))

    def s_width(self, a, n):
        w = self.rng.randrange(60, 400, 10)
        return self.pick([f'[c:node.width|{w} wide|{w}]', f'[c:node.width|{w} pixels wide|{w}]', f'width [c:node.width|{w}|{w}]'])

    def s_height(self, a, n):
        h = self.rng.randrange(30, 240, 10)
        return self.pick([f'[c:node.height|{h} tall|{h}]', f'[c:node.height|{h} high|{h}]', f'height [c:node.height|{h}|{h}]'])

    def s_bigger(self, a, n):
        pre, w, step = self.pick([('', 'bigger', 'more'), ('', 'larger', 'more'), ('a bit ', 'bigger', 'more'), ('much ', 'bigger', 'much_more'),
                                  ('way ', 'bigger', 'much_more'), ('', 'smaller', 'less'), ('a little ', 'smaller', 'less'), ('much ', 'smaller', 'much_less'),
                                  ('', 'tinier', 'less'), ('a lot ', 'larger', 'much_more'), ('slightly ', 'smaller', 'less')])
        return (f'[p:{pre.strip()}] ' if pre else '') + f'[c:node.size|{w}||delta:{step}]'

    # ---------------------------------------------------------------- references to existing nodes
    def s_nref(self, a, n, forms=None):
        forms = forms or ['name', 'name', 'name', 'code', 'kind', 'ctx', 'ord']
        return self.ref(a, self.pick(forms))

    def s_nname(self, a, n):
        return self.ref(a, 'name')

    def s_ncode(self, a, n):
        return self.ref(a, 'code')

    def s_nkind(self, a, n):
        return self.ref(a, 'kind')

    def s_nctx(self, a, n):
        return self.ref(a, 'ctx')

    def s_nord(self, a, n):
        return self.ref(a, 'ord')

    def s_npop(self, a, n):
        return self.ref(a, 'pop')

    def s_nany(self, a, n):
        return self.ref(a, self.pick(['name', 'name', 'code', 'kind', 'ctx', 'ord', 'pop']))

    def s_nmany(self, a, n):
        return self.ref(a, 'many')

    def ref(self, a, form):
        rng, scene = self.rng, self.scene
        if form == 'name':
            x = self.fresh_node()
            nm, is_code = self.node_name(x)
            pat = self.pick(['{n}', '{n}', '{n}', 'the {n} box', 'the {n} node', 'the {n} step', 'the {n} shape', 'the box called {n}',
                             'the one labelled {n}', 'the node named {n}', '"{n}"', 'node {n}', 'box {n}'] if not is_code else
                            ['{n}', '{n}', 'node {n}', 'shape {n}', 'box {n}', 'element {n}', 'the node {n}', 'item {n}'])
            return pat.replace('{n}', f'[n:{nm}]')
        if form == 'code':
            x = self.fresh_node()
            return self.pick(['{n}', 'node {n}', 'shape {n}', '{n}', 'the shape {n}', 'number {n}']).replace('{n}', f'[n:{x["code"]}]')
        if form == 'kind':
            uniq = [k for k in scene.kinds_unique()]
            if not uniq:
                raise Skip()
            k = self.pick(uniq)
            x = next(x for x in scene.nodes if x['kind'] == k)
            self.used.add(x['code'])
            surf = self.pick(KINDS[k][0])
            return self.pick(['the {k}', 'the {k}', 'that {k}', 'this {k}', 'the only {k}', 'our {k}']).replace('{k}', f'[k:{surf}|{LEMMA[surf]}]')
        if form == 'ctx':
            a['fill'] = 'context'
            choice = self.pick(['it', 'it', 'this', 'that', 'this one', 'that one', 'the selected one', 'the selection', 'the selected node',
                                'the selected box', 'the one I selected', 'the highlighted one', 'the current one'])
            if choice in ('the selected box', 'the selected node'):
                surf = choice.split()[-1]
                return choice.replace(surf, f'[k:{surf}|{LEMMA[surf]}]')
            return choice
        if form == 'ord':
            choice = self.pick(['last', 'first', 'newest', 'previous', 'kind', 'kind', 'kind'])
            if choice in ('last', 'newest', 'previous', 'first') and self.rng.random() < 0.5:
                a['fill'] = 'context'
                a['ordinal'] = choice
                return {'last': self.pick(['the last one', 'the last one I added', 'the last node', 'the most recent one']),
                        'newest': self.pick(['the new one', 'the newest one', 'the one I just added', 'the one we just made']),
                        'previous': self.pick(['the previous one', 'the one before']),
                        'first': self.pick(['the first one', 'the very first one'])}[choice].replace(' node', ' [k:node|node]')
            pl = scene.kinds_plural()
            if not pl:
                raise Skip()
            k = self.pick(pl)
            ordn, word = self.pick([('first', 'first'), ('second', 'second'), ('last', 'last'), ('third', 'third'), ('newest', 'newest'),
                                    ('leftmost', 'leftmost'), ('rightmost', 'rightmost'), ('top', 'top'), ('bottom', 'bottom'),
                                    ('biggest', 'biggest'), ('smallest', 'smallest'), ('last', 'final'), ('second_last', 'second to last')])
            a['ordinal'] = ordn
            surf = self.pick(KINDS[k][0])
            return f'the {word} [k:{surf}|{LEMMA[surf]}]'
        if form == 'pop':
            pl = scene.kinds_plural()
            r = self.rng.random()
            if pl and r < 0.55:
                k = self.pick(pl)
                surf = self.pick(KINDS[k][1])
                pat, q = self.pick([('all the {k}', 'all'), ('all {k}', 'all'), ('the {k}', None), ('every {s}', 'all'), ('each {s}', 'each'),
                                    ('all of the {k}', 'all'), ('both {k}', 'both')])
                if q == 'both' and sum(x['kind'] == k for x in scene.nodes) != 2:
                    pat, q = 'all the {k}', 'all'
                if '{s}' in pat:
                    surf = self.pick(KINDS[k][0])
                a['fill'] = 'all'
                if q:
                    a['quantifier'] = q
                return pat.replace('{k}', f'[k:{surf}|{LEMMA[surf]}]').replace('{s}', f'[k:{surf}|{LEMMA[surf]}]')
            phrase, q = self.pick([('all elements', 'all'), ('all the elements', 'all'), ('everything', 'all'), ('all nodes', 'all'),
                                   ('all the nodes', 'all'), ('all the shapes', 'all'), ('every node', 'all'), ('every shape', 'all'),
                                   ('all of them', 'all'), ('each node', 'each'), ('all boxes', 'all'), ('the whole thing', None),
                                   ('all the items', 'all'), ('every element', 'all'), ('all the steps', 'all')])
            a['fill'] = 'all'
            if q:
                a['quantifier'] = q
            return f'[d:{phrase}]'
        if form == 'many':
            k = self.rng.randint(2, 3)
            xs = [self.fresh_node() for _ in range(k)]
            names = [f'[n:{self.node_name(x)[0]}]' for x in xs]
            if k == 2:
                return self.pick(['{a} and {b}', '{a} and {b}', 'both {a} and {b}', '{a} & {b}', '{a}, {b}']).replace('{a}', names[0]).replace('{b}', names[1])
            return self.pick(['{a}, {b} and {c}', '{a}, {b}, and {c}', '{a} {b} and {c}']).replace('{a}', names[0]).replace('{b}', names[1]).replace('{c}', names[2])
        raise KeyError(form)

    # ---------------------------------------------------------------- link endpoints (new links and link selectors)
    def endpoint(self, key, sel, forms=('name', 'name', 'name', 'code', 'kind')):
        form = self.pick(forms)
        o = '||sel' if sel else ''
        if form == 'kind':
            uniq = [k for k in self.scene.kinds_unique() if all(x['code'] not in self.used for x in self.scene.nodes if x['kind'] == k)]
            if uniq:
                k = self.pick(uniq)
                x = next(x for x in self.scene.nodes if x['kind'] == k)
                self.used.add(x['code'])
                surf = self.pick(KINDS[k][0])
                return f'[c:{key}|the {surf}{o}]'
            form = 'name'
        x = self.fresh_node()
        if form == 'code':
            return f'[c:{key}|{x["code"]}{o}]'
        nm, _ = self.node_name(x)
        return f'[c:{key}|{nm}{o}]'

    def s_from(self, a, n): return self.endpoint('link.from', False)
    def s_to(self, a, n): return self.endpoint('link.to', False)
    def s_sfrom(self, a, n): return self.endpoint('link.from', True)
    def s_sto(self, a, n): return self.endpoint('link.to', True)

    def s_lnoun(self, a, n):
        s = self.pick(LINK_NOUNS[0])
        return f'[k:{s}|{LINK_LEMMA[s]}]'

    def s_alnoun(self, a, n):
        s = self.pick(LINK_NOUNS[0])
        return f'{article(s)} [k:{s}|{LINK_LEMMA[s]}]'

    def s_lnouns(self, a, n):
        s = self.pick(LINK_NOUNS[1])
        return f'[k:{s}|{LINK_LEMMA[s]}]'

    def s_plainlnoun(self, a, n):
        return self.pick(LINK_NOUNS[0])

    # ---------------------------------------------------------------- references to existing links
    def s_lref(self, a, n, forms=None):
        forms = forms or ['code', 'code', 'ends', 'ends', 'ends', 'ctx', 'ord', 'from']
        return self.lref(a, self.pick(forms))

    def s_lcode(self, a, n): return self.lref(a, 'code')
    def s_lends(self, a, n): return self.lref(a, 'ends')
    def s_lpop(self, a, n): return self.lref(a, 'pop')

    def lref(self, a, form):
        sc = self.scene
        if not sc.links:
            raise Skip()
        e = self.pick(sc.links)
        noun = self.pick(LINK_NOUNS[0])
        if form == 'code':
            pat = self.pick(['{c}', '{noun} {c}', '{noun} {c}', 'the {noun} {c}', '{c}'])
            return pat.replace('{noun}', noun).replace('{c}', f'[n:{e["code"]}]')
        if form in ('ends', 'from'):
            fx, tx = sc.node(e['from']), sc.node(e['to'])
            self.used |= {fx['code'], tx['code']}
            fn, tn = self.node_name(fx)[0], self.node_name(tx)[0]
            a['fill'] = 'description'
            k = f'[k:{noun}|{LINK_LEMMA[noun]}]'
            if form == 'from':
                return self.pick(['the {k} from {f}', 'the {k} out of {f}', 'the {k} leaving {f}']).replace('{k}', k).replace('{f}', f'[c:link.from|{fn}||sel]')
            pat = self.pick(['the {k} from {f} to {t}', 'the {k} between {f} and {t}', 'the {k} from {f} into {t}', 'the {k} that goes from {f} to {t}',
                             'the {k} connecting {f} and {t}', 'the {k} {f} to {t}', 'the {f} to {t} {k}', '{f}-{t} {k}'])
            return pat.replace('{k}', k).replace('{f}', f'[c:link.from|{fn}||sel]').replace('{t}', f'[c:link.to|{tn}||sel]')
        if form == 'ctx':
            a['fill'] = 'context'
            choice = self.pick(['that {k}', 'this {k}', 'the selected {k}', 'it', 'the {k} I just drew', 'the new {k}'])
            if '{k}' in choice:
                if 'just drew' in choice or 'new' in choice:
                    a['ordinal'] = 'newest'
                return choice.replace('{k}', f'[k:{noun}|{LINK_LEMMA[noun]}]')
            return choice
        if form == 'ord':
            ordn, word = self.pick([('last', 'last'), ('first', 'first'), ('second', 'second'), ('newest', 'newest'), ('top', 'top')])
            a['ordinal'] = ordn
            a['fill'] = 'description'
            return f'the {word} [k:{noun}|{LINK_LEMMA[noun]}]'
        if form == 'pop':
            pl = self.pick(LINK_NOUNS[1])
            a['fill'] = 'all'
            pat, q = self.pick([('all the {k}', 'all'), ('all {k}', 'all'), ('the {k}', None), ('every {s}', 'all'), ('all of the {k}', 'all')])
            if q:
                a['quantifier'] = q
            return pat.replace('{k}', f'[k:{pl}|{LINK_LEMMA[pl]}]').replace('{s}', f'[k:{noun}|{LINK_LEMMA[noun]}]')
        raise KeyError(form)

    def s_llabel(self, a, n):
        return f'[c:link.label|{self.pick(LINK_LABELS)}]'

    def s_style(self, a, n):
        s, v = self.pick(STYLES)
        return f'[c:link.style|{s}|{v}]'

    def s_arrowhead(self, a, n):
        s, v = self.pick(ARROWS)
        return f'[c:link.arrow|{s}|{v}]'

    def s_lwidth(self, a, n):
        w = self.rng.randint(1, 8)
        return self.pick([f'[c:link.width|{w} px|{w}]', f'[c:link.width|{w} pixels|{w}]', f'width [c:link.width|{w}|{w}]', f'[c:link.width|{w}pt|{w}]'])

    def s_thicker(self, a, n):
        pre, w, step = self.pick([('', 'thicker', 'more'), ('a bit ', 'thicker', 'more'), ('much ', 'thicker', 'much_more'), ('', 'thinner', 'less'),
                                  ('a little ', 'thinner', 'less'), ('way ', 'thicker', 'much_more'), ('', 'bolder', 'more'), ('', 'heavier', 'more')])
        return (f'[p:{pre.strip()}] ' if pre else '') + f'[c:link.width|{w}||delta:{step}]'

    # ---------------------------------------------------------------- groups
    def s_gref(self, a, n):
        g = self.scene.groups[0] if self.scene.groups else None
        if not g:
            raise Skip()
        form = self.pick(['name', 'name', 'name', 'code', 'ctx'])
        if form == 'ctx':
            a['fill'] = 'context'
            return self.pick(['the group', 'that group', 'this group', 'the selected group', 'it'])
        if form == 'code':
            return self.pick(['group {c}', '{c}']).replace('{c}', f'[n:{g["code"]}]')
        return self.pick(['the {g} group', 'the group {g}', '{g}', 'the {g} cluster', 'group "{g}"', 'the {g} section']).replace('{g}', f'[n:{esc(g["label"])}]')

    def s_gname(self, a, n):
        return f'[c:group.name|{self.pick(["Intake", "Review stage", "Payments", "Core", "Team A", "Phase 1", "Backend", "Ops", "Frontend", "Q3"])}]'

    def s_glabel(self, a, n):
        return f'[c:group.label|{self.pick(["Quality gate", "Sign-off", "Data layer", "Customer side", "Billing", "Stage 2", "Experiments", "Infra"])}]'

    def s_members(self, a, n):
        k = self.rng.randint(2, 3)
        xs = [self.fresh_node() for _ in range(k)]
        ms = [f'[c:group.ids|{self.node_name(x)[0]}]' for x in xs]
        if k == 2:
            return self.pick(['{a} and {b}', '{a} with {b}', '{a}, {b}']).replace('{a}', ms[0]).replace('{b}', ms[1])
        return '{a}, {b} and {c}'.replace('{a}', ms[0]).replace('{b}', ms[1]).replace('{c}', ms[2])

    def s_scale(self, a, n):
        s, v, op = self.pick([('2', '2', ''), ('1.5', '1.5', ''), ('0.5', '0.5', ''), ('3', '3', ''), ('twice as big', '2', 'factor'),
                              ('half the size', '0.5', 'factor'), ('three times as big', '3', 'factor'), ('double size', '2', 'factor'),
                              ('150%', '1.5', 'factor')])
        return f'[c:group.scale|{s}|{v}|{op}]'

    def s_chartname(self, a, n):
        return f'[n:{self.pick(CHART_NAMES)}]'

    def s_charttype(self, a, n):
        s, v = self.pick(CHART_TYPES)
        return f'[c:chart.type|{s}|{v}]'

    def s_chartdata(self, a, n):
        rows = self.rng.sample(CHART_ROWS, self.rng.randint(2, 4))
        parts = [f'[c:group.labels|{l}] {v}'.replace(f' {v}', f' [c:group.values|{v}]') for l, v in rows]
        sep = self.pick([', ', ', ', ' and '])
        return sep.join(parts)

    def s_charttitle(self, a, n):
        return f'[c:group.label|{self.pick(["Headcount", "Sales", "Visitors", "Votes", "Revenue", "Tickets per day"])}]'

    def s_cstitle(self, a, n):
        return f'[c:chart.title|{self.pick(["Customer ratings", "Regional sales", "Traffic", "Budget split", "Weekly load"])}]'

    def s_dkind(self, a, n):
        s, v = self.pick(DIAGRAM_KINDS)
        return f'[k:{s}|{v}]'

    def s_adkind(self, a, n):
        s, v = self.pick(DIAGRAM_KINDS)
        return f'{article(s)} [k:{s}|{v}]'

    def s_secs(self, a, n):
        v = self.pick(['3', '5', '10', '2', 'five', 'ten', '20', 'three'])
        return f'[c:page.duration|{v} seconds]'


    # ---------------------------------------------------------------- extra slots
    def s_colour_a(self, a, n):
        s, v = self.pick(COLOURS)
        return f'{article(s)} [c:node.colour|{s}|{v}]'

    def s_size_a(self, a, n):
        s, v = self.pick(SIZES)
        return f'{article(s)} [c:node.size|{s}|{v}|degree]'

    def s_rel(self, a, n):
        s, v = self.pick(RELATIONS)
        return f'[c:node.position|{s}|{v}|relation]'

    def s_anchor(self, a, n):
        x = self.fresh_node()
        nm, is_code = self.node_name(x)
        if not is_code and self.rng.random() < 0.3:
            return 'the ' + f'[c:node.anchor|{nm}|{nm}|relation,sel]' + self.pick([' box', ' node', ' step', ''])
        return f'[c:node.anchor|{nm}|{nm}|relation,sel]'

    def s_num(self, a, n):
        return str(self.pick([3, 7, 12, 25, 40, 42, 55, 80, 100, 150, 1200]))

    def s_lpopfrom(self, a, n):
        return self.endpop('link.from')

    def s_nsomefrom(self, a, n):
        xs = [self.fresh_node() for _ in range(self.rng.randint(2, 3))]
        names = [self.node_name(x)[0] for x in xs]
        return ', '.join(f'[c:link.from|{x}]' for x in names[:-1]) + ' and ' + f'[c:link.from|{names[-1]}]'

    def s_gsel(self, a, n):
        return f'[c:group.ids|{self.pick(["these", "them", "these two", "the selected nodes", "the selection", "those three", "both of them", "all the circles", "all the boxes", "everything"])}]'

    def s_lpopto(self, a, n):
        return self.endpop('link.to')

    def endpop(self, key):
        pl = self.scene.kinds_plural()
        if pl and self.rng.random() < 0.5:
            k = self.pick(pl)
            surf = self.pick(KINDS[k][1])
            phrase = self.pick(['all the {k}', 'all {k}', 'the {k}', 'all of the {k}']).replace('{k}', surf)
        else:
            phrase = self.pick(['all elements', 'all the elements', 'all the nodes', 'all nodes', 'every node', 'all the shapes', 'everything',
                                'them', 'all of them', 'these', 'the selected nodes', 'all the boxes', 'all the steps', 'every element',
                                'these two', 'those three', 'both of them', 'the two boxes', 'these nodes', 'the selection', 'all these shapes'])
        return f'[c:{key}|{phrase}]'

    def s_lfromonly(self, a, n):
        return self.lref(a, 'from')

    def s_lendsplain(self, a, n):
        sc = self.scene
        if not sc.links:
            raise Skip()
        e = self.pick(sc.links)
        fx, tx = sc.node(e['from']), sc.node(e['to'])
        a['fill'] = 'description'
        return f'[c:link.from|{self.node_name(fx)[0]}||sel] and [c:link.to|{self.node_name(tx)[0]}||sel]'

    def s_nn(self, a, n):
        return self.node_name(self.fresh_node())[0]

    def s_lc(self, a, n):
        sc = self.scene
        if not sc.links:
            raise Skip()
        e = self.pick(sc.links)
        noun = self.pick(LINK_NOUNS[0])
        return self.pick([f'{noun} {e["code"]}', e['code'], f'the {noun} into {self.node_name(sc.node(e["to"]))[0]}',
                          f'the {noun} from {self.node_name(sc.node(e["from"]))[0]}'])

    def s_chartsrc(self, a, n):
        return f'[c:chart.source|{self.pick(CHART_NAMES)}|-]'

    def s_gid(self, a, n):
        return f'[c:group.id|{self.pick(CHART_NAMES)}]'


    # ---------------------------------------------------------------- styles, layout, new operations
    def bank(self, key, table, opts=''):
        s, v = self.pick(table)
        return f'[c:{key}|{s}|{v}{"|" + opts if opts else ""}]'

    def s_theme(self, a, n): return self.bank('diagram.theme', THEMES)
    def s_by(self, a, n): return self.bank('diagram.by', BY)
    def s_direction(self, a, n): return self.bank('diagram.direction', DIRECTIONS)
    def s_spacing(self, a, n): return self.bank('diagram.spacing', SPACINGS)
    def s_route(self, a, n): return self.bank('diagram.route', ROUTES)
    def s_lroute(self, a, n): return self.bank('link.route', ROUTES)
    def s_dlayout(self, a, n): return self.bank('diagram.layout', [x for x in LAYOUTS if x[1] != 'layers'] + [('layered', 'layered'), ('in layers', 'layered')])
    def s_role(self, a, n): return self.bank('node.role', ROLES)
    def s_edge(self, a, n): return self.bank('node.edge', EDGES)
    def s_axis(self, a, n): return self.bank('node.axis', AXES)
    def s_pattern(self, a, n): return self.bank('link.pattern', PATTERNS)
    def s_newshape(self, a, n): return self.bank('node.shape', NEW_SHAPES + SHAPES[:6])

    def s_outline(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:node.outline|{s}|{v}]'

    def s_textcolour(self, a, n):
        s, v = self.pick(COLOURS)
        return f'[c:node.textColour|{s}|{v}]'

    def s_fontsize(self, a, n):
        v = self.pick(FONT_SIZES)
        return self.pick([f'[c:node.fontSize|{v}|{v}]', f'[c:node.fontSize|{v} pt|{v}]', f'[c:node.fontSize|{v}px|{v}]', f'[c:node.fontSize|size {v}|{v}]'])

    def s_fontbigger(self, a, n):
        pre, w, step = self.pick([('', 'bigger', 'more'), ('', 'larger', 'more'), ('', 'smaller', 'less'), ('much ', 'bigger', 'much_more'), ('a bit ', 'smaller', 'less')])
        return (f'[p:{pre.strip()}] ' if pre else '') + f'[c:node.fontSize|{w}||delta:{step}]'

    def s_bold(self, a, n):
        s, v = self.pick([('bold', 'bold'), ('in bold', 'bold'), ('heavier', 'bold'), ('normal weight', 'normal'), ('not bold', 'normal'), ('regular', 'normal')])
        return f'[c:node.fontWeight|{s}|{v}]'

    def s_nsome(self, a, n):
        """A set of nodes for align/distribute/merge/connect: names, a population or the selection."""
        r = self.rng.random()
        if r < 0.4:
            return self.ref(a, 'many')
        if r < 0.7:
            return self.ref(a, 'pop')
        a['fill'] = 'context'
        choice = self.pick(['these', 'them', 'these two', 'those three', 'the selected nodes', 'the selection', 'these nodes', 'both of them', 'all of these'])
        if choice in ('these two', 'those three'):
            w = choice.split()[1]
            return choice.replace(w, f'[q:{w}]')
        if choice == 'these nodes':
            return 'these [k:nodes|node]'
        return choice


class F:
    """A frame: a template over Slots plus the request attributes (one dict per request)."""

    def __init__(self, template, *attrs, need=None):
        self.template, self.attrs, self.need = template, attrs, need

    def __call__(self, rng, scene):
        s = Slots(rng, scene, len(self.attrs))
        text = self.template.format_map(s)
        text = re.sub(r'  +', ' ', text).strip()
        out = [{**base, **extra} for base, extra in zip(self.attrs, s.attrs)]
        return text, out


def ops(*names):
    return [{'op': n} for n in names]


def op(name, **kw):
    return {'op': name, **kw}


def fr(templates, *attrs):
    return [F(t, *attrs) for t in templates]


from cases import CASES  # noqa: E402,F401  (case catalogue uses the frame machinery above)
