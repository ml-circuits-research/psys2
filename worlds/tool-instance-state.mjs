// SPDX-License-Identifier: AGPL-3.0-only
// Builds private transport from the exact authored SOP loaded by this tool.
import {World,parse,quote,serialize} from '../src/vendor/sopworld/sopworld.mjs';
import {instanceFactCodec} from '../src/vendor/sopworld/instance-fact-codec.mjs';

export function toolInstanceStateCodec(schema,root) {
 const world=new World();
 world.load(schema);
 return instanceFactCodec(world,root,{parse,quote,serialize});
}
