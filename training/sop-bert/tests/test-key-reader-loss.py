import collections
def reference_objective(model,rows,config,device,bio_weights):
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
    return torch.stack(losses).mean(),bio,gold

import importlib.util,torch,copy

def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
new=load('new','training/sop-bert/train-key-reader.py')
class Mock(torch.nn.Module):
 def __init__(self):
  super().__init__();self.hidden=torch.nn.Embedding(20,8);self.bio=torch.nn.Linear(8,9);self.presence=torch.nn.Linear(8,5);self.key=torch.nn.Embedding(5,8);self.classes=torch.nn.ModuleDict({'0':torch.nn.Linear(8,4),'3':torch.nn.Linear(8,5),'4':torch.nn.Linear(8,3)})
 def forward(self,ids,mask):
  hidden=self.hidden(ids);return hidden,self.bio(hidden).reshape(*hidden.shape[:2],3,3).permute(0,2,1,3),self.presence(hidden[:,0])
config={'keys':['a','b','c','g','m'],'bioKeys':['a','b','c']}
for seed in range(10):
 torch.manual_seed(seed);model=Mock();rows=[]
 for i in range(4):
  bio=torch.randint(0,3,(3,7));bio[2]=-100
  if i%2:bio[0,:2]=-100
  rows.append({'input_ids':torch.randint(0,20,(7,)),'attention_mask':torch.ones(7,dtype=torch.long),'bio':bio,'presence':torch.tensor([i%2,1.,-100.,1.,0.]),'classes':{'g':i%5},'mentions':[(0,1,3,{'a':i%4,'m':i%3}),(1,4,5,{'m':0})]})
 weights=[torch.tensor([.3,1.2,.7]),torch.tensor([1.,.4,.7]),torch.ones(3)]
 left=reference_objective(model,rows,config,'cpu',weights)[0];left.backward();grads={k:p.grad.clone()for k,p in model.named_parameters()if p.grad is not None};model.zero_grad()
 right=new.objective(model,rows,config,'cpu',weights)[0];right.backward()
 torch.testing.assert_close(left,right,rtol=1e-6,atol=1e-7)
 for k,p in model.named_parameters():
  if p.grad is not None:torch.testing.assert_close(p.grad,grads[k],rtol=2e-5,atol=2e-7)
print('10 randomized masked/absent/unknown/present batches: loss and every parameter gradient match')
