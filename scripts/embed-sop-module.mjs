// Transport an authored SOP source through a synchronous ES-module boundary.
import{readFile,writeFile}from'node:fs/promises';
const [source,target]=process.argv.slice(2);if(!source||!target)throw Error('Usage: node scripts/embed-sop-module.mjs <source.sop> <target.mjs>');
const text=await readFile(source,'utf8');await writeFile(target,'// Generated SOP transport; authored source: '+source+'\nexport default '+JSON.stringify(text)+';\n');
