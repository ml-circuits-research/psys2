import {World} from '../vendor/sopworld/sopworld.mjs?v=b7d50d9480';
import POLICY from '../../worlds/app.project/history-policy-source.mjs?v=b9a7fb7d99';

import SCHEMA from '../../worlds/app.project/history-schema-source.mjs?v=d580532276';

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
