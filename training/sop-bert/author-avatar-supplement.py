"""Concrete Avatar examples from the exact geometry-backed native capability catalog."""
import hashlib,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('authored_helpers',ROOT/'author-demo-data.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
c=base.condition;q=base.request

def rows(profile):
    avatar=profile['avatar'];caps=avatar['capabilities'];present={obj['id']for obj in avatar['objects']};slots=caps['slots'];result=[]
    context={'existing':[{'kind':obj['kind'],'name':'Avatar'if obj['id']=='face'else obj['id'].replace('_',' ')}for obj in avatar['objects']],'previous':None}
    def emit(text,request,tag):
        identity='avatar-demo-'+hashlib.sha256((tag+'\n'+text).encode()).hexdigest()[:18]
        result.append({'id':identity,'source_id':identity,'source_path':'data/demo-tool-profile/avatar-authored.jsonl','world':'avatar','context':context,'text':text,'requests':[request]})
    for preset in caps['presets']:
        for text,trigger in [(f'set Avatar to the {preset} preset','set'),(f'use the {preset} preset for Avatar','use'),(f'please change Avatar to the {preset} preset','change')]:
            emit(text,q(text,trigger,'change','face',name='Avatar',constraints=[c('face.preset',preset)]),'preset')
    for expression in caps['expressions']:
        for text,trigger in [(f'make Avatar look {expression}','make'),(f'set Avatar to a {expression} expression','set'),(f'please give Avatar the {expression} expression','give')]:
            emit(text,q(text,trigger,'change','face',name='Avatar',constraints=[c('face.expression',expression)]),'expression')
    for name in ['Ada','Nova','Alex','Sky','Sam','Robin','Morgan','Casey']:
        text=f'call Avatar {name}'
        emit(text,q(text,'call','change','face',name='Avatar',constraints=[c('face.name',name)]),'name')
    for slot in slots:
        native_id=slot['id'];label=slot['label'];exists=native_id in present
        for variant in slot['variants']:
            act='change'if exists else'make';verb='set'if exists else'add';mode='existing'if exists else'new'
            texts=[f'{verb} the "{label}" part to the {variant} variant',f'please {verb} the "{label}" part using the {variant} variant']
            for text in texts:
                emit(text,q(text,verb,act,'part',mode=mode,constraints=[c('part.ids',label,'"'+label+'"'),c('part.variant',variant)]),'variant:'+native_id)
        if not exists:continue
        for size in caps['sizes']:
            text=f'make the {label} {size} size'
            emit(text,q(text,'make','change','part',constraints=[c('part.ids',label),c('part.size',size)]),'size:'+native_id)
        for direction in caps['directions']:
            for text,trigger in [(f'move the {label} {direction}','move'),(f'please shift the {label} {direction}','shift')]:
                emit(text,q(text,trigger,'place','part',constraints=[c('part.ids',label),c('part.place',direction)]),'move:'+native_id)
        peers=[s for s in slots if s['id']in present and s['colourRole']==slot['colourRole']]if slot['colourRole']else[slot]
        labels=' and '.join(s['label']for s in peers)
        for colour in avatar['tintColours'].get(slot['colourRole'],[])if slot['colourRole']else avatar['fixedColours'].get(native_id,[]):
            text=f'make the {labels} {colour}'
            emit(text,q(text,'make','change','part',constraints=[c('part.ids',labels),c('part.colour',colour)]),'colour:'+str(slot['colourRole']or native_id))
        if slot['optional']:
            text=f'remove the {label}'
            emit(text,q(text,'remove','remove','part',constraints=[c('part.ids',label)]),'remove:'+native_id)
    unique={row['id']:row for row in result}
    return list(unique.values())
