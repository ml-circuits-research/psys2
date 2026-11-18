import {World} from '../vendor/sopworld/sopworld.mjs';
import POLICY from '../../worlds/app.project/history-policy-source.mjs';

import SCHEMA from '../../worlds/app.project/history-schema-source.mjs';

let policy;
export function historyPolicy(){
 if(!policy){
  const world=new World({library:{'app.history':SCHEMA}});
  world.load(POLICY);
  policy=world;
 }
 return policy;
}

export function inspectHistoryPolicy(){return {source:POLICY,schema:SCHEMA,loaded:!!policy};}
