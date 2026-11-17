"""Concrete document toolbar operations, including literal lists/tables and character marks."""
import hashlib,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',ROOT/'author-demo-data.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
c=base.condition;q=base.request

def rows(profile):
    result=[];bindings={op['id']:op for op in profile['declarations']['document']}
    context={'existing':[{'name':'Draft','kind':'document'},{'name':'Body','kind':'paragraph','text':'The final draft is ready.'}],'previous':None}
    def emit(text,request,tag,ctx=context):
        identity='documents-tools-'+hashlib.sha256((tag+'\n'+text).encode()).hexdigest()[:18]
        result.append({'id':identity,'source_id':identity,'source_path':'data/demo-tool-profile/documents-authored.jsonl','world':'document','context':ctx,'text':text,'requests':[request]})
    for index in range(1,31):
        title=f'Review notes {index}';text=f'rename Draft to {title}'
        emit(text,q(text,'rename','change','text',name='Draft',constraints=[c('text.title',title)]),'title')
    for alignment in bindings['document.block.align']['params']['align']['enum']:
        text=f'align Body {alignment}'
        emit(text,q(text,'align','change','inline',name='Body',constraints=[c('inline.align',alignment)]),'align')
    for mark in bindings['document.block.mark']['params']['mark']['enum']:
        for enabled in ['on','off']:
            for a,b in [(0,5),(4,9),(10,15)]:
                suffix='';constraints=[c('inline.format',mark),c('inline.enabled',enabled),c('inline.from',a),c('inline.to',b)]
                if mark=='link'and enabled=='on':suffix=' with target https://example.org/notes';constraints.append(c('inline.link_target','https://example.org/notes'))
                if mark=='highlight'and enabled=='on':suffix=' using yellow';constraints.append(c('inline.highlight_colour','yellow'))
                text=f'turn {mark} {enabled} for characters {a} to {b} of Body'+suffix
                emit(text,q(text,'turn','change','inline',name='Body',constraints=constraints),'mark')
    for style in bindings['document.list.make']['params']['style']['enum']:
        for n in range(1,21):
            items=[f'Review draft {n}',f'Check numbers {n}',f'Send notes {n}'];literal=', '.join(json.dumps(item)for item in items)
            text=f'add a {style} list with items {literal}'
            emit(text,q(text,'add','make','inline',kind='list',mode='new',constraints=[c('inline.list_kind',style),c('inline.items',literal)]),'list')
    for n in range(1,31):
        rows=[['Item','Count'],[f'Draft {n}',str(n)]];literal=json.dumps(rows)
        text=f'insert a table with rows {literal}'
        emit(text,q(text,'insert','make','inline',kind='table',mode='new',constraints=[c('inline.rows',literal)]),'table')
    for level in [1,2]:
        text=f'change the Overview heading to level {level}'
        ctx={'existing':[{'name':'Draft','kind':'document'},{'name':'Overview','kind':'heading'}],'previous':None}
        emit(text,q(text,'change','change','section',name='Overview',constraints=[c('section.level',level)]),'heading',ctx)
    return result
