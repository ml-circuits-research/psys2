// Read-only presentation of the exact instance archive and its owned object facts.
import{parse,serialize,str,readInstanceState}from'../vendor/sopworld/sopworld.mjs';
import{createBudget}from'./budget.mjs';
export function inspectInstanceRecord(record,{observation=null}={}){
 const archive=readInstanceState(record.wires),nodes=parse(record.wires),byId=new Map(nodes.map(n=>[n.id,n])),order=new Map(nodes.map((n,i)=>[n.id,i])),byNative=new Map(archive.objects.map(o=>[o.id,o]));
 const descriptors=nodes.filter(n=>n.type==='std.instance.object'),facts=new Set(descriptors.map(n=>str(n.attrs.fact[0]).slice(1)));
 const semanticById=new Map(archive.objects.map(o=>[o.id,o]));
 const observed=new Map((observation?.objects??[]).map(o=>[o.id,o]));
 const budget=createBudget({perTurn:500000,perSite:500000});
 const objects=descriptors.map(descriptor=>{
  const id=str(descriptor.attrs.id[0]),factId=str(descriptor.attrs.fact[0]).slice(1),selected=new Set(),pending=[descriptor.id,factId];
  while(pending.length){budget.tick('instance-inspection.references');const next=pending.pop();if(selected.has(next))continue;const node=byId.get(next);if(!node)throw Error('inspection-dangling-reference');selected.add(next);
   for(const tokens of Object.values(node.attrs))for(const token of tokens)if(token[0]==='$'){const ref=token.slice(1);if(!facts.has(ref)||ref===factId)pending.push(ref);}
  }
  const object=byNative.get(id),live=observed.get(id);
  return {...object,factId,wires:serialize([...selected].map(id=>byId.get(id)).sort((a,b)=>order.get(a.id)-order.get(b.id))),...(live?{observation:{source:live.source,version:live.version,scope:observation.scope}}:{})};
 });
 return {world:archive.world,instanceId:archive.instanceId,revision:archive.revision,schemaVersion:archive.schemaVersion,metadata:archive.metadata??{},wires:record.wires,objects};
}
