"""Pure CPU in-memory applier for sop.key-reader-weight-migration/1.

No checkpoint/file I/O, optimizer loading, model construction or GPU transfer.
Both source and fresh states remain untouched, including on refusal.
"""
import json
import math
import re

class Refusal(ValueError):
    pass

def canonical(value,depth=0):
    if depth>32:
        raise Refusal('config-depth')
    if value is None or type(value) in (str,bool,int):
        return json.dumps(value,ensure_ascii=False,sort_keys=True)
    if type(value) is float:
        if not math.isfinite(value):
            raise Refusal('nonfinite-config')
        return json.dumps(value)
    if type(value) is list:
        return '['+','.join(canonical(v,depth+1) for v in value)+']'
    if type(value) is dict and all(type(k)is str for k in value):
        return '{'+','.join(json.dumps(k)+':'+canonical(value[k],depth+1)for k in sorted(value))+'}'
    raise Refusal('invalid-config-value')

def unique_strings(values):
    if type(values)is not list or not values or any(type(v)is not str or not v for v in values) or len(set(values))!=len(values):
        raise Refusal('invalid-or-duplicate-keys')
    return {value:i for i,value in enumerate(values)}

def validate_config(config,version):
    if type(config)is not dict or config.get('format')!=version:
        raise Refusal('unsupported-config-version')
    if len(canonical(config))>2000000:
        raise Refusal('config-size')
    keys=unique_strings(config.get('keys'))
    bio=config.get('bioKeys')
    if type(bio)is not list or any(type(v)is not str or v not in keys for v in bio) or len(bio)!=len(set(bio)):
        raise Refusal('invalid-bio-keys')
    registry=config.get('registry')
    if type(registry)is not dict or set(registry)!=set(keys):
        raise Refusal('invalid-registry')
    for key,spec in registry.items():
        if type(spec)is not dict or spec.get('role')not in ('global','domain','metadata','derived'):
            raise Refusal('invalid-registry-entry')
    banks=config.get('banks')
    if type(banks)is not dict or not set(banks)<=set(keys):
        raise Refusal('invalid-banks')
    for key,entries in banks.items():
        if type(entries)is not list or len(entries)<2:
            raise Refusal('invalid-bank')
        names=[]
        for entry in entries:
            if type(entry)is not dict:
                raise Refusal('invalid-bank-entry')
            state=entry.get('state')
            if state in ('absent','unknown'):
                if set(entry)!={'state'}:
                    raise Refusal('invalid-bank-entry')
            elif state=='value':
                if set(entry)!={'state','value'}:
                    raise Refusal('invalid-bank-entry')
            else:
                raise Refusal('invalid-bank-state')
            names.append(canonical(entry))
        if len(names)!=len(set(names)):
            raise Refusal('duplicate-bank-entry')
        for state in ('absent','unknown'):
            if sum(entry['state']==state for entry in entries)!=1:
                raise Refusal('missing-reserved-bank-state')
    encoder=config.get('encoder')
    files=config.get('encoderFiles')
    if type(encoder)is not str or not encoder or type(files)is not dict or not files:
        raise Refusal('missing-encoder-provenance')
    for name,digest in files.items():
        if type(name)is not str or not name or '/'in name or '\\'in name or name in ('.','..') or type(digest)is not str or re.fullmatch('[a-f0-9]{64}',digest)is None:
            raise Refusal('invalid-encoder-provenance')
    return keys,{key:i for i,key in enumerate(bio)}

def expected_rows(old,new,old_keys,new_keys,old_bio,new_bio):
    result={}
    def add(source,target,rows):
        result[(source,target)]=rows
    shared=sorted(set(old_keys)&set(new_keys))
    rows=[[old_keys[key],new_keys[key]]for key in shared]
    for name in ('key.weight','presence.weight','presence.bias'):
        add(name,name,rows)
    rows=[[3*old_bio[key]+label,3*new_bio[key]+label]
          for key in sorted(set(old_bio)&set(new_bio))for label in range(3)]
    for name in ('bio.weight','bio.bias'):
        add(name,name,rows)
    initialized={}
    for key,entries in new['banks'].items():
        before={canonical(entry):i for i,entry in enumerate(old['banks'].get(key,[]))}
        missing=[i for i,entry in enumerate(entries)if key not in old_keys or canonical(entry)not in before]
        if missing:
            initialized[key]=missing
        if key not in old_keys or key not in old['banks']:
            continue
        rows=[[before[canonical(entry)],i]for i,entry in enumerate(entries)if canonical(entry)in before]
        for suffix in ('weight','bias'):
            add('classes.'+str(old_keys[key])+'.'+suffix,
                'classes.'+str(new_keys[key])+'.'+suffix,rows)
    return result,initialized

def validate_plan(plan,old,new,old_keys,new_keys,old_bio,new_bio):
    fields={'format','from','to','rowPlans','newKeys','newBIOKeys','initializedClasses',
            'encoderPolicy','otherTensorPolicy','optimizerPolicy','appliesWeights'}
    if type(plan)is not dict or set(plan)!=fields or plan['format']!='sop.key-reader-weight-migration/1' or plan['from']!=old['format'] or plan['to']!=new['format'] or plan['appliesWeights']is not False:
        raise Refusal('invalid-plan-contract')
    if any(type(plan[k])is not str or not plan[k] for k in ('encoderPolicy','otherTensorPolicy','optimizerPolicy')):
        raise Refusal('invalid-plan-policy')
    if plan['newKeys']!=sorted(set(new_keys)-set(old_keys)) or plan['newBIOKeys']!=sorted(set(new_bio)-set(old_bio)):
        raise Refusal('invalid-new-key-plan')
    expected,initialized=expected_rows(old,new,old_keys,new_keys,old_bio,new_bio)
    if type(plan['rowPlans'])is not list:
        raise Refusal('invalid-row-plans')
    actual={}
    for entry in plan['rowPlans']:
        if type(entry)is not dict or set(entry)!={'source','target','rows','requireEqualNonRowDimensions'} or entry['requireEqualNonRowDimensions']is not True:
            raise Refusal('invalid-row-plan')
        source,target=entry['source'],entry['target']
        if type(source)is not str or type(target)is not str or (source,target)in actual:
            raise Refusal('duplicate-or-invalid-tensor-plan')
        rows=entry['rows']
        if type(rows)is not list or any(type(pair)is not list or len(pair)!=2 or any(type(i)is not int or i<0 for i in pair)for pair in rows):
            raise Refusal('invalid-row-index')
        if len({tuple(pair)for pair in rows})!=len(rows):
            raise Refusal('duplicate-row-index')
        actual[(source,target)]=rows
    if actual!=expected:
        raise Refusal('semantic-row-plan-mismatch')
    captured={}
    if type(plan['initializedClasses'])is not list:
        raise Refusal('invalid-initialized-plan')
    for entry in plan['initializedClasses']:
        if type(entry)is not dict or set(entry)!={'key','classRows'} or type(entry['key'])is not str or entry['key']in captured:
            raise Refusal('invalid-initialized-plan')
        if type(entry['classRows'])is not list or any(type(i)is not int or i<0 for i in entry['classRows']):
            raise Refusal('invalid-initialized-row')
        captured[entry['key']]=entry['classRows']
    if captured!=initialized:
        raise Refusal('initialized-row-plan-mismatch')
    return expected

def apply_weight_migration(old_config,new_config,plan,old_state,fresh_state,
                           *,max_elements=10000000,max_tensors=10000,max_rows=100000):
    """Return an independent CPU state, or {ok:false,state:None} atomically.

    max_elements charges validation reads, cloning, copies and dtype roundtrips;
    it is a total work/allocation bound, not just a count of model parameters.
    """
    stats={'elements':0,'copiedElements':0,'tensors':0,'rows':0}
    def tick(kind,count=1):
        stats[kind]+=count
        limit={'elements':max_elements,'tensors':max_tensors,'rows':max_rows}[kind]
        if stats[kind]>limit:
            raise Refusal('budget-'+kind)
    try:
        import torch
        if any(type(v)is not int or v<1 for v in (max_elements,max_tensors,max_rows)):
            raise Refusal('invalid-budget')
        old_keys,old_bio=validate_config(old_config,'sop.key-reader/1')
        new_keys,new_bio=validate_config(new_config,'sop.key-reader/2-target-type-candidate')
        if old_config['encoder']!=new_config['encoder'] or old_config['encoderFiles']!=new_config['encoderFiles']:
            raise Refusal('encoder-provenance-mismatch')
        for key in set(old_keys)&set(new_keys):
            left={k:v for k,v in old_config['registry'][key].items()if k!='values'}
            right={k:v for k,v in new_config['registry'][key].items()if k!='values'}
            if canonical(left)!=canonical(right):
                raise Refusal('changed-shared-key-semantics')
        rows=validate_plan(plan,old_config,new_config,old_keys,new_keys,old_bio,new_bio)
        def state_schema(state,config,keys):
            if type(state)is not dict or any(type(key)is not str for key in state):
                raise Refusal('invalid-state')
            if 'key.weight'not in state:
                raise Refusal('missing-key-embedding')
            weight=state['key.weight']
            if type(weight)is not torch.Tensor or weight.ndim!=2 or weight.shape[0]!=len(keys) or weight.shape[1]<1:
                raise Refusal('embedding-shape-mismatch')
            width=weight.shape[1]
            shapes={'key.weight':(len(keys),width),'presence.weight':(len(keys),width),
                    'presence.bias':(len(keys),),'bio.weight':(3*len(config['bioKeys']),width),
                    'bio.bias':(3*len(config['bioKeys']),)}
            for key,bank in config['banks'].items():
                base='classes.'+str(keys[key])
                shapes[base+'.weight']=(len(bank),width);shapes[base+'.bias']=(len(bank),)
            encoder={key for key in state if key.startswith('encoder.')and len(key)>8}
            if not encoder or set(state)!=set(shapes)|encoder:
                raise Refusal('missing-or-foreign-tensor-name')
            for key,tensor in state.items():
                tick('tensors')
                if type(tensor)is not torch.Tensor or tensor.device.type!='cpu' or tensor.layout!=torch.strided or tensor.is_complex():
                    raise Refusal('cpu-dense-real-tensors-required')
                if key in shapes and (tuple(tensor.shape)!=shapes[key] or not tensor.is_floating_point()):
                    raise Refusal('head-tensor-shape-or-dtype')
                tick('elements',tensor.numel())
                if not bool(torch.isfinite(tensor).all()):
                    raise Refusal('nonfinite-tensor')
            return width,encoder
        old_width,old_encoder=state_schema(old_state,old_config,old_keys)
        new_width,new_encoder=state_schema(fresh_state,new_config,new_keys)
        if old_width!=new_width or old_encoder!=new_encoder:
            raise Refusal('encoder-or-hidden-shape-mismatch')
        for key in old_encoder:
            if old_state[key].shape!=fresh_state[key].shape:
                raise Refusal('encoder-tensor-shape-mismatch')
        # No writes occur until every config/plan/name/shape/value is validated.
        with torch.no_grad():
            result={}
            for key,tensor in fresh_state.items():
                tick('elements',tensor.numel());result[key]=tensor.detach().clone()
            def converted(value,dtype):
                tick('elements',2*value.numel())
                out=value.detach().to(dtype=dtype)
                if not torch.equal(out.to(dtype=value.dtype),value):
                    raise Refusal('lossy-dtype-conversion')
                return out
            for key in sorted(old_encoder):
                source=old_state[key];tick('elements',source.numel())
                result[key].copy_(converted(source,result[key].dtype))
                stats['copiedElements']+=source.numel()
            for (source,target),pairs in rows.items():
                for source_row,target_row in pairs:
                    tick('rows')
                    value=old_state[source][source_row]
                    tick('elements',value.numel())
                    result[target][target_row].copy_(converted(value,result[target].dtype))
                    stats['copiedElements']+=value.numel()
        return {'ok':True,'state':result,'optimizerState':None,'stats':stats,
                'format':'sop.key-reader-weight-migration-result/1',
                'boundary':'in-memory semantic rows only; no trained artifact or confidence'}
    except (Refusal,TypeError,KeyError,IndexError,RuntimeError,OverflowError)as error:
        return {'ok':False,'state':None,'optimizerState':None,'stats':stats,
                'issues':[{'reason':str(error)if isinstance(error,Refusal)else'invalid-migration-data'}]}
