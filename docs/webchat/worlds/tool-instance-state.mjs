// SPDX-License-Identifier: AGPL-3.0-only
// Builds private transport from the exact authored SOP loaded by this tool.
import {World,parse,quote,serialize} from '../lib/vendor/sopworld/sopworld.mjs?v=dde6e85489';
import {instanceFactCodec} from '../lib/vendor/sopworld/instance-fact-codec.mjs?v=7a1e2aa77f';

export function toolInstanceStateCodec(schema,root) {
 const world=new World();
 world.load(schema);
 return instanceFactCodec(world,root,{parse,quote,serialize});
}
