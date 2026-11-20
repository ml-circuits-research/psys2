#!/usr/bin/env python3
"""Generate ui-diagram-v2: voice/chat control of the Diagram editor (examples.jsonl, coverage.json).

Deterministic (fixed seed, no network). Every case is an operation x parameter x reference form x phrasing family; each case
gets authored paraphrase frames in three tiers (equivalent, complex, simplified) filled over generated observed scenes
(nodes n1.., links e1.., groups g1.. with human labels), plus robustness variants of the same rows (typo, missing space,
ASR-like substitutions, fillers, politeness). Labels mark only what the text says (spans are verbatim substrings).
Run: python3 generate.py && python3 validate.py
"""
import collections
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from engine import FrameError, Scene, apply_noise, assemble, family, parse, politeness  # noqa: E402
import frames  # noqa: E402

SEED = 20261120
PER_CASE = 34          # base rows per case (spread over the three tiers)
NOISE_SHARE = 0.95      # robustness variants per base row (expected)
NOISE_MODES = ['typo', 'typo', 'nospace', 'asr', 'asr', 'filler', 'polite']


def norm(text):
    return ' '.join(re.findall(r"[a-z0-9']+", text.lower()))


def realise(rng, case, frame, scene, tier):
    markup, attrs = frame(rng, scene)
    if isinstance(attrs, dict):
        attrs = [attrs]
    segs, n = parse(markup)
    return segs, n, attrs


def row(case_id, tier, style, text, reqs, scene, base_id=None, rid=None):
    return {'format': 'psys2.ui-diagram-example/2', 'id': rid, 'world': 'diagram', 'text': text,
            'context': {'existing': scene.existing(), 'previous': None}, 'requests': reqs,
            'style': style, 'tier': tier, 'phase': 'direct',
            'cohort': {'operation': reqs[0]['_op'] if len(reqs) == 1 else 'compound', 'case': case_id,
                       'recipeFamily': family(case_id, base_id or text)},
            'nativeTool': None,
            'provenance': f'C1: generated paraphrase of case {case_id} (ui-diagram-v2/frames.py); labels mark only what the text says'}


def main():
    rng = random.Random(SEED)
    out, seen, coverage, errors = [], set(), collections.OrderedDict(), []
    held = HERE / 'heldout-voice.jsonl'
    if held.exists():  # the held-out voice set is never generated into training
        seen |= {norm(json.loads(l)['text']) for l in held.read_text().splitlines() if l.strip()}
    counter = 0
    for case_id, spec in frames.CASES.items():
        made = collections.Counter()
        tiers = [t for t in ('equivalent', 'complex', 'simplified') if spec.get(t)]
        target = spec.get('n', PER_CASE)
        attempts = 0
        base_rows = []
        misses = collections.Counter()
        while sum(made.values()) < target and attempts < target * 40:
            attempts += 1
            open_tiers = [t for t in tiers if misses[t] < 60] or tiers
            tier = min(open_tiers, key=lambda t: (made[t], tiers.index(t)))
            frame = rng.choice(spec[tier])
            scene = spec['scene'](rng) if 'scene' in spec else Scene(rng)
            try:
                segs, n, attrs = realise(rng, case_id, frame, scene, tier)
                text, reqs = assemble(segs, n, attrs)
            except frames.Skip:
                continue
            except (FrameError, ValueError, KeyError, IndexError) as e:
                errors.append(f'{case_id}: {e}')
                continue
            key = norm(text)
            if key in seen:
                misses[tier] += 1
                continue
            seen.add(key)
            misses[tier] = 0
            for q, a in zip(reqs, attrs):
                q['_op'] = a['op']
            counter += 1
            r = row(case_id, tier, f'diagram-{tier}', text, reqs, scene, rid=f'ui-diagram-v2-{counter:05d}')
            out.append(r)
            base_rows.append((r, segs, n, attrs, scene, tier))
            made[tier] += 1
        noisy = collections.Counter()
        for r, segs, n, attrs, scene, tier in base_rows:
            if rng.random() > NOISE_SHARE:
                continue
            mode = rng.choice(NOISE_MODES)
            for _ in range(4):
                s2 = politeness(rng, segs, n == 1) if mode == 'polite' else apply_noise(rng, segs, mode, n == 1)
                try:
                    text, reqs = assemble(s2, n, attrs)
                except (FrameError, ValueError) as e:
                    errors.append(f'{case_id} noise {mode}: {e}')
                    break
                key = norm(text)
                if key in seen or text == r['text']:
                    continue
                seen.add(key)
                for q, a in zip(reqs, attrs):
                    q['_op'] = a['op']
                counter += 1
                out.append(row(case_id, tier, f'diagram-{tier}-{mode}', text, reqs, scene, base_id=r['text'], rid=f'ui-diagram-v2-{counter:05d}'))
                noisy[mode] += 1
                break
        coverage[case_id] = {'base': dict(made), 'rows': sum(made.values()) + sum(noisy.values()), 'robustness': dict(noisy),
                             'what': spec.get('what', '')}
    for r in out:
        for q in r['requests']:
            q.pop('_op', None)
    if errors:
        print('\n'.join(sorted(set(errors))[:60]))
        raise SystemExit(f'{len(errors)} frame errors')
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in out))
    styles = collections.Counter(r['style'].split('-', 2)[-1] if r['style'].count('-') > 1 else 'base' for r in out)
    summary = {'rows': len(out), 'cases': len(coverage), 'byTier': dict(collections.Counter(r['tier'] for r in out)),
               'byVariant': dict(styles), 'compoundRows': sum(len(r['requests']) > 1 for r in out),
               'questionRows': sum(any(q['act'] == 'answer' for q in r['requests']) for r in out),
               'casesBelow20': [c for c, v in coverage.items() if v['rows'] < 20]}
    (HERE / 'coverage.json').write_text(json.dumps({'summary': summary, 'cases': coverage}, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
