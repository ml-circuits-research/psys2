"""Typed direct-tool meaning of authored phase-one labels; no language pattern reader."""
import datetime,json,re



def number(value):
    if isinstance(value,(int,float)):return value
    matches=re.findall(r'(?<![A-Za-z])[-+]?\d+(?:\.\d+)?',str(value))
    if len(matches)!=1:raise ValueError('numeric value requires one explicit number')
    parsed=float(matches[0]);return int(parsed)if parsed.is_integer()else parsed


def target_context(row,profile=None):
    ids={};counters={}
    for obj in row['context'].get('existing',[]):
        typ=obj.get('kind');name=obj.get('name')
        if not isinstance(name,str)or not isinstance(typ,str):continue
        key='node'if typ=='node'else'chart'if typ=='chart'else'calendar'if typ=='calendar'else'room'if typ=='room'else'person'if typ=='person'else'meeting'if typ=='meeting'else'section'if typ in ['section','heading','paragraph','quote']else'document'if typ=='document'else'drawn'
        counters[key]=counters.get(key,0)+1
        prefixes={'node':'r','chart':'chart:','calendar':'calendar','room':'room','person':'person','meeting':'meeting','section':'b','document':'text','drawn':'o'}
        if (key,name)in ids:raise ValueError('duplicate context identity')
        ids[(key,name)]=prefixes[key]+str(counters[key])
    return ids


def direct_tools(row,profile):
    """Reject anything requiring implicit scope, weak matching, composition or world inference."""
    if not row['requests']:return []
    if len(row['requests'])!=1:raise ValueError('compound request: phase two')
    r=row['requests'][0];t=r['target'];typ=t['type'];act=r['act'];area=row['world'];ids=target_context(row);args={};op=None
    if r['mood']!='do'or r.get('question')or r.get('turn'):raise ValueError('query/dialogue: phase two')
    if t.get('description_span')or t.get('ordinal')or t.get('quantifier'):raise ValueError('described/quantified selector: phase two')
    values={};units={}
    for c in r.get('constraints',[]):
        if c.get('phase')!='result'or c.get('polarity')!='positive'or c.get('operator')!='eq'or c.get('character')!='requirement':raise ValueError('nonliteral constraint: phase two')
        if c['key']in values:raise ValueError('repeated role: phase two')
        values[c['key']]=c['value']
        if 'unit'in c:units[c['key']]=c['unit']
        if c.get('unit'):units[c['key']]=c['unit']
    name=t.get('name_span')
    ref=ids.get((typ,name))
    if t['mode']=='existing'and not ref and area!='avatar'and not(area=='drawing'and typ=='part'):
        if typ in ['section','inline']:ref=ids.get(('section',name))
        if typ=='text':ref=ids.get(('document',name))
        if not ref:raise ValueError('explicit target identity is missing')
    def resource(kind,label):
        found=ids.get((kind,label))
        if not found:raise ValueError('explicit resource identity is missing')
        return found
    follow=[]
    if area=='drawing':
        if typ=='part':
            owner=resource('drawn',values.get('part.owner'));index=number(values.get('part.index'))
            op='drawing.part.'+('change'if act=='change'else'place'if act=='place'else'remove'if act=='remove'else'unsupported')
            if op.endswith('unsupported'):raise ValueError('non-direct constituent act')
            args={'id':owner,'index':index};allowed={'part.owner','part.index','part.colour','part.width','part.height','part.x','part.y'}
            for key,value in values.items():
                if key=='part.colour':args['color']=profile['normalizations']['colour'][value]
                elif key not in ['part.owner','part.index']:args[key.split('.')[1]]=number(value)
        elif typ=='group'and act=='group':
            op='drawing.object.group';args={'ids':[resource('drawn',label)for label in values.get('group.members','').split(' and ')],'name':values.get('group.name')};allowed={'group.members','group.name'}
        elif act=='make':
            op='drawing.object.make';args={'kind':t.get('kind')};allowed={'drawn.colour','drawn.name','drawn.size'}
            if not args['kind']:raise ValueError('missing kind')
        elif act=='change':op='drawing.object.change';args={'ids':[ref]};allowed={'drawn.colour','drawn.name','drawn.size'}
        elif act=='remove':op='drawing.object.remove';args={'ids':[ref]};allowed=set()
        else:raise ValueError('non-direct drawing act')
        for key,value in values.items():
            if key=='drawn.colour':
                if value not in profile['normalizations']['colour']:raise ValueError('colour normalization not in fixed phase-one palette')
                args['color']=profile['normalizations']['colour'][value]
            elif key=='drawn.name':args['name']=value
            elif key=='drawn.size':args['size']=number(value)
    elif area=='diagram':
        if typ=='node':
            if act=='make':op='diagram.node.make';args={'kind':t.get('kind')};allowed={'node.colour','node.label','node.size'}
            elif act=='change':op='diagram.node.change';args={'ids':[ref]};allowed={'node.colour','node.label','node.size'}
            elif act=='remove':op='diagram.node.remove';args={'ids':[ref]};allowed=set()
            else:raise ValueError('non-direct node act')
            for key,value in values.items():
                if key=='node.label'and act=='make':
                    prefix=profile['nativeIdentity']['diagramNodePrefixes'][args['kind']];new_id=prefix+str(sum(kind=='node'for kind,_ in ids) +1)if args['kind']=='rectangle'else prefix+'1'
                    follow.append({'operation':'diagram.node.change','args':{'ids':[new_id],'label':value}})
                else:args[{'node.colour':'colour','node.label':'label','node.size':'size'}[key]]=value
        elif typ=='link'and act=='connect':
            op='diagram.link.make';args={'from':resource('node',values.get('link.from')),'to':resource('node',values.get('link.to'))};allowed={'link.from','link.to'}
        elif typ=='chart':
            if act=='make':
                op='chart.make';labels=values.get('chart.labels','').split(' and ');numbers=[number(part)for part in values.get('chart.values','').split(',')]if'chart.values'in values else[]
                if'chart.datasets'not in values and len(labels)!=len(numbers):raise ValueError('explicit chart labels/data mismatch')
                args={'type':t.get('kind'),'title':values.get('chart.title',''),'labels':labels,'values':numbers,'series':'Value','source':[]};allowed={'chart.title','chart.labels','chart.values','chart.datasets'}
                if'chart.datasets'in values:args['datasets']=json.loads(values['chart.datasets']);args.pop('values')
            elif act in ['change','arrange']:
                op='chart.change';args={'id':ref};allowed={'chart.show_values','chart.legend','chart.sort','chart.horizontal','chart.stacked','chart.palette'}
                for key,value in values.items():
                    param={'chart.show_values':'showValues','chart.legend':'showLegend','chart.sort':'sort','chart.horizontal':'horizontal','chart.stacked':'stacked','chart.palette':'palette'}[key]
                    args[param]=(value=='show')if key in ['chart.show_values','chart.legend']else(value=='on')if key in ['chart.stacked','chart.horizontal']else value
            else:raise ValueError('non-direct chart act')
        else:raise ValueError('whole diagram inference: phase two')
    elif area=='document':
        if typ=='inline'and act=='change':
            if 'inline.align'in values:op='document.block.align';args={'id':ref,'align':values['inline.align']};allowed={'inline.align'}
            else:
                op='document.block.mark';args={'id':ref,'from':number(values.get('inline.from')),'to':number(values.get('inline.to')),'mark':values.get('inline.format'),'enabled':values.get('inline.enabled')=='on'};allowed={'inline.from','inline.to','inline.format','inline.enabled','inline.link_target','inline.highlight_colour'}
                if 'inline.link_target'in values:args['attrs']={'href':values['inline.link_target']}
                if 'inline.highlight_colour'in values:args['attrs']={'color':profile['normalizations']['colour'][values['inline.highlight_colour']]}
        elif typ=='inline'and act=='make':
            parent=next((identifier for(kind,_),identifier in ids.items()if kind=='document'),None)
            if not parent:raise ValueError('explicit parent document missing')
            if t.get('kind')=='list':op='document.list.make';args={'parent':parent,'items':json.loads('['+values['inline.items']+']'),'style':values['inline.list_kind']};allowed={'inline.items','inline.list_kind'}
            elif t.get('kind')=='table':op='document.table.make';args={'parent':parent,'rows':json.loads(values['inline.rows']),'header':True};allowed={'inline.rows'}
            else:raise ValueError('unsupported literal document container')
        elif typ=='text'and act=='change'and'text.title'in values:op='document.title.change';args={'id':ref,'title':values['text.title']};allowed={'text.title'}
        elif typ=='section'and act=='change'and'section.level'in values:op='document.section.change';args={'id':ref,'level':number(values['section.level'])};allowed={'section.level'}
        elif typ=='text'and act=='make'and'text.content'in values:
            op='document.write';args={'title':values.get('text.title',''),'blocks':[{'kind':'paragraph','text':values['text.content']}]};allowed={'text.title','text.content'}
        elif typ=='section'and act=='make':
            parent=next((identifier for(kind,_),identifier in ids.items()if kind=='document'),None)
            if not parent:raise ValueError('explicit parent document missing')
            kind=t.get('kind')
            if kind not in ['heading','paragraph','quote']:raise ValueError('nonliteral section realization')
            op='document.block.make';args={'parent':parent,'kind':kind,'text':values.get('section.content','')};allowed={'section.content'}
            if kind=='heading':args['level']=3
        elif typ=='section'and act=='change':op='document.block.change';args={'id':ref,'text':values.get('section.content','')};allowed={'section.content'}
        elif typ=='section'and act=='remove':op='document.section.remove';args={'ids':[ref]};allowed=set()
        else:raise ValueError('composition/structural document operation: phase two')
    elif area=='avatar':
        slots=profile['avatar']['capabilities']['slots'];by_label={slot['label']:slot for slot in slots}
        if typ=='face':
            if name!='Avatar':raise ValueError('explicit face identity missing')
            if act!='change'or len(values)!=1:raise ValueError('non-direct face action')
            key,value=next(iter(values.items()));parameter=key.split('.')[1]
            if parameter not in ['preset','expression','name']:raise ValueError('unsupported face field')
            op='avatar.face.'+parameter;args={'id':'face',parameter:value};allowed={key}
        elif typ=='part':
            labels=[json.loads(label)if label.startswith('"')else label for label in values.get('part.ids','').split(' and ')]
            if any(label not in by_label for label in labels):raise ValueError('explicit native part identity missing')
            part_ids=[by_label[label]['id']for label in labels];allowed={'part.ids','part.variant','part.colour','part.size','part.place'}
            if act=='make':
                if len(part_ids)!=1:raise ValueError('part creation needs one identity')
                op='avatar.part.add';args={'id':part_ids[0],'variant':values.get('part.variant')}
            elif act=='change':
                op='avatar.part.change';args={'ids':part_ids}
                for key,value in values.items():
                    if key!='part.ids':args[key.split('.')[1]]=value
            elif act=='place':op='avatar.part.move';args={'ids':part_ids,'place':values.get('part.place')}
            elif act=='remove':op='avatar.part.remove';args={'ids':part_ids}
            else:raise ValueError('non-direct part action')
        else:raise ValueError('unsupported avatar family')
    elif area=='calendar':
        if typ in ['calendar','room','person']:
            op=f'calendar.{typ}.'+('add'if act=='make'else'change'if act=='change'else'remove'if act=='remove'else'unsupported')
            if op.endswith('unsupported'):raise ValueError('non-direct resource act')
            args={'id':'new-'+typ if act=='make'else ref};allowed={typ+'.name'}
            if typ=='calendar':allowed.add('calendar.colour')
            if typ=='room':allowed.update(['room.seats','room.location'])
            for key,value in values.items():
                prop=key.split('.')[1];args[{'name':'label','seats':'capacity'}.get(prop,prop)]=number(value)if prop=='seats'else profile['normalizations']['colour'][value]if prop=='colour'and value in profile['normalizations']['colour']else value
            if act=='make'and'label'not in args:raise ValueError('explicit resource name missing')
        elif typ=='meeting':
            op='calendar.meeting.'+('add'if act=='make'else'move'if act=='place'else'change'if act=='change'else'remove'if act=='remove'else'unsupported')
            if op.endswith('unsupported'):raise ValueError('non-direct meeting act')
            args={'id':'new-meeting'if act=='make'else ref};allowed={'meeting.title','meeting.calendar','meeting.room','meeting.people','meeting.agenda','meeting.day','meeting.time','meeting.length'}
            if 'meeting.title'in values:args['title']=values['meeting.title']
            if 'meeting.calendar'in values:args['calendar']=resource('calendar',values['meeting.calendar'])
            if 'meeting.room'in values:args['room']=resource('room',values['meeting.room'])
            if 'meeting.people'in values:args['participants']=[resource('person',values['meeting.people'])]
            if 'meeting.agenda'in values:args['notes']=values['meeting.agenda']
            if 'meeting.day'in values or'meeting.time'in values:
                day=values.get('meeting.day');clock=values.get('meeting.time')
                if 'UTC'not in row.get('text',''):raise ValueError('date-time frame is not explicit: phase two')
                if not day or not clock or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day)or not re.fullmatch(r'\d{2}:\d{2}',clock):raise ValueError('relative/incomplete date-time: phase two')
                args['start']=int(datetime.datetime.fromisoformat(day+'T'+clock).replace(tzinfo=datetime.timezone.utc).timestamp()*1000)
            if 'meeting.length'in values:args['duration']=number(values['meeting.length'])*{'minute':60000,'hour':3600000,'millisecond':1}[units.get('meeting.length','minute')]
            if act=='make':
                if not all(key in args for key in ['title','start','duration']):raise ValueError('explicit meeting title/interval missing')
                args.setdefault('participants',[]);args.setdefault('room',None);args.setdefault('calendar',None)
                if not(args['participants']or args['room']or args['calendar']):raise ValueError('explicit resource missing')
        else:raise ValueError('unsupported calendar type')
    else:raise ValueError('unsupported area')
    if set(values)-allowed:raise ValueError('unconsumed semantic fields')
    if any(value is None for key,value in args.items()if key not in ['room','calendar']):raise ValueError('missing explicit tool argument')
    count=number(t.get('count',1))
    if count!=1 and not(act=='make'and area=='drawing'):raise ValueError('group composition: phase two')
    return [{'operation':op,'args':args.copy()}for _ in range(count)]+follow
