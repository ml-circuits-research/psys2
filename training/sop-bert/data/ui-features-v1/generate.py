#!/usr/bin/env python3
"""Avatar part feature changes, version 1: the length of a part (absolute and comparative) and its other declared
features (feel: curly, straight, wavy; thick, thin, bushy brows), with human words only.

The feature keys and their values come from the catalog: k.faces.variant declares `length` (short, medium, long) and
`feel`; k.values declares the ordered scale `length` (short < medium < long). `part.length` is the reader key of the
ordinal feature: an absolute value ("long hair") is a `degree` condition with the scale step as value; a comparative
("shorter", "a lot longer") is `delta` with `step` more/less (much_ when intensified), the comparative word as
`value_span` and no value, as for part.size in ui-comparatives-v1. Other features keep the existing `part.value`
convention (ui-coverage-v2): the feature word as value. The target is the part, by its kind word ("her hair", "the
beard": kind, fill=description) or a pronoun (fill=context).

Texts are authored paraphrases in three tiers per case (equivalent, complex, simplified). Markers: {trigger},
<kind phrase noun>, [value span]. Writes examples.jsonl, inventory.json (the part.length key, values read from the
catalog) and report.json. Not execution-verified (nativeTool: null).
"""
import collections
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
KNOWLEDGE = REPO.parent / 'sop-knowledge-worlds' / 'docs' / 'worlds'

CONTEXT = [{"kind": "avatar", "name": "Avatar"}, {"kind": "hair", "name": "fringe"}, {"kind": "back hair", "name": "pigtails"},
           {"kind": "eyes", "name": "eyes"}, {"kind": "eyebrows", "name": "brows"}, {"kind": "nose", "name": "nose"},
           {"kind": "mouth", "name": "lips"}, {"kind": "ears", "name": "ears"}, {"kind": "hat", "name": "bow"},
           {"kind": "cheeks", "name": "freckles"}, {"kind": "beard", "name": "stubble"}, {"kind": "head", "name": "head"},
           {"kind": "neck", "name": "neck"}, {"kind": "shoulders", "name": "shirt"}]

COMPARATIVE = {'longer': 'more', 'shorter': 'less'}
INTENSIFIERS = ('much', 'lot', 'way', 'far', 'considerably')

# case -> (key, tier -> texts). key 'length' = part.length; 'value' = part.value.
CASES = {
    'avatar.part.length:shorter': ('length', {
        'equivalent': [
            "{make} her <hair> [shorter]", "{cut} her <hair> [shorter]", "{make} the <hair> [shorter]",
            "can you {make} her <hair> a bit [shorter]", "{give} her [shorter] <hair>", "I'd like her <hair> [shorter]",
            "{trim} her <hair> [shorter]", "{make} the avatar's <hair> [shorter]", "{change} her <hair> to be [shorter]",
            "please {make} her <hair> a little [shorter]", "{make} her <hair> a lot [shorter]", "{go} [shorter] with her <hair>",
        ],
        'complex': [
            "it's summer and she wants a fresh look, so {make} her <hair> [shorter]",
            "her <hair> covers too much of the picture; could you {make} it [shorter]?",
            "if it isn't too much trouble, {cut} her <hair> a bit [shorter] for the school photo",
            "she just came back from the hairdresser, so her <hair> should be [shorter] now",
            "I think the avatar would look sportier, {make} the <hair> [shorter] please",
            "hmm, the long look doesn't suit her - {make} her <hair> way [shorter]",
            "for the swimming team picture, {make} her <hair> [shorter] than it is",
        ],
        'simplified': [
            "[shorter] <hair>", "<hair> [shorter]", "[shorter] <hair> please", "a bit [shorter] on the <hair>",
            "her <hair>, [shorter]", "[shorter] <hair> for her", "the <hair> [shorter]",
        ],
    }),
    'avatar.part.length:longer': ('length', {
        'equivalent': [
            "{make} the <hair> [longer]", "{make} her <hair> [longer]", "{let} her <hair> grow [longer]",
            "can you {make} her <hair> a bit [longer]", "{give} her [longer] <hair>", "I want her <hair> [longer]",
            "{make} the avatar's <hair> [longer]", "{change} her <hair> to be [longer]", "please {make} her <hair> a little [longer]",
            "{make} her <hair> much [longer]", "{grow} her <hair> out [longer]", "{go} [longer] with the <hair>",
        ],
        'complex': [
            "she's going to a wedding next week, so {make} her <hair> [longer]",
            "the short cut looks a bit harsh on her; could you {make} the <hair> [longer]?",
            "if possible, {make} her <hair> a little [longer] so it reaches her shoulders",
            "my daughter wants the avatar to match her, so {make} its <hair> [longer]",
            "now that winter is coming, {let} her <hair> grow a lot [longer]",
            "I keep thinking the <hair> is too short - {make} it [longer], please",
            "for the fairy tale theme, {make} her <hair> way [longer] than now",
        ],
        'simplified': [
            "[longer] <hair>", "<hair> [longer]", "[longer] <hair> please", "a bit [longer] on the <hair>",
            "her <hair>, [longer]", "the <hair> [longer]", "[longer] <hair> for her",
        ],
    }),
    'avatar.part.length:long': ('length', {
        'equivalent': [
            "{give} her [long] <hair>", "{make} her <hair> [long]", "{make} the <hair> [long]", "I want her <hair> [long]",
            "{change} her <hair> to [long]", "{set} her <hair> to [long]", "{give} the avatar [long] <hair>",
            "{switch} her to [long] <hair>", "can she {have} [long] <hair>", "{put} [long] <hair> on her",
            "{make} the avatar's <hair> [long]", "please {give} her [long] <hair>",
        ],
        'complex': [
            "she plays a princess in the story, so {give} her [long] <hair>",
            "could you {make} her <hair> [long] like it was in the first version?",
            "I don't like the short cut on her; {give} her [long] <hair> instead",
            "for the rock band poster she should {have} really [long] <hair>",
            "if you can, {change} her <hair> to [long] and keep the colour",
            "she has been growing it for years, so her <hair> should be [long]",
            "my friend has [long] <hair>, so {make} the avatar look like that",
        ],
        'simplified': [
            "[long] <hair>", "[long] <hair> please", "<hair> [long]", "[long] <hair> for her", "her <hair> [long]",
            "the <hair>, [long]", "[long] <hair> now",
        ],
    }),
    'avatar.part.length:short': ('length', {
        'equivalent': [
            "{give} her [short] <hair>", "{make} her <hair> [short]", "{make} the <hair> [short]", "I want her <hair> [short]",
            "{change} her <hair> to [short]", "{set} her <hair> to [short]", "{give} the avatar [short] <hair>",
            "{switch} her to [short] <hair>", "can she {have} [short] <hair>", "{cut} her <hair> [short]",
            "{make} the avatar's <hair> [short]", "please {give} her [short] <hair>",
        ],
        'complex': [
            "she is a football player in the game, so {give} her [short] <hair>",
            "could you {make} her <hair> [short] like it was before?",
            "the long look is too much; {give} her [short] <hair> instead",
            "for the astronaut picture she should {have} [short] <hair> under the helmet",
            "if you can, {change} her <hair> to [short] but keep the colour",
            "she got a pixie cut yesterday, so her <hair> should be [short]",
            "my sister has [short] <hair>, so {make} the avatar match her",
        ],
        'simplified': [
            "[short] <hair>", "[short] <hair> please", "<hair> [short]", "[short] <hair> for her", "her <hair> [short]",
            "the <hair>, [short]", "[short] <hair> now",
        ],
    }),
    'avatar.part.length:medium': ('length', {
        'equivalent': [
            "{give} her [medium] length <hair>", "{make} her <hair> [medium] length", "{set} the <hair> to [medium] length",
            "I want her <hair> at [medium] length", "{change} her <hair> to [medium] length", "{give} the avatar [medium] <hair>",
            "{make} the <hair> [medium] length", "can she {have} [medium] length <hair>", "{switch} her <hair> to [medium]",
            "please {make} her <hair> [medium] length",
        ],
        'complex': [
            "not too long and not too short - {give} her [medium] length <hair>",
            "she's a teacher in the story, so {make} her <hair> [medium] length",
            "could you {set} her <hair> to [medium] length, the long one is too much?",
            "I think [medium] length <hair> would suit her better, {change} it",
            "for the office scene she should {have} [medium] length <hair>",
            "if it's possible, {make} the <hair> [medium] length and keep everything else",
            "the short cut looks odd, so {go} for [medium] length <hair>",
        ],
        'simplified': [
            "[medium] length <hair>", "[medium] <hair> please", "<hair> [medium] length", "[medium] length <hair> for her",
            "her <hair> at [medium] length", "the <hair>, [medium] length", "[medium] <hair>",
        ],
    }),
    'avatar.part.length:beard': ('length', {
        'equivalent': [
            "{make} his <beard> [longer]", "{make} the <beard> [shorter]", "{trim} his <beard> [shorter]",
            "{let} his <beard> grow [longer]", "{give} him a [long] <beard>", "{give} him a [short] <beard>",
            "{make} his <beard> [long]", "{make} the <beard> a bit [shorter]", "can you {make} his <beard> [longer]",
            "{change} his <beard> to [short]", "I want his <beard> much [longer]",
        ],
        'complex': [
            "he's a wizard in the story, so {give} him a really [long] <beard>",
            "the <beard> looks messy; could you {trim} it a bit [shorter]?",
            "he hasn't shaved for weeks, so his <beard> should be [longer]",
            "for the job interview picture, {make} his <beard> [short] and neat",
            "if you can, {make} the <beard> a lot [longer] like a sailor's",
            "my grandpa has a [long] <beard>, so {make} the avatar like him",
            "it's too bushy for a teenager - {make} his <beard> [shorter]",
        ],
        'simplified': [
            "[longer] <beard>", "[shorter] <beard>", "[long] <beard> please", "<beard> [shorter]", "a [short] <beard>",
            "the <beard>, [longer]", "his <beard> [long]",
        ],
    }),
    'avatar.part.value:curly': ('value', {
        'equivalent': [
            "{make} her <hair> [curly]", "{give} her [curly] <hair>", "{make} the <hair> [curly]", "I want her <hair> [curly]",
            "{change} her <hair> to [curly]", "{switch} her <hair> to [curly]", "{give} the avatar [curly] <hair>",
            "can her <hair> {be} [curly]", "{curl} her <hair> so it's [curly]", "please {make} her <hair> [curly]",
        ],
        'complex': [
            "she got a perm last week, so her <hair> should be [curly] now",
            "could you {make} her <hair> [curly] like in the cartoon?",
            "the straight look is a bit boring; {give} her [curly] <hair> instead",
            "for the 80s party picture, {make} the <hair> really [curly]",
            "my niece has [curly] <hair>, so {make} the avatar look like her",
            "if it's not a problem, {change} her <hair> to [curly] and keep the colour",
            "she wants a playful look, so {make} her <hair> [curly], please",
        ],
        'simplified': [
            "[curly] <hair>", "[curly] <hair> please", "<hair> [curly]", "[curly] <hair> for her", "her <hair> [curly]",
            "the <hair>, [curly]", "[curly] <hair> now",
        ],
    }),
    'avatar.part.value:straight': ('value', {
        'equivalent': [
            "{make} her <hair> [straight]", "{give} her [straight] <hair>", "{make} the <hair> [straight]",
            "I want her <hair> [straight]", "{change} her <hair> to [straight]", "{switch} her <hair> to [straight]",
            "{give} the avatar [straight] <hair>", "{straighten} her <hair> so it's [straight]", "please {make} the <hair> [straight]",
            "can her <hair> {be} [straight]",
        ],
        'complex': [
            "she used a straightener this morning, so her <hair> should be [straight]",
            "could you {make} her <hair> [straight] like it was before the perm?",
            "the curls look too wild; {give} her [straight] <hair> instead",
            "for the business photo, {make} the <hair> [straight] and neat",
            "my mum has [straight] <hair>, so {make} the avatar like her",
            "if you can, {change} her <hair> to [straight] and leave the length",
            "she wants to look calm and tidy, so {make} her <hair> [straight]",
        ],
        'simplified': [
            "[straight] <hair>", "[straight] <hair> please", "<hair> [straight]", "[straight] <hair> for her",
            "her <hair> [straight]", "the <hair>, [straight]", "[straight] <hair> now",
        ],
    }),
    'avatar.part.value:wavy': ('value', {
        'equivalent': [
            "{make} her <hair> [wavy]", "{give} her [wavy] <hair>", "{make} the <hair> [wavy]", "I want her <hair> [wavy]",
            "{change} her <hair> to [wavy]", "{switch} her <hair> to [wavy]", "{give} the avatar [wavy] <hair>",
            "can her <hair> {be} [wavy]", "please {make} her <hair> a bit [wavy]", "{make} the avatar's <hair> [wavy]",
        ],
        'complex': [
            "she just came back from the beach, so her <hair> should look [wavy]",
            "could you {make} her <hair> [wavy] like a mermaid's?",
            "straight is too plain and curly too much; {give} her [wavy] <hair>",
            "for the summer poster, {make} the <hair> softly [wavy]",
            "my cousin has [wavy] <hair>, so {make} the avatar look like her",
            "if it's possible, {change} her <hair> to [wavy] and keep the fringe colour",
            "she wants a relaxed look, so {make} her <hair> [wavy], please",
        ],
        'simplified': [
            "[wavy] <hair>", "[wavy] <hair> please", "<hair> [wavy]", "[wavy] <hair> for her", "her <hair> [wavy]",
            "the <hair>, [wavy]", "[wavy] <hair> now",
        ],
    }),
    'avatar.part.value:brows': ('value', {
        'equivalent': [
            "{make} her <eyebrows> [thick]", "{make} the <eyebrows> [thin]", "{give} her [bushy] <eyebrows>",
            "{make} his <eyebrows> [bushy]", "{change} the <eyebrows> to [thin]", "{give} him [thick] <eyebrows>",
            "I want the <eyebrows> [thin]", "{make} the avatar's <eyebrows> [thick]", "{switch} her <eyebrows> to [arched]",
            "please {make} his <eyebrows> [thick]",
        ],
        'complex': [
            "he looks too friendly for the villain, so {make} his <eyebrows> [thick]",
            "could you {make} her <eyebrows> [thin] like in old movies?",
            "the brows look too heavy; {change} the <eyebrows> to [thin]",
            "for the grandpa character, {give} him [bushy] <eyebrows>",
            "she always looks surprised in photos, so {make} her <eyebrows> [arched]",
            "if you can, {make} the <eyebrows> [thick] but keep their colour",
            "my uncle has really [bushy] <eyebrows>, {make} the avatar like him",
        ],
        'simplified': [
            "[thick] <eyebrows>", "[thin] <eyebrows> please", "<eyebrows> [bushy]", "[arched] <eyebrows>",
            "her <eyebrows> [thin]", "the <eyebrows>, [thick]", "[bushy] <eyebrows> for him",
        ],
    }),
}


def catalog_values():
    """The ordered steps of the scale `length` (k.values) and the enum of k.faces.variant.length."""
    scales = (KNOWLEDGE / 'k.values' / 'shards' / 'scales.sop').read_text()
    steps = sorted(((int(m.group(2)), m.group(1)) for m in re.finditer(r'k\.values\.step scale=length name=(\w+) rank=(\d+)', scales)))
    schema = (KNOWLEDGE / 'k.faces' / 'schema.sop').read_text()
    enum = re.search(r'@k\.faces\.variant\.length core\.slot [^\n]*', schema).group(0)
    declared = re.findall(r'enum=(\w+)', enum)
    values = [name for _, name in steps]
    if sorted(values) != sorted(declared):
        raise SystemExit(f'k.values length scale {values} differs from k.faces.variant.length {declared}')
    feel = re.findall(r'enum=(\w+)', re.search(r'@k\.faces\.variant\.feel core\.slot [^\n]*', schema).group(0))
    return values, set(feel)


def parse(marked):
    """Strip the markers; return text, trigger, kind, value spans."""
    text, spans, pos = '', {}, 0
    for m in re.finditer(r'\{([^}]+)\}|<([^>]+)>|\[([^\]]+)\]', marked):
        text += marked[pos:m.start()]
        word = m.group(1) or m.group(2) or m.group(3)
        role = 'trigger' if m.group(1) else 'kind' if m.group(2) else 'value'
        if role in spans:
            raise ValueError('duplicate marker: ' + marked)
        spans[role] = word
        text += word
        pos = m.end()
    text += marked[pos:]
    for role, word in spans.items():
        if len(re.findall(r'\b' + re.escape(word) + r'\b', text)) != 1:
            raise ValueError(f'{role} span not unique: {marked}')
    return text, spans


def main():
    lengths, feel = catalog_values()
    rows, seen, counts = [], set(), collections.Counter()
    for case, (key, tiers) in CASES.items():
        for tier, texts in tiers.items():
            for n, marked in enumerate(texts):
                text, spans = parse(marked)
                norm = re.sub(r'[^a-z0-9 ]', '', text.lower()).strip()
                if norm in seen:
                    raise ValueError('duplicate text: ' + text)
                seen.add(norm)
                value = spans['value']
                c = {'key': 'part.' + key, 'value_span': value, 'phase': 'result', 'polarity': 'positive', 'character': 'requirement'}
                if key == 'length':
                    if value in COMPARATIVE:
                        before = re.findall(r'[a-z]+', text[:text.index(value)].lower())[-2:]
                        c.update({'operator': 'delta', 'step': ('much_' if any(w in INTENSIFIERS for w in before) else '') + COMPARATIVE[value]})
                    elif value in lengths:
                        c.update({'operator': 'degree', 'value': value})
                    else:
                        raise ValueError('not a length step: ' + value)
                else:
                    if value not in feel:
                        raise ValueError('not a declared feel: ' + value)
                    c.update({'operator': 'eq', 'value': value})
                target = {'type': 'part', 'mode': 'existing', 'determiner': 'definite', 'fill': 'description',
                          'kind': spans['kind'], 'kind_span': spans['kind']}
                request = {'span': text, 'act': 'change', 'mood': 'do', 'target': target, 'constraints': [c]}
                if 'trigger' in spans:
                    request['trigger'] = spans['trigger']
                counts[(case, tier)] += 1
                rows.append({'format': 'psys2.ui-features-example/1', 'id': f'ui-features-v1-{len(rows):05d}', 'world': 'avatar',
                             'text': text, 'context': {'existing': CONTEXT, 'previous': None}, 'requests': [request],
                             'style': 'coverage-' + tier, 'tier': tier, 'phase': 'direct',
                             'cohort': {'operation': 'avatar.part.change' if key == 'length' else 'avatar.part.feature', 'case': case,
                                        'recipeFamily': f'{case}#{n % 4}'},
                             'nativeTool': None, 'provenance': 'C1: authored paraphrase (ui-features-v1/generate.py); labels mark only what the text says'})
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    inventory = {'avatar': {'part': {'keys': {'length': {'head': 'class', 'concept': 'length', 'values': lengths,
                 'src': 'k.faces.variant.length on the k.values scale length (catalog)'}}}}}
    (HERE / 'inventory.json').write_text(json.dumps(inventory, indent=1) + '\n')
    report = {'rows': len(rows), 'cases': {case: {tier: counts[(case, tier)] for tier in ('equivalent', 'complex', 'simplified')} for case in CASES}}
    (HERE / 'report.json').write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
