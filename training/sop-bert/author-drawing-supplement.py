"""Explicit part indices/geometry and groups from the real Drawing primitives."""
import hashlib,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',ROOT/'author-demo-data.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
c=base.condition;q=base.request

def rows(profile):
    result=[]
    def emit(text,request,context,tag):
        identity='drawing-tools-'+hashlib.sha256((tag+'\n'+text).encode()).hexdigest()[:18]
        result.append({'id':identity,'source_id':identity,'source_path':'data/demo-tool-profile/drawing-authored.jsonl','world':'drawing','context':{'existing':context,'previous':None},'text':text,'requests':[request]})
    for n in range(1,21):
        first=f'Alpha {n}';second=f'Beta {n}';group=f'Set {n}';text=f'group {first} and {second} as {group}'
        emit(text,q(text,'group','group','group',mode='new',constraints=[c('group.members',f'{first} and {second}'),c('group.name',group)]),[{'name':first,'kind':'circle'},{'name':second,'kind':'square'}],'group')
    for part in profile['drawingParts']:
        index=part['index'];owner='House A';context=[{'name':owner,'kind':'house'}]
        for colour in profile['normalizations']['colour']:
            text=f'make part {index} of {owner} {colour}'
            emit(text,q(text,'make','change','part',constraints=[c('part.owner',owner),c('part.index',index,f'part {index}'),c('part.colour',colour)]),context,'part-colour')
        if part['width']>0 and part['height']>0:
            for amount in [20,35,50,80]:
                for dimension in ['width','height']:
                    word='wide'if dimension=='width'else'tall';text=f'make part {index} of {owner} {amount} pixels {word}'
                    emit(text,q(text,'make','change','part',constraints=[c('part.owner',owner),c('part.index',index,f'part {index}'),c('part.'+dimension,amount,f'{amount} pixels',unit='pixel',measure=str(amount))]),context,'part-size')
        for x,y in [(150,220),(310,280),(450,360)]:
            text=f'place part {index} of {owner} at x {x} and y {y}'
            emit(text,q(text,'place','place','part',constraints=[c('part.owner',owner),c('part.index',index,f'part {index}'),c('part.x',x),c('part.y',y)]),context,'part-place')
        text=f'remove part {index} of {owner}'
        emit(text,q(text,'remove','remove','part',constraints=[c('part.owner',owner),c('part.index',index,f'part {index}')]),context,'part-remove')
    return result
