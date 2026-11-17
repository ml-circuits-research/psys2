// C1 declaration joins. No messages, predictions, evaluation rows or lexical similarity.
export function proposeDeclarationAlignments({world, str, inventory, families, records=[...world.matrix.values(), ...world.wires.values()], budget=1000000, maxRecords=100000, maxValues=4096}) {
  let steps=0;
  const tick=()=>{ if (++steps>budget) throw Error('declaration-join-budget'); };
  if (records.length>maxRecords || !Array.isArray(families) || families.length>256) throw Error('declaration-join-profile');
  const values=(wire,key)=>(wire.attrs?.[key]??[]).map(token=>{tick();return str(token);});
  const byId=new Map(), types=new Map(), slots=[], facts=new Map(), wordsByMeaning=new Map(), wordsByOwner=new Map();
  const add=(map,key,row)=>{ if(!map.has(key)) map.set(key,[]); map.get(key).push(row); };
  for(const wire of records) {
    tick();
    const identity=(['core.type','core.slot'].includes(wire.type)?'schema:':'fact:')+wire?.id;
    if(!wire?.id || !wire.type || byId.has(identity)) throw Error('duplicate-or-invalid-declaration');
    byId.set(identity,wire); add(facts,wire.type,wire);
    if(wire.type==='core.type') {
      const of=values(wire,'of');
      if(of.length!==1 || of[0]!==wire.id) throw Error('invalid-class-declaration');
      types.set(wire.id,wire);
    } else if(wire.type==='core.slot') slots.push(wire);
    else if(wire.type==='core.word') {
      for(const meaning of values(wire,'means')) add(wordsByMeaning,meaning,wire);
      for(const owner of values(wire,'of')) add(wordsByOwner,owner,wire);
    }
  }
  function lineage(identity) {
    const done=new Set(), active=new Set(), proof=[], missing=[];
    function visit(id) {
      tick();
      if(active.has(id)) throw Error('declaration-inheritance-cycle');
      if(done.has(id)) return;
      const wire=types.get(id);
      if(!wire) { missing.push(id); return; }
      active.add(id); proof.push(id);
      for(const parent of values(wire,'extends')) visit(parent);
      active.delete(id); done.add(id);
    }
    visit(identity); return {owners:done,proof,missing};
  }
  function contract(slot) {
    const kinds=values(slot,'kind'), valueTypes=values(slot,'type'), by=values(slot,'by'), enumValues=values(slot,'enum'), many=values(slot,'many');
    const declaration={slot:slot.id,kinds,valueTypes,by,enumValues,many,min:values(slot,'min'),max:values(slot,'max'),step:values(slot,'step')};
    const aliases=[], providerValues=[];
    const charge=()=>{tick();if(aliases.length+providerValues.length>=maxValues) throw Error('declaration-value-budget');};
    for(const word of wordsByOwner.get(slot.id)??[]) {
      for(const meaning of values(word,'means')) if(enumValues.includes(meaning)) for(const text of values(word,'text')) {
        charge(); aliases.push({text,value:meaning,word:word.id,of:slot.id});
      }
    }
    for(const type of valueTypes) if(by.length===1) for(const fact of facts.get(type)??[]) {
      for(const value of values(fact,by[0])) {
        charge(); providerValues.push({value,wire:fact.id,type,key:by[0]});
        for(const word of wordsByOwner.get(type+'.'+by[0])??[]) if(values(word,'means').includes(value)) for(const text of values(word,'text')) {
          charge(); aliases.push({text,value,word:word.id,of:type+'.'+by[0],meaningWire:fact.id});
        }
      }
    }
    return {declaration,aliases,providerValues,providerCoverage:'Supplied source records only; provider population is not asserted closed.',
      obligations:[...(valueTypes.length&&!by.length?['resolve-typed-reference-and-role-ownership']:[]),...(valueTypes.length&&by.length?['verify-declared-provider-name']:[]),
        ...(kinds.some(k=>!['atom','string'].includes(k))?['use-declared-value-type-parser-and-context-contract']:[]),...(many.includes('true')?['preserve-declared-cardinality']:[]),
        'preserve-source-range-and-normalization-proof'],executionEligible:false};
  }
  const taskGroups=new Map(), rows=[];
  function task(reason,row,details) {
    const key=JSON.stringify([reason,row.area,row.type,row.descriptor.concept??null]);
    if(!taskGroups.has(key)) taskGroups.set(key,{reason,area:row.area,type:row.type,concept:row.descriptor.concept??null,keys:[],details});
    taskGroups.get(key).keys.push(row.key);
  }
  for(const [area,rawTypes] of Object.entries(inventory)) for(const [type,raw] of Object.entries(rawTypes)) {
    tick(); if(!raw?.keys) continue;
    const family=families.filter(f=>{tick();return f.area===area&&f.type===type&&f.status==='aligned';});
    const ancestry=family.length===1?lineage(family[0].canonical):null;
    // Use the library's effective schema: nearest slot overrides an ancestor slot.
    const effective=ancestry?world.schema(family[0].canonical)?.keys:null;
    for(const [key,descriptor] of Object.entries(raw.keys)) {
      tick(); const row={area,type,key:type+'.'+key,descriptor,status:'unresolved',candidates:[]}; rows.push(row);
      if(family.length!==1 || !ancestry.owners.has(family[0].canonical)) {
        row.reason=family.length>1?'ambiguous-family-identity':'missing-applicable-family-identity';
        task(row.reason,row,{required:'Declare a sound shared class/role or explicit applicability relation; no narrow class substitution.'}); continue;
      }
      // An undeclared parent contributes no inferred slots. Explicit effective child slots remain usable proposals.
      row.family={canonical:family[0].canonical,lineage:ancestry.proof,missingParents:ancestry.missing};
      for(const slot of slots) {
        tick(); const owners=values(slot,'of'), slotKeys=values(slot,'key');
        if(owners.length!==1 || !ancestry.owners.has(owners[0]) || slotKeys.length!==1) continue;
        const inherited=effective?.[slotKeys[0]];
        if(!inherited || str(inherited.of)!==owners[0] || inherited.combined) continue;
        const joins=[];
        if(slotKeys[0]===key) joins.push({kind:'exact-owning-slot-key',slot:slot.id,key});
        for(const word of wordsByMeaning.get(slot.id)??[]) if(values(word,'text').includes(key)) joins.push({kind:'declared-word-meaning',word:word.id,slot:slot.id,key});
        if(joins.length) row.candidates.push({canonical:slot.id,owner:owners[0],joins,valueContract:contract(slot)});
      }
      if(row.candidates.length===1) {row.status='declared-proposal';row.reason=null;row.executionEligible=false;}
      else {
        row.reason=row.candidates.length?'ambiguous-applicable-property':'missing-owning-property-or-alias';
        task(row.reason,row,{searchedOwners:ancestry.proof,required:row.candidates.length?'Disambiguate semantic role/applicability with authored declarations.':'Declare a reusable owning property or exact word-meaning alias; prefix/concept similarity is insufficient.'});
      }
    }
  }
  return {format:'sop.declaration-alignment-proposals/1',rows,tasks:[...taskGroups.values()],steps,sourceRecords:records.length,
    scope:'Source-backed identity proposals; descriptor value representations still require independent validation.',executionEligible:false};
}
