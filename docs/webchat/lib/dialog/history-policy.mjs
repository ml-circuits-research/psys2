import {World} from '../vendor/sopworld/sopworld.mjs?v=a37e1846b3';
import POLICY from '../../worlds/app.project/history-policy-source.mjs?v=4a3ac642e0';

import SCHEMA from '../../worlds/app.project/history-schema-source.mjs?v=ab0c2e3e60';

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
