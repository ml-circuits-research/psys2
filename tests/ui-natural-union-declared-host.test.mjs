import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repository=fileURLToPath(new URL('../',import.meta.url));
test('union preparation preserves source coverage, merges types and groups compounds before weighting',()=>{
 const script=String.raw`
import collections, gzip, hashlib, importlib.util, json, pathlib, tempfile
root=pathlib.Path.cwd(); path=root/'training/sop-bert/prepare-ui-natural-union.py'
spec=importlib.util.spec_from_file_location('union',path); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
source=root/'training/sop-bert/data/ui-natural-v1'
rows=module.read_rows(source/'authored.jsonl')
first=rows[0]; family=first['cohort']['recipeFamily']
sibling=next(row for row in rows if row['source_id']!=first['source_id'] and row.get('cohort',{}).get('recipeFamily')==family)
grouped=module.new_group_splits([{'source_id':'a','cohort':{'recipeFamily':'A'}},{'source_id':'b','cohort':{'recipeFamily':'B'}},{'source_id':'ab','cohort':{'recipeFamilies':['A','B']}}])
assert len(set(grouped.values()))==1
with gzip.open(root/'training/sop-bert/data/demo-tool-profile/active.jsonl.gz','rt') as handle: old=json.loads(next(handle))
with tempfile.TemporaryDirectory(prefix='ui-union-test-') as temporary:
 directory=pathlib.Path(temporary); oldpath=directory/'old.jsonl'; newpath=directory/'new.jsonl'
 oldpath.write_text(json.dumps(old)+'\n'); newpath.write_text('\n'.join(json.dumps(row)for row in [first,sibling])+'\n')
 out=directory/'prepared'; manifest=module.prepare(oldpath,newpath,source/'inventory.json',out,ui_weight=5)
 load=lambda name:[json.loads(line)for line in(out/(name+'.jsonl')).read_text().splitlines()]
 oldfull=load('full-old'); uifull=load('full-ui'); train=load('train'); calibration=load('calibration')
 assert len(oldfull)==len(old['requests']) and len(uifull)==2
 assert len({row['splitGroup']for row in uifull})==1 and len({row['split']for row in uifull})==1
 for gold in oldfull+uifull:
  actual=[row for row in train+calibration if row['source_id']==gold['source_id'] and row['requestIndex']==gold['requestIndex']]
  assert len(actual)==(5 if gold['origin']=='ui'and gold['split']=='train'else 1)
 assert len({row['id']for row in train})==len(train)
 assert all(row.get('repeatIndex',0)==0 for row in calibration)
 shared=module.load_preparer(); oldkeys=set(shared.registry(json.loads((root/'training/sop-bert/data/demo-tool-profile/inventory.json').read_text())))
 assert all(set(row['coveredKeys'])<=oldkeys for row in oldfull)
 assert set(manifest['registry'])>oldkeys
 assert set(manifest['registry']['request.target.type']['values'])=={typ for types in manifest['targetFamilies'].values()for typ in types}
 assert manifest['maxLength']==384 and manifest['trainingRun'] is False and manifest['excludedSources']==0
 identity=old['source_path']+':'+old['source_id']; assert oldfull[0]['split']==module.split_for(identity)
 assert manifest['diagnostics']['ui']=={}
print('small actual shared-preparer union: all assertions pass')
`;
 const result=spawnSync('python3',['-I','-c',script],{cwd:repository,encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
