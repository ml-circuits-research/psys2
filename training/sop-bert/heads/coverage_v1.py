import json, glob, collections, os
inv = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'inventory.json')))
M = {"mood":"request.request.mood","act":"request.request.act","ask_kind":"request.question.ask","target_fill":"request.target.fill","target_span":"request.target.name","kind":"request.target.kind","count":"request.target.count","ordinal":"request.target.ordinal","quantifier":"request.logic.quantifier","negated":"request.logic.negated","fragment":"conversation.turn.fragment","step":"request.constraint.step","axis":"request.constraint.concept"}
W = {"drawing":{"colour":"drawn.colour","colour_variety":"@request.constraint.variety","size":"drawn.size","place":"drawn.at","relation":"drawn.relation","anchor_span":"drawn.anchor","direction":"drawn.direction","distance":"drawn.distance","part":"part.part","feature_value":"part.variant","whole":"page.scene","parts_list_span":"page.parts_named","rotation":"drawn.rotation","layer":"drawn.layer"},
"diagram":{"diagram_kind":"diagram.kind","label_span":"node.label","shape":"node.shape","colour":"node.colour","from_span":"link.from","to_span":"link.to","link_style":"link.style","arrow":"link.arrow","value":"node.value","values_span":"chart.values","position":"node.position","anchor_span":"node.anchor","layout":"diagram.layout","size":"node.size","chart_option":"chart.*","data_source_span":"chart.source"},
"document":{"genre":"text.genre","about_span":"text.about","title_span":"text.title","recipient_span":"text.recipient","tone":"text.tone","section":"section.role","section_span":"section.role","order_relation":"section.order","order_anchor_span":"section.order_anchor","length":"text.length","length_words":"text.words","parts_count":"section.count","text_span":"section.content","format":"inline.format"},
"calendar":{"title_span":"meeting.title","people_span":"meeting.people","day":"meeting.day","day_span":"meeting.day","time":"meeting.time","time_span":"meeting.time","duration":"meeting.length","duration_span":"meeting.length","room_span":"meeting.room","room_quality":"room.quality","recurrence":"meeting.recurrence","shift_direction":"meeting.shift","shift_amount":"meeting.shift","scope_span":"@request.target.description","free_search":"meeting.free"}}
CO = {"show_legend":"legend","hide_legend":"legend","show_numbers":"show_values","hide_numbers":"show_values","stacked":"stacked","horizontal":"horizontal","sort_desc":"sort","sort_asc":"sort","sort_alpha":"sort"}
cnt = collections.Counter(); vals = collections.defaultdict(collections.Counter)
for p in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data','haiku-v1','*','*.jsonl')):
    w = p.split(os.sep)[-2]
    for line in open(p):
        r = json.loads(line)
        for q in r['requests']:
            seen = set()
            for a, v in q['answers'].items():
                if a in M: key = M[a]
                elif a in W[w]:
                    t = W[w][a]
                    if t == 'chart.*': t = 'chart.' + CO.get(v, 'legend')
                    key = t[1:] if t.startswith('@') else f"{w}.{t}"
                else: continue
                if a == 'format' and v in ('bullets','numbered'): key = 'document.inline.list_kind'
                if key in seen: continue
                seen.add(key); cnt[key] += 1
                for x in (v if isinstance(v, list) else [v]): vals[key][x] += 1
rows = []
for w, ts in inv.items():
    for typ, x in ts.items():
        for key, d in x['keys'].items():
            full = f"{w}.{typ}.{key}"; n = cnt.get(full, 0)
            low = [v for v in d.get('values', []) if vals[full][v] < 40] if 'class' in d['head'] else []
            rows.append((full, d['head'], n, len(d.get('values', [])), low))
ok = [r for r in rows if r[2] >= 300 and not r[4]]
print('keys', len(rows), 'meet gate (>=300, every closed value >=40):', len(ok))
print('zero examples:', sum(1 for r in rows if r[2] == 0))
for r in sorted(rows, key=lambda r: r[2]): print(f"{r[2]:6d}  {r[0]:42s} {r[1]:22s} low-values={len(r[4])}/{r[3]}")
