"""Validate this separate C1 corpus with the existing V2 contract and source offsets."""
import contextlib, io, json, pathlib, runpy, sys, tempfile, importlib.util
HERE = pathlib.Path(__file__).resolve().parent
original_argv = sys.argv
sys.argv = ['validate_v2.py', '--check']
with contextlib.redirect_stdout(io.StringIO()):
    contract = runpy.run_path(str(HERE.parent / 'haiku-v2' / 'validate_v2.py'))
sys.argv = original_argv
contract['problems'].__globals__['INV'] = json.loads((HERE / 'inventory.json').read_text())
rows = [json.loads(line) for line in (HERE / 'examples.jsonl').read_text().splitlines() if line.strip()]
checks = {row['id']: row for row in json.loads((HERE / 'native-checks.json').read_text())['checks']}
failures = []
seen = set()
for row in rows:
    problems = contract['problems'](row, row['world'])
    key = (row['world'], row['text'])
    if key in seen: problems.append('duplicate language row')
    seen.add(key)
    clauses = row['extraction'].get('clauses', [dict(text=row['text'], parameters=row['extraction'].get('parameters', []))])
    for clause in clauses:
        for parameter in clause['parameters']:
            for fragment in [parameter, *parameter.get('elements', []), *parameter.get('components', [])]:
                if clause['text'][fragment['start']:fragment['end']] != fragment['surface']:
                    problems.append('source offset mismatch: ' + parameter['parameter'])
    native = row['nativeTool']
    if native:
        if native['check'] not in checks: problems.append('missing native execution check')
        for call in native.get('calls', [native]):
            if not call.get('operation') or not call.get('wires'): problems.append('missing actual native operation/wires')
    elif row['style'] != 'world-informed-completion': problems.append('direct row without native check')
    if row['style'] == 'world-informed-completion':
        if native is not None or row['completion']['parameters']: problems.append('vague intent manufactured tool realization')
        if not row['completion']['requirements']: problems.append('vague intent missing completion requirements')
    if problems: failures.append((row['id'], row['text'], problems))
ui_recipes = [json.loads(line) for line in (HERE / 'ui-actions.jsonl').read_text().splitlines() if line.strip()]
observations = json.loads((HERE / 'observations.json').read_text())
for recipe in ui_recipes:
    problems = []
    if recipe['id'] not in checks: problems.append('UI recipe missing actual execution check')
    for call in recipe['calls']:
        if call['observationRef'] not in observations: problems.append('UI call missing actual observation')
        for fragment in call['sourceRanges']:
            if call['text'][fragment['start']:fragment['end']] != fragment['rendered']:
                problems.append('actual UI source range mismatch')
    if problems: failures.append((recipe['id'], 'actual UI recipe', problems))
# Exercise the actual training-label preparation path, not only structural V2 validity.
loader_spec = importlib.util.spec_from_file_location('ui_natural_prepare', HERE.parent.parent / 'prepare-key-reader.py')
loader = importlib.util.module_from_spec(loader_spec)
loader_spec.loader.exec_module(loader)
with tempfile.TemporaryDirectory(prefix='ui-natural-labels-') as temporary:
    output = pathlib.Path(temporary) / 'prepared'
    prepared = loader.prepare_authored(HERE / 'authored.jsonl', HERE / 'inventory.json', output, exclude_ids=None, phase='all')
    masked = {reason: count for reason, count in prepared['diagnostics'].items() if reason in ('missing-or-ambiguous-mention-span', 'same-key-overlap-or-identical-range') and count}
    if masked: failures.append(('label-loader', 'actual prepare_authored phase=all', [json.dumps(masked)]))
for row_id, text, problems in failures:
    print(f'{row_id}: {text}: {"; ".join(problems)}')
print(f'{len(rows)} rows, {len(checks)} executed recipes, {len(ui_recipes)} exact UI recipes, {len(failures)} invalid rows, {sum(masked.values())} ambiguous/overlap label masks')
sys.exit(bool(failures))
