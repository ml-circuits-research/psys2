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

/** What a typed UI gesture of `act` does to the journal (app.history.gesture): { record, placement }. */
export function gesturePolicy(act){
 const row=historyPolicy().ofType('app.history.gesture').find(w=>w.attrs.act?.[0]===act);
 return {record:row?.attrs.record?.[0]!=='no',placement:row?.attrs.placement?.[0]==='yes'};
}

