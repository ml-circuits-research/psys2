import json, re, collections, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'coverage_all.py')).read().split('rows = []')[0]
ns = {'__file__': os.path.join(HERE, 'coverage_all.py')}; exec(src, ns)
cnt, vals, inv = ns['cnt'], ns['vals'], ns['inv']
info = {f'{w}.{t}.{k}': d for w, ts in inv.items() for t, x in ts.items() for k, d in x['keys'].items()}
conc = collections.defaultdict(list)
for k, d in info.items(): conc[d['concept']].append(k)
fails = []
for c, ks in sorted(conc.items()):
    tot = sum(cnt[k] for k in ks)
    cv = collections.Counter()
    for k in ks: cv.update(vals[k])
    closed = sorted({v for k in ks for v in info[k].get('values', []) if 'class' in info[k]['head'] and 'candidate' not in info[k]['head']})
    low = [v for v in closed if cv[v] < 40]
    lowkeys = [k for k in ks if cnt[k] < 100]
    ok = tot >= 300 and not low and not lowkeys
    if not ok: fails.append((c, tot, low, lowkeys))
print(f'concept heads {len(conc)}, pass {len(conc) - len(fails)}, keys with >=100 examples {sum(cnt[k] >= 100 for k in info)}/{len(info)}')
for f in fails: print(' ', f)
