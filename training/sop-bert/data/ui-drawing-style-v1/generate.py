#!/usr/bin/env python3
"""Generate ui-drawing-style-v1: requests for the Drawing tab's turns, mirrors, leans, opacity, effects, fills, outlines,
writing (text, typeface, weight, slant, alignment, frames), facing and picture filters (catalog b89b4541, art.draw native
interface), on objects, groups, parts and the page. Same machinery as ui-diagram-v2 (engine.py span markup, robustness
variants); deterministic. Run: python3 generate.py && python3 validate.py"""
import collections
import copy
import hashlib
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'ui-diagram-v2'))
import engine  # noqa: E402
from engine import FrameError, apply_noise, assemble, parse, politeness  # noqa: E402

INV = json.loads((engine.REPO / 'official-dataset' / 'inventory.json').read_text())
for extra in (HERE / 'inventory.json', HERE.parent / 'data-drop-v1' / 'inventory.json'):
    for typ, d in json.loads(extra.read_text()).get('drawing', {}).items():
        INV['drawing'].setdefault(typ, {'keys': {}})['keys'].update(d['keys'])


def spec(key):
    typ, _, name = key.partition('.')
    return INV['drawing'].get(typ, {}).get('keys', {}).get(name)


engine.spec = spec  # constraint() resolves keys in the Drawing area
engine.OPS.update({
    'drawing.object.change': ('change', 'do', 'drawn', 'existing', 'drawn.ids', 'context'),
    'drawing.object.make': ('make', 'do', 'drawn', 'new', None, None),
    'drawing.part.change': ('change', 'do', 'part', 'existing', None, 'context'),
    'drawing.group.change': ('change', 'do', 'group', 'existing', None, 'context'),
    'drawing.page.change': ('change', 'do', 'page', 'existing', None, 'context'),
})
SEED = 20261121
PER_CASE = 40
NOISE_MODES = ['typo', 'typo', 'nospace', 'asr', 'asr', 'filler', 'polite']

# ------------------------------------------------------------------ scenes
OBJECTS = [('house', 'House'), ('tree', 'Old oak'), ('sun', 'Sun'), ('car', 'Red car'), ('boat', 'Sailboat'), ('dog', 'Dog'), ('cat', 'Cat'),
           ('girl', 'Girl'), ('boy', 'Boy'), ('cloud', 'Cloud'), ('star', 'Star'), ('bird', 'Bird'), ('fish', 'Fish'), ('kite', 'Kite'),
           ('sign', 'Sign'), ('text', 'Title'), ('flower', 'Flower'), ('moon', 'Moon'), ('arrow', 'Arrow'), ('heart', 'Heart'), ('lamp', 'Lamp')]
PARTS = {'house': ['roof', 'door', 'window', 'chimney'], 'car': ['wheel', 'window', 'door'], 'tree': ['trunk', 'crown'], 'girl': ['hat', 'hair', 'dress'],
         'boy': ['hat', 'shirt'], 'boat': ['sail', 'mast'], 'dog': ['tail', 'ear'], 'sun': ['ray', 'face']}
GROUPS = ['Farm', 'Village', 'Garden', 'Harbour', 'Park']


class DScene:
    def __init__(self, rng, text=False):
        k = rng.randint(3, 6)
        objs = rng.sample(OBJECTS, k)
        if text and not any(o[0] in ('text', 'sign') for o in objs):
            objs[0] = rng.choice([('text', 'Title'), ('sign', 'Sign')])
        self.objects = [{'kind': kd, 'name': nm} for kd, nm in objs]
        self.parts = [{'kind': p, 'owner': o['kind']} for o in self.objects for p in PARTS.get(o['kind'], [])]
        self.groups = [{'name': rng.choice(GROUPS)}] if rng.random() < 0.3 else []
        self.previous = None

    def existing(self):
        rows = [{'kind': o['kind'], 'name': o['name']} for o in self.objects]
        rows += [{'kind': p['kind'], 'name': f"{p['kind']} of the {p['owner']}"} for p in self.parts[:6]]
        rows += [{'kind': 'group', 'name': g['name']} for g in self.groups]
        return rows


# ------------------------------------------------------------------ values (surface, value)
FONTS = [('serif', 'serif'), ('sans', 'sans'), ('sans-serif', 'sans'), ('plain', 'sans'), ('handwritten', 'handwritten'), ('handwriting', 'handwritten'),
         ('comic', 'comic'), ('cartoon', 'comic'), ('mono', 'mono'), ('monospace', 'mono'), ('typewriter', 'mono'), ('fancy', 'fancy'), ('script', 'fancy'),
         ('cursive', 'fancy'), ('calligraphy', 'fancy'), ('poster', 'poster'), ('headline', 'poster'), ('rounded', 'rounded'), ('round', 'rounded')]
FILLS = [('solid', 'solid'), ('plain', 'solid'), ('hollow', 'none'), ('empty', 'none'), ('no fill', 'none'), ('crayon', 'crayon'), ('striped', 'striped'),
         ('stripes', 'striped'), ('stripy', 'striped'), ('dotted', 'dotted'), ('polka dots', 'dotted'), ('spotty', 'dotted'), ('checked', 'checked'),
         ('checkered', 'checked'), ('zigzag', 'zigzag'), ('dashed', 'dashed'), ('gradient', 'gradient'), ('fading', 'gradient'), ('ombre', 'gradient')]
EFFECTS = [('a glow', 'glow'), ('glowing', 'glow'), ('shiny', 'glow'), ('neon', 'neon'), ('a neon glow', 'neon'), ('a shadow', 'shadow'), ('a drop shadow', 'shadow'),
           ('a long shadow', 'long_shadow'), ('blur', 'blur'), ('blurry', 'blur'), ('out of focus', 'blur'), ('soft edges', 'soft'), ('soft', 'soft'),
           ('no effect', 'none'), ('no effects', 'none')]
FILTERS = [('sepia', 'sepia'), ('an old photo', 'sepia'), ('black and white', 'black_and_white'), ('greyscale', 'black_and_white'), ('grayscale', 'black_and_white'),
           ('night', 'night'), ('night time', 'night'), ('sunset', 'sunset'), ('evening', 'sunset'), ('golden hour', 'sunset'), ('vintage', 'vintage'),
           ('retro', 'vintage'), ('bright', 'bright'), ('brighter', 'bright'), ('faded', 'faded'), ('washed-out', 'faded'), ('dreamy', 'dreamy'),
           ('no filter', 'none'), ('the original', 'none')]
FRAMES = [('a speech bubble', 'speech'), ('a talking bubble', 'speech'), ('a thought bubble', 'thought'), ('a caption box', 'caption'), ('a caption', 'caption'),
          ('a sign', 'sign'), ('a signboard', 'sign'), ('no frame', 'none')]
TURNS = [('rotate it right', None), ('clockwise', 'rotate_right'), ('a quarter turn', 'rotate_right'), ('to the right', 'rotate_right'),
         ('anticlockwise', 'rotate_left'), ('counterclockwise', 'rotate_left'), ('to the left', 'rotate_left'), ('upside down', 'upside_down'),
         ('upright', 'upright'), ('the right way up', 'upright'), ('a bit', 'tilt'), ('slightly', 'tilt'), ('a little', 'tilt'), ('a bit to the left', 'tilt_left'),
         ('half a turn', 'half'), ('a half turn', 'half'), ('all the way round', 'full'), ('a full turn', 'full')]
TURNS = [t for t in TURNS if t[1]]
MIRRORS = [('horizontally', 'horizontal'), ('left to right', 'horizontal'), ('sideways', 'horizontal'), ('vertically', 'vertical'), ('top to bottom', 'vertical'),
           ('upside down', 'vertical')]
COLOURS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gold', 'navy', 'teal', 'brown', 'grey']
TEXTS = ['Happy birthday', 'Welcome', 'Hello!', 'For sale', 'Our farm', 'Open', 'Danger', 'I love you', 'Summer 2026', 'The end', 'Hi there', 'Keep out']


class Skip(Exception):
    pass


class Slots(dict):
    def __init__(self, rng, scene, n):
        super().__init__()
        self.rng, self.scene, self.attrs = rng, scene, [{} for _ in range(n)]

    def __missing__(self, key):
        name, _, idx = key.partition('@')
        base = re.sub(r'\d+$', '', name)
        v = getattr(self, 's_' + base)(self.attrs[int(idx) if idx else 0], name)
        self[key] = v
        return v

    def pick(self, seq):
        return self.rng.choice(seq)

    def verb(self, words):
        return '[t:' + self.pick(words) + ']'

    def s_pol(self, a, n):
        return self.pick(['please ', 'can you ', 'could you ', "let's ", 'I want to ', 'now ', 'ok ', 'just ', '', '', '', '', ''])

    def s_why(self, a, n):
        return self.pick(['so it stands out', 'for the card', 'because it looks too flat', 'for my kid', 'to make it more fun', 'so it looks like a poster',
                          'before I print it', 'it looks odd otherwise', 'to match the rest'])

    def s_make(self, a, n): return self.verb(['make', 'turn', 'set', 'change', 'switch'])
    def s_add(self, a, n): return self.verb(['add', 'give', 'put', 'apply', 'use'])
    def s_rotate(self, a, n): return self.verb(['rotate', 'turn', 'spin', 'tilt'])
    def s_flip(self, a, n): return self.verb(['flip', 'mirror', 'reverse'])
    def s_write(self, a, n): return self.verb(['write', 'put', 'add', 'type'])
    def s_draw(self, a, n): return self.verb(['draw', 'add', 'make', 'put'])

    # ---------------------------------------------------------------- references
    def s_ref(self, a, n):
        o = self.pick(self.scene.objects)
        form = self.pick(['name', 'kind', 'kind', 'ctx', 'pop'])
        if form == 'name' and o['name'][0].isupper() and o['name'].lower() != o['kind']:
            return f'[n:{o["name"]}]'
        if form == 'ctx':
            a['fill'] = 'context'
            return self.pick(['it', 'this', 'that', 'the selected one', 'this one', 'the selection'])
        if form == 'pop':
            kinds = [x['kind'] for x in self.scene.objects]
            a['fill'] = 'all'
            if self.rng.random() < 0.5:
                a['quantifier'] = 'all'
                return '[d:' + self.pick(['everything', 'all the objects', 'all of them', 'every object', 'all the things']) + ']'
            k = self.pick(kinds)
            a['quantifier'] = 'all'
            return f'all the [k:{k}s|{k}]' if not k.endswith('s') else f'all the [k:{k}|{k}]'
        return self.pick(['the {k}', 'the {k}', 'that {k}', 'our {k}']).replace('{k}', f'[k:{o["kind"]}|{o["kind"]}]')

    def s_tref(self, a, n):
        """A written object (text or sign)."""
        o = next((x for x in self.scene.objects if x['kind'] in ('text', 'sign')), None)
        if not o:
            raise Skip()
        if self.rng.random() < 0.4:
            a['fill'] = 'context'
            return self.pick(['it', 'the writing', 'the text', 'the words', 'the lettering'])
        w = 'text' if o['kind'] == 'text' else 'sign'
        return self.pick([f'the [k:{w}|{w}]', f'the [k:{w}|{w}]', f'[n:{o["name"]}]'])

    def s_pref(self, a, n):
        if not self.scene.parts:
            raise Skip()
        p = self.pick(self.scene.parts)
        own = next(o for o in self.scene.objects if o['kind'] == p['owner'])
        return self.pick(['the {p} of the {o}', "the {o}'s {p}", 'the {p} on the {o}']).replace('{p}', f'[k:{p["kind"]}|{p["kind"]}]').replace(
            '{o}', f'[c:part.owner|{own["kind"]}|{own["kind"]}|sel]')

    def s_gref(self, a, n):
        if not self.scene.groups:
            raise Skip()
        return self.pick(['the {g} group', '{g}', 'the group {g}']).replace('{g}', f'[n:{self.scene.groups[0]["name"]}]')

    # ---------------------------------------------------------------- values
    def bank(self, key, table, opts=''):
        s, v = self.pick(table)
        return f'[c:{key}|{s}|{v}{"|" + opts if opts else ""}]'

    def s_font(self, a, n): return self.bank('drawn.font', FONTS)
    def s_fill(self, a, n): return self.bank('drawn.fill', FILLS)
    def s_effect(self, a, n): return self.bank('drawn.effect', EFFECTS)
    def s_peffect(self, a, n): return self.bank('part.effect', EFFECTS)
    def s_filter(self, a, n): return self.bank('page.filter', FILTERS)
    def s_frame(self, a, n): return self.bank('drawn.frame', FRAMES)
    def s_turn(self, a, n): return self.bank('drawn.turn', TURNS)
    def s_pturn(self, a, n): return self.bank('part.turn', TURNS)
    def s_mirror(self, a, n): return self.bank('drawn.mirror', MIRRORS)
    def s_pmirror(self, a, n): return self.bank('part.mirror', MIRRORS)
    def s_facing(self, a, n): return self.bank('drawn.facing', [('left', 'left'), ('right', 'right'), ('the left', 'left'), ('the right', 'right')])

    def s_deg(self, a, n):
        d = self.pick([10, 15, 20, 30, 45, 60, 90, 120, 135, 180, 270, -30, -45])
        form = self.pick(['{d} degrees', '{d}°', 'by {d} degrees', '{d} deg'])
        surf = form.replace('{d}', str(abs(d)) if 'by' not in form else str(abs(d)))
        return f'[c:drawn.rotation|{surf.replace("by ", "")}|{d if d > 0 else abs(d)}]' if 'by ' not in surf else 'by ' + f'[c:drawn.rotation|{surf[3:]}|{abs(d)}]'

    def s_pdeg(self, a, n): return self.s_deg(a, n).replace('drawn.rotation', 'part.rotation')

    def s_skew(self, a, n):
        d = self.pick([10, 15, 20, 30, 45])
        return self.pick([f'[c:drawn.skew|{d} degrees|{d}]', f'by [c:drawn.skew|{d}|{d}]', f'[c:drawn.skew|{d}°|{d}]'])

    def s_opacity(self, a, n, key='drawn.opacity'):
        s, v = self.pick([('50%', '0.5'), ('half transparent', '0.5'), ('30% opacity', '0.3'), ('see-through', '0.5'), ('80%', '0.8'), ('0.4', '0.4'),
                          ('a quarter', '0.25'), ('fully opaque', '1'), ('70 percent', '0.7'), ('20%', '0.2')])
        return f'[c:{key}|{s}|{v}]'

    def s_popacity(self, a, n): return self.s_opacity(a, n, 'part.opacity')

    def s_colour(self, a, n):
        c = self.pick(COLOURS)
        return f'[c:drawn.outline|{c}|{c}]'

    def s_gcolour(self, a, n):
        c = self.pick(COLOURS)
        return f'[c:drawn.gradient|{c}|{c}]'

    def s_stroke(self, a, n):
        w = self.pick([1, 2, 3, 4, 5, 6, 8, 10])
        return self.pick([f'[c:drawn.stroke|{w} px|{w}]', f'[c:drawn.stroke|{w} pixels|{w}]', f'width [c:drawn.stroke|{w}|{w}]'])

    def s_thicker(self, a, n):
        pre, w, step = self.pick([('', 'thicker', 'more'), ('much ', 'thicker', 'much_more'), ('', 'thinner', 'less'), ('a bit ', 'thinner', 'less')])
        return (f'[p:{pre.strip()}] ' if pre else '') + f'[c:drawn.stroke|{w}||delta:{step}]'

    def s_text(self, a, n):
        return '"' + f'[c:drawn.text|{self.pick(TEXTS)}]' + '"'

    def s_bold(self, a, n): return self.bank('drawn.weight', [('bold', 'bold'), ('in bold', 'bold'), ('heavy', 'bold'), ('normal weight', 'normal'), ('not bold', 'normal')])
    def s_italic(self, a, n): return self.bank('drawn.slant', [('italic', 'italic'), ('in italics', 'italic'), ('slanted', 'italic'), ('upright letters', 'normal'), ('not italic', 'normal')])
    def s_align(self, a, n): return self.bank('drawn.align', [('left-aligned', 'start'), ('on the left', 'start'), ('centred', 'middle'), ('centered', 'middle'),
                                                               ('in the middle', 'middle'), ('right-aligned', 'end'), ('on the right', 'end')])


class F:
    def __init__(self, template, *attrs, scene=None, previous=None):
        self.template, self.attrs, self.previous = template, attrs, previous

    def __call__(self, rng, scene):
        s = Slots(rng, scene, len(self.attrs))
        text = re.sub(r'  +', ' ', self.template.format_map(s)).strip()
        return text, [{**b, **e} for b, e in zip(self.attrs, s.attrs)], (self.previous(rng) if self.previous else None)


def op(name, **kw):
    return {'op': name, **kw}


def fr(templates, *attrs, previous=None):
    return [F(t, *attrs, previous=previous) for t in templates]


OC, OM, PC, GC, PG = op('drawing.object.change'), op('drawing.object.make'), op('drawing.part.change'), op('drawing.group.change'), op('drawing.page.change')
CASES = {}


def case(cid, eq, cx, sm, text=False, n=PER_CASE):
    CASES[cid] = {'equivalent': eq, 'complex': cx, 'simplified': sm, 'text': text, 'n': n}


case('turn:named', fr(['{pol}{rotate} {ref} {turn}', '{pol}turn {ref} {turn}'.replace('turn {ref}', '[t:turn] {ref}'), '{pol}{rotate} {ref} {turn} please',
                       '{pol}put {ref} {turn}'.replace('put', '[t:put]'), '{pol}{make} {ref} {turn}', '{pol}{rotate} {ref} round {turn}'], OC),
     fr(['it looks wrong, {rotate} {ref} {turn}', '{pol}{rotate} {ref} {turn} {why}'], OC), fr(['{ref} {turn}', '{turn}', '{rotate} {turn}', '{rotate} {ref}'], OC))
case('turn:degrees', fr(['{pol}{rotate} {ref} {deg}', '{pol}{rotate} {ref} by {deg}'.replace('by {deg}', '{deg}'), '{pol}{make} {ref} lean {deg}', '{pol}{rotate} {ref} {deg} clockwise'],
                        OC),
     fr(['so it looks like it is falling, {rotate} {ref} {deg}'], OC), fr(['{ref} {deg}', '{rotate} {deg}', '{deg} please'], OC))
case('mirror', fr(['{pol}{flip} {ref} {mirror}', '{pol}{flip} {ref}', '{pol}{make} {ref} face the other way'.replace('face the other way', '[c:drawn.mirror|face the other way|horizontal]'),
                   '{pol}mirror {ref} {mirror}'.replace('mirror', '[t:mirror]', 1)], OC),
     fr(['it points the wrong way, {flip} {ref} {mirror}'], OC), fr(['{flip} {ref}', '{flip} it {mirror}', '{ref} {mirror}', '{flip}'], OC))
case('facing', fr(['{pol}{make} {ref} face {facing}', '{pol}turn {ref} to face {facing}'.replace('turn', '[t:turn]'), '{pol}{make} {ref} look {facing}',
                   '{pol}{draw} a [k:dog|dog] facing {facing}'.replace('{draw}', '[t:draw]')], OC),
     fr(['so they look at each other, {make} {ref} face {facing}'], OC), fr(['{ref} facing {facing}', 'face {facing}', 'looking {facing}'], OC))
for c in ('facing',):
    for f in CASES[c]['equivalent']:
        if '[k:dog|dog]' in f.template:
            f.attrs = (OM,)
case('skew', fr(['{pol}lean {ref} {skew}'.replace('lean', '[t:lean]'), '{pol}slant {ref} {skew}'.replace('slant', '[t:slant]'), '{pol}skew {ref} {skew}'.replace('skew', '[t:skew]', 1),
                 '{pol}{make} {ref} lean over {skew}'], OC),
     fr(['to look like it is in the wind, [t:lean] {ref} {skew}'], OC), fr(['[t:lean] {ref}'.replace('[t:lean] {ref}', '[t:lean] {ref} {skew}'), '{ref} skewed {skew}'], OC))
case('opacity', fr(['{pol}{make} {ref} {opacity}', '{pol}set the opacity of {ref} to {opacity}'.replace('set', '[t:set]'), '{pol}{make} {ref} {opacity} transparent'.replace(' transparent', ''),
                    '{pol}fade {ref} to {opacity}'.replace('fade', '[t:fade]')], OC),
     fr(['it hides what is behind, so {make} {ref} {opacity}'], OC), fr(['{ref} {opacity}', '{opacity} please', 'opacity {opacity}'], OC))
case('effect', fr(['{pol}{add} {effect} to {ref}', '{pol}{make} {ref} {effect}', '{pol}{add} {ref} {effect}'.replace('{add} {ref} {effect}', '[t:give] {ref} {effect}'),
                   '{pol}put {effect} on {ref}'.replace('put', '[t:put]'), '{pol}{add} {effect} around {ref}'], OC),
     fr(['it looks flat, {add} {effect} to {ref}', '{pol}{add} {effect} to {ref} {why}'], OC), fr(['{effect} on {ref}', '{effect}', '{ref} {effect}', 'with {effect}'], OC))
case('fill', fr(['{pol}{make} {ref} {fill}', '{pol}fill {ref} with {fill}'.replace('fill {ref}', '[t:fill] {ref}'), '{pol}{add} a {fill} fill to {ref}',
                 '{pol}{make} the inside of {ref} {fill}', '{pol}colour {ref} in {fill}'.replace('colour', '[t:colour]'), '{pol}{make} {ref} look {fill}'], OC),
     fr(['like a child drew it, {make} {ref} {fill}'], OC), fr(['{ref} {fill}', '{fill} fill', '{fill} please', '{fill} {ref}'], OC))
case('gradient', fr(['{pol}{make} {ref} fade into {gcolour}', '{pol}{add} a gradient to {gcolour} on {ref}', '{pol}{make} {ref} a gradient to {gcolour}'], OC),
     fr(['for a sunset look, {make} {ref} fade into {gcolour}'], OC), fr(['{ref} fading to {gcolour}', 'gradient to {gcolour}'], OC))
case('outline', fr(['{pol}{add} a {colour} outline to {ref}', '{pol}{make} the outline of {ref} {colour}', '{pol}outline {ref} in {colour}'.replace('outline {ref}', '[t:outline] {ref}'),
                    '{pol}{make} the border of {ref} {stroke}', '{pol}{make} the outline of {ref} {thicker}', '{pol}{add} a {stroke} {colour} outline to {ref}'], OC),
     fr(['so it stands out from the background, {add} a {colour} outline to {ref}'], OC), fr(['{colour} outline', '{ref} outline {colour}', 'outline {thicker}', '{thicker} outline'], OC))
case('text:write', fr(['{pol}{write} {text} on {ref}', '{pol}{write} {text}', '{pol}{draw} a [k:sign|sign] that says {text}', '{pol}{add} the words {text}',
                       '{pol}{draw} [k:text|text] saying {text}', '{pol}{write} {text} in {frame}'], OM),
     fr(['it is for her party, {write} {text}', 'for the poster {write} {text} at the top'], OM), fr(['{text}', '{write} {text}', 'text {text}', '[k:sign|sign] {text}'], OM), text=True)
for c in ('text:write',):
    for t in ('equivalent', 'complex', 'simplified'):
        for f in CASES[c][t]:
            if 'on {ref}' in f.template:
                f.template = f.template.replace(' on {ref}', ' on the [c:drawn.anchor|wall|wall|relation,sel]').replace('[c:drawn.anchor|wall|wall|relation,sel]', 'wall')
case('text:change', fr(['{pol}change the text of {tref} to {text}'.replace('change', '[t:change]'), '{pol}{make} {tref} say {text}', '{pol}rewrite {tref} as {text}'.replace('rewrite', '[t:rewrite]')],
                       OC),
     fr(['the date changed, so [t:change] {tref} to {text}'], OC), fr(['{tref} says {text}', 'text {text}'.replace('text {text}', '[t:text] {text}')], OC), text=True)
case('text:font', fr(['{pol}{make} {tref} {font}', '{pol}use a {font} font for {tref}'.replace('use', '[t:use]'), '{pol}write {tref} in {font}'.replace('write', '[t:write]'),
                      '{pol}{make} the letters of {tref} {font}', '{pol}{make} the font {font}', '{pol}switch {tref} to {font} lettering'.replace('switch', '[t:switch]')], OC),
     fr(['for a birthday card, {make} {tref} {font}'], OC), fr(['{font} font', '{font} letters', '{tref} in {font}', '{font} please'], OC), text=True)
case('text:style', fr(['{pol}{make} {tref} {bold}', '{pol}{make} {tref} {italic}', '{pol}{make} {tref} {align}', '{pol}{make} {tref} {bold} and {italic}', '{pol}{make} the text {bold}'],
                      OC),
     fr(['the title should stand out, {make} {tref} {bold}'], OC), fr(['{bold}', '{italic}', '{align}', '{tref} {bold}'], OC), text=True)
case('text:frame', fr(['{pol}put {tref} in {frame}'.replace('put', '[t:put]'), '{pol}{make} {tref} {frame}', '{pol}{add} {frame} around {tref}', '{pol}{make} it {frame}'], OC),
     fr(['she is talking, so [t:put] {tref} in {frame}'], OC), fr(['{frame}', 'in {frame}', '{tref} in {frame}'], OC), text=True)
for pname, eq, cx, sm in [
        ('turn', ['{pol}{rotate} {pref} {pturn}', '{pol}turn {pref} {pturn}'.replace('turn {pref}', '[t:turn] {pref}'), '{pol}{make} {pref} {pturn}'], ['it looks odd, {rotate} {pref} {pturn}'], ['{pref} {pturn}', '{rotate} {pref} {pturn}']),
        ('rotation', ['{pol}{rotate} {pref} {pdeg}', '{pol}{rotate} {pref} by {pdeg}'.replace('by {pdeg}', '{pdeg}'), '{pol}{make} {pref} lean {pdeg}'], ['so it looks windy, {rotate} {pref} {pdeg}'], ['{pref} {pdeg}', '{rotate} {pref} {pdeg}']),
        ('mirror', ['{pol}{flip} {pref} {pmirror}', '{pol}{flip} {pref}'.replace('{flip} {pref}', '{flip} {pref} [c:part.mirror|the other way|horizontal]'), '{pol}mirror {pref} {pmirror}'.replace('mirror {pref}', '[t:mirror] {pref}')],
         ['it points the wrong way, {flip} {pref} {pmirror}'], ['{flip} {pref} {pmirror}', '{pref} {pmirror}']),
        ('opacity', ['{pol}{make} {pref} {popacity}', '{pol}fade {pref} to {popacity}'.replace('fade', '[t:fade]'), '{pol}set {pref} to {popacity}'.replace('set', '[t:set]')], ['it covers the face, {make} {pref} {popacity}'], ['{pref} {popacity}']),
        ('effect', ['{pol}{add} {peffect} to {pref}', '{pol}{make} {pref} {peffect}', '{pol}put {peffect} on {pref}'.replace('put', '[t:put]')], ['for a spooky look, {add} {peffect} to {pref}'], ['{pref} {peffect}', '{peffect} on {pref}'])]:
    case(f'part:{pname}', fr(eq, PC), fr(cx, PC), fr(sm, PC), n=30)
for gname, eq, cx, sm in [
        ('turn', ['{pol}{rotate} {gref} {turn}', '{pol}{rotate} {gref} {deg}'], ['the whole group is crooked, {rotate} {gref} {turn}'], ['{gref} {turn}']),
        ('effect', ['{pol}{add} {effect} to {gref}', '{pol}{make} {gref} {effect}'], ['the whole thing should glow, {add} {effect} to {gref}'], ['{gref} {effect}']),
        ('opacity', ['{pol}{make} {gref} {opacity}', '{pol}fade {gref} to {opacity}'.replace('fade', '[t:fade]')], ['it is just background, {make} {gref} {opacity}'], ['{gref} {opacity}']),
        ('mirror', ['{pol}{flip} {gref} {mirror}', '{pol}{flip} {gref}'.replace('{flip} {gref}', '{flip} {gref} [c:drawn.mirror|the other way|horizontal]')], ['to face the house, {flip} {gref} {mirror}'], ['{flip} {gref} {mirror}'])]:
    case(f'group:{gname}', fr(eq, GC), fr(cx, GC), fr(sm, GC), n=26)
for gname in ('turn', 'effect', 'opacity', 'mirror'):
    CASES[f'group:{gname}']['scene_groups'] = True
case('page:filter', fr(['{pol}{make} the picture {filter}', '{pol}{add} a {filter} filter', '{pol}{make} it look {filter}', '{pol}put a {filter} filter on the drawing'.replace('put', '[t:put]'),
                        '{pol}{make} the whole scene {filter}', '{pol}use the {filter} filter'.replace('use', '[t:use]'), '{pol}{make} the drawing look like {filter}'], PG),
     fr(['it should feel like a memory, {make} the picture {filter}', 'for the bedtime story, {make} the scene {filter}'], PG),
     fr(['{filter}', '{filter} filter', '{filter} please', 'filter {filter}'.replace('filter {filter}', '[t:filter] {filter}')], PG))
case('make:styled', fr(['{pol}{draw} a [k:star|star] {turn}', '{pol}{draw} a [k:tree|tree] with {effect}', '{pol}{draw} a [k:house|house] in {fill}', '{pol}{draw} a [k:heart|heart] {opacity}',
                        '{pol}{draw} a [k:cloud|cloud] {deg}'.replace('{deg}', 'rotated {deg}')], OM),
     fr(['for the card {draw} a [k:star|star] with {effect}'], OM), fr(['a [k:star|star] with {effect}', '[k:boat|boat] {fill}'], OM))

# follow-ups: the previous message set a value; "a bit more", "back to normal", "the same for the others"
PREV = {
    'turn': (lambda r: r.choice(['tilt the tree a bit', 'rotate the boat slightly', 'turn the sign a little']), '[c:drawn.turn|{p}|tilt]', ['a bit more', 'a little more', 'more', 'slightly more', 'a tad more', 'bit more', 'more please', 'even more', 'keep going', 'a touch more']),
    'unturn': (lambda r: r.choice(['turn the car upside down', 'rotate the house 45 degrees', 'tilt the tree']), '[c:drawn.turn|{p}|upright]', ['back to normal', 'put it back upright', 'the right way up again', 'straighten it', 'straight again', 'make it straight', 'level it', 'back to how it was']),
    'uneffect': (lambda r: r.choice(['add a glow to the sun', 'give the house a shadow', 'make the moon neon']), '[c:drawn.effect|{p}|none]', ['back to normal', 'remove the effect', 'no effect', 'take that off', 'without the effect', 'turn the effect off', 'plain again']),
    'unfilter': (lambda r: r.choice(['make the picture sepia', 'add a night filter', 'make it look vintage']), '[c:page.filter|{p}|none]', ['back to normal', 'remove the filter', 'the original again', 'no filter', 'take the filter off', 'normal colours again', 'undo the filter look'.replace('undo the filter look', 'original colours')]),
    'unmirror': (lambda r: r.choice(['flip the dog', 'mirror the car horizontally', 'flip the boat']), '[c:drawn.mirror|{p}|none]', ['back to normal', 'flip it back', 'unflip it', 'undo the mirror'.replace('undo the mirror', 'not mirrored')]),
}
for name, (prev, markup, phrases) in PREV.items():
    frames = []
    for ph in phrases:
        m = markup.replace('{p}', ph)
        opn = PG if 'page.filter' in markup else OC
        frames.append(F(m, {**opn, 'fill': 'context'}, previous=prev))
    case(f'followup:{name}', frames[:4], frames[4:6] or frames[:1], frames[6:] or frames[:1], n=24)


def norm(t):
    return ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def main():
    rng = random.Random(SEED)
    out, seen, cov = [], set(), {}
    k = 0
    for cid, sp in CASES.items():
        made, misses, base = collections.Counter(), collections.Counter(), []
        tiers = [t for t in ('equivalent', 'complex', 'simplified') if sp[t]]
        attempts = 0
        while sum(made.values()) < sp['n'] and attempts < sp['n'] * 40:
            attempts += 1
            open_t = [t for t in tiers if misses[t] < 60] or tiers
            tier = min(open_t, key=lambda t: (made[t], tiers.index(t)))
            scene = DScene(rng, text=sp['text'])
            if sp.get('scene_groups') and not scene.groups:
                scene.groups = [{'name': rng.choice(GROUPS)}]
            try:
                markup, attrs, prev = rng.choice(sp[tier])(rng, scene)
                segs, n = parse(markup)
                text, reqs = assemble(segs, n, attrs)
            except Skip:
                continue
            key = norm(text) + '|' + str(prev)
            if key in seen:
                misses[tier] += 1
                continue
            seen.add(key)
            misses[tier] = 0
            k += 1
            r = {'format': 'psys2.ui-drawing-style-example/1', 'id': f'ui-drawing-style-v1-{k:05d}', 'world': 'drawing', 'text': text,
                 'context': {'existing': scene.existing(), 'previous': prev}, 'requests': reqs, 'style': f'drawing-style-{tier}', 'tier': tier,
                 'phase': 'direct', 'cohort': {'operation': attrs[0]['op'], 'case': cid, 'recipeFamily': f'{cid}#{int(hashlib.sha256(text.encode()).hexdigest(), 16) % 4}'},
                 'provenance': 'C1: generated paraphrase (ui-drawing-style-v1/generate.py); labels mark only what the text says'}
            out.append(r); base.append((r, segs, n, attrs, scene, tier, prev)); made[tier] += 1
        noisy = collections.Counter()
        for r, segs, n, attrs, scene, tier, prev in base:
            mode = rng.choice(NOISE_MODES)
            for _ in range(4):
                s2 = politeness(rng, segs, n == 1) if mode == 'polite' else apply_noise(rng, segs, mode, n == 1)
                text, reqs = assemble(s2, n, attrs)
                key = norm(text) + '|' + str(prev)
                if key in seen:
                    continue
                seen.add(key); k += 1
                out.append({**copy.deepcopy(r), 'id': f'ui-drawing-style-v1-{k:05d}', 'text': text, 'requests': reqs, 'style': f'drawing-style-{tier}-{mode}', 'robustness': True})
                noisy[mode] += 1
                break
        cov[cid] = {'base': dict(made), 'rows': sum(made.values()) + sum(noisy.values())}
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in out))
    (HERE / 'coverage.json').write_text(json.dumps({'rows': len(out), 'cases': cov}, indent=1) + '\n')
    print(json.dumps({'rows': len(out), 'cases': len(cov), 'below20': [c for c, v in cov.items() if v['rows'] < 20]}))


if __name__ == '__main__':
    main()
