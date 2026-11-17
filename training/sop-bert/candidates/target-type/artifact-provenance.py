"""Strict completed-run/first-epoch metadata. No weights, data rows or GPU reads."""
import hashlib,importlib.util,json,math
from pathlib import Path
_s=importlib.util.spec_from_file_location('historical_run_contract',Path(__file__).with_name('run-provenance.py'));v=importlib.util.module_from_spec(_s);_s.loader.exec_module(v)
RUN='sop.key-reader-run/4-target-type-plateau-candidate'
SOURCE='sop.key-reader-source/4-target-type-plateau-candidate'
EPOCH='sop.key-reader-completed-epoch/1'
POLICY_CONTRACT={'format':'sop.key-reader-plateau-policy/1','primary':'positiveSupervisedBioGlobalExactRate','improvement':'strict-rational','ties':'non-improvement','minEpochsLowerBound':3,'maxEpochsUpperBound':1000,'defaults':{'minEpochs':3,'patience':3,'maxEpochs':30}}
WRITER={'format':'sop.key-reader-checkpoint-writer/1','temporary':'exclusive-new','publication':'fsync-and-os.replace','writes':'never-in-place','preflight':'one-checkpoint-upper-bytes+134217728','firstEpochPin':'content-addressed-hardlink','pinRetention':'permanent','maxEpochPins':1}
r=v.require

def policy(value):
 r(type(value)is dict and set(value)=={'format','minEpochs','patience','maxEpochs','primary','improvement','ties'},'invalid-training-policy')
 r(value['format']==POLICY_CONTRACT['format'] and all(value[k]==POLICY_CONTRACT[k]for k in ['primary','improvement','ties']),'training-policy-contract')
 r(all(type(value[k])is int for k in ['minEpochs','patience','maxEpochs'])and 3<=value['minEpochs']<=value['maxEpochs']<=1000 and value['patience']>=1,'training-policy-bounds')

def rank(value):
 r(type(value)is list and len(value)==3 and all(type(x)in(int,float)and math.isfinite(x)and 0<=x<=1 for x in value),'invalid-selection-rank')

def common(config,artifact,manifest,hashes):
 r(config.get('format')==v.MODEL and config.get('rawCodecFormat')==v.CODEC and config.get('candidate')is True and config.get('executionEligible')is False and type(config.get('tensorArchitectureVersion'))is int and config['tensorArchitectureVersion']==2,'invalid-model-role')
 keys=config.get('keys');registry=config.get('registry');bio=config.get('bioKeys');banks=config.get('banks')
 r(type(keys)is list and len(keys)==135 and all(type(k)is str for k in keys)and len(set(keys))==135 and type(registry)is dict and set(registry)==set(keys),'model-key-profile')
 r(type(bio)is list and len(bio)==122 and all(type(k)is str for k in bio)and len(set(bio))==122 and set(bio)<=set(keys)and type(banks)is dict and len(banks)==63 and set(banks)<=set(keys),'model-head-profile')
 kind=registry.get('request.target.type');families=config.get('targetFamilies');tb=banks.get('request.target.type')
 r(type(kind)is dict and kind.get('role')=='global'and kind.get('bio')is False and 'request.target.type'not in bio and type(families)is dict and len(families)==4 and kind.get('familiesByArea')==families,'type-family-profile')
 r(all(type(values)is list and all(type(x)is str and x for x in values)and len(set(values))==len(values)for values in families.values()),'type-family-values')
 values=set(x for group in families.values()for x in group)
 r(len(values)==15 and type(tb)is list and len(tb)==17 and tb[:2]==[{'state':'absent'},{'state':'unknown'}]and all(type(e)is dict and set(e)=={'state','value'}and e['state']=='value'and type(e['value'])is str for e in tb[2:])and {e['value']for e in tb[2:]}==values,'type-bank-profile')
 r(config.get('trainingSourceFormat')==SOURCE and config.get('trainingPolicyContract')==POLICY_CONTRACT and manifest.get('format')==v.PREPARATION,'source-profile-mismatch')
 r(artifact.get('modelConfigFormat')==v.MODEL and artifact.get('rawCodecFormat')==v.CODEC and artifact.get('preparationFormat')==v.PREPARATION,'artifact-profile-mismatch')
 for key in ['config','trainer','dataManifest','preparer']:
  r(v.is_hash(hashes.get(key))and artifact.get(key+'Sha256')==hashes[key],'artifact-hash-chain:'+key)
 r(v.is_hash(hashes.get('checkpoint')),'checkpoint-hash-required')
 r(all(config.get(k+'Sha256')==hashes[k]for k in ['trainer','preparer','dataManifest'])and manifest.get('scriptSha256')==hashes['preparer'],'source-hash-chain')
 r(config.get('selectionCriterion')==artifact.get('selectionCriterion')==v.SELECTION and config.get('checkpointEvaluation')==artifact.get('checkpointEvaluation')==v.EVALUATION,'evaluation-contract-mismatch')
 policy(config.get('trainingPolicy'));r(artifact.get('trainingPolicy')==config['trainingPolicy'],'training-policy-mismatch')
 r(config.get('checkpointWriter')==WRITER,'checkpoint-writer-mismatch')
 r(type(config.get('runId'))is str and len(config['runId'])==32 and all(c in '0123456789abcdef'for c in config['runId'])and artifact.get('runId')==config['runId'],'run-id-mismatch')
 outputs=manifest.get('outputs');files=manifest.get('dataFiles');counts=artifact.get('dataRecordCounts')
 r(type(outputs)is dict and set(outputs)=={'train','calibration'} and type(files)is dict and set(files)==set(outputs)and artifact.get('encodedDataSha256')==outputs,'encoded-data-chain')
 r(type(counts)is dict and set(counts)==set(outputs),'data-counts-required')
 for split,item in files.items():
  r(type(item)is dict and set(item)=={'path','encoding','compression','sha256','decodedSha256','encodedBytes','decodedBytes','records'},'invalid-data-file-record')
  r(item['path']==split+'.jsonl.gz' and item['encoding']=='utf-8' and item['compression']=='gzip','data-file-profile')
  r(v.is_hash(outputs[split])and item['sha256']==outputs[split]and v.is_hash(item['decodedSha256'])and all(type(item[k])is int and item[k]>=0 for k in ['encodedBytes','decodedBytes','records']),'invalid-data-file-hashes')
  r(type(counts[split])is int and counts[split]>0 and counts[split]==item['records'],'data-count-mismatch')
 w=artifact.get('warmstart');fields={'format','kind','specSha256','frozenInputs','sourceModelFormat','targetModelFormat','elementWorkAllowance','estimatedElements','stats','optimizer','migrationHelperSha256'}
 r(type(w)is dict and set(w)==fields and config.get('warmstart')==w and w['format']=='sop.key-reader-warmstart-provenance/1'and w['targetModelFormat']==v.MODEL and w['optimizer']=='fresh-AdamW','warmstart-contract')
 if w['kind']=='semantic-migration':
  names={'checkpoint','config','run','trainer','dataManifest','preparer','helper'}
  r(type(w['frozenInputs'])is dict and set(w['frozenInputs'])==names and all(v.is_hash(x)for x in w['frozenInputs'].values())and v.is_hash(w['specSha256'])and w['sourceModelFormat']=='sop.key-reader/1'and w['migrationHelperSha256']==w['frozenInputs']['helper'],'warmstart-identity')
  r(v.positive(w['elementWorkAllowance'])and v.positive(w['estimatedElements'])and w['estimatedElements']<=w['elementWorkAllowance'],'warmstart-work-budget')
  stats=w['stats'];r(type(stats)is dict and set(stats)=={'elements','copiedElements','tensors','rows'}and all(type(x)is int and x>=0 for x in stats.values())and stats['elements']==w['estimatedElements'],'warmstart-work-proof')
 elif w['kind']=='pretrained-encoder':r(w['frozenInputs']=={}and all(w[k]is None for k in ['specSha256','sourceModelFormat','elementWorkAllowance','estimatedElements','stats','migrationHelperSha256']),'pretrained-contract')
 else:r(False,'unsupported-warmstart')

def stopping(state,p,epoch,*,final):
 fields={'format','epoch','support','bestPrimaryCorrect','bestPrimarySupport','badEpochs','primaryImproved','stopReason','minimumSatisfied','maxReached','policy'}
 r(type(state)is dict and set(state)==fields and state['format']=='sop.key-reader-plateau-state/1'and state['policy']==p,'plateau-state-profile')
 r(type(epoch)is int and 1<=epoch<=p['maxEpochs']and state['epoch']==epoch and type(state['epoch'])is int,'plateau-epoch')
 r(v.positive(state['support'])and v.positive(state['bestPrimarySupport'])and state['bestPrimarySupport']==state['support']and type(state['bestPrimaryCorrect'])is int and 0<=state['bestPrimaryCorrect']<=state['support']and type(state['badEpochs'])is int and 0<=state['badEpochs']<epoch and type(state['primaryImproved'])is bool,'plateau-counts')
 r(state['minimumSatisfied']is(epoch>=p['minEpochs'])and state['maxReached']is(epoch==p['maxEpochs']),'plateau-flags')
 reason='primary-plateau'if epoch>=p['minEpochs']and state['badEpochs']>=p['patience']else'max-epochs'if epoch==p['maxEpochs']else None
 r(state['stopReason']==reason and (reason is not None if final else reason is None),'plateau-stopping-reason')
 if state['primaryImproved']:r(state['badEpochs']==0,'plateau-improvement-count')

def validate_artifact(config,artifact,manifest,hashes):
 common(config,artifact,manifest,hashes)
 if artifact.get('format')==RUN:
  r(artifact.get('complete')is True and artifact.get('candidate')is True and artifact.get('executionEligible')is False and type(artifact.get('tensorArchitectureVersion'))is int and artifact['tensorArchitectureVersion']==2,'incomplete-final-run')
  r(artifact.get('checkpointSha256')==hashes['checkpoint']and artifact.get('checkpointWriter')==WRITER and v.is_hash(artifact.get('firstEpochProofSha256')),'final-checkpoint-chain')
  r(v.positive(artifact.get('steps'))and v.positive(artifact.get('epochsCompleted'))and artifact['epochsCompleted']>=config['trainingPolicy']['minEpochs'],'incomplete-training')
  epoch=artifact['epochsCompleted'];stopping(artifact.get('stopping'),config['trainingPolicy'],epoch,final=True)
  r(type(artifact.get('bestCheckpointEpoch'))is int and 1<=artifact['bestCheckpointEpoch']<=epoch,'checkpoint-epoch-mismatch');rank(artifact.get('bestSelectionRank'))
  r(type(artifact.get('bestDecodedMentionF1'))in(int,float)and artifact['bestDecodedMentionF1']==artifact['bestSelectionRank'][2],'selection-f1-mismatch')
  return {'valid':True,'role':'completed-run','checkpointEpoch':artifact['bestCheckpointEpoch'],'executionEligible':False,'graphConfidence':None}
 r(artifact.get('format')==EPOCH and artifact.get('artifactRole')=='completed-epoch'and artifact.get('epochComplete')is True and artifact.get('runComplete')is False and artifact.get('executionEligible')is False and artifact.get('confidenceCalibrated')is False and artifact.get('graphConfidence','missing')is None,'invalid-epoch-role')
 r(artifact.get('trainingSourceFormat')==SOURCE and type(artifact.get('completedEpoch'))is int and artifact['completedEpoch']==1 and type(artifact.get('checkpointEpoch'))is int and artifact['checkpointEpoch']==1 and v.positive(artifact.get('optimizerSteps')),'first-completed-epoch-required')
 checkpoint=artifact.get('checkpoint');r(type(checkpoint)is dict and set(checkpoint)=={'sha256','bytes','path'}and checkpoint['sha256']==hashes['checkpoint']and v.positive(checkpoint['bytes'])and checkpoint['path']=='epoch-pins/'+hashes['checkpoint']+'.pt','immutable-checkpoint-reference')
 metrics=artifact.get('checkpointMetrics');r(type(metrics)is dict,'checkpoint-metrics-required')
 body=json.dumps(metrics,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode();r(len(body)<=2097152 and artifact.get('checkpointMetricsSha256')==hashlib.sha256(body).hexdigest(),'checkpoint-metrics-hash')
 correct,support=metrics.get('positiveBioAndGlobalExact'),metrics.get('positiveBioAndGlobalSupport');kind=metrics.get('targetTypePresentClass')
 r(type(correct)is int and v.positive(support)and 0<=correct<=support and type(kind)is dict and type(kind.get('support'))is int and kind['support']>=0 and type(kind.get('correct'))is int and 0<=kind['correct']<=kind['support'],'checkpoint-metric-counts')
 expected=[correct/support,kind['correct']/kind['support']if kind['support']else 0.,metrics.get('decodedMentionF1')];rank(expected);rank(artifact.get('checkpointSelectionRank'));r(artifact['checkpointSelectionRank']==expected,'checkpoint-metric-rank')
 state=artifact.get('stoppingAtEpoch');stopping(state,config['trainingPolicy'],1,final=False)
 r(state['bestPrimaryCorrect']==correct and state['support']==support and state['badEpochs']==0 and state['primaryImproved']is True,'first-epoch-plateau-metrics')
 storage=artifact.get('storage');r(type(storage)is dict and set(storage)=={'policy','pinCount','retention','writer','additionalAllocationUpperBytes','reserveBytes'}and storage['policy']=='first-completed-epoch-hardlink/1'and type(storage['pinCount'])is int and storage['pinCount']==1 and storage['retention']=='permanent'and storage['writer']==WRITER and v.positive(storage['additionalAllocationUpperBytes'])and storage['additionalAllocationUpperBytes']>=checkpoint['bytes']and storage['reserveBytes']==134217728,'epoch-storage-contract')
 return {'valid':True,'role':'completed-epoch','checkpointEpoch':1,'executionEligible':False,'graphConfidence':None}
