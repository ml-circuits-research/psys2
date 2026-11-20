// Operational application registry: tab-to-domain resolution reads declared SOP facts.
import{World,quote,str,serialize}from'../vendor/sopworld/sopworld.mjs?v=d7baa85342';
import schema from'../../worlds/app.project/schema-source.mjs?v=1e120a8446';
import{inspectSchemaSource}from'./worlds-inspection.mjs?v=b96ea3ce3b';
const factId=value=>'project.u'+Array.from(new TextEncoder().encode(value),byte=>byte.toString(16).padStart(2,'0')).join('');
export function createProjectWorld({areas=[],instances=[]}={}){
 const world=new World(),instanceByWorld=new Map(instances.map(record=>[record.world,record])),lines=[],domains=[];
 for(const area of areas){
  if(!area||typeof area.world!=='string'||typeof area.view!=='string'||typeof area.label!=='string')throw Error('Invalid project domain declaration.');
  const id=factId(area.world),instance=instanceByWorld.get(area.world);domains.push('$'+id);
  const fields=[`world=${quote(area.world)}`,`tab=${quote(area.view)}`,`label=${quote(area.label)}`];
  if(area.schemaWorld)fields.push(`schema=${quote(area.schemaWorld)}`);
  if(instance){const child=id+'.instance';fields.push('instance=$'+child);lines.push(`@${child} app.project.instance id=${quote(instance.instanceId)} world=${quote(instance.world)} revision=${instance.revision}`);}
  lines.push(`@${id} app.project.domain ${fields.join(' ')}`);
 }
 lines.push('@project app.project '+domains.map(ref=>'domain='+ref).join(' '));
 if(!world.load(schema).ok||!world.load(lines.join('\n')).ok)throw Error('Invalid application project world.');return world;
}
export function projectDomainForTab(world,tab){
 const rows=world.ofType('app.project.domain').filter(wire=>str(wire.attrs.tab?.[0])===tab);
 if(rows.length!==1)return null;const wire=rows[0];return {world:str(wire.attrs.world[0]),view:str(wire.attrs.tab[0]),label:str(wire.attrs.label[0]),schemaWorld:wire.attrs.schema?str(wire.attrs.schema[0]):null};
}
export function inspectProjectWorld(world){
 const nodes=[{id:'project:application',label:'Main World',kind:'instance',role:'World instance',implementation:'Operational SOP Lang World',help:{purpose:'Connect the editor domains and their current instances through validated SOP facts.',inputs:['Declared tab-to-world bindings','Current instance identities and revisions'],outputs:['Tab-to-domain resolution used by the runtime','References to the five editor Worlds'],limits:['This is an instance of the Main schema. It does not perform drawing, scheduling or language recognition itself.']},description:'The actual project registry used to resolve an editor tab to its domain World. It links declared domains and current instance identities. This registry does not turn legacy native adapter state into SOP authority.',wires:serialize([...world.wires.values()]),details:{role:'Operational domain registry',source:'src/dialog/project-world.mjs'}},{id:'project:schema',label:'Main schema',kind:'schema',implementation:'SOP Lang',description:'The actual schema used to validate the central project World.',wires:schema,schemaView:inspectSchemaSource(schema)}],edges=[{from:'project:application',to:'project:schema',label:'validated by'}];
 for(const wire of world.ofType('app.project.domain')){const id=str(wire.attrs.world[0]);edges.push({from:'project:application',to:'world:'+id,label:'declares domain'});if(wire.attrs.instance)edges.push({from:'project:application',to:'instance:'+id,label:'links current instance'});}
 return {nodes,edges};
}
