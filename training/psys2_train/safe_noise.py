"""Meaning-preserving "plain" variant of a sentence (review F3).

The plain variant imitates sloppy typing: lowercase, no punctuation. It must never change values, so:
- punctuation is removed only at token boundaries (".", ",", ";", "?", "!" followed by a space or the end), never inside a
  token: decimals (45.5, 1,5), times (7:30), negative numbers, note names with accidentals (C#, Bb) and URLs survive;
- quoted spans ("...", '...', “...”) are payload: copied unchanged, case and punctuation included.
Returns the text; `plain_spans` also returns the protected spans for logging.
"""
import re

_QUOTED = re.compile(r'"[^"]*"|“[^”]*”|\'[^\']+\'(?=\W|$)')
_BOUNDARY_PUNCT = re.compile(r"[.,;?!]+(?=\s|$)")


def plain_spans(s):
    out, protected, last = [], [], 0
    for m in _QUOTED.finditer(s):
        out.append(_plain_free(s[last:m.start()]))
        out.append(m.group(0))
        protected.append((m.start(), m.end()))
        last = m.end()
    out.append(_plain_free(s[last:]))
    text = re.sub(r"\s+", " ", " ".join(p for p in out if p)).strip()
    return text, protected


def _plain_free(s):
    return _BOUNDARY_PUNCT.sub(" ", s.lower())


def plain(s):
    return plain_spans(s)[0]
