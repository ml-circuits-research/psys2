// SPDX-License-Identifier: AGPL-3.0-only
// Declared values of the editor tabs' own controls (worlds/app.project/ui-defaults.sop): a new item's starting value,
// keyboard steps, minimum sizes, the frame before the area reports one. The page hands them to a tab as host.ui(view);
// the tab holds no such number of its own. Browser-safe: no `node:*`.
import {World,str} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import SCHEMA from '../../worlds/app.project/ui-defaults-schema-source.mjs?v=e3824eb9c4';
import VALUES from '../../worlds/app.project/ui-defaults-source.mjs?v=f6c4b29bad';

let values=null;
const one=(row,key)=>row.attrs[key]?.length===1?row.attrs[key][0]:undefined;

/** { view: { name: number | text } }, validated against the schema; a malformed or duplicate row throws (no silent default). */
export function uiDefaults(source=VALUES){
 if(source===VALUES&&values)return values;
 const world=new World({library:{'app.ui':SCHEMA}}),told=world.tell(source);
 if(!told.ok)throw Error('invalid-ui-defaults: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 const out={};
 for(const row of world.ofType('app.ui.value')){
  const view=str(one(row,'view')),name=str(one(row,'name')),number=one(row,'number'),text=one(row,'text');
  if((number===undefined)===(text===undefined))throw Error('invalid-ui-defaults: '+row.id+' needs exactly one of number and text');
  out[view]??={};
  if(Object.hasOwn(out[view],name))throw Error('invalid-ui-defaults: duplicate '+view+'.'+name);
  out[view][name]=number!==undefined?Number(str(number)):str(text);
 }
 const result=Object.freeze(Object.fromEntries(Object.entries(out).map(([view,v])=>[view,Object.freeze(v)])));
 if(source===VALUES)values=result;
 return result;
}
/** The declared values of one tab (an empty object for a tab that declares none). */
export const uiValues=view=>uiDefaults()[view]??Object.freeze({});
