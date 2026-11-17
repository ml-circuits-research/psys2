"""Inventory-key BIO reader with shared per-mention metadata; no slot assignment.
Gold request cuts are conditional supervision, never an inference argument.
"""
import argparse,collections,copy,math,gzip,hashlib,importlib.util,json,os,random,shutil,tempfile,time,uuid
from pathlib import Path

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def typed(v):return json.dumps(v,sort_keys=True,ensure_ascii=False)
def bank(spec):return [{'state':'absent'},{'state':'unknown'}]+[{'state':'value','value':v}for v in spec.get('values',[])]
def label(value,values):
    for i,item in enumerate(values[2:],2):
        if typed(value)==typed(item['value']):return i
    return 1

def token_interval(offsets,span):
    if not span:return None
    ids=[i for i,(a,b)in enumerate(offsets)if b>a and a>=span[0]and b<=span[1]]
    return (ids[0],ids[-1]+1)if ids and offsets[ids[0]][0]==span[0]and offsets[ids[-1]][1]==span[1]else None

CHECKPOINT_EVALUATION={'format':'sop.key-reader-checkpoint-evaluation/1',
    'trainingParameterDtype':'float32','checkpointFloatingStorage':'bfloat16',
    'evaluationRoundtrip':'float32->bfloat16->float32','forwardAutocast':'disabled',
    'device':'training-device','state':'detached-eval-clone','optimizer':'unchanged'}

TRAINING_OBJECTIVE={'format':'sop.key-reader-presence-bio-consistency/1',
    'baselineTrainerSha256':'f9e5794fd939ce5a202be2c4cdfdacc7e8e48e68ded4d50d97453108bcc6a69c',
    'coefficient':0.1,'pool':'max-source-B','divergence':'Bernoulli-Jensen-Shannon-natural-log',
    'eligibility':'known-presence; nontruncated; complete legal source BIO supervision; gold B-support agrees',
    'tokens':'sequence0; positive scalar offsets; attention1; no special/context/padding',
    'normalization':'mean eligible rows per gold-presence stratum, then strata per key, then supported keys',
    'zeroSupport':'differentiable-zero','baseLoss':'unchanged per-key weighted BIO/presence/class mean',
    'interpretation':'training regularizer only; no graph confidence or calibration'}

SELECTION_CRITERION={'format':'sop.key-reader-selection/1','order':['positiveSupervisedBioGlobalExactRate','targetTypePresentClassAccuracy','decodedMentionF1'],'scope':'gold-cut supervised BIO+global subset, not complete graph'}

def selection_rank(report):
    support=report['positiveBioAndGlobalSupport']
    if type(support)is not int or support<1:raise ValueError('selection-needs-positive-supervision')
    kind=report['targetTypePresentClass'];count=kind['support']
    return (report['positiveBioAndGlobalExact']/support,kind['correct']/count if count else 0.,report['decodedMentionF1'])

TRAINING_POLICY_CONTRACT={'format':'sop.key-reader-plateau-policy/1',
    'primary':'positiveSupervisedBioGlobalExactRate','improvement':'strict-rational',
    'ties':'non-improvement','minEpochsLowerBound':3,'maxEpochsUpperBound':1000,
    'defaults':{'minEpochs':3,'patience':3,'maxEpochs':30}}

def training_policy(min_epochs=3,patience=3,max_epochs=30):
    if any(type(v)is not int for v in (min_epochs,patience,max_epochs)) or not 3<=min_epochs<=max_epochs<=1000 or patience<1:
        raise ValueError('invalid-plateau-policy')
    return {'format':'sop.key-reader-plateau-policy/1','minEpochs':min_epochs,'patience':patience,
            'maxEpochs':max_epochs,'primary':'positiveSupervisedBioGlobalExactRate',
            'improvement':'strict-rational','ties':'non-improvement'}

def advance_plateau(previous,epoch,report,policy):
    """Immutable state transition; secondary metrics never reset primary patience."""
    expected=training_policy(policy.get('minEpochs'),policy.get('patience'),policy.get('maxEpochs'))
    if policy!=expected or type(epoch)is not int or not 1<=epoch<=policy['maxEpochs']:
        raise ValueError('invalid-plateau-transition')
    correct,support=report.get('positiveBioAndGlobalExact'),report.get('positiveBioAndGlobalSupport')
    if type(correct)is not int or type(support)is not int or support<1 or not 0<=correct<=support:
        raise ValueError('plateau-needs-positive-supervision')
    if previous is None:
        if epoch!=1:raise ValueError('plateau-epoch-gap')
        improved=True;bad=0;best_correct,best_support=correct,support
    else:
        if type(previous)is not dict or previous.get('format')!='sop.key-reader-plateau-state/1' or previous.get('policy')!=policy or previous.get('stopReason')is not None or type(previous.get('epoch'))is not int or epoch!=previous['epoch']+1:
            raise ValueError('plateau-epoch-gap-or-finished')
        if support!=previous.get('support'):
            raise ValueError('plateau-supervision-support-changed')
        best_correct,best_support=previous['bestPrimaryCorrect'],previous['bestPrimarySupport']
        if type(best_correct)is not int or type(best_support)is not int or best_support<1 or not 0<=best_correct<=best_support or type(previous.get('badEpochs'))is not int or previous['badEpochs']<0:
            raise ValueError('invalid-plateau-state')
        improved=correct*best_support>best_correct*support
        bad=0 if improved else previous['badEpochs']+1
        if improved:best_correct,best_support=correct,support
    plateau=epoch>=policy['minEpochs'] and bad>=policy['patience']
    cap=epoch==policy['maxEpochs']
    reason='primary-plateau'if plateau else'max-epochs'if cap else None
    return {'format':'sop.key-reader-plateau-state/1','epoch':epoch,'support':support,
            'bestPrimaryCorrect':best_correct,'bestPrimarySupport':best_support,
            'badEpochs':bad,'primaryImproved':improved,'stopReason':reason,
            'minimumSatisfied':epoch>=policy['minEpochs'],'maxReached':cap,'policy':dict(policy)}

def configuration(manifest):
    if manifest.get('format')!='sop.per-key-supervision/3-target-type-migration-candidate':raise ValueError('candidate-supervision-required')
    registry=manifest['registry'];keys=list(registry)
    if registry.get('request.target.type',{}).get('bio') is not False:raise ValueError('target-type-must-be-class-only')
    return {'format':'sop.key-reader/2-target-type-candidate','rawCodecFormat':'sop.key-reader-raw-codec/2-target-type-candidate','candidate':True,'executionEligible':False,'tensorArchitectureVersion':2,'trainingSourceFormat':'sop.key-reader-source/5-presence-bio-consistency-candidate','trainingObjective':copy.deepcopy(TRAINING_OBJECTIVE),'trainingPolicyContract':TRAINING_POLICY_CONTRACT,'selectionCriterion':SELECTION_CRITERION,'checkpointEvaluation':CHECKPOINT_EVALUATION,'baselineTrainerSha256':'eb0a0ef595e1587da2be4ad4aea3a90ce1ba8829b89385be90ace4b13810d01f','inventorySha256':manifest['inventorySha256'],'exclusionSha256':manifest['exclusionSha256'],'targetFamilies':manifest['targetFamilies'],'keys':keys,'registry':registry,'banks':{k:bank(v)for k,v in registry.items()if v.get('values')},'bioKeys':[k for k,v in registry.items()if v['role']in ['domain','global'] and v.get('bio',True)],'metadataKeys':[k for k,v in registry.items()if v['role']=='metadata'and v.get('values')],'maxLength':192,'boundary':'Conditional gold-cut training; predicted BIO mentions at runtime; unrepresented normalizations/candidates unresolved. No observed literal vocabulary.'}

def encode(row,tokenizer,config):
    import torch
    context=json.dumps({'area':row['area'],'context':row['context']},ensure_ascii=False,sort_keys=True)
    full=tokenizer(row['text'],context,truncation=False);enc=tokenizer(row['text'],context,truncation='longest_first',max_length=config['maxLength'],padding='max_length',return_offsets_mapping=True)
    seq=enc.sequence_ids();offsets=[tuple(o)if seq[i]==0 else(0,0)for i,o in enumerate(enc.pop('offset_mapping'))];truncated=len(full['input_ids'])>config['maxLength'];n=len(offsets);bio=torch.full((len(config['bioKeys']),n),-100,dtype=torch.long);presence=torch.full((len(config['keys']),),-100.,dtype=torch.float32);index={k:i for i,k in enumerate(config['keys'])};bindex={k:i for i,k in enumerate(config['bioKeys'])};covered=set(row['coveredKeys']);unknown=set(row['unknownBIOKeys']);classes={};mentions=[]
    for key in covered:
        if config['registry'][key]['role']!='derived':presence[index[key]]=float(key in row['globals']or any(m['key']==key or key in m['metadata']for m in row['mentions']))
        if key in bindex and key not in unknown and not truncated:
            for ti,(a,b)in enumerate(offsets):
                if b>a:bio[bindex[key],ti]=0
        if key in config['banks']and config['registry'][key]['role']=='global':classes[key]=label(row['globals'][key]['value'],config['banks'][key])if key in row['globals']else 0
    records=[{'key':k,'span':v['span'],'value':v['value'],'metadata':{},'trainable':True}for k,v in row['globals'].items()]+row['mentions']
    for m in records:
        interval=token_interval(offsets,m['span'])
        if m['key']not in bindex:continue
        if m['key']in unknown or not interval or not m['trainable']or truncated:
            bio[bindex[m['key']]]=-100
            continue
        a,b=interval;bio[bindex[m['key']],a]=1
        if b>a+1:bio[bindex[m['key']],a+1:b]=2
        targets={}
        if m.get('valuePresent',True)and m['key']in config['banks']and config['registry'][m['key']]['role']=='domain':targets[m['key']]=label(m['value'],config['banks'][m['key']])
        for key in config['metadataKeys']:
            if key in m['metadata']:targets[key]=label(m['metadata'][key],config['banks'][key])
            elif row['version']=='v2':targets[key]=0
        mentions.append((index[m['key']],a,b,targets))
    return {'input_ids':torch.tensor(enc['input_ids']),'attention_mask':torch.tensor(enc['attention_mask']),'source_mask':torch.tensor([seq[i]==0 and b>a and enc['attention_mask'][i]==1 for i,(a,b)in enumerate(offsets)],dtype=torch.bool),'bio':bio,'presence':presence,'classes':classes,'mentions':mentions,'truncated':truncated,'id':row['id']}

def build_model(config,encoder_path):
    import torch
    from transformers import AutoModel
    class Reader(torch.nn.Module):
        def __init__(self):
            super().__init__();self.encoder=AutoModel.from_pretrained(encoder_path);h=self.encoder.config.hidden_size;self.bio=torch.nn.Linear(h,len(config['bioKeys'])*3);self.presence=torch.nn.Linear(h,len(config['keys']));self.key=torch.nn.Embedding(len(config['keys']),h);self.classes=torch.nn.ModuleDict({str(config['keys'].index(k)):torch.nn.Linear(h,len(v))for k,v in config['banks'].items()})
        def forward(self,input_ids,attention_mask):
            hidden=self.encoder(input_ids=input_ids,attention_mask=attention_mask).last_hidden_state
            return hidden,self.bio(hidden).reshape(hidden.shape[0],hidden.shape[1],len(config['bioKeys']),3).permute(0,2,1,3),self.presence(hidden[:,0])
    return Reader()

def presence_bio_consistency(bio,presence,gold,pgold,source_mask,attention_mask,truncated,config):
    """Symmetric source-only agreement. Masks are supervision, never new labels."""
    import torch
    F=torch.nn.functional
    if bio.ndim!=4 or bio.shape[-1]!=3 or presence.ndim!=2 or tuple(gold.shape)!=tuple(bio.shape[:-1]) or tuple(pgold.shape)!=tuple(presence.shape):
        raise ValueError('consistency-logit-label-shapes')
    batch,keys,length,_=bio.shape
    if keys!=len(config['bioKeys']) or tuple(presence.shape)!=(batch,len(config['keys'])) or tuple(source_mask.shape)!=(batch,length) or source_mask.dtype!=torch.bool or tuple(attention_mask.shape)!=(batch,length) or tuple(truncated.shape)!=(batch,) or truncated.dtype!=torch.bool:
        raise ValueError('consistency-mask-shapes')
    # Empty reductions keep a differentiable zero even when ignored logits are NaN.
    zero=bio.reshape(-1)[:0].sum()+presence.reshape(-1)[:0].sum()
    source=source_mask & (attention_mask==1)
    positions=torch.arange(length,device=bio.device).expand(batch,length)
    last_source=torch.where(source,positions,-1).cummax(dim=1).values
    previous_index=torch.cat((last_source.new_full((batch,1),-1),last_source[:,:-1]),dim=1)
    index={key:i for i,key in enumerate(config['keys'])};per_key=[]
    for ki,key in enumerate(config['bioKeys']):
        if config['registry'][key]['role']not in ['domain','global'] or config['registry'][key].get('bio',True)is False:
            continue
        pi=index[key];labels=gold[:,ki];target=pgold[:,pi]
        previous=labels.gather(1,previous_index.clamp_min(0)).masked_fill(previous_index<0,0)
        eligible=(~truncated)&source.any(dim=1)&((target==0)|(target==1))
        eligible &= ((~source)|((labels==0)|(labels==1)|(labels==2))).all(dim=1)
        eligible &= ~(source&(labels==2)&(previous==0)).any(dim=1)
        eligible &= (source&(labels==1)).any(dim=1)==(target==1)
        rows=eligible.nonzero(as_tuple=True)[0]
        if not rows.numel():continue
        active_source=source[rows]
        # Mask before softmax: ignored/context/padding logits never affect loss
        # or backward, even when an ignored token is nonfinite.
        logits=bio[rows,ki].float().masked_fill(~active_source[:,:,None],0)
        z=presence[rows,pi].float()
        if not bool(torch.isfinite(logits).all()) or not bool(torch.isfinite(z).all()):
            raise ValueError('nonfinite-consistency-logits')
        log_tokens=F.log_softmax(logits,dim=-1)
        winner=log_tokens[:,:,1].masked_fill(~active_source,-torch.inf).argmax(dim=1)
        chosen=logits[torch.arange(len(rows),device=bio.device),winner]
        # Deterministic first maximum; no BIO boundary repair or token target.
        log_q=F.log_softmax(torch.stack((torch.logsumexp(chosen[:,[0,2]],dim=1),chosen[:,1]),dim=1),dim=1)
        log_p=torch.stack((F.logsigmoid(-z),F.logsigmoid(z)),dim=1)
        log_m=torch.logaddexp(log_p,log_q)-math.log(2)
        jsd=0.5*((log_p.exp()*(log_p-log_m)).sum(dim=1)+(log_q.exp()*(log_q-log_m)).sum(dim=1))
        if not bool(torch.isfinite(jsd).all()):raise ValueError('nonfinite-consistency-divergence')
        strata=[jsd[target[rows]==value].mean()for value in [0,1]if bool((target[rows]==value).any())]
        per_key.append(torch.stack(strata).mean())
    return torch.stack(per_key).mean()if per_key else zero

def objective(model,rows,config,device,bio_weights):
    import torch
    ids=torch.stack([r['input_ids']for r in rows]).to(device);mask=torch.stack([r['attention_mask']for r in rows]).to(device);hidden,bio,presence=model(ids,mask);gold=torch.stack([r['bio']for r in rows]).to(device);pgold=torch.stack([r['presence']for r in rows]).to(device);losses=[]
    # Normalize each inventory key independently so common absent streams cannot dominate rare keys.
    for ki in range(len(config['bioKeys'])):
        valid=gold[:,ki]!=-100
        if valid.any():losses.append(torch.nn.functional.cross_entropy(bio[:,ki][valid].float(),gold[:,ki][valid],weight=bio_weights[ki]))
    presence_losses=[]
    for ki in range(len(config['keys'])):
        strata=[]
        for target in [0,1]:
            mask=pgold[:,ki]==target
            if mask.any():strata.append(torch.nn.functional.binary_cross_entropy_with_logits(presence[:,ki][mask].float(),pgold[:,ki][mask]))
        if strata:presence_losses.append(torch.stack(strata).mean())
    if presence_losses:losses.append(torch.stack(presence_losses).mean())
    classloss=collections.defaultdict(list)
    for ri,row in enumerate(rows):
        for key,target in row['classes'].items():
            ki=config['keys'].index(key);classloss[(key,'absent'if target==0 else'unknown'if target==1 else'present')].append(torch.nn.functional.cross_entropy(model.classes[str(ki)](hidden[ri,0]).float()[None],torch.tensor([target],device=device)))
        for ki,a,b,targets in row['mentions']:
            feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
            for key,target in targets.items():classloss[(key,'absent'if target==0 else'unknown'if target==1 else'present')].append(torch.nn.functional.cross_entropy(model.classes[str(config['keys'].index(key))](feature).float()[None],torch.tensor([target],device=device)))
    if classloss:
        byhead=collections.defaultdict(list)
        for(key,stratum),values in classloss.items():byhead[key].append(torch.stack(values).mean())
        losses.append(torch.stack([torch.stack(values).mean()for values in byhead.values()]).mean())
    base=torch.stack(losses).mean()
    policy=config.get('trainingObjective')
    if policy!=TRAINING_OBJECTIVE:raise ValueError('unrecognized-training-objective')
    consistency=presence_bio_consistency(bio,presence,gold,pgold,
        torch.stack([r['source_mask']for r in rows]).to(device),
        torch.stack([r['attention_mask']for r in rows]).to(device),
        torch.tensor([r['truncated']for r in rows],dtype=torch.bool,device=device),config)
    return base+policy['coefficient']*consistency,bio,gold

def bio_mentions(tags):
    spans=[];start=None
    for i,tag in enumerate(list(tags)+[0]):
        if tag==1 or tag==0 or tag<0:
            if start is not None:spans.append((start,i));start=None
            if tag==1:start=i
        elif tag==2 and start is None:
            return None
    return spans

def evaluate(model,rows,config,device,batch):
    import torch
    report={k:collections.Counter()for k in config['keys']};exact=total=positive_exact=positive_total=0
    type_classes={entry['value']:{'support':0,'correct':0}for entry in config['banks']['request.target.type']if entry['state']=='value'}
    model.eval()
    with torch.no_grad():
        for start in range(0,len(rows),batch):
            items=rows[start:start+batch];hidden,bio,presence=model(torch.stack([r['input_ids']for r in items]).to(device),torch.stack([r['attention_mask']for r in items]).to(device));pred=bio.argmax(-1).cpu()
            for ri,row in enumerate(items):
                rowexact=not row['truncated'];haspositive=False
                for ki,key in enumerate(config['keys']):
                    goldpresence=float(row['presence'][ki]);p=bool(presence[ri,ki]>0)
                    if goldpresence>=0:report[key]['presence'+('TP'if p and goldpresence else'FP'if p else'FN'if goldpresence else'TN')]+=1
                for ki,key in enumerate(config['bioKeys']):
                    gold=row['bio'][ki];valid=gold>=0
                    if not valid.any():continue
                    tags=pred[ri,ki].clone();tags[~valid]=-100;expected=bio_mentions(gold.tolist());actual=bio_mentions(tags.tolist());g=set(expected or []);a=set(actual or []);report[key]['mentionTP']+=len(g&a);report[key]['mentionFP']+=len(a-g);report[key]['mentionFN']+=len(g-a);report[key]['invalidBIO']+=actual is None;report[key]['positiveTokens']+=int((gold>0).sum());report[key]['positiveTokenCorrect']+=int(((gold>0)&(gold==tags)).sum());report[key]['absentTokens']+=int((gold==0).sum());report[key]['absentTokenCorrect']+=int(((gold==0)&(tags==0)).sum());rowexact &= actual is not None and a==g;haspositive |= bool(g)
                for key,target in row['classes'].items():
                    predicted=int(model.classes[str(config['keys'].index(key))](hidden[ri,0]).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key][bucket+'ClassSupport']+=1;report[key][bucket+'ClassCorrect']+=predicted==target;rowexact &= predicted==target;haspositive |= target>=2
                    if key=='request.target.type' and target>=2:
                        family=config['banks'][key][target]['value'];type_classes[family]['support']+=1;type_classes[family]['correct']+=predicted==target
                for ki,a,b,targets in row['mentions']:
                    feature=hidden[ri,a:b].mean(0)+model.key.weight[ki]
                    for key,target in targets.items():
                        predicted=int(model.classes[str(config['keys'].index(key))](feature).argmax());bucket='absent'if target==0 else'unknown'if target==1 else'present';report[key]['goldMention'+bucket+'ClassSupport']+=1;report[key]['goldMention'+bucket+'ClassCorrect']+=predicted==target
                exact+=bool(rowexact);total+=1;positive_exact+=bool(rowexact and haspositive);positive_total+=haspositive
    tp=sum(v['mentionTP']for v in report.values());fp=sum(v['mentionFP']for v in report.values());fn=sum(v['mentionFN']for v in report.values())
    return {'targetTypePresentClass':{'support':sum(v['support']for v in type_classes.values()),'correct':sum(v['correct']for v in type_classes.values())},'targetTypePerClass':{key:{**value,'accuracy':value['correct']/value['support']if value['support']else None}for key,value in type_classes.items()},'perKey':{k:dict(v)for k,v in report.items()},'decodedMentionF1':2*tp/max(1,2*tp+fp+fn),'conditionalBioAndGlobalExact':exact,'conditionalBioAndGlobalSupport':total,'positiveBioAndGlobalExact':positive_exact,'positiveBioAndGlobalSupport':positive_total,'scope':'Gold request-cut conditional; mention metadata metrics explicitly gold-mention conditioned; not canonical/full-pipeline graph exact.'}

def evaluate_compacted_checkpoint(model,evaluator,*args,**kwargs):
    """Evaluate exact save/load values without touching training/optimizer state.

    Returns the very same CPU compact state that the caller must serialize if
    selected. No model/checkpoint files are produced here.
    """
    import torch
    compact={}
    for key,value in model.state_dict().items():
        if value.is_floating_point() and value.dtype!=torch.float32:
            raise ValueError('unsupported-training-parameter-dtype')
        saved=value.detach().cpu().to(torch.bfloat16)if value.is_floating_point()else value.detach().cpu()
        compact[key]=saved.clone()
        if not bool(torch.isfinite(compact[key]).all()):
            raise ValueError('nonfinite-compacted-state')
    detached=copy.deepcopy(model)
    detached.load_state_dict(compact,strict=True) # BF16 -> original FP32, as reload
    detached.requires_grad_(False)
    detached.eval()
    # The live training loop's autocast context must not affect evaluation.
    device=next(detached.parameters()).device.type
    with torch.no_grad(),torch.autocast(device_type=device,enabled=False):
        report=evaluator(detached,*args,**kwargs)
    return report,compact

def weight_migration_plan(old,new):
    """Semantic row plan only; no checkpoints/tensors are read or written.

    An applier must start with fresh new-model weights, verify all non-row
    dimensions/encoder provenance, apply these explicit pairs, and discard
    optimizer state. No unspecified tensor or row is positional-copy eligible.
    """
    if old.get('format')!='sop.key-reader/1' or new.get('format')!='sop.key-reader/2-target-type-candidate':
        raise ValueError('unsupported-migration-version')
    def indices(values):
        if not isinstance(values,list) or len(values)!=len(set(values)):
            raise ValueError('duplicate-semantic-key')
        return {value:i for i,value in enumerate(values)}
    old_keys,new_keys=indices(old['keys']),indices(new['keys'])
    old_bio,new_bio=indices(old['bioKeys']),indices(new['bioKeys'])
    shared=sorted(set(old_keys)&set(new_keys))
    plan=[]
    def add(source,target,pairs):
        plan.append({'source':source,'target':target,'rows':pairs,
                     'requireEqualNonRowDimensions':True})
    pairs=[[old_keys[key],new_keys[key]] for key in shared]
    for tensor in ('key.weight','presence.weight','presence.bias'):
        add(tensor,tensor,pairs)
    bio_pairs=[[3*old_bio[key]+label,3*new_bio[key]+label]
               for key in sorted(set(old_bio)&set(new_bio)) for label in range(3)]
    for tensor in ('bio.weight','bio.bias'):
        add(tensor,tensor,bio_pairs)
    initialized=[]
    for key,values in new['banks'].items():
        new_entries=indices([typed(entry) for entry in values])
        old_entries=indices([typed(entry) for entry in old.get('banks',{}).get(key,[])])
        if key not in old_keys or key not in old.get('banks',{}):
            initialized.append({'key':key,'classRows':list(range(len(values)))})
            continue
        rows=[[old_entries[name],index] for name,index in new_entries.items() if name in old_entries]
        for suffix in ('weight','bias'):
            add('classes.'+str(old_keys[key])+'.'+suffix,
                'classes.'+str(new_keys[key])+'.'+suffix,rows)
        missing=[index for name,index in new_entries.items() if name not in old_entries]
        if missing:initialized.append({'key':key,'classRows':missing})
    return {'format':'sop.key-reader-weight-migration/1','from':old['format'],'to':new['format'],
            'rowPlans':plan,'newKeys':sorted(set(new_keys)-set(old_keys)),
            'newBIOKeys':sorted(set(new_bio)-set(old_bio)),'initializedClasses':initialized,
            'encoderPolicy':'same parameter names, shapes and exact encoder provenance only; otherwise refuse',
            'otherTensorPolicy':'retain fresh initializer; no implicit positional copy',
            'optimizerPolicy':'discard; not index-compatible',
            'appliesWeights':False}

def load_candidate_records(data,manifest,split,*,max_decoded_bytes=1073741824,max_record_bytes=2097152):
    """Verify encoded bytes before decoding; bound every gzip record/output."""
    if any(type(v)is not int or v<1 for v in (max_decoded_bytes,max_record_bytes)):raise ValueError('invalid-decoding-bounds')
    if manifest.get('format')!='sop.per-key-supervision/3-target-type-migration-candidate' or split not in ('train','calibration'):
        raise ValueError('unsupported-data-profile')
    item=manifest['dataFiles'][split]
    if type(item)is not dict or set(item)!={'path','encoding','compression','sha256','decodedSha256','encodedBytes','decodedBytes','records'} or any(type(item[k])is not int or item[k]<0 for k in ('encodedBytes','decodedBytes','records')):raise ValueError('invalid-data-file-metadata')
    if item.get('path')!=split+'.jsonl.gz' or item.get('encoding')!='utf-8' or item.get('compression')!='gzip':
        raise ValueError('unsupported-data-file')
    path=Path(data)/item['path']
    if sha(path)!=item['sha256'] or item['sha256']!=manifest['outputs'][split] or path.stat().st_size!=item['encodedBytes']:
        raise ValueError('encoded-data-hash-mismatch')
    if type(item['decodedBytes'])is not int or not 0<=item['decodedBytes']<=max_decoded_bytes:
        raise ValueError('decoded-data-bound')
    decoded=hashlib.sha256();size=0;records=[];seen=set()
    with gzip.open(path,'rb')as source:
        while True:
            line=source.readline(max_record_bytes+1)
            if not line:break
            if len(line)>max_record_bytes or not line.endswith(b'\n'):raise ValueError('decoded-record-bound')
            size+=len(line)
            if size>max_decoded_bytes or size>item['decodedBytes']:raise ValueError('decoded-data-bound')
            decoded.update(line);row=json.loads(line.decode('utf-8','strict'))
            if row['split']!=split or row['id']in seen:raise ValueError('duplicate-or-wrong-split-record')
            seen.add(row['id']);records.append(row)
    if size!=item['decodedBytes'] or decoded.hexdigest()!=item['decodedSha256'] or len(records)!=item['records'] or sha(path)!=item['sha256']:
        raise ValueError('decoded-data-provenance-mismatch')
    return records

def validate_warmstart_spec(spec):
    names={'checkpoint','config','run','trainer','dataManifest','preparer','helper'}
    if type(spec)is not dict or set(spec)!={'format','files','elementWorkAllowance','optimizerPolicy'} or spec['format']!='sop.key-reader-frozen-warmstart/1' or spec['optimizerPolicy']!='reset':
        raise ValueError('invalid-warmstart-spec')
    if type(spec['elementWorkAllowance'])is not int or spec['elementWorkAllowance']<1 or type(spec['files'])is not dict or set(spec['files'])!=names:
        raise ValueError('invalid-warmstart-allowance-or-files')
    for value in spec['files'].values():
        if type(value)is not dict or set(value)!={'path','sha256'} or type(value['path'])is not str or not value['path'] or type(value['sha256'])is not str or len(value['sha256'])!=64 or any(c not in '0123456789abcdef'for c in value['sha256']):
            raise ValueError('invalid-warmstart-file-identity')

def verify_warmstart_chain(config,old_config,old_run,old_manifest,spec,verified_hashes,old_configuration):
    """Pure provenance check; verified_hashes must come from the frozen file loader."""
    validate_warmstart_spec(spec)
    expected={key:value['sha256']for key,value in spec['files'].items()}
    if any(verified_hashes.get(key)!=value for key,value in expected.items()):
        raise ValueError('warmstart-frozen-hash-mismatch')
    if old_config.get('format')!='sop.key-reader/1' or old_run.get('format')!='sop.key-reader-run/1' or type(old_run.get('steps'))is not int or old_run['steps']<1:
        raise ValueError('completed-baseline-run-required')
    for key in ('checkpoint','config','trainer'):
        if old_run.get(key+'Sha256')!=expected[key]:raise ValueError('warmstart-run-chain-mismatch')
    if old_config.get('trainerSha256')!=expected['trainer'] or old_config.get('dataManifestSha256')!=expected['dataManifest'] or old_manifest.get('scriptSha256')!=expected['preparer']:
        raise ValueError('warmstart-training-source-chain-mismatch')
    if config.get('format')!='sop.key-reader/2-target-type-candidate' or config.get('tensorArchitectureVersion')!=2:
        raise ValueError('unsupported-warmstart-target')
    if old_manifest.get('inventorySha256')!=config['inventorySha256'] or old_manifest.get('sourceManifest',{}).get('exclusion',{}).get('sha256')!=config['exclusionSha256']:
        raise ValueError('warmstart-inventory-or-exclusion-mismatch')
    regenerated=old_configuration(old_manifest)
    if any(old_config.get(key)!=value for key,value in regenerated.items()):
        raise ValueError('warmstart-trained-layout-mismatch')

def migrate_frozen_state(config,old_config,old_run,old_manifest,spec,verified_hashes,payload,
                         fresh_state,helper,old_configuration):
    """Synthetic-testable CPU path; never reads checkpoints or restores optimizer."""
    verify_warmstart_chain(config,old_config,old_run,old_manifest,spec,verified_hashes,old_configuration)
    if type(payload)is not dict or payload.get('config')!=old_config or type(payload.get('model'))is not dict:
        raise ValueError('warmstart-checkpoint-config-mismatch')
    plan=weight_migration_plan(old_config,config)
    estimate=helper.estimate_migration_work(payload['model'],fresh_state,plan)
    if not estimate['ok']:raise ValueError('warmstart-estimate-refused')
    if estimate['estimatedElements']>spec['elementWorkAllowance']:
        raise ValueError('warmstart-explicit-work-allowance-too-small')
    migrated=helper.apply_weight_migration(old_config,config,plan,payload['model'],fresh_state,
                                           max_elements=spec['elementWorkAllowance'])
    if not migrated['ok']:raise ValueError('warmstart-semantic-migration-refused:'+migrated['issues'][0]['reason'])
    return migrated['state'],{'format':'sop.key-reader-warmstart-provenance/1','kind':'semantic-migration',
            'specSha256':verified_hashes['spec'],'frozenInputs':{key:verified_hashes[key]for key in spec['files']},
            'sourceModelFormat':old_config['format'],'targetModelFormat':config['format'],
            'elementWorkAllowance':spec['elementWorkAllowance'],'estimatedElements':estimate['estimatedElements'],
            'stats':migrated['stats'],'optimizer':'fresh-AdamW','migrationHelperSha256':verified_hashes['helper']}

def load_source(path,name):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module);return module

def frozen_warmstart_metadata(path,expected_sha,config):
    """Future CLI only: validates all frozen files before any weights load."""
    if sha(path)!=expected_sha:raise ValueError('warmstart-spec-hash-mismatch')
    spec=json.loads(Path(path).read_text(encoding='utf-8'));validate_warmstart_spec(spec)
    paths={key:Path(value['path'])for key,value in spec['files'].items()}
    hashes={key:sha(value)for key,value in paths.items()};hashes['spec']=expected_sha
    if any(hashes[key]!=value['sha256']for key,value in spec['files'].items()):
        raise ValueError('warmstart-frozen-hash-mismatch')
    old_config=json.loads(paths['config'].read_text(encoding='utf-8'))
    old_run=json.loads(paths['run'].read_text(encoding='utf-8'))
    old_manifest=json.loads(paths['dataManifest'].read_text(encoding='utf-8'))
    old_trainer=load_source(paths['trainer'],'frozen_baseline_trainer')
    helper=load_source(paths['helper'],'frozen_cpu_migration_helper')
    verify_warmstart_chain(config,old_config,old_run,old_manifest,spec,hashes,old_trainer.configuration)
    return spec,paths,hashes,old_config,old_run,old_manifest,old_trainer,helper

CHECKPOINT_WRITER={'format':'sop.key-reader-checkpoint-writer/1',
    'temporary':'exclusive-new','publication':'fsync-and-os.replace','writes':'never-in-place',
    'preflight':'one-checkpoint-upper-bytes+134217728','firstEpochPin':'content-addressed-hardlink',
    'pinRetention':'permanent','maxEpochPins':1}

def checkpoint_upper_bytes(compact_state,config):
    """Conservative one-file bound; verified against actual bytes before replace."""
    tensor_bytes=sum(value.numel()*value.element_size()for value in compact_state.values())
    names=sum(len(key.encode('utf-8'))for key in compact_state)
    config_bytes=len(json.dumps(config,ensure_ascii=False,sort_keys=True).encode('utf-8'))
    # Zip/pickle/alignment metadata is bounded separately from tensor payload.
    overhead=max(1048576,4096*len(compact_state)+2*names+2*config_bytes+65536)
    return tensor_bytes+overhead

def sync_directory(path):
    descriptor=os.open(path,os.O_RDONLY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)

def publish_compact_checkpoint(directory,write_payload,upper_bytes,epoch,*,reserve_bytes=134217728):
    """One exclusive temporary + atomic replace. No prior inode is written."""
    directory=Path(directory)
    if type(epoch)is not int or epoch<1 or type(upper_bytes)is not int or upper_bytes<1 or type(reserve_bytes)is not int or reserve_bytes<1:
        raise ValueError('invalid-checkpoint-publication')
    target=directory/'checkpoint.pt';pins=directory/'epoch-pins'
    if epoch==1 and (directory/'first-epoch-proof.json').exists():
        raise ValueError('first-epoch-pin-already-published')
    if epoch==1 and pins.exists()and any(pins.iterdir()):
        raise ValueError('first-epoch-pin-already-exists')
    if epoch>1:
        proof=directory/'first-epoch-proof.json'
        if not proof.exists():raise ValueError('first-epoch-proof-required')
        saved=json.loads(proof.read_text(encoding='utf-8'))
        record=saved['checkpoint']
        digest=record.get('sha256','')
        if type(digest)is not str or len(digest)!=64 or any(c not in '0123456789abcdef'for c in digest)or record.get('path')!='epoch-pins/'+digest+'.pt':raise ValueError('invalid-first-epoch-pin-path')
        pinned=directory/record['path']
        if saved.get('completedEpoch')!=1 or saved.get('checkpointEpoch')!=1 or sha(pinned)!=record['sha256']:
            raise ValueError('first-epoch-pin-changed')
    # Existing target and permanent pin already consume free space: do not add
    # their sizes again. Only the new temporary file is an additional allocation.
    required=upper_bytes+reserve_bytes
    if shutil.disk_usage(directory).free<required:
        raise ValueError('insufficient-one-checkpoint-reserve')
    descriptor,name=tempfile.mkstemp(prefix='.checkpoint-',suffix='.tmp',dir=directory)
    temporary=Path(name);created_pin=None;replaced=False;previous=None;rollback_dir=None;keep_rollback=False
    try:
        with os.fdopen(descriptor,'wb')as stream:
            write_payload(stream)
            stream.flush();os.fsync(stream.fileno())
        actual=temporary.stat().st_size
        if actual>upper_bytes:raise ValueError('checkpoint-upper-bound-exceeded')
        if shutil.disk_usage(directory).free<reserve_bytes:
            raise ValueError('checkpoint-reserve-exhausted')
        digest=sha(temporary)
        if epoch==1:
            pins.mkdir(exist_ok=True)
            created_pin=pins/(digest+'.pt')
            os.link(temporary,created_pin) # exclusive; same verified inode, no copy
            sync_directory(pins)
        if target.exists():
            if target.is_symlink()or not target.is_file():raise ValueError('checkpoint-target-must-be-regular')
            rollback_dir=Path(tempfile.mkdtemp(prefix='.checkpoint-rollback-',dir=directory))
            previous=rollback_dir/'previous.pt';os.link(target,previous)
        if shutil.disk_usage(directory).free<reserve_bytes:raise ValueError('checkpoint-reserve-exhausted')
        os.replace(temporary,target);replaced=True;sync_directory(directory)
        if created_pin is not None:
            a,b=target.stat(),created_pin.stat()
            if (a.st_dev,a.st_ino)!=(b.st_dev,b.st_ino)or sha(created_pin)!=digest:
                raise ValueError('first-epoch-pin-inode-mismatch')
        return {'sha256':digest,'bytes':actual,'path':'checkpoint.pt',
                'firstEpochPin':created_pin.relative_to(directory).as_posix()if created_pin else None,
                'additionalAllocationUpperBytes':upper_bytes,'reserveBytes':reserve_bytes}
    except Exception:
        if replaced:
            try:
                if previous is not None:os.replace(previous,target)
                else:target.unlink(missing_ok=True)
            except OSError:
                keep_rollback=True
                raise ValueError('checkpoint-publication-rollback-failed')
        if created_pin is not None:created_pin.unlink(missing_ok=True)
        raise
    finally:
        temporary.unlink(missing_ok=True)
        if rollback_dir is not None and not keep_rollback:
            if previous is not None:previous.unlink(missing_ok=True)
            rollback_dir.rmdir()

def completed_epoch_proof(config,manifest,metrics,stopping,checkpoint,*,run_id,steps,
                          config_sha,trainer_sha,data_manifest_sha,data_counts):
    """First epoch proof only; separate from completion/calibration claims."""
    if stopping.get('epoch')!=1 or checkpoint.get('firstEpochPin')is None or type(steps)is not int or steps<1:
        raise ValueError('first-completed-epoch-required')
    canonical=json.dumps(metrics,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
    if len(canonical)>2097152:raise ValueError('epoch-metrics-size')
    return {'format':'sop.key-reader-completed-epoch/1','artifactRole':'completed-epoch',
            'epochComplete':True,'runComplete':False,'runId':run_id,'completedEpoch':1,
            'checkpointEpoch':1,'optimizerSteps':steps,'configSha256':config_sha,'trainerSha256':trainer_sha,
            'preparerSha256':manifest['scriptSha256'],'dataManifestSha256':data_manifest_sha,
            'encodedDataSha256':manifest['outputs'],'dataRecordCounts':data_counts,
            'modelConfigFormat':config['format'],'rawCodecFormat':config['rawCodecFormat'],
            'preparationFormat':manifest['format'],'trainingSourceFormat':config['trainingSourceFormat'],'trainingObjective':copy.deepcopy(config['trainingObjective']),
            'checkpoint':{'sha256':checkpoint['sha256'],'bytes':checkpoint['bytes'],'path':checkpoint['firstEpochPin']},
            'checkpointMetrics':metrics,'checkpointMetricsSha256':hashlib.sha256(canonical).hexdigest(),
            'checkpointSelectionRank':list(selection_rank(metrics)),'selectionCriterion':SELECTION_CRITERION,
            'checkpointEvaluation':CHECKPOINT_EVALUATION,'trainingPolicy':config['trainingPolicy'],
            'stoppingAtEpoch':stopping,'warmstart':config['warmstart'],
            'storage':{'policy':'first-completed-epoch-hardlink/1','pinCount':1,'retention':'permanent',
                       'writer':CHECKPOINT_WRITER,'additionalAllocationUpperBytes':checkpoint['additionalAllocationUpperBytes'],
                       'reserveBytes':checkpoint['reserveBytes']},
            'confidenceCalibrated':False,'graphConfidence':None,'executionEligible':False}

def publish_first_epoch_proof(directory,proof,*,reserve_bytes=134217728):
    """Immutable metadata publication; never overwrites an existing identity."""
    directory=Path(directory);target=directory/'first-epoch-proof.json'
    if proof.get('format')!='sop.key-reader-completed-epoch/1' or proof.get('artifactRole')!='completed-epoch' or proof.get('epochComplete')is not True or proof.get('runComplete')is not False or proof.get('completedEpoch')!=1 or proof.get('checkpointEpoch')!=1 or proof.get('executionEligible')is not False or proof.get('confidenceCalibrated')is not False:
        raise ValueError('invalid-first-epoch-proof-role')
    if target.exists():raise ValueError('first-epoch-proof-already-exists')
    record=proof['checkpoint']
    digest=record.get('sha256','')
    if type(digest)is not str or len(digest)!=64 or any(c not in '0123456789abcdef'for c in digest)or record.get('path')!='epoch-pins/'+digest+'.pt':raise ValueError('invalid-epoch-pin-path')
    pin=directory/record['path']
    if sha(pin)!=proof['checkpoint']['sha256']or pin.stat().st_size!=proof['checkpoint']['bytes']:
        raise ValueError('epoch-proof-weight-mismatch')
    body=(json.dumps(proof,sort_keys=True,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
    if len(body)>4194304:raise ValueError('epoch-proof-size')
    if shutil.disk_usage(directory).free<len(body)+reserve_bytes:
        raise ValueError('epoch-proof-reserve-exhausted')
    descriptor,name=tempfile.mkstemp(prefix='.epoch-proof-',suffix='.tmp',dir=directory)
    temporary=Path(name)
    try:
        with os.fdopen(descriptor,'wb')as stream:
            stream.write(body);stream.flush();os.fsync(stream.fileno())
        os.link(temporary,target) # no overwrite, unlike mutable current weights
        sync_directory(directory)
    finally:temporary.unlink(missing_ok=True)
    return {'path':target.name,'sha256':hashlib.sha256(body).hexdigest()}

def verify_first_epoch_receipt(directory,receipt,proof):
    directory=Path(directory)
    if receipt.get('path')!='first-epoch-proof.json' or sha(directory/receipt['path'])!=receipt.get('sha256'):
        raise ValueError('immutable-first-epoch-proof-changed')
    record=proof['checkpoint']
    if record.get('path')!='epoch-pins/'+record.get('sha256','')+'.pt' or sha(directory/record['path'])!=record['sha256']or(directory/record['path']).stat().st_size!=record['bytes']:
        raise ValueError('immutable-first-epoch-pin-changed')

def main():
    import torch
    from transformers import AutoTokenizer
    import os,shutil
    p=argparse.ArgumentParser()
    p.add_argument('--data',type=Path,required=True);p.add_argument('--encoder',required=True)
    p.add_argument('--warmstart-spec',type=Path);p.add_argument('--warmstart-spec-sha256')
    p.add_argument('--out',type=Path,required=True);p.add_argument('--min-epochs',type=int,default=3)
    p.add_argument('--patience',type=int,default=3);p.add_argument('--max-epochs',type=int,default=30)
    p.add_argument('--batch',type=int,default=8);args=p.parse_args()
    try:policy=training_policy(args.min_epochs,args.patience,args.max_epochs)
    except ValueError:p.error('minEpochs>=3, positive patience and finite maxEpochs>=minEpochs<=1000 required')
    if args.batch<1 or bool(args.warmstart_spec)!=bool(args.warmstart_spec_sha256):
        p.error('positive batch and paired frozen warmstart arguments required')
    # There is deliberately no subset/limit flag in this source version.
    random.seed(17);torch.manual_seed(17)
    data_manifest_path=args.data/'manifest.json';data_sha=sha(data_manifest_path);trainer_sha=sha(Path(__file__))
    manifest=json.loads(data_manifest_path.read_text(encoding='utf-8'));config=configuration(manifest)
    config['trainingPolicy']=policy;config['checkpointWriter']=CHECKPOINT_WRITER;config['runId']=uuid.uuid4().hex
    tokenizer=AutoTokenizer.from_pretrained(args.encoder,local_files_only=True)
    if not tokenizer.is_fast:raise ValueError('exact-fast-tokenizer-required')
    config['encoder']=args.encoder
    config['encoderFiles']={p.name:sha(p)for p in Path(args.encoder).iterdir()if p.is_file()}
    config['dataManifestSha256']=data_sha;config['trainerSha256']=trainer_sha
    config['preparerSha256']=manifest['scriptSha256']
    datasets={split:[encode(row,tokenizer,config)for row in load_candidate_records(args.data,manifest,split)]
              for split in ('train','calibration')}
    warm_meta=frozen_warmstart_metadata(args.warmstart_spec,args.warmstart_spec_sha256,config)if args.warmstart_spec else None
    model=build_model(config,args.encoder) # remains on CPU through semantic migration
    warm={'format':'sop.key-reader-warmstart-provenance/1','kind':'pretrained-encoder','specSha256':None,
          'frozenInputs':{},'sourceModelFormat':None,'targetModelFormat':config['format'],
          'elementWorkAllowance':None,'estimatedElements':None,'stats':None,
          'optimizer':'fresh-AdamW','migrationHelperSha256':None}
    if warm_meta:
        spec,paths,hashes,old_config,old_run,old_manifest,old_trainer,helper=warm_meta
        payload=torch.load(paths['checkpoint'],map_location='cpu',weights_only=True)
        migrated,warm=migrate_frozen_state(config,old_config,old_run,old_manifest,spec,hashes,payload,
                                           dict(model.state_dict()),helper,old_trainer.configuration)
        model.load_state_dict(migrated,strict=True);del payload,migrated
        if hashes!={**{key:sha(path)for key,path in paths.items()},'spec':sha(args.warmstart_spec)}:
            raise ValueError('warmstart-input-mutated')
    config['warmstart']=warm
    # Only fresh optimizer state is constructed, after the CPU migration succeeds.
    device='cuda'if torch.cuda.is_available()else'cpu';model.to(device)
    optimizer=torch.optim.AdamW(model.parameters(),lr=3e-5)
    args.out.mkdir(parents=True,exist_ok=False)
    (args.out/'model-config.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
    weights=[]
    for ki in range(len(config['bioKeys'])):
        counts=torch.zeros(3)
        for row in datasets['train']:
            values=row['bio'][ki];counts+=torch.bincount(values[values>=0],minlength=3)
        w=(counts.sum()/counts.clamp_min(1)).sqrt();weights.append((w/w.mean()).to(device))
    steps=0;history=[];best=None;best_evaluation=None;plateau=None;best_epoch=None
    first_proof_receipt=first_proof_record=None
    for epoch in range(policy['maxEpochs']):
        model.train();random.shuffle(datasets['train']);total=0
        for start in range(0,len(datasets['train']),args.batch):
            if sha(Path(__file__))!=trainer_sha:raise ValueError('trainer-source-mutated')
            rows=datasets['train'][start:start+args.batch];optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device,dtype=torch.bfloat16,enabled=device=='cuda'):
                loss,_,_=objective(model,rows,config,device,weights)
            if not torch.isfinite(loss):raise ValueError('nonfinite-training-loss')
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step();steps+=1;total+=loss.item()
            if steps%100==0:print(json.dumps({'epoch':epoch+1,'steps':steps,'lastLoss':loss.item()}),flush=True)
        evaluation,checkpoint_state=evaluate_compacted_checkpoint(model,evaluate,datasets['calibration'],config,device,args.batch)
        plateau=advance_plateau(plateau,epoch+1,evaluation,policy)
        metric={'evaluation':evaluation,'plateau':plateau,'epoch':epoch+1,'steps':steps,'trainLossSum':total,
                'truncatedTrain':sum(r['truncated']for r in datasets['train']),
                'truncatedCalibration':sum(r['truncated']for r in datasets['calibration']),'executable':False}
        history.append(metric);print(json.dumps(metric),flush=True)
        (args.out/'metrics.json').write_text(json.dumps(history,indent=2)+'\n',encoding='utf-8')
        rank=selection_rank(evaluation)
        if best is None or rank>best:
            best=rank;best_evaluation=evaluation;best_epoch=epoch+1
            publication=publish_compact_checkpoint(args.out,
                lambda stream:torch.save({'model':checkpoint_state,'config':config,'epoch':epoch+1},stream),
                checkpoint_upper_bytes(checkpoint_state,config),epoch+1)
            if epoch==0:
                proof=completed_epoch_proof(config,manifest,evaluation,plateau,publication,
                    run_id=config['runId'],steps=steps,config_sha=sha(args.out/'model-config.json'),
                    trainer_sha=trainer_sha,data_manifest_sha=data_sha,
                    data_counts={split:len(rows)for split,rows in datasets.items()})
                first_proof_receipt=publish_first_epoch_proof(args.out,proof);first_proof_record=proof
        del checkpoint_state
        if plateau['stopReason']is not None:break
    if sha(Path(__file__))!=trainer_sha or sha(data_manifest_path)!=data_sha:
        raise ValueError('training-source-mutated')
    for split,item in manifest['dataFiles'].items():
        if sha(args.data/item['path'])!=item['sha256']:raise ValueError('training-data-mutated')
    for name,value in config['encoderFiles'].items():
        if sha(Path(args.encoder)/name)!=value:raise ValueError('encoder-source-mutated')
    if warm_meta and hashes!={**{key:sha(path)for key,path in paths.items()},'spec':sha(args.warmstart_spec)}:
        raise ValueError('warmstart-input-mutated')
    if first_proof_receipt is None:raise ValueError('missing-first-epoch-proof')
    verify_first_epoch_receipt(args.out,first_proof_receipt,first_proof_record)
    record={'format':'sop.key-reader-run/5-presence-bio-consistency-candidate','complete':True,'candidate':True,
            'executionEligible':False,'tensorArchitectureVersion':2,'preparationFormat':manifest['format'],
            'modelConfigFormat':config['format'],'rawCodecFormat':config['rawCodecFormat'],
            'configSha256':sha(args.out/'model-config.json'),'trainerSha256':trainer_sha,
            'dataManifestSha256':data_sha,'preparerSha256':manifest['scriptSha256'],
            'encodedDataSha256':manifest['outputs'],'epochsCompleted':len(history),'steps':steps,
            'trainingPolicy':policy,'trainingSourceFormat':config['trainingSourceFormat'],'trainingObjective':copy.deepcopy(config['trainingObjective']),'checkpointWriter':CHECKPOINT_WRITER,'runId':config['runId'],
            'firstEpochProofSha256':first_proof_receipt['sha256'],'stopping':plateau,'bestCheckpointEpoch':best_epoch,
            'dataRecordCounts':{split:len(rows)for split,rows in datasets.items()},
            'checkpointSha256':sha(args.out/'checkpoint.pt'),'bestDecodedMentionF1':best_evaluation['decodedMentionF1'],
            'selectionCriterion':SELECTION_CRITERION,'checkpointEvaluation':CHECKPOINT_EVALUATION,'bestSelectionRank':list(best),'warmstart':warm,
            'scope':'complete retained corpus; conditional gold-cut, not full pipeline or calibrated confidence'}
    (args.out/'run.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
