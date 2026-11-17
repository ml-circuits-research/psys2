"""Semantic tensor transfer between compatible inventory-key readers; no optimizer state."""
import json

def signature(spec):
    return tuple(spec.get(key) for key in ('role','head','concept'))

def transfer(model, checkpoint, target_config):
    import torch
    source=checkpoint.get('model',checkpoint);old=checkpoint.get('config',{})
    destination=model.state_dict();summary={'encoderTensors':0,'sharedKeys':0,'newKeys':len(target_config['keys']),'classRows':0}
    old_keys={key:i for i,key in enumerate(old.get('keys',[]))};new_keys={key:i for i,key in enumerate(target_config['keys'])}
    shared=[key for key in new_keys if key in old_keys and signature(old['registry'][key])==signature(target_config['registry'][key])]
    def rows(before,after,pairs):
        if not pairs:return
        if before not in source or after not in destination or source[before].shape[1:]!=destination[after].shape[1:]:raise ValueError('incompatible-semantic-warmstart-tensor:'+before)
        indices=torch.tensor([pair[0] for pair in pairs],dtype=torch.long)
        values=source[before].index_select(0,indices).to(dtype=destination[after].dtype,device=destination[after].device)
        destination[after].index_copy_(0,torch.tensor([pair[1] for pair in pairs],dtype=torch.long,device=destination[after].device),values)
    with torch.no_grad():
        for name,value in destination.items():
            if not name.startswith('encoder.'):continue
            if name not in source or value.shape!=source[name].shape:raise ValueError('incompatible-warmstart-encoder:'+name)
            value.copy_(source[name].to(dtype=value.dtype,device=value.device));summary['encoderTensors']+=1
        if not summary['encoderTensors']:raise ValueError('missing-warmstart-encoder')
        pairs=[(old_keys[key],new_keys[key]) for key in shared]
        for name in ('presence.weight','presence.bias','key.weight'):rows(name,name,pairs)
        old_bio={key:i for i,key in enumerate(old.get('bioKeys',[]))};new_bio={key:i for i,key in enumerate(target_config['bioKeys'])}
        pairs=[(3*old_bio[key]+tag,3*new_bio[key]+tag) for key in shared if key in old_bio and key in new_bio for tag in range(3)]
        for name in ('bio.weight','bio.bias'):rows(name,name,pairs)
        canonical=lambda value:json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'))
        for key in shared:
            old_bank={canonical(value):i for i,value in enumerate(old.get('banks',{}).get(key,[]))}
            pairs=[(old_bank[canonical(value)],i) for i,value in enumerate(target_config['banks'].get(key,[])) if canonical(value) in old_bank]
            for suffix in ('weight','bias'):rows('classes.'+str(old_keys[key])+'.'+suffix,'classes.'+str(new_keys[key])+'.'+suffix,pairs)
            summary['classRows']+=len(pairs)
    summary.update(sharedKeys=len(shared),newKeys=len(new_keys)-len(shared))
    return summary
