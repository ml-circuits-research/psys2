// Opaque-byte packaging only: no model execution, calibration, Git or deployment activation.
import {createReadStream,constants} from 'node:fs';
import {readFile,readdir,lstat,statfs,mkdir,copyFile,chmod,rm,writeFile,realpath,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const safeName=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x)&&x!=='.'&&x!=='..';
export async function hashFile(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function verifyReaderBundle(sourceDir,manifestSha256){
 if(!validHash(manifestSha256))throw Error('invalid-manifest-hash');
 const sourceInfo=await lstat(sourceDir);if(!sourceInfo.isDirectory()||sourceInfo.isSymbolicLink())throw Error('unsafe-source-directory');
 const source=await realpath(sourceDir),manifestBytes=await readFile(path.join(source,'manifest.json'));
 if(hash(manifestBytes)!==manifestSha256)throw Error('manifest-hash-mismatch');
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 if(manifest.format!=='sop.key-reader-runtime/1'||manifest.dtype!=='fp32'||manifest.executionEligible!==false||manifest.graphConfidence!==null)throw Error('unsupported-runtime-manifest');
 if(typeof manifest.configJSON!=='string'||typeof manifest.cutterConfigJSON!=='string'||hash(Buffer.from(manifest.configJSON))!==manifest.configSha256||hash(Buffer.from(manifest.cutterConfigJSON))!==manifest.cutterConfigSha256)throw Error('config-string-identity-mismatch');
 const config=JSON.parse(manifest.configJSON),cutterConfig=JSON.parse(manifest.cutterConfigJSON),expected=new Map([['manifest.json',manifestSha256],['model-config.json',manifest.configSha256],['cutter-config.json',manifest.cutterConfigSha256],[manifest.componentProofs?.key?.path??'first-epoch-proof.json',manifest.immutableProofSha256]]);
 if(manifest.componentProofs){
  for(const role of ['key','cutter']){const d=manifest.componentProofs[role];if(!d||!safeName(d.path)||!validHash(d.sha256))throw Error('invalid-component-proof');if(expected.has(d.path)&&expected.get(d.path)!==d.sha256)throw Error('conflicting-component-proof');expected.set(d.path,d.sha256);}
 }
 for(const component of ['cutter','encoder','heads','tokenizer','bindings']){
  const descriptor=manifest.files?.[component];
  if(!descriptor||!safeName(descriptor.path)||!validHash(descriptor.sha256)||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1)throw Error('invalid-file-descriptor');
  if(expected.has(descriptor.path)&&expected.get(descriptor.path)!==descriptor.sha256)throw Error('conflicting-file-identity');
  expected.set(descriptor.path,descriptor.sha256);
 }
 for(const name of ['tokenizer_config.json','special_tokens_map.json','vocab.txt','added_tokens.json'])if(config.encoderFiles?.[name]){
  if(config.encoderFiles[name]!==cutterConfig.encoderFiles?.[name])throw Error('tokenizer-component-mismatch');expected.set(name,config.encoderFiles[name]);
 }
 const files=[];
 for(const entry of await readdir(source,{withFileTypes:true})){
  if(!entry.isFile()||!safeName(entry.name)||!expected.has(entry.name))throw Error('unexpected-or-nonregular-bundle-entry');
  const sourcePath=path.join(source,entry.name),info=await lstat(sourcePath),sha256=await hashFile(sourcePath);
  if(!info.isFile()||sha256!==expected.get(entry.name))throw Error('bundle-file-hash-mismatch:'+entry.name);
  files.push({name:entry.name,sourcePath,bytes:info.size,sha256});
 }
 if(files.length!==expected.size)throw Error('missing-bundle-file');
 for(const descriptor of Object.values(manifest.files)){if(!safeName(descriptor.path)||!files.some(f=>f.name===descriptor.path&&f.sha256===descriptor.sha256&&f.bytes===descriptor.bytes))throw Error('descriptor-size-or-identity-mismatch');}
 for(const [name,text]of [['model-config.json',manifest.configJSON],['cutter-config.json',manifest.cutterConfigJSON]])if(!(await readFile(path.join(source,name))).equals(Buffer.from(text)))throw Error('config-file-byte-mismatch');
 const keyProof=manifest.componentProofs?.key,proof=JSON.parse(await readFile(path.join(source,keyProof?.path??'first-epoch-proof.json'),'utf8'));
 if(!keyProof){if(!proof.epochComplete||proof.runComplete!==false||proof.checkpoint?.sha256!==manifest.checkpointSha256||proof.configSha256!==manifest.configSha256)throw Error('first-proof-identity-mismatch');}
 else{
  if(manifest.weightRepresentation!=='q8-dynamic'||keyProof.profile!=='completed-run-selected'||manifest.runComplete!==true||manifest.firstEpochComplete===true||proof.format!=='sop.key-reader-run/4-target-type-plateau-candidate'||proof.complete!==true||proof.executionEligible!==false||!Number.isSafeInteger(proof.bestCheckpointEpoch)||proof.bestCheckpointEpoch<1||!Number.isSafeInteger(proof.epochsCompleted)||proof.bestCheckpointEpoch>proof.epochsCompleted||keyProof.selectedEpoch!==proof.bestCheckpointEpoch||manifest.selectedEpoch!==proof.bestCheckpointEpoch||keyProof.checkpointSha256!==manifest.checkpointSha256||proof.checkpointSha256!==manifest.checkpointSha256||keyProof.sha256!==manifest.immutableProofSha256)throw Error('completed-selected-proof-mismatch');
  for(const key of ['config','trainer','preparer'])if(proof[key+'Sha256']!==manifest[key+'Sha256'])throw Error('selected-source-correlation');
  if(proof.dataManifestSha256!==config.dataManifestSha256||proof.trainerSha256!==config.trainerSha256||proof.preparerSha256!==config.preparerSha256||proof.runId!==config.runId)throw Error('selected-config-correlation');
  const cp=manifest.componentProofs.cutter,cutter=JSON.parse(await readFile(path.join(source,cp.path),'utf8'));
  if(cp.profile!=='frozen-cutter'||cutter.format!=='sop.request-cutter-run/1'||cutter.complete!==true||cutter.confidenceCalibrated!==false||cutter.executionEligible!==false||cp.checkpointSha256!==manifest.cutterCheckpointSha256||cutter.checkpointSha256!==manifest.cutterCheckpointSha256||cutter.configSha256!==manifest.cutterConfigSha256||cutter.trainerSha256!==manifest.cutterTrainerSha256)throw Error('cutter-proof-correlation');
 }
 files.sort((a,b)=>a.name.localeCompare(b.name));
 const artifactBase=`models/sop-bert/${manifestSha256}/`,tokenizerConfig=files.find(f=>f.name==='tokenizer_config.json');
 if(!tokenizerConfig)throw Error('missing-tokenizer-config');
 const deployment={format:'psys2.browser-reader-deployment/1',manifestPath:artifactBase+'manifest.json',manifestSha256,tokenizerArtifact:manifest.files.tokenizer,bindingsArtifact:manifest.files.bindings,tokenizerConfigArtifact:{path:tokenizerConfig.name,sha256:tokenizerConfig.sha256,bytes:tokenizerConfig.bytes},artifactBase};
 return {format:'sop.browser-reader-asset-plan/1',sourceDir:source,manifestSha256,totalBytes:files.reduce((n,f)=>n+f.bytes,0),files,artifactBase,deployment,proofProfile:keyProof?.profile??'first-completed-epoch',keyProofSha256:manifest.immutableProofSha256,...(!keyProof?{firstProofSha256:manifest.immutableProofSha256}:{}),checkpointSha256:manifest.checkpointSha256,activation:false,qualityClaim:false};
}
async function freeBytes(directory){const info=await statfs(directory,{bigint:true});return info.bavail*info.bsize;}
export async function copyReaderAssets(plan,{appRoot,gitAllocationBytes,marginBytes,reserveBytes}){
 if([gitAllocationBytes,marginBytes,reserveBytes].some(x=>!Number.isSafeInteger(x)||x<0))throw Error('invalid-explicit-storage-budget');
 const root=await realpath(appRoot),destination=path.resolve(root,plan.artifactBase);
 if(!destination.startsWith(root+path.sep)||destination===plan.sourceDir)throw Error('unsafe-destination');
 const fresh=await verifyReaderBundle(plan.sourceDir,plan.manifestSha256);
 if(JSON.stringify(fresh)!==JSON.stringify(plan))throw Error('source-plan-changed');
 const before=await freeBytes(root),reserved=BigInt(gitAllocationBytes+marginBytes+reserveBytes);let remaining=BigInt(plan.totalBytes);
 if(before-remaining<reserved)throw Error('insufficient-copy-and-git-reserve');
 let parent=root;for(const segment of plan.artifactBase.split('/').filter(Boolean).slice(0,-1)){
  parent=path.join(parent,segment);try{const info=await lstat(parent);if(!info.isDirectory()||info.isSymbolicLink())throw Error('unsafe-parent');}catch(error){if(error.code!=='ENOENT')throw error;await mkdir(parent);}
 }
 await mkdir(destination); // Exclusive fresh directory: never overwrites any asset.
 try{
  for(const file of plan.files){
   if(await freeBytes(root)-remaining<reserved)throw Error('reserve-changed-during-copy');
   if(await hashFile(file.sourcePath)!==file.sha256)throw Error('source-changed-before-copy');
   const target=path.join(destination,file.name);await copyFile(file.sourcePath,target,constants.COPYFILE_EXCL);await chmod(target,0o444);
   if((await lstat(target)).size!==file.bytes||await hashFile(target)!==file.sha256)throw Error('copied-file-identity-mismatch');remaining-=BigInt(file.bytes);
  }
  if(JSON.stringify(await verifyReaderBundle(plan.sourceDir,plan.manifestSha256))!==JSON.stringify(plan))throw Error('source-changed-after-copy');
  const after=await freeBytes(root);if(after<reserved)throw Error('post-copy-reserve-refusal');
  return {format:'sop.browser-reader-asset-copy/1',destination,plan,freeBefore:Number(before),freeAfter:Number(after),gitAllocationBytes,marginBytes,reserveBytes,remainingAfterGitAndMargin:Number(after)-gitAllocationBytes-marginBytes,sourceUnchanged:true,allCopiedHashesVerified:true,gitOperations:false,deploymentConfigWritten:false,activation:false};
 }catch(error){await rm(destination,{recursive:true,force:true});throw error;}
}
export async function linkReaderAssets(plan,{appRoot,gitAllocationBytes,marginBytes,reserveBytes}){
 if([gitAllocationBytes,marginBytes,reserveBytes].some(x=>!Number.isSafeInteger(x)||x<0))throw Error('invalid-explicit-storage-budget');
 const root=await realpath(appRoot),destination=path.resolve(root,plan.artifactBase),reserved=BigInt(gitAllocationBytes+marginBytes+reserveBytes);
 if(plan.artifactBase!==`models/sop-bert/${plan.manifestSha256}/`||!destination.startsWith(root+path.sep)||destination===plan.sourceDir)throw Error('unsafe-destination');
 if(JSON.stringify(await verifyReaderBundle(plan.sourceDir,plan.manifestSha256))!==JSON.stringify(plan))throw Error('source-plan-changed');
 for(const file of plan.files){const st=await lstat(file.sourcePath);if(st.mode&0o222||!st.isFile())throw Error('mutable-link-source');}
 if(await freeBytes(root)<reserved)throw Error('insufficient-link-and-git-reserve');
 let parent=root;for(const segment of plan.artifactBase.split('/').filter(Boolean).slice(0,-1)){parent=path.join(parent,segment);try{const st=await lstat(parent);if(!st.isDirectory()||st.isSymbolicLink())throw Error('unsafe-parent');}catch(e){if(e.code!=='ENOENT')throw e;await mkdir(parent);}}
 await mkdir(destination);
 try{
  for(const file of plan.files){if(await freeBytes(root)<reserved)throw Error('link-reserve-changed');await link(file.sourcePath,path.join(destination,file.name));if(await hashFile(path.join(destination,file.name))!==file.sha256)throw Error('linked-file-identity');}
  if(JSON.stringify(await verifyReaderBundle(plan.sourceDir,plan.manifestSha256))!==JSON.stringify(plan))throw Error('source-changed-after-link');
  if(await freeBytes(root)<reserved)throw Error('post-link-reserve');
  return {format:'sop.browser-reader-asset-link/1',destination,manifestSha256:plan.manifestSha256,logicalBytes:plan.totalBytes,sharedImmutableBytes:true,gitOperations:false,activation:false};
 }catch(error){await rm(destination,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(key==='--copy'||key==='--link'){options[key.slice(2)]=true;continue;}if(!key.startsWith('--')||!process.argv[i+1])throw Error('invalid-cli-option');options[key.slice(2)]=process.argv[++i];}
 const plan=await verifyReaderBundle(options.source,options['manifest-sha256']);
 if(options.copy&&options.link)throw Error('choose-copy-or-link');
 const budget={appRoot:options['app-root'],gitAllocationBytes:Number(options['git-allocation-bytes']),marginBytes:Number(options['margin-bytes']),reserveBytes:Number(options['reserve-bytes'])};
 const receipt=options.link?await linkReaderAssets(plan,budget):options.copy?await copyReaderAssets(plan,{appRoot:options['app-root'],gitAllocationBytes:Number(options['git-allocation-bytes']),marginBytes:Number(options['margin-bytes']),reserveBytes:Number(options['reserve-bytes'])}):plan;
 if(options.receipt)await writeFile(options.receipt,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({format:receipt.format,totalBytes:plan.totalBytes,manifestSha256:plan.manifestSha256,destination:receipt.destination??null,freeAfter:receipt.freeAfter??null,gitOperations:false,activation:false}));
}
