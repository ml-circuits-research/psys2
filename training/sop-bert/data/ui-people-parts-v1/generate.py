#!/usr/bin/env python3
"""Generate ui-people-parts-v1: people drawn as persons and the parts of drawn things edited by name (Drawing).

Deterministic, no network. The paraphrases below are authored data in an inline markup, one request per row:
  !draw!          trigger (surface verb)
  *roof*          kind span; *eys|eyes* overrides the lemma (typos, plurals), *old man* keeps a compound kind
  @the house@     the owner of the part (part.owner, its value the owner phrase without its determiner)
  ^red^           a colour (drawn.colour on a drawn thing, part.colour on a part)
Marker characters never occur in the final text.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PEOPLE = [{"kind": "person", "name": "Person"}, {"kind": "girl", "name": "Girl"}, {"kind": "house", "name": "House"}]
THINGS = [{"kind": "house", "name": "House"}, {"kind": "sun", "name": "Sun"}, {"kind": "lake", "name": "Lake"}, {"kind": "tree", "name": "Tree"}]
EMPTY = []

# case -> (act, target type, mode, context, rows)
CASES = {
 "P1-person-kinds": ("make", "drawn", "new", EMPTY, [
  "!draw! a *boy*", "!draw! a *girl*", "!add! a *woman*", "!draw! a *man* please", "can you !draw! a *child*?", "!draw! a *baby*",
  "!put! a *grandmother* in the picture", "!draw! a *grandfather*", "!make! a *person*", "!sketch! a *boy*", "i !want! a *girl*",
  "!draw! me a *lady*", "!add! a *kid*", "!draw! a *teenager*", "!draw! a little *boy*", "!draw! a *gril|girl*", "!add! a *grandma*",
  "!draw! a *grandpa* pls", "please !draw! a *woman* for me", "!give! me a *man* to draw", "!draw! a *person* here", "!add! a *baby* to the drawing",
  "could you !draw! a *granny*?", "!sketch! a *girl*"]),
 "P2-person-with-age": ("make", "drawn", "new", EMPTY, [
  "!draw! an *old man*", "!draw! an *old woman*", "!add! an *old lady*", "!draw! an *old person*", "can you !draw! an *old man*?",
  "!make! an *elderly woman*", "!draw! a *young girl*", "!draw! a *young man*", "!add! an *elderly man*", "please !draw! an *old woman*",
  "!sketch! an *old man* with a stick", "!draw! a *little girl*", "!put! an *old lady* in the garden", "!draw! an *old guy*",
  "i !want! an *old woman* here", "!draw! a *young woman*", "!add! an *old person*", "!draw! a *tiny baby*", "!draw! an *ol man|old man*",
  "!draw! an *aged man*", "!give! me an *old woman*"]),
 "P3-dress-person": ("make", "part", "new", PEOPLE, [
  "!put! a *hat* on @him@", "!give! @her@ a *hat*", "!put! *glasses* on @the girl@", "!give! @the man@ a *jacket*", "!add! a ^red^ *t-shirt* to @the boy@",
  "!give! @the boy@ a ^red^ *t-shirt*", "!put! a *cap* on @his@ head", "!dress! @her@ in a *dress*", "!give! @the girl@ a ^blue^ *dress*",
  "!add! *boots* to @the person@", "!put! *shoes* on @her@", "!give! @him@ a *coat*", "!add! a *scarf* to @the woman@", "!give! @the woman@ *glasses*",
  "!put! a ^green^ *jumper* on @him@", "!give! @her@ *earrings*", "!add! a *beard* to @the man@", "!give! @the old man@ a *moustache*",
  "!put! a *hat* on @the person@", "!give! @the kid@ *trainers*", "!add! ^black^ *trousers* to @him@", "!put! a *skirt* on @the girl@",
  "!give! @her@ a ^yellow^ *jacket*", "!add! *sunglasses* to @the boy@"]),
 "P4-undress-person": ("remove", "part", "existing", PEOPLE, [
  "!take off! @her@ *jacket*", "!remove! @his@ *hat*", "!take off! @the girl@'s *glasses*", "!remove! the *coat* from @the man@", "!take! @his@ *shoes* off",
  "!remove! @her@ *earrings*", "!take off! the *hat*", "!remove! @the boy@'s *cap*", "!get rid of! @his@ *beard*", "!remove! the *glasses* from @her@",
  "!take off! @his@ *jumper*", "!remove! @the woman@'s *scarf*", "!take away! @her@ *hat*", "!remove! @his@ *moustache*", "!take off! @the person@'s *boots*",
  "!remove! the *jacket*", "!undress! @him@ of his *coat*", "!take! the *hat* off @the girl@", "!remove! @her@ *dress*", "!take off! @his@ *glases|glasses*",
  "!lose! the *cap*"]),
 "P5-person-part-colour": ("change", "part", "existing", PEOPLE, [
  "!make! @her@ *hair* ^red^", "!colour! @his@ *hair* ^black^", "!make! @the girl@'s *hair* ^blond^", "!paint! @her@ *dress* ^blue^", "!make! @his@ *shirt* ^green^",
  "!turn! @her@ *hair* ^brown^", "!make! @the boy@'s *t-shirt* ^yellow^", "!change! @his@ *trousers* to ^black^", "!make! @her@ *shoes* ^red^", "!colour! @the man@'s *jacket* ^grey^",
  "!make! @his@ *eyes* ^blue^", "!make! @her@ *eyes* ^green^", "!make! the *hat* ^purple^", "!paint! @his@ *coat* ^brown^", "!make! @the woman@'s *skirt* ^pink^",
  "!turn! @the person@'s *hair* ^grey^", "!make! @his@ *beard* ^white^", "!dye! @her@ *hair* ^orange^", "!make! @her@ *jumper* ^red^", "!make! @the kid@'s *shirt* ^blue^",
  "!make! @his@ *har|hair* ^brown^"]),
 "P6-thing-part-colour": ("change", "part", "existing", THINGS, [
  "!make! the *roof* ^blue^", "!colour! the *door* ^green^", "!make! @the sun@'s *rays* ^orange^", "!paint! the *roof* of @the house@ ^red^", "!make! the *windows* ^yellow^",
  "!make! the *chimney* ^black^", "!turn! the *water* ^dark blue|dark blue^", "!make! @the lake@'s *water* ^green^", "!colour! the *walls* ^white^", "!make! the *trunk* ^brown^",
  "!paint! the *door* of @the house@ ^blue^", "!make! the *rays* ^red^", "!make! the *crown* of @the tree@ ^dark green|dark green^", "!change! the *roof* to ^grey^",
  "!make! the *disc* ^orange^", "!colour! the *windows* ^light blue|light blue^", "!make! @the house@'s *chimney* ^red^", "!paint! the *rof|roof* ^purple^", "!make! the *door* ^brown^",
  "!make! the *leaves* ^yellow^", "!turn! the *roof* ^black^", "!make! the *ripples* ^white^"]),
 "P7-thing-part-remove": ("remove", "part", "existing", THINGS, [
  "!remove! the *chimney*", "!take away! the *door*", "!delete! the *rays*", "!remove! @the sun@'s *rays*", "!remove! the *chimney* from @the little house@",
  "!get rid of! the *windows*", "!delete! the *roof*", "!remove! the *ripples*", "!take off! the *chimney*", "!erase! the *door* of @the house@",
  "!remove! the *windows* from @the house@", "!delete! the *chimny|chimney*", "!remove! the *trunk*", "!erase! @the lake@'s *ripples*", "!remove! the *knob*",
  "!take away! the *rays* of @the sun@", "!delete! the *door*", "!remove! the *leaves*", "!rub out! the *chimney*", "!remove! the *roof* from @the house@", "!clear! the *windows*"]),
 "P8-thing-part-add": ("make", "part", "new", THINGS, [
  "!put! *eyes* on @the sun@", "!add! a *smile* to @the sun@", "!give! @the sun@ *eyes*", "!add! a *chimney* to @the house@", "!put! the *chimney* back",
  "!give! @the sun@ a *face*", "!add! *eyes* to @the sun@", "!draw! a *smile* on @the sun@", "!put! a *door* on @the house@", "!add! *cheeks* to @the sun@",
  "!give! @the house@ a *chimney*", "!put! some *eys|eyes* on @the sun@", "!add! a *mouth* to @the sun@", "!put! the *door* back", "!draw! *eyes* on @the sun@",
  "!add! *windows* to @the house@", "!give! @the sun@ a *smile*", "!put! the *rays* back on @the sun@", "!add! a *nose* to @the sun@", "!put! a *hat* on @the sun@",
  "!add! the *windows* back"]),
}

TOKEN = re.compile(r'!([^!]+)!|\*([^*]+)\*|@([^@]+)@|\^([^^]+)\^')
DET = re.compile(r"^(the|a|an|his|her|their|my|some)\s", re.I)


def parse(markup):
    text, spans = '', []
    pos = 0
    for m in TOKEN.finditer(markup):
        text += markup[pos:m.start()]
        kind = 'trigger' if m.group(1) else 'kind' if m.group(2) else 'owner' if m.group(3) else 'colour'
        raw = next(g for g in m.groups() if g)
        surface, _, lemma = raw.partition('|')
        spans.append((kind, surface, lemma or None, len(text)))
        text += surface
        pos = m.end()
    text += markup[pos:]
    return text, spans


def lemma_of(kind, surface, given):
    if given:
        return given
    if kind == 'kind' and surface.endswith('s') and surface not in ('glasses', 'sunglasses', 'trousers', 'jeans', 'shorts', 'boots', 'shoes', 'trainers', 'earrings', 'eyes', 'rays', 'windows', 'cheeks', 'ripples', 'leaves', 'walls'):
        return surface[:-1]
    return surface


def build():
    rows, n = [], 0
    for case, (act, ttype, mode, context, items) in CASES.items():
        for markup in items:
            text, spans = parse(markup)
            target = {"type": ttype, "mode": mode}
            q = {"span": text, "act": act, "mood": "do", "target": target, "constraints": []}
            for kind, surface, lemma, at in spans:
                if kind == 'trigger':
                    q["trigger"] = surface
                elif kind == 'kind':
                    before = text[:at].rstrip().split(' ')[-1].lower() if text[:at].strip() else ''
                    target["determiner"] = 'indefinite' if before in ('a', 'an', 'some') else 'definite' if before in ('the', 'his', 'her', "'s") or before.endswith("'s") else ('indefinite' if mode == 'new' else 'definite')
                    if mode == 'existing':
                        target["fill"] = 'description'
                    target["kind"] = lemma_of('kind', surface, lemma)
                    target["kind_span"] = surface
                elif kind == 'owner':
                    value = DET.sub('', surface)
                    q["constraints"].append({"key": "part.owner", "operator": "eq", "phase": "result", "polarity": "positive", "character": "requirement", "value": value, "value_span": surface})
                else:
                    key = 'part.colour' if ttype == 'part' else 'drawn.colour'
                    q["constraints"].append({"key": key, "operator": "eq", "phase": "result", "polarity": "positive", "character": "requirement", "value": lemma or surface, "value_span": surface})
            if "determiner" not in target:
                target["determiner"] = 'indefinite' if mode == 'new' else 'definite'
            rows.append({"format": "psys2.ui-people-parts-example/1", "id": f"ui-people-parts-{n:05d}", "world": "drawing", "text": text,
                         "context": {"existing": context, "previous": None}, "requests": [q], "tier": "people-parts", "style": case.split('-', 1)[1],
                         "cohort": {"case": case, "requests": 1}, "provenance": "ui-people-parts-v1/generate.py (authored paraphrases)"})
            n += 1
    return rows


if __name__ == '__main__':
    rows = build()
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))
    counts = {}
    for r in rows:
        counts[r['cohort']['case']] = counts.get(r['cohort']['case'], 0) + 1
    (HERE / 'report.json').write_text(json.dumps({"rows": len(rows), "cases": counts}, indent=2) + '\n')
    print(len(rows), counts)
