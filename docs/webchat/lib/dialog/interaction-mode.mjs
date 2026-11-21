// SPDX-License-Identifier: AGPL-3.0-only
// The answer mode as a declared standing preference (owner, 2026-11-21). interaction.mode is a w.preferences key
// (worlds/app.project/interaction-preferences.sop: its default and the phrases that state a value); what each mode lets a
// turn try is declared in interpretation-policy.sop (app.interpret.mode). The stated values are w.preferences.preference
// instance facts kept in the session state (APP_PREFERENCES), validated by the w.preferences schema; the latest one is in
// force, otherwise the declared default. The chat toggle and a message ("think harder", "be quick") state it the same way.
// Nothing here names a mode, a limit or a phrase.
import {World,parse,serialize,quote,str} from '../vendor/sopworld/sopworld.mjs?v=d86f897e0e';
import {BUNDLED_AREAS} from '../knowledge/bundled-areas.mjs?v=62a24b2870';
import PREFERENCES from '../../worlds/app.project/interaction-preferences-source.mjs?v=875aec0e2a';
import {interpretationPolicy} from './interpretation-policy.mjs?v=544d36d194';

export const APP_PREFERENCES='app.preferences';
export const MODE_KEY='interaction.mode';
const schemaText=()=>Object.values(BUNDLED_AREAS).map(files=>files['w.preferences/schema.sop']).find(Boolean);
let declared=null;
function declaredWorld(){
 if(declared)return declared;
 const schema=schemaText();
 if(!schema)throw Error('w.preferences schema unavailable');
 const world=new World({library:{'w.preferences':schema}});
 const told=world.tell(PREFERENCES);
 if(!told.ok)throw Error('invalid-interaction-preferences: '+JSON.stringify(told.violations??[]).slice(0,300));
 return declared=world;
}
const one=(row,key)=>{const v=row.attrs[key]?.[0];return v===undefined?undefined:v.startsWith('"')?str(v):v;};
const values=key=>Object.keys(key===MODE_KEY?interpretationPolicy().modes:{});
/** The declared default of a preference key (w.preferences.default field=value). */
export function preferenceDefault(key){return declaredWorld().ofType('w.preferences.default').filter(row=>one(row,'key')===key).map(row=>one(row,'value'))[0]??null;}
function stated(session,key){
 const sop=session?.isession?.state?.[APP_PREFERENCES]?.sop??'';
 return parse(sop).filter(w=>w.type==='w.preferences.preference'&&one(w,'key')===key).sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at')));
}
/** The value in force: the latest stated one, otherwise the declared default. */
export function preferenceValue(session,key){const rows=stated(session,key);return rows.length?one(rows.at(-1),'value'):preferenceDefault(key);}
/** State a value (source stated, scope app): validated by the schema and by the values the policy declares. */
export function statePreference(session,key,value,{about}={}){
 if(!values(key).includes(value))throw Error('undeclared-preference-value');
 if(preferenceValue(session,key)===value&&stated(session,key).length)return false;
 const state=session.isession.state,sop=state[APP_PREFERENCES]?.sop??'',rows=parse(sop);
 const at=1+Math.max(0,...rows.filter(w=>w.type==='w.preferences.preference').map(w=>Number(one(w,'at'))||0));
 // One value per field: the earlier statement of this key goes.
 const kept=rows.filter(w=>!(w.type==='w.preferences.preference'&&one(w,'key')===key));
 const wire={id:'app.pref.'+at,type:'w.preferences.preference',attrs:{key:[key],field:['value'],value:[value],scope:['app'],source:['stated'],at:[String(at)],...(about?{about:[quote(about)]}:{})},pattern:false};
 const next=serialize([...kept,wire]);
 const check=declaredWorld().fork().tell(next,{factsOnly:true});
 if(!check.ok)throw Error('invalid-preference-statement');
 state[APP_PREFERENCES]={sop:next};
 return true;
}
export const interactionMode=session=>preferenceValue(session,MODE_KEY);
/** What the mode in force allows a turn to try (app.interpret.mode). */
export function modeLimits(session){const {modes}=interpretationPolicy();return modes[interactionMode(session)]??modes[preferenceDefault(MODE_KEY)];}
const words=text=>[...String(text).toLowerCase().matchAll(/[\p{L}\p{N}']+/gu)].map(m=>({w:m[0],start:m.index,end:m.index+m[0].length}));
/**
 * The preference a message states with a declared phrase (app.pref.say, as whole words), or null: the key, the value,
 * the declared reply and the rest of the message with the phrase taken out (empty when the phrase was all of it).
 */
export function readPreferenceStatement(text){
 const said=words(text);
 for(const row of declaredWorld().ofType('app.pref.say')){
  for(const phrase of (row.attrs.text??[]).map(str)){
   const parts=words(phrase).map(p=>p.w);
   for(let i=0;i+parts.length<=said.length;i++){
    if(!parts.every((p,j)=>said[i+j].w===p))continue;
    const from=said[i].start,to=said[i+parts.length-1].end;
    const rest=(text.slice(0,from)+' '+text.slice(to)).replace(/^[\s,;.!-]+|[\s,;.!-]+$/g,'').replace(/^(and|then|but|please)\b\s*/i,'').trim();
    return {key:one(row,'key'),value:one(row,'value'),reply:one(row,'reply'),phrase,rest:words(rest).length?rest:''};
   }
  }
 }
 return null;
}
