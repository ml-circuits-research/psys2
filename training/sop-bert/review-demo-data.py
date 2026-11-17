"""C1 whole-message relevance review against exposed tool declarations; never relabels intent."""
import argparse, collections, hashlib, importlib.util, json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def module(path):
    spec = importlib.util.spec_from_file_location('key_supervision_for_review', path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def review_row(row, source, profile, converter, registry, aliases):
    """Return scope status; unsupported relevant clauses exclude the whole message."""
    reasons = []
    requirements = set()
    fields = set()
    def issue(reason, **detail):
        item = {'reason': reason, **detail}
        if item not in reasons:
            reasons.append(item)
    area = row.get('world')
    if area not in profile['tabs']:
        return {'status': 'excluded', 'reasons': [{'reason': 'outside-demo-area', 'area': area}], 'fields': [], 'requirements': []}
    if not isinstance(row.get('text'), str) or not isinstance(row.get('requests'), list):
        return {'status': 'deferred', 'reasons': [{'reason': 'malformed-source-message'}], 'fields': [], 'requirements': []}
    requests = row['requests']
    if len(requests) > 1:
        requirements.add('request-composition-and-dependency-resolution')
    record = {'world': area, 'source_path': source, 'source': {'text': row['text']}, 'context': row.get('context')}
    available_acts = {op['act'] for op in profile['declarations'][area]}
    # Generic collection/reference acts operate on actual observed native objects.
    generic_acts = {'select', 'show', 'answer', 'object', 'repeat', 'undo', 'redo'}
    has_legacy = 'haiku-v1' in source
    for index, request in enumerate(requests):
        if not isinstance(request, dict):
            issue('invalid-request', request=index)
            continue
        sample = converter.sample(record, request, registry, aliases)
        values = {key: item['value'] for key, item in sample['globals'].items()}
        mentions = list(sample['mentions'])
        act = values.get('request.request.act')
        realizations = profile.get('actRealizations', {}).get(area, {}).get(act, [])
        realized = any(op['id'] in realizations for op in profile['declarations'][area])
        if act is not None and act not in available_acts | generic_acts and not realized:
            issue('unsupported-act', request=index, act=act)
        if act in generic_acts:
            requirements.add('generic-observation-focus-or-journal')
        target = request.get('target') or {}
        typ = target.get('type')
        if typ:
            family = profile['families'].get(area + '.' + typ)
            if not family or family['status'] != 'relevant':
                issue('unsupported-target-family', request=index, family=area + '.' + typ)
        kind = target.get('kind', values.get('request.target.kind'))
        kind_families = [family for key, family in profile['families'].items() if key.startswith(area + '.') and family['status'] == 'relevant' and family.get('kindValues')]
        if kind and kind_families and kind not in {value for family in kind_families for value in family['kindValues']}:
            issue('unproved-native-kind-realization', request=index, kind=kind)
        if has_legacy:
            # Reuse the reviewed legacy converter, but never let its unowned keys disappear.
            for key in request.get('answers', {}):
                if key in aliases['M'] or key in aliases['W'].get(area, {}):
                    continue
                if key.endswith('_span') and (key[:-5] in aliases['M'] or key[:-5] in aliases['W'].get(area, {})):
                    continue
                issue('legacy-field-without-reviewed-owner', request=index, key=key)
        for mention in mentions:
            key = mention['key']
            if key.endswith('.kind') and kind_families and mention['value'] not in {value for family in kind_families for value in family['kindValues']}:
                issue('unproved-native-kind-realization', request=index, kind=mention['value'])
            fields.add(key)
            binding = profile['fields'].get(key)
            if not binding:
                issue('unsupported-annotation-property', request=index, key=key)
            elif binding['status'] != 'relevant':
                issue('unexposed-native-parameter', request=index, key=key, operation=binding['operation'], parameter=binding['parameter'])
            else:
                interpretation = binding['interpretation']
                if interpretation != 'literal-or-typed-value' and interpretation != 'literal text':
                    requirements.add(interpretation)
                requirements.update('installed-capability:' + name for name in binding.get('requires', []))
        for diagnostic in sample['diagnostics']:
            if diagnostic['reason'] in ['unmapped-raw-key', 'unmapped-v1-chart-option']:
                issue('unowned-annotation-key', request=index, key=diagnostic['key'])
            elif diagnostic['reason'] in ['missing-or-ambiguous-mention-span', 'same-key-overlap-or-identical-range']:
                requirements.add('annotation-span-review')
        if target.get('fill') in ['context', 'previous_reply', 'journal_step'] or values.get('request.target.fill') in ['context', 'previous_reply', 'journal_step']:
            requirements.add('instance-history-and-focus-resolution')
        if target.get('quantifier') or values.get('request.logic.quantifier'):
            requirements.add('generic-quantified-selection')
        if target.get('count') is not None or values.get('request.target.count') is not None:
            requirements.add('group-quantity-composition')
        if request.get('question'):
            requirements.add('query-over-observed-state')
        # V2 converter intentionally only represents inventory heads. Audit missing keys too.
        for condition in request.get('constraints', []):
            key = area + '.' + str(condition.get('key'))
            if key not in registry:
                issue('unowned-annotation-key', request=index, key=key)
    excluded_reasons = {'outside-demo-area'}
    # A participant's profession belongs to a contacts/knowledge source, not calendar management.
    # Other absent fields may expose missing tool contracts for already useful UI features.
    if any(item.get('key') == 'calendar.person.role' for item in reasons):
        issue('outside-calendar-responsibility', key='calendar.person.role')
        excluded_reasons.add('outside-calendar-responsibility')
    status = 'excluded' if any(item['reason'] in excluded_reasons for item in reasons) else 'deferred' if reasons else 'retained'
    return {'status': status, 'reasons': reasons, 'fields': sorted(fields), 'requirements': sorted(requirements)}


def run(root, out, exclusion, reviewed=None):
    profile = json.loads(subprocess.check_output(['node', str(ROOT / 'demo-tool-profile.mjs')], text=True))
    converter = module(ROOT / 'prepare-key-reader.py')
    registry = converter.registry(json.loads((root / 'heads/inventory.json').read_text()))
    aliases = converter.aliases(root / 'heads/coverage_v1.py')
    reserved = set(json.loads(exclusion.read_text()))
    manual = json.loads(reviewed.read_text()) if reviewed else {'decisions': []}
    if any(not isinstance(item.get('id'),str) or item.get('status') not in ['excluded','deferred'] or not item.get('reason') for item in manual['decisions']):
        raise ValueError('invalid-reviewed-source-decisions')
    decisions = {item['id']: item for item in manual['decisions']}
    if len(decisions) != len(manual['decisions']):
        raise ValueError('duplicate-reviewed-source-id')
    found_decisions=set()
    out.mkdir(parents=True, exist_ok=False)
    counters = collections.Counter()
    by_area = collections.defaultdict(collections.Counter)
    reasons = collections.Counter()
    fields = collections.defaultdict(collections.Counter)
    requirements = collections.Counter()
    selected = []
    examples = collections.defaultdict(list)
    sources = []
    handles = {status: (out / (status + '.jsonl')).open('w') for status in ['retained', 'excluded', 'deferred']}
    audit = (out / 'review.jsonl').open('w')
    try:
        for version in ['haiku-v1', 'haiku-v2']:
            for path in sorted((root / 'data' / version).glob('*/*.jsonl')):
                source = path.relative_to(root).as_posix()
                sources.append(source)
                for number, line in enumerate(path.open(), 1):
                    if not line.strip():
                        continue
                    row = json.loads(line)
                    identity = source + ':' + row['id']
                    counters['input'] += 1
                    verdict = review_row(row, source, profile, converter, registry, aliases)
                    if identity in decisions:
                        decision=decisions[identity];found_decisions.add(identity)
                        verdict['status']='excluded' if 'excluded' in [verdict['status'],decision['status']] else 'deferred'
                        verdict['reasons'].append({'reason':'reviewed-annotation-semantic-gap','detail':decision['reason']})
                    counters[verdict['status']] += 1
                    by_area[row['world']][verdict['status']] += 1
                    if row['id'] in reserved:
                        counters['reserved'] += 1
                    elif verdict['status'] == 'retained':
                        selected.append(identity)
                        counters['active'] += 1
                        by_area[row['world']]['active'] += 1
                    record = {'id': identity, 'source': source, 'line': number, 'reserved': row['id'] in reserved, **verdict}
                    audit.write(json.dumps(record, ensure_ascii=False) + '\n')
                    handles[verdict['status']].write(json.dumps({'source_path': source, 'source_line': number, **row}, ensure_ascii=False) + '\n')
                    for field in verdict['fields']:
                        fields[field][verdict['status']] += 1
                    requirements.update(verdict['requirements'])
                    for item in verdict['reasons']:
                        key = item['reason'] + (':' + item['key'] if 'key' in item else ':' + item['act'] if 'act' in item else '')
                        reasons[key] += 1
                        if len(examples[key]) < 2:
                            examples[key].append({'id': identity, 'text': row['text'], 'issue': item})
    finally:
        audit.close()
        for handle in handles.values():
            handle.close()
    if set(decisions) != found_decisions:
        raise ValueError('reviewed-source-not-found')
    selection = {'format': 'psys2.demo-training-selection/1', 'policy': 'Whole messages only. Retain demo-relevant annotated roles, preserve compositional complexity and full natural source text; do not delete source data. No labels are rewritten or relevant clauses stripped.', 'profile': profile, 'sources': sources, 'reviewedSourceDecisions': len(found_decisions), 'reservedIdsExcluded': len(reserved), 'counts': dict(counters), 'selectedIds': sorted(selected)}
    (out / 'active-selection.json').write_text(json.dumps(selection, indent=2) + '\n')
    report = {'format': 'psys2.demo-training-review/1', 'counts': dict(counters), 'byArea': {key: dict(value) for key, value in by_area.items()}, 'reasons': dict(reasons.most_common()), 'fields': {key: dict(value) for key, value in sorted(fields.items())}, 'requirements': dict(requirements.most_common()), 'examples': dict(examples), 'scope': 'Relevance review, not semantic label validation, runtime binding coverage, or success measurement. Unknown realizations and unowned labels are deferred. Whole messages with unexposed or unsupported fields are deferred from active training; raw sources remain. Deferred includes relevant UI/adapter gaps and is not a list of useless sentences.'}
    (out / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    (out / 'profile.json').write_text(json.dumps(profile, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--reviewed-decisions',type=Path,default=ROOT/'data/demo-tool-profile/reviewed-decisions.json')
    parser.add_argument('--exclude-ids', type=Path, default=ROOT.parent / 'eval/functional-matrix/exclude-from-training.json')
    args = parser.parse_args()
    result = run(args.root, args.out, args.exclude_ids,args.reviewed_decisions)
    print(json.dumps({key: result[key] for key in ['counts', 'byArea', 'reasons']}, indent=2))
