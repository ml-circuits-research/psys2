// SPDX-License-Identifier: AGPL-3.0-only
// Declared reply sentences (worlds/app.project/reply-sentences.sop, schema app.reply): the routing and execution code
// says a sentence by its id and fills its slots from the turn's evidence; the English words live in the SOP rows and
// the language world (articles and plurals from w.lang.en). Browser-safe: no `node:*`.
import * as SOPWORLD from '../vendor/sopworld/sopworld.mjs';
import SCHEMA from '../../worlds/app.project/reply-schema-source.mjs';
import SENTENCES from '../../worlds/app.project/reply-sentences-source.mjs';
import {languageWorld} from './compose-world.mjs';
import {en} from '../lang/en.mjs';

const {World,str}=SOPWORLD;
let loaded=null;
/** { id: text }, validated against the schema; a malformed or duplicate row throws (no silent default). */
export function replySentences(source=SENTENCES){
 if(source===SENTENCES&&loaded)return loaded;
 const world=new World({library:{'app.reply':SCHEMA}}),told=world.tell(source);
 if(!told.ok)throw Error('invalid-reply-sentences: '+JSON.stringify(told.violations??told.errors??[]).slice(0,400));
 const out={};
 for(const row of world.ofType('app.reply.sentence')){
  const id=str(row.attrs.id[0]);
  if(Object.hasOwn(out,id))throw Error('invalid-reply-sentences: duplicate '+id);
  out[id]=str(row.attrs.text[0]);
 }
 if(source===SENTENCES)loaded=Object.freeze(out);
 return Object.freeze(out);
}
/** A noun after its indefinite article, by the language world's determiners and onsets. */
export const withArticle=noun=>(SOPWORLD.articleFor(languageWorld(SOPWORLD),String(noun))??'a')+' '+noun;
/** A counted noun phrase: "a cat" for one, "3 cats" for more (plural from w.lang.en). */
export const counted=(noun,count)=>count===1?withArticle(noun):count+' '+en.plural(String(noun));
/** Each item quoted, separated by commas. */
export const quotedList=items=>[...items].map(item=>JSON.stringify(item)).join(', ');
/** The sentence `id` with its slots filled; an undeclared id throws. */
export function say(id,values={}){
 const text=replySentences()[id];
 if(text===undefined)throw Error('undeclared-reply-sentence: '+id);
 return text.replace(/\{(a |n )?(\w+)\}/g,(all,mode,name)=>{
  if(!Object.hasOwn(values,name)||values[name]===undefined||values[name]===null)return '';
  const value=String(values[name]);
  return mode==='a '?withArticle(value):mode==='n '?counted(value,Number(values['count_'+name]??1)):value;
 });
}
/** Phrases joined by the declared conjunction (join.and). */
export const andList=items=>[...items].reduce((left,right)=>left===undefined?right:say('join.and',{left,right}),undefined)??'';
