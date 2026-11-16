"""Validate Haiku-generated reader rows against questions.json. Usage: python3 -I validate.py OUTDIR CLEANDIR"""
import json, sys, os, glob, collections
Q = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'questions.json')))
out, clean = sys.argv[1], sys.argv[2]
os.makedirs(clean, exist_ok=True)
stats = collections.Counter(); reasons = collections.Counter(); seen = set()
def check(row, world):
    qs = dict(Q['common']); qs.update(Q['worlds'][world]['questions'])
    if row.get('world') != world: return 'world'
    text = row.get('text')
    if not isinstance(text, str) or not text.strip(): return 'text'
    ctx = row.get('context', {})
    if not isinstance(ctx, dict): return 'context'
    reqs = row.get('requests')
    if not isinstance(reqs, list): return 'requests'
    pos = 0
    for r in reqs:
        span = r.get('span')
        if not isinstance(span, str) or not span: return 'span-missing'
        i = text.find(span, pos)
        if i < 0: return 'span-not-in-text-or-order'
        pos = i + len(span)
        trig = r.get('trigger')
        if trig is not None and trig not in span: return 'trigger-not-in-span'
        ans = r.get('answers')
        if not isinstance(ans, dict) or 'act' not in ans or 'mood' not in ans: return 'answers-act-mood'
        for k, v in ans.items():
            if k not in qs: return 'unknown-question:' + k
            q = qs[k]
            vals = v if isinstance(v, list) else [v]
            if isinstance(v, list) and not q.get('many'):
                if q.get('span'): return 'list-for-single:' + k
            for x in vals:
                if not isinstance(x, str) or not x: return 'empty-value:' + k
                if q.get('span') and x not in span: return 'span-answer-not-in-span:' + k
                if 'values' in q and x not in q['values']: return 'bad-value:' + k
        if ans['act'] == 'answer' and ans['mood'] not in ('ask', 'check'): return 'answer-needs-ask'
    return None
for path in sorted(glob.glob(os.path.join(out, '*', '*.jsonl'))):
    world = os.path.basename(os.path.dirname(path))
    good = []
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line: continue
        stats['lines'] += 1
        try: row = json.loads(line)
        except Exception: reasons['json'] += 1; continue
        why = check(row, world)
        if why: reasons[why.split(':')[0] if why.startswith('span-answer') else why] += 1; continue
        key = (world, row['text'].strip().lower(), json.dumps(row.get('context', {}), sort_keys=True))
        if key in seen: reasons['duplicate'] += 1; continue
        seen.add(key); good.append(row); stats['ok:' + world] += 1
    if good:
        d = os.path.join(clean, world); os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, os.path.basename(path)), 'w', encoding='utf-8') as f:
            for row in good: f.write(json.dumps(row, ensure_ascii=False) + '\n')
print(json.dumps({'stats': stats, 'rejected': reasons}, indent=1))
