// Exact declared-value proofs; no language rules or domain vocabulary.
import {numberValue} from '../knowledge/values.mjs?v=75ef016e50';
import {cardinalValue} from '../knowledge/number-run.mjs?v=b83c9698e8';
import {readNumberSpan} from '../vendor/sopworld/sopworld.mjs?v=9c4b6331ca';
import {interpretationPolicy} from './interpretation-policy.mjs?v=79c1776d10';
import {budget} from './budget.mjs?v=00bce6e369';
import {selectedProbability} from './model-selection-score.mjs?v=ac3ac10191';
export function classifierAlternative(bank,logits){
 if(!Array.isArray(bank)||!Array.isArray(logits)||logits.length!==bank.length||!logits.length||logits.some(v=>typeof v!=='number'||!Number.isFinite(v)))return {index:null,state:'invalid',probability:null};
 const max=Math.max(...logits),indices=logits.flatMap((v,i)=>v===max?[i]:[]);
 if(indices.length!==1)return {index:null,state:'ambiguous',probability:null};
 const index=indices[0],entry=bank[index];return {index,state:entry.state,...(Object.hasOwn(entry,'value')?{value:entry.value}:{}),probability:selectedProbability(logits,index)};
}
export function canonicalLiteralProof(bank,literal,logits,tick=()=>{}){
 if(typeof literal!=='string'||!Array.isArray(bank))return null;
 const matches=[];for(let i=0;i<bank.length;i++){tick();const e=bank[i];if(e?.state==='value'&&typeof e.value==='string'&&e.value===literal)matches.push(i);}
 if(matches.length!==1)return null;
 const alternative=classifierAlternative(bank,logits);return {kind:'declared-canonical-string',value:literal,bankIndex:matches[0],classifier:alternative,disagrees:alternative.state!=='value'||alternative.value!==literal};
}
export function positiveIntegerLiteralProof(literal){
 if(typeof literal!=='string'||!/^[0-9]+$/.test(literal))return null;
 const value=Number(literal);return Number.isSafeInteger(value)&&value>0?{kind:'positive-safe-integer',value,literal}:null;
}

/** Read only an already anchored cardinal span. Words come from k.values. */
export function positiveCardinalProof(literal){
 const digits=positiveIntegerLiteralProof(literal);
 if(digits)return digits;
 if(typeof literal!=='string'||!literal)return null;
 const value=numberValue(literal,'cardinal');
 return Number.isSafeInteger(value)&&value>0?{kind:'declared-cardinal-number',value,literal,world:'k.values'}:null;
}

/**
 * The one number a value span spells for a numeric property ("size 45" -> 45, "two hundred sixty" -> 260, "2 cm"):
 * sopworld readNumberSpan over the declared number words (k.values) and number joiners (app.interpret.numberJoiner);
 * unit(word): null for no unit, true for a unit that cannot be converted, {factor} for one that can. Null otherwise.
 */
export function spelledNumberProof(literal,unit=()=>null){
 const read=readNumberSpan(literal,{number:cardinalValue,joiners:interpretationPolicy().partial.numberJoiners,unit:w=>unit(w)||null,tick:()=>budget.tick('value-proof.spelled')});
 return read?{kind:'spelled-number',value:read.value,literal,...(read.factor?{factor:read.factor}:{})}:null;
}
