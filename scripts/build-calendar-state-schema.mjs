// Transport the sole authored SOP schema into browser-safe modules.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../worlds/time.calendar/',import.meta.url),source=await readFile(new URL('instance-schema.sop',root),'utf8');
await writeFile(new URL('schema-source.mjs',root),'// Generated from instance-schema.sop by node scripts/build-calendar-state-schema.mjs.\nexport default '+JSON.stringify(source)+';\n');
