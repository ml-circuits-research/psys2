"""C1 authoring of supported natural utterances with complete tool-grounded labels.

Old examples provide intent-class/source inspiration; revised text is newly authored,
not a claim that an unsupported original was understood or executed.
"""
import argparse, collections, gzip, hashlib, importlib.util, json, re, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent


def choose(items, seed, offset=0):
    return items[(seed//(offset+1)) % len(items)]


def condition(key,value,span=None,**metadata):
    return {'key':key,'value':str(value),'value_span':str(value)if span is None else span,'operator':'eq','phase':'result','polarity':'positive','character':'requirement',**metadata}


def request(text,trigger,act,typ,*,kind=None,name=None,mode='existing',fill='written',constraints=None,mood='do',**extra):
    target={'type':typ,'mode':mode,'determiner':'indefinite'if mode=='new'else'definite'}
    if mode=='existing':target['fill']=fill
    if kind is not None:target.update(kind=kind,kind_span=kind)
    if name is not None:target['name_span']=name
    return {'span':text,'trigger':trigger,'act':act,'mood':mood,'target':target,'constraints':constraints or [],**extra}


def source_names(row):
    names=[item.get('name')for item in (row.get('context')or{}).get('existing',[])if isinstance(item,dict)]
    names=[name.strip().replace('"','') for name in names if isinstance(name,str)and 1<len(name.strip())<48 and '\n'not in name]
    return names or ['Sample','Reference']


def author_row(row, identity, profile):
    seed=int(hashlib.sha256(('demo-tools-v1\n'+identity).encode()).hexdigest()[:12],16)
    area=row['world'];names=source_names(row);name=names[0];other=names[1]if len(names)>1 and names[1]!=name else 'Reference'
    if name in other or other in name:other='Alternative '+str(seed%999+1)
    # Explicitly authored new quantities, never reverse-engineered missing old gold.
    n=seed%5+2;amount=seed%80+10;colour=choose(['red','blue','green','yellow','purple','orange'],seed,2)
    if name=='Review' or colour in name.lower():name='Item '+str(seed%9999+1)
    if other in ['Review','Sample'] or other in name or name in other:other='Reference '+str(seed%997+1)
    context={'existing':[],'previous':None};requests=[]
    originals=row.get('requests')or[]
    acts=[r.get('act',r.get('answers',{}).get('act'))for r in originals]
    keys={c.get('key')for r in originals for c in r.get('constraints',[])}
    legacy={key for r in originals for key in r.get('answers',{})}
    scenario=seed%8
    if len(originals)>1:scenario=7
    elif acts and acts[0]in['ask','answer','check','show']:scenario={'drawing':6,'diagram':8,'document':5,'calendar':6}[area]
    elif area=='drawing':
        if 'remove'in acts:scenario=5
        elif 'place'in acts:scenario=3
        elif 'drawn.size'in keys or'size'in legacy:scenario=4
        elif 'change'in acts:scenario=2
        else:scenario=1 if'count'in legacy or any(r.get('target',{}).get('count')for r in originals)else 0
    elif area=='diagram':
        if 'chart.sort'in keys:scenario=6
        elif 'chart.show_values'in keys:scenario=5
        elif any(key and key.startswith('chart.')for key in keys)or'values_span'in legacy or'data_source_span'in legacy:scenario=4
        elif 'connect'in acts:scenario=1
        elif 'arrange'in acts:scenario=3
        elif 'change'in acts:scenario=2
        else:scenario=0
    elif area=='document':
        if 'remove'in acts:scenario=4
        elif 'place'in acts:scenario=3
        elif 'change'in acts:scenario=2
        elif 'section.content'in keys or'section'in legacy:scenario=1
        else:scenario=6 if seed%2 else 0
    elif area=='calendar':
        if 'remove'in acts:scenario=5
        elif 'place'in acts or'meeting.shift'in keys:scenario=4
        elif 'change'in acts:scenario=3
        elif 'room.seats'in keys or'room.name'in keys:scenario=1
        elif 'person.name'in keys or'person.role'in keys:scenario=0
        else:scenario=2
    if area=='drawing':
        kinds=profile['families']['drawing.drawn']['kindValues'];kind=choose([k for k in ['circle','square','triangle','house','fish','car','tree','flower','star']if k in kinds],seed,3)
        context['existing']=[{'name':name,'kind':kind},{'name':other,'kind':kind}]
        if kind in name.lower():name='Item '+str(seed%9999+1)
        if kind in other.lower():other='Reference '+str(seed%997+1)
        context['existing']=[{'name':name,'kind':kind},{'name':other,'kind':kind}]
        if scenario==0:
            text=f'draw a {colour} {kind} and call it {name}'
            requests=[request(text,'draw','make','drawn',kind=kind,mode='new',constraints=[condition('drawn.colour',colour),condition('drawn.name',name)])]
        elif scenario==1:
            text=f'add {n} {colour} {kind} objects'
            r=request(text,'add','make','drawn',kind=kind,mode='new',constraints=[condition('drawn.colour',colour)])
            r['target'].update(count=str(n),count_span=str(n));requests=[r]
        elif scenario==2:
            text=f'make {name} {colour}'
            requests=[request(text,'make','change','drawn',name=name,constraints=[condition('drawn.colour',colour)])]
        elif scenario==3:
            text=f'move {name} to the left of {other}'
            requests=[request(text,'move','place','drawn',name=name,constraints=[condition('drawn.relation','left_of','to the left of',operator='relation',anchor_span=other,anchor_fill='written')])]
        elif scenario==4:
            text=f'make {name} {amount} pixels wide'
            requests=[request(text,'make','change','drawn',name=name,constraints=[condition('drawn.size',amount,f'{amount} pixels',measure=str(amount),measure_span=str(amount),unit='pixel')])]
        elif scenario==5:
            text=f'remove {name}, but leave {other} alone'
            requests=[request(text,'remove','remove','drawn',name=name,constraints=[condition('drawn.name',other,phase='selector',polarity='negative')])]
        elif scenario==6:
            text=f'what colour is {name}?'
            requests=[request(text,'what','answer','drawn',name=name,mood='ask',question={'ask':'what','asked_key':'drawn.colour'})]
        else:
            first=f'draw a {kind} called {name}';second=f'put {name} below {other}'
            requests=[request(first,'draw','make','drawn',kind=kind,mode='new',constraints=[condition('drawn.name',name)]),request(second,'put','place','drawn',name=name,constraints=[condition('drawn.relation','below','below',operator='relation',anchor_span=other,anchor_fill='written')])]
    elif area=='diagram':
        kinds=profile['families']['diagram.node']['kindValues'];kind=choose([k for k in ['rectangle','circle','diamond','triangle','star','hexagon','ellipse']if k in kinds],seed,3)
        if kind in name.lower():name='Node '+str(seed%9999+1)
        context['existing']=[{'name':name,'kind':'node'},{'name':other,'kind':'node'}]
        if scenario==0:
            text=f'add a {colour} {kind} labelled {name}'
            requests=[request(text,'add','make','node',kind=kind,mode='new',constraints=[condition('node.colour',colour),condition('node.label',name)])]
        elif scenario==1:
            text=f'connect {name} to {other}'
            requests=[request(text,'connect','connect','link',mode='new',constraints=[condition('link.from',name),condition('link.to',other)])]
        elif scenario==2:
            text=f'make {name} {colour}'
            requests=[request(text,'make','change','node',name=name,constraints=[condition('node.colour',colour)])]
        elif scenario==3:
            layout=choose(profile['declarations']['diagram'][[op['id']for op in profile['declarations']['diagram']].index('diagram.node.layout')]['params']['layout']['enum'],seed,4)
            text=f'arrange the nodes in a {layout}'
            r=request(text,'arrange','arrange','diagram',fill='all',constraints=[condition('diagram.layout',layout)])
            r['target']['quantifier']='all';requests=[r]
        elif scenario==4:
            form=choose(['bar','line','pie','scatter'],seed,5);a=seed%30+1;b=(seed//13)%40+1
            text=f'make a {form} chart called {name} with values {a}, {b} for {other} and Sample'
            requests=[request(text,'make','make','chart',kind=form,mode='new',constraints=[condition('chart.title',name),condition('chart.labels',f'{other} and Sample'),condition('chart.values',f'{a}, {b}')])]
            context['existing']=[]
        elif scenario==5:
            text=f'show the values on {name}'
            requests=[request(text,'show','change','chart',name=name,constraints=[condition('chart.show_values','show','show the values')])]
            context['existing']=[{'name':name,'kind':'chart'}]
        elif scenario==6:
            text=f'sort {name} from largest to smallest'
            requests=[request(text,'sort','arrange','chart',name=name,constraints=[condition('chart.sort','desc','from largest to smallest')])]
            context['existing']=[{'name':name,'kind':'chart'}]
        elif scenario==8:
            text=f'what values does {name} show?'
            requests=[request(text,'what','answer','chart',name=name,mood='ask',question={'ask':'list','asked_key':'chart.values'})]
            context['existing']=[{'name':name,'kind':'chart'}]
        else:
            first=f'add a {kind} labelled {name}';second=f'connect {name} to {other}'
            requests=[request(first,'add','make','node',kind=kind,mode='new',constraints=[condition('node.label',name)]),request(second,'connect','connect','link',mode='new',constraints=[condition('link.from',name),condition('link.to',other)])]
    elif area=='document':
        literal=choose(['Please confirm these updated details.','The room is available after lunch.','We will review the draft tomorrow.','Bring the revised notes to the meeting.','The delivery arrived this morning.','Please check the final figures.','The next stage begins on Friday.','Everyone can read the new summary.'],seed,13)
        context['existing']=[{'name':'Draft','kind':'document'},{'name':name,'kind':'section'},{'name':other,'kind':'section'}]
        if scenario==0:
            text=f'create a document titled {name} containing "{literal}"'
            requests=[request(text,'create','make','text',mode='new',constraints=[condition('text.title',name),condition('text.content',literal)])]
            context['existing']=[]
        elif scenario==1:
            text=f'add a heading called {name}'
            requests=[request(text,'add','make','section',kind='heading',mode='new',constraints=[condition('section.content',name)])]
        elif scenario==2:
            text=f'replace {name} with "{literal}"'
            requests=[request(text,'replace','change','section',name=name,constraints=[condition('section.content',literal)])]
        elif scenario==3:
            text=f'move {name} after {other}'
            requests=[request(text,'move','place','section',name=name,constraints=[condition('section.order','after',operator='relation',anchor_span=other,anchor_fill='written')])]
        elif scenario==4:
            text=f'delete the {name} section'
            requests=[request(text,'delete','remove','section',name=name)]
        elif scenario==5:
            text=f'how many words are in the document?'
            requests=[request(text,'how many','answer','text',fill='context',mood='ask',question={'ask':'count','asked_key':'text.words'})]
        elif scenario==6:
            text=f'compose a report about {name} in approximately {amount} words'
            requests=[request(text,'compose','make','text',kind='report',mode='new',constraints=[condition('text.about',name),condition('text.words',amount,f'approximately {amount} words',character='preference',measure=str(amount),measure_span=str(amount),unit='word')])]
        else:
            first=f'add a heading called {name}';second=f'add a paragraph saying "{literal}"'
            requests=[request(first,'add','make','section',kind='heading',mode='new',constraints=[condition('section.content',name)]),request(second,'add','make','section',kind='paragraph',mode='new',constraints=[condition('section.content',literal)])]
    elif area=='calendar':
        original_items=(row.get('context')or{}).get('existing',[])
        calendar_names=[item.get('name')for item in original_items if item.get('kind')=='calendar' and isinstance(item.get('name'),str)]
        room_names=[item.get('name')for item in original_items if item.get('kind')=='room' and isinstance(item.get('name'),str)]
        name=calendar_names[0]if calendar_names else 'Work '+str(seed%8+1)
        other=room_names[0]if room_names else 'Room '+str(seed%12+1)
        if 'Review'in name:name='Work '+str(seed%8+1)
        if re.search(r'\d+\s*min',other)or'Planning'in other:other='Room '+str(seed%12+1)
        context['existing']=[{'name':name,'kind':'calendar'},{'name':other,'kind':'room'},{'name':'Review','kind':'meeting'}]
        hour=seed%8+9;clock=f'{hour:02d}:00';day=f'2026-12-{seed%20+1:02d}';duration=(seed%4+1)*15
        if scenario==0:
            text=f'add a personal calendar named {name}'
            requests=[request(text,'add','make','calendar',mode='new',constraints=[condition('calendar.name',name)])]
            context['existing']=[]
        elif scenario==1:
            text=f'add a room called {other} with {n} seats'
            requests=[request(text,'add','make','room',mode='new',constraints=[condition('room.name',other),condition('room.seats',n,f'{n} seats',measure=str(n),unit='seat')])]
            context['existing']=[]
        elif scenario==2:
            text=f'put Review on the {name} calendar on {day} at {clock} UTC for {duration} minutes'
            requests=[request(text,'put','make','meeting',mode='new',constraints=[condition('meeting.title','Review'),condition('meeting.calendar',name),condition('meeting.day',day),condition('meeting.time',clock),condition('meeting.length',duration,f'{duration} minutes',measure=str(duration),measure_span=str(duration),unit='minute')])]
        elif scenario==3:
            text=f'book {other} for Planning on {day} from {clock} UTC for {duration} minutes'
            requests=[request(text,'book','make','meeting',mode='new',constraints=[condition('meeting.title','Planning'),condition('meeting.room',other),condition('meeting.day',day),condition('meeting.time',clock),condition('meeting.length',duration,f'{duration} minutes',measure=str(duration),measure_span=str(duration),unit='minute')])]
        elif scenario==4:
            text=f'move Review to {day} at {clock} UTC'
            requests=[request(text,'move','place','meeting',name='Review',constraints=[condition('meeting.day',day),condition('meeting.time',clock)])]
        elif scenario==5:
            text='cancel Review'
            requests=[request(text,'cancel','remove','meeting',name='Review')]
        elif scenario==6:
            text=f'which events are on {name} on {day}?'
            requests=[request(text,'which','answer','meeting',fill='description',mood='ask',constraints=[condition('meeting.calendar',name,phase='selector'),condition('meeting.day',day,phase='selector')],question={'ask':'list'})]
        else:
            first=f'add a calendar called {name}';second=f'schedule Review on {name} on {day} at {clock} UTC for {duration} minutes'
            requests=[request(first,'add','make','calendar',mode='new',constraints=[condition('calendar.name',name)]),request(second,'schedule','make','meeting',mode='new',constraints=[condition('meeting.title','Review'),condition('meeting.calendar',name),condition('meeting.day',day),condition('meeting.time',clock),condition('meeting.length',duration,f'{duration} minutes',measure=str(duration),measure_span=str(duration),unit='minute')])]
    else:
        raise ValueError('unexpected-source-area:'+str(area))
    # Creation names are genuinely new in the observed context; follow-ups can bind them.
    if scenario in [0,7] and area in ['drawing','diagram']:
        context['existing']=[item for item in context['existing']if item.get('name')!=name]
    if area=='calendar' and scenario in [2,3,7]:
        context['existing']=[item for item in context['existing']if item.get('name')!='Review' and not(scenario==7 and item.get('kind')=='calendar')]
    # Preserve the original number of explicit requests for longer source messages.
    while len(requests)<len(originals):
        position=len(requests)
        if area=='drawing':
            t=f'make {name} {colour}' if position==2 else f'make {name} {amount} pixels wide'
            cs=[condition('drawn.colour',colour)]if position==2 else[condition('drawn.size',amount,f'{amount} pixels',measure=str(amount),measure_span=str(amount),unit='pixel')]
            requests.append(request(t,'make','change','drawn',name=name,constraints=cs))
        elif area=='diagram':
            t=f'make {name} {colour}'if position==2 else f'place {name} below {other}'
            cs=[condition('node.colour',colour)]if position==2 else[condition('node.position','below',operator='relation',anchor_span=other,anchor_fill='written')]
            requests.append(request(t,'make'if position==2 else'place','change'if position==2 else'place','node',name=name,constraints=cs))
        elif area=='document':
            content=literal if position==2 else'Please keep the final summary.'
            t=f'add a quote saying "{content}"'
            requests.append(request(t,'add','make','section',kind='quote',mode='new',constraints=[condition('section.content',content)]))
        else:
            t=f'add the note "Bring the final draft" to Review'if position==2 else f'move Review to {day} at {clock} UTC'
            cs=[condition('meeting.agenda','Bring the final draft')]if position==2 else[condition('meeting.day',day),condition('meeting.time',clock)]
            requests.append(request(t,'add'if position==2 else'move','change'if position==2 else'place','meeting',name='Review',constraints=cs))
    requests=naturalize(requests,area,seed)
    wrapper=choose(['Please, ','Could you ','I need you to ','Let us ','Hey, ',''],seed,7)
    # Make source names unambiguous by adding no template wrappers inside exact request spans.
    text=wrapper+'; then '.join(r['span'] for r in requests)+choose(['. Thanks!','. I appreciate it.','. That would help.','.'],seed,11)
    return {'id':row['id'],'world':area,'context':context,'text':text,'requests':requests},f'{area}:{scenario}'


def active_inventory(profile):
    inventory=json.loads((ROOT/'heads/inventory.json').read_text())
    # Keep shared request structure; only tool-owned domain heads form the active inventory.
    for area in profile['tabs']:
        inventory.setdefault(area,{})
        inventory[area]={typ:{**spec,'keys':{key:desc for key,desc in spec['keys'].items() if profile['fields'].get(area+'.'+typ+'.'+key,{}).get('status')=='relevant'}}for typ,spec in inventory[area].items() if profile['families'].get(area+'.'+typ,{}).get('status')=='relevant'}
    def add(area,typ,key,head,concept,source):
        inventory[area].setdefault(typ,{'doc':'exposed native '+typ,'keys':{}})['keys'][key]={'head':head,'concept':concept,'src':source}
    for key,head,concept in [('owner','span','reference'),('index','number','ordinal'),('colour','candidate','colour'),('width','number','width'),('height','number','height'),('x','number','x'),('y','number','y')]:add('drawing','part',key,head,concept,'native drawing part parameter')
    add('drawing','group','members','span','reference','drawing.object.group ids')
    add('drawing','group','name','span','name','drawing.object.group name')
    add('diagram','chart','datasets','span','literal_data','chart.make datasets')
    doc_ops={op['id']:op for op in profile['declarations']['document']}
    for key,head,concept in [('enabled','class','toggle'),('from','number','index'),('to','number','index'),('items','span','literal_list'),('rows','span','literal_table'),('highlight_colour','candidate','colour')]:add('document','inline',key,head,concept,'actual literal editing parameter')
    inventory['document']['inline']['keys']['enabled']['values']=['on','off']
    inventory['document']['inline']['keys']['format']['values']=doc_ops['document.block.mark']['params']['mark']['enum']
    inventory['document']['inline']['keys']['align']['values']=doc_ops['document.block.align']['params']['align']['enum']
    inventory['document']['inline']['keys']['list_kind']['values']=doc_ops['document.list.make']['params']['style']['enum']
    caps=profile.get('avatar',{}).get('capabilities',{})
    for typ,key,head,concept,values in [('face','preset','class','preset',caps.get('presets',[])),('face','expression','class','expression',caps.get('expressions',[])),('face','name','span','name',None),('part','ids','span','reference',None),('part','variant','class','variant',sorted({v for slot in caps.get('slots',[])for v in slot['variants']})),('part','colour','class','colour',sorted({v for slot in caps.get('slots',[])for v in slot['colours']})),('part','size','class','size',caps.get('sizes',[])),('part','place','class','place',caps.get('directions',[]))]:
        if not caps:continue
        add('avatar',typ,key,head,concept,'actual avatar native capability parameters')
        if values:inventory['avatar'][typ]['keys'][key]['values']=values
    for key,concept in [('name','name'),('colour','colour')]:add('calendar','calendar',key,'span'if key=='name'else'candidate',concept,'calendar.calendar.add/change '+('label'if key=='name'else'colour'))
    add('calendar','room','location','span','place','calendar.room.add/change location')
    add('calendar','meeting','calendar','span','reference','calendar.meeting.add/change calendar identity')
    add('diagram','chart','title','span','name','chart.make/change title')
    add('document','text','content','span','literal_text','document.write blocks: literal paragraph body')
    inventory['request']['constraint']['keys'].pop('measure',None);inventory['request']['constraint']['keys'].pop('unit',None)
    inventory['request']['target']['keys']['type']={'head':'class','concept':'target.type','values':sorted({typ for area in profile['tabs'] for typ in inventory[area]}),'src':'explicit tool-owned request family'}
    inventory['drawing']['drawn']['keys']['size']['head']='number+class+step'
    layout=next(op for op in profile['declarations']['diagram']if op['id']=='diagram.node.layout')['params']['layout']['enum']
    inventory['diagram']['diagram']['keys']['layout']['values']=layout
    for area in profile['tabs']:
        for definition in inventory[area].values():
            for descriptor in definition['keys'].values():
                if descriptor.get('head','').startswith('number'):descriptor.pop('values',None)
    return inventory


def naturalize(requests,area,seed):
    # C1 authored variants only, never an operational reader or request rewrite.
    variants={'draw':['draw','sketch','create','add'],'add':['add','create','make'],'connect':['connect','link'],'move':['move','put','place'],'remove':['remove','delete'],'delete':['delete','remove'],'schedule':['schedule','book'],'cancel':['cancel','remove'],'compose':['compose','write']}
    for index,r in enumerate(requests):
        options=variants.get(r['trigger'])
        if options and r['span'].startswith(r['trigger']):
            picked=choose(options,seed,index+17)
            r['span']=picked+r['span'][len(r['trigger']):];r['trigger']=picked
    return requests


def main(root,out):
    profile=json.loads(subprocess.check_output(['node',str(ROOT/'demo-tool-profile.mjs')],text=True))
    inventory=active_inventory(profile)
    contract_spec=importlib.util.spec_from_file_location('demo_contract',ROOT/'demo-intent-contract.py');contract=importlib.util.module_from_spec(contract_spec);contract_spec.loader.exec_module(contract)
    out.mkdir(parents=True,exist_ok=False)
    counts=collections.Counter();scenarios=collections.Counter();manual={}
    validator_path=ROOT/'data/haiku-v2/validate_v2.py';validator={'__file__':str(validator_path)}
    exec(compile(validator_path.read_text().split("if sys.argv[1] == '--check':")[0],str(validator_path),'exec'),validator)
    validator['INV']=inventory
    for filename in ['calendar-repairs.json','repaired-examples.json']:
        manual_path=ROOT/'data/demo-tool-profile'/filename
        if manual_path.exists():
            for entry in json.loads(manual_path.read_text())['repairs']:
                manual[entry['source']['path'].removeprefix('training/sop-bert/')+':'+entry['source']['id']]=entry
    source_specs=[]
    with (out/'rows.jsonl').open('w')as sink,(out/'provenance.jsonl').open('w')as provenance:
        for version in ['haiku-v1','haiku-v2']:
            for path in sorted((root/'data'/version).glob('*/*.jsonl')):
                source=path.relative_to(root).as_posix();source_specs.append(source)
                for line in path.open():
                    if not line.strip():continue
                    original=json.loads(line);identity=source+':'+original['id']
                    if identity in manual:
                        entry=manual[identity];revised={**entry['row'],'id':original['id']};scenario=original['world']+':manual'
                    elif not original['requests']:
                        revised={**original,'context':{'existing':[],'previous':None}};scenario=original['world']+':chatter'
                    else:revised,scenario=author_row(original,identity,profile)
                    try:
                        expected_tools=contract.direct_tools(revised,profile);phase='direct';phase_reason=None
                    except (ValueError,KeyError)as error:
                        expected_tools=None;phase='world-inference';phase_reason=str(error)
                    revised={**revised,'phase':phase,'expectedTools':expected_tools,'phaseReason':phase_reason}
                    counts['phase:'+phase]+=1
                    problems=validator['problems'](revised,revised['world'])
                    if problems:raise ValueError(identity+': '+', '.join(problems))
                    sink.write(json.dumps({'source_path':source,'source_id':original['id'],**revised},ensure_ascii=False)+'\n')
                    provenance.write(json.dumps({'id':identity,'sourceText':original['text'],'sourceRequests':original['requests'],'method':'manual-repair'if identity in manual else'preserved-chatter'if not original['requests']else'new-capability-grounded-authoring','scenario':scenario,'changes':manual[identity]['changes']if identity in manual else['Original incidental-only wording and empty request labels preserved; irrelevant context objects omitted.']if not original['requests']else['New supported utterance and full labels authored; original provided area/intent inspiration and display names only, not preserved semantics.']},ensure_ascii=False)+'\n')
                    counts[original['world']]+=1;scenarios[scenario]+=1
        for label,filename in [('avatar','author-avatar-supplement.py'),('drawing','author-drawing-supplement.py'),('document','author-document-supplement.py'),('diagram','author-chart-supplement.py')]:
            if label=='avatar'and not profile.get('avatar'):continue
            supplement_spec=importlib.util.spec_from_file_location(label+'_author',ROOT/filename);supplement=importlib.util.module_from_spec(supplement_spec);supplement_spec.loader.exec_module(supplement)
            for revised in supplement.rows(profile):
                identity=revised['source_path']+':'+revised['source_id'];problems=validator['problems'](revised,label)
                if problems:raise ValueError(identity+': '+', '.join(problems))
                expected_tools=contract.direct_tools(revised,profile);revised.update(phase='direct',expectedTools=expected_tools,phaseReason=None)
                sink.write(json.dumps(revised,ensure_ascii=False)+'\n');provenance.write(json.dumps({'id':identity,'method':'native-capability-authoring','source':'current published knowledge and actual tool parameters','changes':['Concrete native parameter intent; applicable shared colour peers named explicitly.']})+'\n')
                counts[label]+=1;counts['phase:direct']+=1;scenarios[label+':supplement']+=1
    summary={'format':'psys2.demo-authored-corpus/1','counts':dict(counts),'total':sum(counts[area]for area in profile['tabs']),'scenarios':dict(scenarios),'manualRepairs':len(manual),'sources':source_specs,'scope':'All source rows receive deliberately authored supported counterparts. No original unsupported intent is claimed fulfilled. Native tool contract relevance and source-span checks are separate from runtime reader accuracy. No training performed.'}
    (out/'profile.json').write_text(json.dumps(profile,indent=2)+'\n')
    (out/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
    (out/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n');return summary
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();print(json.dumps(main(args.root,args.out),indent=2))
