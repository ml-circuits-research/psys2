"""Pure completed-run metadata admission; no model, training-data or file reads."""
import math
MODEL='sop.key-reader/2-target-type-candidate'
CODEC='sop.key-reader-raw-codec/2-target-type-candidate'
RUN='sop.key-reader-run/3-target-type-migration-candidate'
PREPARATION='sop.per-key-supervision/3-target-type-migration-candidate'
SELECTION={'format':'sop.key-reader-selection/1','order':['positiveSupervisedBioGlobalExactRate','targetTypePresentClassAccuracy','decodedMentionF1'],'scope':'gold-cut supervised BIO+global subset, not complete graph'}
EVALUATION={'format':'sop.key-reader-checkpoint-evaluation/1','trainingParameterDtype':'float32','checkpointFloatingStorage':'bfloat16','evaluationRoundtrip':'float32->bfloat16->float32','forwardAutocast':'disabled','device':'training-device','state':'detached-eval-clone','optimizer':'unchanged'}
def require(value,reason):
 if not value:raise ValueError(reason)
def is_hash(value):return type(value)is str and len(value)==64 and all(c in '0123456789abcdef'for c in value)
def positive(value):return type(value)is int and value>0
def validate_run_v3(config,run,manifest,hashes):
 require(run.get('format')==RUN and run.get('complete')is True,'incomplete-candidate-run')
 require(run.get('candidate')is True and run.get('executionEligible')is False,'invalid-candidate-run-role')
 require(config.get('format')==MODEL and config.get('rawCodecFormat')==CODEC and config.get('candidate')is True and config.get('executionEligible')is False,'invalid-candidate-config-role')
 require(type(config.get('tensorArchitectureVersion'))is int and config['tensorArchitectureVersion']==2 and type(run.get('tensorArchitectureVersion'))is int and run['tensorArchitectureVersion']==2,'architecture-mismatch')
 require(config.get('trainingSourceFormat')=='sop.key-reader-source/3-target-type-migration-candidate' and run.get('modelConfigFormat')==MODEL and run.get('rawCodecFormat')==CODEC and run.get('preparationFormat')==PREPARATION and manifest.get('format')==PREPARATION,'profile-mismatch')
 require(positive(run.get('steps')) and positive(run.get('epochsCompleted')) and run['epochsCompleted']>=3,'incomplete-candidate-training')
 for key in ['checkpoint','config','trainer','dataManifest','preparer']:
  require(is_hash(hashes.get(key)) and run.get(key+'Sha256')==hashes[key],'run-hash-chain:'+key)
 require(config.get('trainerSha256')==hashes['trainer'] and config.get('dataManifestSha256')==hashes['dataManifest'] and config.get('preparerSha256')==hashes['preparer'] and manifest.get('scriptSha256')==hashes['preparer'],'source-hash-chain')
 require(config.get('selectionCriterion')==SELECTION and run.get('selectionCriterion')==SELECTION,'selection-contract-mismatch')
 require(config.get('checkpointEvaluation')==EVALUATION and run.get('checkpointEvaluation')==EVALUATION,'checkpoint-evaluation-mismatch')
 rank=run.get('bestSelectionRank');require(type(rank)is list and len(rank)==3 and all(type(x)in(int,float) and math.isfinite(x) and 0<=x<=1 for x in rank),'invalid-selection-rank')
 require(type(run.get('bestDecodedMentionF1'))in(int,float) and run['bestDecodedMentionF1']==rank[2],'selection-f1-mismatch')
 outputs=manifest.get('outputs');files=manifest.get('dataFiles')
 require(type(outputs)is dict and set(outputs)=={'train','calibration'} and type(files)is dict and set(files)==set(outputs) and run.get('encodedDataSha256')==outputs,'encoded-data-chain')
 for split,item in files.items():
  require(type(item)is dict and set(item)=={'path','encoding','compression','sha256','decodedSha256','encodedBytes','decodedBytes','records'},'invalid-data-file-record')
  require(item['path']==split+'.jsonl.gz' and item['encoding']=='utf-8' and item['compression']=='gzip','unsupported-data-file')
  require(is_hash(outputs[split]) and item['sha256']==outputs[split] and is_hash(item['decodedSha256']) and all(type(item[k])is int and item[k]>=0 for k in ['encodedBytes','decodedBytes','records']),'invalid-data-file-provenance')
 warm=run.get('warmstart')
 fields={'format','kind','specSha256','frozenInputs','sourceModelFormat','targetModelFormat','elementWorkAllowance','estimatedElements','stats','optimizer','migrationHelperSha256'}
 require(type(warm)is dict and set(warm)==fields and config.get('warmstart')==warm and warm['format']=='sop.key-reader-warmstart-provenance/1' and warm['optimizer']=='fresh-AdamW' and warm['targetModelFormat']==MODEL,'invalid-warmstart-contract')
 if warm['kind']=='semantic-migration':
  names={'checkpoint','config','run','trainer','dataManifest','preparer','helper'}
  require(type(warm['frozenInputs'])is dict and set(warm['frozenInputs'])==names and all(is_hash(x)for x in warm['frozenInputs'].values()) and is_hash(warm['specSha256']),'invalid-warmstart-hashes')
  require(warm['sourceModelFormat']=='sop.key-reader/1' and warm['migrationHelperSha256']==warm['frozenInputs']['helper'],'invalid-warmstart-source')
  require(positive(warm['elementWorkAllowance']) and positive(warm['estimatedElements']) and warm['estimatedElements']<=warm['elementWorkAllowance'],'invalid-work-allowance')
  stats=warm['stats'];require(type(stats)is dict and set(stats)=={'elements','copiedElements','tensors','rows'} and all(type(x)is int and x>=0 for x in stats.values()) and stats['elements']==warm['estimatedElements'],'migration-work-mismatch')
 elif warm['kind']=='pretrained-encoder':
  require(warm['frozenInputs']=={} and all(warm[k]is None for k in ['specSha256','sourceModelFormat','elementWorkAllowance','estimatedElements','stats','migrationHelperSha256']),'invalid-pretrained-initialization')
 else:raise ValueError('unsupported-warmstart-kind')
 return {'valid':True,'executionEligible':False,'scope':'frozen metadata only; not backend parity or graph confidence'}
