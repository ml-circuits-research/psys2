// Read-only presentation of the exact instance archive and its owned object facts.
import{parse,serialize,str,readInstanceState}from'../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import{createBudget}from'./budget.mjs?v=d42dc656e7';
// observedSupport: per observed object id, the instance facts its observation was derived from (the derivation's own
// record). It binds an object that no fact names by identity; it is never inferred from matching values.
export function inspectInstanceRecord(record,{observation=null,semanticWires=null,identityKey='id',interfaceTypeKey=null,observationOnlyTypes=[],observedSupport=null}={}){
 const archive=readInstanceState(record.wires),nodes=parse(record.wires),byId=new Map(nodes.map(n=>[n.id,n])),order=new Map(nodes.map((n,i)=>[n.id,i])),byNative=new Map(archive.objects.map(o=>[o.id,o]));
 const descriptors=nodes.filter(n=>n.type==='std.instance.object'),facts=new Set(descriptors.map(n=>str(n.attrs.fact[0]).slice(1)));
 const observed=new Map((observation?.objects??[]).map(o=>[o.id,o]));
 const budget=createBudget({perTurn:500000,perSite:500000});
 const objects=descriptors.map(descriptor=>{
  const id=str(descriptor.attrs.id[0]),factId=str(descriptor.attrs.fact[0]).slice(1);
  const closure=roots=>{const selected=new Set(),pending=[...roots];
  while(pending.length){budget.tick('instance-inspection.references');const next=pending.pop();if(selected.has(next))continue;const node=byId.get(next);if(!node)throw Error('inspection-dangling-reference');selected.add(next);
   for(const tokens of Object.values(node.attrs))for(const token of tokens)if(token[0]==='$'){const ref=token.slice(1);if(!facts.has(ref)||ref===factId)pending.push(ref);}
  }
   return serialize([...selected].map(id=>byId.get(id)).sort((a,b)=>order.get(a.id)-order.get(b.id)));
  };
  const object=byNative.get(id),live=observed.get(id);
  return {...object,factId,wires:closure([factId]),archiveWires:closure([descriptor.id,factId]),...(live?{observation:{source:live.source,version:live.version,scope:observation.scope}}:{})};
 });
 if(semanticWires!==null){
  const semanticNodes=parse(semanticWires),semanticById=new Map(semanticNodes.map(node=>[node.id,node])),boundFacts=semanticNodes.filter(node=>node.attrs[identityKey]?.length===1&&(!interfaceTypeKey||node.attrs[interfaceTypeKey]?.length===1)),identity=new Map(boundFacts.map(node=>[str(node.attrs[identityKey][0]),node]));
  if(identity.size!==boundFacts.length)throw Error('canonical-object-identity-ambiguous');
  const facts=new Set([...identity.values()].map(node=>node.id));
  for(const object of objects){const fact=identity.get(object.id);
   const derived=fact?[]:(observedSupport?.[object.id]??[]).filter(id=>semanticById.has(id));
   if(!fact&&!derived.length&&observationOnlyTypes.includes(object.type)){object.factSource='tool observation';continue;}
   if(!fact&&!derived.length)throw Error('canonical-object-identity-mismatch');
   if(fact&&(interfaceTypeKey?str(fact.attrs[interfaceTypeKey]?.[0]):fact.type)!==object.type)throw Error('canonical-object-identity-mismatch');
   const roots=fact?[fact.id]:derived,ids=new Set(),pending=[...roots];object.factSource=fact?'instance':'instance (derived observation)';
   while(pending.length){budget.tick('instance-inspection.canonical-references');const id=pending.pop();if(ids.has(id))continue;const node=semanticById.get(id);if(!node)throw Error('canonical-dangling-reference');ids.add(id);for(const values of Object.values(node.attrs))for(const value of values)if(value[0]==='$'&&(!facts.has(value.slice(1))||roots.includes(value.slice(1))))pending.push(value.slice(1));}
   object.factId=roots.join(' ');object.wires=serialize(semanticNodes.filter(node=>ids.has(node.id)));
  }
 }
 return {world:archive.world,instanceId:archive.instanceId,revision:archive.revision,schemaVersion:archive.schemaVersion,metadata:archive.metadata??{},wires:semanticWires??record.wires,objects};
}
