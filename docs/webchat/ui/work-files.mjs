// Explicit portable work files. No startup restore, migration, or browser persistence.
export const WORK_FILE_FORMAT='psys2.work-file/1';
function recordsOf(records){
 if(!Array.isArray(records)||records.some(r=>!r||typeof r.world!=='string'||typeof r.instanceId!=='string'||typeof r.wires!=='string'||!(Number.isSafeInteger(r.revision)&&r.revision>=0)))throw Error('Invalid saved world records.');
 if(new Set(records.map(r=>r.world)).size!==records.length)throw Error('Duplicate saved world.');
 return structuredClone(records);
}
export function workFile(version,records){if(typeof version!=='string'||!version)throw Error('Application version is unavailable.');return {format:WORK_FILE_FORMAT,version,records:recordsOf(records)};}
export function readWorkFile(text,version){
 const file=JSON.parse(text);
 if(file?.format!==WORK_FILE_FORMAT)throw Error('Unrecognized work file format. No conversion was attempted.');
 if(file.version!==version)throw Error(`This work file belongs to application version ${String(file.version)}; this version is ${version}. No conversion was attempted.`);
 return recordsOf(file.records);
}
