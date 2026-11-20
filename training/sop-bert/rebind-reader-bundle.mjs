// Opaque-byte repackaging: the same exported reader with regenerated structural bindings. No model export,
// execution or deployment activation. The models, configs and proofs are kept byte for byte; only bindings.json
// and its manifest descriptor change, so the bundle gets a new manifest hash (its directory name).
// usage: node training/sop-bert/rebind-reader-bundle.mjs BUNDLE_DIR BINDINGS.json OUT_PARENT
import {readFile,writeFile,mkdir,link,chmod,readdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyReaderBundle} from './package-reader-browser.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const [bundle,bindingsPath,parent]=process.argv.slice(2);
if(!bundle||!bindingsPath||!parent)throw Error('usage: rebind-reader-bundle.mjs BUNDLE_DIR BINDINGS.json OUT_PARENT');
const source=path.resolve(bundle),manifestBytes=await readFile(path.join(source,'manifest.json'));
await verifyReaderBundle(source,sha(manifestBytes));
const manifest=JSON.parse(manifestBytes),bindings=await readFile(bindingsPath);
if(JSON.parse(bindings).format!=='sop.structural-bindings/1')throw Error('unsupported-bindings-format');
const descriptor=manifest.files.bindings;
manifest.files.bindings={...descriptor,sha256:sha(bindings),bytes:bindings.length};manifest.bindingsSha256=sha(bindings);
const body=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),digest=sha(body),staging=path.join(path.resolve(parent),'staging-'+digest.slice(0,12)),final=path.join(path.resolve(parent),digest);
await mkdir(staging,{recursive:true});
for(const name of await readdir(source)){if(name==='manifest.json'||name===descriptor.path)continue;await link(path.join(source,name),path.join(staging,name));}
await writeFile(path.join(staging,descriptor.path),bindings);await writeFile(path.join(staging,'manifest.json'),body);
for(const name of [descriptor.path,'manifest.json'])await chmod(path.join(staging,name),0o444);
await verifyReaderBundle(staging,digest).catch(async error=>{await rm(staging,{recursive:true});throw error;});
await rename(staging,final);
console.log(JSON.stringify({bundle:final,manifestSha256:digest,bindingsSha256:manifest.bindingsSha256,bindingsBytes:bindings.length,from:sha(manifestBytes)}));
