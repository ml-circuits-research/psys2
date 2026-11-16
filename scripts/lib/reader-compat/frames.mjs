// English source joins are consumer policy. Projection uses only the public API.
export const ENGLISH_FRAME_TYPES = Object.freeze({ module:'w.reader.en.frames', licence:'w.reader.en.frames.licence', role:'w.reader.en.frames.role', node:'w.reader.en.node', step:'w.reader.en.step', verb:'k.actions.verb', frame:'w.lang.en.frame', part:'w.lang.en.part', roleMap:'w.lang.en.role_map', actRole:'k.actions.role' });
export const ENGLISH_FRAME_FACTS = {
 'w.reader.en.frames':['w.reader.en.frames.licence','w.reader.en.frames.role','w.reader.en.node','w.reader.en.step'],
 'w.lang.en':['w.lang.en.frame','w.lang.en.part','w.lang.en.role_map'],
 'k.actions':['k.actions.verb','k.actions.role'],
};

export function createEnglishFrameBinder(api, { types = ENGLISH_FRAME_TYPES } = {}) {
 const snapshots=new WeakMap();
 const limits=n=>Number.isSafeInteger(n)&&n>0;
 const bound=budget=>{let steps=0;const fail=(reason,id)=>{throw {binding:true,reason,...(id?{id}:{})};};return {fail,tick:()=>{if(++steps>budget)fail('budget');}};};
 const safeCopy=(value,budget)=>api.projectTemplates([{template:'copy',context:{value}}],{templates:{copy:{$get:['value']}},budget});
 const compile=(world,{budget=200000}={})=>{
  if(!limits(budget))return {ok:false,issues:[{reason:'invalid-budget'}]};
  const {tick,fail}=bound(budget),stamp=world.stamp;
  try{
   const config=safeCopy(types,budget);if(config.truncated)fail('budget');if(config.failures.length)fail('invalid-type-config');const configured=config.candidates[0].value;
   const names=Object.keys(ENGLISH_FRAME_TYPES);
   if(!configured||Object.keys(configured).length!==names.length||names.some(k=>typeof configured[k]!=='string'||!configured[k]))fail('invalid-type-config');
   const one=(wire,key,optional=false)=>{tick();const values=wire?.attrs[key];if(optional&&!values)return null;if(!values||values.length!==1||typeof values[0]!=='string')fail('missing-or-repeated-field',wire?.id);const value=api.valueText(values[0]);if(!value)fail('empty-field',wire.id);return value;};
   const many=(wire,key)=>{tick();const values=wire?.attrs[key];if(!values?.length)fail('missing-field',wire?.id);return values.map(v=>{tick();return api.valueText(v);});};
   const allowed=(wire,keys)=>{for(const key of Object.keys(wire.attrs)){tick();if(!keys.includes(key)&&!key.startsWith('core.'))fail('unknown-declaration-field',wire.id);}};
   const module=world.modules().find(module=>{tick();return module.name===configured.module;});if(!module||!['1','2'].includes(module.version))fail('unsupported-module-version');
   const groups=new Map(names.filter(k=>k!=='module').map(k=>[k,[]]));
   for(const wire of world.wires.values()){tick();for(const [key,list] of groups){tick();if(wire.type===configured[key])list.push(wire);}}
   for(const key of names.filter(k=>k!=='module'))if(!groups.get(key).length)fail('missing-provider',configured[key]);
   const ids=key=>new Map(groups.get(key).map(w=>{tick();return [w.id,w];}));
   const named=(key,field)=>{const map=new Map();for(const w of groups.get(key)){tick();const name=one(w,field);if(map.has(name))fail('ambiguous-source-name',w.id);map.set(name,w);}return map;};
   const licences=named('licence','name'),frames=named('frame','name'),nodes=named('node','name'),verbs=ids('verb'),parts=ids('part'),maps=ids('roleMap');
   const evidence=wire=>({id:wire.id,type:wire.type,metadata:Object.fromEntries(Object.entries(wire.attrs).filter(([key])=>{tick();return key.startsWith('core.');}).map(([key,values])=>[key,values.map(v=>{tick();return api.valueText(v);})]))});
   const roleGroups=new Map(),stepGroups=new Map(),roleNames=new Set();
   for(const role of groups.get('role')){tick();allowed(role,['name','licence','frame_role','act_role','part','role_map','path_root','target_mode']);const roleName=one(role,'name');if(roleNames.has(roleName))fail('duplicate-role-name',role.id);roleNames.add(roleName);const owner=one(role,'licence');if(!licences.has(owner))fail('orphan-role',role.id);if(!roleGroups.has(owner))roleGroups.set(owner,[]);roleGroups.get(owner).push(role);}
   for(const step of groups.get('step')){tick();const owner=one(step,'of');if(!stepGroups.has(owner))stepGroups.set(owner,[]);stepGroups.get(owner).push(step);}
   const plans=[];
   for(const [name,licence] of licences){
    tick();allowed(licence,['name','verb_id','frame_name','verb_part','valency']);
    const verb=verbs.get(one(licence,'verb_id')),frame=frames.get(one(licence,'frame_name')),verbPart=parts.get(one(licence,'verb_part')),valency=one(licence,'valency');
    if(!['transitive','resultative','oblique'].includes(valency))fail('unsupported-valency',licence.id);
    if(!verb||!frame||!verbPart)fail('missing-licensed-source',licence.id);
    const frameName=one(frame,'name'),act=one(frame,'act');
    if(one(verbPart,'frame')!==frameName||one(verbPart,'is')!=='verb'||one(verbPart,'act')!==one(verb,'act'))fail('verb-frame-mismatch',licence.id);
    const required=many(frame,'role'),roles=roleGroups.get(name)||[],seen=new Set(),output=[];
    if(new Set(required).size!==required.length||roles.length!==required.length)fail('incomplete-frame-roles',licence.id);
    for(const role of roles){
     tick();const frameRole=one(role,'frame_role'),actRole=one(role,'act_role'),part=parts.get(one(role,'part')),mapId=one(role,'role_map',true),mapping=mapId?maps.get(mapId):null;
     if(!required.includes(frameRole)||seen.has(frameRole))fail('duplicate-or-foreign-role',role.id);seen.add(frameRole);
     if(!part||one(part,'frame')!==frameName||one(part,'is')!=='role'||one(part,'role')!==frameRole)fail('role-part-mismatch',role.id);
     const takes=one(part,'takes'),lexicon=one(part,'lexicon',true),targetMode=one(role,'target_mode',true),position=Number(one(part,'at'));if(targetMode!==null&&!['new','existing'].includes(targetMode))fail('unknown-target-mode',role.id);if(!Number.isSafeInteger(position)||position<1)fail('invalid-part-position',part.id);if(!['words','rest','number','prep','lexicon'].includes(takes)||takes==='lexicon'&&!lexicon)fail('unknown-or-incomplete-role-contract',role.id);let marker=false;
     if(mapId){if(!mapping||one(mapping,'act')!==act||one(mapping,'role')!==frameRole||one(mapping,'act_role')!==actRole)fail('role-map-mismatch',role.id);for(const [key,wanted] of [['frame',frameName],['takes',takes]]){tick();const actual=one(mapping,key,true);if(actual!==null&&actual!==wanted)fail('role-map-restriction',role.id);}const mark=one(mapping,'marker',true);if(mark!==null&&mark!=='yes')fail('unknown-marker-mode',role.id);marker=mark==='yes';}
     else if(actRole!==frameRole)fail('missing-role-map',role.id);
     const semantic=groups.get('actRole').filter(w=>{tick();return one(w,'act')===act&&one(w,'name')===actRole;});
     if(semantic.length!==1)fail('missing-or-ambiguous-semantic-role',role.id);
     const root=nodes.get(one(role,'path_root'));if(!root)fail('missing-path',role.id);allowed(root,['name','kind']);if(one(root,'kind')!=='copy')fail('unsupported-path-node',root.id);
     const pathSteps=(stepGroups.get(one(root,'name'))||[]).map(step=>{tick();allowed(step,['of','at','key','index']);const raw=one(step,'at'),at=Number(raw);if(!/^(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(at))fail('invalid-path-order',step.id);return {step,at};}).sort((a,b)=>{tick();return a.at-b.at;});
     if(!pathSteps.length)fail('empty-path',root.id);
     const path=pathSteps.map(({step,at},i)=>{tick();if(at!==i)fail('invalid-path-order',step.id);const key=one(step,'key',true),index=one(step,'index',true);if((key===null)===(index===null))fail('invalid-path-step',step.id);if(key!==null)return key;const value=Number(index);if(!/^(0|[1-9][0-9]*)$/.test(index)||!Number.isSafeInteger(value))fail('invalid-path-index',step.id);return value;});
     output.push({frame_role:frameRole,act_role:actRole,marker,value:{$get:path},requirements:{takes,lexicon,holds:one(semantic[0],'holds'),target_mode:targetMode,typing:'unresolved',units:'unresolved'},source:{$literal:[role,part,semantic[0],root,...pathSteps.map(p=>p.step),...(mapping?[mapping]:[])].map(evidence)},order:position});
    }
    if(new Set(output.map(role=>{tick();return role.order;})).size!==output.length)fail('ambiguous-role-order',licence.id);
    output.sort((a,b)=>{tick();return a.order-b.order;});
    plans.push({id:licence.id,name,verb:verb.id,valency,template:{licence:name,frame:frameName,act,frame_mode:one(frame,'mode',true),needs:(frame.attrs.needs||[]).map(v=>{tick();return api.valueText(v);}),roles:output,source:{$literal:[licence,verb,frame,verbPart].map(evidence)}}});
   }
   if(world.stamp!==stamp)fail('source-changed-during-compilation');
   const checked=safeCopy(plans,budget);if(checked.truncated)fail('budget');if(checked.failures.length)fail('invalid-compiled-data');
   const result={ok:true,source:Object.freeze({world,stamp}),licences:plans.map(({id,name,verb,valency})=>({id,name,verb,valency})),issues:[]};snapshots.set(result,{world,stamp,plans:checked.candidates[0].value});return result;
  }catch(error){return {ok:false,issues:[{reason:error?.binding?error.reason:'invalid-source-data',...(error?.id?{id:error.id}:{})}]};}
 };
 const project=(world,readings,{compiled,budget=200000,projectionBudget=20000}={})=>{
  const empty=reason=>({candidates:[],failures:[{reason}],...(reason==='budget'?{truncated:true}:{})});
  if(!limits(budget)||!limits(projectionBudget))return empty('invalid-budget');
  const snapshot=snapshots.get(compiled);if(!snapshot||snapshot.world!==world||snapshot.stamp!==world.stamp)return empty('stale-or-foreign-compilation');
  const copy=safeCopy(readings,budget);if(copy.truncated)return empty('budget');if(copy.failures.length)return empty('invalid-readings');
  const input=copy.candidates[0].value;if(!Array.isArray(input))return empty('invalid-readings');
  const {tick,fail}=bound(budget),jobs=[],origins=[],failures=[];
  try{
   for(let index=0;index<input.length;index++){
    tick();const reading=input[index];
    if(!reading||Array.isArray(reading)||typeof reading!=='object'||Object.keys(reading).length!==5||!['verb','valency','mood','context','provenance'].every(k=>Object.hasOwn(reading,k))||!['verb','valency','mood'].every(k=>typeof reading[k]==='string'&&reading[k])){failures.push({index,reason:'invalid-reading'});continue;}
    let matched=false;for(const plan of snapshot.plans){tick();if(plan.verb!==reading.verb||plan.valency!==reading.valency)continue;matched=true;jobs.push({template:plan.id,context:reading.context});origins.push({index,licence:plan.id,mood:reading.mood,provenance:reading.provenance});}
    if(!matched)failures.push({index,reason:'unlicensed-reading'});
   }
   const templates=Object.fromEntries(snapshot.plans.map(plan=>{tick();return [plan.id,plan.template];}));
   const result=api.projectTemplates(jobs,{templates,budget:projectionBudget});
   for(const failure of result.failures){tick();const origin=origins[failure.index];failures.push({...failure,...(origin?{index:origin.index,licence:origin.licence}:{})});}
   const candidates=result.candidates.map(candidate=>{tick();return {...origins[candidate.index],value:candidate.value,status:'roles-projected',requestReady:false};});
   const detached=safeCopy(candidates,budget);if(detached.truncated)fail('budget');if(detached.failures.length)fail('invalid-projection');
   if(snapshot.world!==world||snapshot.stamp!==world.stamp)fail('source-changed-during-projection');
   return {candidates:detached.candidates[0].value,failures,...(result.truncated?{truncated:true}:{})};
  }catch(error){return empty(error?.binding?error.reason:'invalid-projection');}
 };
 return {compile,project};
}
