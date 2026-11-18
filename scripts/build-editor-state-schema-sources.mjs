// SPDX-License-Identifier: AGPL-3.0-only
// Copy authored editor schemas to browser transport modules byte for byte.
import {readFileSync,writeFileSync} from 'node:fs';

for(const [world,file] of [['art.draw','instance-schema.sop'],['docs.editor','state-schema.sop']]){
 const dir=new URL('../worlds/'+world+'/',import.meta.url);
 const source=readFileSync(new URL(file,dir),'utf8');
 const transport='// Authored SOP source: '+file+'.\nexport default '+JSON.stringify(source)+';\n';
 const output=new URL('state-schema-source.mjs',dir);
 if(process.argv.includes('--check')){
  if(readFileSync(output,'utf8')!==transport)throw Error('Stale authored editor schema transport: '+world);
 }else writeFileSync(output,transport);
}
