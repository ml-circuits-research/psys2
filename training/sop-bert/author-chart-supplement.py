"""Explicit multi-series chart data and visible chart options from current tool declarations."""
import hashlib,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',ROOT/'author-demo-data.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
c=base.condition;q=base.request

def rows(profile):
    result=[];ops={op['id']:op for op in profile['declarations']['diagram']}
    def emit(text,request,tag,existing):
        identity='chart-tools-'+hashlib.sha256((tag+'\n'+text).encode()).hexdigest()[:18]
        result.append({'id':identity,'source_id':identity,'source_path':'data/demo-tool-profile/charts-authored.jsonl','world':'diagram','context':{'existing':existing,'previous':None},'text':text,'requests':[request]})
    for n in range(1,11):
        for form in ops['chart.make']['params']['type']['enum']:
            title=f'Sales {n}';data=[{'label':'North','data':[n,n+2]},{'label':'South','data':[n+1,n+3]}];literal=json.dumps(data);labels='Jan and Feb'
            text=f'create a {form} chart called {title} for {labels} with datasets {literal}'
            emit(text,q(text,'create','make','chart',kind=form,mode='new',constraints=[c('chart.title',title),c('chart.labels',labels),c('chart.datasets',literal)]),'datasets',[])
    for key in ['stacked','horizontal','legend','show_values']:
        for state in ['on','off']:
            literal=state
            if key in ['legend','show_values']:literal='show'if state=='on'else'hide'
            text=f'turn {key.replace("_"," ")} {state} for Sales'
            emit(text,q(text,'turn','change','chart',name='Sales',constraints=[c('chart.'+key,literal,f'{key.replace("_"," ")} {state}')]),'option',[{'name':'Sales','kind':'chart'}])
    for palette in ops['chart.change']['params']['palette']['enum']:
        text=f'use the {palette} palette for Sales'
        emit(text,q(text,'use','change','chart',name='Sales',constraints=[c('chart.palette',palette)]),'palette',[{'name':'Sales','kind':'chart'}])
    return result
